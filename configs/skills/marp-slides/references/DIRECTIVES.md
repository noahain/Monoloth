# MARP Directives Reference

Authoritative reference for Marpit directives, YAML frontmatter, slide splitting, and image syntax. All content sourced from the official [marp-team/marpit](https://github.com/marp-team/marpit) documentation.

## Directive Syntax

Directives can be written in two forms:

**1. YAML frontmatter** (at the top of the file, before any slide):

```markdown
---
theme: default
paginate: true
header: 'Company Name'
footer: '© 2026'
---
```

**2. HTML comments** (inline, anywhere in the deck):

```markdown
<!-- paginate: true -->
<!-- backgroundColor: #f5f5f5 -->
```

Frontmatter is required for `theme:` and any global-only directive. HTML comments can be used for local/spot overrides mid-deck.

## Directive Scope

| Scope | Syntax | Effect |
|---|---|---|
| **Global** | No prefix, set in frontmatter or top-level comment | Applies to the whole deck. Example: `theme`, `style`, `headingDivider` |
| **Local** | No prefix, set in a comment between slides | Applies from that slide onward until overridden |
| **Spot** | `_` prefix (e.g., `_class`, `_backgroundColor`) | Applies **only to the current slide** |

## Global Directives

| Directive | Values | Purpose |
|---|---|---|
| `theme` | Built-in: `default`, `gaia`, `uncover`. Or custom theme name | Selects the CSS theme |
| `paginate` | `true`, `false`, `hold`, `skip` | Page number behavior (see below) |
| `header` | Markdown string (can include images) | Text shown at top of every slide |
| `footer` | Markdown string | Text shown at bottom of every slide |
| `headingDivider` | `1`–`6`, or array | Auto-splits slides at heading level N |
| `style` | CSS block (pipe-multiline) | Global stylesheet injected into the deck |
| `size` | `16:9` (default), `4:3` | Slide aspect ratio |
| `backgroundColor` | Hex, rgb, named color | Default background for all slides |
| `color` | Hex, rgb, named color | Default text color for all slides |
| `class` | String (CSS class name) | Default class applied to every `<section>` |
| `transition` | `fade`, `slide`, `reveal`, etc. | Bespoke transition between slides (HTML export only) |

## Local / Spot Directives

All directives above work as local directives when set in a comment between slides. To make them apply to **only the current slide**, prefix with `_`:

```markdown
<!-- _class: lead -->
<!-- _backgroundColor: #1a1a2e -->
<!-- _color: white -->
<!-- _paginate: skip -->
```

## Pagination Values

| Value | Behavior |
|---|---|
| `true` | Show page number, increment counter |
| `false` | Hide page number |
| `hold` | Show number but do **not** increment counter (useful for appendix slides) |
| `skip` | Hide slide from pagination entirely (useful for title/divider slides) |

Typical pattern: `paginate: true` globally, then `<!-- _paginate: skip -->` on the title slide and `<!-- paginate: hold -->` on appendix slides.

## Slide Splitting

Slides are separated by `---` on its own line with blank lines around it. This is the standard markdown horizontal rule, reused as the slide delimiter.

```markdown
---
theme: default
---

# Slide 1

Content for slide 1.

---

# Slide 2

Content for slide 2.
```

The first `---` block is the YAML frontmatter (it has `key: value` pairs inside). All subsequent `---` lines are slide breaks.

**Alternative: heading-based splitting.** Setting `headingDivider: 2` in frontmatter causes every `##` heading to start a new slide automatically — useful when converting existing markdown documents. Pass an array (`headingDivider: [1, 2]`) to split on both `#` and `##`.

## The `class` Directive

Use `class:` to apply a CSS class to the slide's `<section>` element. Combined with a custom style block, this is how you create slide variants (title slides, section dividers, code slides).

```markdown
---
style: |
  section.lead { text-align: center; }
  section.lead h1 { font-size: 3em; }
  section.code { background: #111; color: #0f0; font-family: monospace; }
---

<!-- _class: lead -->

# The Title

---

<!-- _class: code -->

# Code Sample

```

Built-in classes supported by MARP core themes:
- `lead` — centers content (works with `default`, `gaia`, `uncover`)
- `invert` — dark-mode variant (works with all built-in themes)

## Background Directives

### Color Background

```markdown
<!-- backgroundColor: #f5f5f5 -->
```

### Gradient Background

```markdown
<!-- backgroundImage: "linear-gradient(to bottom, #67b8e3, #0288d1)" -->
```

### Image Background (Extended Syntax)

Use the extended image syntax in a slide body to set a background:

```markdown
![bg](./photo.jpg)
```

**Sizing options** (added as keywords inside the alt text):

| Keyword | Effect |
|---|---|
| `cover` (default) | Fill the slide, crop as needed |
| `contain` | Fit entirely, letterbox as needed |
| `fit` | Same as `contain` |
| `auto` | Natural size |
| Percentage (e.g., `50%`) | Custom width |

```markdown
![bg contain](./diagram.png)
![bg 80%](./logo.png)
```

### Split Backgrounds

Place the image on the left or right half of the slide, with content on the other side:

```markdown
![bg left](./sidebar.jpg)

# Content appears on the right
```

```markdown
![bg right:40%](./sidebar.jpg)

# Content takes 60% on the left
```

### Multiple Backgrounds

Multiple `![bg]` tags on the same slide tile horizontally by default:

```markdown
![bg](./photo1.jpg)
![bg](./photo2.jpg)
![bg](./photo3.jpg)

# Three-column photo strip
```

Add `vertical` to stack them as rows instead:

```markdown
![bg vertical](./photo1.jpg)
![bg](./photo2.jpg)
```

### Background Filters

Chain filters inside the alt text to dim, blur, or recolor backgrounds:

```markdown
![bg brightness:0.3 blur:2px](./photo.jpg)
```

Supported filters: `blur:`, `brightness:`, `contrast:`, `grayscale:`, `sepia:`, `saturate:`, `hue-rotate:`, `invert:`, `opacity:`, `drop-shadow:`.

## Inline Image Sizing

Outside background mode, the same extended alt-text syntax controls inline image size:

```markdown
![w:300](./photo.jpg)
![width:200px height:150px](./photo.jpg)
![w:50%](./photo.jpg)
```

Filters also work on inline images:

```markdown
![w:400 brightness:1.2 contrast:1.1](./photo.jpg)
![w:300 drop-shadow:0,5px,10px,rgba(0,0,0,.5)](./photo.jpg)
```

## Global Style Block

The cleanest way to add custom CSS without a separate theme file is the `style:` global directive. Use a YAML pipe (`|`) to embed a multi-line CSS block:

```markdown
---
theme: default
style: |
  section {
    background: #0a0a0a;
    color: #e0e0e0;
    font-family: 'Inter', sans-serif;
    padding: 56px 72px;
  }
  section.lead {
    text-align: center;
    background: radial-gradient(circle at center, #1a1a2e, #0a0a0a);
  }
  h1 { color: #ff6b1a; font-size: 2.6em; }
  strong { color: #ff6b1a; }
---
```

This is equivalent to writing a full theme file but stays self-contained in the deck. For reusable themes, see `THEMES.md`.

## Header and Footer

`header:` and `footer:` accept markdown, including images. Common patterns:

```markdown
---
header: '![w:80](./logo.png) Company Name'
footer: '© 2026 · Internal · Page $page'
---
```

Note: `$page` is not a MARP feature — pagination is handled by the `paginate:` directive which renders a separate page-number element. Footer text is literal.

To hide header/footer on a specific slide (e.g., the title):

```markdown
<!-- _header: '' -->
<!-- _footer: '' -->
```

## Reference Examples from Official Docs

### Complete Frontmatter Example

```markdown
---
theme: default
paginate: true
header: 'Company Name'
footer: '© 2024'
headingDivider: 2
---

<!-- Global style directive via comment (alternative to frontmatter) -->
<!-- style: |
  section { font-family: 'Arial', sans-serif; }
  section.title { background: navy; color: white; }
-->

<!-- _class: title -->

# Main Presentation Title

Subtitle goes here

---

## First Section

<!-- backgroundColor: #f5f5f5 -->

Regular content with light background

---

<!-- _backgroundColor: #1a1a2e -->
<!-- _color: white -->

## Dark Slide (Spot Directive)

Only this slide is dark (underscore prefix)

---

<!-- paginate: hold -->

## Appendix

This slide shows page number but doesn't increment counter
```
