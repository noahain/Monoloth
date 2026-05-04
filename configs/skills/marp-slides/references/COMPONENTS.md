# MARP Components Reference

SVG chart recipes, metric cards, status tags, layout primitives, and inline icons for dashboard-style decks. All components require `--html` at export time (see `EXPORT.md`). Paired with the `dark-dashboard` theme from `THEMES.md`, but the CSS variables (`--brand`, `--text`, etc.) can be swapped for any theme.

## Prerequisites

- Export with `--html` flag: `npx @marp-team/marp-cli slides.md --pdf --html --allow-local-files`
- CSS variables from `dark-dashboard` or `light-editorial` in `THEMES.md`
- For VS Code preview: add `"markdown.marp.enableHtml": true` to settings

## Metric Card

Standard KPI card with label, value, delta, and gradient top border. Use a row of 3-4 on a dashboard slide.

```html
<div class="card">
  <div class="card-border"></div>
  <div class="card-label">Monthly Revenue</div>
  <div class="card-value">$142.8k</div>
  <div class="card-delta up">▲ 12.4% vs last month</div>
</div>
```

### CSS (add to global `style:` block)

```css
.card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 22px 24px;
  overflow: hidden;
  flex: 1;
}
.card-border {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--brand), transparent);
}
.card-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.55em;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 8px;
}
.card-value {
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 2em;
  color: var(--text);
  line-height: 1.1;
}
.card-delta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6em;
  margin-top: 8px;
}
.card-delta.up { color: var(--ok); }
.card-delta.down { color: var(--bad); }
.card-delta.flat { color: var(--text-muted); }
```

## Card Row

Flex container for 3-4 metric cards side by side:

```html
<div style="display:flex; gap:14px; margin-top:24px;">
  <div class="card"> ... </div>
  <div class="card"> ... </div>
  <div class="card"> ... </div>
  <div class="card"> ... </div>
</div>
```

## Status Tags

Inline pills for verdicts, states, or categories. Color-coded by semantic meaning.

```html
<span class="tag tag-ok">Scale</span>
<span class="tag tag-warn">Review</span>
<span class="tag tag-bad">Kill</span>
```

### CSS

```css
.tag {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  font-size: 0.55em;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 4px;
}
.tag-ok   { background: rgba(34,197,94,0.1);  color: var(--ok);   border: 1px solid rgba(34,197,94,0.25); }
.tag-warn { background: rgba(245,166,35,0.1); color: var(--warn); border: 1px solid rgba(245,166,35,0.25); }
.tag-bad  { background: rgba(239,68,68,0.1);  color: var(--bad);  border: 1px solid rgba(239,68,68,0.25); }
```

## Status Dots

Single-character inline indicators for lists and tables.

```html
<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#22c55e"/></svg> Active
<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#f5a623"/></svg> Pending
<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#ef4444"/></svg> Failed
```

## SVG Chart 1: Line / Area Chart

Polyline for the stroke, polygon with a linear gradient for the area fill. Always set `preserveAspectRatio="none"` on the viewBox so the chart fills its container width. Include grid lines and labels for context.

```html
<svg viewBox="0 0 900 240" preserveAspectRatio="none" style="width:100%; height:200px;">
  <defs>
    <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#ff6b1a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ff6b1a" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Grid lines -->
  <line x1="0" y1="60"  x2="900" y2="60"  stroke="#1f1f1f" stroke-width="1"/>
  <line x1="0" y1="120" x2="900" y2="120" stroke="#1f1f1f" stroke-width="1"/>
  <line x1="0" y1="180" x2="900" y2="180" stroke="#1f1f1f" stroke-width="1"/>

  <!-- Area fill -->
  <polygon fill="url(#areaFill)"
    points="0,220 0,160 150,140 300,100 450,80 600,60 750,40 900,30 900,220"/>

  <!-- Stroke -->
  <polyline fill="none" stroke="#ff6b1a" stroke-width="2.5"
    points="0,160 150,140 300,100 450,80 600,60 750,40 900,30"/>

  <!-- Data points -->
  <circle cx="150" cy="140" r="4" fill="#ff6b1a"/>
  <circle cx="300" cy="100" r="4" fill="#ff6b1a"/>
  <circle cx="450" cy="80"  r="4" fill="#ff6b1a"/>
  <circle cx="600" cy="60"  r="4" fill="#ff6b1a"/>
  <circle cx="750" cy="40"  r="4" fill="#ff6b1a"/>
  <circle cx="900" cy="30"  r="4" fill="#ff6b1a"/>
</svg>
```

### Math

With a `viewBox` of `0 0 900 240`, `y=0` is the top and `y=240` is the bottom. To map a data value `v` in range `[vMin, vMax]` to a y-coordinate:

```
y = 240 - ((v - vMin) / (vMax - vMin)) * 240
```

Lower `v` = larger `y` (further down).

## SVG Chart 2: Donut Ring (Single Value)

Progress ring for a percentage. One circle with a stroke-dasharray trick.

```html
<svg width="180" height="180" viewBox="0 0 180 180">
  <!-- Background ring -->
  <circle cx="90" cy="90" r="74" fill="none" stroke="#1f1f1f" stroke-width="14"/>

  <!-- Progress ring (89% of circumference) -->
  <circle cx="90" cy="90" r="74" fill="none"
    stroke="#ff6b1a" stroke-width="14"
    stroke-dasharray="465" stroke-dashoffset="51"
    stroke-linecap="round"
    transform="rotate(-90 90 90)"/>

  <!-- Center label -->
  <text x="90" y="96" text-anchor="middle" font-family="Inter, sans-serif"
    font-weight="800" font-size="36" fill="#e8e8e8">89%</text>
</svg>
```

### Math

- Circumference `C = 2 * π * r`. For `r = 74`: `C ≈ 464.96` → round to `465`.
- For a percentage `p` (0-100): `dashoffset = C - (C * p / 100)`.
- For 89%: `465 - (465 * 89 / 100) = 465 - 413.85 = 51.15` → `51`.
- The `transform="rotate(-90 cx cy)"` rotates the stroke start from 3 o'clock to 12 o'clock.

## SVG Chart 3: Multi-Segment Donut (Pie)

For multi-category breakdowns. Each segment is a separate circle with its own dasharray and cumulative offset.

```html
<svg width="200" height="200" viewBox="0 0 200 200">
  <!-- r = 80, C = 2πr ≈ 503 -->

  <!-- Segment 1: 45% (offset 0) -->
  <circle cx="100" cy="100" r="80" fill="none" stroke="#ff6b1a" stroke-width="30"
    stroke-dasharray="226 503" stroke-dashoffset="0"
    transform="rotate(-90 100 100)"/>

  <!-- Segment 2: 30% (offset -226, the length of segment 1) -->
  <circle cx="100" cy="100" r="80" fill="none" stroke="#22c55e" stroke-width="30"
    stroke-dasharray="151 503" stroke-dashoffset="-226"
    transform="rotate(-90 100 100)"/>

  <!-- Segment 3: 25% (offset -377, segment 1 + 2) -->
  <circle cx="100" cy="100" r="80" fill="none" stroke="#5b8def" stroke-width="30"
    stroke-dasharray="126 503" stroke-dashoffset="-377"
    transform="rotate(-90 100 100)"/>
</svg>
```

### Math (per segment)

For `r = 80`: `C = 2 * π * 80 ≈ 502.65` → round to `503`.

For each segment with percentage `p`:
- `segmentLength = (p / 100) * C`
- `gapLength = C - segmentLength` (or just use `C` as a very large "rest of the circle" value)
- `dasharray = "<segmentLength> <C>"`
- `dashoffset` = negative sum of all preceding segment lengths

## SVG Chart 4: Gauge / Half-Circle Meter

Background arc + colored value arc + needle. Use for scores on a 0-100 scale.

```html
<svg viewBox="0 0 200 120" style="width:100%; max-width:300px;">
  <!-- Background arc (gray) -->
  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1f1f1f" stroke-width="14" stroke-linecap="round"/>

  <!-- Value arc (76%) -->
  <!-- Full arc length = π * r = π * 80 ≈ 251. 76% of 251 ≈ 191. Offset = 251 - 191 = 60 -->
  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#ff6b1a" stroke-width="14" stroke-linecap="round"
    stroke-dasharray="251" stroke-dashoffset="60"/>

  <!-- Center label -->
  <text x="100" y="90" text-anchor="middle" font-family="Inter, sans-serif"
    font-weight="800" font-size="32" fill="#e8e8e8">76</text>
  <text x="100" y="110" text-anchor="middle" font-family="JetBrains Mono, monospace"
    font-size="9" fill="#888888" letter-spacing="0.1em">SCORE</text>
</svg>
```

### Math

The path is a half-circle with radius 80, so arc length = `π * 80 ≈ 251.33` → `251`. The `stroke-linecap="round"` rounds both ends. For percentage `p`: `dashoffset = 251 - (251 * p / 100)`.

## SVG Chart 5: Sparkline (Inline Mini)

Tiny chart for inline use in tables or next to metric values.

```html
Revenue <svg width="60" height="16" style="vertical-align:middle;">
  <polyline points="0,14 10,12 20,10 30,8 40,5 50,3 60,2"
    fill="none" stroke="#22c55e" stroke-width="1.5"/>
</svg> up 12%
```

## Bar Chart (CSS Flex, Not SVG)

For simple categorical data, pure CSS with flex containers is more readable than SVG.

```html
<div style="display:flex; align-items:flex-end; gap:12px; height:180px; padding-top:20px;">
  <div style="flex:1; text-align:center;">
    <div style="height:40%; background:linear-gradient(180deg, var(--brand), #cc5515); border-radius:4px 4px 0 0;"></div>
    <div style="font-family:'JetBrains Mono'; font-size:0.5em; color:var(--text-dim); margin-top:8px;">JAN</div>
  </div>
  <div style="flex:1; text-align:center;">
    <div style="height:65%; background:linear-gradient(180deg, var(--brand), #cc5515); border-radius:4px 4px 0 0;"></div>
    <div style="font-family:'JetBrains Mono'; font-size:0.5em; color:var(--text-dim); margin-top:8px;">FEB</div>
  </div>
  <div style="flex:1; text-align:center;">
    <div style="height:82%; background:linear-gradient(180deg, var(--brand), #cc5515); border-radius:4px 4px 0 0;"></div>
    <div style="font-family:'JetBrains Mono'; font-size:0.5em; color:var(--text-dim); margin-top:8px;">MAR</div>
  </div>
</div>
```

## Stacked Bar (Segmented Horizontal)

```html
<div style="display:flex; height:28px; border-radius:4px; overflow:hidden; border:1px solid var(--border);">
  <div style="width:55%; background:var(--ok);"></div>
  <div style="width:30%; background:var(--warn);"></div>
  <div style="width:15%; background:var(--bad);"></div>
</div>
```

## Layout: Two-Column Split

```html
<div style="display:flex; gap:40px; margin-top:20px;">
  <div style="flex:1;">
    <h3>Before</h3>
    <p>Content in the left column.</p>
  </div>
  <div style="flex:1;">
    <h3>After</h3>
    <p>Content in the right column.</p>
  </div>
</div>
```

## Layout: Terminal Mockup

```html
<div style="background:#0a0a0a; border:1px solid var(--border); border-radius:8px; overflow:hidden;">
  <div style="background:#1a1a1a; padding:10px 14px; display:flex; gap:6px; align-items:center;">
    <span style="width:10px; height:10px; border-radius:50%; background:#ef4444; display:inline-block;"></span>
    <span style="width:10px; height:10px; border-radius:50%; background:#f5a623; display:inline-block;"></span>
    <span style="width:10px; height:10px; border-radius:50%; background:#22c55e; display:inline-block;"></span>
  </div>
  <pre style="background:#0a0a0a; color:#22c55e; padding:20px; margin:0; font-size:0.75em;"><code>$ marp slides.md --pdf --html
✓ Rendered 12 slides to slides.pdf</code></pre>
</div>
```

## Collapsible Details (HTML Export Only)

Native `<details>` elements work in HTML output and in VS Code preview but are rendered as always-open in PDF/PPTX.

```html
<details>
  <summary>Why the dashboard-dark theme?</summary>
  <p>Near-black backgrounds reduce glare in low-light presentation environments and make colored data pop. Orange brand accent provides one high-contrast channel for emphasis.</p>
</details>
```

## Inline SVG Icons

All icons use `viewBox="0 0 24 24"` with `stroke="currentColor"` so they inherit the surrounding text color. Size them with inline `width` and `height`.

```html
<!-- Check -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <polyline points="20 6 9 17 4 12"/>
</svg>

<!-- Arrow up -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <polyline points="18 15 12 9 6 15"/>
</svg>

<!-- Arrow down -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <polyline points="6 9 12 15 18 9"/>
</svg>

<!-- Lightning bolt -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
</svg>

<!-- Clock -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="10"/>
  <polyline points="12 6 12 12 16 14"/>
</svg>

<!-- Warning triangle -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
  <line x1="12" y1="9" x2="12" y2="13"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>
```

## Design Checklist

Before committing a dashboard-style deck, verify:

- [ ] `--html` flag in the export command
- [ ] CSS variables defined once in the global `style:` block (no per-slide style duplication)
- [ ] Metric cards on any slide use the shared `.card` class, not inline styles
- [ ] SVG charts use `viewBox` with explicit aspect ratio, not hardcoded `width`/`height`
- [ ] Status colors come from `--ok`, `--warn`, `--bad` variables, not hex literals
- [ ] No more than 4 metric cards per row (cards get too narrow beyond that)
- [ ] No more than 1 large chart per slide
