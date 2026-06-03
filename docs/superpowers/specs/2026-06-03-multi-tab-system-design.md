# Monoloth Multi-Tab System — Design Spec

**Date:** 2026-06-03
**Status:** Council-reviewed, 52 findings applied inline
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

**Non-goals (v1):**

- Per-tab background/theme override (always derived from active tab's profile → global background config).
- Per-tab active directory persistence (every tab shares the global `last_directory`; recent dirs list is global).
- Per-tab secondary commands as sub-views.
- Tab rename, color labels, pin, groups, splits, tear-off windows.
- Scrollback persistence across PTY restarts.

**Refactor scope (honest accounting):** the implementation is a deep refactor of `app.js`'s terminal state management. Module-level state (`term`, `fitAddon`, `_sessionGeneration`, `_skipNextEof`, `_terminalRunning`, `firstOutput`, `_exitTimer`, `_panelRunning`) must move into per-tab maps inside `TabManager`. `initTerminal`, `showTerminal`, `backToLanding`, `writeToTerm`, and the `MonolothApp` facade are rewritten to be tab-scoped. The design's "layered on top, not a rewrite" is an aspiration; the diff is large.

---

## 2. Architectural decision summary

| Decision | Choice | Why |
|---|---|---|
| Tab data ownership | Frontend `TabManager` (in-memory + JSON in config) | No Rust TabsManager needed; `AppConfig` already persists arbitrary JSON via `set_config`/`get_config` |
| Persisted shape | New global key `tabs_state` (single object), registered in `global_keys()` | Matches existing `global_keys()` extension pattern; one atomic write per change; must be global so it survives profile switches |
| Tab ID | UUID v4 (frontend-generated via `crypto.randomUUID()`) | Stable across reorder/rename; no collision risk; contains no underscores so `__` separator is safe |
| PTY session ID separator | Double underscore `__` | Matches existing AGENTS.md convention for separator; prevents `_bg_panel` collision with `_panel` suffix check |
| PTY session ID shape | `${tabId}__main`, `${tabId}__panel`, `${tabId}__bg__${buttonId}` | Existing `PtyManager` is a `HashMap<String, PtySession>` keyed by string — composite keys work as-is |
| Session ID length cap | Truncate/hash `buttonId` to ensure total session ID ≤ 64 chars | `validate_session_id` rejects > 64 chars; UUID v4 alone is 36 chars, so `buttonId` must be ≤ 22 chars (after `__bg__` = 6 chars) |
| `is_panel` detection | `session_id == "panel" \|\| session_id.endsWith("__panel")` | Covers legacy `'panel'` and composite `${tabId}__panel` without false-positives on `${tabId}__bg_panel` |
| `is_main` / `is_bg` detection | Suffix + delimiter check: `endsWith("__main") && !contains("__bg__")` | Same delimiter-aware logic |
| Xterm DOM strategy | One `<div class="terminal-instance" data-tab-id="...">` per tab inside `#terminal-view`; show the active tab's div with `display: block`, others with `display: none` | Multiple xterm instances exist simultaneously; only one is visible; switching tabs toggles visibility then `requestAnimationFrame → fitAddon.fit()` |
| Xterm instance lifecycle | Created lazily on terminal launch, disposed on tab close; stays mounted when tab is in background | Inactive tabs in simplified-landing state have no xterm at all (saves memory); inactive tabs with running PTY keep their xterm hidden via `display: none` |
| Main tab | Exactly one tab per `tabs_state` has `isMain: true`; always exists; on close of main+others-exist, promote an adjacent tab to `isMain: true` | Per user decision; structurally one tab, visually identical to others; invariant must be enforced on load and on close |
| Tab bar disabled | Legacy mode: no `tabs_state` written, app behaves exactly as today | Per user decision: backwards compat is paramount |
| New tab defaults | Clones active tab's profile; no PTY running | Per user decision; feels natural |
| Directory state | Global `last_directory` only; no per-tab dir stored | Per user decision; recent dirs list is the single source of truth |
| Session restore | Debounced 500 ms on every change + final save on window close (via `beforeunload` flush) | Matches existing window state save pattern; flush on close prevents data loss |
| Window title | Static `"Monoloth"` (unchanged) | Per user decision |
| Close confirmation | Reuse existing `showConfirm` pattern (same modal as app close / return button) | Per user decision |
| Visual style | Match OS chrome, 40-44 px, rounded tabs, CTA-themed background; horizontal scroll on overflow | Per user decision: matches sidebar/cmd panel/custom titlebar; 16 tabs may exceed viewport on 1366px |
| History scope | Single global history session, tabs are activities within; `session_start` is idempotent | Per user decision; multiple panel spawns must not create overlapping sessions |
| Settings tab injection | Persistent `MutationObserver` on `#settings-page` (per AGENTS.md gotcha) | The settings dialog is destroyed+recreated on each open; one-shot `setTimeout` injection would vanish |
| Required Rust changes | (a) `tabs_state` + `sidebar_config` in `global_keys()`; (b) `is_panel` suffix check; (c) new `end_history_session` command; (d) new `record_history_activity` command; (e) new `terminate_tab_sessions(tab_id)` command; (f) `start_terminal` accepts optional `profile` param | Per-tab profiles require profile resolution at spawn time, not from global state |
| Per-tab profile resolution | Frontend passes `profile` to `start_terminal`; Rust resolves startup_command, run_before_command, shell from that profile; `AppConfig::switch_profile` is NOT called on tab switch | Backend reads must work for a profile that isn't the global active one |
| Race condition mitigation | All async terminal-init closures capture the originating `tabId`; resolves only update that tab's state | Rapid tab switches must not bleed state between tabs |
| Read thread leak on tab close | `PtyManager::terminate` adds an `Arc<AtomicBool>` cancellation token per session; `read_loop` checks it on every iteration | Dropping `JoinHandle` orphans the thread until grandchild closes the pipe; with transient tabs this is a long-running leak |
| Map cleanup on tab close | Delete per-tab entries from `_sessionGeneration`, `_skipNextEof`, `firstOutput`, `_exitTimer`, `set` of tracked session IDs | Maps grow unboundedly otherwise |

---

## 3. Data model

### 3.1 Persisted config (new global key)

`tabs_state` and `sidebar_config` must both be added to `AppConfig::global_keys()` in `src-tauri/src/config.rs` (lines 63-70). Without this, `set_config` routes the value into the active profile's JSON file when `active_profile != "Default"`. `tabs_state` is global by design and must always land in `config.json`.

```json
{
  "tabs_state": {
    "version": 1,
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

- `version` — integer, currently `1`. Future schema changes bump this and add a migration step.
- `tabs[]` — ordered list. Order = display order.
- `id` — UUID v4 string (alphanumeric + hyphens, no underscores). Stable for the life of the tab; new on each `createTab`. Future ID schemes must preserve the "no underscores" invariant.
- `isMain` — invariant: exactly one tab has `isMain: true`. Enforced on load (normalize: if zero or more than one, set `tabs[0].isMain = true` and clear the rest). Preserved across reorders and profile switches. Transferred to an adjacent tab when the main tab is closed and other tabs exist.
- `profile` — profile name (string). Per-tab; not synced to global `active_profile`.
- `activeTabId` — UUID of the currently focused tab. Must reference a tab in `tabs[]`. Persisted so restoration lands on the right tab.
- `tabBarPosition` — `"top" | "bottom"`. Default `"bottom"`.
- `tabBarEnabled` — boolean. Default `true`. When `false`, the entire tab UI is hidden and the app runs in legacy single-tab mode; `tabs_state` is preserved so re-enabling restores the previous layout.

### 3.2 No per-tab directory

There is **no** `activeDirectory` field on a tab. The global `last_directory` is the single source of truth. The simplified landing's "Open Terminal in Last Directory" button is labeled to reflect this honestly.

### 3.3 PTY session ID convention

Composite keys against the existing `HashMap<String, PtySession>`:

- Main terminal of tab X: `${tabId}__main`
- CMD panel of tab X: `${tabId}__panel`
- Sidebar background button of tab X: `${tabId}__bg__${buttonId}`

The `__` (double underscore) separator is required:

1. It matches the existing AGENTS.md convention for separator.
2. It prevents collision between `${tabId}__bg_panel` (button named "panel") and `${tabId}__panel` (panel session). With single `_`, `endsWith("_panel")` would match both.
3. UUID v4 contains only hex + hyphens, so the separator is safe.

**Length cap:** `validate_session_id()` (commands.rs) rejects IDs > 64 characters. UUID v4 is 36 chars; `${tabId}__bg__${buttonId}` is `36 + 6 + len(buttonId)`. If `buttonId` > 22 chars, the ID is rejected. Mitigation: hash `buttonId` to a fixed-length string (e.g., `buttonId.slice(0, 22)` or a short hash), or document the limit and validate in JS before sending.

`PtyManager::terminate_all()` already iterates and kills every session. For tab close, the frontend uses a new `terminate_tab_sessions(tab_id)` command (see §4.7) which iterates all session IDs registered for that tab and terminates them individually.

**Read thread cancellation:** `PtySession` gains an `Arc<AtomicBool>` cancellation token. `PtyManager::terminate(session_id)` flips the token before removing the entry. `read_loop` checks the token at the top of each iteration; on cancel, it exits without waiting for pipe EOF. This fixes the long-running thread leak that occurs when tab close orphans a thread waiting on a grandchild process's pipe.

### 3.4 History scope

Single global `HistoryManager`, one session per app run. Tab open/close is logged as an `activity` entry. This requires a new Tauri command `record_history_activity(activity_type, payload)` exposed to the frontend (see §6.2 Rust changes). `HistoryManager::session_start` must be made idempotent: if a session is already active, it is a no-op (rather than overwriting). The current `start_terminal` panel branch's call to `session_start` will then safely no-op for every additional panel spawn.

---

## 4. Behaviors

### 4.1 App launch

```
read tabs_state from config
if tabs_state missing OR tabs_state.tabBarEnabled === false:
    run legacy single-tab mode
    do NOT write tabs_state
    return

# tab mode, tabs_state present and enabled
if tabs_state.tabs.length === 0:
    treat as fresh install: create a main tab, write tabs_state

validate tabs_state:
    - exactly one tab has isMain: true
        if 0: set tabs[0].isMain = true
        if 2+: keep first, clear others
    - activeTabId references an existing tab; if not, use tabs[0].id

restore tabs in saved order
set active tab to config.tabs_state.activeTabId (fallback: first tab)
spawn NO PTYs (terminals launch lazily)
show full HTML landing (existing #landing div) on the main tab
show simplified landing on every other tab inside its terminal-view
```

On a fresh install with no `tabs_state`, the default `tabBarEnabled: true` means we enter tab mode with a single main tab — we do NOT default to legacy mode. Legacy mode is opt-in via the settings toggle.

### 4.2 First-run with tab bar enabled (no saved state)

```
create one main tab:
    id = crypto.randomUUID()
    isMain = true
    profile = AppConfig.get("active_profile")  // existing global key
write tabs_state with version: 1
```

No PTY spawned. Show full HTML landing on the main tab.

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

Parallel tabs **always** show the simplified landing (not the full HTML landing). This is consistent with how the tab is created mid-session; the full HTML landing is reserved for the main tab.

### 4.4 Switch active tab

```
save current scrollback? — NO (PTY stays alive in background; xterm buffer preserved)
hide current tab's terminal-instance div, show target tab's div via display toggle
update active tab indicator in the tab bar
update body class / background / theme to reflect new active tab's profile
    (re-run loadBackgroundConfig + setProfileUI)
re-register keyboard shortcuts from the new active tab's profile
    (unregister old handlers, register new ones per profile.shortcuts)
    — this is required because shortcuts are global but profiles are per-tab
requestAnimationFrame(() => {
    fitAddon.fit() on the now-visible xterm
    term.refresh(0, term.rows - 1)
    monolithApi.resize_terminal(sessionId, term.cols, term.rows)
})
refit any sidebar custom-button terminal for the new active tab
save tabs_state (debounced) — activeTabId changed
```

All async closures during terminal init (e.g., the `start_terminal` promise resolution) capture the originating `tabId` and only update that tab's state. This prevents rapid tab switches from bleeding state.

### 4.5 Launch terminal in a tab (from simplified landing)

```
read global last_directory (or pick new one via monolithApi.pick_directory)
update global last_directory
spawn PTY:
    session_id = `${tabId}__main`
    profile = active tab's profile name
    command = profile.startup_command
    args, cwd, cols, rows
TabManager.initTabTerminal(tabId, dir):
    creates xterm per tab (lazy) inside tab's div.terminal-instance
    disposes previous tab's xterm only if that tab is in non-running state
swap simplified-landing for the xterm terminal-instance div
```

The Rust `start_terminal` command is updated to accept `profile: Option<String>`. When the Rust side spawns the PTY, it resolves `startup_command`, `run_before_command`, and shell from the supplied profile (via a new `AppConfig::get_for_profile(name, key)` helper) rather than from the global `active_profile`. This makes per-tab profile resolution work end-to-end.

### 4.6 Back from terminal → simplified landing

Triggered by clicking `terminal-back-btn` or pressing the existing back shortcut. The button lives in the active tab's terminal-instance div; `backToLanding(tabId)` is delegated from the global handler to `TabManager.handleBack(tabId)`.

```
if PTY for active tab is running:
    showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
        .then(proceed).catch(cancel)
if confirmed (or no PTY):
    terminate_terminal(`${tabId}__main`)
    dispose active tab's xterm
    render simplified-landing HTML in tab's div.terminal-instance
    set current view = 'simplified-landing'
```

The simplified landing is an HTML overlay, not an xterm render. It contains:

- Active tab's profile name (with switch button — see §4.11)
- "Choose Project Directory" primary button (calls `monolithApi.pick_directory` — there is no `native_pick_directory` in the existing bridge)
- Recent directories list (reads global `last_directory` plus any persisted recent list)
- "Open Terminal in Last Directory" button (label reflects that it uses the global `last_directory`, which may differ from "this tab's directory" — see §3.2). Tooltip: "Uses the last directory opened in any tab."
- Keyboard shortcut hints (`Ctrl+P`, `Ctrl+,`)

### 4.7 Close tab (X button or context menu)

The frontend tracks per-tab session IDs in a `Map<tabId, Set<sessionId>>` (e.g., `TabManager._sessionsByTab`). The `+` button adds an entry on create; terminate calls remove from the set; the set is used by the new `terminate_tab_sessions(tab_id)` Rust command.

```
if PTY for this tab is running:
    showConfirm('Close Tab', 'A terminal session is running in this tab. Close it anyway?')
        .then(proceed).catch(cancel)
if confirmed (or no PTY):
    # pseudocode
    if tabs.length === 1 and isMain:
        # only main tab
        terminate_terminal(`${tabId}__main`)
        dispose xterm
        clear per-tab maps (firstOutput, _exitTimer, _sessionGeneration, _skipNextEof)
        remove session IDs from _sessionsByTab
        switch view to full HTML landing
        do NOT remove tab from tabs_state.tabs
        save tabs_state (debounced)
        return

    # tabs.length >= 2 OR non-main tab
    terminate_tab_sessions(tabId)   # new Rust command: kills all ${tabId}__* PTYs
    dispose this tab's xterm
    clear per-tab maps
    remove session IDs from _sessionsByTab
    if isMain:
        # promote an adjacent tab to main
        idx = tabs.findIndex(t => t.id === tabId)
        newMain = tabs[idx + 1] || tabs[idx - 1]
        newMain.isMain = true
    remove tab from tabs_state.tabs
    if this was the active tab:
        if any tabs left: switch to adjacent (next, else previous; if that was just removed, use its replacement)
        # tabs.length >= 2 here so the only-main branch above doesn't apply
    save tabs_state (debounced)
```

Main tab special cases:

- **Close main tab + other tabs exist:** normal close, promote an adjacent tab to `isMain: true`, switch to it.
- **Close main tab + it's the only tab:** kill the PTY, switch view to full HTML landing. The main tab remains in `tabs_state` (with `isMain: true`); it has no PTY. The X button on the main tab is hidden in this state.

### 4.8 Close Others (context menu)

```
if this tab is the main tab:
    # close all other (non-main) tabs
    if any non-main tab has running PTY:
        showConfirm('Close Other Tabs', ...)
            .then(proceed).catch(cancel)
    if confirmed (or none running):
        for tab in tabs where tab.id !== this.id:
            terminate_tab_sessions(tab.id)
            dispose its xterm
            clear per-tab maps
            remove session IDs from _sessionsByTab
        keep this (main) tab in tabs_state
        save tabs_state (debounced)
else:
    # this is a non-main tab: keep this AND the main tab
    if any other tab (excluding this and main) has running PTY:
        showConfirm('Close Other Tabs', ...)
            .then(proceed).catch(cancel)
    if confirmed (or none running):
        for tab in tabs where tab.id !== this.id and tab.id !== mainTab.id:
            terminate_tab_sessions(tab.id)
            dispose its xterm
            clear per-tab maps
            remove session IDs from _sessionsByTab
        remove non-kept tabs from tabs_state.tabs
        save tabs_state (debounced)
```

The main tab is never destroyed by "Close Others" — the invariant "exactly one isMain" is preserved.

### 4.9 Drag-reorder

- Mouse-based drag (`mousedown` on chip body, `mousemove` updates visual position, `mouseup` commits). Matches the existing sidebar drag pattern in `sidebar.js`. NOT HTML5 drag-and-drop — WebView2 DnD is unreliable per AGENTS.md.
- The chip's `mousedown` handler ignores events whose `e.target` is the X button or the main badge.
- The X button's `mousedown` and `click` handlers call `e.stopPropagation()` to prevent triggering the chip's switch handler.
- During drag, the dragged chip is a floating element; other chips shift to make space.
- On `mouseup`, the new order is written to `tabs_state.tabs` (debounced 500 ms save).

### 4.10 Settings UI

Add a new "Tabs" section to the settings page. Inject via a **persistent `MutationObserver`** watching `.settings-tabs` and `.settings-content` for child additions. When the appearance tab's neighbor is observed, insert the Tabs tab button and its panel if not already present. This pattern is required because the settings dialog is destroyed and recreated on each open; a one-time `setTimeout` injection would vanish.

Fields:
- `tabBarEnabled` — toggle switch. Default `true`. Warning tooltip: "Disabling hides the tab bar and reverts to single-tab mode. Your tabs are saved and will be restored if you re-enable."
- `tabBarPosition` — segmented control: `Top` / `Bottom`. Default `Bottom`.

**Toggle behavior:**
- When `tabBarEnabled` is flipped to `false`:
  - The DOM tab bar is hidden.
  - All non-active tab PTYs are terminated (via `terminate_tab_sessions` for each non-active tab). This prevents leaking PTYs in legacy mode.
  - The active tab's main PTY is also terminated (or left running if the user wants — the design default is to terminate all and let the user restart).
  - The `tabs_state` is preserved verbatim in `config.json`.
  - App runs in legacy single-tab mode (no `tabs_state` reads/writes from this point).
- When `tabBarEnabled` is flipped back to `true`:
  - Read existing `tabs_state` from `config.json`.
  - Restore all tabs in saved order. All non-active tabs start with no PTY and show the simplified landing. The active tab restores its PTY only if it had one running; otherwise it shows the full HTML landing (main) or simplified landing (parallel).

### 4.11 Profile switch (per tab)

The profile switcher modal in `app.js` is modified to accept an invocation context:

```js
function openProfileSwitcher(scope, tabId) {
    // scope: 'tab' | 'global'
    // tabId: required when scope === 'tab'
    renderProfileSwitcher();
    // ... click handler ...
    if (scope === 'tab') {
        TabManager.setTabProfile(tabId, name);  // updates tabs_state.tabs[i].profile
    } else {
        monolithApi.switch_profile(name);  // legacy: updates global active_profile
    }
}
```

The simplified landing's profile button calls `openProfileSwitcher('tab', activeTabId)`. The existing global settings uses `openProfileSwitcher('global')`.

`AppConfig.switch_profile` is NOT invoked on tab switch. Per-tab profile is read on tab activation from `tabs_state`, and used to resolve `startup_command` etc. when the tab's terminal spawns (passed as `profile` param to `start_terminal`; see §4.5).

### 4.12 History activities

Frontend calls a new Tauri command `record_history_activity({ activity_type, payload })` on tab open and tab close. `activity_type` is one of `"tab_open"`, `"tab_close"`. `payload` is a JSON object (e.g., `{ tabId, profile }`). The Rust side delegates to `HistoryManager::record_activity` (or equivalent) on the global session.

---

## 5. UI structure

### 5.1 New DOM elements

```html
<!-- Inside <body>, as a top-level child after #custom-titlebar and #bg-overlay -->
<div id="tab-bar" class="tab-bar tab-bar-bottom">
    <div class="tab-bar-tabs" id="tab-bar-tabs">
        <!-- Tab chips rendered by TabManager.renderTabs() -->
        <div class="tab-chip active" data-tab-id="...">
            <span class="tab-chip-label">Default</span>
            <span class="tab-chip-main-badge" data-tooltip="Main tab">●</span>
            <button class="tab-chip-close" data-tab-id="...">×</button>
        </div>
        <button class="tab-chip-add" id="tab-add-btn" data-tooltip="New Tab">+</button>
    </div>
</div>

<!-- Inside #terminal-view -->
<div class="terminal-instance" data-tab-id="...">
    <!-- xterm attaches here -->
</div>
<div class="terminal-instance" data-tab-id="...">
    <!-- xterm for second tab; hidden via display: none until active -->
</div>
<div id="simplified-landing" class="simplified-landing hidden" data-tab-id="...">
    <!-- Rendered by simplified-landing.js for the active parallel tab -->
</div>
```

The tab bar is a top-level child of `<body>`. Terminal instances are siblings inside `#terminal-view`; only the active one is `display: block`.

### 5.2 Tab chip markup (rendered by TabManager)

```html
<div class="tab-chip {{isActive ? 'active' : ''}} {{isMain ? 'is-main' : ''}}"
     data-tab-id="{{id}}">
    <span class="tab-chip-profile">{{profile}}</span>
    {{#if isMain}}<span class="tab-chip-main-badge" data-tooltip="Main tab">●</span>{{/if}}
    <button class="tab-chip-close" data-tab-id="{{id}}" data-tooltip="Close">×</button>
</div>
```

Notes:

- Outer element is a `<div>`, NOT a `<button>`. The X close button is a child `<button>`. This avoids nested buttons (invalid HTML).
- No `draggable="true"` attribute — drag uses raw mouse events per §4.9.
- The X button's `mousedown` and `click` handlers call `e.stopPropagation()` to prevent the chip's switch handler from firing.
- If profile is empty/falsy, fall back to truncated startup command from the profile's config (max 16 chars + ellipsis).

### 5.3 Tab bar position

`#tab-bar` is a **top-level** child of `<body>`, sibling of `#custom-titlebar`, `#bg-overlay`, `#landing`, `#settings-page`, `#terminal-view`. The tab bar is always visible (when `tabBarEnabled` is true and there is at least one tab) regardless of which view the active tab is showing.

When `tabBarPosition === "bottom"` (default), the tab bar is `position: fixed; bottom: 0; left: 0; right: 0;` and the body has `padding-bottom: 44px`. The terminal-instance divs use `height: calc(100vh - 44px)` (NOT `100%` or `100vh` directly) to account for the tab bar and not be hidden behind it. This is critical: xterm.js `fitAddon.fit()` measures the container's `offsetHeight`, and a container sized `100vh` under a fixed-position tab bar will render behind it.

When `"top"`, the tab bar sits between `#custom-titlebar` and the content, and the body has `padding-top: 44px`; terminal instances use `height: calc(100vh - 44px - titlebarHeight)`.

When `tabBarEnabled === false`, the tab bar is `display: none`, body padding is removed, and the app runs in legacy single-tab mode.

**Overflow handling:** `.tab-bar-tabs` has `overflow-x: auto; flex-wrap: nowrap;` and the `+` button is sticky to the right edge. With 16 tabs at ~100 px each, this fits a 1600 px viewport; on smaller viewports the user scrolls horizontally to reach the `+` button.

### 5.4 Right-click context menu

A single floating `<div class="tab-context-menu">` with two items:

- `Close` — triggers §4.7.
- `Close Others` — triggers §4.8.

Positioned at click coords, dismissed on outside-click or Escape.

---

## 6. Component structure

### 6.1 New files

| File | Purpose |
|---|---|
| `frontend/tabs.js` | `window.TabManager` IIFE: state, persistence, switch, create, close, drag, context menu, +1 button, per-tab DOM management, race-safe closures. |
| `frontend/tabs.test.cjs` | `node --test` tests for `TabManager` (state transitions, persistence, restore, isMain invariant, map cleanup, race-safety). |
| `frontend/simplified-landing.js` | Renders the simplified landing inside the active tab's terminal-instance. |

### 6.2 Modified files

| File | Change |
|---|---|
| `src-tauri/src/config.rs` | (a) Add `"tabs_state"` to `global_keys()` (line 63-70). (b) Add `"sidebar_config"` to `global_keys()` (fixes existing per-profile routing bug; the design does not replicate this bug). (c) Add `AppConfig::get_for_profile(name, key) -> Value` helper to resolve a key against a specific profile's JSON (for per-tab `start_terminal` profile resolution). |
| `src-tauri/src/commands.rs` | (a) `start_terminal` accepts `profile: Option<String>` and resolves config from that profile via `get_for_profile`. (b) `start_terminal` `is_panel` check becomes `let is_panel = session_id == "panel" \|\| session_id.endsWith("__panel");`. (c) `terminate_terminal` is updated: if `sid == "main"` OR `sid.endsWith("__main")`, also call `pty.terminate(tabId-derived panel session id)` and call `history.session_end()` only on app close (remove the unconditional `session_end()` here). (d) New `end_history_session` command for the frontend to call when the last tab closes. (e) New `record_history_activity` command. (f) New `terminate_tab_sessions(tab_id: String)` command — iterates `Map<tabId, Set<sessionId>>` (kept in frontend) or uses a prefix match on `PtyManager.sessions` keys. (g) `HistoryManager::session_start` made idempotent (no-op if session already active). |
| `src-tauri/src/pty.rs` | (a) `PtySession` gains `Arc<AtomicBool>` cancellation token. (b) `read_loop` checks the token at the top of each iteration; on cancel, exits without waiting for pipe EOF. (c) `terminate(session_id)` flips the token before removing the entry. |
| `src-tauri/src/lib.rs` | Append 3 new commands to `generate_handler!`: `end_history_session`, `record_history_activity`, `terminate_tab_sessions`. |
| `frontend/index.html` | (a) Add `<div id="tab-bar">` as top-level child of `<body>`. (b) Add `simplified-landing` and `terminal-instance` containers inside `#terminal-view`. (c) Add `<script src="tabs.js?v=N">` BEFORE `app.js` (so `TabManager` is available when `app.js` parses), and `<script src="simplified-landing.js?v=N">` after `app.js`. (d) Bump `?v=N` for all changed files. |
| `frontend/app.js` | (a) Refactor terminal lifecycle: move `term`, `fitAddon`, `_sessionGeneration`, `_skipNextEof`, `_terminalRunning`, `firstOutput`, `_exitTimer`, `_panelRunning` into per-tab maps inside `TabManager`. (b) `initTerminal(dir)` becomes `TabManager.initTabTerminal(tabId, dir)` with `requestAnimationFrame → fitAddon.fit()` and `term.refresh(0, term.rows - 1)`. (c) `showTerminal`/`backToLanding` delegate to TabManager. `backToLanding(tabId)` terminates `${tabId}__main` and `${tabId}__panel`, not legacy IDs. (d) `writeToTerm` routes by suffix: `endsWith("__main")` for main, `endsWith("__panel")` for panel, `endsWith("__bg__")` for sidebar background. Add explicit handling for `_bg_` sessions (currently dropped). (e) `MonolothApp.restartSession(tabId)` accepts tabId. (f) `MonolothApp.refitTerminals()` refits only the active tab's xterm using `TabManager.activeTabId()`. (g) `setupPtyListener` default fallback: if `payload.sessionId` is missing, log warning and drop (do NOT default to `'main'`). (h) `api.start_opencode` and `api.terminate` are removed from `tauri-bridge.js`; `app.js` constructs composite session IDs directly via `TabManager`. (i) All async closures during terminal init capture the originating `tabId` and only update that tab's state. |
| `frontend/sidebar.js` | (a) Panel session ID becomes `${activeTabId}__panel` (was hardcoded `'panel'`). (b) `executeBackground` button uses `${activeTabId}__bg__${buttonId}` and registers the session ID in `TabManager._sessionsByTab`. (c) Settings tab injection: replace `setTimeout(setupSettingsTab, 500)` with a persistent `MutationObserver` on the settings container. Add a "Tabs" section using the same pattern. |
| `frontend/tauri-bridge.js` | (a) Remove `api.start_opencode` and `api.terminate` (replaced by composite-key direct calls). (b) `setupPtyListener` fallback: drop events with missing sessionId (no `'main'` default). (c) Add `api.end_history_session`, `api.record_history_activity`, `api.terminate_tab_sessions` wrappers for the new Tauri commands. (d) `api.pick_directory` (NOT `native_pick_directory`) is the existing bridge method; no change. |
| `frontend/style.css` | (a) Add tab bar styles (~150 lines), simplified landing styles (~100 lines), tab context menu styles (~30 lines). (b) `.tab-bar-tabs { overflow-x: auto; flex-wrap: nowrap; }` with sticky `+` button. (c) `.terminal-instance { height: calc(100vh - 44px); }` for default bottom tab bar position. (d) Add `body.tab-bar-top` variant for the top position. (e) All using existing CSS custom properties (CTA theme tokens). |
| `frontend/app.renderer-policy.test.cjs` | (a) Mock `window.TabManager` and `window.simplifiedLanding` as window globals. (b) Update the existing test to call `MonolothApp.restartSession(tabId)` with a known mocked tab ID (not the literal `'main'`). (c) Add a separate `frontend/tabs.test.cjs` for `TabManager` unit tests (recommended over cramming everything into the existing test). |

### 6.3 Data flow summary

```
User clicks tab
    -> TabManager.switchTo(tabId)
    -> hide current xterm div, show new xterm div
    -> update profile-driven UI (background, theme, shortcuts)
    -> requestAnimationFrame -> fitAddon.fit() on now-visible xterm
    -> save tabs_state (debounced)

User clicks +
    -> TabManager.createTab({ cloneProfileFrom: activeTab.id })
    -> append to tabs, set active
    -> register new tabId in _sessionsByTab
    -> render new tab chip
    -> show simplified-landing in active tab's terminal-instance
    -> record_history_activity("tab_open", { tabId, profile })
    -> save tabs_state (debounced)

User clicks X on tab
    -> confirm if PTY running
    -> TabManager.closeTab(tabId)
    -> terminate_tab_sessions(tabId) — kills all ${tabId}__* PTYs
    -> dispose xterm, clear per-tab maps, remove from _sessionsByTab
    -> if isMain && tabs.length >= 2: promote adjacent to isMain
    -> remove from tabs (except main-only case)
    -> switch to adjacent
    -> record_history_activity("tab_close", { tabId })
    -> save tabs_state (debounced)

User clicks "Choose Project Directory" in simplified-landing
    -> monolithApi.pick_directory() (existing bridge method)
    -> monolithApi.save_last_directory(path)
    -> TabManager.initTabTerminal(activeTabId, path)
    -> spawn PTY with sessionId = `${activeTabId}__main` and profile param
    -> swap simplified-landing for xterm inside tab's div.terminal-instance

User switches active tab profile
    -> openProfileSwitcher('tab', activeTabId)
    -> TabManager.setTabProfile(tabId, name)
    -> update tabs_state.tabs[i].profile
    -> re-render tab chip label
    -> re-apply background/theme if active tab changed profile
    -> save tabs_state (debounced)

Window close
    -> beforeunload: cancel debounce timer, call monolithApi.set_config('tabs_state', currentState) synchronously
    -> lib.rs CloseRequested: history.session_end(); pty.terminate_all()
```

---

## 7. Edge cases

| Case | Handling |
|---|---|
| `tabs_state` corrupted on load (invalid JSON) | Log warning, fall back to fresh main tab with `Default` profile. Don't crash. |
| `tabs_state.tabs` empty | Treat as fresh install: create a main tab. |
| `isMain` invariant violated on load (0 or 2+ tabs marked) | Normalize: set `tabs[0].isMain = true`, clear the rest. |
| `activeTabId` references a non-existent tab | Fall back to `tabs[0].id`. |
| `tabs_state.version` > 1 in a future build | Migration step reads version, transforms old shape, bumps version. |
| Profile deleted while a tab uses it | Tab falls back to `"Default"` in-memory; show toast: "Profile '{name}' was deleted; this tab now uses Default." |
| `crypto.randomUUID()` not available | Fallback: `Date.now().toString(36) + Math.random().toString(36).slice(2)`. Result is alphanumeric only (no underscores), safe for `__` separator. |
| Tab bar toggled off in settings | All non-active tab PTYs terminated via `terminate_tab_sessions`; active tab's main PTY also terminated. `tabs_state` preserved verbatim. DOM tab bar hidden. Legacy mode begins. |
| Tab bar toggled back on | Read `tabs_state`, restore all tabs. Non-active tabs start with no PTY (simplified landing). Active tab restores its PTY if it had one running, else shows full HTML landing (main) or simplified landing (parallel). |
| `buttonId` contains characters that would push sessionId > 64 chars | Hash/truncate `buttonId` to ≤ 22 chars in JS before constructing the session ID. |
| Drag tab to position 0 (over main tab) | Allowed. `isMain` is a property of the tab, not its position. |
| Right-click "Close Others" on main tab | Closes all other (non-main) tabs. Main tab is preserved. |
| Right-click "Close Others" on a non-main tab | Closes all other tabs EXCEPT the current tab AND the main tab. The main tab is never destroyed by "Close Others". |
| App close with multiple tabs | `beforeunload` flushes `tabs_state` synchronously; `lib.rs CloseRequested` calls `history.session_end()` and `pty.terminate_all()`. |
| App crash | Lose up to 500 ms of tab-state changes. Acceptable. |
| Rapid tab switching during async terminal init | All async closures capture the originating `tabId`; resolution updates only that tab's state. |
| `_bg_panel` button ID collision with `_panel` suffix check | Double underscore separator prevents collision: `${tabId}__bg_panel` ends with `_bg_panel`, NOT `__panel`. |
| PTY read thread leak on tab close | `PtySession` cancellation token flipped in `terminate`; `read_loop` checks token on each iteration. |
| Per-tab maps grow unboundedly | On tab close, delete per-tab entries from `_sessionGeneration`, `_skipNextEof`, `firstOutput`, `_exitTimer`, `_sessionsByTab`. |
| User opens 50+ tabs | Soft cap at 16. The `+` button hides at 16 tabs. |
| Tab bar overflow on 1366×768 viewport | `.tab-bar-tabs` has `overflow-x: auto; flex-wrap: nowrap;` with sticky `+` button. User scrolls horizontally. |
| Tab bar position is "top" + custom titlebar is enabled | Tab bar renders below the custom titlebar. Order: titlebar → tab bar → content. |
| Tab bar position is "top" + custom titlebar is disabled | Tab bar is the top chrome. OS provides the titlebar above. |
| Tab bar position is "bottom" (default) | Tab bar at the bottom of viewport, always visible (full HTML landing and terminal view both share viewport with the bar). |
| xterm render behind fixed tab bar | Terminal-instance divs use `height: calc(100vh - 44px)` to reserve space. |
| `setupPtyListener` receives event with missing `sessionId` | Log warning, drop event (do NOT default to legacy `'main'`). |
| Window state save during fast resize | Existing 500 ms debounce on `window_x/y/width/height` — unchanged. Tab state uses the same debouncer + `beforeunload` flush. |
| `execute_background` button spawns a session | The session ID `${tabId}__bg__${buttonId}` is registered in `TabManager._sessionsByTab` so it can be terminated on tab close. |
| `terminate_tab_sessions` called for a tab with no PTYs | No-op. |
| `HistoryManager::session_start` called multiple times (e.g., panel spawn after main spawn) | Idempotent: no-op if a session is already active. |
| Profile switcher modal invoked from simplified landing | `openProfileSwitcher('tab', activeTabId)` — updates only that tab's profile in `tabs_state`. |
| Profile switcher modal invoked from settings | `openProfileSwitcher('global')` — calls `monolithApi.switch_profile` (legacy behavior). |

---

## 8. Testing

### 8.1 Rust

The implementation adds Rust changes. Existing 6 tests in `config.rs` must still pass. New tests:

- `global_keys` test: assert that `tabs_state` and `sidebar_config` set via `AppConfig::set` are written to `config.json`, not the active profile's file. (Extend the existing `test_global_keys_always_global`.)
- `is_panel` detection: unit test for the `endsWith("__panel")` check, including `_bg_panel` negative case.
- `get_for_profile`: unit test that resolves a key against a specified profile's JSON.
- `session_start` idempotency: unit test that calling `session_start` twice in a row results in one session.
- `terminate_tab_sessions`: unit test that all sessions with the given `tab_id` prefix are terminated (mock PtyManager).
- `cancel` token: unit test that `read_loop` exits when the token is flipped, without waiting for pipe EOF (mock PTY with a never-EOF pipe).

`cargo test` should pass.

### 8.2 Frontend

Add `frontend/tabs.test.cjs` with `node --test`:

1. `createTab` appends a new tab with a UUID, `isMain: false`, profile cloned from active.
2. `closeTab` removes the tab, switches to adjacent, kills PTY calls, clears per-tab maps.
3. `closeTab` on the only main tab preserves the tab in `tabs[]` but kills its PTY and switches to full landing.
4. `closeTab` on main when other tabs exist promotes an adjacent tab to `isMain: true`.
5. `reorderTabs` updates `tabs[]` order without changing other fields.
6. `setActiveTab` updates `activeTabId` and emits a switch event.
7. `setTabProfile(tabId, profile)` updates only that tab's profile.
8. `restoreFromConfig` reads `tabs_state` and rehydrates the manager.
9. `saveToConfig` debounces writes (asserts that two rapid calls produce one config write).
10. `beforeunload` flush: cancelling the debounce and calling `set_config` synchronously works.
11. Context menu "Close Others" on main tab keeps main and closes all others.
12. Context menu "Close Others" on non-main tab keeps main + current and closes the rest.
13. Tab bar position + enabled flag round-trip through config.
14. `isMain` invariant: closing the only main tab preserves the tab; restoring corrupted state normalizes `isMain` to exactly one tab.
15. `tabs_state.tabs` empty on load creates a fresh main tab.
16. `setupPtyListener` with missing `sessionId` drops the event (no `'main'` default).
17. Race-safety: two rapid `initTabTerminal` calls with different tabIds resolve to the correct tabs.
18. `_bg_panel` button ID is not misclassified as a panel session.
19. `buttonId` > 22 chars is truncated before constructing session ID.

Update `frontend/app.renderer-policy.test.cjs` to mock `window.TabManager` and `window.simplifiedLanding` (similar to how `window.SidebarManager` is mocked today). The existing WebGL test should call `MonolothApp.restartSession(realTabId)` with a tab ID from the mocked TabManager, not the literal `'main'`.

### 8.3 Manual QA checklist

- Launch with no saved state: 1 main tab, full landing, `tabs_state` created with `tabBarEnabled: true`.
- Click `+`: 2 tabs, second is parallel (cloned profile, no PTY, simplified landing).
- Open a dir in tab 2: terminal launches, simplified landing replaced.
- Click tab 1: tab 1's UI is shown (still on full landing if no PTY, or terminal if PTY was open).
- Drag tab 2 to position 0: reorders; main tab can now be at position 1.
- Close tab 1 (main): if tab 2 exists, switch to tab 2 and promote it to main; if not, fall back to full landing.
- Close tab with running PTY: confirm modal appears; on confirm, PTY dies, tab removed.
- Right-click "Close Others" on a non-main tab: confirm if any other tab (excluding main) has running PTY, then close all except current and main.
- Right-click "Close Others" on main tab: confirm if any other tab has running PTY, then close all except main.
- Toggle tab bar off in settings: all PTYs terminated, bar hidden, legacy mode.
- Toggle tab bar on: previous tabs restored from `tabs_state`.
- Move tab bar to top: DOM order updates immediately, `tabs_state.tabBarPosition` persisted.
- Kill app mid-session (alt+F4): `beforeunload` flushes `tabs_state` synchronously; on relaunch, tabs restored.
- Manually corrupt `config.json` `tabs_state` to invalid JSON: app falls back to fresh main tab, logs warning.
- Manually set `tabs_state.tabs` to `[]` and relaunch: app creates a fresh main tab.
- Manually set `tabs_state` with two tabs having `isMain: true`: on load, second is cleared, first is kept.
- Profile switch from simplified landing: only the active tab's profile changes; other tabs unaffected.
- Switch to a different tab: shortcuts re-register from the new active tab's profile.
- Rapid tab switch during async PTY spawn: state ends up correct on both tabs.

---

## 9. Out-of-scope (deferred)

- Per-tab background/theme override.
- Per-tab active directory.
- Per-tab secondary commands as sub-views.
- Tab rename, color labels, pin, groups, splits, tear-off windows.
- Scrollback persistence across PTY restarts.
- Per-tab keyboard shortcut overrides (v1 re-registers from active profile; v2 could persist per-tab overrides).
- Tab group drag-out to new window.
- Tab bar overflow menu (when 16+ tabs, show dropdown) — v1 uses horizontal scroll instead.
- Migrating `sidebar_config` from per-profile file to global `config.json` for existing users (one-time data migration).

These are intentionally excluded to keep v1 focused on the core multi-tab experience. Each can be added later without rearchitecting, because the data model already accommodates extensions (`tabs[i].foo` fields are forward-compatible, and the `version` field enables future schema changes).
