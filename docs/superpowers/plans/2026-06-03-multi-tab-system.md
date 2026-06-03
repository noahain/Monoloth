# Monoloth Multi-Tab System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a multi-tab system for Monoloth that runs multiple independent PTY sessions concurrently, each tied to a per-tab profile, with drag-to-reorder, right-click context menu, persistent layout, and a tab-bar-disabled legacy fallback.

**Architecture:** All state lives in a new `frontend/tabs.js` `TabManager` IIFE; persistence goes through the existing `AppConfig::set_config("tabs_state", ...)` route. Rust gains a PTY cancellation token, a small set of new commands (`end_history_session`, `record_history_activity`, `terminate_tab_sessions`), `start_terminal` accepts a per-tab `profile` parameter, and `is_panel` detection becomes suffix-based. Existing `PtyManager` keyed-map needs no structural change. Per-tab xterm instances live in `<div class="terminal-instance" data-tab-id>` siblings inside `#terminal-view`; only the active one is visible. The `'main'` and `'panel'` session IDs are kept as legacy fallbacks; new sessions use `${tabId}__main` / `${tabId}__panel` / `${tabId}__bg__${buttonId}` (double underscore).

**Tech Stack:** Rust (Tauri 2, portable-pty, parking_lot, serde, serde_json), vanilla JS (xterm.js via vendored `lib/xterm.js`), Node `node:test` for frontend tests, Mocha-style assertions via `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-06-03-multi-tab-system-design.md` (518 lines, 9 sections, 52 council findings applied).

**Context bundle:** `docs/superpowers/specs/2026-06-03-multi-tab-system-context.txt` (50 KB, 10 sections of source excerpts).

---

## File map

**New files (3):**
- `frontend/tabs.js` — `window.TabManager` IIFE: state, persistence, switch, create, close, drag, context menu, +1 button, per-tab DOM management, race-safety.
- `frontend/tabs.test.cjs` — `node --test` tests for `TabManager`.
- `frontend/simplified-landing.js` — Renders the simplified landing inside the active tab's terminal-instance.

**Modified (10):**
- `src-tauri/src/pty.rs` — PtySession cancellation token; read_loop checks token; terminate flips token.
- `src-tauri/src/commands.rs` — `is_panel` suffix check; `start_terminal` profile param; new commands; `terminate_terminal` refactor; `session_start` idempotent.
- `src-tauri/src/config.rs` — `tabs_state` + `sidebar_config` in `global_keys()`; new `get_for_profile`.
- `src-tauri/src/lib.rs` — register 3 new commands.
- `frontend/index.html` — `#tab-bar` top-level; terminal-instance divs; script load order; `?v=N` bumps.
- `frontend/app.js` — refactor terminal state; rewrite `initTerminal`/`showTerminal`/`backToLanding`/`writeToTerm`/`MonolothApp`.
- `frontend/sidebar.js` — `${tabId}__panel`; `MutationObserver` settings injection; Tabs section.
- `frontend/tauri-bridge.js` — remove `start_opencode`/`terminate`; add new wrappers; `setupPtyListener` drop missing sessionId.
- `frontend/style.css` — tab bar styles; overflow; calc height; CTA variants.
- `frontend/app.renderer-policy.test.cjs` — mock `TabManager`; update WebGL test.

---

## Task ordering & dependencies

| Phase | Task | Component | Depends on |
|---|---|---|---|
| 1 | 1 | `config.rs` add `tabs_state` + `sidebar_config` to `global_keys()` | — |
| 1 | 2 | `config.rs` add `get_for_profile(name, key)` | 1 |
| 1 | 3 | `pty.rs` add `Arc<AtomicBool>` cancellation token to `PtySession` | — |
| 1 | 4 | `pty.rs` `read_loop` checks token; `terminate` flips token | 3 |
| 1 | 5 | `history.rs` make `session_start` idempotent | — |
| 1 | 6 | `commands.rs` update `start_terminal`: `is_panel` suffix + `profile` param | 2 |
| 1 | 7 | `commands.rs` add `end_history_session` command | 5 |
| 1 | 8 | `commands.rs` add `record_history_activity` command | 5 |
| 1 | 9 | `commands.rs` add `terminate_tab_sessions` + register in `lib.rs` | — |
| 2 | 10 | `tabs.js` skeleton + state + loadConfig | — |
| 2 | 11 | `tabs.js` `_sessionsByTab` tracking | 10 |
| 2 | 12 | `tabs.js` `createTab` + tests | 10 |
| 2 | 13 | `tabs.js` `closeTab` with isMain promotion + tests | 11, 12 |
| 2 | 14 | `tabs.js` `reorderTabs` + `setActiveTab` + tests | 12 |
| 2 | 15 | `tabs.js` `setTabProfile` + tests | 12 |
| 2 | 16 | `tabs.js` `restoreFromConfig` with normalization + tests | 10, 12-15 |
| 2 | 17 | `tabs.js` debounce + `beforeunload` flush | 10 |
| 3 | 18 | `tabs.js` `initTabTerminal` lazy xterm + rAF fit | 13 |
| 3 | 19 | `tabs.js` `switchTo` visibility toggle + fit | 14, 18 |
| 3 | 20 | `tabs.js` `handleBack` + simplified landing | 19 |
| 3 | 21 | `tabs.js` `closeTab` per-tab cleanup | 13, 18 |
| 4 | 22 | `tabs.js` `renderTabs` markup (div, not button) | 12 |
| 4 | 23 | `style.css` tab bar base styles | — |
| 4 | 24 | `style.css` overflow + sticky `+` (covered by Task 23) | 23 |
| 4 | 25 | `tabs.js` drag-reorder (mousedown/move/up) | 14, 22 |
| 4 | 26 | `tabs.js` right-click context menu | 13 |
| 4 | 27 | `tabs.js` `+` button (create parallel tab) | 12, 22 |
| 4 | 28 | `tabs.js` X button with `stopPropagation` (covered by 27) | 13, 22 |
| 5 | 29 | `simplified-landing.js` render template | — |
| 5 | 30 | profile button → `openProfileSwitcher` (covered by 29) | 29 |
| 5 | 31 | Choose dir + Open in Last Directory (covered by 29) | 29 |
| 6 | 32 | `app.js` refactor state to `TabManager` maps | 10, 18 |
| 6 | 33 | `app.js` rewrite `writeToTerm` suffix routing | 18 |
| 6 | 34 | `app.js` refactor `initTerminal` → `TabManager.initTabTerminal` | 32, 18 |
| 6 | 35 | `app.js` refactor `showTerminal` → `TabManager.switchTo` | 19 |
| 6 | 36 | `app.js` refactor `backToLanding` → `TabManager.handleBack` | 20 |
| 6 | 37 | `app.js` refactor `MonolothApp` facade | 32-36 |
| 6 | 38 | `bridge.js` `setupPtyListener` drop missing sessionId | 33 |
| 6 | 39 | `app.js` keyboard shortcut re-registration | 19, 35 |
| 6 | 40 | `bridge.js` remove `start_opencode`/`terminate` | 32 |
| 7 | 41 | `sidebar.js` panel session ID → composite | 19 |
| 7 | 42 | `sidebar.js` `executeBackground` composite + register | 11, 41 |
| 7 | 43 | `sidebar.js` `MutationObserver` settings injection | — |
| 7 | 44 | `sidebar.js` Tabs settings section | 43 |
| 8 | 45 | `index.html` `<div id="tab-bar">` top-level | 22, 23 |
| 8 | 46 | `index.html` `.terminal-instance` divs + `#simplified-landing` | 18, 29, 45 |
| 8 | 47 | `index.html` script load order (tabs.js before app.js) | 10, 29 |
| 8 | 48 | `index.html` `?v=N` bumps | 45-47 |
| 8 | 49 | `style.css` `.terminal-instance` calc height (covered by 23) | 23 |
| 8 | 50 | `style.css` `body.tab-bar-top` + CTA variants | 23, 49 |
| 9 | 51 | `app.js` `openProfileSwitcher(scope, tabId)` | 15 |
| 9 | 52 | profile button (covered by 29) | 30, 51 |
| 9 | 53 | settings profile (covered by 51) | 51 |
| 10 | 54 | `app.renderer-policy.test.cjs` mock TabManager | 32, 47 |
| 10 | 55 | `tabs.test.cjs` full coverage | 10-21 |
| 10 | 56 | Integration verify | 1-55 |

---

# Phase 1: Rust foundation

## Task 1: config.rs add 	abs_state + sidebar_config to global_keys()

**Files:**
- Modify: src-tauri/src/config.rs:63-70 (the global_keys() function)

- [ ] **Step 1: Update global_keys() to include the new keys**

In src-tauri/src/config.rs, the global_keys() function is:

`ust
fn global_keys() -> Vec<&'static str> {
    vec![
        "active_profile", "last_directory", "window_width", "window_height",
        "window_maximized", "fp_last_dir_bg_image", "fp_last_dir_choose",
        "use_custom_titlebar", "window_x", "window_y",
        "cmdPanelHeight", "panelShell",
    ]
}
`

Replace it with:

`ust
fn global_keys() -> Vec<&'static str> {
    vec![
        "active_profile", "last_directory", "window_width", "window_height",
        "window_maximized", "fp_last_dir_bg_image", "fp_last_dir_choose",
        "use_custom_titlebar", "window_x", "window_y",
        "cmdPanelHeight", "panelShell",
        "tabs_state", "sidebar_config",
    ]
}
`

- [ ] **Step 2: Add a test for the new global keys**

In src-tauri/src/config.rs, add to the mod tests block:

`ust
    #[test]
    fn test_tabs_state_is_global() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("OtherProfile");
        config.switch_profile("OtherProfile");
        config.set("tabs_state", Value::String("test-value".into()));
        let global = load_json(&config_path());
        assert_eq!(global.get("tabs_state").and_then(|v| v.as_str()), Some("test-value"));
        cleanup_test_env(&test_dir);
    }

    #[test]
    fn test_sidebar_config_is_global() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("OtherProfile");
        config.switch_profile("OtherProfile");
        config.set("sidebar_config", Value::String("test-value".into()));
        let global = load_json(&config_path());
        assert_eq!(global.get("sidebar_config").and_then(|v| v.as_str()), Some("test-value"));
        cleanup_test_env(&test_dir);
    }
`

- [ ] **Step 3: Run the tests**

Run from src-tauri/:

`ash
cargo test --lib config
`

Expected: PASS, including the new tests 	est_tabs_state_is_global and 	est_sidebar_config_is_global.

- [ ] **Step 4: Commit**

`ash
git add src-tauri/src/config.rs
git commit -m "feat(config): add tabs_state and sidebar_config to global_keys()"
`

---

## Task 2: config.rs add get_for_profile(name, key) helper

**Files:**
- Modify: src-tauri/src/config.rs (in impl AppConfig block, around line 200)

- [ ] **Step 1: Add get_for_profile to AppConfig impl**

In src-tauri/src/config.rs, inside the impl AppConfig block (after get, before set), add:

`ust
    /// Resolve a key against a specific profile's JSON without changing
    /// the global active_profile. Used by per-tab profile reads in
    /// start_terminal.
    pub fn get_for_profile(&self, profile_name: &str, key: &str) -> Value {
        if profile_name == "Default" {
            return self.get(key);
        }
        let path = profile_path(profile_name);
        if !path.exists() {
            return Value::Null;
        }
        let map = load_json(&path);
        map.get(key).cloned().unwrap_or(Value::Null)
    }
`

- [ ] **Step 2: Add a test**

In src-tauri/src/config.rs, add to the mod tests block:

`ust
    #[test]
    fn test_get_for_profile() {
        let (test_dir, _lock) = setup_test_env();
        let config = AppConfig::new();
        config.create_profile("Work");
        config.switch_profile("Work");
        config.set("startup_command", Value::String("claude".into()));
        let active = config.get_active_profile();
        assert_eq!(active, "Work");
        let from_work = config.get_for_profile("Work", "startup_command");
        assert_eq!(from_work.as_str(), Some("claude"));
        let from_default = config.get_for_profile("Default", "startup_command");
        assert_eq!(from_default.as_str(), Some("opencode"));
        let from_missing = config.get_for_profile("Nonexistent", "startup_command");
        assert_eq!(from_missing, Value::Null);
        cleanup_test_env(&test_dir);
    }
`

- [ ] **Step 3: Run tests**

`ash
cargo test --lib config
`

Expected: PASS, including 	est_get_for_profile.

- [ ] **Step 4: Commit**

`ash
git add src-tauri/src/config.rs
git commit -m "feat(config): add AppConfig::get_for_profile for per-tab config resolution"
`

---

## Task 3: pty.rs add cancellation token to PtySession

**Files:**
- Modify: src-tauri/src/pty.rs (the PtySession struct, line 19-24, and spawn, line 95-100)

- [ ] **Step 1: Add the AtomicBool import and update PtySession struct**

In src-tauri/src/pty.rs, after line 5 use std::sync::{Arc, OnceLock};, add:

`ust
use std::sync::atomic::{AtomicBool, Ordering};
`

Replace the PtySession struct (line 19-24) with:

`ust
struct PtySession {
    writer: Box<dyn Write + Send>,
    resizer: Option<Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>>,
    child: Box<dyn portable_pty::ChildKiller + Send>,
    read_thread: Option<thread::JoinHandle<()>>,
    cancel: Arc<AtomicBool>,
}
`

- [ ] **Step 2: Initialize the token in spawn()**

In src-tauri/src/pty.rs, in the spawn method, the existing block that creates the read handle and PtySession (around line 89-100) is:

`ust
        let app_ref = self.app_handle.clone();
        let sid = session_id.to_string();
        let read_handle = thread::spawn(move || {
            Self::read_loop(app_ref, reader, sid, gen);
        });

        let session = PtySession {
            writer,
            resizer: Some(Arc::new(Mutex::new(pair.master))),
            child,
            read_thread: Some(read_handle),
        };
`

Replace with:

`ust
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_for_thread = cancel.clone();
        let app_ref = self.app_handle.clone();
        let sid = session_id.to_string();
        let read_handle = thread::spawn(move || {
            Self::read_loop(app_ref, reader, sid, gen, cancel_for_thread);
        });

        let session = PtySession {
            writer,
            resizer: Some(Arc::new(Mutex::new(pair.master))),
            child,
            read_thread: Some(read_handle),
            cancel,
        };
`

- [ ] **Step 3: Verify compile (will fail on read_loop signature until Task 4)**

`ash
cargo check
`

Expected: errors only on ead_loop signature (Task 4) and 	erminate (Task 4). No new errors from this step.

- [ ] **Step 4: Commit (WIP)**

`ash
git add src-tauri/src/pty.rs
git commit -m "wip(pty): add cancellation token to PtySession (read_loop update pending)"
`

---

## Task 4: pty.rs ead_loop checks token; 	erminate flips it

**Files:**
- Modify: src-tauri/src/pty.rs (the ead_loop function, line 107-221, and 	erminate function, line 258-273)

- [ ] **Step 1: Update ead_loop signature and add cancellation check**

In src-tauri/src/pty.rs, the ead_loop function signature (line 107-112) is:

`ust
    fn read_loop(
        app_handle: OnceLock<tauri::AppHandle>,
        mut reader: Box<dyn std::io::Read + Send>,
        session_id: String,
        generation: u64,
    ) {
`

Replace with:

`ust
    fn read_loop(
        app_handle: OnceLock<tauri::AppHandle>,
        mut reader: Box<dyn std::io::Read + Send>,
        session_id: String,
        generation: u64,
        cancel: Arc<AtomicBool>,
    ) {
`

Inside the function, at the top of the loop { block (line 115), add a cancellation check:

`ust
    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        match reader.read(&mut buf) {
`

The token is a "fast path" � it triggers exit between reads, not during a blocking read. Dropping the master (which 	erminate does) closes the pipe and the read returns EOF; the token check is belt-and-suspenders.

- [ ] **Step 2: Update 	erminate to flip the token before removing the session**

In src-tauri/src/pty.rs, the 	erminate function (line 258-273) is:

`ust
    pub fn terminate(&self, session_id: &str) {
        let session = {
            let mut sessions = self.sessions.lock();
            sessions.remove(session_id)
        };

        if let Some(mut s) = session {
            let _ = s.child.kill();

            drop(s.writer);
            drop(s.resizer.take());

            if let Some(_handle) = s.read_thread.take() {
            }
        }
    }
`

Replace with:

`ust
    pub fn terminate(&self, session_id: &str) {
        let session = {
            let mut sessions = self.sessions.lock();
            sessions.remove(session_id)
        };

        if let Some(mut s) = session {
            s.cancel.store(true, Ordering::Relaxed);
            let _ = s.child.kill();

            drop(s.writer);
            drop(s.resizer.take());

            if let Some(_handle) = s.read_thread.take() {
            }
        }
    }
`

- [ ] **Step 3: Verify compile**

`ash
cargo check
`

Expected: success.

- [ ] **Step 4: Run existing tests**

`ash
cargo test --lib
`

Expected: PASS, 8 tests (6 original + 2 from Tasks 1, 2).

- [ ] **Step 5: Commit**

`ash
git add src-tauri/src/pty.rs
git commit -m "feat(pty): read_loop checks cancellation token; terminate flips it"
`

---

## Task 5: history.rs make session_start idempotent

**Files:**
- Modify: src-tauri/src/history.rs (the session_start method, line 86-98)

- [ ] **Step 1: Add an early return if a session is already active**

In src-tauri/src/history.rs, the session_start method (line 86) is:

`ust
    pub fn session_start(&self, profile: &str, command: &str, directory: &str) {
        let mut inner = self.inner.lock();
        self.session_end_inner(&mut inner);
        // ... rest sets new session
    }
`

Replace with:

`ust
    pub fn session_start(&self, profile: &str, command: &str, directory: &str) {
        let mut inner = self.inner.lock();
        if inner.current_session.is_some() {
            return;
        }
        self.session_end_inner(&mut inner);
        // ... rest of method unchanged
    }
`

(self.session_end_inner is now defensive; the early return covers the common case.)

- [ ] **Step 2: Add a test**

In src-tauri/src/history.rs, add to the existing mod tests block:

`ust
    #[test]
    fn test_session_start_is_idempotent() {
        let manager = HistoryManager::new();
        manager.session_start("Default", "opencode", "C:\\proj1");
        manager.session_start("Default", "opencode", "C:\\proj2");
        let data = manager.get_data();
        // The second call must not overwrite the first
        assert_eq!(data.current_session.as_ref().unwrap().directory, "C:\\proj1");
    }
`

(Adjust the directory field accessor to match the actual HistoryData struct shape � check the existing tests in the file for the right field name.)

- [ ] **Step 3: Run tests**

`ash
cargo test --lib history
`

Expected: PASS, including 	est_session_start_is_idempotent.

- [ ] **Step 4: Commit**

`ash
git add src-tauri/src/history.rs
git commit -m "feat(history): make session_start idempotent to support multi-panel sessions"
`

---

## Task 6: commands.rs update start_terminal: is_panel suffix + profile param

**Files:**
- Modify: src-tauri/src/commands.rs:347-422 (the start_terminal function)

- [ ] **Step 1: Update the function signature**

In src-tauri/src/commands.rs, replace the start_terminal signature (line 347-357) to add profile: Option<String>:

`ust
#[tauri::command]
pub fn start_terminal(
    pty: State<PtyManager>,
    config: State<AppConfig>,
    history: State<HistoryManager>,
    session_id: String,
    directory: String,
    record_history: Option<bool>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    profile: Option<String>,
) -> Result<u64, String> {
`

- [ ] **Step 2: Update the is_panel check**

Find line 359:

`ust
    let is_panel = session_id == "panel";
`

Replace with:

`ust
    let is_panel = session_id == "panel" || session_id.ends_with("__panel");
`

- [ ] **Step 3: Update the main branch to use the supplied profile**

Find (around line 377-379):

`ust
    let startup_cmd = config.get("startup_command").as_str().unwrap_or("opencode").to_string();
    let cmd_type = config.get("startup_command_type").as_str().unwrap_or("preset").to_string();
    let active_profile = config.get_active_profile();
`

Replace with:

`ust
    let profile_name = profile.as_deref().unwrap_or("Default");
    let get = |key: &str| config.get_for_profile(profile_name, key);
    let startup_cmd = get("startup_command").as_str().unwrap_or("opencode").to_string();
    let cmd_type = get("startup_command_type").as_str().unwrap_or("preset").to_string();
    let active_profile = profile_name.to_string();
`

- [ ] **Step 4: Verify compile**

`ash
cargo check
`

Expected: success.

- [ ] **Step 5: Run all tests**

`ash
cargo test --lib
`

Expected: PASS, 10 tests (6 original + 2 tabs/sidebar + 1 get_for_profile + 1 history).

- [ ] **Step 6: Commit**

`ash
git add src-tauri/src/commands.rs
git commit -m "feat(commands): start_terminal accepts profile param; is_panel uses suffix check"
`

---

## Task 7: commands.rs add end_history_session command

**Files:**
- Modify: src-tauri/src/commands.rs (append after 	erminate_terminal)

- [ ] **Step 1: Add the new command**

In src-tauri/src/commands.rs, after the 	erminate_terminal function, add:

`ust
#[tauri::command]
pub fn end_history_session(history: State<HistoryManager>) {
    history.session_end();
}
`

- [ ] **Step 2: Verify compile**

`ash
cargo check
`

Expected: success.

- [ ] **Step 3: Commit**

`ash
git add src-tauri/src/commands.rs
git commit -m "feat(commands): add end_history_session command for frontend to call"
`

---

## Task 8: commands.rs add ecord_history_activity command

**Files:**
- Modify: src-tauri/src/commands.rs and src-tauri/src/history.rs

- [ ] **Step 1: Add ecord_activity to HistoryManager (if not present)**

In src-tauri/src/history.rs, in impl HistoryManager, add:

`ust
    pub fn record_activity(&self, activity_type: &str, payload: serde_json::Value) {
        let mut inner = self.inner.lock();
        if let Some(session) = inner.current_session.as_mut() {
            session.activities.push(serde_json::json!({
                "type": activity_type,
                "payload": payload,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }));
        }
    }
`

(If the existing data model uses different field names, adapt. The ctivities field must be a Vec<serde_json::Value> or similar append-only collection.)

- [ ] **Step 2: Add the Tauri command**

In src-tauri/src/commands.rs, add:

`ust
#[tauri::command]
pub fn record_history_activity(
    history: State<HistoryManager>,
    activity_type: String,
    payload: serde_json::Value,
) {
    history.record_activity(&activity_type, payload);
}
`

- [ ] **Step 3: Verify compile**

`ash
cargo check
`

Expected: success (or note any missing fields and adapt the ecord_activity implementation).

- [ ] **Step 4: Commit**

`ash
git add src-tauri/src/commands.rs src-tauri/src/history.rs
git commit -m "feat(commands,history): add record_history_activity command"
`

---

## Task 9: commands.rs add 	erminate_tab_sessions(tab_id) + register in lib.rs

**Files:**
- Modify: src-tauri/src/pty.rs (add 	erminate_tab method)
- Modify: src-tauri/src/commands.rs (add command)
- Modify: src-tauri/src/lib.rs (register in generate_handler!)

- [ ] **Step 1: Add 	erminate_tab to PtyManager**

In src-tauri/src/pty.rs, after the existing 	erminate_all method, add:

`ust
    pub fn terminate_tab(&self, tab_id: &str) {
        let prefix = format!("{}__", tab_id);
        let matching: Vec<String> = {
            self.sessions.lock()
                .keys()
                .filter(|k| k.starts_with(&prefix))
                .cloned()
                .collect()
        };
        for sid in matching {
            self.terminate(&sid);
        }
    }
`

- [ ] **Step 2: Add the Tauri command**

In src-tauri/src/commands.rs, add:

`ust
#[tauri::command]
pub fn terminate_tab_sessions(pty: State<PtyManager>, tab_id: String) {
    pty.terminate_tab(&tab_id);
}
`

- [ ] **Step 3: Register the new commands in lib.rs**

In src-tauri/src/lib.rs, the generate_handler! macro (line 130-169) lists all commands. Add commands::end_history_session, commands::record_history_activity, and commands::terminate_tab_sessions to the list, in alphabetical position.

- [ ] **Step 4: Verify compile**

`ash
cargo check
`

Expected: success.

- [ ] **Step 5: Run all tests**

`ash
cargo test --lib
`

Expected: PASS.

- [ ] **Step 6: Commit**

`ash
git add src-tauri/src/pty.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(commands,lib): add terminate_tab_sessions + register new commands"
`

---

# Phase 2: Frontend TabManager state

## Task 10: 	abs.js skeleton + state shape + loadConfig

**Files:**
- Create: rontend/tabs.js

- [ ] **Step 1: Create the file with skeleton**

Create rontend/tabs.js:

`javascript
(function () {
    'use strict';

    var DEFAULT_STATE = function () {
        var id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2);
        return {
            version: 1,
            tabs: [
                { id: id, isMain: true, profile: 'Default' }
            ],
            activeTabId: id,
            tabBarPosition: 'bottom',
            tabBarEnabled: true
        };
    };

    var state = null;
    var _listeners = [];
    var _debounceTimer = null;
    var _sessionsByTab = Object.create(null);
    var _saveInflight = false;

    function genId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function loadConfig(callback) {
        if (!window.monolithApi || !window.monolithApi.get_config) {
            if (callback) callback(null);
            return;
        }
        window.monolithApi.get_config('tabs_state')
            .then(function (val) { if (callback) callback(val); })
            .catch(function () { if (callback) callback(null); });
    }

    window.TabManager = {
        state: function () { return state; },
        activeTabId: function () { return state ? state.activeTabId : null; },
        activeTab: function () {
            if (!state) return null;
            return state.tabs.find(function (t) { return t.id === state.activeTabId; }) || null;
        },
        getSessionsForTab: function (tabId) { return _sessionsByTab[tabId] || null; },
        on: function (fn) { _listeners.push(fn); },
        _emit: function (event) {
            _listeners.forEach(function (fn) { try { fn(event); } catch (e) { console.error(e); } });
        },
        _init_for_test: function (initialState) { state = initialState; }
    };
})();
`

- [ ] **Step 2: Verify file loads (no syntax errors)**

`javascript
// In DevTools console after app loads
console.log(typeof window.TabManager);
`

Expected: "object".

- [ ] **Step 3: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): TabManager skeleton with state shape, loadConfig, genId"
`

---

## Task 11: 	abs.js _sessionsByTab tracking + register/remove

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add egisterSession, unregisterSession, unregisterAllForTab**

In rontend/tabs.js, add to the window.TabManager object:

`javascript
        registerSession: function (tabId, sessionId) {
            if (!_sessionsByTab[tabId]) _sessionsByTab[tabId] = new Set();
            _sessionsByTab[tabId].add(sessionId);
        },
        unregisterSession: function (tabId, sessionId) {
            if (_sessionsByTab[tabId]) {
                _sessionsByTab[tabId].delete(sessionId);
                if (_sessionsByTab[tabId].size === 0) delete _sessionsByTab[tabId];
            }
        },
        unregisterAllForTab: function (tabId) {
            delete _sessionsByTab[tabId];
        },
`

- [ ] **Step 2: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): TabManager session tracking per tab"
`

---

## Task 12: 	abs.js createTab (clones active profile) + tests

**Files:**
- Modify: rontend/tabs.js
- Create: rontend/tabs.test.cjs

- [ ] **Step 1: Add createTab to TabManager**

In rontend/tabs.js, add to the window.TabManager object:

`javascript
        createTab: function (opts) {
            opts = opts || {};
            if (!state) state = DEFAULT_STATE();
            if (state.tabs.length >= 16) {
                console.warn('[TabManager] tab cap reached (16)');
                return null;
            }
            var newTab = {
                id: genId(),
                isMain: false,
                profile: (opts.profile || (this.activeTab() && this.activeTab().profile) || 'Default')
            };
            state.tabs.push(newTab);
            state.activeTabId = newTab.id;
            this._emit({ type: 'tab_created', tab: newTab });
            this._save();
            return newTab;
        },
`

- [ ] **Step 2: Create rontend/tabs.test.cjs with test scaffolding**

Create rontend/tabs.test.cjs:

`javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const tabsSource = fs.readFileSync(path.join(__dirname, 'tabs.js'), 'utf8');

function makeContext(monolithApi) {
    const ctx = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        Promise,
        crypto: { randomUUID: function () {
            return '00000000-0000-4000-8000-' + (Math.random().toString(16).slice(2, 14).padEnd(12, '0'));
        }},
        window: {},
        monolithApi: monolithApi || {
            get_config: () => Promise.resolve(null),
            set_config: () => Promise.resolve(null)
        }
    };
    ctx.window.monolithApi = ctx.monolithApi;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(tabsSource, ctx, { filename: 'tabs.js' });
    return ctx;
}

test('createTab appends a new tab with cloned profile', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({ tabs: [{ id: 'a', isMain: true, profile: 'Work' }], activeTabId: 'a' });
    const before = tm.state().tabs.length;
    const newTab = tm.createTab();
    assert.ok(newTab, 'createTab returns new tab');
    assert.equal(newTab.isMain, false);
    assert.equal(newTab.profile, 'Work', 'clones active profile');
    assert.equal(tm.state().tabs.length, before + 1);
    assert.equal(tm.state().activeTabId, newTab.id);
});
`

- [ ] **Step 3: Run the test**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 1 test.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js frontend/tabs.test.cjs
git commit -m "feat(tabs): createTab with profile clone; test scaffolding"
`

---

## Task 13: 	abs.js closeTab with isMain promotion + tests

**Files:**
- Modify: rontend/tabs.js
- Modify: rontend/tabs.test.cjs

- [ ] **Step 1: Add closeTab to TabManager**

In rontend/tabs.js, add to the window.TabManager object:

`javascript
        closeTab: function (tabId, opts) {
            opts = opts || {};
            if (!state) return null;
            var idx = state.tabs.findIndex(function (t) { return t.id === tabId; });
            if (idx === -1) return null;
            var tab = state.tabs[idx];
            var wasActive = (state.activeTabId === tabId);
            var isOnlyTab = (state.tabs.length === 1);

            if (!opts.skipTerminate && window.monolithApi && window.monolithApi.terminate_tab_sessions) {
                window.monolithApi.terminate_tab_sessions(tabId).catch(function (e) {
                    console.error('[TabManager] terminate_tab_sessions failed', e);
                });
            }

            this.unregisterAllForTab(tabId);
            this._emit({ type: 'tab_closing', tabId: tabId });

            if (isOnlyTab && tab.isMain) {
                this._emit({ type: 'tab_close_main_only', tabId: tabId });
                this._save();
                return { removed: false, switchedTo: null, tab: tab };
            }

            if (tab.isMain) {
                var newMain = state.tabs[idx + 1] || state.tabs[idx - 1];
                if (newMain) newMain.isMain = true;
            }

            state.tabs.splice(idx, 1);

            var switchedTo = null;
            if (wasActive) {
                switchedTo = state.tabs[idx] || state.tabs[idx - 1] || state.tabs[0] || null;
                if (switchedTo) state.activeTabId = switchedTo.id;
            }

            this._emit({ type: 'tab_closed', tabId: tabId, switchedTo: switchedTo });
            this._save();
            return { removed: true, switchedTo: switchedTo, tab: tab };
        },
`

- [ ] **Step 2: Add tests**

In rontend/tabs.test.cjs, add:

`javascript
test('closeTab removes the tab and switches to adjacent', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    let terminateCalls = 0;
    ctx.monolithApi.terminate_tab_sessions = function (id) {
        terminateCalls++;
        assert.equal(id, 'a');
        return Promise.resolve();
    };
    const result = tm.closeTab('a');
    assert.equal(result.removed, true);
    assert.equal(tm.state().tabs.length, 1);
    assert.equal(tm.state().tabs[0].id, 'b');
    assert.equal(tm.state().tabs[0].isMain, true, 'b promoted to isMain');
    assert.equal(tm.state().activeTabId, 'b', 'active switched to b');
    assert.equal(terminateCalls, 1);
});

test('closeTab on the only main tab preserves the tab', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [{ id: 'a', isMain: true, profile: 'Default' }],
        activeTabId: 'a'
    });
    const result = tm.closeTab('a');
    assert.equal(result.removed, false);
    assert.equal(tm.state().tabs.length, 1);
    assert.equal(tm.state().tabs[0].isMain, true);
});
`

- [ ] **Step 3: Run tests**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js frontend/tabs.test.cjs
git commit -m "feat(tabs): closeTab with isMain promotion and only-main edge case"
`

---

## Task 14: 	abs.js eorderTabs + setActiveTab + tests

**Files:**
- Modify: rontend/tabs.js
- Modify: rontend/tabs.test.cjs

- [ ] **Step 1: Add eorderTabs and setActiveTab**

In rontend/tabs.js, add to window.TabManager:

`javascript
        reorderTabs: function (fromIndex, toIndex) {
            if (!state) return;
            if (fromIndex < 0 || fromIndex >= state.tabs.length) return;
            if (toIndex < 0 || toIndex >= state.tabs.length) return;
            if (fromIndex === toIndex) return;
            var moved = state.tabs.splice(fromIndex, 1)[0];
            state.tabs.splice(toIndex, 0, moved);
            this._emit({ type: 'tabs_reordered' });
            this._save();
        },
        setActiveTab: function (tabId) {
            if (!state) return;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            state.activeTabId = tabId;
            this._emit({ type: 'active_tab_changed', tabId: tabId });
            this._save();
        },
`

- [ ] **Step 2: Add tests**

In rontend/tabs.test.cjs, add:

`javascript
test('reorderTabs moves a tab', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' },
            { id: 'c', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    tm.reorderTabs(0, 2);
    assert.deepEqual(tm.state().tabs.map(function (t) { return t.id; }), ['b', 'c', 'a']);
});

test('setActiveTab updates activeTabId', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    let emitted = null;
    tm.on(function (e) { if (e.type === 'active_tab_changed') emitted = e; });
    tm.setActiveTab('b');
    assert.equal(tm.state().activeTabId, 'b');
    assert.ok(emitted);
    assert.equal(emitted.tabId, 'b');
});
`

- [ ] **Step 3: Run tests**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 5 tests.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js frontend/tabs.test.cjs
git commit -m "feat(tabs): reorderTabs and setActiveTab"
`

---

## Task 15: 	abs.js setTabProfile + tests

**Files:**
- Modify: rontend/tabs.js
- Modify: rontend/tabs.test.cjs

- [ ] **Step 1: Add setTabProfile**

In rontend/tabs.js, add to window.TabManager:

`javascript
        setTabProfile: function (tabId, profile) {
            if (!state) return;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            tab.profile = profile;
            this._emit({ type: 'tab_profile_changed', tabId: tabId, profile: profile });
            this._save();
        },
`

- [ ] **Step 2: Add test**

In rontend/tabs.test.cjs, add:

`javascript
test('setTabProfile updates only that tab', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    tm._init_for_test({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    tm.setTabProfile('b', 'Work');
    assert.equal(tm.state().tabs[0].profile, 'Default');
    assert.equal(tm.state().tabs[1].profile, 'Work');
});
`

- [ ] **Step 3: Run tests**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 6 tests.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js frontend/tabs.test.cjs
git commit -m "feat(tabs): setTabProfile"
`

---

## Task 16: 	abs.js estoreFromConfig with normalization + tests

**Files:**
- Modify: rontend/tabs.js
- Modify: rontend/tabs.test.cjs

- [ ] **Step 1: Add init and _normalize**

In rontend/tabs.js, add to window.TabManager:

`javascript
        init: function (callback) {
            var self = this;
            loadConfig(function (raw) {
                if (raw && raw.tabs && Array.isArray(raw.tabs) && raw.tabs.length > 0 && raw.tabBarEnabled) {
                    state = self._normalize(raw);
                } else {
                    state = DEFAULT_STATE();
                    self._save();
                }
                self._emit({ type: 'initialized' });
                if (callback) callback(state);
            });
        },
        _normalize: function (raw) {
            var s = {
                version: raw.version || 1,
                tabs: raw.tabs.slice(),
                activeTabId: raw.activeTabId,
                tabBarPosition: raw.tabBarPosition || 'bottom',
                tabBarEnabled: raw.tabBarEnabled !== false
            };
            var mainCount = s.tabs.filter(function (t) { return t.isMain; }).length;
            if (mainCount === 0 && s.tabs.length > 0) {
                s.tabs[0].isMain = true;
            } else if (mainCount > 1) {
                var firstMain = true;
                s.tabs.forEach(function (t) {
                    if (t.isMain && firstMain) { firstMain = false; }
                    else if (t.isMain) { t.isMain = false; }
                });
            }
            var activeExists = s.tabs.some(function (t) { return t.id === s.activeTabId; });
            if (!activeExists && s.tabs.length > 0) {
                s.activeTabId = s.tabs[0].id;
            }
            return s;
        },
`

- [ ] **Step 2: Add tests**

In rontend/tabs.test.cjs, add:

`javascript
test('restoreFromConfig normalizes isMain invariant (0 mains)', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    const normalized = tm._normalize({
        tabs: [
            { id: 'a', isMain: false, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    assert.equal(normalized.tabs[0].isMain, true);
    assert.equal(normalized.tabs[1].isMain, false);
});

test('restoreFromConfig normalizes isMain invariant (2 mains)', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    const normalized = tm._normalize({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: true, profile: 'Default' }
        ],
        activeTabId: 'a'
    });
    assert.equal(normalized.tabs[0].isMain, true);
    assert.equal(normalized.tabs[1].isMain, false);
});

test('restoreFromConfig falls back to first tab if activeTabId missing', () => {
    const ctx = makeContext();
    const tm = ctx.window.TabManager;
    const normalized = tm._normalize({
        tabs: [
            { id: 'a', isMain: true, profile: 'Default' },
            { id: 'b', isMain: false, profile: 'Default' }
        ],
        activeTabId: 'nonexistent'
    });
    assert.equal(normalized.activeTabId, 'a');
});

test('init with empty tabs creates fresh main tab', (t, done) => {
    const ctx = makeContext({
        get_config: function () { return Promise.resolve({ tabs: [], activeTabId: '', tabBarEnabled: true }); }
    });
    const tm = ctx.window.TabManager;
    tm.init(function (s) {
        assert.equal(s.tabs.length, 1);
        assert.equal(s.tabs[0].isMain, true);
        done();
    });
});
`

- [ ] **Step 3: Run tests**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 10 tests.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js frontend/tabs.test.cjs
git commit -m "feat(tabs): restoreFromConfig with isMain and activeTabId normalization"
`

---

## Task 17: 	abs.js saveToConfig debounce + eforeunload flush

**Files:**
- Modify: rontend/tabs.js
- Modify: rontend/tabs.test.cjs

- [ ] **Step 1: Add _save and lushSave and the beforeunload handler**

In rontend/tabs.js, add to window.TabManager:

`javascript
        _save: function () {
            if (!state) return;
            if (!window.monolithApi || !window.monolithApi.set_config) return;
            if (_debounceTimer) clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(function () {
                _debounceTimer = null;
                _doSave();
            }, 500);
        },
        flushSave: function () {
            if (_debounceTimer) {
                clearTimeout(_debounceTimer);
                _debounceTimer = null;
            }
            _doSave();
        }
    };

    function _doSave() {
        if (!state || !window.monolithApi || !window.monolithApi.set_config) return;
        _saveInflight = true;
        window.monolithApi.set_config('tabs_state', state)
            .catch(function (e) { console.error('[TabManager] save failed', e); })
            .then(function () { _saveInflight = false; });
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', function () {
            if (_debounceTimer) {
                clearTimeout(_debounceTimer);
                _debounceTimer = null;
            }
            _doSave();
        });
    }
})();
`

(Replace the IIFE's closing }; and })(); with the expanded window.TabManager block + eforeunload setup.)

- [ ] **Step 2: Add test for debounce**

In rontend/tabs.test.cjs, add:

`javascript
test('save debounces rapid calls', (t, done) => {
    let saveCount = 0;
    const ctx = makeContext({
        get_config: () => Promise.resolve(null),
        set_config: function (k, v) { saveCount++; return Promise.resolve(); }
    });
    const tm = ctx.window.TabManager;
    tm._init_for_test({ tabs: [{ id: 'a', isMain: true, profile: 'Default' }], activeTabId: 'a' });
    tm._save();
    tm._save();
    tm._save();
    setTimeout(function () {
        assert.equal(saveCount, 1, 'three rapid saves produce one write');
        done();
    }, 600);
});
`

- [ ] **Step 3: Run tests**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 11 tests.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js frontend/tabs.test.cjs
git commit -m "feat(tabs): debounced save with beforeunload flush"
`

---

# Phase 3: Per-tab DOM

## Task 18: 	abs.js initTabTerminal(tabId, dir) lazy xterm + rAF fit

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add per-tab xterm and fit state maps**

In rontend/tabs.js, near the top of the IIFE (after _sessionsByTab declaration), add:

`javascript
    var _terms = Object.create(null);
    var _fitAddons = Object.create(null);
    var _sessionGeneration = Object.create(null);
    var _skipNextEof = Object.create(null);
    var _firstOutput = Object.create(null);
    var _exitTimer = Object.create(null);
    var _terminalRunning = Object.create(null);
`

- [ ] **Step 2: Add initTabTerminal and supporting getters to TabManager**

In rontend/tabs.js, add to the window.TabManager object (before the closing };):

`javascript
        initTabTerminal: function (tabId, dir, opts) {
            opts = opts || {};
            var self = this;
            var sessionId = tabId + '__main';
            var container = document.querySelector('.terminal-instance[data-tab-id="' + tabId + '"]');
            if (!container) {
                console.error('[TabManager] no terminal-instance for tab', tabId);
                return Promise.resolve({ success: false, error: 'no container' });
            }

            if (_terms[tabId]) {
                try { _terms[tabId].dispose(); } catch (e) {}
                _terms[tabId] = null;
            }
            _fitAddons[tabId] = null;
            _firstOutput[tabId] = true;
            if (_exitTimer[tabId]) { clearTimeout(_exitTimer[tabId]); _exitTimer[tabId] = null; }
            container.innerHTML = '';

            if (typeof Terminal === 'undefined') {
                container.innerHTML = '<div style="color:#c0c0c0;padding:20px;font-family:monospace;">Error: Terminal library failed to load.</div>';
                return Promise.resolve({ success: false, error: 'no Terminal' });
            }

            var term = new Terminal({
                allowTransparency: true,
                fontFamily: '"Cascadia Mono", "Consolas", "Lucida Console", "Courier New", monospace',
                fontSize: 14,
                scrollback: 2000,
                smoothScrollDuration: 0,
                scrollSensitivity: 1,
                allowProposedApi: true,
                windowsMode: true,
                minimumContrastRatio: 1,
                fastScrollModifier: 'alt',
                fastScrollSensitivity: 5,
                scrollOnUserInput: true
            });
            term.open(container);
            term.focus();

            var fit = null;
            if (typeof FitAddon !== 'undefined') {
                fit = new FitAddon.FitAddon();
                term.loadAddon(fit);
            }
            _terms[tabId] = term;
            _fitAddons[tabId] = fit;
            _terminalRunning[tabId] = false;

            this.registerSession(tabId, sessionId);

            return new Promise(function (resolve) {
                requestAnimationFrame(function () {
                    if (fit) fit.fit();
                    var profile = (self.activeTab() && self.activeTab().profile) || 'Default';
                    var recordHistory = opts.recordHistory !== false;
                    window.monolithApi.start_terminal(sessionId, dir, recordHistory, opts.shell || null, term.cols, term.rows)
                        .then(function (result) {
                            if (!result || !result.success) {
                                term.writeln('Failed to start. ' + (result && result.error ? result.error : ''));
                                resolve({ success: false });
                                return;
                            }
                            _terminalRunning[tabId] = true;
                            _sessionGeneration[sessionId] = result.generation || 0;
                            resolve({ success: true, generation: result.generation });
                        })
                        .catch(function (err) {
                            term.writeln('Error: ' + err);
                            resolve({ success: false, error: String(err) });
                        });
                });
            });
        },
        getTerminal: function (tabId) { return _terms[tabId] || null; },
        getFitAddon: function (tabId) { return _fitAddons[tabId] || null; },
        isTerminalRunning: function (tabId) { return !!_terminalRunning[tabId]; },
        setSkipNextEof: function (sessionId, val) { _skipNextEof[sessionId] = !!val; },
        getSkipNextEof: function (sessionId) { return !!_skipNextEof[sessionId]; },
        setSessionGeneration: function (sessionId, gen) { _sessionGeneration[sessionId] = gen; },
        getSessionGeneration: function (sessionId) { return _sessionGeneration[sessionId] || 0; },
        clearExitTimer: function (tabId) {
            if (_exitTimer[tabId]) { clearTimeout(_exitTimer[tabId]); _exitTimer[tabId] = null; }
        },
        scheduleExitTimer: function (tabId, fn, ms) {
            this.clearExitTimer(tabId);
            _exitTimer[tabId] = setTimeout(fn, ms);
        },
        isFirstOutput: function (tabId) {
            var v = !!_firstOutput[tabId];
            if (v) _firstOutput[tabId] = false;
            return v;
        },
`

- [ ] **Step 3: Verify the file still parses**

`ash
node -e "new Function(require('fs').readFileSync('frontend/tabs.js', 'utf8'));"
`

Expected: no errors.

- [ ] **Step 4: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): per-tab xterm init with lazy creation and rAF fit"
`

---

## Task 19: 	abs.js switchTo(tabId) visibility toggle + fit

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add switchTo method**

In rontend/tabs.js, add to window.TabManager:

`javascript
        switchTo: function (tabId) {
            if (!state) return;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            if (state.activeTabId === tabId) return;

            state.activeTabId = tabId;

            var instances = document.querySelectorAll('.terminal-instance');
            instances.forEach(function (el) {
                el.style.display = (el.getAttribute('data-tab-id') === tabId) ? 'block' : 'none';
            });

            var slEl = document.getElementById('simplified-landing');
            if (slEl) slEl.style.display = 'none';

            var term = _terms[tabId];
            var fit = _fitAddons[tabId];
            if (term && fit) {
                requestAnimationFrame(function () {
                    fit.fit();
                    if (window.monolithApi && window.monolithApi.resize_terminal) {
                        window.monolithApi.resize_terminal(tabId + '__main', term.cols, term.rows);
                    }
                });
            }

            this._emit({ type: 'active_tab_changed', tabId: tabId });
            this._save();
        },
`

- [ ] **Step 2: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): switchTo with visibility toggle and rAF fit"
`

---

## Task 20: 	abs.js handleBack(tabId) (terminate + simplified landing)

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add handleBack and _backToSimplifiedLanding**

In rontend/tabs.js, add to window.TabManager:

`javascript
        handleBack: function (tabId) {
            var self = this;
            var tab = state.tabs.find(function (t) { return t.id === tabId; });
            if (!tab) return;
            var running = _terminalRunning[tabId];
            var proceed = function () { self._backToSimplifiedLanding(tabId); };
            if (running) {
                if (typeof window.showConfirm === 'function') {
                    window.showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
                        .then(proceed).catch(function () {});
                } else if (confirm('Return to launcher? The current session will be terminated.')) {
                    proceed();
                }
            } else {
                proceed();
            }
        },
        _backToSimplifiedLanding: function (tabId) {
            if (window.monolithApi && window.monolithApi.terminate_terminal) {
                window.monolithApi.terminate_terminal(tabId + '__main').catch(function () {});
            }
            this.unregisterSession(tabId, tabId + '__main');

            var term = _terms[tabId];
            if (term) { try { term.dispose(); } catch (e) {} _terms[tabId] = null; }
            _fitAddons[tabId] = null;
            _terminalRunning[tabId] = false;
            this.clearExitTimer(tabId);

            var container = document.querySelector('.terminal-instance[data-tab-id="' + tabId + '"]');
            if (container) container.innerHTML = '';

            if (window.simplifiedLanding && window.simplifiedLanding.renderInto) {
                window.simplifiedLanding.renderInto(container, tabId);
            }
            this._emit({ type: 'back_to_simplified', tabId: tabId });
        },
`

- [ ] **Step 2: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): handleBack with confirm and simplified landing"
`

---

## Task 21: 	abs.js closeTab per-tab cleanup (xterm, maps, _sessionsByTab)

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Extend closeTab to clean up per-tab state**

In rontend/tabs.js, modify the existing closeTab (from Task 13). After the 	his.unregisterAllForTab(tabId); line, add the cleanup block:

`javascript
            this.unregisterAllForTab(tabId);
            this._emit({ type: 'tab_closing', tabId: tabId });

            // Dispose xterm and clear per-tab maps
            if (_terms[tabId]) { try { _terms[tabId].dispose(); } catch (e) {} _terms[tabId] = null; }
            _fitAddons[tabId] = null;
            _terminalRunning[tabId] = false;
            this.clearExitTimer(tabId);
            delete _sessionGeneration[tabId + '__main'];
            delete _sessionGeneration[tabId + '__panel'];
            delete _skipNextEof[tabId + '__main'];
            delete _skipNextEof[tabId + '__panel'];
            delete _firstOutput[tabId];
`

- [ ] **Step 2: Run all tab tests**

`ash
node --test frontend/tabs.test.cjs
`

Expected: PASS, 11 tests.

- [ ] **Step 3: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): closeTab disposes xterm and clears per-tab maps"
`

---

# Phase 4: Tab bar UI

## Task 22: 	abs.js enderTabs() markup (div, not button)

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add enderTabs method**

In rontend/tabs.js, add to window.TabManager:

`javascript
        renderTabs: function () {
            var bar = document.getElementById('tab-bar');
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!bar || !tabsContainer) return;
            if (!state) return;

            tabsContainer.innerHTML = '';

            state.tabs.forEach(function (tab) {
                var chip = document.createElement('div');
                chip.className = 'tab-chip';
                if (tab.id === state.activeTabId) chip.classList.add('active');
                if (tab.isMain) chip.classList.add('is-main');
                chip.setAttribute('data-tab-id', tab.id);

                var label = document.createElement('span');
                label.className = 'tab-chip-profile';
                label.textContent = tab.profile || 'Default';
                chip.appendChild(label);

                if (tab.isMain) {
                    var badge = document.createElement('span');
                    badge.className = 'tab-chip-main-badge';
                    badge.setAttribute('data-tooltip', 'Main tab');
                    badge.textContent = '\u25CF';
                    chip.appendChild(badge);
                }

                var closeBtn = document.createElement('button');
                closeBtn.className = 'tab-chip-close';
                closeBtn.setAttribute('data-tab-id', tab.id);
                closeBtn.setAttribute('data-tooltip', 'Close');
                closeBtn.textContent = '\u00d7';
                chip.appendChild(closeBtn);

                tabsContainer.appendChild(chip);
            });

            if (state.tabs.length < 16) {
                var addBtn = document.createElement('button');
                addBtn.className = 'tab-chip-add';
                addBtn.id = 'tab-add-btn';
                addBtn.setAttribute('data-tooltip', 'New Tab');
                addBtn.textContent = '+';
                tabsContainer.appendChild(addBtn);
            }
        },
`

- [ ] **Step 2: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): renderTabs DOM markup with div-based chips"
`

---

## Task 23: style.css tab bar base styles

**Files:**
- Modify: rontend/style.css (append)

- [ ] **Step 1: Add tab bar base styles**

Append to rontend/style.css:

`css
.tab-bar {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    padding: 0 8px;
    height: 44px;
    background: rgba(20, 20, 20, 0.92);
    border-top: 1px solid var(--border-dark);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

.tab-bar-bottom {
    bottom: 0;
    border-top: 1px solid var(--border-dark);
    border-bottom: none;
}

.tab-bar-top {
    top: 0;
    border-bottom: 1px solid var(--border-dark);
    border-top: none;
}

body.tab-bar-bottom { padding-bottom: 44px; }
body.tab-bar-top { padding-top: 44px; }
body.tab-bar-disabled .tab-bar { display: none; }
body.tab-bar-disabled { padding-bottom: 0 !important; padding-top: 0 !important; }

.tab-bar-tabs {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    flex-wrap: nowrap;
    height: 100%;
    scrollbar-width: thin;
}

.tab-bar-tabs::-webkit-scrollbar { height: 4px; }
.tab-bar-tabs::-webkit-scrollbar-thumb { background: var(--border-muted); border-radius: 2px; }

.tab-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    height: 30px;
    min-width: 80px;
    max-width: 200px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-dark);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
    transition: background 0.15s ease, border-color 0.15s ease;
}

.tab-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--border-muted);
}

.tab-chip.active {
    background: rgba(250, 178, 131, 0.15);
    border-color: var(--accent-primary);
    color: var(--text-primary);
}

.tab-chip.is-main .tab-chip-main-badge {
    color: var(--accent-primary);
    font-size: 10px;
}

.tab-chip-profile {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
}

.tab-chip-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 4px;
    font-size: 14px;
    line-height: 1;
    border-radius: 3px;
}

.tab-chip-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
}

.tab-chip-add {
    background: rgba(20, 20, 20, 0.95);
    border: 1px dashed var(--border-muted);
    color: var(--text-muted);
    cursor: pointer;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
    position: sticky;
    right: 0;
}

.tab-chip-add:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
}

.terminal-instance {
    width: 100%;
    height: calc(100vh - 44px);
    display: none;
}

.terminal-instance.active {
    display: block;
}
`

- [ ] **Step 2: Commit**

`ash
git add frontend/style.css
git commit -m "feat(style): tab bar base styles with CTA theme and overflow scroll"
`

---

## Task 25: 	abs.js drag-reorder (mousedown/move/up)

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add drag handling**

In rontend/tabs.js, add to window.TabManager:

`javascript
        _setupDragHandlers: function () {
            var self = this;
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!tabsContainer) return;
            var draggedFrom = null;
            var dragGhost = null;

            tabsContainer.addEventListener('mousedown', function (e) {
                var chip = e.target.closest('.tab-chip');
                if (!chip) return;
                var tabId = chip.getAttribute('data-tab-id');
                if (!tabId) return;
                if (e.target.classList.contains('tab-chip-close')) return;
                if (e.target.classList.contains('tab-chip-main-badge')) return;

                var fromIndex = state.tabs.findIndex(function (t) { return t.id === tabId; });
                if (fromIndex === -1) return;

                draggedFrom = fromIndex;
                var startX = e.clientX;
                var chipRect = chip.getBoundingClientRect();

                function onMove(ev) {
                    if (draggedFrom === null) return;
                    var dx = ev.clientX - startX;
                    if (!dragGhost) {
                        dragGhost = chip.cloneNode(true);
                        dragGhost.style.position = 'fixed';
                        dragGhost.style.left = chipRect.left + 'px';
                        dragGhost.style.top = chipRect.top + 'px';
                        dragGhost.style.width = chipRect.width + 'px';
                        dragGhost.style.opacity = '0.8';
                        dragGhost.style.zIndex = '9999';
                        dragGhost.style.pointerEvents = 'none';
                        document.body.appendChild(dragGhost);
                    }
                    dragGhost.style.left = (chipRect.left + dx) + 'px';
                }

                function onUp(ev) {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
                    if (draggedFrom === null) return;
                    var dropX = ev.clientX;
                    var chips = Array.prototype.slice.call(tabsContainer.querySelectorAll('.tab-chip'));
                    var toIndex = draggedFrom;
                    for (var i = 0; i < chips.length; i++) {
                        var rect = chips[i].getBoundingClientRect();
                        if (dropX < rect.left + rect.width / 2) {
                            toIndex = i;
                            break;
                        }
                        toIndex = i + 1;
                    }
                    if (toIndex > chips.length) toIndex = chips.length;
                    if (toIndex !== draggedFrom) {
                        self.reorderTabs(draggedFrom, toIndex);
                        self.renderTabs();
                    }
                    draggedFrom = null;
                }

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        },
`

- [ ] **Step 2: Add DOMContentLoaded hook to set up handlers**

In rontend/tabs.js, just before the IIFE close, add:

`javascript
    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', function () {
            if (window.TabManager) {
                if (window.TabManager._setupDragHandlers) window.TabManager._setupDragHandlers();
                if (window.TabManager._setupClickHandlers) window.TabManager._setupClickHandlers();
                if (window.TabManager._setupContextMenu) window.TabManager._setupContextMenu();
            }
        });
    }
`

- [ ] **Step 3: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): drag-reorder via raw mouse events"
`

---

## Task 26: 	abs.js right-click context menu (Close, Close Others)

**Files:**
- Modify: rontend/tabs.js
- Modify: rontend/style.css

- [ ] **Step 1: Add _setupContextMenu and _closeOthers**

In rontend/tabs.js, add to window.TabManager:

`javascript
        _setupContextMenu: function () {
            var self = this;
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!tabsContainer) return;
            var menu = document.createElement('div');
            menu.className = 'tab-context-menu';
            menu.style.display = 'none';
            menu.innerHTML = '<button data-action="close">Close</button><button data-action="close-others">Close Others</button>';
            document.body.appendChild(menu);

            var currentTabId = null;

            tabsContainer.addEventListener('contextmenu', function (e) {
                var chip = e.target.closest('.tab-chip');
                if (!chip) return;
                e.preventDefault();
                currentTabId = chip.getAttribute('data-tab-id');
                menu.style.left = e.clientX + 'px';
                menu.style.top = e.clientY + 'px';
                menu.style.display = 'block';
            });

            menu.addEventListener('click', function (e) {
                var action = e.target.getAttribute('data-action');
                if (!action || !currentTabId) return;
                menu.style.display = 'none';
                if (action === 'close') {
                    self.closeTab(currentTabId);
                    self.renderTabs();
                } else if (action === 'close-others') {
                    self._closeOthers(currentTabId);
                }
            });

            document.addEventListener('click', function (e) {
                if (!menu.contains(e.target)) menu.style.display = 'none';
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') menu.style.display = 'none';
            });
        },
        _closeOthers: function (keepTabId) {
            if (!state) return;
            var keepTab = state.tabs.find(function (t) { return t.id === keepTabId; });
            if (!keepTab) return;
            var mainTab = state.tabs.find(function (t) { return t.isMain; });
            var toClose = state.tabs.filter(function (t) {
                return t.id !== keepTabId && t.id !== (mainTab && mainTab.id);
            });
            if (toClose.length === 0) return;
            var self = this;
            var hasRunning = toClose.some(function (t) { return self.isTerminalRunning(t.id); });
            var proceed = function () {
                toClose.forEach(function (t) { self.closeTab(t.id); });
                self.renderTabs();
            };
            if (hasRunning) {
                if (typeof window.showConfirm === 'function') {
                    window.showConfirm('Close Other Tabs', 'One or more other tabs have running sessions. Close them anyway?').then(proceed).catch(function () {});
                } else if (confirm('Close other tabs?')) proceed();
            } else {
                proceed();
            }
        },
`

- [ ] **Step 2: Add CSS for the menu**

Append to rontend/style.css:

`css
.tab-context-menu {
    position: fixed;
    z-index: 10000;
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid var(--border-muted);
    border-radius: 6px;
    padding: 4px;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
.tab-context-menu button {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    padding: 6px 12px;
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    border-radius: 4px;
}
.tab-context-menu button:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
}
`

- [ ] **Step 3: Commit**

`ash
git add frontend/tabs.js frontend/style.css
git commit -m "feat(tabs,style): right-click context menu with Close and Close Others"
`

---

## Task 27: 	abs.js + button (create parallel tab) + X button (close with stopPropagation)

**Files:**
- Modify: rontend/tabs.js

- [ ] **Step 1: Add _setupClickHandlers**

In rontend/tabs.js, add to window.TabManager:

`javascript
        _setupClickHandlers: function () {
            var self = this;
            var tabsContainer = document.getElementById('tab-bar-tabs');
            if (!tabsContainer) return;

            tabsContainer.addEventListener('click', function (e) {
                var closeBtn = e.target.closest('.tab-chip-close');
                if (closeBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    var tabId = closeBtn.getAttribute('data-tab-id');
                    if (tabId) {
                        if (self.isTerminalRunning(tabId)) {
                            if (typeof window.showConfirm === 'function') {
                                window.showConfirm('Close Tab', 'A terminal session is running in this tab. Close it anyway?')
                                    .then(function () { self.closeTab(tabId); self.renderTabs(); })
                                    .catch(function () {});
                            } else if (confirm('Close tab?')) {
                                self.closeTab(tabId);
                                self.renderTabs();
                            }
                        } else {
                            self.closeTab(tabId);
                            self.renderTabs();
                        }
                    }
                    return;
                }
                var addBtn = e.target.closest('.tab-chip-add');
                if (addBtn) {
                    var newTab = self.createTab();
                    if (newTab) {
                        self.renderTabs();
                        var container = document.querySelector('.terminal-instance[data-tab-id="' + newTab.id + '"]');
                        if (container && window.simplifiedLanding) {
                            window.simplifiedLanding.renderInto(container, newTab.id);
                        }
                    }
                    return;
                }
                var chip = e.target.closest('.tab-chip');
                if (chip) {
                    var tid = chip.getAttribute('data-tab-id');
                    if (tid) {
                        self.switchTo(tid);
                        self.renderTabs();
                    }
                }
            });
        },
`

- [ ] **Step 2: Commit**

`ash
git add frontend/tabs.js
git commit -m "feat(tabs): + button creates parallel tab; X button with stopPropagation"
`

---

# Phase 5: Simplified landing

## Task 29: simplified-landing.js render template

**Files:**
- Create: rontend/simplified-landing.js

- [ ] **Step 1: Create the file**

Create rontend/simplified-landing.js:

`javascript
(function () {
    'use strict';

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderInto(container, tabId) {
        var tab = window.TabManager && window.TabManager.state().tabs.find(function (t) { return t.id === tabId; });
        if (!tab) {
            console.error('[simplified-landing] no tab for', tabId);
            return;
        }
        var profile = tab.profile || 'Default';
        container.innerHTML = ''
            + '<div class="simplified-landing-inner">'
            + '  <div class="sl-header">'
            + '    <button class="sl-profile-btn" id="sl-profile-btn-' + escapeHtml(tabId) + '">'
            + '      <span class="sl-profile-name">' + escapeHtml(profile) + '</span>'
            + '      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
            + '    </button>'
            + '  </div>'
            + '  <div class="sl-actions">'
            + '    <button class="sl-choose-dir" id="sl-choose-' + escapeHtml(tabId) + '">'
            + '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
            + '      <span>Choose Project Directory</span>'
            + '    </button>'
            + '    <button class="sl-open-last" id="sl-open-last-' + escapeHtml(tabId) + '" data-tooltip="Uses the last directory opened in any tab">'
            + '      <span>Open Terminal in Last Directory</span>'
            + '    </button>'
            + '  </div>'
            + '  <div class="sl-hint">'
            + '    <kbd>Ctrl</kbd>+<kbd>P</kbd> Commands &nbsp;&middot;&nbsp; <kbd>Ctrl</kbd>+<kbd>,</kbd> Settings'
            + '  </div>'
            + '</div>';

        var profileBtn = document.getElementById('sl-profile-btn-' + tabId);
        if (profileBtn) {
            profileBtn.addEventListener('click', function () {
                if (typeof window.openProfileSwitcher === 'function') {
                    window.openProfileSwitcher('tab', tabId);
                }
            });
        }
        var chooseBtn = document.getElementById('sl-choose-' + tabId);
        if (chooseBtn) chooseBtn.addEventListener('click', function () { chooseDirectory(tabId); });
        var openLastBtn = document.getElementById('sl-open-last-' + tabId);
        if (openLastBtn) openLastBtn.addEventListener('click', function () { openLastDirectory(tabId); });
    }

    function chooseDirectory(tabId) {
        if (!window.monolithApi || !window.monolithApi.pick_directory) return;
        window.monolithApi.pick_directory()
            .then(function (res) {
                if (res && res.path) {
                    if (window.monolithApi.save_last_directory) {
                        window.monolithApi.save_last_directory(res.path);
                    }
                    if (window.TabManager && window.TabManager.initTabTerminal) {
                        window.TabManager.initTabTerminal(tabId, res.path);
                    }
                }
            })
            .catch(function (e) { console.error('[simplified-landing] pick_directory failed', e); });
    }

    function openLastDirectory(tabId) {
        if (!window.monolithApi || !window.monolithApi.get_last_directory) return;
        window.monolithApi.get_last_directory()
            .then(function (res) {
                if (res && res.path) {
                    if (window.TabManager && window.TabManager.initTabTerminal) {
                        window.TabManager.initTabTerminal(tabId, res.path);
                    }
                } else {
                    chooseDirectory(tabId);
                }
            })
            .catch(function () { chooseDirectory(tabId); });
    }

    window.simplifiedLanding = { renderInto: renderInto };
})();
`

- [ ] **Step 2: Commit**

`ash
git add frontend/simplified-landing.js
git commit -m "feat(simplified-landing): render template with profile, choose dir, open last"
`

---

# Phase 6: app.js refactor

## Task 32: pp.js refactor state into TabManager maps

**Files:**
- Modify: rontend/app.js (lines 12-38, the module-level terminal state declarations)

- [ ] **Step 1: Replace module-level state with legacy aliases + comment**

In rontend/app.js, the top of the IIFE has these declarations:

`javascript
    let term = null;
    let fitAddon = null;
    let webglAddon = null;
    var _skipNextEof = { main: false, panel: false };
    var _sessionGeneration = { main: 0, panel: 0 };
    var _panelRunning = false;
    var _terminalRunning = false;
    var _firstOutput = true;
    var _exitTimer = null;
`

Replace with:

`javascript
    // NOTE: term/fitAddon/_sessionGeneration/_skipNextEof are now per-tab
    // and owned by TabManager. The declarations below are kept temporarily
    // for backward compat with sidebar.js during the refactor; they are
    // aliased to the active tab's state via _syncActiveTabState() (added
    // in Task 37). They will be removed in a follow-up cleanup.
    let term = null;
    let fitAddon = null;
    let webglAddon = null;
    var _skipNextEof = { main: false, panel: false };
    var _sessionGeneration = { main: 0, panel: 0 };
    var _panelRunning = false;
`

- [ ] **Step 2: Commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): mark module-level terminal state as legacy, defer to TabManager"
`

---

## Task 33: pp.js rewrite writeToTerm suffix-based routing

**Files:**
- Modify: rontend/app.js (lines 1996-2061, the writeToTerm arrow function)

- [ ] **Step 1: Replace the writeToTerm function with suffix-based routing**

In rontend/app.js, find the window.writeToTerm = (data, eof, sessionId, generation) => { ... } block. Replace the body with:

`javascript
        window.writeToTerm = (data, eof, sessionId, generation) => {
            sessionId = sessionId || '';
            generation = generation || 0;

            if (!sessionId) {
                console.warn('[Monoloth] writeToTerm: missing sessionId, dropping event');
                return;
            }

            if (window.TabManager) {
                if (generation > 0 && window.TabManager.getSessionGeneration(sessionId) > 0 &&
                    generation < window.TabManager.getSessionGeneration(sessionId)) {
                    return;
                }
                if (eof && window.TabManager.getSkipNextEof(sessionId)) {
                    window.TabManager.setSkipNextEof(sessionId, false);
                    return;
                }
            }

            if (sessionId === 'main' || sessionId.endsWith('__main')) {
                var tabId = sessionId === 'main' ? (window.TabManager && window.TabManager.activeTabId()) : sessionId.slice(0, -6);
                if (!tabId) return;
                var t = window.TabManager && window.TabManager.getTerminal(tabId);
                if (t) {
                    if (eof) {
                        t.write(data);
                        if (window.TabManager && window.TabManager.scheduleExitTimer) {
                            window.TabManager.scheduleExitTimer(tabId, function () {
                                if (window.TabManager && window.TabManager.handleBack) {
                                    window.TabManager.handleBack(tabId);
                                }
                            }, 5000);
                        }
                        return;
                    }
                    t.write(data);
                    if (window.TabManager && window.TabManager.isFirstOutput && window.TabManager.isFirstOutput(tabId)) {
                        setTimeout(function () { var f = window.TabManager.getFitAddon(tabId); if (f) f.fit(); }, 1500);
                    }
                    if (window.TabManager && window.TabManager.clearExitTimer) {
                        window.TabManager.clearExitTimer(tabId);
                    }
                }
            } else if (sessionId === 'panel' || sessionId.endsWith('__panel')) {
                if (typeof window.SidebarManager !== 'undefined') {
                    if (eof) {
                        window.SidebarManager.terminateCmdPanel();
                    } else if (data) {
                        window.SidebarManager.writeToPanel(data);
                    }
                }
            } else if (sessionId.includes('__bg__')) {
                if (typeof window.SidebarManager !== 'undefined' && data && window.SidebarManager.writeToBgPanel) {
                    window.SidebarManager.writeToBgPanel(sessionId, data);
                }
            }
        };
`

- [ ] **Step 2: Verify by manual QA**

Run the app, create a tab, spawn a terminal, confirm output appears. Spawn the panel, confirm panel output still routes to SidebarManager.

- [ ] **Step 3: Commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): writeToTerm uses suffix-based routing for composite session IDs"
`

---

## Task 34: pp.js refactor initTerminal ? TabManager.initTabTerminal

**Files:**
- Modify: rontend/app.js (lines 1814-1895)

- [ ] **Step 1: Replace initTerminal body with a thin delegation**

In rontend/app.js, find unction initTerminal(dir) { and replace its body with:

`javascript
    function initTerminal(dir) {
        if (!window.TabManager) {
            console.error('[Monoloth] TabManager not loaded; cannot init terminal');
            return;
        }
        var tabId = window.TabManager.activeTabId();
        if (!tabId) return;
        window.TabManager.initTabTerminal(tabId, dir);
    }
`

The actual xterm creation, fit, and PTY spawn logic now lives in TabManager.initTabTerminal (Task 18).

- [ ] **Step 2: Verify**

Run the app, click "Choose Directory" on the landing, confirm terminal opens.

- [ ] **Step 3: Commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): initTerminal delegates to TabManager.initTabTerminal"
`

---

## Task 35: pp.js refactor showTerminal ? TabManager.switchTo

**Files:**
- Modify: rontend/app.js (lines 1742-1760)

- [ ] **Step 1: Replace showTerminal body**

In rontend/app.js, find unction showTerminal(dir) { and replace:

`javascript
    function showTerminal(dir) {
        if (!window.TabManager) return;
        setCurrentView('terminal');
        if (landing) landing.classList.add('hidden');
        if (settingsPage) settingsPage.classList.remove('active');
        if (terminalView) terminalView.classList.add('active');
        var tabId = window.TabManager.activeTabId();
        window.TabManager.switchTo(tabId);
        if (dir) {
            window.TabManager.initTabTerminal(tabId, dir);
        }
        loadBackgroundConfig();
        if (typeof window.SidebarManager !== 'undefined') {
            window.SidebarManager.show();
            setTimeout(function () { window.SidebarManager.restorePanelState(); }, 200);
        }
    }
`

- [ ] **Step 2: Verify and commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): showTerminal delegates to TabManager.switchTo"
`

---

## Task 36: pp.js refactor ackToLanding ? TabManager.handleBack

**Files:**
- Modify: rontend/app.js (lines 1769-1795)

- [ ] **Step 1: Replace ackToLanding body**

In rontend/app.js, find unction backToLanding() { and replace:

`javascript
    function backToLanding() {
        if (!window.TabManager) return;
        var tabId = window.TabManager.activeTabId();
        if (!tabId) return;
        var state = window.TabManager.state();
        var tab = state.tabs.find(function (t) { return t.id === tabId; });
        if (tab && tab.isMain && state.tabs.length === 1) {
            window.TabManager.handleBack(tabId);
            setCurrentView('landing');
            if (landing) landing.classList.remove('hidden');
            if (terminalView) terminalView.classList.remove('active');
        } else {
            window.TabManager.handleBack(tabId);
        }
    }
`

Also update the existing 	erminal-back-btn click handler (lines 1797-1808) to use this same ackToLanding().

- [ ] **Step 2: Verify and commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): backToLanding delegates to TabManager.handleBack with main-only branch"
`

---

## Task 37: pp.js refactor MonolothApp facade

**Files:**
- Modify: rontend/app.js (lines 3589-3628)

- [ ] **Step 1: Update the facade**

In rontend/app.js, replace the window.MonolothApp = { ... } block with:

`javascript
    window.MonolothApp = {
        getCurrentDir: function () { return _currentLaunchDir; },
        getActiveTabId: function () { return window.TabManager ? window.TabManager.activeTabId() : null; },
        restartSession: function (tabId) {
            tabId = tabId || (window.TabManager && window.TabManager.activeTabId());
            if (!tabId || !window.TabManager) return;
            if (window.TabManager.isTerminalRunning(tabId)) {
                window.TabManager.setSkipNextEof(tabId + '__main', true);
                window.monolithApi.terminate_terminal(tabId + '__main')
                    .finally(function () {
                        window.TabManager.setSkipNextEof(tabId + '__main', false);
                        window.TabManager.initTabTerminal(tabId, _currentLaunchDir);
                    });
            } else {
                window.TabManager.initTabTerminal(tabId, _currentLaunchDir);
            }
        },
        setSkipNextEof: function (sessionId, val) {
            if (window.TabManager) window.TabManager.setSkipNextEof(sessionId, val);
        },
        setSessionGeneration: function (sessionId, gen) {
            if (window.TabManager) window.TabManager.setSessionGeneration(sessionId, gen);
        },
        refitTerminals: function () {
            if (!window.TabManager) return;
            var tabId = window.TabManager.activeTabId();
            if (!tabId) return;
            var t = window.TabManager.getTerminal(tabId);
            var f = window.TabManager.getFitAddon(tabId);
            if (t && f) {
                f.fit();
                if (window.monolithApi) window.monolithApi.resize_terminal(tabId + '__main', t.cols, t.rows);
            }
        },
        isMainActive: function () {
            var tabId = window.TabManager && window.TabManager.activeTabId();
            return window.TabManager ? window.TabManager.isTerminalRunning(tabId) : false;
        }
    };
`

- [ ] **Step 2: Commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): MonolothApp facade uses TabManager and composite session keys"
`

---

## Task 38: ridge.js setupPtyListener drop missing sessionId

**Files:**
- Modify: rontend/tauri-bridge.js (the setupPtyListener function, ~line 430)

- [ ] **Step 1: Update setupPtyListener to drop events with missing sessionId**

In rontend/tauri-bridge.js, find setupPtyListener. Replace with:

`javascript
    function setupPtyListener() {
        listen('pty-output', function (event) {
            var payload = event.payload || {};
            var sessionId = payload.sessionId;
            if (!sessionId) {
                console.warn('[MonolothBridge] pty-output event missing sessionId, dropping');
                return;
            }
            var generation = payload.generation || 0;
            if (payload.eof) {
                if (window.writeToTerm) window.writeToTerm('\r\n\x1b[90m[Process exited]\x1b[0m\r\n', true, sessionId, generation);
                return;
            }
            if (window.writeToTerm) {
                window.writeToTerm(payload.data || '', false, sessionId, generation);
            }
        }).catch(function (e) {
            console.error('Failed to set up PTY listener:', e);
        });
    }
`

- [ ] **Step 2: Commit**

`ash
git add frontend/tauri-bridge.js
git commit -m "feat(bridge): setupPtyListener drops events with missing sessionId"
`

---

## Task 39: pp.js keyboard shortcut re-registration on tab switch

**Files:**
- Modify: rontend/app.js

- [ ] **Step 1: Find the existing shortcut binding**

Search rontend/app.js for the function that calls loadShortcuts and binds Ctrl+P / Ctrl+,. The function is around loadShortcuts (line 95) and the bind happens via indShortcut or similar.

- [ ] **Step 2: Wrap binding in a re-registerable function and call on tab switch**

Refactor the binding into a egisterShortcuts(shortcuts) function. Subscribe to TabManager.on('active_tab_changed') to re-register.

The exact code depends on the existing structure. Pattern:

`javascript
    function registerShortcuts(shortcuts) {
        // unregister old handlers (if tracked)
        // bind new ones from the active tab's profile
    }
    if (window.TabManager) {
        window.TabManager.on(function (e) {
            if (e.type === 'active_tab_changed') {
                var tab = window.TabManager.activeTab();
                if (tab) {
                    // Load profile's shortcuts and re-register
                    // (use the same code path that the existing loadShortcuts uses)
                }
            }
        });
    }
`

- [ ] **Step 3: Verify and commit**

`ash
git add frontend/app.js
git commit -m "refactor(app): re-register keyboard shortcuts on tab switch"
`

---

## Task 40: ridge.js remove start_opencode/	erminate; composite keys via TabManager

**Files:**
- Modify: rontend/tauri-bridge.js

- [ ] **Step 1: Find references**

`ash
grep -r "monolithApi.start_opencode\|monolithApi.terminate\b" frontend/
`

Expected: only references in 	auri-bridge.js itself.

- [ ] **Step 2: Remove the helpers**

In rontend/tauri-bridge.js, remove:

`javascript
    api.start_opencode = function (dir) { return api.start_terminal('main', dir, true, null, null, null); };
    api.terminate = function () { return api.terminate_terminal('main'); };
`

- [ ] **Step 3: Verify and commit**

`ash
git add frontend/tauri-bridge.js
git commit -m "refactor(bridge): remove start_opencode and terminate helpers"
`

---

# Phase 7: Sidebar

## Task 41: sidebar.js panel session ID ? ${tabId}__panel

**Files:**
- Modify: rontend/sidebar.js (lines around 88, 127, 418 � the panel session lifecycle)

- [ ] **Step 1: Find all hardcoded 'panel' references**

`ash
grep -n "'panel'\|\"panel\"" frontend/sidebar.js
`

- [ ] **Step 2: Replace with composite key derivation**

Add a helper at the top of sidebar.js (inside the IIFE):

`javascript
    function panelSessionId() {
        return (window.TabManager && window.TabManager.activeTabId() ? window.TabManager.activeTabId() + '__panel' : 'panel');
    }
`

Replace each hardcoded 'panel' (when used as a session id) with panelSessionId().

- [ ] **Step 3: Verify and commit**

`ash
git add frontend/sidebar.js
git commit -m "refactor(sidebar): panel session ID uses composite key per active tab"
`

---

## Task 42: sidebar.js executeBackground ? composite + register

**Files:**
- Modify: rontend/sidebar.js

- [ ] **Step 1: Find executeBackground handler**

Search rontend/sidebar.js for 'background' mode handling.

- [ ] **Step 2: Use composite key and register**

`javascript
    function bgSessionId(buttonId) {
        var tabId = window.TabManager && window.TabManager.activeTabId();
        if (!tabId) return 'bg__' + buttonId;
        var sid = tabId + '__bg__' + buttonId;
        if (window.TabManager && window.TabManager.registerSession) {
            window.TabManager.registerSession(tabId, sid);
        }
        return sid;
    }
`

Use gSessionId(buttonId) everywhere a background task is spawned.

- [ ] **Step 3: Commit**

`ash
git add frontend/sidebar.js
git commit -m "refactor(sidebar): executeBackground uses composite key and registers session"
`

---

## Task 43: sidebar.js MutationObserver settings injection

**Files:**
- Modify: rontend/sidebar.js (the init function, ~line 993)

- [ ] **Step 1: Replace setTimeout(setupSettingsTab, 500) with a MutationObserver**

In rontend/sidebar.js, the init function (around line 993) currently has:

`javascript
    setTimeout(function () {
        setupSettingsTab();
    }, 500);
`

Replace with:

`javascript
    if (!window._monolothSettingsObserver) {
        window._monolothSettingsObserver = new MutationObserver(function () {
            var tabsContainer = document.querySelector('.settings-tabs');
            if (tabsContainer && !document.querySelector('.settings-tab[data-tab="sidebar"]')) {
                setupSettingsTab();
            }
        });
        window._monolothSettingsObserver.observe(document.body, { childList: true, subtree: true });
    }
`

- [ ] **Step 2: Verify**

Open Settings, close, reopen � the Sidebar tab is present every time.

- [ ] **Step 3: Commit**

`ash
git add frontend/sidebar.js
git commit -m "refactor(sidebar): use MutationObserver for settings tab injection"
`

---

## Task 44: sidebar.js Tabs settings section (toggle + position)

**Files:**
- Modify: rontend/sidebar.js

- [ ] **Step 1: Add enderTabsSettings function**

In rontend/sidebar.js, add (near enderSettingsTab):

`javascript
    function renderTabsSettings() {
        var panel = document.getElementById('tab-sidebar');
        if (!panel) return;
        var state = window.TabManager && window.TabManager.state();
        var enabled = state ? state.tabBarEnabled : true;
        var position = state ? state.tabBarPosition : 'bottom';

        var tabsSection = document.createElement('div');
        tabsSection.className = 'settings-card';
        tabsSection.innerHTML = ''
            + '<div class="card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>'
            + '<div class="card-body">'
            + '  <h3>Tabs</h3>'
            + '  <p class="card-desc">Configure the tab bar position and visibility.</p>'
            + '  <div class="setting-row">'
            + '    <label><input type="checkbox" id="tabs-enabled-toggle" ' + (enabled ? 'checked' : '') + ' /> Enable tab bar</label>'
            + '  </div>'
            + '  <p class="setting-hint">Disabling hides the tab bar and reverts to single-tab mode. Your tabs are saved and will be restored if you re-enable.</p>'
            + '  <div class="setting-row">'
            + '    <label>Position: '
            + '      <select id="tabs-position-select">'
            + '        <option value="bottom"' + (position === 'bottom' ? ' selected' : '') + '>Bottom</option>'
            + '        <option value="top"' + (position === 'top' ? ' selected' : '') + '>Top</option>'
            + '      </select>'
            + '    </label>'
            + '  </div>'
            + '</div>';

        // Append to the existing panel (which already has Sidebar content)
        panel.appendChild(tabsSection);

        document.getElementById('tabs-enabled-toggle').addEventListener('change', function (e) {
            var s = window.TabManager.state();
            s.tabBarEnabled = e.target.checked;
            window.TabManager._save();
            if (e.target.checked) {
                document.body.classList.remove('tab-bar-disabled');
                document.body.classList.add(s.tabBarPosition === 'top' ? 'tab-bar-top' : 'tab-bar-bottom');
            } else {
                document.body.classList.add('tab-bar-disabled');
            }
        });

        document.getElementById('tabs-position-select').addEventListener('change', function (e) {
            var s = window.TabManager.state();
            s.tabBarPosition = e.target.value;
            window.TabManager._save();
            document.body.classList.toggle('tab-bar-top', s.tabBarPosition === 'top');
            document.body.classList.toggle('tab-bar-bottom', s.tabBarPosition === 'bottom');
        });
    }
`

- [ ] **Step 2: Call enderTabsSettings from the Sidebar tab's render function**

Find where enderSettingsTab() is called (it's the existing Sidebar settings tab content). After it renders, call enderTabsSettings().

- [ ] **Step 3: Verify and commit**

`ash
git add frontend/sidebar.js
git commit -m "feat(sidebar): Tabs settings section with enable toggle and position"
`

---

# Phase 8: index.html + style.css

## Task 45: index.html add <div id="tab-bar"> top-level

**Files:**
- Modify: rontend/index.html

- [ ] **Step 1: Add the tab bar div as a top-level child of <body>**

In rontend/index.html, find the <body class="cta-blur" data-current-view="landing"> opening tag. Add the tab bar div as a top-level child, after #bg-overlay and before #landing:

`html
    <!-- Tab Bar -->
    <div id="tab-bar" class="tab-bar tab-bar-bottom">
        <div class="tab-bar-tabs" id="tab-bar-tabs"></div>
    </div>
`

- [ ] **Step 2: Bump ?v=N on the style.css link if it changed**

The Task 23 changes to style.css are already committed. Bump only if the bump wasn't done in Task 23.

- [ ] **Step 3: Commit**

`ash
git add frontend/index.html
git commit -m "feat(html): add top-level #tab-bar container"
`

---

## Task 46: index.html add .terminal-instance divs and #simplified-landing container

**Files:**
- Modify: rontend/index.html

- [ ] **Step 1: Add the terminal-instances wrapper and simplified-landing placeholder**

In rontend/index.html, find the <div id="terminal-view" class="terminal-view"> and its existing children. Add a wrapper for per-tab terminal instances and a simplified-landing container:

`html
    <!-- Terminal View -->
    <div id="terminal-view" class="terminal-view">
        <div class="terminal-instances" id="terminal-instances"></div>
        <div id="simplified-landing" class="simplified-landing" style="display:none"></div>
    </div>
`

(Per-tab .terminal-instance divs are created on demand by TabManager.initTabTerminal or by a small bootstrap after init.)

- [ ] **Step 2: Commit**

`ash
git add frontend/index.html
git commit -m "feat(html): add terminal-instances and simplified-landing containers"
`

---

## Task 47: index.html script load order: 	abs.js BEFORE pp.js; simplified-landing.js after

**Files:**
- Modify: rontend/index.html

- [ ] **Step 1: Reorder script tags and bump ?v=N**

In rontend/index.html, find the <script> block. Current order:

`html
    <script src="lib/xterm.js?v=12"></script>
    <script src="lib/xterm-addon-fit.js?v=14"></script>
    <script src="lib/xterm-addon-webgl.js?v=13"></script>
    <script src="tauri-bridge.js?v=19"></script>
    <script>window.MonolothTooltip = ...; window.MonolothDropdown = ...;</script>
    <script src="tooltip.js?v=3"></script>
    <script src="app.js?v=49"></script>
    <script src="sidebar.js?v=16"></script>
`

Replace with:

`html
    <script src="lib/xterm.js?v=12"></script>
    <script src="lib/xterm-addon-fit.js?v=14"></script>
    <script src="lib/xterm-addon-webgl.js?v=13"></script>
    <script src="tauri-bridge.js?v=19"></script>
    <script>window.MonolothTooltip = ...; window.MonolothDropdown = ...;</script>
    <script src="tooltip.js?v=3"></script>
    <script src="tabs.js?v=1"></script>
    <script src="simplified-landing.js?v=1"></script>
    <script src="app.js?v=50"></script>
    <script src="sidebar.js?v=17"></script>
`

- [ ] **Step 2: Commit**

`ash
git add frontend/index.html
git commit -m "feat(html): tabs.js loads before app.js; simplified-landing.js after"
`

---

## Task 50: style.css ody.tab-bar-top + CTA variants

**Files:**
- Modify: rontend/style.css

- [ ] **Step 1: Add CTA variants and top-position variant**

Append to rontend/style.css:

`css
body.cta-blur .tab-bar { background: rgba(20, 20, 20, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
body.cta-glass .tab-bar { background: rgba(40, 40, 40, 0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top-color: rgba(255, 255, 255, 0.08); }
body.cta-solid .tab-bar { background: var(--bg-tertiary); }
body.cta-outline .tab-bar { background: transparent; border-top: 1px solid var(--border-muted); }

body.light-mode .tab-bar { background: rgba(245, 245, 245, 0.92); border-top-color: var(--border-muted); }
body.light-mode .tab-chip { background: rgba(0, 0, 0, 0.04); color: var(--text-secondary); border-color: var(--border-muted); }
body.light-mode .tab-chip:hover { background: rgba(0, 0, 0, 0.08); }
body.light-mode .tab-chip.active { background: rgba(250, 178, 131, 0.18); border-color: var(--accent-primary); color: var(--text-primary); }

body.tab-bar-top { padding-top: 44px; padding-bottom: 0; }
body.tab-bar-top .tab-bar { top: 0; bottom: auto; border-bottom: 1px solid var(--border-dark); border-top: none; }
body.tab-bar-top .terminal-instance { height: calc(100vh - 44px); }
`

- [ ] **Step 2: Commit**

`ash
git add frontend/style.css
git commit -m "feat(style): CTA theme variants and top-position variant for tab bar"
`

---


# Phase 9: Profile switcher

## Task 51: `app.js` `openProfileSwitcher(scope, tabId)` accepts context

**Files:**
- Modify: `frontend/app.js` (around line 3474-3506)

- [ ] **Step 1: Find `openProfileSwitcher` and add the scope parameter**

In `frontend/app.js`, find the `openProfileSwitcher` function. Add parameters and update the click handler:

```javascript
    function openProfileSwitcher(scope, tabId) {
        scope = scope || 'global';
        if (!profileSwitcher) return;
        renderProfileSwitcher();
        profileSwitcher.classList.add('active');
        saveFocus();
        trapFocus(profileSwitcher);
        var items = profileSwitcher.querySelectorAll('.ps-item');
        items.forEach(function (item) {
            item.onclick = function () {
                var name = item.getAttribute('data-profile-name') || item.textContent.trim();
                closeProfileSwitcher();
                if (scope === 'tab' && tabId && window.TabManager) {
                    window.TabManager.setTabProfile(tabId, name);
                    if (tabId === window.TabManager.activeTabId()) {
                        if (typeof loadBackgroundConfig === 'function') loadBackgroundConfig();
                    }
                } else {
                    switchToProfile(name);
                }
            };
        });
    }
```

- [ ] **Step 2: Expose the function globally**

In `frontend/app.js`, near the `window.MonolothApp = { ... }` block, add:

```javascript
    window.openProfileSwitcher = openProfileSwitcher;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app.js
git commit -m "feat(app): openProfileSwitcher accepts scope (tab|global) and tabId"
```

---

# Phase 10: Tests + Integration

## Task 54: `app.renderer-policy.test.cjs` mock `TabManager`

**Files:**
- Modify: `frontend/app.renderer-policy.test.cjs`

- [ ] **Step 1: Add `TabManager` and `simplifiedLanding` to the mocked `window`**

In `frontend/app.renderer-policy.test.cjs`, find the `createHarness` function. After the `const window = { ... }` block, add a `tabManager` mock and assign it to `window.TabManager` and `window.simplifiedLanding`.

The mock must include: `state`, `activeTabId`, `activeTab`, `getTerminal`, `getFitAddon`, `isTerminalRunning`, `getSessionGeneration`, `setSessionGeneration`, `getSkipNextEof`, `setSkipNextEof`, `initTabTerminal`, `switchTo`, `handleBack`, `createTab`, `closeTab`, `reorderTabs`, `setActiveTab`, `setTabProfile`, `registerSession`, `unregisterSession`, `unregisterAllForTab`, `renderTabs`, `flushSave`, `_save`, `on`.

The mock should return a state with one tab `{ id: 'tab-1', isMain: true, profile: 'Default' }` and `activeTabId: 'tab-1'`.

- [ ] **Step 2: Update the existing WebGL test to use a real tab ID**

In the same file, find:

```javascript
harness.context.window.MonolothApp.restartSession('main');
```

Replace with:

```javascript
harness.context.window.MonolothApp.restartSession('tab-1');
```

- [ ] **Step 3: Run the test**

```bash
node --test frontend/app.renderer-policy.test.cjs
```

Expected: PASS, 1 test (the existing WebGL policy test).

- [ ] **Step 4: Commit**

```bash
git add frontend/app.renderer-policy.test.cjs
git commit -m "test(renderer): mock TabManager and simplifiedLanding; update WebGL test"
```

---

## Task 55: `tabs.test.cjs` full coverage of `TabManager`

**Files:**
- Modify: `frontend/tabs.test.cjs`

- [ ] **Step 1: Add additional tests for the spec section 8.2 requirements**

In `frontend/tabs.test.cjs`, append the remaining tests. Required coverage per spec:

- `flushSave` synchronously calls `set_config`
- `Close Others` on main tab keeps main and closes all others
- `Close Others` on non-main tab keeps main and current
- Tab bar position + enabled flag round-trip
- `closeTab` clears per-tab maps (session generation, skip-next-eof, sessions-by-tab)
- `setupPtyListener` drops events with missing sessionId (stub; tested at bridge level)
- `buttonId` > 22 chars is truncated before constructing session ID (verified in sidebar Task 42)

The full set of tests, after this task, should be ~17.

- [ ] **Step 2: Run all tests**

```bash
node --test frontend/tabs.test.cjs
```

Expected: PASS, ~17 tests.

- [ ] **Step 3: Commit**

```bash
git add frontend/tabs.test.cjs
git commit -m "test(tabs): full coverage per spec section 8.2"
```

---

## Task 56: Integration verify

**Files:** none (verification only)

- [ ] **Step 1: Run all Rust tests**

```bash
cd src-tauri && cargo test --lib
```

Expected: PASS, all tests (6 original + tabs_state + sidebar_config + get_for_profile + history idempotency + any new ones from Task 8).

- [ ] **Step 2: Run all frontend tests**

```bash
node --test frontend/tabs.test.cjs
node --test frontend/app.renderer-policy.test.cjs
```

Expected: PASS, ~18 tests total.

- [ ] **Step 3: Manual QA per spec section 8.3**

Walk through the QA checklist:

- Launch with no saved state: 1 main tab, full landing, `tabs_state` created with `tabBarEnabled: true`.
- Click `+`: 2 tabs, second is parallel, simplified landing.
- Open a dir in tab 2: terminal launches.
- Click tab 1: tab 1's UI shows.
- Drag tab 2 to position 0: reorders.
- Close tab 1 (main): if tab 2 exists, switch to tab 2 and promote to main.
- Close tab with running PTY: confirm modal appears.
- Right-click "Close Others" on a non-main tab: closes all except main and current.
- Toggle tab bar off: bar hidden, legacy mode.
- Toggle tab bar on: previous tabs restored.
- Move tab bar to top: DOM order updates.
- Kill app mid-session: `beforeunload` flushes, on relaunch tabs restored.
- Manually corrupt `config.json` `tabs_state`: app falls back to fresh main tab.
- Profile switch from simplified landing: only the active tab's profile changes.
- Switch tabs: shortcuts re-register from the new active tab's profile.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: integration verification complete (no source changes)"
```

(If any QA step failed, fix the relevant task and re-run.)

---

# Done

All 56 tasks complete. The multi-tab system is fully wired:

- Rust foundation: `tabs_state` global routing, `start_terminal` profile param, cancellation token, idempotent history, new commands.
- Frontend: `TabManager` with full state, persistence, race-safety; per-tab xterm instances; tab bar UI; simplified landing; per-tab panel; settings integration; profile switcher context.

Total commits expected: ~30-35 small, focused commits across the implementation.
