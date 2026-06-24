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

  <p>Run OpenCode, Claude Code, and other CLI agents in a real desktop window instead of a bare terminal.</p>

  <p>
    <img src="https://img.shields.io/badge/version-2.2.3-blue" alt="version" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/rust-1.77.2-orange" alt="rust" />
    <img src="https://img.shields.io/badge/tauri-2.11.1-purple" alt="tauri" />
  </p>
</div>

[**Download latest release**](https://github.com/noahain/Monoloth/releases/latest)

[![Monoloth Main Window](assets/screenshots/main.gif?v=2)](https://github.com/noahain/Monoloth/releases/latest)

---

Monoloth wraps CLI coding agents (like OpenCode and Claude Code) in a native desktop shell on Windows, macOS, and Linux. Choose a project directory to start a session with integrated terminal emulation, multi-tab workspaces, and session history tracking.

We built the backend with Tauri 2 and Rust, and the frontend with vanilla JavaScript. The project does not use a bundler, a `package.json` file, or a Node.js build process.

### Download

Grab a prebuilt binary from the [latest release](https://github.com/noahain/Monoloth/releases/latest). No toolchain required.

**Which file?**

- **Windows**: `Monoloth_*_x64-setup.exe` (NSIS) or `Monoloth_*_x64_en-US.msi` to install; `Monoloth_*_x64_portable.exe` to run without installing.
- **macOS**: `Monoloth_*_aarch64.dmg` for Apple Silicon, `Monoloth_*_x64.dmg` for Intel. Portable `.app.zip` variants also available for both architectures.
- **Linux**: `Monoloth_*_amd64.AppImage` runs on any distro; grab the `.deb` or `.rpm` if you prefer your package manager.

Ignore `.sig`, `.app.tar.gz`, and `.app.tar.gz.sig` files. The auto-updater uses those, and you don't need them for a manual download.

| Platform | Downloads | Notes |
| -------- | --------- | ----- |
| Windows | `_x64-setup.exe`, `_x64_en-US.msi`, `_x64_portable.exe` | MSI or NSIS for install; portable is a single file |
| macOS (Apple Silicon) | `_aarch64.dmg`, `_aarch64_portable.app.zip` | DMG is the standard installer |
| macOS (Intel) | `_x64.dmg`, `_x64_portable.app.zip` | DMG is the standard installer |
| Linux | `_amd64.AppImage`, `_amd64.deb`, `.x86_64.rpm` | AppImage is portable; deb/rpm for package managers |

The app updates itself after that: it checks the release feed, verifies the minisign signature, and installs the new version on your confirmation.

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

- **Multi-tab terminal** with xterm.js WebGL rendering and a resizable secondary panel
- **Agent-agnostic launcher** — presets for OpenCode, Claude Code, Qwen, Kimi, Codex, Pi, and Gemini, or enter a custom command
- **Command palette** (`Ctrl+P`) with fuzzy filtering, sub-palettes, and keyboard navigation
- **Themes** — dark, light, and auto modes with 4 CTA styles and background images, gradients, colors, or GIFs
- **Profiles** with per-user settings isolation and per-tab switching
- **Rebindable keyboard shortcuts** with an interactive editor
- **Session history** with configurable retention and tab-scoped tracking

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




### How it works

Monoloth runs each terminal session in its own PTY (pseudoterminal) managed by `portable-pty`. Each PTY maps to a tab-scoped xterm.js instance with WebGL rendering. Session generation tokens prevent output from terminated sessions from writing to the wrong tab.

The frontend loads as vanilla IIFE modules from `<script>` tags in `index.html`. No bundler, `package.json`, or Node build step. Modules expose one `window.Monolith*` global and communicate through those globals. One command builds and runs everything: `cargo tauri dev`.

### Prerequisites

- **Rust toolchain** 1.77.2 or newer
- **Windows**: Windows 10 or newer (the installer fetches the WebView2 runtime) and [C++ Build Tools](https://learn.microsoft.com/en-us/cpp/build/vscpp-step-0-installation)
- **macOS / Linux**: builds are supported; on Linux install the webkit2gtk development packages (see the dependency list in `.github/workflows/release.yml`)

### Project Structure

<details>
<summary><b>View Directory Layout</b></summary>

```
Monoloth/
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   ├── lib.rs              # Tauri setup, window events, update commands
│   │   ├── commands/           # IPC command handlers
│   │   │   ├── config.rs       # Profile and background configuration
│   │   │   ├── fs.rs           # File system operations and previews
│   │   │   ├── history.rs      # Session history queries
│   │   │   ├── image.rs        # Image reading and brightness analysis
│   │   │   ├── mod.rs          # Shared path/shell utilities
│   │   │   ├── profile.rs      # Profile CRUD operations
│   │   │   ├── shell.rs        # Background and external terminal execution
│   │   │   ├── terminal.rs     # PTY session management and command resolution
│   │   │   ├── version.rs      # Version and Windows PTY info
│   │   │   └── window.rs       # Window controls
│   │   ├── config.rs           # AppConfig — profile-aware config store
│   │   ├── history.rs          # HistoryManager — session tracking
│   │   └── pty.rs              # PtyManager — PTY lifecycle
│   ├── Cargo.toml
│   └── tauri.conf.json
├── frontend/
│   ├── index.html              # HTML structure
│   ├── app.js                  # Central orchestration facade (MonolothApp)
│   ├── terminal.js             # Main terminal tab manager (MonolithTerminal)
│   ├── sidebar.js              # Sidebar and CMD panel logic
│   ├── command-palette.js      # Command palette overlay (MonolithPalette)
│   ├── profiles.js             # Profile management and switcher
│   ├── file-picker.js          # Custom file browser
│   ├── dialog.js               # Prompt and confirm dialogs
│   ├── shortcuts.js            # Keyboard shortcut management
│   ├── theme.js                # Theme, CTA style, and wallpaper analysis
│   ├── tauri-bridge.js         # IPC bridge (monolithApi)
│   ├── dom-utils.js            # DOM utilities and modal helpers
│   ├── tooltip.js              # Custom tooltips
│   ├── style.css               # Application stylesheet (~7000 lines)
│   └── lib/
│       ├── xterm.js            # Terminal emulator library
│       ├── xterm-addon-fit.js  # Terminal fit addon
│       ├── xterm-addon-webgl.js# WebGL renderer addon
│       ├── terminal-view.js    # xterm factory and lifecycle
│       ├── plugin-updater.js   # Updater plugin wrapper
│       ├── plugin-process.js   # Process plugin wrapper
│       └── updater-toast.js    # Update notification UI
├── assets/
│   ├── icon.png
│   ├── icon.ico
│   └── screenshots/
├── .github/
│   ├── ISSUE_TEMPLATE/         # Bug report + feature request forms
│   └── workflows/release.yml   # Cross-platform build & release matrix
├── ARCHITECTURE.md             # System architecture overview
├── CONTRIBUTING.md             # Build, style, and PR guide
├── CHANGELOG.md                # Release history
└── SECURITY.md                 # Security reporting and app scope
```
</details>

### Configuration

The application stores settings in `config.json` and saves user profiles in a `profiles/` folder, both under the platform's standard config location:

| Platform | Location |
| -------- | -------- |
| Windows | `%APPDATA%\Monoloth\` |
| macOS | `~/Library/Application Support/Monoloth/` |
| Linux | `~/.config/Monoloth/` |

Global keys (shared across all profiles) include window state, recent directories, sidebar layout, tab bar position, and panel configuration. All other keys — theme, background, startup command, shortcuts — are per-profile overridable.

#### Key Configuration Options

| Parameter | Default | Description |
| --------- | ------- | ----------- |
| `startup_command` | `opencode` | CLI agent command launched in each main terminal tab |
| `theme_mode` | `dark` | dark, light, or auto |
| `bg_type` | `none` | none, image, color, or gradient |
| `cta_button_style` | `blur` | blur, glass, solid, or outline |
| `active_profile` | `Default` | Currently active settings profile |
| `use_custom_titlebar` | `true` | Use custom titlebar instead of native decorations |
| `persistMainTabs` | `false` | Restore terminal tabs on next launch |
| `tabBarPosition` | `standard` | standard, titlebar, or hidden |
| `panelShell` | (platform default) | Shell used for the CMD panel |
| `cmdPanelOpen` | `false` | Whether the CMD panel is open on launch |

#### Settings Tabs

- **Startup** — agent command preset (opencode, claude, qwen, kimi, codex, pi, gemini, or custom), default directory, and secondary commands (before/parallel/hidden)
- **Appearance** — theme mode, background type (image/color/gradient/overlay), CTA button style, opacity, custom titlebar toggle, tab bar position
- **Keybinds** — interactive rebindable shortcut editor for all actions
- **Profiles** — create, rename, switch, and delete configuration profiles
- **History** — session tracking toggle, retention period (7/30/90 days), and clear history

### Tech Stack

Rust 1.77.2 • Tauri 2.11.1 • portable-pty • xterm.js • WebGL • Vanilla JavaScript • HTML5 • CSS3 • rfd • image • serde_json

### Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for build
instructions and [ARCHITECTURE.md](ARCHITECTURE.md) for a tour of the codebase.

### Security & Updates

Monoloth checks for updates through the Tauri updater and notifies you when one
is available. Update artifacts are signed with a minisign key, and the app
verifies that signature before installing.

As a shell for CLI agents, Monoloth spawns terminal sessions and runs the
command you configure, and it reads the project directory you choose. Settings
and profiles stay local in your platform's config directory. For the full
picture and how to report a vulnerability, see [SECURITY.md](SECURITY.md).

### Credits

xterm.js, Tauri 2, portable-pty, rfd, and the image crate.

### License
MIT
