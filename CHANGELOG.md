# Changelog

All notable changes to Monoloth are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Stale async results from previous terminal sessions can no longer corrupt
  the new one. `initTerminal` captures its terminal reference at closure
  time and drops late `start_terminal` errors, the auto-return countdown is
  cancelled on every init, and main / panel-tab restarts now bump a session
  generation token so a late EOF from the old PTY is ignored. The titlebar
  refresh path applies the same guard.
- Overlapping modal dialogs no longer strand the first promise. `showConfirm`
  and `showPrompt` now stack dialogs (LIFO), and the focus-trap / saved-focus
  bookkeeping in `dom-utils` matches — opening a second dialog over the
  first closes cleanly on either.
- Sidebar tab bugs: clicking a still-initializing CMD tab now activates it
  (the `initializing` guard no longer blocks the visual swap), and
  cancelling the close confirmation on a panel tab no longer logs an
  unhandled promise rejection. Closing a panel tab also retires its backend
  session and clears its generation / skip-next-EOF tracking so a late spawn
  can't ghost it.
- Tooltip references no longer leak to detached DOM. `MonolithTooltip.cleanup`
  now hides the floating tooltip when its target is removed, and the profile
  modal calls cleanup before rebuilding the list.
- File picker: `.svg` and `.ico` are no longer advertised as previewable
  (the backend doesn't return a `dataUrl` for them, so they always showed
  "not available"); the preview check uses the canonical `FILE_IMAGE_EXTS`
  set. Relative date strings from the backend (`"3d ago"`, `"5h ago"`,
  `"just now"`) now format instead of "Invalid Date".
- Updater toast status text routes through `MonolothApp.showStatus` (the
  previous call to a non-existent helper silently no-op'd), and the error
  state scopes its `querySelector` to its own element.
- Background config saves are now atomic. `set_background_config` builds a
  single entry map and calls a new `set_many_config` IPC, so a partial
  write between the type, image, color, gradient, and transparency keys
  can no longer leave the background in a half-updated state. Stale
  brightness is cleared before the new wallpaper is analyzed, so the
  auto-theme doesn't briefly flash the previous mode.
- Window state persistence validates bounds. `Resized` and `Moved` events
  reject out-of-range positions (`MIN/MAX_WINDOW_POSITION`) and the
  `Resized` event also rejects dimensions over `MAX_WINDOW_DIMENSION`,
  matching the sanitize step on load.
- A fully-transparent wallpaper no longer forces the dark auto-theme. Image
  brightness analysis returns an error instead of `0.0` so the auto-mode
  detector can fall back to the previous theme.
- History `parse_iso_to_epoch` rejects non-ASCII input and pre-1970 dates
  (the year-loop subtraction previously panicked), and `retention_days`
  caps at 100 years and rejects bogus values like `0d` / `d` / `forever`.
  The retention apply path uses `saturating_mul` + `checked_sub` to avoid
  overflow on huge values.
- `get_all` skips global keys when reading profile overrides, so a corrupted
  profile can no longer leak a global key like `last_directory` into the
  active config. `delete_profile` removes the file before mutating in-memory
  state, so a failed delete doesn't desync disk and memory.
- `get_path_info.success` is now decoupled from `exists` (it reports
  command success, not path existence), and SVG previews cap at 1 MB so a
  huge SVG can't stall the file picker.
- Background appearance settings are now validated on the backend. The
  `bg_*` fields (`bg_type`, `bg_image`, `bg_color`, `bg_gradient`,
  `bg_transparency`), `theme_mode`, and `cta_button_style` are checked for
  allowed values and correct types before write — invalid values are
  rejected with an error that the appearance section surfaces as a red
  status message instead of being silently stored. `set_background_config`
  now calls the dedicated IPC endpoint directly rather than routing through
  the generic bulk-write, so the validation can't be bypassed.
- The global keyboard shortcut handler suppresses itself while the file
  picker is open, so command palette and other shortcuts can no longer
  fire while the user is browsing files.
- Profile names are capped at 128 characters and rejected with an error
  beyond that, instead of being silently truncated downstream.
- `terminate_terminal` now requires an explicit `session_id` (the silent
  default to `"main"` is gone), and the internal `run_parallel_command`
  helper is no longer exposed as an IPC command.
- Several previously-unhandled promise rejections across the IPC bridge
  (`is_window_maximized`, `toggle_custom_titlebar`, `minimize_window`,
  `close_window`, `set_history_enabled`, the main / panel terminal
  termination calls, and sidebar `send_input` / config writes) now have
  `.catch` guards, so a failed window op or PTY teardown no longer
  prints a console error.
- The CMD-panel recycle path bumps the panel session generation before
  tearing down the old PTY, so a late spawn from the previous session
  can't ghost the new tab.

## [2.1.9] - 2026-06-15

### Fixed
- macOS and Linux portability issues found in the platform audit: the custom file
  picker now uses platform-correct separators, roots, breadcrumbs, parent
  navigation, absolute path entry, and quick links; sidebar command fallbacks use
  the Unix home directory instead of `%USERPROFILE%`; and startup presets such as
  Claude, Qwen, Kimi, Codex, Pi, and Gemini now use the same GUI-launch-safe
  binary resolution as OpenCode.
- macOS bundles enable the hardened runtime required for notarized builds.
- Async race conditions across the launcher. The file picker now tags every
  navigation with a token so a slow `list_directory`, path probe, or image
  preview that resolves after you've moved on can no longer overwrite the current
  view. Relaunching the main terminal or restarting a CMD-panel tab now waits for
  the old PTY to terminate before re-initializing, preventing a stale session
  from racing the new one. A panel tab closed mid-startup tears down its PTY if
  the spawn finishes after the close.
- The auto-updater's Tauri plugin wrappers resolve the IPC core lazily (checking
  `__TAURI_CORE__`, `__TAURI__.core`, and `__TAURI_INTERNALS__`), so an update
  check no longer fails when the core attaches late. Update checks now time out
  after 10s instead of hanging, and superseded auto-check retries are cancelled
  by token so they can't stack up.
- "Before" startup commands run before the agent spawns (so setup completes
  first) and their 30s timeout no longer blocks on a wait thread that a
  pipe-inheriting child process could stall — output is drained on separate
  threads and the timeout is enforced with non-blocking polling.
- The CMD panel's open/closed state, sidebar configuration, and recent-project
  list are now stored as global config keys, so they persist across profile
  switches instead of resetting per profile.

## [2.1.8] - 2026-06-15

### Fixed
- macOS and Linux builds shipped the default Tauri icon. The macOS `icon.icns`
  was malformed (its header declared an 11-byte file for a 277 KB icon), and the
  Linux PNGs carried an off-brand gold/green logo that didn't match Windows.
  Both are regenerated from the canonical Monoloth logo so every platform shows
  the correct icon.
- The window could not be dragged from the titlebar or sidebar on macOS and
  Linux. Only the centered title text was a drag region and the titlebar bar
  itself had `pointer-events: none`, which those platforms honor strictly
  (Windows was more forgiving). The titlebar, its sections, and the sidebar are
  now proper drag regions, with buttons opting out.
- The main terminal failed to launch `opencode` on macOS and Linux
  ("opencode not found"), even when installed. GUI launchers start with a
  minimal `PATH` that omits shell-profile additions (`~/.local/bin`,
  `/usr/local/bin`, `~/.opencode/bin`, npm/bun globals, ...), so the lone
  `which opencode` lookup missed it. Resolution now also asks the user's login
  shell (bounded by a 5s timeout so a slow profile can't stall startup) and
  probes common absolute install locations. The CMD panel was unaffected because
  it launches an absolute shell path.

## [2.1.7] - 2026-06-15

### Fixed
- The whole app froze for ~2 seconds (with a console flash) when the main
  terminal started in release builds, but not in `cargo tauri dev`. Release
  builds run under the Windows `windows` subsystem with no console, so each
  helper process spawned during startup — the `where`/`npm`/`yarn` lookups that
  locate `opencode`, plus any "before" secondary command — forced Windows to
  allocate a fresh `conhost.exe`. Those spawns now set `CREATE_NO_WINDOW`, so
  startup is instant and silent. Dev builds (console subsystem) never hit this.
- Returning to the launcher no longer loses the CMD panel's open/closed state;
  `cmdPanelOpen` is preserved across navigation.

### Changed
- The landing status bar hides its idle "Ready" label and trailing separator,
  showing text only for meaningful states (initializing, errors), and gains a
  little breathing room below the hero cluster.
- Recent-project rows drop the left accent border for a cleaner list.
- Portable artifact filenames now include the version
  (`Monoloth_<version>_x64_portable.exe`, `Monoloth_<version>_<arch>_portable.app.zip`),
  so a downloaded file identifies itself like every other artifact.
- Release pages now open with a "Which file do I download?" guide that maps each
  platform to the right artifact and tells users to ignore the updater-only
  `.sig` and `.app.tar.gz` files.

## [2.1.6] - 2026-06-14

### Fixed
- Auto-updates for macOS and Linux. Each platform's release job generated a
  `latest.json` describing only the platform it built, and all jobs raced to
  upload it, so the published manifest ended up Windows-only (true since
  2.1.4). macOS and Linux clients never saw an update. A new `finalize-updater`
  job now runs after the build matrix, collects every platform's updater
  signature, and publishes a single `latest.json` covering Windows (msi/nsis),
  macOS (aarch64/x86_64), and Linux (AppImage).

## [2.1.5] - 2026-06-14

### Added
- macOS and Linux builds alongside Windows. The release workflow now builds a
  four-target matrix (Windows, Linux, macOS arm64, macOS x64).
- Portable artifacts: a standalone Windows `.exe`, a zipped macOS `.app` per
  architecture, and the Linux `.AppImage`.
- `MonolothUI.getPlatform()` / `isWindows()` helper for platform-aware frontend
  behavior.

### Changed
- Split the monolithic `app.js` (~3900 lines) into focused modules to improve
  maintainability. Phase 1 extracts shortcut management (`shortcuts.js`), the
  inline confirm/prompt dialog (`dialog.js`), the file/folder picker
  (`file-picker.js`), the command palette (`command-palette.js`), and profile
  management (`profiles.js`). Phase 2 extracts theme/CTA-style management
  (`theme.js`) and the terminal session core (`terminal.js`). Each module
  exposes a single `window.Monolith*` global. Behavior is unchanged; `app.js`
  drops from ~3919 to ~1975 lines (-50%).
- The CMD panel launches the user's `$SHELL` on macOS and Linux instead of
  assuming `cmd`/PowerShell. The settings shell selector adapts per platform.
- The file picker defaults to `/` on Unix instead of `C:\`.
- "Open CMD in Project" now runs the command in an external terminal on macOS
  (via `osascript`) and Linux (via `$TERMINAL -e`), matching the Windows
  `cmd /K` behavior.

### Fixed
- Terminal resize corruption with full-screen TUI apps (opencode, vim, etc.).
  Frozen edges and stray characters on resize are gone: all resize triggers are
  coalesced into one debounce, the PTY is resized before xterm, and the forced
  refresh that painted transitional reflow cells was removed. The CMD panel uses
  the same contract.
- `run_parallel_command` no longer fails to compile on Unix. The Windows-only
  `creation_flags` call is gated behind `#[cfg(windows)]`.

## [2.1.4] - 2026-06-14

### Changed
- Terminal reflow uses the real ConPTY build number to drive xterm.js
  heuristics, avoiding output corruption on older Windows builds.

## [2.1.3] - 2026-06-13

### Added
- MIT license.

### Fixed
- npm executable detection on Windows when the global install ships an
  extensionless shell script.
- Terminal UX polish and edge-case handling from a code review audit.

### Removed
- NSIS `perMachine` install mode override.

## [2.1.2] - 2026-06-13

### Fixed
- CMD panel output rendering corruption.

## [2.1.1] - 2026-06-13

### Changed
- Cleanup pass: removed dead code, deduplicated logic, and replaced custom
  helpers with the standard library.

## [2.1.0] - 2026-06-13

### Added
- Multi-tab CMD panel with a tab manager and right-click context menu.
- Tab names reflect the shell type; the tab bar renders as a segmented control.

### Fixed
- Context menu listener leak.
- Race condition and resource leak in the tab manager.
- Close confirmation now only triggers on background tabs with unseen output.

## [2.0.7] - 2026-06-12

### Added
- Cancellable update downloads and a restored update notification UI.
- Backend support for `panel-tab-*` session IDs.

### Fixed
- All panel-tab sessions end when the window closes.

## [2.0.6] - 2026-06-12

### Changed
- Frontend and backend refactor; added documentation.

## [2.0.5] - 2026-06-11

### Added
- `--modal-*` CSS variable tokens for dark, light, and high-contrast themes.

### Fixed
- Terminal sizing overflow caused by titlebar padding.
- Design pass: tinted neutrals, reduced uppercase, scrollbar discoverability.

## [2.0.4] - 2026-06-11

### Changed
- Redesigned update popups.

## [2.0.3] - 2026-06-11

### Fixed
- Custom commands wrap in `cmd /C` on Windows to handle extensionless scripts.

## [2.0.1] - 2026-06-05

### Fixed
- `opencode` wraps in `cmd /C` on Windows to handle extensionless script
  resolution.
- Updater installs on click and retries auto-checks.

## [2.0.0] - 2026-06-04

### Added
- Rewrite on Tauri 2 and Rust with a vanilla JavaScript frontend.
- Terminal emulation via xterm.js and `portable-pty`, command palette,
  configurable sidebar, theme system, profiles, and session history.

## [1.0.0] - 2026-05-05

### Added
- Initial release.

[Unreleased]: https://github.com/noahain/Monoloth/compare/main...beta
[2.1.9]: https://github.com/noahain/Monoloth/compare/v2.1.8...v2.1.9
[2.1.8]: https://github.com/noahain/Monoloth/compare/v2.1.7...v2.1.8
[2.1.7]: https://github.com/noahain/Monoloth/compare/v2.1.6...v2.1.7
[2.1.6]: https://github.com/noahain/Monoloth/compare/v2.1.5...v2.1.6
[2.1.5]: https://github.com/noahain/Monoloth/compare/v2.1.4...v2.1.5
[2.1.4]: https://github.com/noahain/Monoloth/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/noahain/Monoloth/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/noahain/Monoloth/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/noahain/Monoloth/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/noahain/Monoloth/compare/v2.0.7...v2.1.0
[2.0.7]: https://github.com/noahain/Monoloth/compare/v2.0.6...v2.0.7
[2.0.6]: https://github.com/noahain/Monoloth/compare/v2.0.5...v2.0.6
[2.0.5]: https://github.com/noahain/Monoloth/compare/v2.0.4...v2.0.5
[2.0.4]: https://github.com/noahain/Monoloth/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/noahain/Monoloth/compare/v2.0.1...v2.0.3
[2.0.1]: https://github.com/noahain/Monoloth/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/noahain/Monoloth/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/noahain/Monoloth/releases/tag/v1.0.0
