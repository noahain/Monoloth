# Command Reference — Lightpanda + agent-browser

All commands use `agent-browser --cdp <port>` to route through Lightpanda's CDP server.

## Convention

```bash
# Shorthand used in this document:
LP="agent-browser --cdp 9222"

$LP open https://example.com
$LP snapshot -i
$LP click @e1
```

In practice, define `LP` at session start or use the full form each time.

## Daemon Management

```bash
# Start Lightpanda CDP server
lightpanda serve --host 127.0.0.1 --port 9222 &

# Check if running
curl -sf http://127.0.0.1:9222/json/version && echo "OK" || echo "NOT RUNNING"

# Stop
kill $(lsof -t -i :9222) 2>/dev/null

# Start on custom port
lightpanda serve --host 127.0.0.1 --port 9333 &
```

## Navigation

```bash
$LP open <url>       # Navigate to URL
$LP back             # History back
$LP forward          # History forward
$LP reload           # Reload page
$LP close            # Close connection
```

## Snapshot

```bash
$LP snapshot              # Full accessibility tree
$LP snapshot -i           # Interactive elements only (recommended)
$LP snapshot -i -C        # Include cursor-interactive elements
$LP snapshot -c           # Compact output
$LP snapshot -d 3         # Max depth 3
$LP snapshot -s "#main"   # Scope to CSS selector
$LP snapshot -i --json    # JSON output
```

## Interaction

```bash
$LP click @e1             # Click
$LP dblclick @e1          # Double-click
$LP focus @e1             # Focus
$LP fill @e2 "text"       # Clear + type
$LP type @e2 "text"       # Type (no clear)
$LP press Enter           # Key press
$LP press Control+a       # Key combo
$LP hover @e1             # Hover
$LP check @e1             # Check checkbox
$LP uncheck @e1           # Uncheck checkbox
$LP select @e1 "value"    # Select dropdown
$LP scroll down 500       # Scroll
$LP scrollintoview @e1    # Scroll to element
$LP drag @e1 @e2          # Drag and drop
$LP upload @e1 file.pdf   # Upload file
```

## Get Information

```bash
$LP get text @e1          # Element text content
$LP get html @e1          # innerHTML
$LP get value @e1         # Input value
$LP get attr @e1 href     # Element attribute
$LP get title             # Page title
$LP get url               # Current URL
$LP get count ".item"     # Count matching elements
```

**Not available via Lightpanda:**

```bash
# $LP get box @e1         # Requires layout engine
# $LP get styles @e1      # Requires computed styles
```

## Check State

```bash
# $LP is visible @e1     # Requires rendering — use snapshot to check presence
# $LP is enabled @e1     # May work if DOM attribute-based
$LP is checked @e1        # Works — reads DOM attribute
```

## Wait

```bash
$LP wait @e1                     # Wait for element in DOM
$LP wait 2000                    # Wait N milliseconds
$LP wait --text "Success"        # Wait for text content
$LP wait --url "**/dashboard"    # Wait for URL pattern
$LP wait --load networkidle      # Wait for network idle
$LP wait --fn "window.ready"     # Wait for JS condition
```

## Cookies and Storage

```bash
$LP cookies                      # List all cookies
$LP cookies set name value       # Set cookie
$LP cookies clear                # Clear all cookies
$LP storage local                # List localStorage
$LP storage local key            # Get specific key
$LP storage local set k v        # Set value
$LP storage local clear          # Clear localStorage
```

## Network

```bash
$LP network route <url>              # Intercept requests
$LP network route <url> --abort      # Block requests
$LP network route <url> --body '{}'  # Mock response
$LP network unroute [url]            # Remove intercepts
$LP network requests                 # View tracked requests
$LP network requests --filter api    # Filter by pattern
```

## JavaScript

```bash
$LP eval "document.title"            # Simple expression
$LP eval -b "<base64>"              # Base64-encoded script
cat script.js | $LP eval --stdin     # Script from stdin
```

## Semantic Locators

```bash
$LP find text "Sign In" click
$LP find text "Sign In" click --exact
$LP find label "Email" fill "user@test.com"
$LP find placeholder "Search" type "query"
$LP find role button click --name "Submit"
$LP find testid "submit-btn" click
$LP find first ".item" click
$LP find last ".item" click
$LP find nth 2 "a" hover
```

## Tabs

```bash
$LP tab                  # List tabs
$LP tab new [url]        # New tab
$LP tab 2                # Switch to tab
$LP tab close            # Close current tab
$LP tab close 2          # Close specific tab
```

## Frames

```bash
$LP frame "#iframe"      # Switch to iframe
$LP frame main           # Return to main frame
```

## Dialogs

```bash
$LP dialog accept [text] # Accept dialog
$LP dialog dismiss       # Dismiss dialog
```

## State

```bash
$LP state save auth.json     # Save cookies + storage + auth
$LP state load auth.json     # Restore saved state
```

## Headers and Auth

```bash
$LP set headers '{"Authorization":"Bearer tok"}'  # Custom headers
$LP set credentials user pass                      # HTTP basic auth
```

## Unsupported (Lightpanda Limitations)

These commands require a rendering engine and will fail:

```bash
# $LP screenshot              # No visual rendering
# $LP screenshot --full       # No visual rendering
# $LP pdf output.pdf          # No CSS layout
# $LP record start demo.webm  # No video output
# $LP record stop             # No video output
# $LP highlight @e1           # No visual rendering
# $LP set device "iPhone 14"  # No viewport emulation
# $LP set media dark          # No CSS media queries
# $LP mouse move 100 200      # No coordinate system
# $LP set viewport 1920 1080  # No layout engine
```

**Workarounds:**

| Need                   | Instead of   | Use                                          |
| ---------------------- | ------------ | -------------------------------------------- |
| Page content           | `screenshot` | `$LP get text body > page.txt`               |
| Element identification | `highlight`  | `$LP snapshot -i`                            |
| User-agent spoofing    | `set device` | `$LP set headers '{"User-Agent":"..."}'`     |
| Page as file           | `pdf`        | `$LP get html body > page.html` then convert |
