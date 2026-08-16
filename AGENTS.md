# AGENTS.md

## Stack

Tauri 2 (v2.11.1) + Rust backend, vanilla JS frontend. No bundler, no `package.json`, no Node build step. Version `2.2.6` in `Cargo.toml` and `tauri.conf.json`. Identifier `com.monoloth.app`. Cross-platform (Windows/macOS/Linux). Rust 1.77.2+ and C++ Build Tools required.

## Layout

- `src-tauri/src/` — `main.rs` → `lib.rs::run()` registers plugins, restores window state, wires close handler, lists all IPC commands. Commands in `commands/` (one file per concern: `config`, `fs`, `history`, `image`, `profile`, `shell`, `terminal`, `version`, `window`). Core: `pty.rs` (PTY session manager), `config.rs` (untyped `serde_json::Value` map via `Arc<Mutex<ConfigInner>>`), `history.rs`.
- `frontend/` — `index.html` loads `<script>` tags in **load-bearing order** below. IIFE modules expose one `window.Monolith*` global each — no imports. `lib/` has vendored `xterm*`, `dom-utils.js` (sets `window.MonolothUI`), and plugin wrappers.
- `style.css` (~6991 lines) — flat CSS, no preprocessor. `--modal-*` CSS variable tokens for themeable colors.
- Tests: 14 `*.test.cjs` suites / 90 tests in `frontend/` using Node `vm` sandbox. `cargo test` for Rust (80 tests across config, terminal, history, fs, image).

## Build / test commands

No scripts. Raw commands:
```bash
# from repo root
cargo check --manifest-path src-tauri/Cargo.toml   # fast typecheck
cargo test --manifest-path src-tauri/Cargo.toml    # all Rust tests (80)
node --test frontend/*.test.cjs                    # all frontend tests (90)
node --test frontend/terminal.test.cjs             # single suite

# from src-tauri/ (workdir, not --manifest-path — CLI is npm's tauri.cmd)
tauri dev                                          # dev build with hot-reload
tauri build                                        # release build
```
`cargo test --manifest-path src-tauri/Cargo.toml` works from repo root. `node --test` must run from repo root — suites hardcode repo-root-relative reads. `cargo tauri` is not installed; use `tauri` (npm's `tauri.cmd`) from `src-tauri/`. Neither `tauri dev` nor `tauri build` accepts `--manifest-path`.
No formatter, linter, or pre-commit. Don't introduce one without asking.

## Frontend load order (load-bearing)

`xterm*` → `tauri-bridge.js` (`window.monolithApi`) → `dom-utils.js` (`window.MonolothUI`) → `ctx-menu.js` (`window.MonolithCtxMenu`) → `plugin-updater.js` → `plugin-process.js` → `updater-toast.js` → `tooltip.js` → `shortcuts.js` → `theme.js` → `dialog.js` → `file-picker.js` → `command-palette.js` → `profiles.js` → `lib/terminal-view.js` → `terminal.js` → `app.js` → `sidebar.js`

Do not reorder. Cache busters (`?v=N`) on every `<script>` and `<link>` tag — WebView2 caches aggressively. Bump ALL when you change any file.

## Frontend module architecture

Each IIFE module (loaded before `app.js`) exposes ONE `window.Monolith*` (or `Monoloth*`) global. Modules communicate ONLY through `window` globals — no imports.

- `MonolothUI` (lib/dom-utils.js) — DOM helpers shared by all modules (note: `Monoloth` spelling)
- `MonolithCtxMenu` (ctx-menu.js) — shared context menu factory, icons, dismiss logic
- `MonolothTooltip` (tooltip.js) — tooltip positioning/lifecycle (note: `Monoloth` spelling)
- `MonolithShortcuts` (shortcuts.js) — parse/match/load/save shortcuts
- `MonolithTheme` (theme.js) — theme/CTA state, `applyTheme`/`applyCtaStyle`/`syncOutlineOnLightClass`, xterm palettes
- `MonolithDialog` (dialog.js) — `showPrompt`/`showConfirm`
- `MonolithFilePicker` (file-picker.js) — `pickPath(opts)`
- `MonolithPalette` (command-palette.js) — palette nav, open/close/filter
- `MonolithProfiles` (profiles.js) — profile CRUD + switcher modal
- `MonolithTerminal` (terminal.js) — xterm session lifecycle, sets `window.writeToTerm` and `window.__monolithTermWinOpts`
- `MonolothApp` (app.js) — facade exposed on `window.MonolothApp` for other modules and sidebar.js. Coordinates background config, settings, bootstrap/reveal, keydown handler, history, recent-dirs, titlebar. Sets `window.__monolithWindowsPty`.

**Rules:**
- A module may reference `window.MonolothApp.*` or another module's global ONLY inside functions/handlers (event time), NEVER at IIFE top-level — `app.js` loads LAST.
- External contracts: Rust backend calls `window.writeToTerm`; `sidebar.js` calls `window.__monolithTermWinOpts()` and `window.MonolothApp` methods.
- The shared `keydown` handler stays in `app.js`, delegates to `MonolithPalette`/`MonolithDialog`/`MonolithProfiles` via their `is*Active()` + action methods.

## Tauri quirks

- `withGlobalTauri: true` — use `window.__TAURI__.core.invoke` for IPC. All calls are async.
- `app.windows[0].visible: false` in config. Window is shown via `window.show()` in `lib.rs:133`. Do not flip to `true`.
- Updater endpoint: `https://github.com/noahain/Monoloth/releases/latest/download/latest.json`. The `Monoloth` spelling is canonical (yes, typo). Do not "fix" it.
- `plugins.updater.pubkey` is a real signing key. Private key (`TAURI_SIGNING_PRIVATE_KEY`) is a CI secret; keep it safe.

## Bridge response wrapping

`tauri-bridge.js` uses `callApi()` which returns `{ success: true, ...transform(result) }`, NOT the raw backend value. Examples:
- `analyze_image_brightness` → `{ success: true, brightness: <number> }`
- `get_background_config` → `{ type, image, color, gradient, transparency, themeMode, ctaButtonStyle, bgLayer }`
- `get_profiles` → `{ success: true, profiles: [...], active: "..." }`
Check bridge method source before reading response fields.

## Theme / visibility architecture

3 theme modes (dark/light/auto), 4 CTA styles (blur/glass/solid/outline), 4 background types (none/image/color/gradient). Set via body classes:
- `body.light-mode`, `body.adaptive-light` (auto-detected)
- `body.cta-blur`, `body.cta-glass`, `body.cta-solid`, `body.cta-outline`
- `body.outline-on-light` — added by `syncOutlineOnLightClass()` when cta=outline + light background
- `body.custom-titlebar-active`, `body.theme-transitioning`

CSS variable tokens (`--modal-text`, `--modal-border`, `--modal-bg-glass`, etc.) in `:root` (dark) and overridden in `body.light-mode, body.adaptive-light`. Always add new tokens to BOTH blocks.

**Other gotchas:**
- `color-scheme: dark` on `:root`, `color-scheme: light` on light-mode (affects native controls on Windows).
- `font-display: swap` on all 3 `@font-face` rules.
- `backdrop-filter:` capped at `blur(24px)` (was `blur(80px)` — perf).
- `prefers-*` media queries in `style.css` gate motion, transparency, and contrast. `prefers-reduced-motion: no-preference` (line ~5794, feature query that gates motion), `prefers-reduced-motion: reduce` (line ~6026, zeroes animations), `prefers-reduced-transparency: reduce` (line ~7029, downgrades glass to solid), `prefers-contrast: more` (line ~7053, boosts token contrast). Add new animated/glass elements to the a11y overrides.
- Hide-until-ready: landing content is `visibility: hidden` until `window.__monolithReveal()` (after fonts + config loaded). `waitForBridge(5000, ...)` is the 5s safety timeout. The 1500ms font-ready fallback is in `index.html`. If you add a new async dependency that should gate reveal, update `waitForBridge` in `app.js`.

## Window state persistence

`config.rs` sanitizes window state on load via `sanitize_window_state()` — self-heals bogus values (small sizes, Windows minimized-position sentinel `-32000`). Threshold `pub const`s at top of `config.rs`: `MIN_WINDOW_WIDTH`, `MIN_WINDOW_HEIGHT`, `MAX_WINDOW_DIMENSION`, `MIN_WINDOW_POSITION`, `MAX_WINDOW_POSITION`, `WINDOW_MINIMIZED_SENTINEL`. The `on_window_event` handler in `lib.rs` uses the same constants to skip saving bad state. Change thresholds in both places.

## User config storage

App state at `%APPDATA%/Monoloth/config.json` (global) and `%APPDATA%/Monoloth/profiles/*.json` (per-profile overrides). Global keys (not profile-overridable): `active_profile`, `last_directory`, `window_width`, `window_height`, `window_maximized`, `fp_last_dir_bg_image`, `fp_last_dir_choose`, `use_custom_titlebar`, `window_x`, `window_y`, `cmdPanelHeight`, `panelShell`, `cmdPanelOpen`, `sidebar_config`, `recent_directories`, `confirm_dialog_prefs`, `tabBarPosition`, `preset_cache`. Defined in `GLOBAL_KEYS` slice in `config.rs:133-140`. Everything else is profile-overridable. (`mainTabs` / `mainTabActive` / `persistMainTabs` do not exist — `sidebar.js:39` uses an in-memory `_mainTabPanels` Map.)

## Main terminal tabs

The main terminal area supports multiple tabs backed by an in-memory `_mainTabPanels` Map in `sidebar.js:39`. Config key `tabBarPosition` (`standard`/`titlebar`/`hidden`) is global (in `GLOBAL_KEYS`); `mainTabs` / `mainTabActive` / `persistMainTabs` do not exist in this tree. Tab state is not persisted across launches.

## CMD Panel (secondary terminal)

Secondary PTY at bottom (`#cmd-panel`), toggled via `Ctrl+J`. Supports multiple tabs (`session_id = "panel"` for the original, `"panel-tab-*"` for additional tabs); `retire_panel_tab` IPC command closes a single tab. Drag-to-resize handle. Shell resolved by `terminal.rs::resolve_panel_shell()`: `cmd`/`powershell` on Windows, `$SHELL` (fallback `/bin/bash`→`/bin/sh`) on Unix. All panel tabs terminate when the main session ends (`session_end_all_panel_tabs()` in the close handler).

## Git / release flow

- Remote: `https://github.com/noahain/Monoloth.git` (typo intentional). Identity: `noahain` / `noahain@users.noreply.github.com`.
- `Cargo.lock` IS committed (lives in `src-tauri/Cargo.lock`, not repo root).
- `beta` is the working branch, `main` is the released branch. Merges are always `--ff-only` (beta strictly ahead).
- Release: bump version in `Cargo.toml` + `tauri.conf.json` + `Cargo.lock` → `git tag vX.Y.Z` → push.
- CI (`.github/workflows/release.yml`) builds 4-target matrix (Windows, Linux, macOS arm64+x64), signs, publishes to GitHub Releases. A `finalize-updater` job assembles the cross-platform `latest.json` after the matrix — the matrix jobs alone produce a BROKEN single-platform manifest. **Never rename `*.app.tar.gz` / `*.app.tar.gz.sig`** (macOS updater bundles).
- Docs-only changes (README, CHANGELOG links) commit to `beta`, merge to `main` with NO tag. Tags are for version bumps only.
- CHANGELOG: manual Keep a Changelog format. Jot changes under `[Unreleased]`; on release, rename to `[X.Y.Z] - DATE` and open fresh `[Unreleased]`. Separate from GitHub Releases page.

## Test sandbox gotcha

`app.renderer-policy.test.cjs` uses Node `vm`. It MUST load modules in order: `dom-utils.js` → `ctx-menu.js` → `updater-toast.js` → `shortcuts.js` → `theme.js` → `dialog.js` → `file-picker.js` → `command-palette.js` → `profiles.js` → `terminal.js` → `app.js`. `updater-toast.js` checks for `window.__TAURI_PLUGIN_UPDATER__` / `__TAURI_PLUGIN_PROCESS__` at runtime and returns early when missing — no stub needed. Adding new frontend modules? Add them to the sandbox load order.

## Working tree is dirty by design

Root has stale-looking gitignored artifacts (`backup_*`, `bkp_*`, `build/`, `dist/`, `legacy/`, `new/`, `testing/`, `pywinpty_*`, `src/`, `nul`, `tauri-dev.log`, `*.whl`, `files.txt`, `REVIEW_HANDOVER.txt`). NOT checked in. `AGENTS.md` itself is gitignored. Don't `git clean -fdx` without thinking.

## Rust conventions

- Use `#[cfg(windows)]` attribute blocks, NOT runtime `if cfg!(windows)`, for platform-specific imports/methods. Runtime `cfg!()` still compiles the block body on all platforms. Reference: `shell.rs::execute_background`.
- `version.rs` exposes `get_current_version` and `get_windows_pty_info` (build number from Windows registry for xterm.js `windowsPty` option).

## Codebase intelligence (repowise)

A local repowise index of this repo lives in `.repowise/` (global opencode MCP server `repowise`, stdio). Prefer its tools over grepping for architecture, git, and health questions:

- Architecture / how-it-fits: `get_overview` first, then `get_answer` for how/where/why.
- Before editing a hot file: `get_risk` (hotspot, co-change partners, test gaps, bug-fix history).
- Reading code: `get_context`/`get_symbol`; raw source only when the index says bounds are approximate.
- Wiki is LLM-written (DeepSeek, provider `deepseek`). `semantic_search` is OFF (mock embedder) — search falls back to FTS.
- Index auto-syncs via the post-commit hook; `repowise update` re-syncs manually, `repowise serve` opens the dashboard at `localhost:3000`.
- Hosted variant (`repowise-hosted` in global opencode config) is disabled until `mcp.repowise.dev` DNS exists.
