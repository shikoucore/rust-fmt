import * as path from 'path';
import * as vscode from 'vscode';
import { RustFormatter, FormatterConfig, RustfmtContext } from './formatter';

let formatter: RustFormatter;
const activeFormats = new Map<string, { tokenSource: vscode.CancellationTokenSource; promise: Promise<vscode.TextEdit[]> }>();
const MAX_FILE_SIZE_MB = 2;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('[rust-fmt] Extension activated');

    const config = getFormatterConfig();
    console.log(`[rust-fmt] Config: rustfmtPath=${config.rustfmtPath}, extraArgs=${JSON.stringify(config.extraArgs)}`);
    formatter = new RustFormatter(config);

    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('rust', {
        provideDocumentFormattingEdits(
            document: vscode.TextDocument,
            _options: vscode.FormattingOptions,
            token: vscode.CancellationToken
        ): Promise<vscode.TextEdit[]> {
            return formatDocument(document, token);
        }
    });

    const formatCommand = vscode.commands.registerCommand('rust-fmt.format', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'rust') {
            vscode.window.showWarningMessage('No active Rust file to format');
            return;
        }

        const edits = await formatDocument(editor.document);
        if (edits.length > 0) {
            const edit = new vscode.WorkspaceEdit();
            edit.set(editor.document.uri, edits);
            await vscode.workspace.applyEdit(edit);
        }
    });

    const formatWorkspaceCommand = vscode.commands.registerCommand('rust-fmt.formatWorkspace', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        const include = '**/*.rs';
        const exclude = '{**/target/**,**/.git/**,**/node_modules/**,**/out/**}';
        const uris = await vscode.workspace.findFiles(include, exclude);
        if (uris.length === 0) {
            vscode.window.showInformationMessage('No Rust files found in workspace');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'rust-fmt: Formatting workspace',
                cancellable: true
            },
            async (progress, token) => {
                let formatted = 0;
                let skipped = 0;
                let failed = 0;
                let processed = 0;
                const contextCache = new Map<string, RustfmtContext>();

                for (const uri of uris) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    const label = vscode.workspace.asRelativePath(uri);
                    progress.report({ message: `${processed + 1}/${uris.length}: ${label}` });

                    try {
                        const document = await vscode.workspace.openTextDocument(uri);
                        const dirKey = path.dirname(document.uri.fsPath);
                        let resolvedContext = contextCache.get(dirKey);
                        if (!resolvedContext) {
                            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
                            resolvedContext = await formatter.resolveContext(document.uri.fsPath, workspaceFolder);
                            contextCache.set(dirKey, resolvedContext);
                        }
                        const edits = await formatDocument(document, token, resolvedContext);
                        if (edits.length > 0) {
                            const edit = new vscode.WorkspaceEdit();
                            edit.set(uri, edits);
                            const applied = await vscode.workspace.applyEdit(edit);
                            if (applied) {
                                formatted += 1;
                            } else {
                                failed += 1;
                            }
                        } else {
                            skipped += 1;
                        }
                    } catch {
                        failed += 1;
                    }

                    processed += 1;
                }

                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage(
                        `Workspace formatting canceled. Formatted: ${formatted}, skipped: ${skipped}, failed: ${failed}.`
                    );
                    return;
                }

                vscode.window.showInformationMessage(
                    `Workspace formatted. Formatted: ${formatted}, skipped: ${skipped}, failed: ${failed}.`
                );
            }
        );
    });

    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('rustfmt')) {
            const newConfig = getFormatterConfig();
            formatter.updateConfig(newConfig);
        }
    });

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = 'rust-fmt: active';
    statusBarItem.tooltip = 'rust-fmt is active. Click to format workspace.';
    statusBarItem.command = 'rust-fmt.formatWorkspace';

    const editorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        updateStatusBar(editor);
    });
    updateStatusBar(vscode.window.activeTextEditor);

    context.subscriptions.push(
        formattingProvider,
        formatCommand,
        formatWorkspaceCommand,
        configListener,
        editorListener,
        statusBarItem
    );
}

async function formatDocument(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken,
    resolvedContext?: RustfmtContext
): Promise<vscode.TextEdit[]> {
    const key = document.uri.toString();
    const existing = activeFormats.get(key);
    if (existing) {
        existing.tokenSource.cancel();
        try {
            await existing.promise;
        } catch {
            // REVIEW:Ignore errors from canceled/failed format runs.
        }
    }

    const tokenSource = new vscode.CancellationTokenSource();
    const externalCancellation = token?.onCancellationRequested(() => tokenSource.cancel());

    const promise = performFormat(document, tokenSource.token, resolvedContext).finally(() => {
        const current = activeFormats.get(key);
        if (current?.promise === promise) {
            activeFormats.delete(key);
        }
        externalCancellation?.dispose();
        tokenSource.dispose();
    });

    activeFormats.set(key, { tokenSource, promise });
    return promise;
}

async function performFormat(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    resolvedContext?: RustfmtContext
): Promise<vscode.TextEdit[]> {
    console.log(`[rust-fmt] Formatting document: ${document.uri.fsPath}`);

    if (token.isCancellationRequested) {
        return [];
    }

    const originalText = document.getText();
    const sizeBytes = Buffer.byteLength(originalText, 'utf8');
    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (sizeBytes > maxBytes) {
        const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
        vscode.window.showWarningMessage(
            `[rust-fmt] File is ${sizeMb} MB, exceeds ${MAX_FILE_SIZE_MB} MB limit. Skipping format.`
        );
        return [];
    }

    const formattedText = resolvedContext
        ? await formatter.formatWithContext(originalText, resolvedContext, token)
        : await formatter.format(document, token, originalText);

    if (token.isCancellationRequested) {
        return [];
    }

    if (formattedText === null || formattedText.trim() === '') {
        console.log('[rust-fmt] No formatted text returned');
        return [];
    }

    if (formattedText === originalText) {
        console.log('[rust-fmt] No changes needed');
        return [];
    }

    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
    );

    console.log('[rust-fmt] Applying formatting changes');
    return [vscode.TextEdit.replace(fullRange, formattedText)];
}

function getFormatterConfig(): FormatterConfig {
    const config = vscode.workspace.getConfiguration('rustfmt');

    return {
        rustfmtPath: config.get<string>('path') || 'rustfmt',
        extraArgs: config.get<string[]>('extraArgs') || []
    };
}

function updateStatusBar(editor?: vscode.TextEditor | null): void {
    if (!statusBarItem) {
        return;
    }

    if (editor?.document.languageId === 'rust') {
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

export function deactivate() { }
