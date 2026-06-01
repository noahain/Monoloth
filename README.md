# Monoloth

Desktop launcher for TUI coding agents. Pick a project folder, launch your preferred TUI agent (OpenCode, Claude Code, Qwen, Kimi, Codex, Pi, Gemini, or any custom command), and code.

Windows-only. Built with Rust + Tauri 2, vanilla HTML/CSS/JS frontend with xterm.js terminal.

## Quick Start

### Prerequisites

- Rust toolchain (`rustup` + `cargo`)
- Node.js (for npm global TUI agents)
- Windows 10/11

### Development

```bash
cargo tauri dev
```

### Release Build

```bash
cargo tauri build
```

Output: `src-tauri/target/release/bundle/`

## Features

- **TUI Agent Presets** — OpenCode, Claude, Qwen, Kimi, Codex, Pi, Gemini, or any custom command
- **Custom File Picker** — Windows-style file/folder browser with previews, or native Windows dialogs
- **Profiles** — Separate configurations for different workflows
- **Appearance** — Background images, colors, gradients, theme mode, button styles
- **Secondary Commands** — Run commands before or parallel to the main TUI
- **Keyboard Shortcuts** — Customizable `Ctrl+P` (command palette) and `Ctrl+,` (settings)
- **Window State** — Remembers size and position across restarts

## Architecture

| Layer | Tech |
|---|---|
| Backend | Rust + Tauri 2 |
| Terminal | `portable_pty` + xterm.js (DOM renderer) |
| Frontend | Vanilla HTML/CSS/JS |
| Config | `%APPDATA%\Monoloth\config.json` |
| Dialogs | `rfd` (native file picker) |

See `AGENTS.md` for detailed architecture, config keys, and development notes.

## Legacy

The original Python/pywebview implementation is archived in `legacy/python/` for reference.
