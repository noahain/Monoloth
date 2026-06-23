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
cargo check                    # fast typecheck
cargo tauri dev                # run with hot reload
cargo tauri build              # release build
```

Run the tests from `src-tauri/`:

```bash
cargo test                     # all Rust tests
node --test ../frontend/*.test.cjs   # all frontend tests
```

There is no Node build step. The frontend assets in `frontend/` are served
directly.

## Project layout

The Rust backend lives in `src-tauri/` and the vanilla-JS frontend in
`frontend/`. For how the pieces fit together, read
[ARCHITECTURE.md](ARCHITECTURE.md).

## Code style

- Match the surrounding style. The frontend is vanilla JavaScript with no
  bundler — do not introduce a build tool or framework.
- Run the tests before opening a PR: `cargo test` and
  `node --test frontend/*.test.cjs`.

## Reporting bugs and requesting features

Open an issue. The
[bug report](.github/ISSUE_TEMPLATE/bug_report.yml) and
[feature request](.github/ISSUE_TEMPLATE/feature_request.yml) templates ask for
the details that save a round-trip, like your Monoloth version, OS, and which
CLI agent you run.

## Pull requests

- Branch from `beta` with a descriptive name (`fix/pty-leak`,
  `feat/split-pane`). The `beta` branch is the active development branch;
  `main` tracks released versions.
- Keep each PR focused on one change.
- Write a clear description of what changed and how you tested it.
- Make sure the test suites pass.

Reviews check correctness, that the change stays scoped, cross-platform
behavior where relevant, and that tests cover new logic.
