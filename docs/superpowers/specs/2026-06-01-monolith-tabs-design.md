# Monolith Tabs System — Design Spec

**Date:** 2026-06-01
**Status:** Council-reviewed, all 37 findings applied inline
**Companion:** `2026-06-01-monolith-tabs-context.txt` (source files the design touches)

---

## 1. Problem & goals

The current Monolith shell has exactly one terminal area backed by a single `'main'` PTY session, plus a separate bottom `'panel'` PTY. The user wants a real tabs bar: multiple concurrent terminal sessions, each tied to a profile, with drag-to-reorder, pinning, color labels, secondary-command sub-views, and a persistent layout.

Goals (in priority order):
1. Multiple independent PTY sessions visible at once via a tab bar.
2. Each tab binds to a profile (inherits its `startup_command`, `secondary_commands`, `run_before_command`, `shell_override`).
3. Each secondary startup command optionally exposes a per-tab icon that switches the tab's "view" to that secondary's PTY.
4. State persists across restarts (tab order, profile, pin, color, active view, active tab).
5. Tab bar position (top/bottom) and enable/disable are settings.
6. Existing CMD panel (`'panel'` session, bottom drawer) is preserved untouched.
7. Existing single `'main'` session becomes the default first tab — no special "home" concept.

Non-goals (v1):
- Manual tab rename (name is always derived)
- Tab groups, splits, tear-off windows
- Per-tab background/theme override
- Scrollback persistence across PTY restarts

---

## 2. Architectural decision summary

| Decision | Choice | Why |
|---|---|---|
| 'main' session fate | Becomes default tab #1 | One consistent code path; no "home" special case |
| CMD panel fate | Keep as-is (`'panel'` session, bottom drawer) | Orthogonal to tabs; minimal disruption |
| Secondary command execution | Separate PTY per secondary | Matches "switch view" wording; clean isolation |
| Tab ID format | UUID v4 (frontend-generated) | Stable across reorder, profile rename, color change |
| PTY session ID format | `{tab_id}` for primary; `{tab_id}__sec{N}` for N-th secondary | Reverse-prefixable for `close_tab` cleanup |
| Xterm instance lifecycle | Pre-create on tab creation | Avoids missed PTY output for inactive views; ~16 tabs × 3 views ≈ <100 MB |
| Drag implementation | Mouse-based (mousedown/move/up) | Matches existing sidebar pattern; WebView2 DnD unreliable |
| Color palette | 8 named colors + None (red, orange, yellow, green, cyan, blue, purple, pink) | Distinct, accessible on dark bg |
| Pin icon | Unicode `🔒` | No new asset |
| Max tabs | 16 (hard cap) | Matches existing limit elsewhere in app |
| Pinned tab closeability | Closeable via context menu with confirm | Pinned ≠ unkillable; protection against accidental `×` click |

---

## 3. Data model

### 3.1 Persisted config (global key in `config.json`)

`tabs_config` is stored as a JSON object under the `"tabs_config"` key in `AppConfig`'s inner `Map<String, Value>` (same shape as every other global config key). Rust serializes/deserializes via `serde_json::to_value` / `from_value`; there is no typed `tabs_config: TabsConfig` field on `AppConfig` (which holds a `Map`, not a typed struct).

```jsonc
{
  "tabs_config": {
    "enabled": true,            // bool, default true
    "position": "top",          // "top" | "bottom", default "top"
    "activeTabId": "uuid",      // string, UUID v4
    "tabs": [
      {
        "id": "uuid-v4",            // string, strict UUID v4
        "profile": "default",       // string | null  (profile filename without .json)
        "pinned": false,            // bool
        "color": "#ff5555",         // string | null  (hex, validated)
        "activeView": "primary",    // "primary" | "secondary:0" | "secondary:1" | ...
        "dir": "C:\\Users\\me\\proj",// string | null  (per-tab launch directory; null = inherit)
        "secondaryCount": 3         // integer  (count of secondaries whose show_icon_in_tab is true)
      }
      // ...
    ]
  }
}
```

> **Note on naming split:** the rest of `config.json` uses snake_case keys (`window_width`, `last_directory`, etc.). The IPC layer uses camelCase (Tauri v2 auto-converts JS→Rust). `tabs_config` is camelCase at IPC and on disk (consistent with `PtyOutput` in `pty.rs`). This split mirrors the existing `PtyOutput { session_id, generation }` pattern.

**Secondary command schema (each entry in a profile's `secondary_commands` array):**
```jsonc
{
  "name": "build",            // string  (display name, used in tab secondary icon tooltip)
  "command": "npm run build", // string  (full command, shell-parsed via shlex)
  "enabled": true,            // bool
  "showIconInTab": true       // bool  (NEW: when true, a per-tab icon appears that switches view to this secondary's PTY)
}
```
The `showIconInTab` field is added by this design and exposed as a checkbox in the profile settings UI's "Secondary Commands" section.

**Validation rules (enforced in Rust):**
- `enabled`: bool
- `position`: enum `{"top", "bottom"}`
- `activeTabId`: must reference an existing tab in `tabs` (else first tab wins)
- `tabs`: max 16 entries; each must have unique `id`
- `color`: optional, must match `^#[0-9a-fA-F]{6}$` if present
- `activeView`: must reference either `"primary"` or an integer in `0..secondaryCount`
- `dir`: optional absolute path string
- `secondaryCount`: integer ≥ 0
- `id`: must match strict UUID v4 (`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`) and must not be `"main"`, `"panel"`, or contain the substring `"__"`

**Defaults if missing/malformed:** `enabled=true, position="top", activeTabId=null, tabs=[]`. If `tabs=[]` and `enabled=true`, app auto-creates one default tab on first launch and persists it (so subsequent launches start with 1 tab in config).

### 3.2 Runtime (in-memory only, never persisted)

- One `xterm.js` `Terminal` instance per (tab, view). All instances for a tab are pre-created synchronously inside `createTab` (i.e. as soon as the tab is added, before any user interaction). This guarantees no PTY output is missed for views the user hasn't clicked yet.
- **Hidden terminal pool:** inactive tab terminals are NOT left uninitialized. They are attached to a single off-screen container `<div id="tab-xterm-pool">` styled `position: absolute; left: -9999px; top: 0; width: 800px; height: 600px; visibility: hidden;` so `fitAddon.fit()` returns valid dimensions on creation. When a tab becomes active, its terminal's DOM element is moved into `#terminal-view`; when deactivated, it is moved back to the pool. Both moves trigger a `fitAddon.fit()` + `resize_terminal` call.
- Frontend maintains `Map<tabId, TabRuntime>` where `TabRuntime = { id, profile, pinned, color, activeView, dir, secondaryCount, xterms: { primary: Terminal, secondaries: Map<number, Terminal> }, sessionIds: { primary: string, secondaries: Map<number, string> }, generations: { primary: number, secondaries: Map<number, number> } }`.
- Session ID derivation: `sessionIds.primary = tabId`; `sessionIds.secondaries.set(N, \`${tabId}__sec${N}\`)`. The Rust `PtyManager` uses these strings as keys.
- `generations` is populated from `create_tab`'s return value: each `PtyManager::spawn()` returns `Result<u64, String>` (the generation counter for that session). Frontend uses this to filter stale `pty-output` events.
- A `MutationObserver` watches the **`#tab-bar`** element (NOT `#terminal-view` — tab bar elements are children of `#tab-bar`, not the terminal container) to wire `data-tooltip` attributes on dynamically added tab elements.
- PTY-output handler maintains `Map<sessionId, boolean>` (`skipNextEof`) for EOF filtering, replacing the global `_skipNextEof` maps in `app.js`.

### 3.3 Session ID → tab mapping (frontend)

`sessionToTab: Map<sessionId, { tabId, view: "primary" | "secondary", secondaryIndex?: number }>` — populated when a tab is created. Used to dispatch incoming `pty-output` events to the right xterm. The single global `pty-output` listener (registered by `TabManager` in `tabs.js`, replacing the listener previously in `tauri-bridge.js`) also dispatches to `window.panelTerm` when `sessionId === 'panel'`, preserving CMD panel output.

---

## 4. Rust layer

### 4.1 New file: `src-tauri/src/tabs.rs`

```rust
use std::collections::HashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TabPosition { Top, Bottom }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabsConfig {
    pub enabled: bool,
    pub position: TabPosition,
    pub active_tab_id: Option<String>,
    pub tabs: Vec<Tab>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: String,
    pub profile: Option<String>,
    pub pinned: bool,
    pub color: Option<String>,
    pub active_view: String,           // "primary" | "secondary:N"
    pub dir: Option<String>,           // per-tab launch directory (null = use last_directory)
    pub secondary_count: usize,        // count of secondary PTYs to spawn for this tab
}

pub struct TabsManager {
    // In-memory mirror of the "tabs_config" key. NOT a separate file writer.
    // Every mutation immediately calls AppConfig::set("tabs_config", value)
    // which is the SINGLE owner of config.json disk writes.
    cfg: Mutex<TabsConfig>,
}

impl TabsManager {
    pub fn new() -> Self { ... }
    pub fn load(&self) -> TabsConfig { self.cfg.lock().clone() }

    // Each mutator persists synchronously via AppConfig. There is NO direct file I/O here.
    fn persist(&self, app: &AppHandle) -> Result<(), String> { ... }
    //   → reads self.cfg
    //   → app.state::<AppConfig>().set("tabs_config", serde_json::to_value(&cfg)?)
    //   → AppConfig's set() handles atomic .tmp -> fs::rename

    pub fn add_tab(&self, tab: Tab) -> Result<Tab, String> { ... }     // validates uniqueness + ≤16
    pub fn remove_tab(&self, tab_id: &str) -> Result<Tab, String> { ... }  // returns removed Tab (with secondary_count)
    pub fn reorder(&self, new_order: Vec<String>) -> Result<(), String> { ... }
    pub fn set_pinned(&self, app: &AppHandle, tab_id: &str, pinned: bool) -> Result<(), String> { ... }
    pub fn set_color(&self, app: &AppHandle, tab_id: &str, color: Option<String>) -> Result<(), String> { ... }
    pub fn set_profile(&self, app: &AppHandle, tab_id: &str, profile: Option<String>) -> Result<Tab, String> { ... }
    pub fn set_active_view(&self, app: &AppHandle, tab_id: &str, view: String) -> Result<(), String> { ... }
    pub fn set_active_tab(&self, app: &AppHandle, tab_id: &str) -> Result<(), String> { ... }
    pub fn set_enabled(&self, app: &AppHandle, enabled: bool) -> Result<(), String> { ... }
    pub fn set_position(&self, app: &AppHandle, pos: TabPosition) -> Result<(), String> { ... }
    pub fn replace_full(&self, app: &AppHandle, new_cfg: TabsConfig) -> Result<(), String> { ... }
    //   → validates the whole structure, replaces in-memory, persists via AppConfig

    // Used by commands to enumerate session IDs without disk I/O. No profile lookup.
    pub fn session_ids_for_tab(&self, tab_id: &str) -> Option<Vec<String>> {
        // 1) find tab by id, return None if not found
        // 2) return vec![tab_id] + (0..secondary_count).map(|i| format!("{tab_id}__sec{i}"))
    }

    // Used by the auto-create-on-empty path to materialize a default tab
    pub fn make_default_tab(&self) -> Tab { ... }
}

fn validate_tab_id(id: &str) -> Result<(), String> {
    // strict UUID v4 regex; reject "main", "panel", "__"
}
fn validate_color(c: &str) -> Result<(), String> { /* ^#[0-9a-fA-F]{6}$ */ }
fn validate_active_view(tab: &Tab, view: &str) -> Result<(), String> { /* "primary" or 0..secondary_count */ }
```

The `TabsManager` is stored in `app.manage(TabsManager::new())` (Tauri state). It does **not** own `config.json`; `AppConfig` does. `TabsManager` calls `AppConfig::set("tabs_config", ...)` for every mutation. The atomic `.tmp → fs::rename` write pattern is reused via `AppConfig`.

### 4.2 Extensions to existing files

**`lib.rs`:**
- Add `mod tabs;` at the top (alongside the existing `mod commands;` / `mod config;` / etc.). Without this the new file won't compile.
- Register `TabsManager` in Tauri builder: `.manage(TabsManager::default())` (or `TabsManager::new()`).
- Import `tabs::{TabsManager, Tab, TabsConfig}` as needed.
- On `CloseRequested`: BEFORE `pty_clone.terminate_all()`, persist `tabs_config` synchronously by reading `TabsManager::load()` and calling `app_config.set("tabs_config", serde_json::to_value(&cfg)?)`. This makes close-time persistence independent of any frontend flush. No new iteration over tab session IDs is needed — `pty_clone.terminate_all()` already drains every session in the `sessions` HashMap (including all tab primaries and secondaries).

**`config.rs`:**
- `AppConfig` keeps its `Map<String, Value>` design (no typed `tabs_config` field). Storage convention: `inner.global["tabs_config"]` is a `Value::Object` whose shape matches `TabsConfig` (camelCase).
- Add `"tabs_config"` to the `Vec<&'static str>` returned by the existing `global_keys()` function. (Note: it's a function returning a `Vec`, not a `GLOBAL_KEYS` constant.)
- Default value seeding: when a fresh `AppConfig` is loaded and the `"tabs_config"` key is absent, `load_json` (or the `new()` path) seeds the default: `serde_json::json!({"enabled": true, "position": "top", "activeTabId": null, "tabs": []})`.
- No new `validate_config_value` function is added. Validation lives in `TabsManager` (called from each command), since `AppConfig`'s `set()` is generic over `Value`.

**`history.rs`:**
- `HistoryManager::start_session` and `HistoryManager::session_end` already exist. `create_tab` will call `start_session` for each spawned PTY (primary + each secondary); `close_tab` will call `session_end` for each before termination. The existing History API supports per-session IDs and is reused unchanged.

**`commands.rs` — new commands (all under `#[tauri::command]`):**

```rust
#[tauri::command]
fn get_tabs_config(tabs: tauri::State<TabsManager>) -> TabsConfig { ... }

#[tauri::command]
fn set_tabs_config(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    cfg: TabsConfig,
) -> Result<(), String>;
//   → tabs.replace_full(&app, cfg)  (validates + persists via AppConfig)

#[tauri::command]
fn create_tab(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    profile: Option<String>,
    dir: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<Tab, String>;

#[tauri::command]
fn close_tab(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    tab_id: String,
    force: bool,                    // true = bypass pinned check (called after frontend confirm)
) -> Result<(), String>;

#[tauri::command]
fn restore_tab_sessions(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
) -> Result<Vec<Tab>, String>;
//   → re-spawns PTYs for every persisted tab (uses stored dir/cols/rows), but does NOT
//     mutate TabsManager state or persist. Called once on app launch.

#[tauri::command]
fn set_tab_active_view(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    tab_id: String,
    view: String,
) -> Result<(), String>;

#[tauri::command]
fn set_active_tab(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    tab_id: String,
) -> Result<(), String>;

#[tauri::command]
fn set_tab_pinned(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    tab_id: String,
    pinned: bool,
) -> Result<(), String>;

#[tauri::command]
fn set_tab_color(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    tab_id: String,
    color: Option<String>,
) -> Result<(), String>;

#[tauri::command]
fn set_tab_profile(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    profile: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<Tab, String>;

#[tauri::command]
fn reorder_tabs(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    new_order: Vec<String>,
) -> Result<(), String>;

#[tauri::command]
fn refresh_tab(
    app: AppHandle,
    tabs: tauri::State<TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<Tab, String>;

#[tauri::command]
fn get_profile_config_by_name(
    config: tauri::State<AppConfig>,
    name: String,
) -> Result<Map<String, Value>, String>;
//   → loads profiles/{name}.json, returns the inner Map. New: lets the tab bar read
//     arbitrary profile data without switching active_profile.
```

**`create_tab` body (transactional — spawn first, commit last):**
1. Validate `tab_id` via `validate_tab_id` (UUID v4, not `"main"`/`"panel"`, no `"__"`).
2. Resolve profile: load `profiles/{profile}.json` via `get_profile_config_by_name` (or use current active profile when `profile` is `None`); fall back to `Default` profile if the named one is missing. Extract: `startup_command`, `secondary_commands` (filter `enabled && showIconInTab`), `run_before_command`, `shell_override`.
3. If `run_before_command` is set, run it (reuse the existing helper from `commands::start_terminal` — refactor it out so `tabs.rs` can call it too). On failure, return `Err` and skip step 4-7.
4. Compute `cwd`: `dir` argument if `Some`, else `config.get("last_directory").as_str()`, else `"."`.
5. Split startup_command via `shlex::split` (Windows-aware, matching `start_terminal`'s existing logic).
6. Spawn primary PTY: `let primary_gen = pty.spawn(&tab_id, shell, &args, cwd, cols, rows)?;` (this calls `PtyManager::spawn`, which takes pre-split args and 6 parameters total).
7. For each secondary where `showIconInTab == true` (in profile order), session_id = `${tab_id}__sec${i}`: `let gen = pty.spawn(&session_id, shell, &args, cwd, cols, rows)?;` Collect generations.
8. Build `Tab { id: tab_id.clone(), profile, pinned: false, color: None, active_view: "primary".into(), dir, secondary_count: <count> }`.
9. If `tabs.add_tab(tab).is_err()`: roll back by calling `pty.terminate(&tab_id)` + `pty.terminate(&session_id)` for every secondary spawned in step 7, then return `Err("duplicate id")` (race-safe).
10. Persist via `tabs.persist(&app)?` (which writes through AppConfig).
11. Call `history.start_session(&tab_id, …)` and per-secondary `history.start_session(&session_id, …)`.
12. Return `Tab` and the generations to the frontend (see note in §4.2 about return type below).

> **Return type:** `Result<(Tab, Vec<(String /* session_id */, u64 /* generation */)>), String>`. The second tuple element is the list of (session_id, generation) pairs for every spawned PTY (primary + secondaries). Frontend stores these in `TabRuntime.generations` to filter stale `pty-output` events.

**`close_tab` body:**
1. Look up the tab. If missing, return `Err("unknown tab")`.
2. If `tab.pinned && !force`, return `Err("tab is pinned")`.
3. **Capture session IDs BEFORE removal:** `let sids = tabs.session_ids_for_tab(&tab_id).ok_or("unknown")?;`
4. For each sid: `history.session_end(&sid); pty.terminate(&sid);`
5. `tabs.remove_tab(&tab_id)?;` (returns the removed Tab, not used here after capture).
6. If the closed tab was `active_tab_id`, set it to the first remaining tab's id (or `None`).
7. If `tabs.tabs.is_empty()`, auto-create a default tab via `tabs.add_tab(tabs.make_default_tab())` and persist. This keeps the invariant "tabs_config is non-empty" so the next launch restores correctly.
8. Persist via `tabs.persist(&app)?`.

**`restore_tab_sessions` body (called once on app launch):**
1. Read `tabs.load()`. For each persisted tab (in saved order):
   a. Load the profile (or use `dir` directly if `profile` is `None`).
   b. Compute `cwd` from `tab.dir` (or fallback).
   c. Spawn primary + secondaries, collect generations. Same as `create_tab` steps 6-7.
   d. Call `history.start_session` for each.
2. Return `Vec<Tab>` and the generations map (extending the return type to `Result<(Vec<Tab>, Vec<(String, u64)>), String>`).
3. **Does not mutate TabsManager state** — the saved config is already the source of truth. PTYs are spawned; the frontend stores generations; if any spawn fails, the failing tab is left with no PTY (frontend can call `refresh_tab` to retry).

**`set_tab_profile` body:**
Terminates all existing PTYs for the tab, loads the new profile, spawns new PTYs (without re-running `run_before_command` — that only runs at tab creation). Updates `Tab.profile` and `Tab.secondary_count`. Persists. Returns the new `Tab` plus new generations.

**`refresh_tab` body:**
Terminates all PTYs for the tab, respawns them with the SAME profile/dir/cols/rows (does NOT re-run `run_before_command`), clears the xterm buffer on the frontend side, returns the new `Tab` plus new generations. Does NOT change `pinned` or `color` or `active_view`.

**`set_active_view` body:**
Validates `view` against the tab's `secondary_count` (must be `"primary"` or `"secondary:N"` where `N < secondary_count`). Mutates `Tab.active_view`. Persists.

**`set_active_tab` body:**
Sets `TabsConfig.active_tab_id`. Persists.

**`reorder_tabs` body:**
Validates `new_order` is a permutation of the current `tabs[].id` list (same length, same set). Reorders. Persists.

**`get_profile_config_by_name` body:**
Reads `profile_path(name)` (helper in `config.rs`) and returns its `Map<String, Value>`. Returns `Err("profile not found")` if the file is absent.

**`start_terminal` (existing command):** REMAINS REGISTERED but is no longer used for tab management. The bridge helper `api.start_opencode` (which calls `start_terminal('main', ...)`) is updated to use `create_tab` with a fresh UUID + the active profile's startup_command. The literal string `"main"` is no longer a valid session ID (UUID v4 only) so any direct callers will fail validation, which is the desired fail-loud behavior.

**Bridge method reduction (per Finding #32):** The originally proposed `write_to_tab_view` and `resize_tab_view` commands are REMOVED. `TabManager` resolves `(tabId, view) → sessionId` locally and calls the existing `send_input(sessionId, data)` and `resize_terminal(sessionId, cols, rows)` IPCs. The Rust API surface for tabs drops from 12 new commands to 11.

### 4.3 PtyManager reuse

`PtyManager`'s actual method names are used (verified against `pty.rs` source):
- `spawn(&self, session_id: &str, command: &str, args: &[&str], cwd: &str, cols: u16, rows: u16) -> Result<u64, String>` — returns the generation counter for that session
- `terminate(&self, session_id: &str)`
- `write_input(&self, session_id: &str, data: &str) -> Result<(), String>`
- `resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String>`

`PtyManager` is reused as-is. The command-splitting logic (shlex + `cmd /C` wrapping on Windows for `.cmd` presets) that currently lives inside `commands::start_terminal` is extracted into a free function `resolve_and_split_shell_command(shell_override: Option<&str>, raw_command: &str) -> (String /* shell */, Vec<String> /* args */)` so both `start_terminal` and `create_tab` can call it without duplication.

---

## 5. Frontend layer

### 5.1 New file: `frontend/tabs.js` (IIFE, exposes `window.TabManager`)

Public API:
```js
window.TabManager = {
  // lifecycle
  async init(),                  // called on DOMContentLoaded; calls get_tabs_config + restore_tab_sessions
  setupTerminalHandlers(term, sessionId),  // shared helper, called for EVERY new xterm (primary + secondary)

  // queries
  getActiveTabId(),              // string
  getActiveView(),               // "primary" | "secondary:N"
  getActiveXterm(),              // Terminal instance (replaces window.term)
  isMainActive(),                // bool — backwards-compat for callers that care
  resolveSessionId(tabId, view), // "primary" | "secondary:N" → sessionId string

  // mutations
  async createTab(profile?),     // shows profile picker dialog; resolves to Tab + generations
  async closeTab(tabId),         // confirms if pinned; re-calls with force:true on accept
  switchTab(tabId),              // local focus; calls setActiveTab (which persists via Rust)
  async setActiveTab(tabId),     // explicit persistence of activeTabId (used by Ctrl+1..9)
  switchView(tabId, view),       // change active view of a tab; calls setTabActiveView
  reorderTabs(newOrder),         // newOrder: string[] of tab IDs
  pinTab(tabId, pinned),
  setTabColor(tabId, color),     // color: string | null
  async changeProfile(tabId, profile),  // terminates + respawns PTYs (calls setTabProfile)
  async refreshActiveTab(),      // calls refresh_tab for the active tab
};
```

> **No `flushConfig`.** Every mutation calls its corresponding Rust command synchronously, which persists through `AppConfig::set` immediately. The original `flushConfig` pattern is removed because it races with concurrent backend mutations (see Finding #15). The bridge `setTabsConfig` still exists for the settings UI but is a single-shot bulk write, not part of the hot path.

Internal state (closure-scoped, not exposed):
```js
const state = {
  config: { enabled, position, activeTabId, tabs: [] },
  runtime: new Map(),           // tabId -> { xterms, sessionIds, generations, dom, profile, secondaryCount, dir, activeView }
  sessionToTab: new Map(),      // sessionId -> { tabId, view, secondaryIndex? }
  generations: new Map(),       // sessionId -> number (from PtyManager::spawn return)
  skipNextEof: new Map(),       // sessionId -> boolean (replaces _skipNextEof global)
  dragging: null,               // { tabId, startX, originalOrder }
  contextMenuEl: null,
  profilePickerEl: null,
  xtermPoolEl: null,            // <div id="tab-xterm-pool"> off-screen container for inactive terminals
};
```

`setupTerminalHandlers(term, sessionId)` is called for every new xterm (primary and secondary) and wires: `attachCustomKeyEventHandler` (Ctrl+C copy, Ctrl+V paste, Ctrl+Shift+W close-tab), `term.onScroll(refresh)`, DOM `paste` listener, `contextmenu` handler. The previous `initTerminal`-only setup is extracted into this shared function so all tab terminals match the existing terminal's behavior.

### 5.2 DOM structure added to `index.html`

```html
<div id="tab-bar" class="position-top" hidden>
  <div class="tab-list" id="tab-list">
    <!-- populated dynamically -->
  </div>
  <div class="tab-new" data-tooltip="New tab (Ctrl+Shift+T)" id="tab-new">+</div>
</div>

<!-- Off-screen pool for inactive tab terminals (always present, hidden) -->
<div id="tab-xterm-pool" style="position: absolute; left: -9999px; top: 0; width: 800px; height: 600px; visibility: hidden;"></div>
```

Each tab element template (rendered by `TabManager`):
```html
<div class="tab" data-tab-id="uuid" data-pinned="false">
  <span class="tab-color-dot" style="background: #ff5555"></span>  <!-- hidden if no color -->
  <span class="tab-label">Profile Name</span>
  <span class="tab-secondary-icons">
    <button class="tab-secondary-icon" data-secondary-idx="0" data-tooltip="build">⚙</button>
    <!-- one per enabled secondary with showIconInTab -->
  </span>
  <button class="tab-pin" data-tooltip="Pinned" hidden>🔒</button>
  <button class="tab-close" data-tooltip="Close (Ctrl+Shift+W)">×</button>
</div>
```

**Script load order in `index.html`:**
```
tauri-bridge.js  →  tooltip.js  →  tabs.js  →  app.js  →  sidebar.js
```
`tabs.js` must load BEFORE `app.js` because `app.js` calls `TabManager.init()` and references `TabManager.getActiveXterm()`. (See Finding #33.)

### 5.3 `app.js` refactor (summary)

**Remove:**
- `window.term` (replaced by `TabManager.getActiveXterm()`)
- `initTerminal()` standalone (its handler-attach logic is moved into `TabManager.setupTerminalHandlers`)
- Direct PTY-output listener — REMOVED from `tauri-bridge.js` (it currently calls `window.writeToTerm`); TabManager is the sole owner of the listener, registered in `tabs.js` at init time.
- `_skipNextEof[pidGenId]` / `_sessionGeneration[sessionId]` global maps (moved to `TabManager`'s internal `skipNextEof` / `generations` Maps)

**Change:**
- `MonolothApp` facade: `getCurrentDir` returns the active tab's persisted `dir` (falls back to `last_directory`); `isMainActive` is a thin proxy to `TabManager.isMainActive()`.
- `MonolothApp.restartSession(sessionId)`: **preserves panel branch.** If `sessionId === 'panel'`, retain the original panel restart logic (terminate panel PTY, reinit panel). If `sessionId === 'main'` or any tab ID, proxy to `TabManager.refreshActiveTab()`. (See Finding #8.)
- Settings dialog: add "Tabs" section in Appearance tab. The Tabs section uses a persistent `MutationObserver` (same pattern as the existing Sidebar tab injection) because the settings dialog is destroyed and recreated on every open. (See Finding #30.)
- Keyboard shortcut handler: route tab shortcuts (`Ctrl+Shift+T`, `Ctrl+Shift+W`, `Ctrl+PageUp/Down`, `Ctrl+1..9`) to `TabManager`. These are hardcoded for v1 (see Finding #37); the per-profile `shortcuts` object is NOT extended to include them.

**Keep unchanged:**
- Landing page, background image picker, update checker
- CMD panel (`window.panelTerm`, `'panel'` session, all `*_panel_*` commands) — the panel's PTY session is still keyed by the literal string `'panel'`, which is reserved and cannot collide with tab IDs because tab IDs are strict UUID v4 (Finding #13).
- The PTY-output listener in `TabManager` dispatches to `window.panelTerm` when the incoming `sessionId === 'panel'`, so panel output is preserved. (See Finding #7.)

**Update test:** `frontend/app.renderer-policy.test.cjs` — mock `TabManager` (provide a stub `getActiveXterm` returning a fake Terminal); assert WebGL is still not loaded when transparency > 0. The simulated `restartSession('main')` path still goes through `MonolothApp.restartSession`, which now proxies to `TabManager.refreshActiveTab()`.

### 5.4 `tauri-bridge.js` additions

Add to `window.monolithApi` (mirroring camelCase → snake_case):
```js
getTabsConfig: () => invoke('get_tabs_config'),
setTabsConfig: (cfg) => invoke('set_tabs_config', { cfg }),
createTab: (tabId, profile, dir, cols, rows) => invoke('create_tab', { tabId, profile, dir, cols, rows }),
closeTab: (tabId, force = false) => invoke('close_tab', { tabId, force }),
restoreTabSessions: () => invoke('restore_tab_sessions'),
setTabActiveView: (tabId, view) => invoke('set_tab_active_view', { tabId, view }),
setActiveTab: (tabId) => invoke('set_active_tab', { tabId }),
setTabPinned: (tabId, pinned) => invoke('set_tab_pinned', { tabId, pinned }),
setTabColor: (tabId, color) => invoke('set_tab_color', { tabId, color }),
setTabProfile: (tabId, profile, cols, rows) => invoke('set_tab_profile', { tabId, profile, cols, rows }),
reorderTabs: (newOrder) => invoke('reorder_tabs', { newOrder }),
refreshTab: (tabId, cols, rows) => invoke('refresh_tab', { tabId, cols, rows }),
getProfileConfigByName: (name) => invoke('get_profile_config_by_name', { name }),
```

`writeToTabView` and `resizeTabView` are REMOVED. `TabManager` uses the existing `sendInput(sessionId, data)` and `resizeTerminal(sessionId, cols, rows)` directly, resolving the sessionId locally. (See Finding #32.)

The existing `setupPtyListener` function in `tauri-bridge.js` is REMOVED. The `listen('pty-output', ...)` registration moves to `tabs.js` (registered once in `TabManager.init()`). (See Finding #6.)

### 5.5 `sidebar.js` additions

- **Settings dialog Tabs section:** Render two controls (toggle "Show tab bar", dropdown "Position") inside the Appearance tab. The section is injected via a persistent `MutationObserver` on the settings dialog (because the dialog is destroyed+recreated on every open) — same pattern used for the existing Sidebar tab injection. On any change, call `setTabsConfig({ ...currentConfig, enabled, position })` (NOT `set_config_key`, which would bypass `TabsManager` and leave runtime state stale).
- **Profile picker dialog:** New small modal listing profiles (from `list_profiles` IPC) + "No profile" option. Triggered by `TabManager.createTab()`.

### 5.6 `style.css` additions

New classes (all scoped under `#tab-bar`):
- `#tab-bar` — flex row, full width, dark bg (`var(--bg-secondary)`), height 32px, border-bottom (or border-top if position=bottom)
- `#tab-xterm-pool` — off-screen container for inactive terminals (per §5.2)
- `.tab` — flex row, padding 4px 10px, gap 6px, cursor pointer, bg `var(--bg-tertiary)`, max-width 200px
- `.tab.active` — bg `var(--bg-primary)`, border-bottom 2px solid `var(--accent-primary)` (note: existing tokens use `--accent-primary`, not `--accent`; see Finding #34)
- `.tab:hover` — bg lighter
- `.tab-color-dot` — 8×8 circle, hidden via `display:none` when no color
- `.tab-label` — text-overflow ellipsis, white-space nowrap, overflow hidden, font-size 12px
- `.tab-close`, `.tab-pin` — 14×14, no bg, hover bg lighter; `tab-pin` shows when `[data-pinned="true"]`, otherwise hidden; `tab-close` shows when not pinned
- `.tab-secondary-icons` — flex row, gap 2px; each icon 14×14 button
- `.tab-new` — fixed width 32px, text-align center, font-size 18px, cursor pointer
- `.tab-dragging` — opacity 0.4, transform scale(0.95)
- `.tab-drop-indicator` — 2px wide vertical bar at drop position, color `var(--accent-primary)`
- `#context-menu` — absolute positioned, dark bg, border, padding 4px, z-index 1000
- `#context-menu .item` — padding 6px 12px, hover bg lighter
- `#context-menu .submenu` — nested list of color swatches

---

## 6. Interaction matrix

| User action | Handler | Rust call | UI feedback |
|---|---|---|---|
| App launch | `TabManager.init()` | `get_tabs_config` + `restore_tab_sessions` | Restores tab bar + re-spawns PTYs (no state mutation) |
| Click `+` | `TabManager.createTab()` | none (opens dialog) | Profile picker modal |
| Pick profile in dialog | `TabManager.createTab(profile)` | `create_tab` | New tab + PTYs spawn |
| Click tab body | `TabManager.switchTab(id)` | `set_active_tab` (persists activeTabId) | Active style, xterm swap (moved from pool into `#terminal-view`) |
| Click secondary icon | `TabManager.switchView(id, "secondary:N")` | `set_tab_active_view` | View swap, persists |
| Click `×` on tab | `TabManager.closeTab(id)` | `close_tab` (force=false) | If pinned: confirm dialog → re-call with force=true. Tab removed. |
| Right-click tab | `setupContextMenu().show(e, tabId)` | none (local) | Context menu appears |
| Context: Close | `closeTab(tabId)` | `close_tab` (force=false, or true if pinned+confirmed) | Tab removed |
| Context: Close Others | iterate + `closeTab(force=true)` (skip pinned + active) | `close_tab` per tab | Others removed |
| Context: Pin/Unpin | `pinTab(tabId, !pinned)` | `set_tab_pinned` | Icon swap, persists immediately |
| Context: Color submenu | `setTabColor(tabId, color)` | `set_tab_color` | Dot updates, persists immediately |
| Drag tab | mousedown/move/up handlers | `reorder_tabs` on drop | Live reorder, persisted on drop |
| `Ctrl+Shift+T` | shortcut handler | `create_tab` (active profile) | New tab |
| `Ctrl+Shift+W` | shortcut handler | `close_tab` (active) | Active tab closed |
| `Ctrl+PageUp/Down` | shortcut handler | none (local cycle) | Active changes |
| `Ctrl+1..9` | shortcut handler | `set_active_tab` (Rust) | Jumps to Nth |
| Tab bar disabled in settings | setting change | **`setTabsConfig` (NOT `set_config_key`)** | `#tab-bar hidden`; tabs/state preserved |
| Tab bar position change | setting change | **`setTabsConfig` (NOT `set_config_key`)** | CSS class swap on `#tab-bar` |
| Window resize | resize observer on `#terminal-view` | `resize_terminal(sessionId, cols, rows)` (resolved locally by TabManager) | xterm fits |
| PTY output event (tab session) | TabManager listener | (event from Rust) | Routed to correct xterm via `sessionToTab` map |
| PTY output event (`'panel'` session) | TabManager listener | (event from Rust) | Routed to `window.panelTerm` (CMD panel preserved) |
| Tab close (window) | `CloseRequested` handler | `app_config.set("tabs_config", value)` (synchronous) then `pty.terminate_all()` | All PTYs killed; tabs_config persisted before destroy |

---

## 7. Edge cases & invariants

| Case | Handling |
|---|---|
| `tabs_config` missing or malformed | Seed with default `{ enabled: true, position: "top", activeTabId: null, tabs: [] }`; `init()` then auto-creates 1 default tab AND calls `create_tab` so it is persisted (subsequent launches start with 1 tab in config, not empty) |
| All tabs closed (last tab) | `close_tab` auto-creates a default tab and persists it; `tabs_config.tabs` is never empty after a `close_tab` |
| Last remaining tab is pinned and user tries to close | `close_tab` with `force=false` returns `Err("tab is pinned")`; frontend shows confirm "This tab is pinned. Close anyway?"; on accept, re-calls with `force=true` |
| `Close Others` when all are pinned | No-op (or just closes the active if unpinned) |
| Profile deleted while referenced by a tab | On `set_tab_profile` or `create_tab`, fall back to `profile = null`; `dir` is still used if present |
| `run_before_command` of new profile fails | `create_tab` returns `Err` before any PTY spawn; UI shows toast, no tab added, no PTYs leaked |
| Secondary command's `showIconInTab` toggled off after tab created | On next `set_tab_profile` or `refresh_tab`, the secondary's PTY is terminated and icon removed; `secondary_count` is updated. Toggling back respawns. |
| User hits Ctrl+W (browser) vs Ctrl+Shift+W (close tab) | `Ctrl+W` is not intercepted; `Ctrl+Shift+W` is the close-tab shortcut |
| `activeTabId` references non-existent tab after delete | On load, validate and reset to first tab's id (or null if empty) |
| Two `create_tab` calls with same `id` | Rust rejects second with `Err("duplicate id")` |
| `create_tab` with id that is `"main"`, `"panel"`, or contains `"__"` | Rust rejects with `Err("invalid tab id: …")` (UUID v4 + reserved-name check) |
| `reorder_tabs` with missing/unknown IDs | Rust rejects with `Err("unknown tab id: …")` listing first invalid id |
| 17th tab creation | Rust rejects with `Err("max 16 tabs")` |
| Pinned tab's `pinned` set false, then `Close Others` runs | `Close Others` skips by current `pinned` state at time of call |
| `tabs_config.enabled = false` but `tabs` non-empty | Tab bar hidden; PTYs still alive (default tab is active); state preserved for re-enable |
| Restore: profile referenced by saved tab was deleted | Fall back to `profile = null`; `dir` still used; name updates to truncated command |
| Restore: `secondary_count` on persisted tab exceeds profile's current secondary count | `restore_tab_sessions` uses the stored `secondary_count` (not the live profile count) so the tab's own state is honored; if the profile lost secondaries, those PTYs simply don't spawn and `activeView` is reset to `"primary"` if it referenced a missing index |
| Hidden xterm lifecycle | Inactive terminals live in `#tab-xterm-pool` (off-screen, fixed dimensions). `switchTab` moves the terminal's DOM element into `#terminal-view` and calls `fitAddon.fit()` + `resize_terminal` for it. The previously-active terminal is moved back to the pool and re-fitted (so the next activation has fresh dimensions). |
| Two simultaneous `create_tab` calls (frontend race) | Both go through the transactional flow: PTY spawns happen first; if `add_tab` returns `Err("duplicate id")` for the second, the second rolls back its spawned PTYs before returning. |
| `create_tab` partial failure (e.g., secondary 2 fails after primary + secondary 1 succeed) | Roll back all spawned PTYs (`pty.terminate` for primary and any secondaries that succeeded); return `Err`; do not persist the tab. |
| `MonolothApp.restartSession('panel')` | Retains the original panel restart logic (terminate panel PTY, reinit panel) — does NOT proxy to `TabManager.refreshActiveTab()`. |
| `MonolothApp.restartSession('main')` | Proxies to `TabManager.refreshActiveTab()`. |
| Tab shortcuts (`Ctrl+Shift+T/W`, `Ctrl+PageUp/Down`, `Ctrl+1..9`) | Hardcoded in `app.js`'s keydown handler for v1. Not added to the per-profile `shortcuts` object. (Documented tradeoff per Finding #37.) |

---

## 8. Tests

### 8.1 Rust (`#[cfg(test)]` blocks)

`tabs.rs`:
- `add_tab_enforces_max_16` — 17th add returns Err
- `add_tab_enforces_unique_id` — duplicate id returns Err
- `validate_tab_id_accepts_strict_uuid_v4` — `"main"`, `"panel"`, `"abc__def"`, non-UUID strings all rejected
- `reorder_validates_all_ids_exist` — any unknown id returns Err
- `set_color_validates_hex_format` — invalid hex returns Err
- `set_active_view_validates_against_secondary_count` — `"secondary:5"` when `secondary_count=2` returns Err; `"secondary:2"` (boundary) accepted
- `session_ids_for_tab_returns_primary_and_all_secondaries` — known fixture, NO disk I/O
- `session_ids_for_tab_returns_none_for_unknown_id` — does not panic
- `remove_tab_clears_active_if_was_active`
- `round_trip_config_serialization_via_camelCase` — serialize to Value → deserialize → equal; verifies `rename_all = "camelCase"` works for all field names
- `close_tab_auto_creates_default_when_empty` — closing the last tab leaves `tabs.len() == 1`

`config.rs`:
- `default_tabs_config_seeds_when_absent` — fresh `AppConfig` has `tabs_config` key with sensible defaults
- `tabs_config_in_global_keys` — `"tabs_config"` is in the `Vec` returned by `global_keys()`
- `set_tabs_config_round_trips_via_app_config` — writing through `AppConfig::set("tabs_config", …)` produces a JSON file with the camelCase shape

`commands.rs`:
- `start_terminal_does_not_create_tab` — calling `start_terminal` does NOT mutate `TabsManager` (after Finding #31 deprecation)
- `resolve_and_split_shell_command_matches_start_terminal_behavior` — extracted helper preserves the existing Windows `.cmd` wrapping logic

### 8.2 Frontend

`frontend/tabs.test.cjs` (new file):
- `init_calls_get_tabs_config_and_restore_tab_sessions`
- `createTab_calls_create_tab_rust_command_with_cols_and_rows`
- `createTab_rolls_back_on_secondary_spawn_failure` (mock pty.spawn to fail on 2nd call)
- `closeTab_calls_close_tab_with_force_false`
- `closeTab_pinned_re_calls_with_force_true_after_confirm`
- `closeTab_handles_pinned_rust_error_and_shows_confirm`
- `switchTab_moves_xterm_from_pool_to_viewport_and_calls_resize_terminal`
- `switchView_updates_active_view_and_persists`
- `reorderTabs_calls_bridge_with_new_order`
- `pinTab_toggles_pin_state`
- `setTabColor_validates_hex_and_persists`
- `changeProfile_respawns_ptys`
- `pty_output_routes_to_correct_xterm_via_session_id`
- `pty_output_routes_panel_session_to_window_panelTerm`
- `pty_output_filters_by_generation_using_stale_generation`
- `pty_output_filters_eof_using_skipNextEof`
- `auto_creates_default_tab_when_restore_returns_empty`
- `mutation_observer_targets_tab_bar_not_terminal_view`
- `setupTerminalHandlers_attaches_to_every_new_xterm`
- `close_others_skips_pinned_tabs`
- `tab_id_validation_rejects_main_panel_and_double_underscore`

`frontend/app.renderer-policy.test.cjs` (update):
- Mock `window.TabManager` to return a fake `getActiveXterm()`; assert `webglLoadCount === 0` after a simulated `restartSession('main')` path (still goes through `MonolothApp.restartSession`, which now proxies to `TabManager.refreshActiveTab()` for `'main'` and keeps the original panel branch for `'panel'`).
- The mock should also stub `TabManager.setupTerminalHandlers` to a no-op so xterm setup is a no-op in the test.

---

## 9. Migration / rollout

1. **Rust scaffolding (additive):** Add `mod tabs;` to `lib.rs`, create `src-tauri/src/tabs.rs` with `TabsManager` (in-memory only, all disk writes via `AppConfig::set`), add the 11 new commands to `commands.rs` (note: 11, not 12 — `write_to_tab_view` and `resize_tab_view` removed per Finding #32), update `lib.rs` `CloseRequested` to persist `tabs_config` synchronously via `AppConfig::set` before `pty.terminate_all()`. Add `"tabs_config"` to `global_keys()` in `config.rs` and seed the default in `load_json` / `AppConfig::new`. No behavior changes yet — `start_terminal` still works, `'main'` and `'panel'` sessions still work. New tests added.
2. **Frontend scaffolding (additive):** Add the new `monolithApi` methods to `tauri-bridge.js`. Remove `setupPtyListener` from `tauri-bridge.js` (move registration responsibility to `tabs.js` in step 3 — but the listener is still active in the bridge until step 3 lands, so no breakage). Update `app.renderer-policy.test.cjs` mock to include `TabManager` stub.
3. **`tabs.js` + DOM + CSS + `app.js` refactor:** Add `frontend/tabs.js` with `TabManager` IIFE. Add `#tab-bar` and `#tab-xterm-pool` to `index.html`. Add `tabs.js` script tag (in the order `tauri-bridge.js → tooltip.js → tabs.js → app.js → sidebar.js`). Add tab bar styles to `style.css`. Refactor `app.js`: remove `window.term`, `initTerminal`, global `_skipNextEof` / `_sessionGeneration` maps, direct PTY-output listener. Refactor `MonolothApp.restartSession` to preserve panel branch + proxy `'main'` to `TabManager.refreshActiveTab()`. Add `getProfileConfigByName` and use it in `createTab`. Add the Tabs settings section to `sidebar.js` via persistent `MutationObserver`.
4. **Bump `?v=N`** on every modified frontend file in `index.html`.
5. **Verify:** `cargo check` + `cargo test` from `src-tauri/`; `node --test frontend/*.test.cjs` from repo root. All new tests must pass; existing tests (renderer-policy) must still pass.

Rollback: revert each step. Because steps 1+2 are additive, partial rollout is safe — the tabs bar is inert until `TabManager.init()` is called (step 3).

---

## 10. Files touched (summary)

**New files:**
- `src-tauri/src/tabs.rs` (~280 lines + ~150 lines tests)
- `frontend/tabs.js` (~700 lines)
- `frontend/tabs.test.cjs` (~300 lines)

**Modified:**
- `src-tauri/src/lib.rs` (`+mod tabs;`, `.manage(TabsManager::…)`, `CloseRequested` synchronous `tabs_config` save, ~30 lines net)
- `src-tauri/src/commands.rs` (+11 new command handlers + `resolve_and_split_shell_command` helper extracted from `start_terminal`, ~280 lines; existing `start_terminal` retained for backwards-compat but updated to call the shared helper; the literal string `"main"` is no longer a valid session ID for tab-bound calls)
- `src-tauri/src/config.rs` (`"tabs_config"` added to `global_keys()`'s returned `Vec`; default value seeded in `load_json` / `AppConfig::new`; ~25 lines)
- `src-tauri/src/history.rs` (NO code change; `create_tab` and `close_tab` call existing `start_session` / `session_end` per session)
- `frontend/index.html` (+`#tab-bar` div, +`#tab-xterm-pool` div, +`tabs.js` script tag, +`?v` bumps on touched files)
- `frontend/tauri-bridge.js` (+13 `monolithApi` methods, −1 function (`setupPtyListener` removed), +`api.start_opencode` updated to call `createTab` instead of `start_terminal('main', …)`; net ~+60 lines)
- `frontend/style.css` (+~180 lines tab bar styles + off-screen pool)
- `frontend/app.js` (−`window.term`, −`initTerminal` standalone, −direct PTY-output listener, −global `_skipNextEof` / `_sessionGeneration` maps; `MonolothApp.restartSession` updated to preserve panel branch + proxy `'main'`; +keydown handler for tab shortcuts; +proxy `getCurrentDir`; ~−180/+80 net lines)
- `frontend/sidebar.js` (+Tabs settings section via persistent `MutationObserver`, +profile picker dialog, ~140 lines)
- `frontend/app.renderer-policy.test.cjs` (mock `TabManager` with `getActiveXterm` and `setupTerminalHandlers` stubs; ~10 line diff)

**Untouched (intentionally):**
- `src-tauri/src/main.rs`
- `src-tauri/src/pty.rs` (reused as-is; `TabsManager` and the new commands use existing `spawn` / `terminate` / `write_input` / `resize`)
- `frontend/tooltip.js` (reused)
- `frontend/lib/*` (vendored, no changes)

---

## 11. Open questions

None. The three architectural decisions (main fate, panel fate, secondary PTY model) were resolved with the user prior to writing this spec. All other design points are stated assumptions listed in §2. The 37 council findings have been applied inline; no remaining architectural ambiguity.

---

## DEPENDENCIES NEEDED

None. All Rust deps already in `Cargo.toml` (`tauri 2`, `portable-pty`, `parking_lot`, `serde`, `serde_json`, `rfd`, `shlex`, `winapi`) cover the new module. All frontend code is vanilla JS — no new npm packages.
