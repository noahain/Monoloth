# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Tauri 2 (v2.11.1) + Rust backend, vanilla JS frontend. No bundler, no `package.json`, no Node build step. Version `2.0.0` in `src-tauri/Cargo.toml` and `tauri.conf.json`. Identifier `com.monoloth.app`. Windows-only (WebView2 via `embedBootstrapper`); Rust 1.77.2+ and C++ Build Tools required.

## Layout

- `src-tauri/src/` — entry `main.rs` → `lib.rs::run()`. Commands in `commands/` (one file per concern: `config`, `fs`, `history`, `image`, `profile`, `shell`, `terminal`, `version`, `window`). Config persistence in `config.rs` (untyped `serde_json::Value` map via `Arc<Mutex<ConfigInner>>`).
- `frontend/` — `index.html` loads `<script>` tags in load-bearing order (see below). Large `app.js`/`sidebar.js` are the IIFE controllers. `modules/` is a growing ESM layer extracted from them (one file per concern: `bridge`, `shortcuts`, `theme`, `background`, `terminal`, `palette`, `file-picker`, `profiles`); each module sets a `globalThis.X = X` facade at the end. `lib/` has vendored xterm + IIFE plugin wrappers. Tests: `app.renderer-policy.test.cjs` plus `modules/*.test.cjs` (Node `vm` sandbox).
- `style.css` (~7800 lines) — flat CSS, no preprocessor. 14 `--modal-*` CSS variable tokens for themeable text/border/bg colors.

## Build / test commands

No scripts. Raw commands (run from repo root unless noted):
```bash
cargo check                                          # fast typecheck (from src-tauri/)
cargo test                                           # 7 tests in config module
node --test frontend/app.renderer-policy.test.cjs    # one Node test runner at a time
node --test frontend/modules/palette.test.cjs        # module tests use vm.SourceTextModule
cargo tauri dev                                      # full dev build with hot-reload
cargo tauri build                                    # release build
```
No formatter, linter, or pre-commit. Don't introduce one without asking.

## Frontend load order (load-bearing)

`xterm*` → `tauri-bridge.js` (sets `window.monolithApi`) → `dom-utils.js` (`window.MonolothUI`) → `plugin-updater.js` → `plugin-process.js` → `updater-toast.js` → `tooltip.js` → `app.js` → `sidebar.js`

Do not reorder. Cache busters (`?v=N`) on every `<script>` tag — WebView2 caches aggressively. Bump ALL when you change any file.

## Tauri quirks

- `withGlobalTauri: true` — use `window.__TAURI__.core.invoke` for IPC. All calls are async.
- `app.windows[0].visible: false` in `tauri.conf.json`. The window is shown via `window.show()` in `lib.rs:60`. Do not flip to `true`.
- Updater endpoint: `https://github.com/noahain/Monoloth/releases/latest/download/latest.json`. The `Monoloth` spelling is the canonical repo name (yes, typo). Do not "fix" it.
- `plugins.updater.pubkey` is `"REPLACE_ME"`. Generate a real keypair before a public release.

## Theme / visibility architecture

The app has 3 theme modes (dark/light/auto), 4 CTA styles (blur/glass/solid/outline), 4 background types (none/image/color/gradient). Switching is done via body classes:

- `body.light-mode` (user-chosen light), `body.adaptive-light` (auto-detected light)
- `body.cta-blur`, `body.cta-glass`, `body.cta-solid`, `body.cta-outline`
- `body.outline-on-light` — added by `syncOutlineOnLightClass()` when cta-style is outline AND background is light. Darkens modal borders.
- `body.custom-titlebar-active`, `body.theme-transitioning`

**CSS variable tokens** (`--modal-text`, `--modal-border`, `--modal-bg-glass`, etc.) defined in `:root` (dark defaults) and overridden in `body.light-mode, body.adaptive-light`. Always add the token to BOTH blocks. If a color value doesn't match an existing token alpha, add a new token (repeated use) or keep the hardcoded value (one-off).

**Critical: bridge responses are wrapped.** `tauri-bridge.js` uses `callApi()` which returns `{ success: true, ...transform(result) }`. For example:
- `analyze_image_brightness` returns `{ success: true, brightness: <number> }` — NOT a bare number.
- `get_background_config` returns `{ type, image, color, gradient, transparency, themeMode, ctaButtonStyle, bgLayer }` — NOT the raw Tauri response.
- `get_profiles` returns `{ success: true, profiles: [...], active: "..." }`.
Check the bridge method source before accessing response fields.

**Other theme gotchas:**
- `color-scheme: dark` on `:root`, `color-scheme: light` on light-mode. Affects native controls (color picker, select) — Windows won't auto-dark them without this.
- `font-display: swap` on all 3 `@font-face` rules (was `block`, which hid text for up to 3s).
- `backdrop-filter:` values capped at `blur(24px)` (was `blur(80px)` in cta-glass — perf).
- Three `prefers-*` media queries at bottom of `style.css`: `reduced-motion` (zeroes animations), `reduced-transparency` (downgrades glass to solid), `contrast: more` (boosts token contrast). Add new animated/glass elements to these queries.
- Hide-until-ready: landing page content stays `visibility: hidden` until `window.__monolithReveal()` is called (after both fonts AND config are loaded). 5s safety timeout in `index.html`. If you add a new async dependency that should gate the reveal, update the coordination in `app.js` `waitForBridge`.

## Window state persistence (don't break this)

`config.rs` sanitizes window state on load via `sanitize_window_state()` — self-heals bogus values (small sizes, Windows minimized-position sentinel `-32000`). Threshold constants are `pub const`s at the top: `MIN_WINDOW_WIDTH`, `MIN_WINDOW_HEIGHT`, `MAX_WINDOW_DIMENSION`, etc. The `on_window_event` handler in `lib.rs` uses the same constants to skip saving bad state. Change thresholds in both places.

## Git / release flow

- Remote: `https://github.com/noahain/Monoloth.git` (typo intentional).
- Identity: `noahain` / `noahain@users.noreply.github.com` (already configured).
- `Cargo.lock` IS committed (after the initial commit was made without it).
- Release: bump version in `Cargo.toml` + `tauri.conf.json` → `git tag vX.Y.Z` → push. CI (`.github/workflows/release.yml` using `tauri-action@v0.6.2`) builds, signs with the secret key, publishes to GitHub Releases, generates `latest.json`.
- The updater only triggers when a NEWER version exists in latest.json. The first 2.0.0 install must come from the release page manually.

## Test sandbox gotcha

`app.renderer-policy.test.cjs` uses Node's `vm` module. It MUST load `dom-utils.js` AND `updater-toast.js` into the sandbox before `app.js`, in that order. The updater-toast module returns early when `__TAURI_PLUGIN_UPDATER__` / `__TAURI_PLUGIN_PROCESS__` are missing (they are in the sandbox), so no stub is needed. Adding new global-consuming frontend modules? Add them to the sandbox load order.

## Working tree is dirty by design

The root has many stale-looking gitignored artifacts (`backup_*`, `bkp_*`, `build/`, `dist/`, `legacy/`, `new/`, `testing/`, `pywinpty_*`, `src/` (old Python tree), `nul`, `tauri-dev.log`, `*.whl`, `files.txt`). They are NOT checked in. `CLAUDE.md` itself is gitignored. Don't `git clean -fdx` without thinking.

## User config storage

App state lives at `%APPDATA%/Monoloth/config.json` (global) and `%APPDATA%/Monoloth/profiles/*.json` (per-profile overrides). The set of "global" keys — those that don't get per-profile overrides — is the `global_keys()` list in `src-tauri/src/config.rs`. Anything not in that list is profile-overridable; `active_profile` itself is always global.
