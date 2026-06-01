# Monoloth — OpenCode TUI Launcher

**Date:** 2026-05-03
**Status:** Approved

## Overview

Monoloth is a desktop application built with Python and pywebview that serves as a launcher for the OpenCode TUI. On startup, it presents a landing screen where the user selects a working directory. Once a directory is chosen, the app transitions to an embedded terminal running OpenCode inside that directory — all within a single native window.

## Goals

- Provide a quick, visual way to launch OpenCode in any directory.
- Keep the terminal fully interactive and TUI-capable (colors, arrow keys, screen redraws).
- Require zero configuration or persistence — start fresh on every launch.

## Non-Goals

- Multi-tab or multi-session support.
- Configuration files, themes, or user preferences.
- Recent directories or session history.

## Architecture

```
Monoloth/
├── main.py              # Entry point: creates pywebview window, wires API
├── api.py               # Python class exposed to JS via pywebview bridge
├── pty_manager.py       # Wraps pywinpty.PTY; spawns and manages opencode process
├── requirements.txt     # Python dependencies
└── frontend/
    ├── index.html       # Landing screen
    ├── terminal.html    # Full-screen xterm.js terminal
    ├── app.js           # Frontend logic, JS bridge calls, xterm.js setup
    └── style.css        # Dark-themed styling
```

## Data Flow

1. `main.py` initializes pywebview and loads `frontend/index.html`.
2. User clicks **Choose Directory**. JavaScript calls `window.pywebview.api.pick_directory()`.
3. `api.py` opens a native OS folder dialog (via `tkinter.filedialog`) and returns the selected path to JS.
4. JavaScript transitions the view to `frontend/terminal.html`.
5. JavaScript calls `window.pywebview.api.start_opencode(path)`.
6. `api.py` instantiates `PtyManager` with the chosen directory.
7. `pty_manager.py` creates a `pywinpty.PTY`, spawns `opencode` with the working directory set to the chosen path.
8. A background thread in `pty_manager.py` continuously reads PTY output and pushes it to the webview via `window.evaluate_js('window.writeToTerm(<data>)')`.
9. xterm.js captures all keyboard input via `term.onData()` and forwards it to Python through `window.pywebview.api.send_input(data)`.
10. On application window close, `api.py` terminates the PTY process to prevent orphans.

## Components

### `main.py`
- Creates the pywebview window with a fixed or resizable size (e.g., 900×600 minimum).
- Instantiates the `Api` class and passes it to `webview.start(api=...)`.
- Loads `frontend/index.html` as the initial URL (loaded from the local filesystem).

### `api.py`
Exposed methods (callable from JS):
- `pick_directory() -> str | None`  
  Opens a native folder picker. Returns the absolute path, or `None` if cancelled.
- `start_opencode(directory: str) -> bool`  
  Validates that `opencode` exists in PATH. Spawns the PTY. Returns `True` on success, `False` on failure (with an error reason pushed to the terminal).
- `send_input(data: str)`  
  Writes raw terminal input (keystrokes) into the PTY.

Event handling:
- Registers a pywebview window-closed listener that calls `PtyManager.terminate()`.

### `pty_manager.py`
- Uses `pywinpty.PTY` on Windows. (Unix support can be added later with the built-in `pty` module.)
- Spawns the shell/command: `opencode` (or `cmd.exe /K opencode` if needed).
- Sets the `cwd` (current working directory) to the user-selected path.
- Runs a daemon thread that loops on `pty.read()` and pushes data to the webview.
- Provides `write_input(data: str)` and `terminate()` methods.

### Frontend

#### `index.html`
- Centered dark layout.
- Title: **Monoloth**.
- One primary button: **Choose Directory**.
- Subtle footer text (e.g., version or "OpenCode Launcher").

#### `terminal.html`
- Full-bleed dark background (`#1e1e1e` or similar).
- xterm.js terminal instantiated to fill the entire viewport.
- No page scrollbars; only xterm.js internal scrollback.
- Minimal chrome — no title bar inside the webview, since the native window already has one.

#### `app.js`
- Landing page: attaches click handler to the Choose Directory button, calls `pywebview.api.pick_directory()`, and on success navigates to `terminal.html` (or unhides the terminal container).
- Terminal page: loads xterm.js, creates the terminal with a dark theme (e.g., `theme: { background: '#1e1e1e' }`), and registers the input/output bridges.
- Defines `window.writeToTerm(data)` so Python can push output into xterm.js.

#### `style.css`
- Dark theme.
- Flexbox centering for the landing page.
- `html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }` for the terminal page.

## Error Handling

| Scenario | Behavior |
|---|---|
| User cancels directory picker | Stay on landing page, no state change. |
| `opencode` not found in PATH | Before spawning, check `shutil.which('opencode')`. If missing, show an error in the terminal view: *"Error: 'opencode' command not found. Make sure it's installed and in your PATH."* |
| PTY spawn fails | Display the exception message in the terminal view. |
| Window closed while opencode is running | `pywebview` window-closed event triggers `PtyManager.terminate()` to kill the process. |
| opencode exits naturally | PTY read thread detects EOF, prints `[opencode exited]` into xterm.js, and stops reading. |

## Dependencies

```text
pywebview>=5.0
pywinpty>=1.1
```

`pywinpty` is Windows-specific. A future Unix port can replace `pywinpty` with the standard-library `pty` module.

## Testing Notes

- Verify that arrow keys, Enter, and Ctrl+C work inside the embedded terminal.
- Verify that a TUI app (e.g., `nano`, or OpenCode itself) renders correctly without garbled escape codes.
- Verify that closing the window kills the opencode process (check Task Manager or `ps`).
- Verify that cancelling the folder picker does not leave the app in a broken state.

## Open Questions / Future Work

- **Unix support:** Replace `pywinpty` with `pty` on Linux/macOS.
- **Auto-resize:** xterm.js should refit (`term.resize()`) when the pywebview window is resized.
- **Shell selection:** Currently runs `opencode` directly. Could later allow choosing a shell (`cmd`, `PowerShell`, `bash`) that then launches opencode.
