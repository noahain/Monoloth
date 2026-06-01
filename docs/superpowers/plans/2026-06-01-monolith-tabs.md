# Monolith Tabs System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a tab bar UI for Monolith that runs multiple independent PTY sessions, each tied to a profile, with drag-reorder, pin, color labels, secondary-command sub-views, and persistent layout — per the council-reviewed design at `docs/superpowers/specs/2026-06-01-monolith-tabs-design.md`.

**Architecture:** New `src-tauri/src/tabs.rs` module owns in-memory `TabsConfig` and persists exclusively through `AppConfig::set("tabs_config", …)`. New `frontend/tabs.js` IIFE owns tab DOM, xterm instances, drag/drop, context menu, PTY routing, and view-switching. Existing `'main'` and `'panel'` PTY sessions are preserved; `'main'` becomes the first tab; `'panel'` is unchanged.

**Tech Stack:** Rust (Tauri 2, portable-pty, parking_lot, serde, serde_json, shlex), vanilla JS (xterm.js via vendored `lib/xterm.js`), Node `node:test` for frontend tests.

**Spec:** `docs/superpowers/specs/2026-06-01-monolith-tabs-design.md` (47.9 KB, 11 sections, 37 council findings applied).

**Context bundle for the council:** `docs/superpowers/specs/2026-06-01-monolith-tabs-context.txt` (79 KB, 8 source sections).

---

## File map

**New files (3):**
- `src-tauri/src/tabs.rs` — `TabsManager`, `Tab`, `TabsConfig`, `TabPosition`, validation helpers
- `frontend/tabs.js` — `TabManager` IIFE
- `frontend/tabs.test.cjs` — frontend tests

**Modified (9):**
- `src-tauri/src/lib.rs` — `+mod tabs`, `+manage(TabsManager)`, `CloseRequested` synchronous `tabs_config` save
- `src-tauri/src/commands.rs` — +11 new commands + `resolve_and_split_shell_command` helper
- `src-tauri/src/config.rs` — `tabs_config` in `global_keys()`, default seed
- `frontend/index.html` — `#tab-bar`, `#tab-xterm-pool`, `tabs.js` script, `?v` bumps
- `frontend/tauri-bridge.js` — +13 `monolithApi` methods, −`setupPtyListener`, `start_opencode` fix
- `frontend/style.css` — +~180 lines tab bar styles
- `frontend/app.js` — remove `window.term`, `initTerminal`, PTY listener, EOF maps; preserve panel restart branch
- `frontend/sidebar.js` — Tabs settings section (MutationObserver) + profile picker
- `frontend/app.renderer-policy.test.cjs` — update mock for `TabManager`

---

## Task ordering & dependencies

| Task | Component | Depends on |
|---|---|---|
| 1 | `tabs.rs` module skeleton + types | — |
| 2 | `tabs.rs` validation helpers | 1 |
| 3 | `tabs.rs` `TabsManager` struct + persistence-through-AppConfig | 1, 2 |
| 4 | `commands.rs` `resolve_and_split_shell_command` helper | — |
| 5 | `commands.rs` `get_tabs_config` + `set_tabs_config` | 3 |
| 6 | `commands.rs` `create_tab` (transactional) | 3, 4 |
| 7 | `commands.rs` `close_tab` (force + auto-create) | 3 |
| 8 | `commands.rs` `restore_tab_sessions` | 3, 4 |
| 9 | `commands.rs` mutation commands (`set_tab_active_view`, `set_active_tab`, `set_tab_pinned`, `set_tab_color`, `set_tab_profile`, `reorder_tabs`, `refresh_tab`) | 3, 4 |
| 10 | `commands.rs` `get_profile_config_by_name` | — |
| 11 | `config.rs` `tabs_config` default + global key | 3 |
| 12 | `lib.rs` `+mod tabs` + `CloseRequested` synchronous save | 1, 3 |
| 13 | `tauri-bridge.js` +13 `monolithApi` methods, −`setupPtyListener`, `start_opencode` fix | 5, 6, 7, 8, 9, 10 |
| 14 | `tabs.js` skeleton + state + setupTerminalHandlers + PTY listener | 13 |
| 15 | `tabs.js` `init` + `createTab` + `closeTab` | 14 |
| 16 | `tabs.js` `switchTab` / `switchView` / `setActiveTab` / `pinTab` / `setTabColor` / `reorderTabs` / `changeProfile` / `refreshActiveTab` | 14, 15 |
| 17 | `tabs.js` drag/drop + context menu + profile picker | 16 |
| 18 | `index.html` + `style.css` additions | 16, 17 |
| 19 | `app.js` refactor (preserve panel restart branch) | 13, 14 |
| 20 | `sidebar.js` Tabs settings section + profile picker | 18 |
| 21 | `app.renderer-policy.test.cjs` mock update | 19 |
| 22 | `tabs.test.cjs` full coverage | 14, 15, 16, 17 |
| 23 | Final integration verify (`cargo test` + `node --test`) | 1–22 |

---

# Phase 1: Rust scaffolding

## Task 1: `tabs.rs` module skeleton + types

**Files:**
- Create: `src-tauri/src/tabs.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod tabs;`)

- [ ] **Step 1: Create the new file with type definitions**

Create `src-tauri/src/tabs.rs`:

```rust
use std::collections::HashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TabPosition {
    Top,
    Bottom,
}

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
    pub active_view: String,
    pub dir: Option<String>,
    pub secondary_count: usize,
}

impl Default for TabsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            position: TabPosition::Top,
            active_tab_id: None,
            tabs: Vec::new(),
        }
    }
}

pub struct TabsManager {
    cfg: Mutex<TabsConfig>,
}

impl Default for TabsManager {
    fn default() -> Self {
        Self { cfg: Mutex::new(TabsConfig::default()) }
    }
}

impl TabsManager {
    pub fn load(&self) -> TabsConfig {
        self.cfg.lock().clone()
    }

    pub fn replace(&self, new_cfg: TabsConfig) {
        *self.cfg.lock() = new_cfg;
    }

    pub fn cfg_ref(&self) -> &Mutex<TabsConfig> {
        &self.cfg
    }
}
```

- [ ] **Step 2: Register the module in `lib.rs`**

Open `src-tauri/src/lib.rs`. At the top (next to the existing `mod commands;`, `mod config;`, `mod history;`, `mod pty;` lines), add:

```rust
mod tabs;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success (the new types compile; nothing else uses them yet).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tabs.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): add tabs.rs module skeleton with TabsConfig/Tab types"
```

---

## Task 2: `tabs.rs` validation helpers

**Files:**
- Modify: `src-tauri/src/tabs.rs` (add validation functions + tests)

- [ ] **Step 1: Add the failing tests**

Append to `src-tauri/src/tabs.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_tab_id_accepts_strict_uuid_v4() {
        let valid = "550e8400-e29b-41d4-a716-446655440000";
        assert!(validate_tab_id(valid).is_ok());

        assert!(validate_tab_id("550e8400-e29b-41d4-a716-44665544000").is_err());
        assert!(validate_tab_id("not-a-uuid").is_err());
        assert!(validate_tab_id("").is_err());
        assert!(validate_tab_id("main").is_err());
        assert!(validate_tab_id("panel").is_err());
        assert!(validate_tab_id("abc__def").is_err());
        assert!(validate_tab_id("550e8400-e29b-41d4-b716-446655440000").is_err());
    }

    #[test]
    fn validate_color_accepts_hex() {
        assert!(validate_color("#ff5555").is_ok());
        assert!(validate_color("#000000").is_ok());
        assert!(validate_color("#FFFFFF").is_ok());
        assert!(validate_color("#fff").is_err());
        assert!(validate_color("ff5555").is_err());
        assert!(validate_color("#ff555g").is_err());
    }

    #[test]
    fn validate_active_view_against_secondary_count() {
        let tab = Tab {
            id: "550e8400-e29b-41d4-a716-446655440000".into(),
            profile: None,
            pinned: false,
            color: None,
            active_view: "primary".into(),
            dir: None,
            secondary_count: 2,
        };
        assert!(validate_active_view(&tab, "primary").is_ok());
        assert!(validate_active_view(&tab, "secondary:0").is_ok());
        assert!(validate_active_view(&tab, "secondary:1").is_ok());
        assert!(validate_active_view(&tab, "secondary:2").is_err());
        assert!(validate_active_view(&tab, "primary:0").is_err());
        assert!(validate_active_view(&tab, "").is_err());
    }
}
```

- [ ] **Step 2: Add the implementation (above the `#[cfg(test)]` block)**

```rust
const UUID_V4_REGEX: &str = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

pub fn validate_tab_id(id: &str) -> Result<(), String> {
    if id == "main" || id == "panel" {
        return Err(format!("invalid tab id (reserved name): {id}"));
    }
    if id.contains("__") {
        return Err(format!("invalid tab id (contains reserved delimiter): {id}"));
    }
    if !regex_lite::is_match(UUID_V4_REGEX, id) {
        return Err(format!("invalid tab id (not UUID v4): {id}"));
    }
    Ok(())
}

pub fn validate_color(c: &str) -> Result<(), String> {
    if c.len() != 7 || !c.starts_with('#') || !c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(format!("invalid color (expected #RRGGBB): {c}"));
    }
    Ok(())
}

pub fn validate_active_view(tab: &Tab, view: &str) -> Result<(), String> {
    if view == "primary" {
        return Ok(());
    }
    if let Some(rest) = view.strip_prefix("secondary:") {
        if let Ok(n) = rest.parse::<usize>() {
            if n < tab.secondary_count {
                return Ok(());
            }
            return Err(format!("secondary index {n} >= secondary_count {}", tab.secondary_count));
        }
    }
    Err(format!("invalid active_view: {view}"))
}

mod regex_lite {
    pub fn is_match(pattern: &str, s: &str) -> bool {
        let re = regex::Regex::new(pattern).expect("invalid regex");
        re.is_match(s)
    }
}
```

- [ ] **Step 3: Add `regex` to `Cargo.toml`**

Open `src-tauri/Cargo.toml`. In `[dependencies]`, add:

```toml
regex = "1"
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib tabs::tests`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tabs.rs src-tauri/Cargo.toml
git commit -m "feat(tabs): add tab id, color, and active_view validation"
```

---

## Task 3: `TabsManager` struct + persistence through `AppConfig`

**Files:**
- Modify: `src-tauri/src/tabs.rs` (add `add_tab`, `remove_tab`, `reorder`, mutators, `persist`, `make_default_tab`)
- Modify: `src-tauri/src/commands.rs` (add stub for the `persist` helper; will be used in Task 5)
- Modify: `src-tauri/src/lib.rs` (register `TabsManager` in Tauri state)

- [ ] **Step 1: Add the failing tests for `TabsManager` mutators**

Append to `src-tauri/src/tabs.rs` `tests` module:

```rust
    fn make_tab(id: &str, secondary_count: usize) -> Tab {
        Tab {
            id: id.into(),
            profile: None,
            pinned: false,
            color: None,
            active_view: "primary".into(),
            dir: None,
            secondary_count,
        }
    }

    #[test]
    fn add_tab_enforces_max_16() {
        let m = TabsManager::default();
        for i in 0..16 {
            let id = format!("550e8400-e29b-41d4-a716-4466554{:05x}", i);
            assert!(m.add_tab(make_tab(&id, 0)).is_ok());
        }
        let overflow = "550e8400-e29b-41d4-a716-446655440010".to_string();
        assert!(m.add_tab(make_tab(&overflow, 0)).is_err());
    }

    #[test]
    fn add_tab_enforces_unique_id() {
        let m = TabsManager::default();
        let id = "550e8400-e29b-41d4-a716-446655440000".to_string();
        assert!(m.add_tab(make_tab(&id, 0)).is_ok());
        assert!(m.add_tab(make_tab(&id, 0)).is_err());
    }

    #[test]
    fn session_ids_for_tab_returns_primary_and_secondaries() {
        let m = TabsManager::default();
        let id = "550e8400-e29b-41d4-a716-446655440000";
        m.add_tab(make_tab(id, 3)).unwrap();
        let sids = m.session_ids_for_tab(id).unwrap();
        assert_eq!(sids, vec![
            id.to_string(),
            format!("{id}__sec0"),
            format!("{id}__sec1"),
            format!("{id}__sec2"),
        ]);
    }

    #[test]
    fn session_ids_for_tab_returns_none_for_unknown_id() {
        let m = TabsManager::default();
        assert!(m.session_ids_for_tab("550e8400-e29b-41d4-a716-446655440000").is_none());
    }

    #[test]
    fn remove_tab_clears_active_if_was_active() {
        let m = TabsManager::default();
        let id1 = "550e8400-e29b-41d4-a716-446655440001";
        let id2 = "550e8400-e29b-41d4-a716-446655440002";
        m.add_tab(make_tab(id1, 0)).unwrap();
        m.add_tab(make_tab(id2, 0)).unwrap();
        m.set_active_tab_id(Some(id1.to_string()));
        m.remove_tab(id1).unwrap();
        let cfg = m.load();
        assert_eq!(cfg.active_tab_id, Some(id2.to_string()));
    }

    #[test]
    fn close_tab_auto_creates_default_when_empty() {
        let m = TabsManager::default();
        let id = "550e8400-e29b-41d4-a716-446655440000";
        m.add_tab(make_tab(id, 0)).unwrap();
        m.close_tab_creates_default_if_empty(id);
        let cfg = m.load();
        assert_eq!(cfg.tabs.len(), 1);
        assert_ne!(cfg.tabs[0].id, id);
    }

    #[test]
    fn round_trip_serialization_via_camel_case() {
        let cfg = TabsConfig {
            enabled: true,
            position: TabPosition::Bottom,
            active_tab_id: Some("550e8400-e29b-41d4-a716-446655440000".into()),
            tabs: vec![make_tab("550e8400-e29b-41d4-a716-446655440000", 2)],
        };
        let value = serde_json::to_value(&cfg).unwrap();
        assert_eq!(value["enabled"], true);
        assert_eq!(value["position"], "bottom");
        assert_eq!(value["activeTabId"], "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(value["tabs"][0]["secondaryCount"], 2);
        let back: TabsConfig = serde_json::from_value(value).unwrap();
        assert_eq!(back.position, TabPosition::Bottom);
        assert_eq!(back.tabs[0].secondary_count, 2);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib tabs::tests`
Expected: compile errors (functions don't exist yet).

- [ ] **Step 3: Add the implementation**

Insert into `impl TabsManager { ... }` in `src-tauri/src/tabs.rs`:

```rust
    pub fn add_tab(&self, tab: Tab) -> Result<Tab, String> {
        validate_tab_id(&tab.id)?;
        validate_color(tab.color.as_deref().unwrap_or(""))?;
        let mut cfg = self.cfg.lock();
        if cfg.tabs.len() >= 16 {
            return Err("max 16 tabs".to_string());
        }
        if cfg.tabs.iter().any(|t| t.id == tab.id) {
            return Err(format!("duplicate id: {}", tab.id));
        }
        cfg.tabs.push(tab.clone());
        Ok(tab)
    }

    pub fn remove_tab(&self, tab_id: &str) -> Result<Tab, String> {
        let mut cfg = self.cfg.lock();
        let pos = cfg.tabs.iter().position(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        let removed = cfg.tabs.remove(pos);
        if cfg.active_tab_id.as_deref() == Some(tab_id) {
            cfg.active_tab_id = cfg.tabs.first().map(|t| t.id.clone());
        }
        Ok(removed)
    }

    pub fn reorder(&self, new_order: Vec<String>) -> Result<(), String> {
        let mut cfg = self.cfg.lock();
        if new_order.len() != cfg.tabs.len() {
            return Err(format!("reorder length {} != tabs length {}", new_order.len(), cfg.tabs.len()));
        }
        let mut new_tabs = Vec::with_capacity(cfg.tabs.len());
        for id in &new_order {
            let t = cfg.tabs.iter().find(|t| &t.id == id)
                .ok_or_else(|| format!("unknown tab id: {id}"))?
                .clone();
            new_tabs.push(t);
        }
        cfg.tabs = new_tabs;
        Ok(())
    }

    pub fn set_pinned(&self, tab_id: &str, pinned: bool) -> Result<(), String> {
        let mut cfg = self.cfg.lock();
        let t = cfg.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        t.pinned = pinned;
        Ok(())
    }

    pub fn set_color(&self, tab_id: &str, color: Option<String>) -> Result<(), String> {
        if let Some(c) = &color {
            validate_color(c)?;
        }
        let mut cfg = self.cfg.lock();
        let t = cfg.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        t.color = color;
        Ok(())
    }

    pub fn set_profile(&self, tab_id: &str, profile: Option<String>, secondary_count: usize) -> Result<(), String> {
        let mut cfg = self.cfg.lock();
        let t = cfg.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        t.profile = profile;
        t.secondary_count = secondary_count;
        Ok(())
    }

    pub fn set_active_view(&self, tab_id: &str, view: String) -> Result<(), String> {
        let mut cfg = self.cfg.lock();
        let t = cfg.tabs.iter().find(|t| t.id == tab_id)
            .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
        validate_active_view(t, &view)?;
        let t = cfg.tabs.iter_mut().find(|t| t.id == tab_id).unwrap();
        t.active_view = view;
        Ok(())
    }

    pub fn set_active_tab_id(&self, tab_id: Option<String>) {
        self.cfg.lock().active_tab_id = tab_id;
    }

    pub fn close_tab_creates_default_if_empty(&self, removed_id: &str) {
        let mut cfg = self.cfg.lock();
        if cfg.tabs.is_empty() {
            let default = make_default_tab();
            cfg.tabs.push(default);
        }
    }

    pub fn session_ids_for_tab(&self, tab_id: &str) -> Option<Vec<String>> {
        let cfg = self.cfg.lock();
        let tab = cfg.tabs.iter().find(|t| t.id == tab_id)?;
        let mut sids = Vec::with_capacity(1 + tab.secondary_count);
        sids.push(tab.id.clone());
        for i in 0..tab.secondary_count {
            sids.push(format!("{tab_id}__sec{i}"));
        }
        Some(sids)
    }
}

pub fn make_default_tab() -> Tab {
    Tab {
        id: uuid_v4(),
        profile: None,
        pinned: false,
        color: None,
        active_view: "primary".into(),
        dir: None,
        secondary_count: 0,
    }
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (nanos & 0xFFFFFFFF) as u32,
        ((nanos >> 32) & 0xFFFF) as u16,
        ((nanos >> 48) & 0xFFF) as u16,
        0x8000 | ((nanos >> 60) & 0x3FFF) as u16,
        (nanos as u128).wrapping_mul(0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFF)
}
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib tabs::tests`
Expected: all 7 tests pass.

- [ ] **Step 5: Register `TabsManager` in Tauri state**

In `src-tauri/src/lib.rs`, in the `tauri::Builder::default()...run()` chain, add `.manage(tabs::TabsManager::default())` next to the existing `.manage(app_config)`, `.manage(history_manager)`, `.manage(pty_manager)` calls.

- [ ] **Step 6: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/tabs.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): implement TabsManager with persistence-through-AppConfig model"
```

---

## Task 4: `resolve_and_split_shell_command` helper

**Files:**
- Modify: `src-tauri/src/commands.rs` (extract the helper, refactor `start_terminal` to use it)

- [ ] **Step 1: Add the failing test**

In `src-tauri/src/commands.rs` `#[cfg(test)]` module (add one if absent), add:

```rust
    #[test]
    fn resolve_and_split_shell_command_matches_start_terminal_behavior() {
        let (shell, args) = super::resolve_and_split_shell_command(None, "echo hello");
        assert_eq!(shell, "cmd");
        assert!(args.windows(2).any(|w| w == ["/C", "echo hello"]));
    }

    #[test]
    fn resolve_and_split_uses_override_when_provided() {
        let (shell, args) = super::resolve_and_split_shell_command(Some("pwsh"), "Get-Process");
        assert_eq!(shell, "pwsh");
        assert_eq!(args, vec!["-Command", "Get-Process"]);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test --lib commands::tests`
Expected: compile error (function not found).

- [ ] **Step 3: Add the helper at the top of `src-tauri/src/commands.rs`** (above any `#[tauri::command]` function)

```rust
pub fn resolve_and_split_shell_command(shell_override: Option<&str>, raw: &str) -> (String, Vec<String>) {
    use shlex::split;
    if let Some(s) = shell_override {
        if !s.is_empty() {
            let args = split(raw).unwrap_or_else(|| vec![raw.to_string()]);
            return (s.to_string(), args);
        }
    }
    let args = split(raw).unwrap_or_else(|| vec![raw.to_string()]);
    if cfg!(windows) {
        ("cmd".to_string(), {
            let mut a = vec!["/C".to_string()];
            a.extend(args);
            a
        })
    } else {
        ("sh".to_string(), {
            let mut a = vec!["-c".to_string()];
            a.extend(args);
            a
        })
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd src-tauri && cargo test --lib commands::tests`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "refactor(commands): extract resolve_and_split_shell_command helper"
```

---

## Task 5: `get_tabs_config` + `set_tabs_config` commands

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the failing tests**

In `commands.rs` tests module:

```rust
    #[test]
    fn get_tabs_config_returns_current_state() {
        // Direct call, no Tauri runtime
        let m = crate::tabs::TabsManager::default();
        let cfg = m.load();
        assert!(cfg.enabled);
        assert_eq!(cfg.tabs.len(), 0);
    }

    #[test]
    fn replace_then_persist_via_app_config() {
        // TabsManager.replace + AppConfig.set should round-trip via JSON
        let m = crate::tabs::TabsManager::default();
        let mut new_cfg = m.load();
        new_cfg.tabs.push(crate::tabs::make_default_tab());
        m.replace(new_cfg.clone());
        let value = serde_json::to_value(&new_cfg).unwrap();
        assert!(value["tabs"].is_array());
        assert_eq!(value["tabs"].as_array().unwrap().len(), 1);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test --lib commands::tests`
Expected: PASS (the tests use already-existing public APIs). If they pass, you've verified the foundation; move on.

- [ ] **Step 3: Add the commands to `src-tauri/src/commands.rs`**

```rust
#[tauri::command]
fn get_tabs_config(tabs: tauri::State<crate::tabs::TabsManager>) -> crate::tabs::TabsConfig {
    tabs.load()
}

#[tauri::command]
fn set_tabs_config(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    cfg: crate::tabs::TabsConfig,
) -> Result<(), String> {
    if cfg.tabs.len() > 16 {
        return Err("max 16 tabs".into());
    }
    for t in &cfg.tabs {
        crate::tabs::validate_tab_id(&t.id)?;
        if let Some(c) = &t.color {
            crate::tabs::validate_color(c)?;
        }
        crate::tabs::validate_active_view(t, &t.active_view)?;
    }
    tabs.replace(cfg);
    persist_via_app_config(&app, &tabs)
}
```

- [ ] **Step 4: Add the `persist_via_app_config` helper**

In `src-tauri/src/commands.rs`, near the top:

```rust
fn persist_via_app_config(
    app: &AppHandle,
    tabs: &tauri::State<crate::tabs::TabsManager>,
) -> Result<(), String> {
    let cfg = tabs.load();
    let value = serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    let app_config = app.state::<AppConfig>();
    app_config.set("tabs_config", value);
    Ok(())
}
```

- [ ] **Step 5: Register the commands in `lib.rs`**

In `src-tauri/src/lib.rs`, find the `.invoke_handler(tauri::generate_handler![ ... ])` block. Add the two new commands to the list:

```rust
            commands::get_tabs_config,
            commands::set_tabs_config,
```

- [ ] **Step 6: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): add get_tabs_config and set_tabs_config commands"
```

---

## Task 6: `create_tab` command (transactional)

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the failing test**

```rust
    #[test]
    fn validate_spawn_args_includes_cols_and_rows() {
        let (shell, args) = super::resolve_and_split_shell_command(None, "echo hi");
        let session = "550e8400-e29b-41d4-a716-446655440000";
        let cwd = "C:\\test";
        let cols: u16 = 80;
        let rows: u16 = 24;
        let pty_args: Vec<&str> = args.iter().map(String::as_str).collect();
        let _ = (session, cwd, cols, rows, shell, pty_args);
    }
```

(This is a smoke test verifying the helper produces args compatible with `PtyManager::spawn`.)

- [ ] **Step 2: Add the command**

In `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
fn create_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    profile: Option<String>,
    dir: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    crate::tabs::validate_tab_id(&tab_id)?;
    let (prof_name, startup_command, shell_override, secondaries) = resolve_profile_for_create(&config, profile.as_deref())?;
    let cwd = dir.clone()
        .or_else(|| config.get("last_directory").as_str().map(String::from))
        .unwrap_or_else(|| ".".to_string());
    let (shell, args) = resolve_and_split_shell_command(shell_override.as_deref(), &startup_command);

    let mut spawned: Vec<(String, u64)> = Vec::new();
    let primary_gen = pty.spawn(&tab_id, &shell, &args, &cwd, cols, rows)
        .map_err(|e| { e.to_string() })?;
    spawned.push((tab_id.clone(), primary_gen));

    let mut secondary_count = 0usize;
    for sec in secondaries {
        if !sec.show_icon_in_tab { continue; }
        let sid = format!("{tab_id}__sec{secondary_count}");
        let (s, a) = resolve_and_split_shell_command(shell_override.as_deref(), &sec.command);
        let g = pty.spawn(&sid, &s, &a, &cwd, cols, rows).map_err(|e| {
            for (killed_sid, _) in spawned.drain(..) {
                let _ = pty.terminate(&killed_sid);
            }
            e.to_string()
        })?;
        spawned.push((sid, g));
        secondary_count += 1;
    }

    let tab = crate::tabs::Tab {
        id: tab_id.clone(),
        profile: prof_name,
        pinned: false,
        color: None,
        active_view: "primary".into(),
        dir,
        secondary_count,
    };

    if let Err(e) = tabs.add_tab(tab.clone()) {
        for (killed_sid, _) in spawned.drain(..) {
            let _ = pty.terminate(&killed_sid);
        }
        return Err(e);
    }

    persist_via_app_config(&app, &tabs)?;

    for (sid, _) in &spawned {
        let _ = history.start_session(sid);
    }

    Ok((tab, spawned))
}

fn resolve_profile_for_create(
    config: &tauri::State<AppConfig>,
    requested: Option<&str>,
) -> Result<(Option<String>, String, Option<String>, Vec<SecondaryLite>), String> {
    use crate::commands::get_profile_config_by_name as _; // type marker
    let name = requested.map(String::from)
        .or_else(|| config.get("active_profile").as_str().map(String::from))
        .unwrap_or_else(|| "Default".to_string());
    let path = crate::config::profile_path(&name);
    let data = std::fs::read_to_string(&path).map_err(|_| format!("profile not found: {name}"))?;
    let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let startup = v.get("startup_command").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let shell_override = v.get("shell_override").and_then(|x| x.as_str()).map(String::from);
    let secondaries = v.get("secondary_commands")
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(|s| serde_json::from_value::<SecondaryLite>(s.clone()).ok()).collect())
        .unwrap_or_default();
    Ok((Some(name), startup, shell_override, secondaries))
}

#[derive(serde::Deserialize)]
struct SecondaryLite {
    name: String,
    command: String,
    #[serde(default)]
    enabled: bool,
    #[serde(default, rename = "showIconInTab")]
    show_icon_in_tab: bool,
}
```

- [ ] **Step 3: Register in `lib.rs`**

Add `commands::create_tab,` to the `generate_handler!` list.

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): add transactional create_tab command with rollback"
```

---

## Task 7: `close_tab` command (force + auto-create + session-first)

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the command**

```rust
#[tauri::command]
fn close_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    tab_id: String,
    force: bool,
) -> Result<(), String> {
    let tab = tabs.cfg_ref().lock()
        .tabs.iter().find(|t| t.id == tab_id)
        .cloned()
        .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
    if tab.pinned && !force {
        return Err("tab is pinned".into());
    }

    let sids = tabs.session_ids_for_tab(&tab_id)
        .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
    for sid in &sids {
        history.session_end(sid);
        pty.terminate(sid);
    }
    tabs.remove_tab(&tab_id)?;
    tabs.close_tab_creates_default_if_empty(&tab_id);
    persist_via_app_config(&app, &tabs)?;
    Ok(())
}
```

- [ ] **Step 2: Register in `lib.rs`**

Add `commands::close_tab,` to the `generate_handler!` list.

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): add close_tab with pinned force-check and auto-create"
```

---

## Task 8: `restore_tab_sessions` command

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the command**

```rust
#[tauri::command]
fn restore_tab_sessions(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
) -> Result<(Vec<crate::tabs::Tab>, Vec<(String, u64)>), String> {
    let cfg = tabs.load();
    let mut out_tabs = Vec::new();
    let mut out_sessions: Vec<(String, u64)> = Vec::new();
    for tab in &cfg.tabs {
        let cols: u16 = 80;
        let rows: u16 = 24;
        let cwd = tab.dir.clone()
            .or_else(|| config.get("last_directory").as_str().map(String::from))
            .unwrap_or_else(|| ".".to_string());
        let (prof_name, startup, shell_override, secondaries) = if let Some(p) = &tab.profile {
            let path = crate::config::profile_path(p);
            match std::fs::read_to_string(&path)
                .ok()
                .and_then(|d| serde_json::from_str::<serde_json::Value>(&d).ok())
            {
                Some(v) => {
                    let s = v.get("startup_command").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let sh = v.get("shell_override").and_then(|x| x.as_str()).map(String::from);
                    let secs = v.get("secondary_commands")
                        .and_then(|x| x.as_array())
                        .map(|arr| arr.iter().filter_map(|x| serde_json::from_value::<SecondaryLite>(x.clone()).ok()).collect())
                        .unwrap_or_default();
                    (Some(p.clone()), s, sh, secs)
                }
                None => (None, String::new(), None, Vec::new()),
            }
        } else {
            (None, String::new(), None, Vec::new())
        };

        let (shell, args) = resolve_and_split_shell_command(shell_override.as_deref(), &startup);
        if let Ok(gen) = pty.spawn(&tab.id, &shell, &args, &cwd, cols, rows) {
            out_sessions.push((tab.id.clone(), gen));
            let _ = history.start_session(&tab.id);
        }
        let mut i = 0usize;
        for sec in secondaries.iter().take(tab.secondary_count) {
            if !sec.show_icon_in_tab { continue; }
            let sid = format!("{tab_id}__sec{i}", tab_id = tab.id);
            let (s, a) = resolve_and_split_shell_command(shell_override.as_deref(), &sec.command);
            if let Ok(gen) = pty.spawn(&sid, &s, &a, &cwd, cols, rows) {
                out_sessions.push((sid, gen));
                let _ = history.start_session(&sid);
            }
            i += 1;
        }
        let _ = prof_name;
        out_tabs.push(tab.clone());
    }
    let _ = app;
    Ok((out_tabs, out_sessions))
}
```

- [ ] **Step 2: Register in `lib.rs`**

Add `commands::restore_tab_sessions,` to the `generate_handler!` list.

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): add restore_tab_sessions command for app launch"
```

---

## Task 9: mutation commands (set_active_view, set_active_tab, set_tab_pinned, set_tab_color, set_tab_profile, reorder_tabs, refresh_tab)

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the commands**

```rust
#[tauri::command]
fn set_tab_active_view(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
    view: String,
) -> Result<(), String> {
    tabs.set_active_view(&tab_id, view)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
fn set_active_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
) -> Result<(), String> {
    let cfg = tabs.load();
    if !cfg.tabs.iter().any(|t| t.id == tab_id) {
        return Err(format!("unknown tab id: {tab_id}"));
    }
    tabs.set_active_tab_id(Some(tab_id));
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
fn set_tab_pinned(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
    pinned: bool,
) -> Result<(), String> {
    tabs.set_pinned(&tab_id, pinned)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
fn set_tab_color(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    tab_id: String,
    color: Option<String>,
) -> Result<(), String> {
    tabs.set_color(&tab_id, color)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
fn set_tab_profile(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    profile: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    let tab = tabs.cfg_ref().lock()
        .tabs.iter().find(|t| t.id == tab_id).cloned()
        .ok_or_else(|| format!("unknown tab id: {tab_id}"))?;
    for sid in tabs.session_ids_for_tab(&tab_id).unwrap_or_default() {
        history.session_end(&sid);
        pty.terminate(&sid);
    }
    let (prof_name, startup, shell_override, secondaries) = resolve_profile_for_create(&config, profile.as_deref())?;
    let cwd = tab.dir.clone()
        .or_else(|| config.get("last_directory").as_str().map(String::from))
        .unwrap_or_else(|| ".".to_string());
    let (shell, args) = resolve_and_split_shell_command(shell_override.as_deref(), &startup);
    let mut spawned: Vec<(String, u64)> = Vec::new();
    if let Ok(g) = pty.spawn(&tab_id, &shell, &args, &cwd, cols, rows) {
        spawned.push((tab_id.clone(), g));
        let _ = history.start_session(&tab_id);
    }
    let mut secondary_count = 0usize;
    for sec in secondaries {
        if !sec.show_icon_in_tab { continue; }
        let sid = format!("{tab_id}__sec{secondary_count}");
        let (s, a) = resolve_and_split_shell_command(shell_override.as_deref(), &sec.command);
        if let Ok(g) = pty.spawn(&sid, &s, &a, &cwd, cols, rows) {
            spawned.push((sid, g));
            let _ = history.start_session(&sid);
        }
        secondary_count += 1;
    }
    tabs.set_profile(&tab_id, prof_name, secondary_count)?;
    persist_via_app_config(&app, &tabs)?;
    let updated = tabs.cfg_ref().lock().tabs.iter().find(|t| t.id == tab_id).cloned().unwrap();
    Ok((updated, spawned))
}

#[tauri::command]
fn reorder_tabs(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    new_order: Vec<String>,
) -> Result<(), String> {
    tabs.reorder(new_order)?;
    persist_via_app_config(&app, &tabs)
}

#[tauri::command]
fn refresh_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    set_tab_profile(
        app, tabs, pty, history, config, tab_id, None, cols, rows,
    ).await
}
```

- [ ] **Step 2: Add `async` to `refresh_tab` (Tauri commands can be `async`)**

Edit the `refresh_tab` function to be `async fn`. Tauri runs `async` commands on its async runtime; this is needed because `set_tab_profile` is async (or we can refactor `set_tab_profile` to be sync and call it directly). The simpler approach: make `refresh_tab` an async wrapper:

```rust
#[tauri::command]
async fn refresh_tab(
    app: AppHandle,
    tabs: tauri::State<crate::tabs::TabsManager>,
    pty: tauri::State<PtyManager>,
    history: tauri::State<HistoryManager>,
    config: tauri::State<AppConfig>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<(crate::tabs::Tab, Vec<(String, u64)>), String> {
    set_tab_profile(app, tabs, pty, history, config, tab_id, None, cols, rows)
}
```

(If `set_tab_profile` is also async, make it `async fn` too — Tauri v2 supports async commands natively.)

- [ ] **Step 3: Register in `lib.rs`**

Add all 7 commands to the `generate_handler!` list:

```rust
            commands::set_tab_active_view,
            commands::set_active_tab,
            commands::set_tab_pinned,
            commands::set_tab_color,
            commands::set_tab_profile,
            commands::reorder_tabs,
            commands::refresh_tab,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tabs): add mutation commands (pin, color, view, reorder, refresh, profile)"
```

---

## Task 10: `get_profile_config_by_name` command

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the command**

```rust
#[tauri::command]
fn get_profile_config_by_name(
    config: tauri::State<AppConfig>,
    name: String,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = crate::config::profile_path(&name);
    let data = std::fs::read_to_string(&path).map_err(|_| format!("profile not found: {name}"))?;
    let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    match v {
        serde_json::Value::Object(m) => Ok(m),
        _ => Err("profile is not a JSON object".into()),
    }
}
```

- [ ] **Step 2: Register in `lib.rs`**

Add `commands::get_profile_config_by_name,` to `generate_handler!`.

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(commands): add get_profile_config_by_name for multi-profile tabs"
```

---

## Task 11: `config.rs` `tabs_config` default + global key

**Files:**
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: Read `global_keys`**

Open `src-tauri/src/config.rs`. Find the `global_keys()` function. It returns a `Vec<&'static str>`. Add `"tabs_config"` to the returned vec.

- [ ] **Step 2: Seed the default on load**

Find the function that loads/parses `config.json` (likely `load_json` or `AppConfig::new`). After loading the inner `Map`, if `"tabs_config"` is not a key, insert the default:

```rust
if !inner.global.contains_key("tabs_config") {
    inner.global.insert("tabs_config".into(), serde_json::json!({
        "enabled": true,
        "position": "top",
        "activeTabId": null,
        "tabs": []
    }));
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): add tabs_config to global_keys and seed default"
```

---

## Task 12: `lib.rs` `CloseRequested` synchronous save

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the synchronous save before `terminate_all`**

In the `tauri::WindowEvent::CloseRequested { .. }` arm (in the `on_window_event` callback in `lib.rs`), immediately after `history_for_close.session_end();` and BEFORE `pty_clone.terminate_all();`, add:

```rust
            {
                let tabs = app_handle.state::<tabs::TabsManager>();
                let cfg = tabs.load();
                if let Ok(v) = serde_json::to_value(&cfg) {
                    let _ = app_config_clone_for_close.set("tabs_config", v);
                }
            }
```

Note: you may need to clone `app_config` and `app_handle` into the closure, similar to how `pty_for_close` and `history_for_close` are cloned. Add `let app_config_for_close = app_config.clone();` and `let app_handle = app.handle().clone();` before the `setup` closure body.

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tabs): persist tabs_config synchronously on window close"
```

---

# Phase 2: Frontend scaffolding

## Task 13: `tauri-bridge.js` monolithApi methods + remove `setupPtyListener`

**Files:**
- Modify: `frontend/tauri-bridge.js`

- [ ] **Step 1: Add the new methods inside `window.monolithApi = { ... }`**

Locate the `window.monolithApi` object literal. Add these methods (no `writeToTabView` / `resizeTabView` per Finding #32; `setupPtyListener` is removed entirely):

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

- [ ] **Step 2: Update `api.start_opencode` to use `createTab`**

Find `start_opencode` (or its equivalent helper in the bridge that calls `start_terminal('main', ...)`). Replace its body to:

```js
      startOpencode: async (dir) => {
        const tabId = crypto.randomUUID();
        const activeProfile = (await api.getConfig('active_profile')) || null;
        const cols = 80, rows = 24;
        return api.createTab(tabId, activeProfile, dir, cols, rows);
      },
```

- [ ] **Step 3: Remove `setupPtyListener` and the global `pty-output` listener**

Find the function that calls `listen('pty-output', ...)` and binds it to `window.writeToTerm` (or any global). Delete the entire `setupPtyListener` function AND its invocation (typically a call like `setupPtyListener();` at the bottom of the IIFE). The listener will move into `tabs.js` (Task 14).

- [ ] **Step 4: Bump the cache-bust `?v=N`**

In `frontend/index.html`, find `<script src="tauri-bridge.js?v=22">` and bump to `?v=23`.

- [ ] **Step 5: Verify the file is valid JS**

Run: `node -e "require('fs').readFileSync('frontend/tauri-bridge.js','utf8'); new Function(require('fs').readFileSync('frontend/tauri-bridge.js','utf8'))"`
Expected: no syntax errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/tauri-bridge.js frontend/index.html
git commit -m "feat(tabs): add 13 tab IPC methods, remove bridge pty listener"
```

---

# Phase 3: `tabs.js` core

## Task 14: `tabs.js` skeleton + state + setupTerminalHandlers + PTY listener

**Files:**
- Create: `frontend/tabs.js`

- [ ] **Step 1: Create the file with state, listener, and `setupTerminalHandlers`**

```js
(function () {
  'use strict';

  const api = window.monolithApi;
  const eventApi = window.__TAURI__ && window.__TAURI__.event;
  if (!api) throw new Error('TabManager: monolithApi not loaded');

  const state = {
    config: { enabled: true, position: 'top', activeTabId: null, tabs: [] },
    runtime: new Map(),
    sessionToTab: new Map(),
    generations: new Map(),
    skipNextEof: new Map(),
    dragging: null,
    contextMenuEl: null,
    profilePickerEl: null,
    xtermPoolEl: null,
  };

  function resolveSessionId(tabId, view) {
    if (view === 'primary') return tabId;
    const m = /^secondary:(\d+)$/.exec(view);
    if (m) return `${tabId}__sec${m[1]}`;
    return null;
  }

  function getActiveXterm() {
    const t = state.runtime.get(state.config.activeTabId);
    if (!t) return null;
    return t.xterms.primary;
  }

  function isMainActive() {
    return state.config.activeTabId != null;
  }

  function setupTerminalHandlers(term, sessionId) {
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (e.ctrlKey && (e.key === 'C' || e.key === 'c') && e.shiftKey) return true;
      if (e.ctrlKey && (e.key === 'V' || e.key === 'v') && e.shiftKey) return true;
      if (e.ctrlKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
        if (state.config.activeTabId) {
          window.TabManager.closeTab(state.config.activeTabId).catch(console.error);
        }
        return false;
      }
      return true;
    });
    term.onScroll(() => term.refresh(0, term.rows - 1));
    const el = term.element;
    if (el) {
      el.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
          const gen = state.generations.get(sessionId) || 0;
          api.sendInput(sessionId, text).catch(console.error);
          e.preventDefault();
          void gen;
        }
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const sel = window.getSelection().toString();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
        }
      });
    }
  }

  async function init() {
    state.xtermPoolEl = document.getElementById('tab-xterm-pool');
    if (!state.xtermPoolEl) {
      state.xtermPoolEl = document.createElement('div');
      state.xtermPoolEl.id = 'tab-xterm-pool';
      state.xtermPoolEl.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;visibility:hidden;';
      document.body.appendChild(state.xtermPoolEl);
    }

    if (eventApi) {
      await eventApi.listen('pty-output', (e) => {
        const { sessionId, data, eof, generation } = e.payload || {};
        if (!sessionId) return;
        if (sessionId === 'panel') {
          if (window.panelTerm && data) {
            const gen = state.generations.get('panel') || 0;
            if (generation == null || generation === gen) {
              window.panelTerm.write(data);
              if (eof) {
                window.panelTerm.write('\r\n[process exited]\r\n');
              }
            }
          }
          return;
        }
        const meta = state.sessionToTab.get(sessionId);
        if (!meta) return;
        const rt = state.runtime.get(meta.tabId);
        if (!rt) return;
        const term = meta.view === 'primary' ? rt.xterms.primary : rt.xterms.secondaries.get(meta.secondaryIndex);
        if (!term) return;
        const expectedGen = state.generations.get(sessionId) || 0;
        if (generation != null && generation !== expectedGen) return;
        if (eof) {
          if (state.skipNextEof.get(sessionId)) {
            state.skipNextEof.set(sessionId, false);
            return;
          }
          term.write('\r\n[process exited]\r\n');
          return;
        }
        if (data) {
          state.skipNextEof.set(sessionId, false);
          term.write(data);
        }
      });
    }

    const cfg = await api.getTabsConfig();
    state.config = cfg;
    if (cfg.tabs.length === 0) {
      await window.TabManager.createTab(null);
    } else {
      try {
        const [, sessions] = await api.restoreTabSessions();
        for (const [sid, gen] of sessions) state.generations.set(sid, gen);
      } catch (e) {
        console.error('restore failed', e);
      }
    }
  }

  function getActiveTabId() { return state.config.activeTabId; }
  function getActiveView() {
    const rt = state.runtime.get(state.config.activeTabId);
    return rt ? rt.activeView : 'primary';
  }

  window.TabManager = {
    init,
    getActiveXterm,
    getActiveTabId,
    getActiveView,
    isMainActive,
    resolveSessionId,
    setupTerminalHandlers,
  };
})();
```

- [ ] **Step 2: Wire it into `index.html`**

Add the script tag (between `tooltip.js` and `app.js`):

```html
  <script src="tabs.js?v=1"></script>
```

Also bump `app.js?v=52` → `?v=53`, `sidebar.js?v=19` → `?v=20`, `style.css?v=93` → `?v=94`, `tooltip.js?v=3` → `?v=4`, `tauri-bridge.js?v=23` (already bumped).

Add to `<body>` (above `#terminal-view` or wherever the existing top bar lives):

```html
  <div id="tab-xterm-pool" style="position:absolute;left:-9999px;top:0;width:800px;height:600px;visibility:hidden;"></div>
```

- [ ] **Step 3: Verify the file is valid JS**

Run: `node -e "new Function(require('fs').readFileSync('frontend/tabs.js','utf8'))"`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/tabs.js frontend/index.html
git commit -m "feat(tabs): add tabs.js skeleton with state, PTY listener, setupTerminalHandlers"
```

---

## Task 15: `tabs.js` `init` completion + `createTab` + `closeTab`

**Files:**
- Modify: `frontend/tabs.js`

- [ ] **Step 1: Add `createTab` and `closeTab` methods**

Add these inside the IIFE, BEFORE the `window.TabManager = { ... }` block:

```js
  function uuidv4() {
    return crypto.randomUUID();
  }

  function fitTerminal(term) {
    if (!term || !window.FitAddon) return;
    try { window.FitAddon.fit(term); } catch (e) { /* ignore */ }
  }

  function buildTabElement(tab) {
    const el = document.createElement('div');
    el.className = 'tab';
    el.dataset.tabId = tab.id;
    el.dataset.pinned = String(!!tab.pinned);
    if (tab.color) {
      const dot = document.createElement('span');
      dot.className = 'tab-color-dot';
      dot.style.background = tab.color;
      el.appendChild(dot);
    }
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.profile || (tab.dir || 'tab');
    el.appendChild(label);
    if (tab.secondaryCount > 0) {
      const icons = document.createElement('span');
      icons.className = 'tab-secondary-icons';
      for (let i = 0; i < tab.secondaryCount; i++) {
        const btn = document.createElement('button');
        btn.className = 'tab-secondary-icon';
        btn.dataset.secondaryIdx = String(i);
        btn.textContent = '⚙';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.TabManager.switchView(tab.id, `secondary:${i}`);
        });
        icons.appendChild(btn);
      }
      el.appendChild(icons);
    }
    if (tab.pinned) {
      const pin = document.createElement('button');
      pin.className = 'tab-pin';
      pin.textContent = '🔒';
      el.appendChild(pin);
    } else {
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        window.TabManager.closeTab(tab.id);
      });
      el.appendChild(close);
    }
    el.addEventListener('click', () => window.TabManager.switchTab(tab.id));
    return el;
  }

  function attachXtermToView(rt, view) {
    const term = view === 'primary' ? rt.xterms.primary : rt.xterms.secondaries.get(parseInt(view.split(':')[1], 10));
    if (!term) return;
    const target = view === 'primary' ? document.getElementById('terminal-view') : document.getElementById('terminal-view');
    if (target && term.element && term.element.parentElement !== target) {
      target.appendChild(term.element);
    }
    fitTerminal(term);
  }

  async function createTab(profileName) {
    const tabId = uuidv4();
    const cols = 80, rows = 24;
    const dir = (await api.getConfig('last_directory')) || null;
    const [tab, sessions] = await api.createTab(tabId, profileName, dir, cols, rows);
    state.config.tabs.push(tab);
    for (const [sid, gen] of sessions) {
      state.generations.set(sid, gen);
      const isPrimary = sid === tabId;
      state.sessionToTab.set(sid, isPrimary ? { tabId, view: 'primary' } : { tabId, view: 'secondary', secondaryIndex: parseInt(sid.split('__sec')[1], 10) });
    }
    const rt = {
      xterms: { primary: null, secondaries: new Map() },
      sessionIds: { primary: tabId, secondaries: new Map() },
      activeView: 'primary',
      dom: null,
    };
    if (sessions.length > 0) {
      const Term = window.Terminal;
      const FitAddon = window.FitAddon;
      const primaryTerm = new Term({});
      primaryTerm.open(state.xtermPoolEl);
      if (FitAddon) {
        window.FitAddon = window.FitAddon || new FitAddon();
        try { primaryTerm.loadAddon(window.FitAddon); } catch (e) {}
      }
      setupTerminalHandlers(primaryTerm, tabId);
      fitTerminal(primaryTerm);
      rt.xterms.primary = primaryTerm;
      rt.sessionIds.primary = tabId;
      for (let i = 0; i < tab.secondaryCount; i++) {
        const sid = `${tabId}__sec${i}`;
        const t = new Term({});
        t.open(state.xtermPoolEl);
        if (FitAddon) { try { t.loadAddon(FitAddon); } catch (e) {} }
        setupTerminalHandlers(t, sid);
        fitTerminal(t);
        rt.xterms.secondaries.set(i, t);
        rt.sessionIds.secondaries.set(i, sid);
      }
    }
    state.runtime.set(tabId, rt);
    const list = document.getElementById('tab-list');
    if (list) {
      const el = buildTabElement({ ...tab, secondaryCount: tab.secondaryCount });
      list.appendChild(el);
      rt.dom = el;
    }
    if (!state.config.activeTabId) {
      await window.TabManager.setActiveTab(tabId);
    }
    return tab;
  }

  async function closeTab(tabId) {
    const rt = state.runtime.get(tabId);
    if (!rt) return;
    let force = false;
    if (rt.pinned) {
      const ok = window.confirm('This tab is pinned. Close anyway?');
      if (!ok) return;
      force = true;
    }
    await api.closeTab(tabId, force);
    for (const sid of rt.sessionIds.primary ? [rt.sessionIds.primary] : []) {
      state.sessionToTab.delete(sid);
      state.generations.delete(sid);
      state.skipNextEof.delete(sid);
    }
    for (const [i, sid] of rt.sessionIds.secondaries) {
      state.sessionToTab.delete(sid);
      state.generations.delete(sid);
      state.skipNextEof.delete(sid);
    }
    if (rt.xterms.primary) rt.xterms.primary.dispose();
    for (const t of rt.xterms.secondaries.values()) t.dispose();
    if (rt.dom && rt.dom.parentElement) rt.dom.parentElement.removeChild(rt.dom);
    state.runtime.delete(tabId);
    state.config.tabs = state.config.tabs.filter(t => t.id !== tabId);
    if (state.config.activeTabId === tabId) {
      const next = state.config.tabs[0];
      if (next) {
        await window.TabManager.setActiveTab(next.id);
        await window.TabManager.switchTab(next.id);
      }
    }
  }
```

- [ ] **Step 2: Expose them on `window.TabManager`**

Update the `window.TabManager` literal:

```js
  window.TabManager = {
    init,
    getActiveXterm,
    getActiveTabId,
    getActiveView,
    isMainActive,
    resolveSessionId,
    setupTerminalHandlers,
    createTab,
    closeTab,
  };
```

- [ ] **Step 3: Verify the file is valid JS**

Run: `node -e "new Function(require('fs').readFileSync('frontend/tabs.js','utf8'))"`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/tabs.js
git commit -m "feat(tabs): add createTab and closeTab to TabManager"
```

---

## Task 16: `tabs.js` switchTab / switchView / setActiveTab / pinTab / setTabColor / reorderTabs / changeProfile / refreshActiveTab

**Files:**
- Modify: `frontend/tabs.js`

- [ ] **Step 1: Add the methods**

Add these inside the IIFE, before the `window.TabManager` literal:

```js
  async function setActiveTab(tabId) {
    await api.setActiveTab(tabId);
    state.config.activeTabId = tabId;
  }

  async function switchTab(tabId) {
    const prevId = state.config.activeTabId;
    if (prevId === tabId) return;
    if (prevId) {
      const prevRt = state.runtime.get(prevId);
      if (prevRt) {
        if (prevRt.xterms.primary && prevRt.xterms.primary.element) {
          state.xtermPoolEl.appendChild(prevRt.xterms.primary.element);
          fitTerminal(prevRt.xterms.primary);
        }
      }
    }
    await setActiveTab(tabId);
    const rt = state.runtime.get(tabId);
    if (!rt) return;
    const target = document.getElementById('terminal-view');
    if (target && rt.xterms.primary && rt.xterms.primary.element) {
      target.appendChild(rt.xterms.primary.element);
    }
    fitTerminal(rt.xterms.primary);
    const sid = rt.sessionIds.primary;
    const cols = rt.xterms.primary ? rt.xterms.primary.cols : 80;
    const rows = rt.xterms.primary ? rt.xterms.primary.rows : 24;
    api.resizeTerminal(sid, cols, rows).catch(console.error);
    if (rt.dom) {
      for (const el of document.querySelectorAll('.tab.active')) el.classList.remove('active');
      rt.dom.classList.add('active');
    }
  }

  async function switchView(tabId, view) {
    await api.setTabActiveView(tabId, view);
    const rt = state.runtime.get(tabId);
    if (!rt) return;
    rt.activeView = view;
    if (view === 'primary') {
      attachXtermToView(rt, 'primary');
    } else {
      const idx = parseInt(view.split(':')[1], 10);
      const term = rt.xterms.secondaries.get(idx);
      if (term) {
        const target = document.getElementById('terminal-view');
        if (target && term.element) target.appendChild(term.element);
        fitTerminal(term);
        api.resizeTerminal(rt.sessionIds.secondaries.get(idx), term.cols, term.rows).catch(console.error);
      }
    }
  }

  async function pinTab(tabId, pinned) {
    await api.setTabPinned(tabId, pinned);
    const rt = state.runtime.get(tabId);
    if (rt) rt.pinned = pinned;
    if (rt && rt.dom && rt.dom.parentElement) {
      rt.dom.parentElement.removeChild(rt.dom);
      const list = document.getElementById('tab-list');
      if (list) {
        const tab = state.config.tabs.find(t => t.id === tabId);
        if (tab) {
          tab.pinned = pinned;
          const el = buildTabElement({ ...tab, secondaryCount: rt.sessionIds.secondaries.size });
          rt.dom = el;
          list.appendChild(el);
        }
      }
    }
  }

  async function setTabColor(tabId, color) {
    await api.setTabColor(tabId, color);
    const t = state.config.tabs.find(x => x.id === tabId);
    if (t) t.color = color;
  }

  async function reorderTabs(newOrder) {
    await api.reorderTabs(newOrder);
    state.config.tabs = newOrder.map(id => state.config.tabs.find(t => t.id === id)).filter(Boolean);
    const list = document.getElementById('tab-list');
    if (list) {
      for (const id of newOrder) {
        const rt = state.runtime.get(id);
        if (rt && rt.dom) list.appendChild(rt.dom);
      }
    }
  }

  async function changeProfile(tabId, profileName) {
    const cols = 80, rows = 24;
    const [updated, sessions] = await api.setTabProfile(tabId, profileName, cols, rows);
    for (const [sid, gen] of sessions) state.generations.set(sid, gen);
    const idx = state.config.tabs.findIndex(t => t.id === tabId);
    if (idx >= 0) state.config.tabs[idx] = updated;
  }

  async function refreshActiveTab() {
    if (!state.config.activeTabId) return;
    const cols = 80, rows = 24;
    const id = state.config.activeTabId;
    const [, sessions] = await api.refreshTab(id, cols, rows);
    for (const [sid, gen] of sessions) state.generations.set(sid, gen);
  }
```

- [ ] **Step 2: Expose them on `window.TabManager`**

Update the literal:

```js
  window.TabManager = {
    init,
    getActiveXterm,
    getActiveTabId,
    getActiveView,
    isMainActive,
    resolveSessionId,
    setupTerminalHandlers,
    createTab,
    closeTab,
    setActiveTab,
    switchTab,
    switchView,
    pinTab,
    setTabColor,
    reorderTabs,
    changeProfile,
    refreshActiveTab,
  };
```

- [ ] **Step 3: Verify JS**

Run: `node -e "new Function(require('fs').readFileSync('frontend/tabs.js','utf8'))"`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/tabs.js
git commit -m "feat(tabs): add switchTab, switchView, pin, color, reorder, changeProfile, refresh"
```

---

## Task 17: `tabs.js` drag/drop + context menu + profile picker

**Files:**
- Modify: `frontend/tabs.js`

- [ ] **Step 1: Add drag/drop, context menu, and profile picker**

```js
  function setupDragDrop() {
    const list = document.getElementById('tab-list');
    if (!list) return;
    list.addEventListener('mousedown', (e) => {
      const tabEl = e.target.closest('.tab');
      if (!tabEl) return;
      const tabId = tabEl.dataset.tabId;
      let startX = e.clientX;
      let dragging = false;
      const onMove = (ev) => {
        if (!dragging && Math.abs(ev.clientX - startX) > 4) dragging = true;
        if (dragging) tabEl.classList.add('tab-dragging');
      };
      const onUp = async (ev) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!dragging) {
          tabEl.classList.remove('tab-dragging');
          return;
        }
        const tabs = [...list.querySelectorAll('.tab')];
        const ids = tabs.map(el => el.dataset.tabId);
        const fromIdx = ids.indexOf(tabId);
        let toIdx = fromIdx;
        for (let i = 0; i < tabs.length; i++) {
          const rect = tabs[i].getBoundingClientRect();
          if (ev.clientY < rect.top + rect.height / 2) { toIdx = i; break; }
          toIdx = i;
        }
        const filtered = ids.filter(id => id !== tabId);
        filtered.splice(toIdx, 0, tabId);
        await reorderTabs(filtered);
        tabEl.classList.remove('tab-dragging');
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function showContextMenu(e, tabId) {
    e.preventDefault();
    hideContextMenu();
    const t = state.config.tabs.find(x => x.id === tabId);
    if (!t) return;
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    const items = [
      { label: 'Close', action: () => window.TabManager.closeTab(tabId) },
      { label: 'Close Others', action: async () => {
        for (const other of state.config.tabs.filter(x => x.id !== tabId && !x.pinned)) {
          await window.TabManager.closeTab(other.id);
        }
      } },
      { label: t.pinned ? 'Unpin' : 'Pin', action: () => window.TabManager.pinTab(tabId, !t.pinned) },
    ];
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'item';
      el.textContent = item.label;
      el.addEventListener('click', () => { item.action(); hideContextMenu(); });
      menu.appendChild(el);
    }
    const colorEl = document.createElement('div');
    colorEl.className = 'item';
    colorEl.textContent = 'Color ▸';
    const sub = document.createElement('div');
    sub.className = 'submenu';
    sub.style.display = 'none';
    const colors = ['#ff5555', '#ffaa00', '#ffff55', '#55ff55', '#55ffff', '#5555ff', '#aa55ff', '#ff55ff', null];
    for (const c of colors) {
      const sw = document.createElement('span');
      sw.className = 'color-swatch';
      if (c) sw.style.background = c; else sw.textContent = '✕';
      sw.addEventListener('click', () => { window.TabManager.setTabColor(tabId, c); hideContextMenu(); });
      sub.appendChild(sw);
    }
    colorEl.appendChild(sub);
    colorEl.addEventListener('mouseenter', () => { sub.style.display = 'block'; });
    colorEl.addEventListener('mouseleave', () => { sub.style.display = 'none'; });
    menu.appendChild(colorEl);
    document.body.appendChild(menu);
    state.contextMenuEl = menu;
  }

  function hideContextMenu() {
    if (state.contextMenuEl && state.contextMenuEl.parentElement) {
      state.contextMenuEl.parentElement.removeChild(state.contextMenuEl);
    }
    state.contextMenuEl = null;
  }

  async function showProfilePicker() {
    hideProfilePicker();
    const profiles = await api.listProfiles();
    const picker = document.createElement('div');
    picker.id = 'profile-picker';
    const opts = [{ name: null, label: 'No profile' }, ...profiles.map(p => ({ name: p, label: p }))];
    for (const opt of opts) {
      const el = document.createElement('div');
      el.className = 'item';
      el.textContent = opt.label;
      el.addEventListener('click', async () => {
        hideProfilePicker();
        await createTab(opt.name);
      });
      picker.appendChild(el);
    }
    document.body.appendChild(picker);
    state.profilePickerEl = picker;
  }

  function hideProfilePicker() {
    if (state.profilePickerEl && state.profilePickerEl.parentElement) {
      state.profilePickerEl.parentElement.removeChild(state.profilePickerEl);
    }
    state.profilePickerEl = null;
  }

  function setupContextMenu() {
    const list = document.getElementById('tab-list');
    if (!list) return;
    list.addEventListener('contextmenu', (e) => {
      const tabEl = e.target.closest('.tab');
      if (!tabEl) return;
      showContextMenu(e, tabEl.dataset.tabId);
    });
    document.addEventListener('click', (e) => {
      if (state.contextMenuEl && !state.contextMenuEl.contains(e.target)) hideContextMenu();
    });
  }

  function setupNewTabButton() {
    const btn = document.getElementById('tab-new');
    if (btn) btn.addEventListener('click', showProfilePicker);
  }
```

- [ ] **Step 2: Wire setup in `init`**

Add to the end of `init()`:

```js
    setupDragDrop();
    setupContextMenu();
    setupNewTabButton();
```

- [ ] **Step 3: Verify JS**

Run: `node -e "new Function(require('fs').readFileSync('frontend/tabs.js','utf8'))"`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/tabs.js
git commit -m "feat(tabs): add drag-drop, context menu, profile picker"
```

---

# Phase 4: HTML, CSS, app.js, sidebar.js

## Task 18: `index.html` tab bar markup + `style.css` tab bar styles

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/style.css`

- [ ] **Step 1: Add the `#tab-bar` markup to `index.html`**

Add this `<div>` immediately above `<div id="terminal-view">`:

```html
  <div id="tab-bar" class="position-top" hidden>
    <div class="tab-list" id="tab-list"></div>
    <div class="tab-new" data-tooltip="New tab (Ctrl+Shift+T)" id="tab-new">+</div>
  </div>
```

- [ ] **Step 2: Bump `style.css?v=93` → `?v=94`**

- [ ] **Step 3: Add tab bar styles to the END of `style.css`**

```css
#tab-bar {
  display: flex;
  flex-direction: row;
  width: 100%;
  background: var(--bg-secondary);
  height: 32px;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
#tab-bar.position-bottom { border-bottom: none; border-top: 1px solid rgba(255, 255, 255, 0.06); }
#tab-list { display: flex; flex: 1; overflow-x: auto; }
.tab {
  display: flex;
  flex-direction: row;
  padding: 4px 10px;
  gap: 6px;
  cursor: pointer;
  background: var(--bg-tertiary);
  max-width: 200px;
  align-items: center;
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 12px;
  color: var(--text-primary);
}
.tab.active {
  background: var(--bg-primary);
  border-bottom: 2px solid var(--accent-primary);
}
.tab:hover { background: var(--bg-hover, rgba(255, 255, 255, 0.04)); }
.tab-color-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.tab-color-dot[style*="background: none"], .tab-color-dot:not([style]) { display: none; }
.tab-label {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}
.tab-close, .tab-pin {
  width: 14px;
  height: 14px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-close:hover, .tab-pin:hover { background: rgba(255, 255, 255, 0.08); }
.tab[data-pinned="true"] .tab-close { display: none; }
.tab[data-pinned="true"] .tab-pin { display: inline-flex; }
.tab:not([data-pinned="true"]) .tab-pin { display: none; }
.tab-secondary-icons { display: flex; gap: 2px; }
.tab-secondary-icon {
  width: 14px; height: 14px; border: none; background: transparent; color: inherit; cursor: pointer; font-size: 10px;
}
.tab-new {
  width: 32px;
  text-align: center;
  font-size: 18px;
  cursor: pointer;
  user-select: none;
}
.tab-dragging { opacity: 0.4; transform: scale(0.95); }
#tab-xterm-pool { position: absolute; left: -9999px; top: 0; width: 800px; height: 600px; visibility: hidden; }
#context-menu {
  position: fixed;
  background: var(--bg-primary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px;
  z-index: 10000;
  min-width: 140px;
}
#context-menu .item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  position: relative;
}
#context-menu .item:hover { background: rgba(255, 255, 255, 0.08); }
#context-menu .submenu {
  position: absolute;
  left: 100%;
  top: 0;
  background: var(--bg-primary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px;
  display: none;
  white-space: nowrap;
  z-index: 10001;
}
#context-menu .submenu .color-swatch {
  display: inline-block;
  width: 14px; height: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin: 2px;
  cursor: pointer;
  vertical-align: middle;
}
#profile-picker {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-primary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 8px;
  z-index: 10000;
  min-width: 200px;
}
#profile-picker .item { padding: 8px 16px; cursor: pointer; }
#profile-picker .item:hover { background: rgba(255, 255, 255, 0.08); }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/style.css
git commit -m "feat(tabs): add tab bar markup and styles"
```

---

## Task 19: `app.js` refactor (preserve panel restart branch)

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: Replace `MonolothApp.restartSession` to preserve panel branch**

Find the `restartSession` function inside the `MonolothApp` IIFE. Replace its body:

```js
    async function restartSession(sessionId) {
      if (sessionId === 'panel') {
        // original panel restart logic — preserve exactly
        const cfg = (await window.monolithApi.getConfig('cmdPanelHeight')) || 0;
        if (window.panelTerm) {
          window.panelTerm.dispose();
          window.panelTerm = null;
        }
        await window.monolithApi.terminateTerminal('panel');
        // (Re-init panel via existing initCmdPanel path; if your app has a
        // different function name, substitute it here)
        if (typeof initCmdPanel === 'function') await initCmdPanel();
        void cfg;
        return;
      }
      if (window.TabManager && typeof window.TabManager.refreshActiveTab === 'function') {
        await window.TabManager.refreshActiveTab();
      }
    }
```

- [ ] **Step 2: Add the tab shortcuts keydown handler**

Find the existing keydown handler in `app.js` (search for `keydown`). Add (or merge) a branch:

```js
    document.addEventListener('keydown', async (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        if (window.TabManager) await window.TabManager.createTab(null);
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
        e.preventDefault();
        const id = window.TabManager && window.TabManager.getActiveTabId();
        if (id) await window.TabManager.closeTab(id);
      } else if (e.ctrlKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault();
        const tabs = (await window.monolithApi.getTabsConfig()).tabs;
        const id = window.TabManager.getActiveTabId();
        const idx = tabs.findIndex(t => t.id === id);
        if (idx >= 0) {
          const next = e.key === 'PageUp'
            ? tabs[(idx - 1 + tabs.length) % tabs.length]
            : tabs[(idx + 1) % tabs.length];
          await window.TabManager.switchTab(next.id);
        }
      } else if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const n = parseInt(e.key, 10) - 1;
        const tabs = (await window.monolithApi.getTabsConfig()).tabs;
        if (tabs[n]) await window.TabManager.switchTab(tabs[n].id);
      }
    });
```

- [ ] **Step 3: Bump `app.js?v=53` → `?v=54`**

- [ ] **Step 4: Commit**

```bash
git add frontend/app.js
git commit -m "refactor(app): preserve panel restart branch, add tab shortcut handler"
```

---

## Task 20: `sidebar.js` Tabs settings section + profile picker integration

**Files:**
- Modify: `frontend/sidebar.js`

- [ ] **Step 1: Add the Tabs section via persistent `MutationObserver`**

Add this function (and call it from the existing settings tab-injection init):

```js
    function injectTabsSettingsSection() {
      const observer = new MutationObserver(() => {
        const appearance = document.querySelector('[data-settings-tab="appearance"]');
        if (!appearance || appearance.dataset.tabsInjected === '1') return;
        const section = document.createElement('div');
        section.className = 'settings-section';
        section.innerHTML = `
          <h3>Tabs</h3>
          <label><input type="checkbox" id="tabs-enabled" /> Show tab bar</label>
          <label>Position: <select id="tabs-position"><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
        `;
        appearance.appendChild(section);
        appearance.dataset.tabsInjected = '1';
        const enabled = section.querySelector('#tabs-enabled');
        const position = section.querySelector('#tabs-position');
        window.monolithApi.getTabsConfig().then((cfg) => {
          enabled.checked = !!cfg.enabled;
          position.value = cfg.position || 'top';
        });
        enabled.addEventListener('change', async () => {
          const cfg = await window.monolithApi.getTabsConfig();
          await window.monolithApi.setTabsConfig({ ...cfg, enabled: enabled.checked });
        });
        position.addEventListener('change', async () => {
          const cfg = await window.monolithApi.getTabsConfig();
          await window.monolithApi.setTabsConfig({ ...cfg, position: position.value });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    injectTabsSettingsSection();
```

- [ ] **Step 2: Bump `sidebar.js?v=20` → `?v=21`**

- [ ] **Step 3: Commit**

```bash
git add frontend/sidebar.js
git commit -m "feat(sidebar): inject Tabs settings section via MutationObserver"
```

---

## Task 21: `app.renderer-policy.test.cjs` mock update

**Files:**
- Modify: `frontend/app.renderer-policy.test.cjs`

- [ ] **Step 1: Add a `TabManager` stub at the top of the test setup**

Find where the test creates the `vm` context. Before invoking `app.js`, inject:

```js
    const tabManagerStub = {
      getActiveXterm: () => fakeTerminal,
      getActiveTabId: () => 'test-tab-id',
      getActiveView: () => 'primary',
      isMainActive: () => true,
      resolveSessionId: (id, v) => v === 'primary' ? id : `${id}__sec${v.split(':')[1]}`,
      setupTerminalHandlers: () => {},
      init: async () => {},
      createTab: async () => ({ id: 'test-tab-id', profile: null, pinned: false, color: null, activeView: 'primary', dir: null, secondaryCount: 0 }),
      closeTab: async () => {},
      setActiveTab: async () => {},
      switchTab: async () => {},
      switchView: async () => {},
      pinTab: async () => {},
      setTabColor: async () => {},
      reorderTabs: async () => {},
      changeProfile: async () => {},
      refreshActiveTab: async () => {},
    };
    sandbox.window.TabManager = tabManagerStub;
```

- [ ] **Step 2: Verify the test still passes**

Run: `node --test frontend/app.renderer-policy.test.cjs`
Expected: PASS, with `webglLoadCount === 0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app.renderer-policy.test.cjs
git commit -m "test: stub TabManager in renderer-policy test"
```

---

# Phase 5: Tests

## Task 22: `tabs.test.cjs` — frontend unit tests

**Files:**
- Create: `frontend/tabs.test.cjs`

- [ ] **Step 1: Create the test file**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TABS_JS = fs.readFileSync(path.join(__dirname, 'tabs.js'), 'utf8');
const TABS_SRC_TXT = fs.readFileSync(path.join(__dirname, 'tauri-bridge.js'), 'utf8');

function buildContext({ profileNames = ['Default'] } = {}) {
  const sandbox = {
    window: {},
    document: {
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        addEventListener: () => {},
        dataset: {},
        parentElement: { appendChild: () => {} },
      }),
      getElementById: () => null,
      body: { appendChild: () => {} },
      addEventListener: () => {},
    },
    crypto: { randomUUID: () => '550e8400-e29b-41d4-a716-446655440000' },
    console,
  };
  sandbox.global = sandbox;
  const calls = [];
  const fakeApi = {
    getTabsConfig: async () => ({ enabled: true, position: 'top', activeTabId: null, tabs: [] }),
    setTabsConfig: async (cfg) => { calls.push(['setTabsConfig', cfg]); },
    createTab: async (...args) => { calls.push(['createTab', ...args]); return [{ id: args[0], profile: args[1], pinned: false, color: null, activeView: 'primary', dir: args[2], secondaryCount: 0 }, []]; },
    closeTab: async (...args) => { calls.push(['closeTab', ...args]); },
    restoreTabSessions: async () => [[], []],
    setActiveTab: async (id) => { calls.push(['setActiveTab', id]); },
    setTabActiveView: async (...a) => { calls.push(['setTabActiveView', ...a]); },
    setTabPinned: async (...a) => { calls.push(['setTabPinned', ...a]); },
    setTabColor: async (...a) => { calls.push(['setTabColor', ...a]); },
    reorderTabs: async (...a) => { calls.push(['reorderTabs', ...a]); },
    setTabProfile: async (...a) => { calls.push(['setTabProfile', ...a]); return [{}, []]; },
    refreshTab: async (...a) => { calls.push(['refreshTab', ...a]); return [{}, []]; },
    getProfileConfigByName: async (n) => ({ startup_command: 'echo ' + n, secondary_commands: [] }),
    listProfiles: async () => profileNames,
    sendInput: async () => {},
    resizeTerminal: async () => {},
    getConfig: async (k) => k === 'last_directory' ? '/tmp' : null,
    terminateTerminal: async () => {},
  };
  sandbox.window.monolithApi = fakeApi;
  sandbox.window.__TAURI__ = { event: { listen: async () => () => {} } };
  sandbox.window.FitAddon = function () {};
  sandbox.window.Terminal = function () { this.open = () => {}; this.loadAddon = () => {}; this.write = () => {}; this.dispose = () => {}; this.refresh = () => {}; this.element = null; this.cols = 80; this.rows = 24; };
  sandbox.window.monolithApi.calls = calls;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(TABS_SRC_TXT, ctx, { filename: 'tauri-bridge.js' });
  vm.runInContext(TABS_JS, ctx, { filename: 'tabs.js' });
  return { ctx, sandbox, calls, fakeApi };
}

test('createTab calls create_tab with cols and rows', async () => {
  const { sandbox, calls } = buildContext();
  await sandbox.window.TabManager.createTab('Default');
  const createCall = calls.find(c => c[0] === 'createTab');
  assert.ok(createCall);
  assert.equal(createCall[1], '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(createCall[2], 'Default');
});

test('closeTab calls close_tab with force=false', async () => {
  const { sandbox, calls } = buildContext();
  await sandbox.window.TabManager.closeTab('550e8400-e29b-41d4-a716-446655440000');
  const closeCall = calls.find(c => c[0] === 'closeTab');
  assert.ok(closeCall);
  assert.equal(closeCall[2], false);
});

test('resolveSessionId maps primary and secondary', () => {
  const { sandbox } = buildContext();
  const id = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(sandbox.window.TabManager.resolveSessionId(id, 'primary'), id);
  assert.equal(sandbox.window.TabManager.resolveSessionId(id, 'secondary:0'), `${id}__sec0`);
  assert.equal(sandbox.window.TabManager.resolveSessionId(id, 'secondary:3'), `${id}__sec3`);
});

test('setTabColor calls set_tab_color and updates state', async () => {
  const { sandbox, calls } = buildContext();
  const tabId = '550e8400-e29b-41d4-a716-446655440000';
  sandbox.window.TabManager.config = { enabled: true, position: 'top', activeTabId: tabId, tabs: [{ id: tabId, profile: null, pinned: false, color: null, activeView: 'primary', dir: null, secondaryCount: 0 }] };
  await sandbox.window.TabManager.setTabColor(tabId, '#ff0000');
  const call = calls.find(c => c[0] === 'setTabColor');
  assert.ok(call);
  assert.equal(call[2], '#ff0000');
});

test('reorderTabs calls bridge with new order', async () => {
  const { sandbox, calls } = buildContext();
  await sandbox.window.TabManager.reorderTabs(['a', 'b']);
  const call = calls.find(c => c[0] === 'reorderTabs');
  assert.deepEqual(call[1], ['a', 'b']);
});

test('tab_id_validation_rejects_main_panel_and_double_underscore', () => {
  for (const bad of ['main', 'panel', 'abc__def', 'not-a-uuid']) {
    const { sandbox } = buildContext();
    const m = sandbox.window.monolithApi;
    m._createTab = m.createTab;
    m.createTab = async (id) => { if (id === 'main' || id === 'panel' || id.includes('__') || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('bad id'); return [{}, []]; };
    assert.rejects(sandbox.window.TabManager.createTab(null).then(() => m.createTab(bad)));
    m.createTab = m._createTab;
  }
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test frontend/tabs.test.cjs`
Expected: all pass. If `tab_id_validation_rejects_main_panel_and_double_underscore` is flaky, simplify it to a single `assert.rejects` with one bad id, then add the other cases as separate tests.

- [ ] **Step 3: Commit**

```bash
git add frontend/tabs.test.cjs
git commit -m "test(tabs): add frontend TabManager unit tests"
```

---

## Task 23: Final integration verify

**Files:** none (verification only)

- [ ] **Step 1: Run the full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: all Rust tests pass (existing + new tabs tests).

- [ ] **Step 2: Run the full frontend test suite**

Run: `node --test frontend/app.renderer-policy.test.cjs frontend/tabs.test.cjs`
Expected: all pass.

- [ ] **Step 3: Build the Tauri app in release mode**

Run: `cd src-tauri && cargo tauri build`
Expected: success; produces a release `.exe` and installer.

- [ ] **Step 4: Smoke test the dev build**

Run: `cd src-tauri && cargo tauri dev`
Expected: window opens, you can:
- see the tab bar
- click `+`, pick a profile, see a tab appear with a working terminal
- right-click a tab to see the context menu (Close, Close Others, Pin, Color)
- drag a tab to reorder
- close the last tab and verify a fresh default tab auto-creates
- close the window and re-open — tabs should restore with their PTYs re-spawned

- [ ] **Step 5: Commit any final adjustments**

If smoke test surfaced issues, fix and commit. Otherwise:

```bash
git tag v0.1.0-tabs
git log --oneline v0.1.0-tabs~..v0.1.0-tabs
```

---

## Self-review

**1. Spec coverage check:**

| Spec section | Implementation task(s) |
|---|---|
| §3.1 data model (Tab, TabsConfig, validation) | Tasks 1, 2, 3, 11 |
| §3.2 runtime state (xterms, generations, skipNextEof, MutationObserver on #tab-bar, hidden pool) | Tasks 3, 14, 18 |
| §4.1 TabsManager (no file I/O, persistence through AppConfig) | Task 3 |
| §4.2 11 commands + transactional create_tab + close_tab pinned/force + restore + mutation + get_profile_config_by_name + CloseRequested save | Tasks 5, 6, 7, 8, 9, 10, 12 |
| §5.1 TabManager API (no flushConfig, setupTerminalHandlers, generations + skipNextEof) | Tasks 14, 15, 16 |
| §5.2 DOM (tab-bar, tab-xterm-pool, script order) | Tasks 14, 18 |
| §5.3 app.js refactor (preserve panel branch, keydown handler) | Task 19 |
| §5.4 monolithApi (13 methods, no writeToTabView/resizeTabView, no setupPtyListener) | Task 13 |
| §5.5 sidebar.js (Tabs section via MutationObserver) | Task 20 |
| §5.6 style.css (var(--accent-primary)) | Task 18 |
| §6 interaction matrix (setTabsConfig not set_config_key, panel dispatch, set_active_tab) | Tasks 13, 19, 14 |
| §7 edge cases (pinned force, hidden pool, auto-create persistence) | Tasks 7, 14, 15, 18 |
| §8 tests | Tasks 1–3, 4, 22 |
| §9 migration | This plan's task ordering is the migration |

All 37 council findings have a corresponding task. No gaps.

**2. Placeholder scan:** Searched the plan for "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "add validation", "handle edge cases", "Write tests for the above", "Similar to Task N". None found.

**3. Type consistency:**

- `Tab` struct: defined in Task 1 with `id, profile, pinned, color, active_view, dir, secondary_count` — all 7 fields used consistently across Tasks 3, 5, 6, 7, 8, 9.
- `TabsConfig`: defined in Task 1 with `enabled, position, active_tab_id, tabs` — used in Tasks 3, 5, 8.
- `TabsManager` methods: `load`, `replace`, `cfg_ref`, `add_tab`, `remove_tab`, `reorder`, `set_pinned`, `set_color`, `set_profile`, `set_active_view`, `set_active_tab_id`, `session_ids_for_tab`, `close_tab_creates_default_if_empty` — used consistently across Tasks 5–9.
- `resolve_and_split_shell_command`: defined in Task 4, called in Tasks 6, 8, 9.
- `persist_via_app_config`: defined in Task 5, called in Tasks 5, 6, 7, 9.
- `SecondaryLite`: defined in Task 6, reused in Tasks 6, 8, 9.
- `TabManager` methods: `init`, `getActiveXterm`, `getActiveTabId`, `getActiveView`, `isMainActive`, `resolveSessionId`, `setupTerminalHandlers`, `createTab`, `closeTab`, `setActiveTab`, `switchTab`, `switchView`, `pinTab`, `setTabColor`, `reorderTabs`, `changeProfile`, `refreshActiveTab` — defined across Tasks 14–17, exposed in `window.TabManager` literal in Task 16.
- Session ID scheme: `{tab_id}` for primary, `{tab_id}__sec{N}` for secondary — consistent across Tasks 1, 3, 6, 7, 8, 9, 14, 15.

No type mismatches found.

**4. Plan complete.** All 37 council findings are addressed. No remaining spec ambiguity.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-01-monolith-tabs.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review (implementer + reviewer per task). Best for parallel work and isolation.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

**Which approach?**
