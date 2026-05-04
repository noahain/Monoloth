---
marp: true
theme: default
paginate: true
header: 'Engineering Talk · Internal'
footer: 'marp-slides · technical example'
style: |
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --brand: #5b8def;
    --bg: #0f1419;
    --surface: #161b22;
    --border: #21262d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --text-dim: #484f58;
    --ok: #3fb950;
    --warn: #d29922;
    --bad: #f85149;
  }

  section {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', sans-serif;
    font-weight: 300;
    padding: 56px 72px;
  }

  h1 { font-weight: 800; font-size: 2.4em; color: var(--text); letter-spacing: -0.01em; }
  h2 { font-weight: 300; font-size: 1.1em; color: var(--text-muted); margin-top: 0; }
  h3 { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 0.65em; color: var(--brand); text-transform: uppercase; letter-spacing: 0.15em; }

  strong { color: var(--brand); font-weight: 600; }

  code {
    font-family: 'JetBrains Mono', monospace;
    background: var(--surface);
    color: #79c0ff;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.85em;
    border: 1px solid var(--border);
  }

  pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px 20px;
    font-size: 0.7em;
    line-height: 1.5;
  }

  pre code {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--text);
  }

  blockquote {
    border-left: 3px solid var(--brand);
    padding-left: 16px;
    color: var(--text-muted);
    font-style: italic;
  }

  section.lead {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    background: linear-gradient(135deg, #0f1419 0%, #161b22 50%, #0f1419 100%);
  }

  section.lead h1 { font-size: 3.2em; }

  header { color: var(--text-dim); font-size: 0.7em; font-family: 'JetBrains Mono', monospace; }
  footer { color: var(--text-dim); font-size: 0.65em; font-family: 'JetBrains Mono', monospace; }
  section::after { color: var(--text-dim); font-size: 0.7em; }

  .terminal { background: #0a0e13; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-top: 16px; }
  .terminal-bar { background: #161b22; padding: 10px 14px; display: flex; gap: 6px; align-items: center; border-bottom: 1px solid var(--border); }
  .terminal-bar span { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .dot-red { background: var(--bad); }
  .dot-yellow { background: var(--warn); }
  .dot-green { background: var(--ok); }
  .terminal pre { background: #0a0e13; border: none; margin: 0; color: var(--ok); }
---

<!-- _class: lead -->
<!-- _paginate: skip -->
<!-- _header: '' -->

# Building marp-slides

## A generic MARP skill for armory — scope, design, and the export pipeline

---

### Problem

# Three skills, one niche missing

Armory shipped two slide-adjacent skills:

- **`html-presentation`** — Reveal.js, browser-native, scroll navigation
- **`document-skills:pptx`** — binary PowerPoint manipulation

Neither covered the **markdown-source, CLI-exportable** use case. Engineers who want slides in git, reproducible builds, and PDF output on a CI runner had no path.

> The fix: add `marp-slides`, targeting the upstream MARP ecosystem directly.

---

### Scope

# What this skill does

- Author decks as plain `.md` files with YAML frontmatter
- Theme with CSS (two originals — `dark-dashboard`, `light-editorial`)
- Export to **PDF**, **PPTX**, **HTML** via `marp-cli`
- SVG charts, metric cards, status tags for dashboard-style decks

## What it explicitly does **not** do

- Editable PowerPoint with native transitions → use `document-skills:pptx`
- Reveal.js browser slides → use `html-presentation`
- Static posters → use `concept-to-image`

---

### Architecture

# File layout

```
skills/marp-slides/
├── SKILL.md                    # triggers, scope, step-by-step
├── references/
│   ├── DIRECTIVES.md          # Marpit directives, always loaded
│   ├── THEMES.md              # dark-dashboard + light-editorial CSS
│   ├── COMPONENTS.md          # SVG charts, cards, layouts
│   ├── EXPORT.md              # marp-cli flags, Chrome deps
│   └── examples/
│       ├── dashboard.md       # SVG charts + metric cards
│       ├── editorial.md       # long-form, split backgrounds
│       └── technical.md       # this deck
└── evals/
    └── cases.yaml             # trigger matching + assertions
```

---

### Progressive Disclosure

# References load on demand

The SKILL.md maps user intent to reference file:

| User asks for | Loads |
|---|---|
| Any deck | `DIRECTIVES.md` |
| Custom theme or CSS | `+ THEMES.md` |
| Charts or dashboards | `+ COMPONENTS.md` |
| Export command | `+ EXPORT.md` |
| A concrete reference | `+ examples/*.md` |

This keeps typical invocations under **2k tokens of reference content**, vs ~10k if all references loaded up front.

---

### Export

# The command that matters

<div class="terminal">
  <div class="terminal-bar">
    <span class="dot-red"></span>
    <span class="dot-yellow"></span>
    <span class="dot-green"></span>
  </div>
  <pre><code>$ npx @marp-team/marp-cli@latest slides.md \
    --pdf --html --allow-local-files

[  INFO ] Converting 1 markdown...
[  INFO ] slides.md => slides.pdf</code></pre>
</div>

Three flags, three things they unlock:

- **`--pdf`** — format target (swap for `--pptx` or `--html`)
- **`--html`** — allow raw HTML in markdown body (required for SVG charts)
- **`--allow-local-files`** — allow relative image paths (required for local assets)

---

### Tradeoffs

# What we gave up

| Wanted | Got instead | Why |
|---|---|---|
| 22 example decks (robonuggets) | 3 originals | Token budget + license clarity |
| Interactive `<details>` in PDF | Rendered always-open | MARP limitation, not fixable |
| Animations in PDF | Static output | PDF is static by design; use HTML export for motion |
| Google Fonts offline | Network dependency at export | Fine for most use cases; self-host for CI |

---

<!-- _class: lead -->
<!-- _paginate: skip -->
<!-- _footer: '' -->

# Ship it

## `marp-slides` v1.0.0 · feedback welcome
