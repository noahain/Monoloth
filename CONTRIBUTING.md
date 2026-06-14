# Contributing to Monoloth

Thanks for your interest in Monoloth. This guide covers what you need to build,
run, and submit changes.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.77.2 or newer
- [C++ Build Tools](https://learn.microsoft.com/en-us/cpp/build/vscpp-step-0-installation)
  (Windows)
- [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
  (preinstalled on Windows 11; the installer fetches it on Windows 10)
- [Tauri CLI](https://tauri.app/start/): `cargo install tauri-cli`

Linux and macOS builds work too. For Linux you also need the webkit2gtk
development packages (see the dependency list in
`.github/workflows/release.yml`).

## Build and run

```bash
cd src-tauri
cargo check        # fast type check
cargo tauri dev    # run with hot reload
cargo tauri build  # release build
```

There is no Node build step. The frontend assets in `frontend/` are served
directly.

## Project layout

The Rust backend lives in `src-tauri/` and the vanilla-JS frontend in
`frontend/`. For how the pieces fit together, read
[ARCHITECTURE.md](ARCHITECTURE.md).

## Code style

- Run `cargo fmt` and `cargo clippy` before opening a PR.
- The frontend is vanilla JavaScript with no bundler. Match the surrounding
  style; do not introduce a build tool or framework.
- Run the tests: `cargo test` (backend) and the Node test files
  (`node --test frontend/*.test.cjs`).

## Reporting bugs and requesting features

Open an issue. The
[bug report](.github/ISSUE_TEMPLATE/bug_report.yml) and
[feature request](.github/ISSUE_TEMPLATE/feature_request.yml) templates ask for
the details that save a round-trip, like your Monoloth version, OS, and which
CLI agent you run.

## Pull requests

- Branch from `main` with a descriptive name (`fix/pty-leak`,
  `feat/split-pane`).
- Keep each PR focused on one change.
- Write a clear description of what changed and how you tested it.
- Make sure `cargo fmt`, `cargo clippy`, and the test suites pass.

Reviews check correctness, that the change stays scoped, cross-platform
behavior where relevant, and that tests cover new logic.
