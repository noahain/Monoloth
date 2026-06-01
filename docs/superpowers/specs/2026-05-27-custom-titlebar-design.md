# Custom Titlebar — Design Spec

**Date:** 2026-05-27
**Status:** Draft (v4 — ready for implementation)
**Applies to:** Monoloth (Tauri v2, Windows)

## 1. Overview

Implement a custom HTML/CSS titlebar for Monoloth that replaces the native Windows titlebar when enabled. Users can toggle between custom and native titlebars in Settings.

## 2. Requirements

- **Left side:** Back button (terminal view only), Refresh button (terminal view only)
- **Center:** App title "Monoloth" — draggable region (double-click to maximize/restore via Tauri's native handling)
- **Right side:** Hamburger menu button, Minimize button, Maximize/Restore toggle, Close (exit) button
- "Fullscreen" toggle switches between maximized and restored (not true OS fullscreen)
- Window position and size persist across sessions
- Maximized state restores correctly on reopen — window opens maximized without flashing windowed first
- Titlebar is draggable to move the window (via `data-tauri-drag-region` on center div)
- Double-click titlebar center to toggle maximize/restore (handled natively by Tauri v2)
- "Disable custom titlebar" option in Settings → falls back to OS native titlebar
- Custom titlebar visible on all three views: landing, terminal, and settings
- Titlebar follows CTA button style theming (blur/glass/solid/outline) with light-mode variants
- Titlebar uses `showConfirm()` for destructive actions (matching app convention)
- Titlebar has ARIA labels for accessibility

## 3. Architecture

### 3.1 Config

**New keys in `config.json`** (global only — added to `global_keys()`):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `use_custom_titlebar` | `bool` | `false` | Toggle custom titlebar on/off. **Global key.** |
| `window_x` | `i64` | `null` | Window X position. **Global key.** |
| `window_y` | `i64` | `null` | Window Y position. **Global key.** |

**`config.rs` changes:**

In `defaults()`:
```rust
m.insert("use_custom_titlebar".into(), Value::Bool(false));
m.insert("window_x".into(), Value::Null);
m.insert("window_y".into(), Value::Null);
```

In `global_keys()` — add all three to ensure they always write to global config, not per-profile:
```rust
fn global_keys() -> Vec<&'static str> {
    vec![
        "active_profile", "last_directory", "window_width", "window_height",
        "window_maximized", "fp_last_dir_bg_image", "fp_last_dir_choose",
        "use_custom_titlebar", "window_x", "window_y",
    ]
}
```

### 3.2 Data Flow — Toggle On/Off

1. User clicks "Custom" button in Settings → Appearance → Window Chrome
2. `app.js` calls `applyCustomTitlebarUI(true, true)` (enable=true, persist=true)
3. `applyCustomTitlebarUI` shows `#custom-titlebar` div, toggles `body.custom-titlebar-active`
4. Calls `window.monolithApi.toggle_custom_titlebar(true)` via bridge
5. Rust command `toggle_custom_titlebar` receives `app: tauri::AppHandle` and `config: State<AppConfig>`
6. Calls `window.set_decorations(false)` and persists `use_custom_titlebar: true` to config
7. Syncs the Settings toggle active state

**When toggling off**: Same flow with `enable: false`, `window.set_decorations(true)` restores native titlebar.

### 3.3 Data Flow — Maximize/Restore

1. User clicks maximize button, double-clicks drag region (native), or uses Win+Arrow
2. If via button: `app.js` calls `window.monolithApi.toggle_maximize_window()`
3. Rust command checks `window.is_maximized()`:
   - If NOT maximized → saves position to `window_x`/`window_y` in config, calls `window.maximize()`, saves `window_maximized: true`
   - If IS maximized → calls `window.unmaximize()`, saves `window_maximized: false`
4. Returns the new maximized state (`bool`)
5. `app.js` swaps maximize/restore icon
6. On Tauri resize events, `app.js` calls `is_window_maximized` to sync icon state (throttled to 200ms)

### 3.4 Startup — No-Flash Maximize

1. `tauri.conf.json` sets `"visible": false` and `"backgroundColor": "#0a0a0a"` on the window (preventing white flash before dark-themed HTML renders)
2. In `lib.rs` `setup()`:
   - Read all window state from config (size, position, maximized, custom titlebar)
   - Set window size and position
   - If `use_custom_titlebar` is true, call `window.set_decorations(false)` — **before** showing
   - If `window_maximized` is true, call `window.maximize()`
   - Call `window.show()` — window appears already in correct state, no flash
3. Frontend JS reads `use_custom_titlebar` on init and shows/hides `#custom-titlebar` accordingly (no state transition needed since Rust already applied decorations)

## 4. Rust Backend Changes

### 4.1 New Tauri Commands (`commands.rs`)

All commands use `tauri::AppHandle` directly (NOT `State<AppHandle>` — `AppHandle` is injected by Tauri's runtime, not managed state). Must import `use tauri::Manager;` for `get_webview_window()`.

```rust
use tauri::Manager;

#[tauri::command]
pub fn toggle_custom_titlebar(app: tauri::AppHandle, config: State<AppConfig>, enable: bool) {
    let window = app.get_webview_window("main").unwrap();
    // Save position before toggling decorations — decorations removal shifts outer_position
    if enable {
        if let Ok(pos) = window.outer_position() {
            config.set("window_x", serde_json::Value::Number(pos.x.into()));
            config.set("window_y", serde_json::Value::Number(pos.y.into()));
        }
    }
    window.set_decorations(!enable).ok();
    config.set("use_custom_titlebar", Value::Bool(enable));
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) {
    app.get_webview_window("main").unwrap().minimize().ok();
}

#[tauri::command]
pub fn toggle_maximize_window(app: tauri::AppHandle, config: State<AppConfig>) -> Result<bool, String> {
    let window = app.get_webview_window("main").unwrap();
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
        // Explicitly restore saved position — OS often gets this wrong in multi-monitor setups
        if let (Some(x), Some(y)) = (
            config.get("window_x").as_i64(),
            config.get("window_y").as_i64()
        ) {
            window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x: x as i32, y: y as i32 }
            )).ok();
        }
        config.set("window_maximized", Value::Bool(false));
    } else {
        // Save position before maximizing for proper restore
        if let Ok(pos) = window.outer_position() {
            config.set("window_x", serde_json::Value::Number(pos.x.into()));
            config.set("window_y", serde_json::Value::Number(pos.y.into()));
        }
        window.maximize().map_err(|e| e.to_string())?;
        config.set("window_maximized", Value::Bool(true));
    }
    Ok(!maximized)
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle) {
    app.get_webview_window("main").unwrap().close().ok();
}

#[tauri::command]
pub fn is_window_maximized(app: tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}
```

### 4.2 Registration in `lib.rs`

Register all commands in `invoke_handler`:
```rust
commands::toggle_custom_titlebar,
commands::minimize_window,
commands::toggle_maximize_window,
commands::close_window,
commands::is_window_maximized,
```

### 4.3 Window Setup Changes (`lib.rs`)

```rust
// In setup():
let window = app.get_webview_window("main").unwrap();

// Restore size
let width = cfg.get("window_width").as_i64().unwrap_or(1200) as u32;
let height = cfg.get("window_height").as_i64().unwrap_or(700) as u32;
window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height })).ok();

// Restore position if saved
if let (Some(x), Some(y)) = (
    cfg.get("window_x").as_i64(),
    cfg.get("window_y").as_i64()
) {
    window.set_position(tauri::Position::Physical(
        tauri::PhysicalPosition { x: x as i32, y: y as i32 }
    )).ok();
}

// Apply custom titlebar BEFORE showing to prevent flash
let use_custom = cfg.get("use_custom_titlebar").as_bool().unwrap_or(false);
if use_custom {
    window.set_decorations(false).ok();
}

// Maximize BEFORE showing
if cfg.get("window_maximized").as_bool().unwrap_or(false) {
    window.maximize().ok();
}

// Now show — window appears in final state
window.show().ok();
```

### 4.4 Window Event Handlers (`lib.rs`)

Extend the existing `on_window_event` handler:

```rust
// Resized handler: persist window_maximized (with change-detection to avoid disk I/O), persist size only when not maximized
// Moved handler: persist position only when not maximized (separate debounce timer)
// This ensures OS-initiated maximize/unmaximize (Win+Up, drag-from-maximized) is tracked.

let last_size_save = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));
let last_pos_save = std::sync::Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));

window.on_window_event(move |event| {
    if let tauri::WindowEvent::Resized(size) = event {
        if size.width > 0 && size.height > 0 {
            let is_max = window_clone.is_maximized().unwrap_or(false);
            // Only write to disk when maximized state actually changes
            let was_max = cfg_for_events.get("window_maximized").as_bool().unwrap_or(false);
            if is_max != was_max {
                cfg_for_events.set("window_maximized", serde_json::Value::Bool(is_max));
            }
            if !is_max {
                let mut last = last_size_save.lock();
                let now = std::time::Instant::now();
                if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                    *last = now;
                    drop(last);
                    cfg_for_events.set("window_width", serde_json::Value::Number(size.width.into()));
                    cfg_for_events.set("window_height", serde_json::Value::Number(size.height.into()));
                    // Also save position on resize (covers drag-resize where both events fire)
                    if let Ok(pos) = window_clone.outer_position() {
                        cfg_for_events.set("window_x", serde_json::Value::Number(pos.x.into()));
                        cfg_for_events.set("window_y", serde_json::Value::Number(pos.y.into()));
                    }
                }
            }
        }
    }
    // Save position on Moved events (separate debounce from Resized)
    if let tauri::WindowEvent::Moved(pos) = event {
        if !window_clone.is_maximized().unwrap_or(false) {
            let mut last = last_pos_save.lock();
            let now = std::time::Instant::now();
            if now.duration_since(*last) > std::time::Duration::from_millis(500) {
                *last = now;
                drop(last);
                cfg_for_events.set("window_x", serde_json::Value::Number(pos.x.into()));
                cfg_for_events.set("window_y", serde_json::Value::Number(pos.y.into()));
            }
        }
    }
    // Existing: CloseRequested handler
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        pty_clone.terminate();
    }
});
```

### 4.5 Capability Permission

Add `core:window:allow-start-dragging` to the main window's capability file (e.g., `src-tauri/capabilities/default.json`):

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    ...
  ]
}
```

Without this, `data-tauri-drag-region` will silently fail.

## 5. Frontend HTML Changes (`index.html`)

### 5.0 Body Tag Update

Initialize `data-current-view="landing"` on the `<body>` tag so CSS view-driven visibility rules work on first load:

```html
<body class="cta-blur" data-current-view="landing">
```

### 5.1 New Titlebar Element

Insert inside `<body>` as the first child (before `#bg-overlay`):

```html
<div id="custom-titlebar" class="custom-titlebar">
  <!-- Left: back + refresh (hidden on landing/settings via CSS) -->
  <div class="titlebar-section titlebar-left">
    <button id="tb-back" class="titlebar-btn" title="Back to Launcher" aria-label="Back to Launcher">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button id="tb-refresh" class="titlebar-btn" title="Refresh Session" aria-label="Refresh Session">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    </button>
  </div>

  <!-- Center: title (draggable via data-tauri-drag-region) -->
  <div class="titlebar-section titlebar-center" data-tauri-drag-region>
    <span class="titlebar-title">Monoloth</span>
  </div>

  <!-- Right: menu, minimize, max/restore, close -->
  <div class="titlebar-section titlebar-right">
    <button id="tb-menu" class="titlebar-btn" title="Menu" aria-label="Open menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <button id="tb-minimize" class="titlebar-btn" title="Minimize" aria-label="Minimize window">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <button id="tb-maximize" class="titlebar-btn" title="Maximize" aria-label="Maximize window">
      <svg class="tb-icon-max" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
      <svg class="tb-icon-restore" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
    <button id="tb-close" class="titlebar-btn titlebar-close-btn" title="Close" aria-label="Close window">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</div>
```

**Notes:**
- All visibility toggling uses CSS (`.tb-icon-restore { display: none; }`) — no inline `style="display:none"` in the HTML
- `data-tauri-drag-region` on the center div only (not the entire titlebar), so buttons remain clickable
- Tauri natively handles double-click maximize on `data-tauri-drag-region` elements — no JS dblclick handler needed

### 5.2 View Integration

- **Terminal view**: `.terminal-toolbar` stays in HTML but is hidden via CSS when `body.custom-titlebar-active`. Back functionality moves to `#tb-back`.
  - **Consistency fix**: The existing `#terminal-back-btn` must also be updated to use `showConfirm()` (matching the custom titlebar back button and AGENTS.md convention) instead of browser-native `confirm()`.
- **Landing page**: `.settings-bar` stays as-is; its `top` position shifts down by 40px when titlebar is active.
- **Settings page**: Settings modal (z-index 10000) is below titlebar (z-index 10001) so minimize/close remain clickable.
- **Cache-busting**: Increment `app.js?v=N`, `style.css?v=N`, `tauri-bridge.js?v=N` in `index.html`.

## 6. Frontend CSS (`style.css`)

### 6.1 Base Styles

```css
/* Hidden by default, shown when custom titlebar is active */
#custom-titlebar {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 40px;
    z-index: 21001; /* Above all overlays (inline-dialog = 20000) */
    align-items: center;
    padding: 0 0.5rem;
    user-select: none;
    pointer-events: none;  /* Allow drag region to receive events on empty space */
}

body.custom-titlebar-active #custom-titlebar {
    display: flex;
}

/* Buttons must regain pointer events */
.titlebar-btn {
    pointer-events: auto;
}
```

### 6.2 CTA Theme Variants (with light-mode overrides)

**Blur:**
```css
body.cta-blur #custom-titlebar {
    background: rgba(10, 10, 10, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
body.light-mode.cta-blur #custom-titlebar,
body.adaptive-light.cta-blur #custom-titlebar {
    background: rgba(245, 245, 245, 0.85);
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
```

**Glass:**
```css
body.cta-glass #custom-titlebar {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
body.light-mode.cta-glass #custom-titlebar,
body.adaptive-light.cta-glass #custom-titlebar {
    background: rgba(255, 255, 255, 0.5);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
```

**Solid:**
```css
body.cta-solid #custom-titlebar {
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-muted);
}
body.light-mode.cta-solid #custom-titlebar,
body.adaptive-light.cta-solid #custom-titlebar {
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-muted);
}
```

**Outline:**
```css
body.cta-outline #custom-titlebar {
    background: transparent;
    border-bottom: 1px solid var(--border-muted);
}
```

### 6.3 Titlebar Sections & Buttons

```css
.titlebar-section {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 100%;
}
.titlebar-left { justify-content: flex-start; min-width: 80px; }
.titlebar-center {
    flex: 1;
    justify-content: center;
    cursor: default;
    pointer-events: auto; /* Required for data-tauri-drag-region to work */
}
.titlebar-right { justify-content: flex-end; min-width: 140px; }

.titlebar-title {
    font-family: var(--font-display);
    font-size: 0.85rem;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--text-secondary);
    pointer-events: none;
}

.titlebar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
}
.titlebar-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
}
body.light-mode .titlebar-btn:hover,
body.adaptive-light .titlebar-btn:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-primary);
}

/* Restore icon hidden by default (JS toggles via updateMaximizeIcon) */
.tb-icon-restore { display: none; }

.titlebar-close-btn:hover {
    background: var(--accent-red-bg);
    color: var(--accent-red);
}
body.light-mode .titlebar-close-btn:hover,
body.adaptive-light .titlebar-close-btn:hover {
    background: rgba(224, 108, 117, 0.1);
    color: var(--accent-red);
}
```

### 6.4 View-Driven Button Visibility

```css
/* Back and refresh buttons: hidden on landing AND settings views */
/* Selector specificity (0,1,1,0) beats .titlebar-btn (0,0,1,0) — no !important needed */
body[data-current-view="landing"] #tb-back,
body[data-current-view="landing"] #tb-refresh,
body[data-current-view="settings"] #tb-back,
body[data-current-view="settings"] #tb-refresh {
    display: none;
}

/* Menu button: hidden when settings is open */
body[data-current-view="settings"] #tb-menu {
    display: none;
}
```

### 6.5 Content Offset

```css
/* Push content down by titlebar height */
body.custom-titlebar-active .landing { padding-top: 40px; }
body.custom-titlebar-active #terminal { padding-top: 40px; }
/* NOTE: Only ONE selector for terminal — #terminal is child of .terminal-view, so padding would stack to 80px */
```

### 6.6 Settings Bar Offset

When titlebar is active, push down the landing page settings bar to avoid overlap:

```css
body.custom-titlebar-active .settings-bar {
    top: calc(40px + 1.25rem);
}
```

### 6.7 Terminal Toolbar Hide

Hide the old terminal toolbar when custom titlebar is active (the back button lives in the titlebar now):

```css
body.custom-titlebar-active .terminal-toolbar {
    display: none !important;
}
```

### 6.8 Settings Toggle Styles

```css
.titlebar-toggle {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.titlebar-toggle-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.35);
    padding: 0.35rem 0.85rem;
    font-size: 0.65rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: var(--font-mono);
    letter-spacing: 0.5px;
    text-transform: uppercase;
}
.titlebar-toggle-btn:hover {
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.05);
}
.titlebar-toggle-btn.active {
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.08);
}
body.light-mode .titlebar-toggle-btn,
body.adaptive-light .titlebar-toggle-btn {
    border-color: rgba(0, 0, 0, 0.08);
    color: rgba(0, 0, 0, 0.4);
}
body.light-mode .titlebar-toggle-btn:hover,
body.adaptive-light .titlebar-toggle-btn:hover {
    border-color: rgba(0, 0, 0, 0.2);
    color: rgba(0, 0, 0, 0.85);
    background: rgba(0, 0, 0, 0.04);
}
body.light-mode .titlebar-toggle-btn.active,
body.adaptive-light .titlebar-toggle-btn.active {
    border-color: rgba(0, 0, 0, 0.25);
    color: rgba(0, 0, 0, 0.9);
    background: rgba(0, 0, 0, 0.06);
}
```

### 6.9 Z-Index Stacking

- Settings overlay (backdrop): 9999
- Settings modal: 10000
- Custom titlebar: 21001 (above all overlays including inline-dialog at 20000)
- File Picker: 11000
- Profile Switcher: 12000
- Command Palette: 15000
- Inline Dialog: 20000

## 7. Frontend JS Changes (`app.js`)

### 7.1 New State Variables

```js
var _useCustomTitlebar = false;
var _isMaximized = false;
```

### 7.2 Initialization

In the bridge-ready callback (alongside `loadBackgroundConfig`):
```js
loadCustomTitlebarConfig();
setupMaximizeSyncListener();    // Set up inside waitForBridge per app convention
```

### 7.3 Core Functions

```js
function loadCustomTitlebarConfig() {
    if (!window.monolithApi) return;
    window.monolithApi.get_config('use_custom_titlebar')
        .then(function(val) {
            _useCustomTitlebar = val === true;
            // Don't persist on init — Rust already applied decorations in setup()
            applyCustomTitlebarUI(_useCustomTitlebar, false);
            // Query initial maximize state if titlebar is active
            if (_useCustomTitlebar && window.monolithApi.is_window_maximized) {
                window.monolithApi.is_window_maximized().then(function(result) {
                    _isMaximized = result.maximized;
                    updateMaximizeIcon(_isMaximized);
                });
            }
        });
}

function applyCustomTitlebarUI(enable, persist) {
    _useCustomTitlebar = enable;
    // Visibility controlled entirely by body.custom-titlebar-active class + CSS
    // No inline display manipulation — that would override the CSS class system
    document.body.classList.toggle('custom-titlebar-active', enable);
    updateTitlebarViewState();

    // Sync Settings toggle active state
    var toggleContainer = document.getElementById('titlebar-toggle');
    if (toggleContainer) {
        var activeMode = enable ? 'custom' : 'native';
        toggleContainer.querySelectorAll('.titlebar-toggle-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.titlebar === activeMode);
        });
    }

    // Tell Rust to toggle decorations AND persist config (skip on init — Rust already applied)
    if (persist !== false && window.monolithApi) {
        window.monolithApi.toggle_custom_titlebar(enable);
    }
}

function updateTitlebarViewState() {
    if (!_useCustomTitlebar) return;
    // data-current-view on body drives CSS visibility (section 6.4)
}

function setCurrentView(view) {
    document.body.dataset.currentView = view;
    // Also track non-settings views for hideSettings() restore
    if (view !== 'settings') _currentViewState = view;
    updateTitlebarViewState();
}
```

**Note:** `applyCustomTitlebarUI` does NOT call `set_config` for `use_custom_titlebar` — the Rust command `toggle_custom_titlebar` persists it. No duplicate write.

### 7.4 Event Handlers

```js
// Back button — uses showConfirm() matching app convention
document.getElementById('tb-back').addEventListener('click', function() {
    if (_terminalRunning) {
        showConfirm('Return to Launcher', 'Return to launcher? The current session will be terminated.')
            .then(function() { backToLanding(); })
            .catch(function() {});
    } else {
        backToLanding();
    }
});

// Refresh button — re-spawn terminal
document.getElementById('tb-refresh').addEventListener('click', function() {
    if (_currentLaunchDir) {
        showTerminal(_currentLaunchDir);
    }
});

// Menu button → open command palette
document.getElementById('tb-menu').addEventListener('click', function() {
    openPalette();
});

// Minimize
document.getElementById('tb-minimize').addEventListener('click', function() {
    if (window.monolithApi) window.monolithApi.minimize_window();
});

// Maximize/Restore
document.getElementById('tb-maximize').addEventListener('click', function() {
    if (window.monolithApi) {
        window.monolithApi.toggle_maximize_window().then(function(result) {
            _isMaximized = result.maximized;
            updateMaximizeIcon(_isMaximized);
        });
    }
});

// Close — confirm if terminal is running
document.getElementById('tb-close').addEventListener('click', function() {
    if (_terminalRunning) {
        showConfirm('Exit Monoloth', 'A terminal session is running. Exit anyway?')
            .then(function() { if (window.monolithApi) window.monolithApi.close_window(); })
            .catch(function() {});
    } else {
        if (window.monolithApi) window.monolithApi.close_window();
    }
});

// NO dblclick handler on titlebar-center — Tauri handles it natively via data-tauri-drag-region
```

### 7.5 Maximize Icon Swap

```js
function updateMaximizeIcon(maximized) {
    var btn = document.getElementById('tb-maximize');
    if (!btn) return;
    var maxIcon = btn.querySelector('.tb-icon-max');
    var restoreIcon = btn.querySelector('.tb-icon-restore');
    if (maxIcon) maxIcon.style.display = maximized ? 'none' : '';
    if (restoreIcon) restoreIcon.style.display = maximized ? '' : 'none';
    btn.title = maximized ? 'Restore' : 'Maximize';
    btn.setAttribute('aria-label', maximized ? 'Restore window' : 'Maximize window');
}
```

### 7.6 Window Event Listener for State Sync

Throttled to avoid excessive IPC on resize. Set up inside `waitForBridge()` alongside other Tauri-dependent init (matching app convention):

```js
function setupMaximizeSyncListener() {
    if (window.__TAURI__ && window.__TAURI__.event) {
        window.__TAURI__.event.listen('tauri://resize', function() {
        if (!_useCustomTitlebar) return;
        if (_maximizeSyncTimer) clearTimeout(_maximizeSyncTimer);
        _maximizeSyncTimer = setTimeout(function() {
            if (window.monolithApi && window.monolithApi.is_window_maximized) {
                window.monolithApi.is_window_maximized().then(function(result) {
                    if (result.maximized !== _isMaximized) {
                        _isMaximized = result.maximized;
                        updateMaximizeIcon(_isMaximized);
                    }
                });
            }
        }, 200);
    });
}
```

### 7.7 View State Tracking

Integrate `setCurrentView()` into existing view-transition functions:

```js
// Modified showTerminal:
function showTerminal(dir) {
    setCurrentView('terminal');
    // ... rest of existing function
}

// Modified backToLanding:
function backToLanding() {
    setCurrentView('landing');
    // ... rest of existing function
}

// Modified showSettings:
function showSettings() {
    setCurrentView('settings');
    // ... rest of existing function
    // _currentViewState already stores the previous view
}

// Modified hideSettings:
function hideSettings() {
    setCurrentView(_currentViewState);  // restore previous view
    // ... rest of existing function
}
```

### 7.8 Settings Toggle Event Handlers

```js
var titlebarToggle = document.getElementById('titlebar-toggle');
if (titlebarToggle) {
    titlebarToggle.addEventListener('click', function(e) {
        var btn = e.target.closest('.titlebar-toggle-btn');
        if (!btn) return;
        var enable = btn.dataset.titlebar === 'custom';
        applyCustomTitlebarUI(enable, true);
    });
}
```

### 7.9 Bridge Additions (`tauri-bridge.js`)

```js
// Generic config getter — needed by loadCustomTitlebarConfig()
api.get_config = function(key) {
    return invoke('get_config', { key: key })
        .catch(function(err) { return null; });
};

// Window control commands — return {success, ...} to match app convention
api.toggle_custom_titlebar = function(enable) {
    return invoke('toggle_custom_titlebar', { enable: enable })
        .then(function() { return { success: true }; })
        .catch(function(err) { return { success: false, error: String(err) }; });
};
api.minimize_window = function() {
    return invoke('minimize_window', {})
        .then(function() { return { success: true }; })
        .catch(function(err) { return { success: false, error: String(err) }; });
};
api.toggle_maximize_window = function() {
    return invoke('toggle_maximize_window', {})
        .then(function(m) { return { success: true, maximized: m }; })
        .catch(function(err) { return { success: false, maximized: false, error: String(err) }; });
};
api.close_window = function() {
    return invoke('close_window', {})
        .then(function() { return { success: true }; })
        .catch(function(err) { return { success: false, error: String(err) }; });
};
api.is_window_maximized = function() {
    return invoke('is_window_maximized', {})
        .then(function(m) { return { success: true, maximized: m }; })
        .catch(function(err) { return { success: false, maximized: false, error: String(err) }; });
};
```

## 8. Settings UI

### 8.1 Appearance Tab Addition

In the Appearance tab, after the CTA Button Style selector:

```html
<div class="form-group">
    <label>Window Chrome</label>
    <div class="titlebar-toggle" id="titlebar-toggle">
        <button class="titlebar-toggle-btn active" data-titlebar="native">Native</button>
        <button class="titlebar-toggle-btn" data-titlebar="custom">Custom</button>
    </div>
</div>
```

The `.active` class on the buttons is managed by `applyCustomTitlebarUI()` (section 7.3).

## 9. Key Considerations

- **No native resize borders**: With `decorations: false`, Windows removes the ~4px resize grip. Tauri v2 respects `minWidth`/`minHeight` (800x500). Window is still resizable via OS invisible border.
- **No window shadow**: Removed with `decorations: false`. Could add CSS `box-shadow` later if needed.
- **Focus trapping**: Titlebar buttons remain focusable during modals. Mitigated by `showConfirm()` for destructive actions. `tabindex` management could be added later if needed.
- **Settings toggle triggers re-decorate**: When disabling, `set_decorations(true)` re-shows native titlebar. Window may shift slightly — expected Windows behavior.
- **CTA consistency**: All titlebar styles use `body.cta-X #custom-titlebar` selectors, no `!important` on structural styles.
- **Dblclick maximize**: Handled natively by Tauri v2 `data-tauri-drag-region` — no JS dblclick listener needed.
- **Config write from Rust only**: `toggle_custom_titlebar` persists config on Rust side. JS never writes `use_custom_titlebar` to config directly. On init, `applyCustomTitlebarUI` passes `persist=false` (Rust already applied decorations in `setup()`), avoiding redundant IPC.
- **`window_maximized` persisted on OS-initiated state changes**: The `Resized` handler writes `window_maximized` with change-detection (only when state flips), avoiding disk I/O on every resize frame.
- **Separate debounce timers**: `Resized` and `Moved` events use independent `last_size_save` / `last_pos_save` timers (`Arc<parking_lot::Mutex>`), so drag-resize doesn't lose position data.
- **Position restored on unmaximize**: `toggle_maximize_window` explicitly calls `window.set_position()` after `unmaximize()` using saved `window_x`/`window_y`, preventing multi-monitor position drift.
- **Position saved before decoration toggle**: `toggle_custom_titlebar` saves `outer_position()` to config before `set_decorations(false)`, capturing the correct pre-toggle position.
- **Implementation note**: Verify that CSS variables `--bg-tertiary`, `--border-muted`, `--font-display`, `--text-secondary`, `--text-muted`, `--text-primary`, `--accent-red`, `--accent-red-bg` exist in existing `style.css` before implementation. If any are missing, add to `:root` block.

## 10. Files Modified

| File | Changes |
|------|---------|
| `src-tauri/tauri.conf.json` | Add `"visible": false` and `"backgroundColor": "#0a0a0a"` to window config |
| `src-tauri/capabilities/default.json` | Add `core:window:allow-start-dragging` permission |
| `src-tauri/src/commands.rs` | Add 5 new Tauri commands; add `use tauri::Manager`; add `get_config` command |
| `src-tauri/src/lib.rs` | Update window setup (visible=false, decorations before show, position restore, backgroundColor); add Moved event handler (`Arc<parking_lot::Mutex>`, separate debounce); persist `window_maximized` with change-detection; restore position on unmaximize |
| `src-tauri/src/config.rs` | Add `use_custom_titlebar`, `window_x`, `window_y` to defaults and `global_keys()` |
| `frontend/index.html` | Add `data-current-view="landing"` to `<body>`; add `#custom-titlebar` HTML; increment `app.js?v=N`, `style.css?v=N`, `tauri-bridge.js?v=N` |
| `frontend/style.css` | Add titlebar styles (z-index: 21001), CTA variants (with light-mode), content offset, view visibility (no `!important`), pointer-events fix, settings offset, toolbar hide, toggle button styles, `.tb-icon-restore { display: none }` |
| `frontend/app.js` | Add titlebar logic (`setCurrentView` also updates `_currentViewState`), event handlers, view state integration, maximize sync (inside `waitForBridge`), settings toggle wiring; update existing `#terminal-back-btn` to use `showConfirm()` |
| `frontend/tauri-bridge.js` | Add 5 new window-control bridge methods with `{success}` wrapping; add `get_config(key)` method |

## 11. Out of Scope

- Custom resize handles (OS native handles sufficient for v1)
- Custom window shadow (minimal impact on dark background)
- Animated titlebar transitions
- macOS/Linux support (Windows-only app)
- `tabindex` management during modals (future refinement)
