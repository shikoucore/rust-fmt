# Contributing

Thanks for your interest in contributing to rust-fmt. This guide explains how to set up the project and submit changes.

## Requirements

- Node.js and npm
- VS Code
- Rust toolchain with `rustfmt` (optional for extension development, required to test formatting)

## Setup

```bash
npm install
```

## Build

```bash
npm run compile
```

## Run the Extension (Dev Host)

1) Open the repo in VS Code.
2) Press `F5` (Run Extension).
3) In the Extension Development Host, open a Rust file and format it.

## Lint

```bash
npm run lint
```

## Tests

There are no automated tests yet. If you add tests, document how to run them here.

## Versioning and Changelog

If your change affects behavior or user-facing features:
- Bump the version in `package.json`.
- Add an entry to `CHANGELOG.md`.

## Pull Requests

- Keep changes focused and small.
- Update documentation when behavior changes.
- Describe how to verify your change.
