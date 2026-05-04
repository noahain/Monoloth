# MARP Themes Reference

Two production-ready custom themes for MARP decks: `dark-dashboard` (data-dense, analytical) and `light-editorial` (long-form, lifestyle). Both are delivered as global `style:` blocks embeddable directly in deck frontmatter — no separate theme file required.

## Choosing Between Themes

| Theme | Use when |
|---|---|
| **dark-dashboard** | Metrics, analytics, KPIs, engineering talks, internal reviews, product dashboards, anything with SVG charts |
| **light-editorial** | Lifestyle, travel, recipes, long-form narrative, photography-heavy decks, customer-facing storytelling |
| **MARP built-in `default`** | Fast drafts, documentation slides, when the deck is pure text and theming is not the point |
| **MARP built-in `gaia` + `class: lead`** | Traditional conference talk aesthetic |
| **MARP built-in `uncover`** | Minimalist product pitches |

The built-in themes work with zero setup (`theme: default` in frontmatter is enough). The custom themes below require the global `style:` block but give you metric cards, SVG charts, and dashboard layouts.

## Theme 1: `dark-dashboard`

Deep near-black background, orange brand accent, `Inter` for body text, `JetBrains Mono` for labels and code. Designed for SVG charts and metric cards from `COMPONENTS.md`.

### Frontmatter

```markdown
---
theme: default
paginate: true
header: ''
footer: '© 2026 · Dashboard'
style: |
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;600&display=swap');

  :root {
    --brand: #ff6b1a;
    --brand-hover: #ff8c4a;
    --bg: #0a0a0a;
    --surface: #111111;
    --border: #1f1f1f;
    --text: #e8e8e8;
    --text-muted: #888888;
    --text-dim: #555555;
    --ok: #22c55e;
    --warn: #f5a623;
    --bad: #ef4444;
  }

  section {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', sans-serif;
    font-weight: 300;
    padding: 56px 72px;
  }

  h1 {
    font-family: 'Inter', sans-serif;
    font-weight: 800;
    font-size: 2.6em;
    color: var(--text);
    letter-spacing: -0.02em;
    margin-bottom: 0.2em;
  }

  h2 {
    font-family: 'Inter', sans-serif;
    font-weight: 300;
    font-size: 1.2em;
    color: var(--text-muted);
    margin-top: 0;
  }

  h3 {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 0.65em;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }

  strong { color: var(--brand); font-weight: 600; }

  a { color: var(--brand); text-decoration: none; border-bottom: 1px dotted var(--brand); }

  code {
    font-family: 'JetBrains Mono', monospace;
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.85em;
  }

  pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
  }

  section.lead {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    background: radial-gradient(circle at center, #15151f, var(--bg));
  }

  section.lead h1 { font-size: 3.4em; }

  section.divider {
    background: var(--bg);
    display: flex;
    align-items: center;
  }

  section.divider h1 {
    border-left: 4px solid var(--brand);
    padding-left: 24px;
    font-size: 2.2em;
  }

  header { color: var(--text-dim); font-size: 0.7em; }
  footer { color: var(--text-dim); font-size: 0.65em; font-family: 'JetBrains Mono', monospace; }
  section::after { color: var(--text-dim); font-size: 0.7em; }
---
```

### Slide variants available

- `_class: lead` — centered title slide with radial gradient
- `_class: divider` — section break with orange left border
- Default — content slide with standard padding

## Theme 2: `light-editorial`

Warm off-white background, deep navy text, serif display headings, clean sans-serif body. Designed for photo-driven decks, split-background layouts, and long-form reading.

### Frontmatter

```markdown
---
theme: default
paginate: true
header: ''
footer: ''
style: |
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;800&family=Inter:wght@300;400;600&display=swap');

  :root {
    --brand: #c2410c;
    --bg: #faf8f3;
    --surface: #ffffff;
    --border: #e8e3d8;
    --text: #1a1a2e;
    --text-muted: #5a5a6e;
    --text-dim: #9a9a9e;
  }

  section {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', sans-serif;
    font-weight: 300;
    padding: 64px 80px;
    line-height: 1.5;
  }

  h1 {
    font-family: 'Fraunces', serif;
    font-weight: 800;
    font-size: 2.8em;
    color: var(--text);
    letter-spacing: -0.015em;
    line-height: 1.1;
    margin-bottom: 0.3em;
  }

  h2 {
    font-family: 'Fraunces', serif;
    font-weight: 400;
    font-style: italic;
    font-size: 1.3em;
    color: var(--text-muted);
    margin-top: 0;
  }

  h3 {
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 0.7em;
    color: var(--brand);
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }

  strong { color: var(--brand); font-weight: 600; }

  blockquote {
    border-left: 3px solid var(--brand);
    padding-left: 20px;
    font-family: 'Fraunces', serif;
    font-style: italic;
    font-size: 1.15em;
    color: var(--text-muted);
  }

  a { color: var(--brand); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }

  code {
    font-family: 'Inter', sans-serif;
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    border: 1px solid var(--border);
  }

  section.lead {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    text-align: left;
  }

  section.lead h1 { font-size: 4em; max-width: 14ch; }
  section.lead h2 { font-size: 1.5em; max-width: 40ch; }

  section.cover {
    padding: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
  }

  section.cover h1 {
    color: white;
    background: rgba(0,0,0,0.5);
    padding: 24px 40px;
    backdrop-filter: blur(6px);
  }

  footer { color: var(--text-dim); font-size: 0.7em; }
  section::after { color: var(--text-dim); font-size: 0.7em; }
---
```

### Slide variants available

- `_class: lead` — left-aligned title slide with large serif heading
- `_class: cover` — full-bleed photo slide with title overlay at bottom (pair with `![bg brightness:0.7](url)`)
- Default — editorial content slide with serif headings and blockquote support

## Light / Dark Inversion

For single-slide theme flips within a deck, use MARP's built-in `invert` class or spot directives:

```markdown
<!-- _class: invert -->

# This single slide is inverted
```

This works with built-in themes. For custom themes, define explicit variants in the style block (e.g., add `section.dark { background: #000; color: white; }` and use `<!-- _class: dark -->`).

## When to Use a Separate Theme File

If you are building a deck suite and want to share CSS across multiple decks, extract the `style:` block into a `.css` file with a theme header:

```css
/* @theme my-theme */

/* @auto-scaling true */

section {
  /* ... */
}
```

Then register it with marp-cli:

```bash
npx @marp-team/marp-cli@latest slides.md --theme-set ./my-theme.css --pdf
```

And reference it in frontmatter:

```markdown
---
theme: my-theme
---
```

For single decks, the inline `style:` block is simpler and keeps the deck as a single file. Use a theme file only when CSS is shared across three or more decks.

## Font Loading Notes

- Google Fonts loaded via `@import url(...)` work in **HTML and PDF export** but may fail in offline preview. For air-gapped environments, download the fonts locally and reference them via `@font-face` with a relative `src:` path.
- The `--html` flag at export time does NOT affect font loading — fonts work the same way regardless. `--html` only controls raw HTML tags in the markdown body.
- MARP's built-in themes ship with system-safe font stacks and need no network at render time.
