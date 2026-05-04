---
marp: true
theme: default
paginate: true
header: ''
footer: 'Q1 2026 · Platform Review'
style: |
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400;600&display=swap');

  :root {
    --brand: #ff6b1a;
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

  h1 { font-weight: 800; font-size: 2.6em; color: var(--text); letter-spacing: -0.02em; margin-bottom: 0.2em; }
  h2 { font-weight: 300; font-size: 1.1em; color: var(--text-muted); margin-top: 0; }
  h3 { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 0.65em; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.15em; }

  strong { color: var(--brand); font-weight: 600; }

  section.lead { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: radial-gradient(circle at center, #15151f, var(--bg)); }
  section.lead h1 { font-size: 3.4em; }

  .card-row { display: flex; gap: 14px; margin-top: 28px; }
  .card { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 22px 24px; overflow: hidden; flex: 1; }
  .card-border { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, var(--brand), transparent); }
  .card-label { font-family: 'JetBrains Mono', monospace; font-size: 0.55em; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px; }
  .card-value { font-weight: 800; font-size: 2em; color: var(--text); line-height: 1.1; }
  .card-delta { font-family: 'JetBrains Mono', monospace; font-size: 0.6em; margin-top: 8px; }
  .card-delta.up { color: var(--ok); }
  .card-delta.down { color: var(--bad); }

  .tag { display: inline-block; font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 0.55em; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; }
  .tag-ok { background: rgba(34,197,94,0.1); color: var(--ok); border: 1px solid rgba(34,197,94,0.25); }
  .tag-warn { background: rgba(245,166,35,0.1); color: var(--warn); border: 1px solid rgba(245,166,35,0.25); }
  .tag-bad { background: rgba(239,68,68,0.1); color: var(--bad); border: 1px solid rgba(239,68,68,0.25); }
---

<!-- _class: lead -->
<!-- _paginate: skip -->
<!-- _footer: '' -->

# Platform Review

## Q1 2026 · Engineering Dashboard

---

<!-- _class: lead -->

## Headline Metrics

<div class="card-row">
  <div class="card">
    <div class="card-border"></div>
    <div class="card-label">Monthly Active Users</div>
    <div class="card-value">184.2k</div>
    <div class="card-delta up">▲ 12.4% QoQ</div>
  </div>
  <div class="card">
    <div class="card-border"></div>
    <div class="card-label">P95 Latency</div>
    <div class="card-value">142ms</div>
    <div class="card-delta up">▼ 18ms QoQ</div>
  </div>
  <div class="card">
    <div class="card-border"></div>
    <div class="card-label">Error Rate</div>
    <div class="card-value">0.04%</div>
    <div class="card-delta up">▼ 0.02% QoQ</div>
  </div>
  <div class="card">
    <div class="card-border"></div>
    <div class="card-label">Uptime</div>
    <div class="card-value">99.97%</div>
    <div class="card-delta up">▲ 0.01% QoQ</div>
  </div>
</div>

---

### Growth Trajectory

# Monthly Active Users

<svg viewBox="0 0 900 240" preserveAspectRatio="none" style="width:100%; height:220px; margin-top:20px;">
  <defs>
    <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#ff6b1a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ff6b1a" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="0" y1="60"  x2="900" y2="60"  stroke="#1f1f1f"/>
  <line x1="0" y1="120" x2="900" y2="120" stroke="#1f1f1f"/>
  <line x1="0" y1="180" x2="900" y2="180" stroke="#1f1f1f"/>
  <polygon fill="url(#areaFill)" points="0,220 0,170 130,160 260,130 390,110 520,85 650,70 780,50 900,35 900,220"/>
  <polyline fill="none" stroke="#ff6b1a" stroke-width="2.5" points="0,170 130,160 260,130 390,110 520,85 650,70 780,50 900,35"/>
  <circle cx="130" cy="160" r="4" fill="#ff6b1a"/>
  <circle cx="260" cy="130" r="4" fill="#ff6b1a"/>
  <circle cx="390" cy="110" r="4" fill="#ff6b1a"/>
  <circle cx="520" cy="85"  r="4" fill="#ff6b1a"/>
  <circle cx="650" cy="70"  r="4" fill="#ff6b1a"/>
  <circle cx="780" cy="50"  r="4" fill="#ff6b1a"/>
  <circle cx="900" cy="35"  r="4" fill="#ff6b1a"/>
</svg>

Steady climb from **163k** in January to **184k** in March.

---

### Reliability

# System Health

<div style="display:flex; gap:40px; align-items:center; margin-top:20px;">

<svg width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="80" fill="none" stroke="#1f1f1f" stroke-width="18"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#22c55e" stroke-width="18"
    stroke-dasharray="503" stroke-dashoffset="50"
    stroke-linecap="round" transform="rotate(-90 100 100)"/>
  <text x="100" y="108" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="40" fill="#e8e8e8">90%</text>
</svg>

<div style="flex:1;">

**5 of 9** services operating at nominal SLO budget. One service — payments-v2 — remains on watch after the February incident. Recovery on track.

</div>
</div>

---

# Initiative Status

| Initiative | Owner | Status |
|---|---|---|
| Payments v2 stability | Infra | <span class="tag tag-warn">Review</span> |
| Ingest pipeline rewrite | Data | <span class="tag tag-ok">On track</span> |
| Auth migration (OIDC) | Platform | <span class="tag tag-ok">Shipped</span> |
| Legacy dashboard retirement | Frontend | <span class="tag tag-ok">On track</span> |
| Mobile SDK v3 | Mobile | <span class="tag tag-bad">Blocked</span> |

---

# Top Risks

1. **Mobile SDK v3 blocked** on upstream dependency — ETA slips 2 weeks.
2. **Payments v2** error budget at 28% burn. No action this sprint; revisit week 7.
3. **Ingest pipeline** back-pressure tests pending — runway tight for Q2 launch.

---

<!-- _class: lead -->
<!-- _paginate: skip -->
<!-- _footer: '' -->

# Questions

## Next review: Week 8 sync
