# Updater: Migrate to tauri-plugin-updater

**Date:** 2026-06-04
**Status:** Design approved, pending implementation
**Scope:** Replace the hand-rolled GitHub-API update checker with `tauri-plugin-updater` (cryptographic signature verification, native download + install, restart prompt) and add a global update notification.

## Background

The current update system (`src-tauri/src/commands/updater.rs`, ~54 lines) is a manual-check-only flow: it `ureq`s `https://api.github.com/repos/noahain/Monoloth/releases/latest`, compares `tag_name` to `CARGO_PKG_VERSION` with a hand-rolled `compare_versions()` function, and displays a status line in the Settings footer telling the user to "view on GitHub to download". It does not download, install, or verify anything.

**Audit findings (carried over):**
- No signature verification — supply-chain risk.
- `compare_versions` silently mishandles pre-release tags (`1.0.0-beta` ≡ `1.0.0`; `1.0.0-beta` ≡ `1.0.0-alpha`).
- Hardcoded User-Agent `Monoloth-App/0.1.0` (drifts from real version after first release).
- The `url` field is returned by Rust, mapped by the bridge, and **never read** by the frontend — the "Update available" message is a dead end.
- No auto-check, no periodic check, no global notification — most users will never know an update exists.
- Hardcoded repo URL; no channel concept; no persisted state.

This design replaces the entire updater path with `tauri-plugin-updater` (which natively handles signature verification, download, install, and provides a JS API) and adds a global bottom-right toast notification for the new-version case.

## Goals

1. Cryptographically verify every downloaded update (Ed25519 / minisign via the plugin).
2. Native download + install flow with a clear "Restart now" prompt.
3. Global update notification that is visible without opening Settings.
4. Auto-check on app startup (silent on failure).
5. Preserve the Settings-footer "Check for Updates" button as a secondary trigger.
6. Add a release CI workflow so signed updates can be published from a tag push.
7. Fix the `authors = ["you"]` placeholder and any others that remain.

## Non-Goals (YAGNI)

- Pre-release / beta / nightly channels (out of scope; only stable releases are published).
- "Skip this version" — the dismissed toast reappears on next launch, period.
- Last-checked timestamp display.
- Authenticode code signing (no certificate; users will see SmartScreen warnings on first install).
- Differential / delta updates (plugin default is full binary).
- Auto-restart without user consent.
- Persisted update state in `AppConfig` (no config field changes).

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| UX scope | Auto-check on startup + bottom-right toast + preserved footer button |
| Toast position | Bottom-right, fixed |
| Update channels | Stable only |
| Old code disposition | Delete `commands/updater.rs` and the two commands; footer button rewired |
| Release workflow | Add GitHub Actions + tauri-action, triggered on `v*` tag push |
| Authenticode signing | None (accept SmartScreen) |
| Download trigger | Prompt first, then download |
| Skip-version | No; dismissed toast reappears next launch |
| Download UX | Inline progress on the toast |
| Startup check failure | Silent |
| CI trigger | Tag push `v*` |
| Plugin JS loading | Vendor `@tauri-apps/plugin-updater` JS into `frontend/lib/plugin-updater.js` |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ App startup                                                 │
│   └─ app.js init()                                          │
│        └─ window.MonolothUpdater.init()                     │
│             └─ try { check() } catch { /* silent */ }       │
│                  └─ if available → mountToast(update)        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ frontend/lib/updater-toast.js (window.MonolothUpdater)      │
│   - Owns: toast DOM, pill DOM, state machine, event wiring  │
│   - Exposes: init(), checkFromFooter(), mountToast(),       │
│              mountPill(), removeToast(), setState(),        │
│              classifyError(), showError()                   │
│   - Renders: [Update v0.2.0] [×]   →   [Downloading 42%]    │
│   - On done → [Restart now] → window.MonolothUpdater.restart()│
│              → plugin-process.relaunch()                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Settings footer (preserved as secondary trigger)            │
│   - Shows current version (unchanged)                       │
│   - "Check for Updates" button → MonolothUpdater.checkFromFooter()│
│   - Status line: "Up to date" / "v0.2.0 available" / error  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Vendored plugin JS (window.__TAURI_PLUGIN_UPDATER__,        │
│                     window.__TAURI_PLUGIN_PROCESS__)        │
│   - Direct calls to plugin JS API                           │
│   - No monolithApi.update.* wrappers                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Rust: tauri-plugin-updater + tauri-plugin-process           │
│   - pubkey in tauri.conf.json                               │
│   - endpoint: github.com/noahain/Monoloth/releases/.../latest.json│
│   - signature verified on download                          │
└─────────────────────────────────────────────────────────────┘
```

Five layers, each with one job: **app.js** (boot), **MonolothUpdater** (UI + state), **footer** (manual trigger), **plugin JS** (thin vendor wrapper), **Rust plugins** (verify + install). No new Rust commands. No `monolithApi.update.*` methods.

## File changes

### New files (4)

- **`.github/workflows/release.yml`** — tauri-action workflow, triggered on `v*` tag push. Reads **both** `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the latter optional — empty password is valid for keys generated without one; missing entirely causes `tauri-action` to fail silently) from repo secrets, runs `tauri build` with `bundle.createUpdaterArtifacts: true` (already in `tauri.conf.json`) which **automatically generates `latest.json` + per-platform `.sig` files alongside the installers**. The action uploads all artifacts (installers, latest.json, .sig) to a GitHub Release (draft if `inputs.draft: true`; default is `false` to match tag-push semantics).
- **`frontend/lib/plugin-updater.js`** — Vendored compiled JS of `@tauri-apps/plugin-updater` (~5KB). Loaded via `<script>` in `index.html`. Exposes `window.__TAURI_PLUGIN_UPDATER__`. **Manual re-vendoring required on plugin version bumps** (same pattern as the existing `lib/xterm.js` and `lib/fit.js` — no build step, no auto-update of vendored code).
- **`frontend/lib/plugin-process.js`** — Vendored compiled JS of `@tauri-apps/plugin-process` (~2KB). Loaded via `<script>` in `index.html` after `plugin-updater.js`. Exposes `window.__TAURI_PLUGIN_PROCESS__`. **Manual re-vendoring required on plugin version bumps**, same as `plugin-updater.js`.
- **`frontend/lib/updater-toast.js`** — New IIFE exposing `window.MonolothUpdater` with: `init()`, `checkFromFooter()`, `mountToast(update)`, `mountPill(update)`, `removeToast()`, `setState(state, data)`, `classifyError(e)`, `showError(class)`. Internally uses `window.__TAURI_PLUGIN_UPDATER__` and `window.__TAURI_PLUGIN_PROCESS__`. ~150 lines, self-contained, no external deps beyond the vendored plugin JS. **Follows the `dom-utils.js` extraction pattern** documented in AGENTS.md "Frontend Refactor Decisions (2026-06-04)" — keeps `app.js` from growing past its current ~3973 lines. Guarded at the top: `if (!window.__TAURI_PLUGIN_UPDATER__ || !window.__TAURI_PLUGIN_PROCESS__) return;` so the frontend sandbox test still loads.

### Modified files (8)

- **`src-tauri/Cargo.toml`** — add `tauri-plugin-updater = "2"`, add `tauri-plugin-process = "2"`, **remove** `ureq = "2.10"`, fix `authors = ["you"]` → `["Noahain"]`.
- **`src-tauri/tauri.conf.json`** — add `bundle.createUpdaterArtifacts: true` (this is the correct Tauri v2 key — verified against tauri v2 schema; `bundle.updater.active` does not exist in v2); add `plugins.updater.{pubkey,endpoints}` (one entry: `https://github.com/noahain/Monoloth/releases/latest/download/latest.json`).
- **`src-tauri/capabilities/default.json`** — add `updater:default` and `process:default` permissions.
- **`src-tauri/src/lib.rs`** — add `.plugin(tauri_plugin_updater::Builder::new().build())` and `.plugin(tauri_plugin_process::init())`; remove `commands::get_current_version` and `commands::check_for_updates` from `invoke_handler`; **always initialize `tauri-plugin-log` at `Info` level (not just in debug)** so production builds capture the small set of updater-critical errors (`SIGNATURE`, `RATE_LIMIT`, `PERMISSION`). Current code gates log init on `cfg!(debug_assertions)` at `lib.rs:24-30`; that gate is removed. Log file rotation is the plugin's default (sized, rotated) — overhead is acceptable for bug-report diagnostics.
- **`frontend/index.html`** — bump `?v=N` on `app.js`, `tauri-bridge.js`, `style.css`; add `<script src="lib/plugin-updater.js?v=1">`, `<script src="lib/plugin-process.js?v=1">`, `<script src="lib/updater-toast.js?v=1">`. All three load **after** `tauri-bridge.js` (so `window.monolithApi` is set, even though the updater doesn't use it) and **before** `app.js` (so `window.MonolothUpdater` is available to `app.js` init).
- **`frontend/app.js`** — rewire footer button click (calls `window.MonolothUpdater.checkFromFooter()`); remove the old "Check for Updates" handler (lines 668-692). Net addition: ~5 lines (one click handler) — the updater logic lives in a separate module.
- **`frontend/tauri-bridge.js`** — remove `api.get_current_version` (lines 298-300) and `api.check_for_updates` (lines 302-311).
- **`frontend/index.html`** — bump `?v=N` on `app.js`, `tauri-bridge.js`, `style.css`; add `<script src="lib/plugin-updater.js?v=1">` and `<script src="lib/plugin-process.js?v=1">` after `tauri-bridge.js` and before `app.js`; add `<script src="lib/updater-toast.js?v=1">` before `app.js`.
- **`frontend/style.css`** — add `.update-toast` and `.update-pill` blocks, theme-aware via existing CSS variables (`--bg-color`, `--text-color`, `--accent`, `--border-color`, `--bg-transparency`); reuse the existing settings-panel blur pattern for custom-background compatibility. **Toast z-index: 10000** (above sidebar overlay ~9999 and settings page modal) to avoid clipping. Pill z-index: 9999 (same layer as sidebar — but only mounted when sidebar is hidden behind footer logic, no conflict in practice).

### Deleted files (1) + 2 references

- **`src-tauri/src/commands/updater.rs`** — whole file (54 lines).
- **`src-tauri/src/commands/mod.rs`** — remove `mod updater;` (line 11) and `pub use updater::*;` (line 21).
- **`src-tauri/src/lib.rs`** — remove `commands::get_current_version` (line 143) and `commands::check_for_updates` (line 144) from `invoke_handler`.

## Data flow & state machine

### Startup
```
app.js init()
  → window.MonolothUpdater.init()
    → try { check() } catch { silent }
    → if available → mountToast(update)
```

### Manual footer check
```
click footer button → window.MonolothUpdater.checkFromFooter()
  → disables footer button, status = "Checking…"
  → check()
    → if available → mountToast(update) + status = "Update available"
    → if not       → status = "Up to date" (6s auto-clear)
    → if error     → status = error (6s auto-clear)
  → re-enables footer button
```

`MonolothUpdater.checkFromFooter()` is the only updater API the footer calls — it owns the button-disable/status-line dance, so `app.js` doesn't have to know the implementation details.

### Toast state machine
```
                          mountUpdateToast()
              IDLE ──────────────────────────────→ AVAILABLE
                ↑                                       │ click [Update]
                │                                       ▼
                │                                  DOWNLOADING
                │  download fails                    │      │
                │                                       │      │ fail
                │                                       ▼      ▼
                │                                  READY   ERROR
                │                                       │      │ click [Retry]
                │                                       │      └─→ DOWNLOADING
                │                                       │ click [Restart now]
                │                                       ▼
                │                              process.relaunch()
                │                                       
                │  AVAILABLE --click [×]--> IDLE
                │  READY     --click [×]--> IDLE  (reappears next launch as AVAILABLE)
                │                                       
                │  DOWNLOADING --click [×]--> MINI_PILL
                │                                       │ download completes
                │                                       ▼
                │                                  MINI_PILL_READY
                │                                       │ click [Restart] → process.relaunch()
                │                                       │ click [Open] → restores AVAILABLE/READY full toast
                │                                       │ click [×] → IDLE (install deferred to next launch)
                │                                       
                │  MINI_PILL/MINI_PILL_READY --[Update available for newer ver.]--> IDLE
                │                                       (then mountUpdateToast runs with newer version)
                │                                       
                │  any state where a check returns a NEWER version while in READY/MINI_PILL_READY
                │  → full toast re-mounted (user has not committed to restart yet)
                │                                       
                │  any state where a check returns the SAME version as currently mounted
                │  → no-op
```

The × button on the full toast never cancels an in-flight download — once the user has committed to "Update", we finish the job. The pill is a low-profile "view-only" surface; it has its own [Restart] [Open] [×] controls.

### Event wiring
```js
update.downloadAndInstall(({ event, data }) => {
  switch (event) {
    case 'Started':   setState('DOWNLOADING', { total: data.contentLength, done: 0 }); break;
    case 'Progress':  setState('DOWNLOADING', { done: prev.done + data.chunkLength }); break;
    case 'Finished':  setState('READY'); break;
  }
});
```

### Restart
- After `downloadAndInstall` resolves → toast shows "Restart now"
- Click → call `relaunch()` from the **vendored `tauri-plugin-process` JS wrapper** at `frontend/lib/plugin-process.js` (sibling to `plugin-updater.js` — both vendored, both exposed as `window.__TAURI_PLUGIN_*__` globals). Vendor both or neither; raw `invoke('plugin:process|relaunch')` is **not** used (would be the only raw-invoke call in the app and an inconsistent escape hatch).

### Edge cases

| Case | Behavior |
|------|----------|
| Auto-check fails (offline / rate-limit / 5xx) | Silent, log to console |
| Manual check fails | Status line shows error, 6s auto-clear |
| User clicks × during DOWNLOADING | Toast removes; **mini-pill** appears at bottom-right showing "Downloading v0.2.0…" with progress; on complete, pill becomes "Restart to install"; on click, restores full toast. Cancel = no button (by design — see note in state machine). |
| User clicks × during READY | Toast removes, install deferred to next launch's check (becomes AVAILABLE again) |
| Download fails mid-stream | Toast → ERROR state, "Retry" button re-runs `downloadAndInstall` |
| **Check returns new version while a download is in-flight** | **New check result is ignored until current download resolves.** Once READY, the next check (manual or auto on next launch) with a different version replaces the toast. Rationale: avoid mid-flight cancel+restart of a signed download. |
| **Check returns new version while in READY** | New version replaces the toast (newer is always better; user hasn't clicked Restart yet) |
| **Check returns the same version as currently mounted** | No-op (idempotent — content not re-rendered) |
| App closed during DOWNLOADING | OS kills download, next launch treats as fresh available update |
| **Download stalls indefinitely (network drop with TCP keepalive)** | **Stall detection: 2 minutes without a `Progress` event → "Download seems stuck" with explicit [Cancel] [Retry] buttons.** No wall-clock timeout on the underlying HTTP request (Tauri's HTTP layer manages its own). Stall = last-progress-timestamp older than 2 min. Cancel triggers `AbortController`; Retry cancels + restarts. Reset on any new `Progress` event. |

## Error handling

### Classification (JS-side)
```js
function classifyError(e) {
  const msg = String(e?.message || e);
  if (/signature|verify/i.test(msg))                       return 'SIGNATURE';
  if (/rate.?limit|403/i.test(msg))                        return 'RATE_LIMIT';
  if (/not.?found|404/i.test(msg))                         return 'NOT_FOUND';
  if (/network|fetch|timeout|tls|dns/i.test(msg))         return 'NETWORK';
  if (/permission|access.?denied/i.test(msg))              return 'PERMISSION';
  if (/another.?instance|file.?in.?use/i.test(msg))        return 'IN_USE';
  return 'UNKNOWN';
}
```

### User-facing copy

| Class | Toast title | Toast body |
|-------|-------------|------------|
| `SIGNATURE` | "Update verification failed" | "The downloaded file may have been tampered with. **Please report this** at github.com/noahain/Monoloth/issues. **Do not install.**" |
| `RATE_LIMIT` | "GitHub rate limit hit" | "Try again in about an hour." |
| `NOT_FOUND` | "Release not found" | "The repo may have moved or this version is no longer available." |
| `NETWORK` | "Couldn't reach GitHub" | "Check your connection and retry." |
| `PERMISSION` | "Couldn't install update" | "Try closing other Monoloth instances, or run as administrator." |
| `IN_USE` | "Update file in use" | "Close all running Monoloth instances and click Retry." |
| `UNKNOWN` | "Update failed" | "See console for details. Click Retry to try again." |

**Stall behavior (no progress for >2 minutes during DOWNLOADING):**
- Toast body changes to: "Download seems stuck. [Retry] [Cancel]"
- "Cancel" terminates the in-flight download via AbortController and transitions toast to ERROR
- "Retry" cancels + restarts the download

### Behavior per stage

| Stage | Silent? | Visible feedback |
|-------|---------|------------------|
| Auto-check on startup | yes | `console.warn` only |
| Manual footer check | no | Status line, 6s auto-clear, red on error |
| Download in progress | no | Inline progress on toast |
| Download error | no | Toast → ERROR state with [Retry] [Dismiss] |
| Install error | no | Toast → ERROR state, body includes hint (e.g. "close other instances") |
| Signature error | no | Toast → ERROR state, **prominent warning**, no Retry button |

### Defensive measures
- `mountUpdateToast()` is idempotent: same version updates content; different version replaces.
- All async paths wrapped in try/catch. UI state never half-mounted.
- `console.error` on every caught error with `{ stage, class, message, stack }` — devtools-friendly.
- `SIGNATURE`, `RATE_LIMIT`, `PERMISSION` errors also logged via `tauri-plugin-log` `error` level. **The log plugin is initialized unconditionally (at `Info` level) in both debug and release builds** — see `lib.rs` change above. This means *all* `log::error!` / `log::warn!` calls in the app emit to the log file in release too, not just updater ones. If selective filtering is preferred later, it can be re-gated; for now, broad logging is the simpler, more useful default.

### Retry policy
- Auto-check: 1 attempt, no retry
- Manual check: button always re-enabled, user clicks again
- Download/install: explicit "Retry" button re-runs the same call
- Signature: **no retry** — surfaces a report-this prompt

## Testing

### Automated (must pass in CI / pre-merge)

| Test | Command | Why |
|------|---------|-----|
| Rust compile | `cargo check` (from `src-tauri/`) | Plugin + config + capabilities compile cleanly |
| Rust unit tests | `cargo test` | Existing 6 tests in `config.rs` still pass |
| Frontend smoke | `node --test frontend/app.renderer-policy.test.cjs` | `app.js` still loads in sandbox |
| Workflow YAML | GitHub Actions validates on push | Catches bad YAML, missing secrets |

### Sandbox-stub requirement (frontend test)
The current `app.renderer-policy.test.cjs` loads `app.js` via `vm.runInContext` after `dom-utils.js`. The guard pattern at the top of `updater-toast.js` (`if (!window.__TAURI_PLUGIN_UPDATER__ || !window.__TAURI_PLUGIN_PROCESS__) return;`) keeps the module's top-level code a no-op — no stub needed. `app.js`'s call to `window.MonolothUpdater.init()` is wrapped in a similar guard at the call site (defensive — module guards should suffice, but app.js guards against the case where the module is loaded but the plugin JS isn't).

### Integration test (GitHub Actions = the test)
1. Push tag `v0.0.0-rc.1`
2. Workflow runs: build → sign → upload artifacts to a **draft** release
3. Verify `latest.json` + `.sig` files are in the draft
4. Manually run a local `cargo tauri build` with the test pubkey, point endpoint at the draft, click "Check" → confirm toast appears → click "Update" → confirm install + restart works
5. Delete the draft release when done

### Manual checklist (user runs before first public release)
```markdown
- [ ] cargo tauri signer generate -w ~/.tauri/monoloth.key (store .key safely)
- [ ] Paste .pub contents into tauri.conf.json -> plugins.updater.pubkey
- [ ] Add TAURI_SIGNING_PRIVATE_KEY to GitHub repo secrets
- [ ] Add TAURI_SIGNING_PRIVATE_KEY_PASSWORD (if key has password)
- [ ] cargo tauri build succeeds locally
- [ ] cargo tauri build produces latest.json + .sig next to installer
- [ ] GitHub Actions workflow runs green on a test tag (draft release)
- [ ] Install test build, verify "Up to date" when no release
- [ ] Publish a draft release with latest.json, verify "Update available" toast
- [ ] Click Update, verify download + install + restart works
- [ ] Test with SmartScreen: accept warning, verify install succeeds
- [ ] Test offline: airplane mode, click Check, verify graceful error
- [ ] Test in light mode: toast matches light theme
- [ ] Test with custom background image: toast matches themed surface
```

### Visual / theme verification (manual)
- Dark mode, light mode
- Custom background image (transparency / blur)
- Custom background gradient
- Custom background color
- Sidebar left + sidebar right (no overlap)
- 800×500 minimum window size (no cutoff)
- Slide-in animation smooth at 60fps

### No new unit tests added
- `compare_versions` is gone (plugin handles semver correctly upstream)
- No new Rust logic to unit test (plugin is config-only)
- Existing 6 config.rs tests + 1 frontend sandbox test = maintained suite, unchanged in scope

## Signing key setup (one-time, user does this before first build)

```bash
cargo tauri signer generate -w ~/.tauri/monoloth.key
# Then paste the .pub contents into tauri.conf.json -> plugins.updater.pubkey
# Store the .key safely; add to GitHub repo secrets as TAURI_SIGNING_PRIVATE_KEY
```

**Pre-publish gate:** The pubkey is a placeholder string in `tauri.conf.json` (`"pubkey": "REPLACE_ME"`). `cargo tauri build` will fail fast at startup with a clear error if the pubkey is missing or invalid. The author must complete the one-time setup before the first build.

## Open questions

None at design time. All ambiguous decisions resolved during brainstorming.

## References

- Tauri updater plugin docs: https://v2.tauri.app/plugin/updater/
- Tauri code signing (Windows): https://v2.tauri.app/distribute/sign/windows/
- tauri-action: https://github.com/tauri-apps/tauri-action
- Internal audit findings: see chat thread "audit the updates system" from 2026-06-04
