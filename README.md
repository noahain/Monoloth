<div align="center">
  <img src="assets/icon.png" width="144" height="144" alt="Monoloth" />
<div id="toc">
  <ul style="list-style: none">
    <summary>
      <h1>Monoloth</h1>
    </summary>
  </ul>
</div>

  <p><strong>Agent-agnostic desktop shell for CLI coding tools</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-2.0.6-blue" alt="version" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/rust-1.77.2-orange" alt="rust" />
    <img src="https://img.shields.io/badge/tauri-2.11.1-purple" alt="tauri" />
  </p>
</div>

[![Monoloth Main Window](assets/screenshots/main.png)](https://github.com/noahain/Monoloth)

---

Monoloth wraps CLI coding agents (like OpenCode and Claude Code) in a native Windows desktop shell. Choose a project directory to start a session with integrated terminal emulation and session history tracking.

We built the backend with Tauri 2 and Rust, and the frontend with vanilla JavaScript. The project does not use a bundler, a `package.json` file, or a Node.js build process.

### Build & Run

Ensure you have the Rust toolchain installed, then compile the application.

```bash
# Clone the repository
git clone https://github.com/noahain/Monoloth.git
cd Monoloth

# Verify the setup
cd src-tauri
cargo check

# Run in development mode
cargo tauri dev

# Build the release executable
cargo tauri build
```

The system serves frontend assets directly from the `frontend/` directory, requiring no package manager.

### Features

- **Terminal emulator**
  - Uses xterm.js with WebGL rendering
  - Manages multiple session PTYs via `portable-pty`
  - Includes a secondary CMD panel with drag-to-resize handles
- **Command palette** (`Ctrl+P`)
  - Provides grouped commands and directory navigation
  - Allows users to trigger custom secondary actions
- **Custom sidebar**
  - Supports background commands and external terminal execution
  - Offers reorderable buttons and multiple icon options
- **Visual theme configuration**
  - Updates color themes based on wallpaper brightness
  - Applies blur or solid styling to UI elements
- **Profile system**
  - Keeps user settings separate while sharing global window states
- **Session tracking**
  - Saves session times and per-tool usage breakdowns

### Visual Gallery

<div style="display: flex; justify-content: space-between; width: 100%; gap: 20px; margin-bottom: 24px;">
  <img src="assets/screenshots/command-palette.png" alt="Command palette overlay" style="width: 48%; height: auto; border: none; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.25));" />
  <img src="assets/screenshots/settings.png" alt="Startup configuration tab" style="width: 48%; height: auto; border: none; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.25));" />
</div>

<div style="display: flex; justify-content: space-between; width: 100%; gap: 20px;">
  <img src="assets/screenshots/backgrounds.png" alt="Appearance settings tab" style="width: 48%; height: auto; border: none; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.25));" />
  <img src="assets/screenshots/history.png" alt="Session logs tab" style="width: 48%; height: auto; border: none; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.25));" />
</div>


### Customization Presets

<div style="display: flex; justify-content: space-between; width: 100%; gap: 20px;">
  <img src="assets/screenshots/preset-minimal.png" alt="Solid dark preset" style="width: 48%; height: auto; border: none; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.25));" />
  <img src="assets/screenshots/preset-vibrant.png" alt="Vibrant glass preset" style="width: 48%; height: auto; border: none; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.25));" />
</div>




### Prerequisites

- **Windows 10 or newer** (WebView2 bundles via the `embedBootstrapper` configuration)
- **Rust toolchain** 1.77.2 or newer
- **Build Tools**: [C++ Build Tools](https://learn.microsoft.com/en-us/cpp/build/vscpp-step-0-installation)

### Project Structure

<details>
<summary><b>View Directory Layout</b></summary>

```
Monoloth/
â”œâ”€â”€ src-tauri/                  # Rust backend configuration
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ main.rs             # Execution entry point
â”‚   â”‚   â”œâ”€â”€ lib.rs              # Tauri setup and window events
â”‚   â”‚   â”œâ”€â”€ commands/           # Tauri IPC commands
â”‚   â”‚   â”‚   â”œâ”€â”€ config.rs       # Profile and background configurations
â”‚   â”‚   â”‚   â”œâ”€â”€ fs.rs           # File operations and previews
â”‚   â”‚   â”‚   â”œâ”€â”€ history.rs      # Session history queries
â”‚   â”‚   â”‚   â”œâ”€â”€ image.rs        # Image reading and analysis
â”‚   â”‚   â”‚   â”œâ”€â”€ profile.rs      # Profile operations
â”‚   â”‚   â”‚   â”œâ”€â”€ shell.rs        # External execution handling
â”‚   â”‚   â”‚   â”œâ”€â”€ terminal.rs     # Terminal session management
â”‚   â”‚   â”‚   â””â”€â”€ window.rs       # Window controls
â”‚   â”‚   â”œâ”€â”€ config.rs           # Profile serialization and sanitization
â”‚   â”‚   â”œâ”€â”€ history.rs          # History tracking
â”‚   â”‚   â””â”€â”€ pty.rs              # Terminal manager interface
â”‚   â”œâ”€â”€ Cargo.toml
â”‚   â””â”€â”€ tauri.conf.json
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ index.html              # HTML structure
â”‚   â”œâ”€â”€ app.js                  # Main application controller
â”‚   â”œâ”€â”€ sidebar.js              # Sidebar logic
â”‚   â”œâ”€â”€ tauri-bridge.js         # IPC layer
â”‚   â”œâ”€â”€ dom-utils.js            # User interface utilities
â”‚   â”œâ”€â”€ tooltip.js              # Custom tooltips
â”‚   â”œâ”€â”€ style.css               # Application stylesheet
â”‚   â””â”€â”€ lib/
â”‚       â”œâ”€â”€ xterm.js            # Terminal rendering library
â”‚       â”œâ”€â”€ xterm-addon-fit.js  # Terminal fit plugin
â”‚       â”œâ”€â”€ xterm-addon-webgl.js# Terminal WebGL acceleration
â”‚       â”œâ”€â”€ plugin-updater.js   # Updater wrapper
â”‚       â”œâ”€â”€ plugin-process.js   # Process wrapper
â”‚       â””â”€â”€ updater-toast.js    # Update notifications
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ icon.png
â”‚   â”œâ”€â”€ icon.ico
â”‚   â””â”€â”€ screenshots/
â””â”€â”€ .github/workflows/release.yml
```
</details>

### Configuration

The application stores settings at `%APPDATA%/Monoloth/config.json` and saves user profiles in `%APPDATA%/Monoloth/profiles/`.

| Parameter | Default Value | Description |
| --------- | ------------- | ----------- |
| `startup_command` | `opencode` | Default CLI command |
| `theme_mode` | `dark` | Default theme configuration |
| `bg_type` | `none` | Background image type |
| `cta_button_style` | `blur` | Visual theme styling |
| `active_profile` | `Default` | Loaded settings profile |
| `use_custom_titlebar` | `true` | Frame display configuration |

#### Settings Tabs

- **Startup**: Configures startup commands and default directories.
- **Appearance**: Controls visual themes and background styles.
- **Keybinds**: Rebinds command palette shortcuts.
- **Profiles**: Manages active user profiles.
- **History**: Controls session retention rules.
- **Sidebar**: Reorders sidebar buttons and action layouts.

### Tech Stack

Rust 1.77.2 â€¢ Tauri 2.11.1 â€¢ portable-pty â€¢ xterm.js â€¢ WebGL â€¢ Vanilla JS â€¢ HTML5 â€¢ CSS3

### License
MIT
