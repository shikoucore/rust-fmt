import * as cp from 'child_process';
import * as vscode from 'vscode';

export interface FormatterConfig {
    rustfmtPath: string;
    extraArgs: string[];
}

export class RustFormatter {
    private config: FormatterConfig;

    constructor(config: FormatterConfig) {
        this.config = config;
    }

    public async format(document: vscode.TextDocument): Promise<string | null> {
        const text = document.getText();
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
        
        return this.formatWithRustfmt(text, workspaceFolder);
    }

    private async formatWithRustfmt(text: string, cwd: string | undefined): Promise<string | null> {
        console.log(`[rust-fmt] Formatting with rustfmt at: ${this.config.rustfmtPath}`);
        
        return new Promise((resolve) => {
            const args = ['--emit', 'stdout', ...this.config.extraArgs];
            console.log(`[rust-fmt] Running: ${this.config.rustfmtPath} ${args.join(' ')}`);
            
            const rustfmt = cp.spawn(this.config.rustfmtPath, args, {
                cwd: cwd,
                shell: false
            });

            let stdout = '';
            let stderr = '';

            rustfmt.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            rustfmt.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            rustfmt.on('error', (err) => {
                console.error('[rust-fmt] Error:', err);
                vscode.window.showErrorMessage(`Failed to run rustfmt: ${err.message}`);
                resolve(null);
            });

            rustfmt.on('close', (code) => {
                console.log(`[rust-fmt] Process exited with code: ${code}`);
                if (stderr) {
                    console.log(`[rust-fmt] stderr: ${stderr}`);
                }
                
                if (code === 0) {
                    if (!stdout || stdout.trim() === '') {
                        console.log('[rust-fmt] Warning: empty output from rustfmt');
                        resolve(null);
                    } else {
                        console.log(`[rust-fmt] Successfully formatted, output length: ${stdout.length}`);
                        resolve(stdout);
                    }
                } else {
                    vscode.window.showErrorMessage(`rustfmt exited with code ${code}: ${stderr}`);
                    resolve(null);
                }
            });

            rustfmt.stdin.write(text);
            rustfmt.stdin.end();
        });
    }

    public updateConfig(config: FormatterConfig): void {
        this.config = config;
    }
}
