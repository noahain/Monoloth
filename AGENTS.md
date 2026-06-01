# AGENTS.md — Monoloth

Desktop launcher for TUI coding agents. Windows-only Rust/Tauri 2 app with xterm.js terminal (canvas renderer).

## Commands

```
# from src-tauri/
cargo tauri dev          # Dev mode (hot-reloads frontend, rebuilds Rust)
cargo tauri build        # Release .exe + installer
cargo check              # Rust type-check
cargo test               # 12 tests in config.rs + commands.rs #[cfg(test)]

# from repo root
node --test frontend/app.renderer-policy.test.cjs   # Frontend renderer policy test
```

No CI, no lint/format scripts. No root `.gitignore` (src-tauri/ has one for `/target/` and `/gen/schemas`).

## Architecture

```
src-tauri/src/          → 6 files, 41 invoke handlers
  main.rs               → Entrypoint, calls monoloth_lib::run()
  lib.rs                → App builder, 4 Tauri plugins, window state, CloseRequested handler
  commands.rs           → All invoke handlers
  config.rs             → AppConfig (%APPDATA%\Monoloth\config.json + profiles/)
  pty.rs                → portable_pty spawn, read loop, resize, terminate
  history.rs            → Session tracking, atomic history.json, retention purge
frontend/               → No build step (beforeDevCommand/beforeBuildCommand are "")
  index.html            → Updates: bump ?v=N on changed files
  app.js                → Main UI, terminal init, writeToTerm routing
  sidebar.js            → Sidebar + CMD panel + settings
  tooltip.js            → MonolothTooltip + MonolothDropdown (loaded before app.js)
  tauri-bridge.js       → window.monolithApi (wraps Tauri invoke)
  style.css             → All styles
  lib/                  → Vendored xterm.js + fit addon (WebGL removed)
assets/                 → banner.png, icon.ico, icon.png
```

## Critical: Tauri v2 IPC Naming

**#1 bug source.** Tauri v2 auto-converts camelCase JS invoke args to snake_case Rust params.
- JS `invoke('cmd', { imagePath: '...' })` → Rust `fn cmd(image_path: String)`
- Passing snake_case from JS silently sends `None` to Rust
- Single-word params (`old`, `new`) need no conversion
- All string params in `#[tauri::command]` must be `String`, not `&str`
- Rust struct fields crossing IPC need `#[serde(rename = "camelCase")]`

## Stale Naming: `window.monolithApi`

Still named `window.monolithApi` — not `monolothApi`. Tauri commands: `window.monolithApi.<command>()`. Do not rename without updating ~150 call sites.

**Key gotchas (frontend ↔ Tauri):**
- Settings tab injected via persistent `MutationObserver` (settings dialog is destroyed+recreated on each open).

## Window Close (current)

`CloseRequested` in lib.rs saves final window state, ends the history session, and calls `pty.terminate_all()`. No JS handshake yet — config saves during the resize/move handlers are debounced to 500ms.

The upcoming tabs design (`docs/superpowers/specs/2026-06-01-monolith-tabs-design.md` §4.2) will extend this to flush `tabs_config` synchronously before destroy, but the actual handshake implementation lands when tabs ship.

## Window Close Cleanup: `pty.terminate_all()`

Called from the lib.rs `CloseRequested` handler. Drains the sessions HashMap, kills each child, drops writer + master_pty, then **drops** JoinHandles (not detach — Rust has no `JoinHandle::detach`). Dropping orphans the read thread — it exits when the PTY pipe returns EOF/error.

## Version Bumps

After any frontend change, bump `?v=N` in `index.html`. Current values (check `index.html` for truth): app.js `?v=52`, sidebar.js `?v=19`, tooltip.js `?v=3`, style.css `?v=93`, tauri-bridge.js `?v=22`, xterm.js `?v=13`, xterm-addon-fit.js `?v=14`, xterm.css `?v=12`. WebGL addon script tag removed.

## PTY Gotchas

- **Writer pattern:** `PtyManager::write()` clones `Option<Arc<Mutex<Box<dyn Write>>>>` out of sessions lock, then locks the Arc independently. `format!()` removed from `map_err` — `io::Error` already has display via `to_string()`.
- **UTF-8 + invalid bytes:** Read loop uses `from_utf8` with recovery inner loop. Invalid bytes → U+FFFD. Valid fragments accumulate into single emit buffer. Incomplete trailing multi-byte sequences carried in `leftover`.
- **Terminate ordering:** Kill child first, drop writer/master_pty, orphan read thread (do NOT `join()` — blocks forever if grandchild processes keep pipe open).
- **Session generation:** `PtyOutput` includes `generation: u64`. Each `spawn()` increments counter. Frontend filters by generation to ignore stale events.
- **EOF on errors:** Both `Ok(0)` and `Err(_)` emit `{"data": "", "eof": true, "generation": N}`. Leftover flushed before EOF. `_skipNextEof` cleared on first non-EOF output from matching generation.
- **Startup race:** `start_terminal` called inside `requestAnimationFrame` after `fitAddon.fit()` so cols/rows reflect viewport.
- **COLUMNS/LINES:** Set via `cmd.env()` on child at spawn.
- **`open_external_terminal`:** Uses `raw_arg()` from `CommandExt` — without it, Rust `.args()` quoting and cmd.exe `/C` parsing collapse the `""`.
- **Before-command timeout:** `run_before_command` spawns stdout/stderr reader threads (avoids pipe buffer deadlock), times out after 30s.

## Renderer Policy

WebGL addon **disabled** (canvas renderer only). `shouldUseWebglRenderer()` always returns `false`. The vendored `xterm-addon-webgl.js` remains in `lib/` but never loaded — script tag was removed from index.html. `onScroll` calls `term.refresh(0, term.rows - 1)` to clear scroll artifacts.

## Sidebar

Uses mouse-based drag events (not HTML5 DnD — WebView2 has unreliable `dataTransfer.getData()` in `drop`). Config via `api.set_config('sidebar_config', ...)`: `{ enabled, position, buttons, customButtons, customButtonCounter }`.

**Custom button modes:** `background` (CREATE_NO_WINDOW), `externalCmd` (cmd.exe /K via `open_external_terminal`), `cmdPanel` (writes to `'panel'` session via `write_to_pty_terminal` with `\r` — not `\n`).

## CMD Panel

Separate PTY (`sessionId: 'panel'`). `cmdPanel` secondary commands go to panel PTY stdin with `\r` (Windows shells expect carriage return to execute command line via stdin). The panel runs independently of the main terminal.

## Config

`%APPDATA%\Monoloth\config.json` (global) + `profiles/<name>.json` (per-profile). Atomic writes (`.tmp` → `fs::rename`). Same pattern for `history.json`.

Global-only keys: `active_profile`, `last_directory`, `window_width`, `window_height`, `window_maximized`, `window_x`, `window_y`, `fp_last_dir_bg_image`, `fp_last_dir_choose`, `use_custom_titlebar`, `cmdPanelHeight`, `panelShell`. (`tabs_config` will be added when the tabs design ships.)

Profile keys: `bg_type`, `bg_image`, `bg_color`, `bg_gradient`, `bg_transparency`, `bg_layer`, `shortcuts`, `theme_mode`, `cta_button_style`, `file_picker_type`, `startup_command`, `startup_command_type`, `secondary_commands`, `run_before_command`.

## Concurrency

`parking_lot::Mutex` for sessions and session_generation. `app_handle` uses `std::sync::OnceLock`. No tokio/async runtime. `PtySession.writer` uses `Arc<Mutex<...>>` for lock-independent access. `PtySession.master_pty` uses bare `Mutex<...>` (resize held within sessions lock).

## Keyboard Shortcuts

Customizable via Profiles settings tab. Defaults: `Ctrl+P` (command palette), `Ctrl+,` (settings). Stored per-profile as `shortcuts` object. Palette in `app.js` (`_commandPaletteItems`), scoped by `category` and `action`.

## Tooltip + Dropdown Module

`tooltip.js` loaded before `app.js`. `MonolothTooltip.attach(el, text)` with 500ms delay. `data-tooltip` attributes replace native `title`. `MonolothTooltip.scan(container)` wires all `[data-tooltip]` elements.

Script order: `tauri-bridge.js` → `tooltip.js` → `app.js` → `sidebar.js`.

**`openAppearanceSettings` gotcha:** Must call `showSettings()` before `switchTab('appearance')`.

## Platform

Windows only. MSRV: 1.77.2. TUI presets wrapped in `cmd /C` (Node tools install as `.cmd`). Custom commands use `shlex::split()`. Custom base64 encoder in `commands.rs` (no base64 crate). `rfd` for dialogs, `winapi` for drive enumeration. Window `backgroundColor: "#0a0a0a"`. WebView install uses `embedBootstrapper`. Repo-local opencode config in `configs/opencode.json`.

## Profile Validation (commands.rs)

`validate_profile_name()` — char-based (no regex), checks COM1-COM9/LPT1-LPT9 reserved names, Windows device names (CON/PRN/AUX/NUL), leading/trailing spaces. `validate_session_id()` — alphanumeric + `_`/`-`, max 64 chars.

## Directories to Ignore

`new/` (Monoloth 2.0 WIP), `testing/` (file copies), `legacy/` (archived Python), `backup_*/` and `bkp_*/` (snapshots), `build/` and `dist/` (output), `pywinpty_extracted/` and `*.whl`, `configs/skills.zip`/`configs/skills - Copy.zip`.
