# Lightpanda Setup Guide

## What is Lightpanda?

Lightpanda is a headless browser engine built from scratch in Zig, purpose-built for AI agents and automation. It implements the DOM and JavaScript (via V8) without a rendering engine, resulting in:

- **9x lower memory** (~60MB vs ~550MB for Chromium)
- **11x faster execution** (no layout/paint cycles)
- **Instant startup** (no GPU, no compositor)

It exposes a CDP (Chrome DevTools Protocol) interface, making it compatible with existing automation tools.

## Installation

### macOS (Apple Silicon / Intel)

```bash
# Recommended: installer script
curl -fsSL https://github.com/nichochar/install-lightpanda/raw/main/install.sh | bash
```

### Linux (x86_64)

```bash
curl -fsSL https://github.com/nichochar/install-lightpanda/raw/main/install.sh | bash
```

### Build from Source

Requires Zig 0.13.0+:

```bash
git clone https://github.com/lightpanda-io/browser.git
cd browser
zig build -Doptimize=ReleaseSafe
# Binary at ./zig-out/bin/lightpanda
```

### Docker

```bash
docker pull lightpanda/browser:latest
docker run -p 9222:9222 lightpanda/browser:latest serve --host 0.0.0.0 --port 9222
```

### Verify Installation

```bash
lightpanda --version
# Expected: lightpanda vX.Y.Z

# Quick CDP test
lightpanda serve --host 127.0.0.1 --port 9222 &
curl -s http://127.0.0.1:9222/json/version | python3 -m json.tool
kill %1
```

## Configuration

### CDP Server Options

```bash
lightpanda serve [OPTIONS]

Options:
  --host <addr>    Bind address (default: 127.0.0.1)
  --port <port>    CDP port (default: 9222)
```

### Environment Variables

```bash
export LIGHTPANDA_HOST="127.0.0.1"
export LIGHTPANDA_PORT="9222"
```

### Running as a Service (macOS launchd)

Create `~/Library/LaunchAgents/io.lightpanda.browser.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.lightpanda.browser</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/lightpanda</string>
        <string>serve</string>
        <string>--host</string>
        <string>127.0.0.1</string>
        <string>--port</string>
        <string>9222</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/io.lightpanda.browser.plist
launchctl start io.lightpanda.browser
```

### Running as a Service (systemd / Linux)

Create `/etc/systemd/system/lightpanda.service`:

```ini
[Unit]
Description=Lightpanda Browser CDP Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/lightpanda serve --host 127.0.0.1 --port 9222
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable lightpanda
sudo systemctl start lightpanda
```

## Verifying CDP Compatibility

```bash
# List available targets
curl -s http://127.0.0.1:9222/json/list

# Get version info
curl -s http://127.0.0.1:9222/json/version

# Test with agent-browser
agent-browser --cdp 9222 open https://example.com
agent-browser --cdp 9222 get title
# Expected: "Example Domain"
agent-browser --cdp 9222 close
```

## Resource Comparison

| Metric            | Lightpanda        | Chromium (Playwright) |
| ----------------- | ----------------- | --------------------- |
| Memory per page   | ~60MB             | ~550MB                |
| Startup time      | <100ms            | ~2s                   |
| Binary size       | ~15MB             | ~300MB                |
| JavaScript engine | V8                | V8                    |
| CSS layout        | No                | Yes                   |
| Rendering         | No                | Yes                   |
| CDP support       | Partial (growing) | Full                  |

## Known Limitations

1. **No rendering** — screenshot, PDF, visual debugging commands unavailable
2. **Partial CDP coverage** — some methods return errors; check the [status page](https://engine.lightpanda.io/status.html)
3. **Beta software** — expect occasional breaking changes between versions
4. **No extensions** — browser extensions require rendering hooks
5. **Limited Web API surface** — not all browser APIs implemented (e.g., WebGL, WebRTC, Web Audio)
