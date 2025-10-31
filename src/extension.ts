import * as vscode from 'vscode';
import { RustFormatter, FormatterConfig } from './formatter';

let formatter: RustFormatter;

export function activate(context: vscode.ExtensionContext) {
    console.log('[rust-fmt] Extension activated');

    const config = getFormatterConfig();
    console.log(`[rust-fmt] Config: rustfmtPath=${config.rustfmtPath}, extraArgs=${JSON.stringify(config.extraArgs)}`);
    formatter = new RustFormatter(config);

    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('rust', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
            return formatDocument(document);
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

    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('rustfmt')) {
            const newConfig = getFormatterConfig();
            formatter.updateConfig(newConfig);
        }
    });

    context.subscriptions.push(formattingProvider, formatCommand, configListener);
}

async function formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    console.log(`[rust-fmt] Formatting document: ${document.uri.fsPath}`);
    
    const formattedText = await formatter.format(document);
    
    if (formattedText === null || formattedText.trim() === '') {
        console.log('[rust-fmt] No formatted text returned');
        return [];
    }

    const originalText = document.getText();
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

export function deactivate() {}
