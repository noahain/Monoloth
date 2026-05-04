# MARP Export Reference

Authoritative reference for `marp-cli` export commands, flags, and environment requirements. Sourced from the official [marp-team/marp-cli](https://github.com/marp-team/marp-cli) documentation.

## Quick Reference

```bash
# PDF (most common)
npx @marp-team/marp-cli@latest slides.md --pdf --allow-local-files --html

# PPTX
npx @marp-team/marp-cli@latest slides.md --pptx --allow-local-files --html

# HTML (self-contained, preserves <details> and animations)
npx @marp-team/marp-cli@latest slides.md --html

# All three in one pass
npx @marp-team/marp-cli@latest slides.md --pdf --pptx --html --allow-local-files
```

## Essential Flags

| Flag | When to use |
|---|---|
| `--pdf` | Export to PDF. Requires a Chromium-family browser installed. |
| `--pptx` | Export to PowerPoint `.pptx`. Non-editable by default (slides become images). Add `--pptx-editable` for native editable output (requires LibreOffice). |
| `--html` | Enable raw HTML tags (`<div>`, `<svg>`, `<details>`) in the markdown body. **Required** for any deck using `COMPONENTS.md` recipes. Without this flag, HTML tags are escaped to literal text. |
| `--allow-local-files` | Allow loading local images and assets during PDF/PPTX/image export. Required when using `![w:300](./photo.jpg)` style relative paths. |
| `-o <path>` | Output path override. Default is `slides.pdf` next to the input. |
| `-w` | Watch mode — re-export on file change. Useful during authoring. |
| `-s <dir>` | Server mode — serve a directory of decks as a local web site. |
| `--theme-set <path>` | Load a custom theme file (e.g., `./my-theme.css`). |

## Flag Combinations

### Authoring loop (watch + HTML)

Fastest feedback cycle during deck authoring. The HTML output is regenerated on every save and can be opened in any browser.

```bash
npx @marp-team/marp-cli@latest slides.md --html -w
```

### Production PDF

Standard PDF export with local images and custom HTML components:

```bash
npx @marp-team/marp-cli@latest slides.md \
  --pdf \
  --html \
  --allow-local-files \
  -o ./dist/deck.pdf
```

### Editable PPTX

The default `--pptx` output is a "picture-based" PPTX where each slide is a flat image — not editable in PowerPoint. For truly editable output:

```bash
npx @marp-team/marp-cli@latest slides.md --pptx --pptx-editable --html --allow-local-files
```

This requires **LibreOffice** installed on the system (`brew install --cask libreoffice` on macOS). Editable PPTX is slower to export and may lose some CSS fidelity.

### Image Export

Export individual slides as images (useful for thumbnails or social cards):

```bash
# Single image of the first slide at 2x resolution
npx @marp-team/marp-cli@latest slides.md -o title@2x.png --image-scale 2

# All slides as separate PNG files
npx @marp-team/marp-cli@latest slides.md --images png

# All slides as JPEG with quality control
npx @marp-team/marp-cli@latest slides.md --images jpeg --jpeg-quality 90
```

## Browser Dependency

PDF, PPTX, and image exports require a Chromium-family browser because `marp-cli` uses headless Chrome for rendering. On most systems this is picked up automatically from:

- macOS: Google Chrome (`~/Applications/Google Chrome.app`)
- Linux: Chromium or Google Chrome on the `$PATH`
- Windows: Google Chrome from default install location

### Custom browser path

If the browser is elsewhere, or you want to use Firefox or Brave:

```bash
marp slides.md --pdf \
  --browser firefox \
  --browser-path /usr/bin/firefox \
  --browser-timeout 60
```

| Flag | Values |
|---|---|
| `--browser` | `auto` (default), `chrome`, `chromium`, `firefox`, `brave` |
| `--browser-path` | Absolute path to the browser executable |
| `--browser-protocol` | `cdp` (default) or `webdriver-bidi` |
| `--browser-timeout` | Timeout in seconds (default 30) |

### Docker / CI environments

If you're in a minimal CI container without Chrome, install it first:

```bash
# Debian/Ubuntu
apt-get update && apt-get install -y chromium

# Then export
npx @marp-team/marp-cli@latest slides.md --pdf --browser-path /usr/bin/chromium
```

For reproducible CI, use the official MARP Docker image:

```bash
docker run --rm --init -v $PWD:/home/marp/app marpteam/marp-cli slides.md --pdf --html
```

## Installation Options

### One-off (recommended for skill usage)

```bash
npx @marp-team/marp-cli@latest slides.md --pdf
```

No install, always latest version. First run downloads ~80MB.

### Global install

```bash
npm install -g @marp-team/marp-cli
marp slides.md --pdf
```

Faster startup for repeated use, pinned version.

### Project local

```bash
npm install --save-dev @marp-team/marp-cli
npx marp slides.md --pdf
```

Version locked to `package.json`. Preferred for team projects.

### Homebrew (macOS)

```bash
brew install marp-cli
marp slides.md --pdf
```

## The `--html` Flag Explained

This flag is the single most important setting for dashboard-style decks. Without it, any raw HTML in the markdown body is escaped and rendered as literal text (`<div>` becomes visible characters).

**With `--html`:** SVG charts, metric cards, `<details>` collapsibles, and custom `<div>` layouts all render correctly. This is the mode `COMPONENTS.md` assumes.

**Without `--html`:** Only pure markdown is rendered. Built-in MARP image syntax (`![bg]`, `![w:300]`) still works because that is handled by MARP's own markdown-it extensions, not raw HTML.

**Security note:** `--html` allows arbitrary HTML including `<script>` tags. Only enable it on decks you author or trust.

### VS Code Preview

To enable raw HTML in the MARP for VS Code preview, add to `settings.json`:

```json
{
  "markdown.marp.enableHtml": true,
  "markdown.marp.allowLocalFiles": true
}
```

These two settings are the VS Code equivalents of the CLI flags `--html` and `--allow-local-files`. Without them, preview will differ from the exported PDF.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| SVG charts show as literal `<svg>` text | Missing `--html` flag | Add `--html` to the export command |
| Local images don't appear in PDF | Missing `--allow-local-files` | Add `--allow-local-files` |
| "Could not find browser executable" | No Chrome installed | Install Chrome, or use `--browser-path` |
| PDF font rendering looks wrong | Google Fonts blocked by network | Self-host fonts via `@font-face` and relative path |
| PPTX slides are flat images | Default non-editable mode | Add `--pptx-editable` and install LibreOffice |
| Export times out | Browser timeout too low | `--browser-timeout 120` |
| `<details>` elements always expanded in PDF | Expected behavior | Use HTML export for collapsible behavior |
| Animations don't play in PDF | Expected behavior | Use HTML export; PDF is static |

## Output Format Capability Matrix

| Feature | HTML | PDF | PPTX | Image |
|---|---|---|---|---|
| Raw HTML (`--html`) | ✓ | ✓ | ✓ | ✓ |
| Local images | ✓ | ✓ (with `--allow-local-files`) | ✓ (with `--allow-local-files`) | ✓ (with `--allow-local-files`) |
| Google Fonts | ✓ | ✓ | ✓ | ✓ |
| CSS animations | ✓ | ✗ (static) | ✗ (static) | ✗ (static) |
| `<details>` interactive | ✓ | ✗ (rendered open) | ✗ (rendered open) | ✗ (rendered open) |
| Bespoke transitions | ✓ | ✗ | ✗ | ✗ |
| Math (MathJax/KaTeX) | ✓ | ✓ | ✓ | ✓ |
| Editable by recipient | ✗ | ✗ | ✓ (with `--pptx-editable`) | ✗ |
| Self-contained single file | ✓ | ✓ | ✓ | N/A |

**Rule of thumb:** HTML for interactive/animated decks, PDF for most shares, PPTX only when the recipient explicitly needs PowerPoint.
