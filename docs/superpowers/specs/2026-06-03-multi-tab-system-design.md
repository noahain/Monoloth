# Monoloth Multi-Tab System — Design Spec

**Date:** 2026-06-03
**Status:** Brainstormed, design locked
**Companion:** `2026-06-03-multi-tab-system-context.txt` (source files the design touches)
**Supersedes:** `2026-06-01-monolith-tabs-design.md` (different, more elaborate prior design)

---

## 1. Problem & goals

Monoloth today has exactly one terminal area backed by a single `'main'` PTY session, plus a separate bottom `'panel'` PTY for the CMD panel. The user wants a real tab bar: multiple concurrent terminal sessions, each with its own profile and independent PTY, with drag-to-reorder, right-click context menu, and a tab-bar-disabled legacy fallback.

**Goals (priority order):**

1. Multiple independent PTY sessions in parallel via a tab bar.
2. Per-tab active profile that drives the rest of the UI (background, theme, shortcuts, secondary commands).
3. All interactive surfaces (CMD panel, sidebar background tasks) belong to the active tab.
4. State persists across restarts (tab order, profile per tab, active tab, bar position, bar enabled/disabled).
5. Tab bar position (top/bottom) is a setting; tab bar can be disabled entirely (legacy single-tab mode).
6. Existing single `'main'` + `'panel'` PTY session model is reused — the new system is layered on top, not a rewrite.
7. "Reuse existing PTY spawn, cleanup, and session termination logic for each tab's session."

**Non-goals (v1):**

- Per-tab background/theme override (always derived from active tab's profile → global background config).
- Per-tab active directory persistence (every tab shares the global `last_directory`; recent dirs list is global).
- Per-tab secondary commands as sub-views.
- Tab rename, color labels, pin, groups, splits, tear-off windows.
- Scrollback persistence across PTY restarts.

---

## 2. Architectural decision summary

| Decision | Choice | Why |
|---|---|---|
| Tab data ownership | Frontend `TabManager` (in-memory + JSON in config) | No Rust TabsManager needed; `AppConfig` already persists arbitrary JSON via `set_config`/`get_config` |
| Persisted shape | New global key `tabs_state` (single object), registered in `global_keys()` | Matches existing `global_keys()` extension pattern; one atomic write per change |
| Tab ID | UUID v4 (frontend-generated via `crypto.randomUUID()`) | Stable across reorder/rename; no collision risk |
| PTY session ID | `${tabId}_main` and `${tabId}_panel` (and `${tabId}_bg_${buttonId}` for sidebar) | Existing `PtyManager` is a `HashMap<String, PtySession>` keyed by string — just use composite keys |
| Xterm instance lifecycle | Created lazily on terminal launch, disposed on tab close | Inactive tabs in simplified-landing state have no xterm at all (saves memory) |
| Main tab | Always `isMain: true`, first in creation order, can be dragged to any position | Per user decision; structurally one tab, visually identical to others |
| Tab bar disabled | Legacy mode: no `tabs_state` written, app behaves exactly as today | Per user decision: backwards compat is paramount |
| New tab defaults | Clones active tab's profile; no PTY running | Per user decision; feels natural |
| Directory state | Global `last_directory` only; no per-tab dir stored | Per user decision; recent dirs list is the single source of truth |
| Session restore | Debounced 500 ms on every change + final save on window close | Matches existing window state save pattern |
| Window title | Static `"Monoloth"` (unchanged) | Per user decision |
| Close confirmation | Reuse existing `showConfirm` pattern (same modal as app close / return button) | Per user decision |
| Visual style | Match OS chrome, 40-44 px, rounded tabs, CTA-themed background | Per user decision: matches sidebar/cmd panel/custom titlebar |
| History scope | Single global history session, tabs are activities within | Per user decision |

---

## 3. Data model

### 3.1 Persisted config (new global key)

Add `tabs_state` to the global config object in `config.json` (the file `appdata_dir()/config.json`). It must be registered in `AppConfig::global_keys()` (a one-line addition in `config.rs` around line 63-70) so it is always written to `config.json` regardless of `active_profile`. Without that registration, `set_config` routes the value into the active profile's JSON file, which is not what the design intends.

```json
{
  "tabs_state": {
    "tabs": [
      { "id": "uuid-v4", "isMain": true, "profile": "Default" },
      { "id": "uuid-v4", "isMain": false, "profile": "Default" }
    ],
    "activeTabId": "uuid-v4",
    "tabBarPosition": "bottom",
    "tabBarEnabled": true
  }
}
```

Field notes:

- `tabs[]` — ordered list. Order = display order. First element is conventionally the main tab but the user can drag the main tab to any position.
- `id` — UUID v4 string. Stable for the life of the tab; new on each `createTab`.
- `isMain` — exactly one tab per `tabs_state` has `isMain: true`. Set on creation of the first tab; preserved across reorders and profile switches.
- `profile` — profile name (string). Per-tab override of the global `active_profile`; determines which profile's `startup_command` / `secondary_commands` / `run_before_command` / `shell_override` is used when the tab's terminal launches.
- `activeTabId` — UUID of the currently focused tab. Must reference a tab in `tabs[]`. Persisted so restoration lands on the right tab.
- `tabBarPosition` — `"top" | "bottom"`. Default `"bottom"`. Drives DOM ordering and CSS class.
- `tabBarEnabled` — boolean. Default `true`. When `false`, the entire tab UI is hidden and the app runs in legacy single-tab mode; the `tabs_state` key is preserved so re-enabling restores the previous layout.

### 3.2 No per-tab directory

Per design decision, there is **no** `activeDirectory` field on a tab. The global `last_directory` (in `config.json`) is the single source of truth for "where did the user last open a terminal from." When a user picks a directory from any tab's simplified landing, it updates `last_directory` globally. All tabs see the same recent-dirs list.

### 3.3 PTY session ID convention

Existing code already uses the string session ID as a map key. We extend the namespace:

- Main terminal of tab X: `${tabId}_main`
- CMD panel of tab X: `${tabId}_panel`
- Sidebar background button of tab X (per-tab now): `${tabId}_bg_${buttonId}`

The underscore separator is safe because UUID v4 contains only hex + hyphens. No escaping needed.

`PtyManager::terminate_all()` already iterates and kills every session; the existing `CloseRequested` handler keeps working unchanged for app close.

### 3.4 History scope

Unchanged. The single global `HistoryManager` continues to record one session per app run. Tab open/close is logged as an `activity` entry within that session (add a new activity type `"tab_open"` / `"tab_close"` to `history.rs` if not already present, or use a generic `custom` field — implementation detail; no new Rust command required).

---

## 4. Behaviors

### 4.1 App launch

```
if !config.tabs_state OR !config.tabs_state.tabBarEnabled:
    run legacy single-tab mode (today's behavior)
    do NOT write tabs_state
    return
if config.tabs_state exists and tabBarEnabled:
    restore tabs in saved order
    set active tab to config.tabs_state.activeTabId (fallback: first tab)
    spawn NO PTYs (terminals launch lazily on first open)
    show full HTML landing (existing #landing div) on the active tab
    main tab shows the full landing; parallel tabs also show the full landing on first paint
        (parallel tabs will switch to the simplified landing the first time the user
         "bounces" — i.e. clicks Back from a launched terminal. The simplified
         landing is not shown pre-emptively on launch.)
```

### 4.2 First-run with tab bar enabled (no saved state)

```
create one main tab:
    id = crypto.randomUUID()
    isMain = true
    profile = AppConfig.get("active_profile")  // existing global key
write tabs_state
```

No PTY is spawned. Show full HTML landing.

### 4.3 Create parallel tab (+ button or via command palette)

```
new tab = {
    id: crypto.randomUUID(),
    isMain: false,
    profile: activeTab.profile   // clone from currently active tab
}
append to tabs_state.tabs
set activeTabId = new tab id
save tabs_state (debounced)
render the new tab in the bar
show simplified landing inside the active tab's terminal-view
```

The PTY is **not** spawned at this point. The simplified landing has a "Choose Project Directory" button that triggers directory pick → PTY spawn.

### 4.4 Switch active tab

```
save current scrollback? — NO (PTY stays alive in background; xterm buffer preserved)
hide current tab's terminal-view (or landing-view), show target tab's
update active tab indicator in the tab bar
update body class / background / profile name to reflect new active tab's profile
    (re-run loadBackgroundConfig + setProfileUI)
fitAddon.fit() on the now-visible xterm (if any) so cols/rows match viewport
refit any sidebar custom-button terminal
save tabs_state (debounced) — activeTabId changed
```

### 4.5 Launch terminal in a tab (from simplified landing)

```
read global last_directory (or pick new one via native dialog)
update global last_directory
spawn PTY:
    session_id = `${tabId}_main`
    command = active tab's profile.startup_command  (e.g. "opencode" or custom)
    args, cwd, cols, rows
track sessionGeneration[sessionId] in TabManager (mirrors current _sessionGeneration map)
swap simplified-landing for the xterm terminal-view
```

The current `initTerminal(dir)` becomes `TabManager.initTerminal(tabId, dir)`. Internally it creates an xterm per tab (lazy) and disposes the previous tab's xterm only if the tab is in a "non-running" state and we're not just hiding.

### 4.6 Back from terminal → simplified landing

Triggered by clicking the existing `terminal-back-btn` or pressing the existing back shortcut.

```
if PTY for active tab is running:
    showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
        .then(proceed).catch(cancel)
if confirmed (or no PTY):
    terminate_terminal(`${tabId}_main`)
    dispose active tab's xterm
    remove simplified-landing container
    render simplified-landing HTML in #terminal-view for the active tab
    set current view = 'simplified-landing'
```

The simplified-landing is a new HTML overlay, **not** an xterm render. It contains:

- Active tab's profile name (with switch button)
- "Choose Project Directory" primary button (opens native dir picker)
- Recent directories list (reads global `last_directory` plus any persisted recent list)
- "Open Terminal in this directory" secondary button (uses global `last_directory`)
- Keyboard shortcut hints (`Ctrl+P`, `Ctrl+,`)

### 4.7 Close tab (X button or context menu)

```
if PTY for this tab is running:
    showConfirm('Close Tab', 'A terminal session is running in this tab. Close it anyway?')
        .then(proceed).catch(cancel)
if confirmed (or no PTY):
    terminate ALL PTY sessions for this tab (main, panel, any bg_*)
    dispose this tab's xterm
    remove tab from tabs_state.tabs
    if this was the active tab:
        if any tabs left: switch to the adjacent tab (next, else previous)
        else if isMain: switch view to full HTML landing (tab still exists, just its PTY is gone)
        else: app would be in an impossible state (no tabs, non-main) — prevent by always
              keeping the main tab; in the unlikely event the main tab is being closed and
              no others exist, special-case below
    save tabs_state (debounced)
```

Main tab special cases (per user decision):

- **Close main tab + other tabs exist:** normal close, switch to adjacent tab.
- **Close main tab + it's the only tab:** kill the PTY, switch view to full HTML landing. The main tab remains in `tabs_state` (with `isMain: true`); it has no PTY. The "back" button on this state goes to the simplified landing (consistent with other tabs). The "X" button on the main tab itself is hidden in this state (no other tabs to switch to; closing would just bounce back to full landing).

### 4.8 Close Others (context menu)

```
if any other tab has running PTY:
    showConfirm('Close Other Tabs', 'One or more other tabs have running sessions. Close them anyway?')
        .then(proceed).catch(cancel)
if confirmed (or none running):
    for tab in tabs_state.tabs where tab != this:
        terminate ALL PTYs for that tab
        dispose its xterm
    keep only this tab in tabs_state
    save tabs_state (debounced)
```

### 4.9 Drag-reorder

- Mouse-based drag (mousedown on tab body, mousemove updates visual position, mouseup commits). Matches existing sidebar drag pattern in `sidebar.js`.
- During drag, the tab being dragged shows as a floating element; other tabs shift to make space.
- On mouseup, the new order is written to `tabs_state.tabs` (debounced 500 ms save).
- No backend involvement.

### 4.10 Settings UI

Add a new "Tabs" section to the settings page. Inject via the same pattern `sidebar.js` uses for the "Sidebar" tab in `setupSettingsTab()` (deferred via `setTimeout(setupSettingsTab, 500)` so the DOM is ready, then insert a `<button class="settings-tab">` into `.settings-tabs` and a `<div class="tab-panel">` into `.settings-content`).

Fields:
- `tabBarEnabled` — toggle switch. Default `true`. Warning tooltip: "Disabling hides the tab bar and reverts to single-tab mode. Your tabs are saved and will be restored if you re-enable."
- `tabBarPosition` — segmented control: `Top` / `Bottom`. Default `Bottom`.

Both write to `tabs_state` via `set_config` and update the DOM immediately.

### 4.11 Profile switch (per tab)

- The simplified landing's profile button opens the existing profile switcher modal.
- On switch, the active tab's `profile` field is updated in `tabs_state`. The `AppConfig.switch_profile` call is **not** invoked — profiles are per-tab now.
- The UI (background, theme, shortcut hints) re-renders from the new profile's config.
- Switching tabs shows the new active tab's profile, which may differ from the previously active tab's profile.

### 4.12 History activities

Append (per session) two new activity entries when a tab is opened or closed. Implementation can use the existing `HistoryManager::record_activity` (or equivalent) — no new Tauri command required; if the API doesn't exist, log a JSON line via the existing logger.

---

## 5. UI structure

### 5.1 New DOM elements

```html
<!-- Inside <body>, as a top-level child after #custom-titlebar and #bg-overlay -->
<div id="tab-bar" class="tab-bar tab-bar-bottom">
    <div class="tab-bar-tabs" id="tab-bar-tabs">
        <!-- Tab chips rendered by TabManager.renderTabs() -->
        <button class="tab-chip active" data-tab-id="...">
            <span class="tab-chip-label">Default</span>
            <button class="tab-chip-close" data-tab-id="...">×</button>
        </button>
        <button class="tab-chip-add" id="tab-add-btn" data-tooltip="New Tab">+</button>
    </div>
</div>

<!-- Inside #terminal-view, sibling to the existing .xterm container -->
<div id="simplified-landing" class="simplified-landing hidden">
    <!-- Rendered by simplified-landing.js -->
</div>
```

### 5.2 Tab chip markup (rendered by TabManager)

```html
<div class="tab-chip {{isActive ? 'active' : ''}} {{isMain ? 'is-main' : ''}}"
     data-tab-id="{{id}}"
     draggable="true">
    <span class="tab-chip-profile">{{profile}}</span>
    {{#if isMain}}<span class="tab-chip-main-badge" data-tooltip="Main tab">●</span>{{/if}}
    <button class="tab-chip-close" data-tab-id="{{id}}" data-tooltip="Close">×</button>
</div>
```

If profile is empty/falsy, fall back to truncated startup command from the profile's config (max 16 chars + ellipsis).

### 5.3 Tab bar position

`#tab-bar` is a **top-level** child of `<body>`, sibling of `#custom-titlebar`, `#bg-overlay`, `#landing`, `#settings-page`, `#terminal-view`. The tab bar is always visible (when `tabBarEnabled` is true and there is at least one tab) regardless of which view the active tab is showing.

The full HTML landing page (`#landing`) and the terminal view (`#terminal-view`) both share the viewport with the tab bar. CSS reserves space for the tab bar via padding-bottom (or padding-top) on the body.

When `tabBarPosition === "bottom"` (default), the tab bar is `position: fixed; bottom: 0; left: 0; right: 0;` and the body has `padding-bottom: 44px`. When `"top"`, the tab bar sits between `#custom-titlebar` and the content, and the body has `padding-top: 44px`.

When `tabBarEnabled === false`, the tab bar is `display: none`, the body padding is removed, and the app runs in legacy single-tab mode.

### 5.4 Right-click context menu

A single floating `<div class="tab-context-menu">` with two items:

- `Close` — triggers the same flow as the X button.
- `Close Others` — triggers §4.8.

The menu is positioned at click coords, dismissed on outside-click or Escape.

---

## 6. Component structure

### 6.1 New files

| File | Purpose |
|---|---|
| `frontend/tabs.js` | `window.TabManager` IIFE: state, persistence, switch, create, close, drag, context menu, +1 button. |
| `frontend/tabs.test.cjs` | `node --test` tests for `TabManager` (state transitions, persistence, restore). |
| `frontend/simplified-landing.js` | Renders the simplified landing inside `#terminal-view` for the active tab. |

### 6.2 Modified files

| File | Change |
|---|---|
| `src-tauri/src/pty.rs` | **No changes** — already keyed by string session ID. |
| `src-tauri/src/commands.rs` | `start_terminal` `is_panel` check (line 359, `let is_panel = session_id == "panel";`) is a hardcoded match for the legacy `'panel'` session. The new design's panel session ID is `${tabId}_panel`, so this check must change to a prefix or pattern match (e.g. `session_id.ends_with("_panel")`). One-line fix. `terminate_terminal` (line 619-628) hard-codes `if sid == "main"` to call `history.session_end()` and also kill the legacy `'panel'` session. With composite keys, the new design must call `history.session_end()` from the frontend when the last tab is closed (and not assume killing `${tabId}_main` triggers it). One-line frontend addition. |
| `src-tauri/src/config.rs` | **One-line addition:** add `"tabs_state"` to `global_keys()` (around line 63-70) so `tabs_state` is always written to `config.json` regardless of `active_profile`. Otherwise the value would land in the per-profile JSON file, which is not what the design intends. |
| `src-tauri/src/lib.rs` | **No changes** — `CloseRequested` already calls `pty.terminate_all()` which kills all `${tabId}_*` sessions. `HistoryManager::session_end()` is also called there; if the last tab close must trigger this from JS, a small Rust addition may be needed (one new command, e.g. `end_history_session`). |
| `frontend/index.html` | Add `<div id="tab-bar">` as a top-level child of `<body>`. Add `<div id="simplified-landing">` inside `#terminal-view`. Add `<script src="tabs.js?v=N">` and `<script src="simplified-landing.js?v=N">` after `app.js` in the load order. Bump `?v=N` for any changed file. |
| `frontend/app.js` | Refactor terminal lifecycle: replace module-level `term`, `fitAddon`, `_sessionGeneration`, `_skipNextEof`, `_terminalRunning` with per-tab maps in `TabManager`. `initTerminal(dir)` becomes `TabManager.initTabTerminal(tabId, dir)`. `showTerminal`/`backToLanding` delegate to TabManager. `restartSession` accepts `tabId`. |
| `frontend/sidebar.js` | Panel session ID becomes `${activeTabId}_panel` (was hardcoded `'panel'`). `executeBackground` button uses `${activeTabId}_bg_${buttonId}`. Settings tab injection adds a "Tabs" section. |
| `frontend/tauri-bridge.js` | **No new invoke commands needed.** All tab operations go through existing `set_config({ key: 'tabs_state' })` / `get_config({ key: 'tabs_state' })` and the existing per-session-id PTY commands. The existing `setupPtyListener` routes by `payload.sessionId`, which now just contains the composite key. |
| `frontend/style.css` | Add tab bar styles (~150 lines), simplified landing styles (~100 lines), tab context menu styles (~30 lines). All using existing CSS custom properties (CTA theme tokens). |
| `frontend/app.renderer-policy.test.cjs` | Update mock to include `TabManager` and `simplifiedLanding` (they're window globals like `SidebarManager`). |

### 6.3 Data flow summary

```
User clicks tab
    → TabManager.switchTo(tabId)
    → hide current xterm, show new xterm
    → update profile-driven UI (background, theme)
    → save tabs_state (debounced)

User clicks +
    → TabManager.createTab({ cloneProfileFrom: activeTab.id })
    → append to tabs, set active
    → render new tab chip
    → show simplified-landing in terminal-view
    → save tabs_state (debounced)

User clicks X on tab
    → confirm if PTY running
    → TabManager.closeTab(tabId)
    → terminate all ${tabId}_* PTYs
    → dispose xterm
    → remove from tabs
    → switch to adjacent
    → save tabs_state (debounced)

User clicks "Choose Project Directory" in simplified-landing
    → window.monolithApi.native_pick_directory()
    → window.monolithApi.save_last_directory(path)
    → TabManager.initTabTerminal(activeTabId, path)
    → spawn PTY with sessionId = `${activeTabId}_main`
    → swap simplified-landing for xterm

Window close
    → lib.rs CloseRequested: pty.terminate_all()  // kills all ${tabId}_*
    → AppConfig already persists tabs_state on every change (debounced)
```

---

## 7. Edge cases

| Case | Handling |
|---|---|
| `tabs_state` corrupted on load (invalid JSON, missing fields) | Log warning, fall back to fresh main tab with `Default` profile. Don't crash. |
| Profile deleted while a tab uses it | Tab falls back to `"Default"` in-memory; show toast: "Profile '{name}' was deleted; this tab now uses Default." |
| Tab bar toggled off in settings | Existing `tabs_state` is preserved verbatim. App runs in legacy single-tab mode: `tabs_state` is **not** read or written. The DOM tab bar is hidden. |
| Tab bar toggled back on | Read existing `tabs_state` (or create fresh main tab if absent). Render bar. |
| Drag tab to position 0 (over main tab) | Allowed. Main tab can be at any index. `isMain` is a property of the tab, not its position. |
| Right-click "Close Others" when current tab is the only one | Menu item is disabled / no-op. |
| `crypto.randomUUID()` not available (very old WebView) | Fallback: `Date.now().toString(36) + Math.random().toString(36).slice(2)`. Sufficient for uniqueness. |
| App close with multiple tabs | Existing `terminate_all` already iterates and kills every session. All `${tabId}_*` PTYs die. |
| App crash | Lose up to 500 ms of tab-state changes. Acceptable. |
| Window state save during fast resize | Existing 500 ms debounce on `window_x/y/width/height` — unchanged. Tab state uses the same debouncer. |
| PTY session_id starts with `${tabId}_` but tab no longer exists | `PtyManager` doesn't care; it just holds a string→session map. Stale entries die on next `terminate_all` at app close. |
| User opens 50+ tabs | Soft cap at 16, matching the existing limit in `sidebar.js` and the prior design. The `+` button hides at 16 tabs. |
| Tab bar position is "top" + custom titlebar is enabled | Tab bar renders below the custom titlebar. Order: titlebar → tab bar → content. |
| Tab bar position is "top" + custom titlebar is disabled | Tab bar is the top chrome. OS provides the titlebar above. |
| Tab bar position is "bottom" (default) | Tab bar at the bottom of `#terminal-view` only. Not visible on the full HTML landing. |

---

## 8. Testing

### 8.1 Rust (no new tests)

No Rust changes. The existing 6 tests in `config.rs` cover config I/O. `cargo test` should still pass.

### 8.2 Frontend

Add `frontend/tabs.test.cjs` with `node --test`:

1. `createTab` appends a new tab with a UUID, `isMain: false`, profile cloned from active.
2. `closeTab` removes the tab, switches to adjacent, kills PTY calls.
3. `closeTab` on the only main tab preserves the tab in `tabs[]` but kills its PTY.
4. `reorderTabs` updates `tabs[]` order without changing other fields.
5. `setActiveTab` updates `activeTabId` and emits a switch event.
6. `setTabProfile(tabId, profile)` updates only that tab's profile.
7. `restoreFromConfig` reads `tabs_state` and rehydrates the manager.
8. `saveToConfig` debounces writes (asserts that two rapid calls produce one config write).
9. Context menu "Close Others" removes all but the current tab and terminates their PTYs.
10. Tab bar position + enabled flag round-trip through config.

Update `frontend/app.renderer-policy.test.cjs` to mock `window.TabManager` and `window.simplifiedLanding` (similar to how `window.SidebarManager` is mocked today).

### 8.3 Manual QA checklist

- Launch with no saved state: 1 main tab, full landing.
- Click `+`: 2 tabs, second is parallel (cloned profile, no PTY, simplified landing).
- Open a dir in tab 2: terminal launches, simplified landing replaced.
- Click tab 1: tab 1's UI is shown (still on full landing if no PTY, or terminal if PTY was open).
- Drag tab 2 to position 0: reorders; main tab can now be at position 1.
- Close tab 1 (main): if tab 2 exists, switch to tab 2; if not, fall back to full landing.
- Close tab with running PTY: confirm modal appears; on confirm, PTY dies, tab removed.
- Right-click "Close Others": confirm if any other PTY running, then close.
- Toggle tab bar off in settings: bar hidden, legacy mode.
- Toggle tab bar on: previous tabs restored from `tabs_state`.
- Move tab bar to top: DOM order updates immediately, `tabs_state.tabBarPosition` persisted.
- Kill app mid-session (alt+F4): on relaunch, tabs restored with last `activeTabId`.

---

## 9. Out-of-scope (deferred)

- Per-tab background/theme override.
- Per-tab active directory.
- Per-tab secondary commands as sub-views.
- Tab rename, color labels, pin, groups, splits, tear-off windows.
- Scrollback persistence across PTY restarts.
- Per-tab keyboard shortcut overrides.
- Tab group drag-out to new window.
- Tab bar overflow menu (when 16+ tabs, show dropdown).

These are intentionally excluded to keep v1 focused on the core multi-tab experience. Each can be added later without rearchitecting, because the data model already accommodates extensions (`tabs[i].foo` fields are forward-compatible).
