# Changelog

All notable changes to Monoloth are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/noahain/Monoloth/compare/v2.1.4...HEAD
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
