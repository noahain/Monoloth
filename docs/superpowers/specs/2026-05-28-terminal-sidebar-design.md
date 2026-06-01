# Terminal Sidebar & CMD Panel Design

## Overview

Add a 48px icon-only sidebar to the terminal view (visible only during active sessions), plus a resizable bottom CMD panel for secondary terminal sessions.

## Design Decisions

- **Sidebar width**: 48px (standard)
- **Position**: Below titlebar, full remaining window height. Swappable left/right in settings.
- **Style**: Glass/blur effect matching existing CTA button aesthetic
- **Corner radius**: 8px (`--radius-md`) where sidebar meets titlebar and CMD panel
- **Tooltips**: On hover with 250ms delay. Single module-level timer, cleared on mouseleave, reset on each mouseenter.
- **Bottom CMD Panel**: Resizable secondary terminal, default 200px height, min 80px, max 60% of window height
- **Custom button modes**: Background (fire-and-forget), External CMD (new native CMD window), CMD Panel (runs in bottom panel)
- **Drag reorder**: HTML5 drag-and-drop in settings
- **PtyManager**: Refactored to `HashMap<String, PtySession>` keyed by session ID (`"main"`, `"panel"`)

## Data Model

Sidebar buttons stored per-profile under config key `sidebar_config` (camelCase keys matching JS conventions):

```json
{
  "enabled": true,
  "position": "left",
  "buttons": [
    { "id": "open_folder", "visible": true, "order": 0 },
    { "id": "open_cmd_project", "visible": true, "order": 1 },
    { "id": "open_cmd_panel", "visible": true, "order": 2 },
    { "id": "copy_path", "visible": true, "order": 3 },
    { "id": "restart_session", "visible": true, "order": 4 }
  ],
  "customButtons": [],
  "customButtonCounter": 0
}
```

Custom button schema (camelCase keys):
```json
{
  "id": "custom_0",
  "name": "Git Status",
  "icon": "terminal",
  "command": "git status",
  "mode": "background",
  "visible": true,
  "order": 0
}
```

Modes: `"background"` (fire-and-forget via `cmd /C`, no window), `"externalCmd"` (new native CMD window via `cmd /K`), `"cmdPanel"` (sends input as keystrokes to bottom CMD panel). Default: `"background"`.

CMD panel state stored as **global-only** config keys (not per-profile):
- `cmdPanelHeight` → number, default 200, global (added to `config.rs` `global_keys()` list as `"cmdPanelHeight"`)
- `panelShell` → string, default `"cmd"`, global (added to `config.rs` `global_keys()` list as `"panelShell"`)
- `cmdPanelOpen` is session-only (defaults false on app start), not persisted — intentional: user always starts without panel

## Layout

```
┌──────────────────────────────────────────────┐
│              Custom Titlebar                  │
├────┬─────────────────────────────────────────┤
│    │ Terminal Toolbar (back button + status)  │
│ S  ├─────────────────────────────────────────┤
│ i  │                                          │
│ d  │     Main Terminal (xterm.js)             │
│ e  │    flex: 1, min-height: 0               │
│ b  │                                          │
│ a  │                                          │
│ r  │                                          │
│    ├─────────────────────────────────────────┤
│    │ CMD Panel (xterm.js) — 200px default     │
│    │ resizable, min 80px, max 60vh            │
└────┴─────────────────────────────────────────┘
```

Uses **vertical flex layout** (not absolute positioning):
- `#terminal-view` → `display: flex; flex-direction: column; position: relative; overflow: visible;`
- `#terminal-container` → `flex: 1; min-height: 0;`
- `#cmd-panel` → `height: var(--cmd-panel-height, 200px); max-height: 60vh;`
- Sidebar: `position: absolute;` 48px wide, `top: var(--titlebar-height, 32px)`, `bottom: 0`, `left: 0`
- `.sidebar-visible` class on `#terminal-view` controls all offsets:
  - `#terminal-container`, `#cmd-panel`, `.terminal-toolbar` all get `margin-left: 48px` (or `margin-right: 48px` for right position)
- When sidebar disabled: no `.sidebar-visible` class → no offset
- When CMD panel closed: `#cmd-panel` has `display: none`

Sidebar spans **full height** from below titlebar to window bottom. The CMD panel sits **inside** the sidebar's vertical space (sidebar goes full-height, CMD panel is inset from the sidebar). So the bottom-left corner of the sidebar extends below the CMD panel — no bottom-left radius needed on sidebar. Only the titlebar top-left corner gets the radius.

## Rounded Corner Treatment (8px radius)

- **Top-left of sidebar**: `border-top-left-radius: 8px` (or `border-top-right-radius` when positioned right)
- **Top-left of CMD panel**: `border-top-left-radius: 8px` (or top-right when sidebar is right)
- Applied via class on `#terminal-view`: `.has-sidebar-left` / `.has-sidebar-right`
- Only applied when the custom titlebar is active (via CSS class `.custom-titlebar-active`)
- When `use_custom_titlebar: false`, the titlebar-height CSS variable becomes `0px` and corner radii are omitted

## Default Button Actions

| Button | ID | Implementation |
|---|---|---|
| Open Project Folder | `open_folder` | `open_in_explorer(path)` — validates path exists, uses `/select,` for files |
| Open CMD in Project | `open_cmd_project` | Opens/resumes CMD Panel at project directory. Sends `cd /D "path"\n` if panel already running, or spawns new panel session at path. |
| Open CMD Panel | `open_cmd_panel` | Opens/resumes CMD Panel at `%USERPROFILE%`. Same keep-alive behavior. |
| Copy Current Path | `copy_path` | `navigator.clipboard.writeText(_currentLaunchDir)` |
| Restart Session | `restart_session` | Terminate main session, then initTerminal(dir). See `MonolothApp.restartSession()` facade for exact async flow. |

**Naming**: Default button renamed from "Open External CMD" to "Open CMD Panel" to accurately reflect that it opens the internal panel, not a native window. "External CMD" terminology is reserved exclusively for the custom-button execution mode that launches a native console window.

## New Rust Commands

Three new commands in `commands.rs`:

### 1. `open_in_explorer`
```rust
#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<bool, String> {
    let expanded = expand_env_vars(&path);
    let path_buf = std::path::Path::new(&expanded);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", expanded));
    }
    if path_buf.is_dir() {
        Command::new("explorer").arg(&expanded).spawn()
    } else {
        Command::new("explorer").arg("/select,").arg(&expanded).spawn()
    }
    .map_err(|e| format!("Failed to open explorer: {}", e))?;
    Ok(true)
}
```

- Skips `clean_path()` to preserve `\\?\` long-path prefix for deep directory trees — Explorer needs it on older Windows builds.
- Uses separate `.arg()` calls for `/select,` and path to avoid Rust double-escaping.

### 2. `execute_background`
```rust
#[tauri::command]
pub fn execute_background(command: String, cwd: String) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let expanded_cwd = expand_env_vars(&cwd);
    let clean_cwd = clean_path(&expanded_cwd);
    if command.trim().is_empty() {
        return Err("Empty command".into());
    }
    // On Windows, unconditionally wrap in cmd /C so .cmd/.bat files resolve via PATH
    Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&clean_cwd)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to execute: {}", e))?;
    Ok(true)
}
```

- No `shlex::split()` — passes raw command string to `cmd /C` which handles its own parsing
- Unconditional `cmd /C` wrapping on Windows (mandated by AGENTS.md for `.cmd`/`.bat` resolution)
- Note: shell metacharacters (pipes, redirects) work via `cmd /C` parsing

### 3. `open_external_terminal`
```rust
#[tauri::command]
pub fn open_external_terminal(command: String, cwd: String) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let expanded_cwd = expand_env_vars(&cwd);
    let clean_cwd = clean_path(&expanded_cwd);
    if command.trim().is_empty() {
        return Err("Empty command".into());
    }
    // Use cmd /C start "" cmd /K to open a new native console window
    // The empty title "" prevents start from consuming the first quoted arg as title
    Command::new("cmd")
        .args(["/C", "start", "", "cmd", "/K", &command])
        .current_dir(&clean_cwd)
        .creation_flags(CREATE_NO_WINDOW) // suppress parent cmd flash
        .spawn()
        .map_err(|e| format!("Failed to open external terminal: {}", e))?;
    Ok(true)
}
```

- `CREATE_NO_WINDOW` on parent `cmd` (suppresses flash — `start` creates the visible window)
- `""` empty title prevents `start` from eating first quoted argument
- No `shlex::split()` — raw string passed to `cmd /K` for native parsing

All three call `expand_env_vars()` and `clean_path()` per project conventions (except `open_in_explorer` which skips `clean_path()` to preserve `\\?\` long-path prefix).

Registered in `lib.rs` invoke handler list.

## PtyManager: Multi-Session Refactor

### Architecture Change

Current single-session PtyManager refactored to support two concurrent sessions:

```rust
struct PtySession {
    writer: Box<dyn Write + Send>,
    resizer: Option<Box<dyn MasterPty + Send>>,  // sole owner, not Arc
    child: Box<dyn ChildKiller + Send>,
    read_thread: Option<thread::JoinHandle<()>>,
    carryover: Vec<u8>,
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}
```

Key differences from current code:
- `writer`, `resizer`, `child` are **owned directly** (not `Arc<Mutex<...>>`) — sole ownership guarantees dropping them closes the FD.
- `resizer` is `Option<Box<...>>` so it can be explicitly taken and dropped before joining the read thread.
- Read thread only holds the reader from `try_clone_reader()` — it does NOT hold a clone of the master PTY Arc.

### Session IDs
- `"main"` — primary terminal session
- `"panel"` — CMD panel session

### IPC Changes — CRITICAL: camelCase Naming

Per AGENTS.md (Tauri v2 #1 bug source), all IPC parameters use camelCase from JS:

**Rust struct for event payload** (with `#[serde(rename_all = "camelCase")]`):
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyOutput {
    data: String,
    eof: bool,
    session_id: String,  // serialized as "sessionId" in JSON
}
```

**JS side** — always camelCase:
```js
api.start_terminal = function(sessionId, dir, recordHistory, shell) {
    return invoke('start_terminal', { sessionId: sessionId, directory: dir, recordHistory: recordHistory, shell: shell });
};
api.send_input = function(sessionId, data) {
    return invoke('send_input', { sessionId: sessionId, data: data });
};
api.resize_terminal = function(sessionId, cols, rows) {
    return invoke('resize_terminal', { sessionId: sessionId, cols: cols, rows: rows });
};
api.terminate_terminal = function(sessionId) {
    return invoke('terminate_terminal', { sessionId: sessionId });
};
```

**Rust side** — Tauri v2 auto-converts camelCase JS params to snake_case Rust:
```rust
#[tauri::command]
fn start_terminal(session_id: String, directory: String, record_history: Option<bool>, shell: Option<String>) -> ... {
    let record = record_history.unwrap_or(true);
    let shell_exe = match shell.as_deref().unwrap_or("cmd") {
        "powershell" | "pwsh" => "powershell",  // or "pwsh" for PowerShell Core
        _ => "cmd",
    };
    // Spawn shell_exe interactively (no /C flag) — both cmd.exe and
    // powershell.exe stay alive in interactive mode without flags.
    // The same spawn logic works for both — just swap the executable name.
}
```

### PTY Output Events

The `PtyOutput` struct is used for all emits — never raw `serde_json::json!` — so the payload shape stays consistent:

```rust
let _ = handle.emit("pty-output", &PtyOutput {
    data: output,
    eof: false,
    session_id: session_id.to_string(),
});
```

### Deadlock-Safe Termination

**Critical ordering**: per AGENTS.md, master PTY must be dropped BEFORE joining the read thread.

```rust
pub fn terminate(&self, session_id: &str) {
    let session = {
        let mut sessions = self.sessions.lock();
        sessions.remove(session_id)
    };
    if let Some(mut s) = session {
        // Drop writer first (closes write end)
        drop(s.writer);
        // Drop master PTY (closes reader FD, unblocks read())
        drop(s.resizer.take());
        // Kill child process
        let _ = s.child.kill();
        // Then join read thread (now safe — reader is unblocked)
        if let Some(handle) = s.read_thread.take() {
            let _ = handle.join();
        }
        // carryover bytes dropped here — intentional; partial UTF-8 at EOF is unrecoverable
    }
}

pub fn terminate_all(&self) {
    let sessions = {
        let mut s = self.sessions.lock();
        std::mem::take(&mut *s)
    };
    for (id, mut session) in sessions {
        drop(session.writer);
        drop(session.resizer.take());
        let _ = session.child.kill();
        if let Some(handle) = session.read_thread.take() {
            let _ = handle.join();
        }
    }
}
```

### History Guard

`start_terminal` takes `record_history: Option<bool>` (defaults to `true` via `record_history.unwrap_or(true)`). The frontend passes `recordHistory: false` when spawning the panel session, so only meaningful agent sessions appear in the history log.

## CMD Panel Behavior

### Shell
- Spawns an **interactive** shell directly (no `/C` or `/Command` flag), so the shell persists after command execution.
- Default: `cmd.exe`. Configurable via global config key `panelShell` — `"cmd"` (default) or `"powershell"`.
- Rust mapping: `"powershell"` → `powershell.exe`, `"pwsh"` → `pwsh.exe`, else `cmd.exe`. Both run interactively without flags.
- Add `"panelShell"` to `config.rs` `global_keys()` list with default `"cmd"`.
- Settings UI has a "CMD Panel Shell" dropdown on the Sidebar tab.

### Session Lifecycle
- When panel is toggled **closed**: PTY remains alive (keep-alive).
- When panel is toggled **open**: reconnects to existing PTY session if alive.
- When the user types `exit` in the panel: EOF fires, panel shows a "Session ended" overlay with a restart button.
- Panel is only fully terminated when: user clicks panel close button, profile switch, or app exit.

### Panel CWD on open_cmd_project
When the user clicks "Open CMD in Project" and the panel PTY is already running:
- Send `cd /D "C:\path\to\project"\n` via `send_input("panel", ...)` to change the running shell's directory.
- If the panel PTY was terminated (exited), respawn it at the project directory.
- For `open_cmd_panel`, use `%USERPROFILE%` as the directory.

### Custom button `cmdPanel` mode
- Checks if the CMD panel session exists. If not, auto-opens the panel (spawns session) before dispatching.
- Sends the command string as input via `send_input("panel", command + "\n")` to the already-running interactive PTY.
- Does **not** respawn the shell.

### Profile Switch Behavior
- On profile switch: terminate the CMD panel PTY, reset `cmd_panel_open` to false.
- This avoids orphaned sessions in stale directories.

### Resize Handling
- CMD panel drag resize: trailing-edge debounce at 100ms (matching window resize pattern).
- On resize: call `fit()` on both terminals, then `resize_terminal("main", ...)` and `resize_terminal("panel", ...)`.

### xterm.js Fit After Layout Changes
- `fit()` + `resize_terminal()` called on **main terminal** when:
  - Sidebar visibility toggles
  - CMD panel opens/closes
  - CMD panel resizes
  - Window resizes
- `fit()` + `resize_terminal()` called on **panel terminal** when:
  - CMD panel opens
  - CMD panel resizes
  - Window resizes

## Frontend Architecture

### Panel State Tracking

```js
var _panelRunning = false;
```

Set in `initCmdPanel()`, reset in panel EOF handler and on profile switch. Used by `restartSession('panel')` to decide whether to terminate before restarting.

### Module Coupling

`app.js` defines a `window.MonolothApp` facade exposing what `SidebarManager` needs:

```js
window.MonolothApp = {
    getCurrentDir: function() { return _currentLaunchDir; },
    restartSession: function(sessionId) {
        sessionId = sessionId || 'main';
        if (sessionId === 'main') {
            if (_terminalRunning) {
                _skipNextEof['main'] = true;
                window.monolithApi.terminate_terminal('main')
                    .finally(function() { _skipNextEof['main'] = false; _terminalRunning = false; initTerminal(_currentLaunchDir); });
            } else {
                initTerminal(_currentLaunchDir);
            }
        } else if (sessionId === 'panel') {
            if (_panelRunning) {
                _skipNextEof['panel'] = true;
                window.monolithApi.terminate_terminal('panel')
                    .finally(function() { _skipNextEof['panel'] = false; initCmdPanel(); });
            } else {
                initCmdPanel();
            }
        }
    },
    setSkipNextEof: function(sessionId, val) {
        _skipNextEof[sessionId] = val;
    },
    refitTerminals: function() {
        if (term && fitAddon) {
            fitAddon.fit();
            if (window.monolithApi) window.monolithApi.resize_terminal('main', term.cols, term.rows);
        }
        if (panelTerm && panelFitAddon) {
            panelFitAddon.fit();
            if (window.monolithApi) window.monolithApi.resize_terminal('panel', panelTerm.cols, panelTerm.rows);
        }
    },
    isMainActive: function() { return _terminalRunning; }
};
```

Key fixes:
- `restartSession` awaits `terminate_terminal` via `.finally()` before reinitializing — no race condition
- `_skipNextEof` reset inside `finally` block so it never leaks
- `restartSession(sessionId)` generalizes to both main and panel
- Panel restart preserves xterm.js buffer (does not recreate `panelTerm`) — only spawns new PTY
- `refitTerminals` calls `resize_terminal` after each `fit()`

### ### Per-Session EOF Handling

`_skipNextEof` changed from single boolean to per-session map:
```js
var _skipNextEof = { main: false, panel: false };
```

EOF handler filters by `sessionId` from payload:
```js
window.writeToTerm = (data, eof, sessionId) => {
    sessionId = sessionId || 'main';
    if (eof && _skipNextEof[sessionId]) {
        _skipNextEof[sessionId] = false;
        return;
    }
    if (sessionId === 'panel') {
        if (panelTerm) panelTerm.write(data);
        if (eof) showPanelExitBanner();
    } else {
        if (term) term.write(data);
        if (eof) showExitBanner();
    }
};
```

### CMD Panel Functions

**`initCmdPanel(dir)`**: Sets `_panelRunning = true`, reads `panelShell` from config via `get_config('panelShell')`, calls `start_terminal('panel', dir, false, shell)` to spawn an interactive shell. Creates/attaches `panelTerm` xterm.js instance if not yet created (preserves buffer on restart via `.dispose()` only on explicit panel close, not restart). Calls `fit()` + `resize_terminal()` on panel terminal after attach. Defaults to `_currentLaunchDir` if no `dir` argument.

**`showPanelExitBanner()`**: Sets `_panelRunning = false`. Shows a "Session ended — Click to restart" overlay inside `#cmd-panel` element, wired to call `MonolothApp.restartSession('panel')` on click. Same visual style as existing main-terminal exit banner (glass background, blur, border).

### Settings UI

New **"Sidebar"** tab between "Launcher" and "Appearance":

1. **Enable Sidebar** toggle button pair (On/Off)
2. **Position** toggle (Left/Right)
3. **Default Buttons** section
   - List of 5 default buttons (open_folder, open_cmd_project, open_cmd_panel, copy_path, restart_session)
   - Each row: drag handle, icon, name, visibility toggle
   - Reorderable via HTML5 drag-and-drop
4. **Custom Buttons** section
   - "Add Custom Button" button opens inline editor
   - Editor: name input, icon picker grid (15-20 SVG icons), command input, mode selector (Background / External CMD / CMD Panel)
   - Reorderable via HTML5 drag-and-drop
   - Remove button per custom button
5. **CMD Panel Configuration** section
   - Default height slider
   - Shell selection dropdown (cmd / powershell)
6. **Divider** line between default and custom button sections
7. **Debounced saves**: Config writes debounced to 300ms for drag-reorder and slider operations, immediate for toggles

### Dynamic Titlebar Height

CSS variable driven by body class:
```css
:root { --titlebar-height: 32px; }
body:not(.custom-titlebar-active) { --titlebar-height: 0px; }
```

Sidebar uses `top: var(--titlebar-height)` so it adjusts automatically when the custom titlebar is toggled.

### CMD Panel Height CSS Variable

On config load and on slider change in settings, `sidebar.js` sets the CSS variable:
```js
function applyPanelHeight(height) {
    document.documentElement.style.setProperty('--cmd-panel-height', height + 'px');
}
```

### Right-Side Positioning

CSS classes applied to `#terminal-view`:
```css
#terminal-view.sidebar-visible.has-sidebar-left #sidebar { left: 0; right: auto; }
#terminal-view.sidebar-visible.has-sidebar-left #terminal-container,
#terminal-view.sidebar-visible.has-sidebar-left #cmd-panel,
#terminal-view.sidebar-visible.has-sidebar-left .terminal-toolbar {
    margin-left: 48px;
}

#terminal-view.sidebar-visible.has-sidebar-right #sidebar { left: auto; right: 0; }
#terminal-view.sidebar-visible.has-sidebar-right #terminal-container,
#terminal-view.sidebar-visible.has-sidebar-right #cmd-panel,
#terminal-view.sidebar-visible.has-sidebar-right .terminal-toolbar {
    margin-right: 48px;
}

#terminal-view.has-sidebar-left #sidebar { border-top-left-radius: 8px; }
#terminal-view.has-sidebar-right #sidebar { border-top-right-radius: 8px; }
#terminal-view.has-sidebar-left #cmd-panel { border-top-left-radius: 8px; }
#terminal-view.has-sidebar-right #cmd-panel { border-top-right-radius: 8px; }
```

### Empty Sidebar
Render-time check: if no buttons are visible and no custom buttons exist, `#sidebar` gets `display: none` and `.sidebar-visible` class is removed.

### Icon System
Inline SVGs matching existing pattern in app.js. The icon picker shows 15-20 commonly useful icons.

### Config Save Debouncing
- Drag-reorder: 300ms debounce
- CMD panel resize: 100ms trailing-edge debounce
- Toggle switches and dropdowns: immediate save (user expects instant feedback)

## Cache-Busting

After any frontend file modification, bump `?v=N` in `index.html`:
- `style.css` → `?v=42`
- `app.js` → `?v=36`
- `tauri-bridge.js` → `?v=17`
- Add `sidebar.js?v=1` script tag (AFTER `app.js` script tag)

## Files to Modify/Create

### New Files
- `frontend/sidebar.js` — sidebar UI, CMD panel UI, tooltips, config management

### Modified Files
- `src-tauri/src/pty.rs` — multi-session HashMap architecture
- `src-tauri/src/commands.rs` — new commands + session_id params on PTY commands + `record_history` param
- `src-tauri/src/lib.rs` — register new commands
- `src-tauri/src/config.rs` — add `cmdPanelHeight`, `panelShell` to global keys list
- `frontend/app.js` — `MonolothApp` facade, per-session EOF, await-terminate fix
- `frontend/tauri-bridge.js` — new bridge methods, camelCase sessionId params
- `frontend/index.html` — new HTML elements, script tag, version bumps
- `frontend/style.css` — sidebar + panel CSS, dynamic classes

## Implementation Order (Atomic Groups)

### Group A: Rust backend (must ship together — no broken intermediate state)
1. Refactor PtyManager to multi-session (`HashMap<String, PtySession>`, owned handles, deadlock-safe terminate, `terminate_all`)
2. Add `session_id` to all PTY IPC commands in commands.rs (`start_terminal`, `send_input`, `resize_terminal`, `terminate_terminal`)
3. Add `record_history: Option<bool>` to `start_terminal`
4. Add `open_in_explorer`, `execute_background`, `open_external_terminal` commands
5. Add `cmdPanelHeight`, `panelShell` to config.rs global keys
6. Register all new commands in lib.rs

### Group B: Frontend bridge + HTML + CSS (safe to ship independently)
7. Update tauri-bridge.js with new methods + camelCase sessionId params
8. Add sidebar HTML (`#sidebar`) + CMD panel HTML (`#cmd-panel`) to `#terminal-view` in index.html
9. Add sidebar.js script tag AFTER app.js
10. Add all sidebar + CMD panel CSS to style.css (flex layout, sidebar-visible class, rounded corners, right-position)

### Group C: Frontend logic (depends on A + B)
11. Create sidebar.js with full sidebar logic
12. Add `MonolothApp` facade to app.js, per-session EOF handling, await-terminate restart
13. Implement sidebar settings tab
14. Wire config load/save with proper debouncing
15. Bump cache-bust versions in index.html
