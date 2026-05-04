# Lightpanda CDP & Web API Compatibility

## CDP Methods

### Fully Supported

These CDP domains work through Lightpanda's CDP server:

| Domain    | Methods                                                                                        | Notes                               |
| --------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| `Page`    | navigate, reload, getFrameTree                                                                 | Core navigation                     |
| `Runtime` | evaluate, callFunctionOn, getProperties                                                        | JavaScript execution via V8         |
| `DOM`     | getDocument, querySelector, querySelectorAll, getOuterHTML, setAttributeValue, removeAttribute | Full DOM traversal and manipulation |
| `Network` | enable, disable, setCookie, getCookies, deleteAllCookies                                       | Request tracking, cookie management |
| `Target`  | getTargets, createTarget, closeTarget                                                          | Tab management                      |
| `Input`   | dispatchKeyEvent, dispatchMouseEvent                                                           | Keyboard and mouse simulation       |
| `Fetch`   | enable, fulfillRequest, failRequest                                                            | Network interception                |

### Partially Supported

| Domain       | Status  | Limitations                         |
| ------------ | ------- | ----------------------------------- |
| `CSS`        | Minimal | No computed styles, no layout info  |
| `DOMStorage` | Basic   | localStorage/sessionStorage get/set |
| `Log`        | Basic   | Console message forwarding          |

### Not Supported

| Domain                   | Reason                                            |
| ------------------------ | ------------------------------------------------- |
| `Emulation`              | No rendering engine for viewport/device emulation |
| `Page.captureScreenshot` | No visual rendering                               |
| `Page.printToPDF`        | No CSS layout engine                              |
| `Overlay`                | No rendering for highlight overlays               |
| `Animation`              | No CSS animation engine                           |
| `Audits`                 | No accessibility/performance auditing             |
| `Media`                  | No media playback engine                          |
| `WebAudio`               | No audio processing                               |
| `WebAuthn`               | Not implemented                                   |

## Web APIs

### Available in Lightpanda

| API                           | Notes                           |
| ----------------------------- | ------------------------------- |
| DOM (Document, Element, Node) | Full implementation             |
| Fetch API                     | HTTP requests from page context |
| XMLHttpRequest                | Legacy HTTP support             |
| setTimeout / setInterval      | Timer APIs                      |
| JSON                          | Full support                    |
| URL / URLSearchParams         | URL manipulation                |
| TextEncoder / TextDecoder     | Encoding                        |
| Console                       | console.log, warn, error        |
| FormData                      | Form data construction          |
| Headers                       | HTTP header manipulation        |
| AbortController               | Request cancellation            |
| Promise                       | Full async support              |
| Event / EventTarget           | DOM events                      |
| MutationObserver              | DOM change detection            |
| CustomEvent                   | Custom event dispatch           |

### Not Available

| API                          | Reason                                  |
| ---------------------------- | --------------------------------------- |
| Canvas / WebGL               | Requires GPU rendering                  |
| WebRTC                       | Real-time communication not implemented |
| Web Audio                    | No audio engine                         |
| Service Workers              | Not implemented                         |
| Web Workers                  | Limited — check current release         |
| IndexedDB                    | Not implemented                         |
| WebSocket                    | Check current release for status        |
| Intersection Observer        | Requires layout engine                  |
| Resize Observer              | Requires layout engine                  |
| CSS Animations / Transitions | No rendering                            |
| requestAnimationFrame        | No rendering loop                       |
| getComputedStyle             | No CSS resolution                       |
| getBoundingClientRect        | No layout computation                   |

## agent-browser Command Compatibility Matrix

| Command             | Works   | Notes                                      |
| ------------------- | ------- | ------------------------------------------ |
| `open`              | Yes     |                                            |
| `back` / `forward`  | Yes     |                                            |
| `reload`            | Yes     |                                            |
| `close`             | Yes     |                                            |
| `snapshot`          | Yes     | Core functionality                         |
| `snapshot -i`       | Yes     | Recommended mode                           |
| `click`             | Yes     | Via CDP Input domain                       |
| `fill` / `type`     | Yes     |                                            |
| `press`             | Yes     |                                            |
| `select`            | Yes     |                                            |
| `check` / `uncheck` | Yes     |                                            |
| `hover`             | Yes     |                                            |
| `scroll`            | Partial | DOM scrollTop works; visual scroll may not |
| `get text`          | Yes     |                                            |
| `get html`          | Yes     |                                            |
| `get value`         | Yes     |                                            |
| `get attr`          | Yes     |                                            |
| `get title`         | Yes     |                                            |
| `get url`           | Yes     |                                            |
| `get count`         | Yes     |                                            |
| `get box`           | No      | Requires layout                            |
| `get styles`        | No      | Requires computed styles                   |
| `wait @ref`         | Yes     | DOM-based                                  |
| `wait --text`       | Yes     |                                            |
| `wait --url`        | Yes     |                                            |
| `wait --load`       | Yes     | Network idle detection                     |
| `wait --fn`         | Yes     | JS evaluation                              |
| `cookies`           | Yes     |                                            |
| `storage`           | Yes     |                                            |
| `network route`     | Yes     | Via Fetch domain                           |
| `network requests`  | Yes     |                                            |
| `eval`              | Yes     | V8 engine                                  |
| `find` (semantic)   | Yes     | DOM-based locators                         |
| `tab`               | Yes     | Via Target domain                          |
| `frame`             | Yes     |                                            |
| `dialog`            | Yes     |                                            |
| `state save/load`   | Yes     | Cookie + storage based                     |
| `set headers`       | Yes     |                                            |
| `set credentials`   | Yes     |                                            |
| `screenshot`        | No      | No rendering                               |
| `pdf`               | No      | No layout                                  |
| `record`            | No      | No visual output                           |
| `highlight`         | No      | No rendering                               |
| `set device`        | No      | No viewport emulation                      |
| `set media`         | No      | No CSS media                               |
| `set viewport`      | No      | No layout                                  |
| `set geo`           | Partial | Check CDP Emulation support                |
| `mouse move`        | No      | No coordinate system                       |
| `is visible`        | No      | No visibility computation                  |
| `is enabled`        | Partial | DOM attribute only                         |
| `is checked`        | Yes     | DOM attribute                              |
| `trace`             | No      | Playwright-specific                        |
| `console`           | Yes     | Via Log domain                             |
| `errors`            | Yes     | Via Log domain                             |

## Checking Current Status

Lightpanda is actively developed. For the latest compatibility:

```bash
# Check the official status page
# https://engine.lightpanda.io/status.html

# Test a specific CDP method
curl -s http://127.0.0.1:9222/json/protocol | python3 -c "
import json, sys
protocol = json.load(sys.stdin)
for domain in protocol.get('domains', []):
    print(f\"{domain['domain']}: {len(domain.get('commands', []))} commands\")
"
```
