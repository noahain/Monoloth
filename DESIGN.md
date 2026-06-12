# Monolith Design System

Complete design reference for the Monolith desktop application. Tauri 2 backend, vanilla JS frontend.

---

## 1. Design Philosophy

- **Dark-mode primary.** Light mode is a first-class citizen but dark is the default.
- **Glassmorphism-first.** Frosted glass surfaces with subtle transparency and blur.
- **Monospace body, display headings.** JetBrains Mono for all UI text, Bebas Neue for brand/titles/CTAs.
- **Minimal chrome.** Thin borders, muted colors, no heavy shadows or skeuomorphism.
- **Alphacolor convention.** Dark mode uses `rgba(white, opacity)`, light mode uses `rgba(black, opacity)`.
- **Accent colors are theme-agnostic.** The same palette works in both dark and light modes.

---

## 2. Color System

### 2.1 Background Tokens

| Variable | `:root` (dark) | `body.light-mode` |
|----------|----------------|-------------------|
| `--bg-primary` | `#0a0a0a` | `#f5f5f5` |
| `--bg-secondary` | `#111111` | `#e8e8e8` |
| `--bg-tertiary` | `#1a1a1a` | `#d8d8d8` |

### 2.2 Text Tokens

| Variable | `:root` (dark) | `body.light-mode` |
|----------|----------------|-------------------|
| `--text-primary` | `#eeeeee` | `#1a1a1a` |
| `--text-secondary` | `#c0c0c0` | `#333333` |
| `--text-muted` | `#808080` | `#666666` |
| `--text-dim` | `#737373` | `#5c5c5c` |

### 2.3 Border Tokens

| Variable | `:root` (dark) | `body.light-mode` |
|----------|----------------|-------------------|
| `--border-dark` | `#1a1a1a` | `#d0d0d0` |
| `--border-muted` | `#303030` | `#c0c0c0` |
| `--border-light` | `#4b4c5c` | `#b0b0b0` |

### 2.4 Accent Tokens (shared across all themes)

| Variable | Value | Usage |
|----------|-------|-------|
| `--accent-primary` | `#fab283` | Warm peach/orange — active badges, profile badges, slider focus ring |
| `--accent-blue` | `#5c9cf5` | Focus outlines, file-code icons |
| `--accent-secondary` | `#9d7cd8` | Purple — secondary highlights |
| `--accent-green` | `#7fd88f` | Success states, toggle on, active badges |
| `--accent-red` | `#e06c75` | Error states, danger buttons, close hover |
| `--accent-warning` | `#f5a742` | Warning states, archive file icons |
| `--accent-info` | `#56b6c2` | Info states |
| `--accent-red-bg` | `#3a2020` | Dark red background for error regions |
| `--accent-red-dim` | `#c05060` | Muted red for secondary error text |

### 2.5 Alpha Color Conventions

Dark mode surfaces use white with varying opacity:

| Opacity | Usage |
|---------|-------|
| `rgba(255,255,255,0.02)` | Card backgrounds, subtle fills |
| `rgba(255,255,255,0.04)` | Input backgrounds, icon backgrounds |
| `rgba(255,255,255,0.05)` | File picker inputs, secondary button hover bg |
| `rgba(255,255,255,0.06)` | Subtle borders, secondary button borders |
| `rgba(255,255,255,0.08)` | Input borders, default button borders |
| `rgba(255,255,255,0.12)` | Primary button borders, active borders |
| `rgba(255,255,255,0.15)` | Hover borders on selectors |
| `rgba(255,255,255,0.2)` | Focus borders, strong hover |
| `rgba(255,255,255,0.25)` | Active borders, close button color |
| `rgba(255,255,255,0.35)` | Secondary text, muted button text |
| `rgba(255,255,255,0.5)` | Sidebar button text |
| `rgba(255,255,255,0.7)` | Slider thumb, secondary text |
| `rgba(255,255,255,0.85)` | Hover text on buttons |
| `rgba(255,255,255,0.9)` | Primary button active text |
| `rgba(255,255,255,0.95)` | Input text, strong text |

Light mode inverts to black with matching opacity:

| Opacity | Usage |
|---------|-------|
| `rgba(0,0,0,0.02)` | Card backgrounds |
| `rgba(0,0,0,0.04)` | Input backgrounds, hover backgrounds |
| `rgba(0,0,0,0.06)` | Active selector backgrounds |
| `rgba(0,0,0,0.08)` | Input borders, subtle borders |
| `rgba(0,0,0,0.1)` | Input borders, default button borders |
| `rgba(0,0,0,0.12)` | Primary button borders |
| `rgba(0,0,0,0.2)` | Focus borders, hover borders |
| `rgba(0,0,0,0.25)` | Active borders |
| `rgba(0,0,0,0.3)` | Active button borders |
| `rgba(0,0,0,0.4)` | Muted button text |
| `rgba(0,0,0,0.5)` | Active button text |
| `rgba(0,0,0,0.85)` | Hover text |
| `rgba(0,0,0,0.9)` | Input text |
| `rgba(0,0,0,0.95)` | Strong text |

### 2.6 Color Scheme

```css
:root { color-scheme: dark; }
body.light-mode,
body.adaptive-light { color-scheme: light; }
```

Affects native controls (color picker, select dropdowns) — Windows uses this for auto-darkening.

---

## 3. Typography

### 3.1 Font Families

| Variable | Value | Usage |
|----------|-------|-------|
| `--font-display` | `'Bebas Neue', Impact, 'Arial Narrow', sans-serif` | Headings, brand, CTA buttons, modal titles, profile names, settings h3, file picker OK/Cancel |
| `--font-mono` | `'JetBrains Mono', monospace` | All body text, labels, form elements, tab buttons, tooltips, status messages, command palette, file listings, kbd |

Loaded via Google Fonts with `font-display: swap`.

### 3.2 Font Size Scale

| Size | Rem | PX (approx) | Usage |
|------|-----|-------------|-------|
| Micro | `0.55rem` | 8.8px | kbd elements, badge text, category labels |
| Tiny | `0.6rem` | 9.6px | Status bar, sidebar labels, slider labels, preview labels, version label |
| Small | `0.65rem` | 10.4px | Tooltips, tab buttons, btn-primary/secondary, form labels, profile action buttons |
| Body-sm | `0.7rem` | 11.2px | Card descriptions, status messages, config editor, secondary cmd inputs |
| Body | `0.75rem` | 12px | Settings inputs, file picker path inputs, version numbers |
| Body-md | `0.78rem` | 12.5px | Breadcrumbs, file list items |
| Body-lg | `0.8rem` | 12.8px | Command palette input, inline dialog body, file picker OK button |
| Subheading | `0.85rem` | 13.6px | Directory primary button, modal titles, custom titlebar title |
| Small-heading | `0.9rem` | 14.4px | Profile item names |
| Heading | `0.95rem` | 15.2px | Settings card h3 |
| Section | `1.1rem` | 17.6px | Settings header h2 |
| Display | `4rem` | 64px | Landing page brand h1 |

### 3.3 Font Weights

| Weight | Usage |
|--------|-------|
| `400` | Default for all text |
| `500` | Shortcut edit targets, updater toast buttons |
| `700` | Command palette categories |

### 3.4 Letter Spacing

| Spacing | Usage |
|---------|-------|
| `0.5px` | Common for small uppercase elements (buttons, badges) |
| `1px` | Profile item names |
| `1.5px` | Directory primary button, file picker OK/Cancel, command palette |
| `2px` | Settings card h3 |
| `3px` | Settings header h2, landing subtitle |
| `4px` | Custom titlebar title |
| `5px` | Landing brand h1 |

### 3.5 Text Transform

Most UI text is `text-transform: uppercase`. Exceptions: input text, descriptions, body copy.

---

## 4. Spacing & Sizing

### 4.1 Spacing Scale

| Variable | Value | PX (16px base) |
|----------|-------|----------------|
| `--space-xs` | `0.25rem` | 4px |
| `--space-sm` | `0.5rem` | 8px |
| `--space-md` | `0.75rem` | 12px |
| `--space-lg` | `1rem` | 16px |
| `--space-xl` | `1.25rem` | 20px |
| `--space-2xl` | `1.5rem` | 24px |

### 4.2 Border Radius Scale

| Variable | Value | Usage |
|----------|-------|-------|
| `--radius-sm` | `4px` | Inputs, kbd, small badges |
| `--radius-md` | `8px` | Cards, sidebar buttons, profile items |
| `--radius-lg` | `12px` | Modals (file picker, inline dialog, profile switcher, command palette) |
| `--radius-xl` | `16px` | Settings modal |

### 4.3 Dynamic Variables

| Variable | Default | Condition |
|----------|---------|-----------|
| `--titlebar-height` | `32px` | `body.custom-titlebar-active` |
| `--titlebar-height` | `0px` | `body:not(.custom-titlebar-active)` |
| `--cmd-panel-height` | `200px` (fallback) | Set dynamically via JS `setProperty` on resize |

---

## 5. Theme Modes

### 5.1 Mode Overview

| Mode | Body Classes | Behavior |
|------|-------------|----------|
| Dark | *(none)* | Default. Uses `:root` variables. |
| Light | `body.light-mode` | Overrides 9 CSS variables to light values. |
| Auto | `body.light-mode` + `body.adaptive-light` | Same as light, but driven by wallpaper brightness analysis. |

### 5.2 CSS Variable Overrides

`body.light-mode` and `body.adaptive-light` override the same 9 variables:

```css
--bg-primary:    #f5f5f5   (was #0a0a0a)
--bg-secondary:  #e8e8e8   (was #111111)
--bg-tertiary:   #d8d8d8   (was #1a1a1a)
--text-primary:  #1a1a1a   (was #eeeeee)
--text-secondary:#333333   (was #c0c0c0)
--text-muted:    #666666   (was #808080)
--text-dim:      #5c5c5c   (was #737373)
--border-dark:   #d0d0d0   (was #1a1a1a)
--border-muted:  #c0c0c0   (was #303030)
--border-light:  #b0b0b0   (was #4b4c5c)
```

Accent colors (`--accent-*`), fonts, spacing, and radius are **not** overridden.

### 5.3 Theme Transition

```css
body.theme-transitioning,
body.theme-transitioning *,
body.theme-transitioning *::before,
body.theme-transitioning *::after {
    transition: background-color 0.3s ease,
                color 0.3s ease,
                border-color 0.3s ease,
                box-shadow 0.3s ease !important;
}
```

Class is added by `applyTheme()` and `applyCtaStyle()`, removed after 350ms.

### 5.4 Auto Mode Brightness Analysis

| Background Type | Method | Threshold |
|----------------|--------|-----------|
| Image | `monolithApi.analyze_image_brightness(path)` → returns `brightness: 0-1` | `> 0.5` = light |
| Color | `hexToLuminance(hex)` — weights R:0.299, G:0.587, B:0.114 | `> 0.5` = light |
| Gradient | `computeAverageBrightnessFromGradient(gradient)` — extracts hex colors, averages luminance | `> 0.5` = light |

### 5.5 JS Logic

```javascript
var _themeMode = 'dark';

function applyTheme(mode) {
    _themeMode = mode;
    document.body.classList.add('theme-transitioning');
    document.body.classList.remove('light-mode', 'adaptive-light');
    if (mode === 'light') {
        document.body.classList.add('light-mode');
    } else if (mode === 'auto' && _wallpaperBrightness !== null) {
        if (_wallpaperBrightness > 0.5) {
            document.body.classList.add('light-mode', 'adaptive-light');
        }
    }
    setTimeout(function () {
        document.body.classList.remove('theme-transitioning');
    }, 350);
}
```

Config key: `theme_mode` — values `"dark"`, `"light"`, `"auto"`.

---

## 6. CTA Styles

Four visual styles for glass surfaces (cards, modals, sidebar, titlebar). Applied via body classes.

### 6.1 Style Overview

| Style | Body Class | Background | Blur | Border |
|-------|-----------|------------|------|--------|
| Blur | `body.cta-blur` | `rgba(20,20,20,0.88)` | `blur(28px)` | `rgba(255,255,255,0.06)` |
| Glass | `body.cta-glass` | `rgba(255,255,255,0.14)` | `blur(80px)` | `rgba(255,255,255,0.14)` |
| Solid | `body.cta-solid` | `var(--bg-secondary)` | none | `var(--border-dark)` |
| Outline | `body.cta-outline` | `transparent` | none | `var(--border-muted)` |

### 6.2 CTA Blur (Default)

**Dark mode:**
```css
.settings-glass {
    background: rgba(20,20,20,0.88);
    backdrop-filter: blur(28px);
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 24px 80px rgba(0,0,0,0.6),
                0 0 0 1px rgba(255,255,255,0.03),
                inset 0 1px 0 rgba(255,255,255,0.04);
}
.landing-card {
    background: rgba(20,20,20,0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.06);
}
#custom-titlebar {
    background: rgba(10,10,10,0.85);
    backdrop-filter: blur(12px);
}
#sidebar, #cmd-panel {
    background: rgba(10,10,10,0.85);
    backdrop-filter: blur(12px);
}
.overlay { /* settings, file picker, etc. */
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(6px);
}
```

**Light mode:**
```css
body.light-mode.cta-blur .settings-glass {
    background: rgba(245,245,245,0.88);
    border-color: rgba(0,0,0,0.08);
    box-shadow: 0 24px 80px rgba(0,0,0,0.15),
                inset 0 1px 0 rgba(255,255,255,0.8);
}
body.light-mode.cta-blur .landing-card {
    background: rgba(245,245,245,0.7);
    border-color: rgba(0,0,0,0.08);
}
body.light-mode.cta-blur .overlay {
    background: rgba(255,255,255,0.7);
}
```

### 6.3 CTA Glass

**Dark mode:**
```css
.settings-glass {
    background: rgba(255,255,255,0.14);
    backdrop-filter: blur(80px);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 24px 80px rgba(0,0,0,0.45),
                0 0 0 1px rgba(255,255,255,0.05),
                inset 0 1px 0 rgba(255,255,255,0.12);
}
.landing-card {
    background: rgba(255,255,255,0.08);
    backdrop-filter: blur(20px);
    border-color: rgba(255,255,255,0.1);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
}
#custom-titlebar {
    background: rgba(255,255,255,0.06);
    backdrop-filter: blur(20px);
}
```

**Light mode:**
```css
body.light-mode.cta-glass .settings-glass {
    background: rgba(255,255,255,0.6);
    border-color: rgba(0,0,0,0.1);
}
```

### 6.4 CTA Solid

```css
.settings-glass {
    background: var(--bg-secondary);
    backdrop-filter: none;
    border-color: var(--border-dark);
    box-shadow: none;
}
.landing-card {
    background: var(--bg-tertiary);
    border-color: var(--border-dark);
}
```

### 6.5 CTA Outline

```css
.settings-glass {
    background: transparent;
    backdrop-filter: none;
    border: 1px solid var(--border-muted);
    box-shadow: none;
}
.landing-card {
    background: transparent;
    border-color: var(--border-muted);
}
```

### 6.6 Outline on Light

`body.outline-on-light` is added when cta-style is `outline` AND background is light. Darkens modal borders for visibility.

### 6.7 JS Logic

```javascript
var _ctaButtonStyle = 'blur';

function applyCtaStyle(style) {
    _ctaButtonStyle = style;
    document.body.classList.add('theme-transitioning');
    document.body.classList.remove('cta-blur', 'cta-glass', 'cta-solid', 'cta-outline');
    document.body.classList.add('cta-' + style);
    setTimeout(function () {
        document.body.classList.remove('theme-transitioning');
    }, 350);
}
```

Config key: `cta_button_style` — values `"blur"`, `"glass"`, `"solid"`, `"outline"`.

---

## 7. Background System

### 7.1 Background Types

| Type | Body Data | Overlay Behavior |
|------|-----------|-----------------|
| None | `bg_type: 'none'` | `#bg-overlay` hidden |
| Image | `bg_type: 'image'` | `#bg-overlay` shows `url(path)` |
| Color | `bg_type: 'color'` | `#bg-overlay` shows solid color |
| Gradient | `bg_type: 'gradient'` | `#bg-overlay` shows CSS gradient |

### 7.2 Overlay Elements

```css
#bg-overlay {
    display: none;
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    opacity: 0.75;             /* modified by transparency slider */
    z-index: 0;
    pointer-events: none;
}

#terminal-bg-overlay {
    display: none;
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-size: cover; background-position: center; background-repeat: no-repeat;
    opacity: 0.75;
    z-index: 2;
    pointer-events: none;
    mix-blend-mode: lighten;   /* only in overlay layer mode */
}
```

### 7.3 Transparency

Range: 0–100. Stored in config key `bg_transparency`. Default: `75`. Applied as `opacity` on overlay elements.

### 7.4 Layer Options

| Layer | Config Value | Behavior |
|-------|-------------|----------|
| Behind Terminal | `"behind"` (default) | `#bg-overlay` at z-index 0, behind all content. Terminal bg is transparent when background exists. |
| Above Terminal | `"overlay"` | `#bg-overlay` hidden. `#terminal-bg-overlay` at z-index 2 with `mix-blend-mode: lighten`. Terminal bg is `#000000`. |

### 7.5 Gradient Presets

```css
/* 1. Navy Tint */    linear-gradient(135deg, #0a0a0a, #1a1a2e)
/* 2. Warm Tint */    linear-gradient(135deg, #0a0a0a, #2d1b00)
/* 3. Violet Tint */  linear-gradient(135deg, #0a0a0a, #1a0a2e)
/* 4. Teal Tint */    linear-gradient(135deg, #0a0a0a, #001f1f)
/* 5. Copper Tint */  linear-gradient(135deg, #0a0a0a, #2e1a0a)
/* 6. Charcoal */     linear-gradient(135deg, #0a0a0a, #1a1a1a)
/* 7. Midnight Wave */ linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)
/* 8. Radial Dark */  radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0a 100%)
```

### 7.6 GIF Handling

When background type is `image` and the URL ends in `.gif`, an `<img id="bg-gif-img">` element is inserted into the body with `object-fit: cover` for proper animation. Same pattern for `#terminal-gif-img` in overlay mode.

### 7.7 Bridge Config Shape

```javascript
// get_background_config() returns:
{
    type: 'none' | 'image' | 'color' | 'gradient',
    image: '',           // file path
    imageUrl: '',        // data URL for display
    dataUrl: '',         // raw data URL
    color: '#0a0a0a',
    gradient: '',        // CSS gradient string
    transparency: 75,
    bgLayer: 'behind' | 'overlay',
    themeMode: 'dark' | 'light' | 'auto',
    ctaButtonStyle: 'blur' | 'glass' | 'solid' | 'outline'
}
```

---

## 8. Components

### 8.1 Buttons

#### `.btn-primary`

| State | Dark | Light |
|-------|------|-------|
| Default | `bg: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7)` | — |
| Hover | `border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.95); bg: rgba(255,255,255,0.06)` | `border-color: rgba(0,0,0,0.3); color: rgba(0,0,0,0.95); bg: rgba(0,0,0,0.04)` |
| Active | `border-color: rgba(255,255,255,0.4); color: #fff; bg: rgba(255,255,255,0.1)` | `border-color: rgba(0,0,0,0.5); color: #000; bg: rgba(0,0,0,0.08)` |

Shared: `padding: 0.4rem 1rem; font-size: 0.65rem; border-radius: 6px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease;`

#### `.btn-secondary`

| State | Dark | Light |
|-------|------|-------|
| Default | `border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.35)` | `border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.4)` |
| Hover | `border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.85); bg: rgba(255,255,255,0.05)` | `border-color: rgba(0,0,0,0.2); color: rgba(0,0,0,0.85); bg: rgba(0,0,0,0.04)` |

#### `.btn-danger`

Extends `.btn-secondary`:

| State | Dark |
|-------|------|
| Default | `border-color: rgba(224,108,117,0.25); color: var(--accent-red)` |
| Hover | `border-color: #e06c75; color: #ff6b6b; bg: rgba(224,108,117,0.08)` |

#### `.dir-primary-btn` (landing CTA)

| State | Properties |
|-------|-----------|
| Default | `width: 100%; font-family: var(--font-display); font-size: 0.85rem; letter-spacing: 1.5px; text-transform: uppercase; padding: 1rem 1.5rem; bg: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.06)` |
| Hover | `bg: rgba(255,255,255,0.06)` |
| Active | `bg: rgba(255,255,255,0.1)` |

#### `.titlebar-btn`

| State | Properties |
|-------|-----------|
| Default | `width: 46px; height: 30px; bg: transparent; border: none; color: var(--text-secondary); border-radius: 6px; transition: all 0.15s ease` |
| Hover | `bg: rgba(255,255,255,0.08); color: var(--text-primary)` |
| Close hover | `bg: rgba(224,108,117,0.25); color: var(--accent-red)` |

SVG icons: `width: 14px; height: 14px; flex-shrink: 0`

#### `.sidebar-btn`

| State | Properties |
|-------|-----------|
| Default | `width: 36px; height: 36px; border-radius: 8px; color: var(--text-secondary); bg: transparent; border: none; transition: all 0.15s ease` |
| Hover | `color: var(--text-primary); bg: rgba(255,255,255,0.1)` |
| Active | `color: var(--text-primary); bg: rgba(255,255,255,0.15)` |

SVG icons: `width: 18px; height: 18px`

#### `.fp-ok-btn` (file picker confirm)

| State | Properties |
|-------|-----------|
| Default | `bg: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); padding: 0.45rem 1.4rem; font-family: var(--font-display); font-size: 0.8rem; letter-spacing: 1.5px; border-radius: 9999px` |
| Hover | `bg: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: #fff; box-shadow: 0 0 20px rgba(255,255,255,0.06)` |
| Disabled | `opacity: 0.2; cursor: default` |

#### `.fp-cancel-btn` (file picker cancel)

| State | Properties |
|-------|-----------|
| Default | `bg: transparent; border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.3); border-radius: 9999px; font-family: var(--font-display)` |
| Hover | `border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.6)` |

#### `.id-btn-primary` / `.id-btn-cancel` (inline dialog)

Same pattern as `.btn-primary` / `.btn-secondary` but with CTA-style variants (glass, solid, outline).

#### `.profile-selector-btn`

`display: flex; align-items: center; gap: 0.4rem; bg: transparent; border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); font-family: var(--font-mono); font-size: 0.65rem; padding: 0.35rem 0.75rem; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px`

#### Close Buttons (universal)

`.settings-close`, `.fp-close`, `.ps-close`, `.id-close`: `bg: transparent; border: none; font-size: 1.4rem; cursor: pointer; font-family: var(--font-display); color: rgba(255,255,255,0.25-0.3)` — Hover: `color: rgba(255,255,255,0.9)`

Character: `\00d7` (multiplication sign ×)

### 8.2 Inputs

#### `.settings-input` / `.id-input`

| State | Dark | Light |
|-------|------|-------|
| Default | `bg: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.95)` | `bg: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.9)` |
| Focus | `bg: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.2)` | `bg: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.2)` |
| Placeholder | `color: rgba(255,255,255,0.2)` | `color: rgba(0,0,0,0.25)` |

Shared: `padding: 0.6rem 0.8rem; font-family: var(--font-mono); font-size: 0.75rem; border-radius: 6px; width: 100%; outline: none; transition: all 0.2s ease`

#### `.secondary-cmd-input`

Smaller variant: `padding: 0.4rem 0.6rem; font-size: 0.7rem; border-radius: 4px; flex: 1`

#### `.fp-filename-input`

`padding: 0.45rem 0.7rem; font-size: 0.78rem; border-radius: 8px; bg: rgba(255,255,255,0.05)`

#### `.config-editor` (textarea)

`height: 360px; bg: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); font-size: 0.7rem; border-radius: 8px; resize: vertical; line-height: 1.5; scrollbar-width: none`

Error state (`.json-error`): `border-color: var(--accent-red); bg: rgba(224,108,117,0.05)`

#### `.command-palette-input`

`bg: transparent; border: none; border-bottom: 1px solid var(--border-dark); padding: 0.85rem 1rem; font-size: 0.8rem`

#### `.transparency-slider` (range)

| Part | Properties |
|------|-----------|
| Track | `height: 3px; bg: rgba(255,255,255,0.08); border-radius: 2px` |
| Thumb | `width: 14px; height: 14px; border-radius: 50%; bg: rgba(255,255,255,0.7); border: 2px solid rgba(20,20,20,0.8)` |
| Thumb hover | `bg: rgba(255,255,255,0.95); transform: scale(1.1)` |
| Focus ring | `box-shadow: 0 0 0 4px rgba(250,178,131,0.2)` |

#### `.bg-color-picker`

`width: 32px; height: 32px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; bg: rgba(255,255,255,0.04); padding: 2px`

#### Checkbox (`.id-skip input[type="checkbox"]`)

| State | Properties |
|-------|-----------|
| Default | `appearance: none; width: 14px; height: 14px; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; bg: transparent` |
| Hover | `border-color: rgba(255,255,255,0.4)` |
| Checked | `bg: rgba(127,216,143,0.4); border-color: var(--accent-green)` |
| Checkmark | `::after { width: 4px; height: 8px; border: solid var(--accent-green); border-width: 0 2px 2px 0; transform: rotate(45deg) }` |

### 8.3 Modals

All modals share a pattern: overlay (fixed, full-screen, backdrop-filter) + container (fixed, centered, glass bg).

#### Settings Modal

| Property | Value |
|----------|-------|
| Z-index | `10000` |
| Container | `width: 720px; max-width: 92vw; height: 88vh; border-radius: 16px` |
| Animation | `settingsFadeIn 0.25s ease` (opacity + translateY) |
| Overlay (blur) | `bg: rgba(0,0,0,0.7); backdrop-filter: blur(6px)` |
| Glass (blur) | `bg: rgba(20,20,20,0.88); backdrop-filter: blur(28px)` |

#### File Picker

| Property | Value |
|----------|-------|
| Z-index | `11000` |
| Container | `width: 860px; max-width: 94vw; max-height: 88vh; border-radius: 12px` |
| Animation | `fpFadeIn 0.2s ease` |
| Glass (blur) | `bg: rgba(20,20,20,0.94); backdrop-filter: blur(24px)` |

Edge highlight: `::after` gradient at top — `transparent → rgba(255,255,255,0.08) → transparent`

#### Inline Dialog

| Property | Value |
|----------|-------|
| Z-index | `20000` |
| Container | `width: 380px; max-width: 90vw; border-radius: 12px; padding-top: 18vh` |
| Animation | `idModalIn 0.2s ease` (opacity + scale + translateY) |

#### Profile Switcher

| Property | Value |
|----------|-------|
| Z-index | `12000` |
| Container | `width: 340px; max-width: 90vw; border-radius: 12px; padding-top: 16vh` |
| Animation | `psModalIn 0.2s ease` |

#### Command Palette

| Property | Value |
|----------|-------|
| Z-index | `15000` |
| Container | `width: 500px; max-width: 90vw; border-radius: 12px; padding-top: 16vh` |
| Animation | `paletteSlideIn 0.2s ease` |
| List | `max-height: 340px; overflow-y: auto` |

#### Modal Exit Animation

All modals use `modalExit` (150ms): `opacity 1→0, scale 1→0.96` + overlay `overlayExit`: `opacity 1→0`.

### 8.4 Cards

#### `.landing-card`

`width: 100%; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; transition: border-color 0.3s ease, box-shadow 0.3s ease`

CTA variants: see Section 6.

#### `.settings-card`

`bg: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start`

Light: `bg: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06)`

Icon: `width: 36px; height: 36px; bg: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: rgba(255,255,255,0.4)`

H3: `font-size: 0.95rem; color: rgba(255,255,255,0.95); letter-spacing: 2px; text-transform: uppercase; font-weight: 400; font-family: var(--font-display)`

Description: `color: rgba(255,255,255,0.35); font-size: 0.7rem; line-height: 1.6`

Variant `.settings-card--vertical`: `flex-direction: column; align-items: stretch` — children indented 3rem.

Staggered entrance: `fadeInUp` with 40ms delay increments per card (0–280ms).

#### `.profile-item`

`display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.85rem; bg: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px`

Active: `border-color: rgba(255,255,255,0.15); bg: rgba(255,255,255,0.04)`

#### `.shortcut-row`

`display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.04)`

Wrapper `.shortcuts-list`: `border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden; bg: rgba(255,255,255,0.02)`

### 8.5 Toggle Switches

`.secondary-cmd-toggle` and `.sidebar-toggle-label` share identical structure:

| Part | Properties |
|------|-----------|
| Track | `width: 28px; height: 16px; bg: rgba(255,255,255,0.1); border-radius: 8px; transition: bg 0.2s ease` |
| Track (on) | `bg: rgba(127,216,143,0.4)` |
| Knob | `width: 12px; height: 12px; bg: rgba(255,255,255,0.6); border-radius: 50%; position: absolute; top: 2px; left: 2px` |
| Knob (on) | `transform: translateX(12px); bg: #7fd88f` |
| Knob transition | `transform 0.2s cubic-bezier(0.34,1.56,0.64,1)` (spring easing) |

Input: `position: absolute; opacity: 0; width: 1px; height: 1px` (hidden checkbox)

### 8.6 Segmented Controls

All selector groups follow the same pattern:

| State | Dark | Light |
|-------|------|-------|
| Default | `bg: transparent; border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.35)` | `border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.4)` |
| Hover | `border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.85); bg: rgba(255,255,255,0.05)` | `border-color: rgba(0,0,0,0.2); color: rgba(0,0,0,0.85); bg: rgba(0,0,0,0.04)` |
| Active | `border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.95); bg: rgba(255,255,255,0.08)` | `border-color: rgba(0,0,0,0.25); color: rgba(0,0,0,0.9); bg: rgba(0,0,0,0.06)` |

Shared: `padding: 0.35rem 0.85rem; font-size: 0.65rem; border-radius: 6px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease`

Groups using this pattern:
- `.theme-selector` / `.theme-btn`
- `.cta-style-selector` / `.cta-style-btn`
- `.bg-type-selector` / `.bg-type-btn`
- `.bg-layer-selector` / `.bg-layer-btn`
- `.picker-type-selector` / `.picker-type-btn`
- `.startup-type-selector` / `.startup-type-btn`
- `.history-toggle` / `.history-toggle-btn`
- `.retention-selector` / `.retention-btn`
- `.sidebar-toggle-btns` / `.sidebar-toggle-btn`, `.sidebar-pos-btn`
- `.titlebar-toggle` / `.titlebar-toggle-btn`

#### `.gradient-btn`

Same pattern with visual preview: `background-image` set to gradient value. Active: `border-color: rgba(255,255,255,0.4); box-shadow: 0 0 0 1px rgba(255,255,255,0.15)`

### 8.7 Status Messages

Shared pattern: `.updater-status`, `.appearance-status`, `.shortcuts-status`, `.profiles-status`, `.startup-status`, `.secondary-cmd-status`

| State | Properties |
|-------|-----------|
| Default | `font-family: var(--font-mono); font-size: 0.7rem; min-height: 1.2rem; line-height: 1.5; color: rgba(255,255,255,0.35)` |
| Success | `color: var(--accent-green)` |
| Error | `color: var(--accent-red)` |
| Dismissible | `::after { content: '\00d7'; position: absolute; right: 0; top: 0; color: rgba(255,255,255,0.2) }` |
| Enter anim | `statusFadeIn 0.2s ease` (opacity + translateY(-4px)) |
| Exit anim | `fadeOut 0.3s ease forwards` |

Footer status `.sf-status`: `font-size: 0.65rem; min-height: 1rem; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

### 8.8 Spinners

| Class | Size | Border | Animation |
|-------|------|--------|-----------|
| `.bridge-spinner` | 14×14px | 2px solid `rgba(128,128,128,0.2)`, top: `var(--text-muted)` | `fpSpin 0.8s linear infinite` |
| `.fp-spinner` | 24×24px | 2px solid `rgba(255,255,255,0.06)`, top: `rgba(255,255,255,0.35)` | `fpSpin 0.8s linear infinite` |

`@keyframes fpSpin { to { transform: rotate(360deg); } }`

### 8.9 Tooltips

#### `.monoloth-tooltip`

| State | Dark | Light (cta-blur) |
|-------|------|------------------|
| Base | `bg: rgba(18,18,18,0.92); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(12px)` | `bg: rgba(245,245,245,0.92); color: rgba(0,0,0,0.85); border-color: rgba(0,0,0,0.08)` |
| Visible | `opacity: 1; transform: translateY(0)` | — |
| Exit | `opacity: 0; transition: opacity 0.1s ease` | — |

Shared: `font-family: var(--font-mono); font-size: 0.65rem; padding: 4px 10px; border-radius: 6px; z-index: 2147483647; white-space: nowrap; pointer-events: none`

CTA variants:
- Glass: `bg: rgba(255,255,255,0.06); backdrop-filter: blur(20px)`
- Solid: `bg: var(--bg-tertiary); backdrop-filter: none`
- Outline: `bg: transparent; border: 1px solid var(--border-muted); backdrop-filter: none`

### 8.10 Badges

| Class | Dark | Light |
|-------|------|-------|
| `.badge-default` | `color: rgba(255,255,255,0.3); bg: rgba(255,255,255,0.04)` | `color: rgba(0,0,0,0.35); bg: rgba(0,0,0,0.06)` |
| `.badge-active` | `color: var(--accent-green); bg: rgba(127,216,143,0.1)` | — |
| `.ps-item-badge` | `color: var(--accent-primary); bg: rgba(250,178,131,0.1)` | — |

All badges: `font-family: var(--font-mono); font-size: 0.55rem; padding: 0.15rem 0.45rem; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px`

### 8.11 kbd Elements

**Landing bar:** `bg: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 3px; padding: 0.05rem 0.35rem; font-size: 0.55rem`

**Command palette:** `bg: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; font-size: 0.6rem`

### 8.12 File Item Icons

| Type | Dark | File Picker Dialog |
|------|------|-------------------|
| Folder | `rgba(255,255,255,0.55)` | `rgba(250,178,131,0.6)` |
| File | `rgba(255,255,255,0.25)` | — |
| Image | `rgba(255,255,255,0.35)` | `rgba(127,216,143,0.6)` |
| Code | `rgba(255,255,255,0.35)` | `rgba(92,156,245,0.6)` |
| Archive | `rgba(255,255,255,0.35)` | `rgba(245,167,66,0.6)` |

---

## 9. Animation & Motion

### 9.1 Timing Constants

| Constant | Value | Usage |
|----------|-------|-------|
| `ANIM_EXIT_MS` | `150` | Modal/panel close animations |
| `ANIM_COLLAPSE_MS` | `300` | Collapsible section transitions |
| Theme transition | `350ms` | `theme-transitioning` class duration |

### 9.2 Transition Conventions

| Duration | Usage |
|----------|-------|
| `0.1s ease` | Tooltip show/hide |
| `0.15s ease` | Sidebar items, titlebar buttons, file rows, card hover |
| `0.2s ease` | All buttons, inputs, toggles, selectors, most interactive elements |
| `0.25s ease` | Glass surface transitions (bg, border, box-shadow) |
| `0.3s ease` | Theme transitions (bg-color, color, border-color, box-shadow) |
| `0.3s ease` | Status message exit |

### 9.3 Easing Functions

| Easing | Usage |
|--------|-------|
| `ease` | Default for all transitions |
| `linear` | Spinner rotation |
| `cubic-bezier(0.34,1.56,0.64,1)` | Toggle knob (spring overshoot) |

### 9.4 Keyframes

#### View Transitions

| Name | Duration | Effect |
|------|----------|--------|
| `terminalViewFadeIn` | 250ms | opacity 0→1, scale 0.98→1 |
| `terminalViewFadeOut` | 200ms | opacity 1→0 |
| `landingFadeIn` | 250ms | opacity 0→1, scale 0.96→1 |
| `landingFadeOut` | 200ms | opacity 1→0, scale 1→0.96 |
| `settingsFadeIn` | 250ms | opacity 0→1, translateY(8px)→0 |
| `settingsFadeOut` | 150ms | opacity 1→0 |

#### Modal Transitions

| Name | Duration | Effect |
|------|----------|--------|
| `modalExit` | 150ms | opacity 1→0, scale 1→0.96 |
| `overlayExit` | 150ms | opacity 1→0 |
| `idModalIn` | 200ms | opacity 0→1, scale 0.95→1, translateY(-10px)→0 |
| `psModalIn` | 200ms | scale 0.95→1, translateY(-10px)→0 |
| `paletteSlideIn` | 200ms | translateY(-8px)→0 |
| `fpFadeIn` | 200ms | opacity 0→1, scale 0.96→1, translateY(10px)→0 |

#### Sidebar & Panels

| Name | Duration | Effect |
|------|----------|--------|
| `sidebarSlideIn` | 200ms | translateX(-100%)→0 |
| `sidebarSlideInRight` | 200ms | translateX(100%)→0 |
| `cmdPanelSlideUp` | 250ms | translateY(100%)→0 |
| `cmdPanelSlideDown` | 200ms | 0→translateY(100%) |

#### Generic Animations

| Name | Duration | Effect |
|------|----------|--------|
| `fadeIn` | 150–300ms | opacity 0→1 |
| `fadeOut` | 150–300ms | opacity 1→0 |
| `fadeInUp` | 200ms | opacity 0→1, translateY(6px)→0 |
| `fadeOutDown` | 200ms | opacity 1→0, translateY(0)→6px |
| `tabFadeIn` | 200ms | opacity 0→1, translateY(4px)→0 |
| `slideInItem` | 200ms | vertical/horizontal slide |
| `slideOutItem` | 150ms | vertical/horizontal slide |

#### Micro-interactions

| Name | Duration | Effect |
|------|----------|--------|
| `shake` | 300ms | translateX oscillate (error feedback) |
| `pulseScale` | 300ms | scale 1→1.15→1 |
| `iconSelectPulse` | 200ms | scale 1→1.12→1 |
| `greenFlash` | 500ms | green bg flash (success feedback) |
| `statusFadeIn` | 200ms | opacity 0→1, translateY(-4px)→0 |

#### Loading & Utility

| Name | Duration | Effect |
|------|----------|--------|
| `fpSpin` | 800ms linear ∞ | rotate 0→360deg |
| `skeletonShimmer` | 1.5s ∞ | background shimmer |
| `update-fade-in` | 240ms | translateY(8px)→0 |
| `copiedToastIn` | 150ms | toast enter |
| `copiedToastOut` | 300ms | toast exit |
| `exitBannerIn` | 300ms | margin-bottom animation |

### 9.5 Animation Classes

| Class | Effect |
|-------|--------|
| `.anim-enter` | Fade in + slide |
| `.anim-exit` | Fade out |
| `.anim-expand` | Expand height |
| `.anim-collapse` | Collapse height |
| `.anim-open` | Open (modal/menu) |
| `.anim-close` | Close (modal/menu) |
| `.anim-crossfade-out` | Crossfade exit |
| `.anim-slide-left` | Slide left |
| `.anim-slide-right` | Slide right |

### 9.6 Staggered Entrances

Settings cards fade in with incremental delays:

```css
.settings-card:nth-child(1) { animation-delay: 0ms; }
.settings-card:nth-child(2) { animation-delay: 40ms; }
.settings-card:nth-child(3) { animation-delay: 80ms; }
/* ... up to nth-child(8) at 280ms */
```

---

## 10. Accessibility

### 10.1 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

### 10.2 Glass Transition Guard

```css
@media (prefers-reduced-motion: no-preference) {
    .landing-card, .landing-status-bar,
    .settings-glass, .fp-modal, .ps-modal,
    .command-palette-modal, .id-modal, .terminal-back-btn {
        transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.25s ease;
    }
}
```

### 10.3 Focus Visible

```css
:focus-visible {
    outline: 2px solid var(--accent-blue);
    outline-offset: 2px;
}
```

Applied globally to all interactive elements.

### 10.4 Scrollbars

Hidden by default: `scrollbar-width: none; -ms-overflow-style: none; ::-webkit-scrollbar { display: none }`

Visible on hover for specific lists:

```css
.fp-file-list::-webkit-scrollbar,
.fp-sidebar::-webkit-scrollbar,
.profiles-list::-webkit-scrollbar,
.ps-body::-webkit-scrollbar,
.command-palette-list::-webkit-scrollbar {
    display: block;
    width: 6px;
}
::-webkit-scrollbar-thumb {
    background: var(--border-muted);
    border-radius: 3px;
}
```

### 10.5 Text Selection

Most text is `user-select: text` where readable content exists (descriptions, config editor, status messages). Interactive elements use `user-select: none`.

---

## 11. Custom Titlebar

### 11.1 Structure

```html
<div id="custom-titlebar">
  <div class="titlebar-left">
    <button id="tb-back">‹</button>
    <button id="tb-refresh">↻</button>
  </div>
  <div class="titlebar-center" data-tauri-drag-region>
    <span class="titlebar-title">Monoloth</span>
  </div>
  <div class="titlebar-right">
    <button id="tb-menu">☰</button>
    <button id="tb-minimize">−</button>
    <button id="tb-maximize">□</button>
    <button id="tb-close" class="titlebar-close-btn">×</button>
  </div>
</div>
```

### 11.2 CTA Variants

| Style | Background | Extra |
|-------|-----------|-------|
| Blur | `rgba(10,10,10,0.85)` + `blur(12px)` | — |
| Glass | `rgba(255,255,255,0.06)` + `blur(20px)` | — |
| Solid | `var(--bg-tertiary)` | — |
| Outline | `transparent` | `border-bottom: 1px solid var(--border-muted)` |

### 11.3 Content Offsets

When `body.custom-titlebar-active`:
- `.landing` → `padding-top: 30px`
- `#terminal` → `padding-top: 30px !important`
- `.settings-bar` → `top: calc(30px + 1.25rem)`
- `.terminal-toolbar` → `display: none !important`
- `#sidebar` → `top: 30px`

### 11.4 View-Driven Visibility

- Landing view: back/refresh buttons hidden
- Settings view: back/refresh/menu buttons hidden

Config key: `use_custom_titlebar` (true/false).

---

## 12. Terminal Themes

### 12.1 Dark Theme (xterm)

```javascript
{
    foreground: '#b8b8b8',
    cursor: '#c0c0c0',
    selectionBackground: '#4a4a4a',
    black: '#0a0a0a',       // or '#000000' in overlay mode, or transparent
    red: '#b0b0b0',
    green: '#a0a0a0',
    yellow: '#c0c0c0',
    blue: '#909090',
    magenta: '#b0b0b0',
    cyan: '#a0a0a0',
    white: '#e0e0e0',
    brightBlack: '#4a4a4a',
    brightRed: '#d0d0d0',
    brightGreen: '#c0c0c0',
    brightYellow: '#e0e0e0',
    brightBlue: '#b0b0b0',
    brightMagenta: '#d0d0d0',
    brightCyan: '#c0c0c0',
    brightWhite: '#ffffff'
}
```

### 12.2 Light Theme (xterm)

```javascript
{
    foreground: '#2d2d2d',
    cursor: '#333333',
    selectionBackground: '#c0c0c0',
    black: '#000000',
    red: '#6e3030',
    green: '#306030',
    yellow: '#6e6e30',
    blue: '#30306e',
    magenta: '#6e306e',
    cyan: '#306e6e',
    white: '#808080',
    brightBlack: '#505050',
    brightRed: '#904040',
    brightGreen: '#408040',
    brightYellow: '#909040',
    brightBlue: '#404090',
    brightMagenta: '#904090',
    brightCyan: '#409090',
    brightWhite: '#b0b0b0'
}
```

### 12.3 Terminal Black Variants

| Condition | `black` value |
|-----------|--------------|
| Layer = overlay | `#000000` |
| Layer = behind, bg type ≠ none | `rgba(10,10,10,0)` (transparent) |
| Layer = behind, bg type = none | `#0a0a0a` |
