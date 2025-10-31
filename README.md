# rust fmt

Simple VS Code extension for formatting Rust code using `rustfmt`.

## Requirements

You need `rustfmt` installed. Install it via:

```bash
rustup component add rustfmt
```

Verify installation:

```bash
rustfmt --version
rustc --version
rustup --version
```

Works on **Linux, Windows, and macOS**.

## VS Code Settings

Add to your `settings.json` for automatic formatting:

```json
"editor.formatOnSave": true,
"[rust]": {
    "editor.defaultFormatter": "rust-fmt.rust-fmt"
}
```

## Extension Settings

- `rustfmt.path`: Path to rustfmt executable (default: `"rustfmt"`)
- `rustfmt.extraArgs`: Additional arguments for rustfmt (default: `[]`)

## Usage

**Automatic:** Save any `.rs` file (if `formatOnSave` is enabled)

**Manual:**
- Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → "Format Document with rustfmt"
- Right-click → "Format Document"
- Shortcut: `Shift+Alt+F` (Windows/Linux) or `Shift+Option+F` (Mac)

## How it works

The extension runs `rustfmt --emit stdout` on your code and applies the formatted result. It automatically finds and respects `rustfmt.toml` configuration in your project, or uses Rust standard formatting rules if no config exists.