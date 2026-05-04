# UI Component Libraries — B2B SaaS Dashboard Reference

A practical reference for selecting and combining UI libraries in data-heavy dashboards.
Last updated: 2026-03.

---

## Table of Contents

1. [Full Design Systems](#1-full-design-systems)
   - Ant Design (antd)
   - Material UI (MUI)
   - Chakra UI
   - shadcn/ui
2. [Specialized Dashboard/Data Components](#2-specialized-dashboarddata-components)
   - Recharts
   - Nivo
   - TanStack Table
   - AG Grid
   - Tremor
3. [Premium/Design-Forward Libraries](#3-premiumdesign-forward-libraries)
   - 21st.dev
   - Magic UI
   - Aceternity UI
   - When premium is worth it
4. [Micro-Libraries for Specific Needs](#4-micro-libraries-for-specific-needs)
5. [Component Selection Decision Framework](#5-component-selection-decision-framework)
6. [Component Composition Patterns](#6-component-composition-patterns)

---

## 1. Full Design Systems

### Ant Design (antd)

**Best for**: Internal tools, admin panels, B2B dashboards — especially teams with a backend/full-stack focus. Huge component coverage out of the box.

**Strengths**
- Most complete component set of any open-source library (~70+ components)
- First-class table, form, and tree components
- ProComponents package (`@ant-design/pro-components`) adds ProTable, ProForm, ProLayout — near zero-config dashboard scaffolding
- Design tokens system in v5 makes theming reliable

**Version differences**
- v4 -> v5: CSS-in-JS (no more Less), design tokens, component API simplifications. Breaking changes are real — don't mix v4 and v5.
- v5 ProComponents: `ProTable` handles server-side pagination, filtering, and column configuration with a single `request` prop — it is the most powerful free data table outside AG Grid.

**Best dashboard components**
```
ProLayout     — sidebar + header layout shell
ProTable      — server-side data table with search toolbar
StatisticCard — KPI card with trend arrows
Statistic     — number display with prefix/suffix
Timeline      — activity feed / audit log
Descriptions  — key-value detail panels
Tabs + Card   — tabbed section containers
```

**Watch out for**
- Bundle size is large (~500KB gzipped with treeshaking). Use babel-plugin-import.
- Default styling looks "enterprise Chinese product" — requires token overrides for modern feel.
- Not ideal if you need heavy animation or a design-forward UI.

---

### Material UI (MUI)

**Best for**: Teams that want Google's design language, or are building something that needs to feel familiar/safe to enterprise buyers.

**Strengths**
- Excellent theming system — `createTheme` with palette, typography, component overrides
- `DataGrid` (free) and `DataGridPro` (paid) are production-grade
- MUI X suite: charts, date pickers, tree view — same theming contract as core
- Strong accessibility (WAI-ARIA) by default

**Dashboard-specific components**
```
DataGrid / DataGridPro  — sortable, filterable, virtual scroll tables
MUI X Charts            — bar, line, pie, scatter (v7+, stable)
Card + CardHeader       — standard KPI layout
Drawer + AppBar         — nav shell
Skeleton                — loading states
LinearProgress          — progress bars
Tooltip                 — hover context
```

**When it shines**
- You need a consistent design system across many product surfaces
- DataGridPro is worth the license ($180/dev/yr) for complex table requirements
- Pairing with `@mui/x-date-pickers` keeps date logic inside the same design token system

**Watch out for**
- `sx` prop performance: every `sx` call generates a CSS class at runtime. Use `styled()` or `classes` for hot paths.
- Theming requires deep knowledge to override reliably — don't fight the cascade.

---

### Chakra UI

**Best for**: Teams that want design flexibility without a full CSS overhaul. Excellent for rapid prototyping and custom design systems built on top.

**Strengths**
- Composable primitive components (Box, Flex, Stack, Grid) — layout is first-class
- Style props on every component (`p`, `mt`, `bg`, `color`) — no separate stylesheet needed
- `useColorMode` — dark/light toggle built in
- v3 (Ark UI under the hood) has headless-style composability

**Dashboard patterns**
```tsx
// KPI Card pattern
<Card>
  <CardBody>
    <Stat>
      <StatLabel>Production Today</StatLabel>
      <StatNumber>1,204 MT</StatNumber>
      <StatHelpText>
        <StatArrow type="increase" />
        12% vs yesterday
      </StatHelpText>
    </Stat>
  </CardBody>
</Card>
```

**When to use**
- Product needs a unique visual identity (Chakra stays out of the way)
- Small to mid-size team where writing full CSS is slower than style props
- Combine with Recharts/Nivo — Chakra doesn't ship charts

**Watch out for**
- No data table, no charts, no date picker — you will combine libraries
- v2 -> v3 is a significant migration (Ark UI architecture change)

---

### shadcn/ui

**Best for**: React + Tailwind projects. Modern default for new Next.js apps as of 2024-2026.

**Why it's gaining traction**
- Not a library you install — you copy components into your repo. Full ownership, no version lock.
- Built on Radix UI primitives (headless, accessible) + Tailwind CSS
- `npx shadcn-ui@latest add button` copies the component source directly
- Every component is customizable because you own the code

**Best dashboard components**
```
Card              — clean container with header/content/footer slots
Table             — basic HTML table with Tailwind styling
Badge             — status pills (great for OPEN/CLOSED, Active/Inactive)
Select + Combobox — filter dropdowns
Sheet             — slide-out detail panels
Dialog            — confirmation modals
Skeleton          — loading states (built in)
Command           — keyboard-navigable search/filter palette
Tabs              — section switching
```

**Composition model**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Resource Usage</CardTitle>
    <CardDescription>Last 30 days by category</CardDescription>
  </CardHeader>
  <CardContent>
    {/* chart goes here */}
  </CardContent>
  <CardFooter>
    <Button variant="outline">View Report</Button>
  </CardFooter>
</Card>
```

**Watch out for**
- No charts — pair with Recharts or Tremor
- Requires Tailwind CSS — don't use if the project uses CSS Modules or CSS-in-JS
- Component APIs change between shadcn releases since you own the code — check changelogs before copying new components into existing projects

---

## 2. Specialized Dashboard/Data Components

### Recharts

**Install**: `npm install recharts`
**Bundle**: ~150KB gzipped

**Best chart types**
```
 AreaChart       — time-series trends (metrics over time)
 BarChart        — comparisons (plan vs actual)
ComposedChart   — mix bar + line on same chart (actuals vs target)
PieChart        — composition (category split)
RadarChart      — multi-KPI spider charts
Treemap         — hierarchical breakdowns
```

**Key customization points**
```tsx
<LineChart data={data}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="date" />
  <YAxis />
  <Tooltip content={<CustomTooltip />} />  {/* custom HTML tooltip */}
  <Legend />
  <Line type="monotone" dataKey="actual" stroke="#2563eb" dot={false} />
  <Line type="monotone" dataKey="target" stroke="#94a3b8" strokeDasharray="4 4" />
  <ReferenceLine y={target} stroke="red" label="Target" />
</LineChart>
```

**Performance**: ResponsiveContainer re-renders on every resize. For 10K+ data points, downsample before passing to chart. Recharts is SVG-based — Canvas-based alternatives (Chart.js) handle larger datasets.

**When to use**: Default choice for dashboards. Great API, good docs, no license cost.

---

### Nivo

**Install**: `npm install @nivo/core @nivo/bar` (per-chart packages)
**Bundle**: Heavier than Recharts (~60KB per chart type)

**When to use over Recharts**
- Need D3-quality animations on chart transitions
- Heatmaps (`@nivo/heatmap`) — activity calendars, shift patterns
- Sunburst / Treemap with better visual defaults
- Waffle charts (`@nivo/waffle`) — plan attainment visualization

**Drawback**: Larger bundle, slower build times. Only use the packages you need.

---

### TanStack Table (v8)

**Install**: `npm install @tanstack/react-table`
**Bundle**: ~14KB gzipped — headless, no styles

**Core features**
- Sorting, filtering, pagination — client-side and server-side
- Column visibility, column ordering
- Row selection (checkbox)
- Grouping and aggregation
- Virtual scrolling via `@tanstack/react-virtual`

**Production pattern for server-side table**
```tsx
const table = useReactTable({
  data,
  columns,
  state: { sorting, columnFilters, pagination },
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  onPaginationChange: setPagination,
  manualSorting: true,      // tell table we sort on server
  manualFiltering: true,
  manualPagination: true,
  pageCount: totalPages,
  getCoreRowModel: getCoreRowModel(),
})
```

**When to use**: Best choice when you need full control over table rendering and combining with shadcn/ui or Chakra. Pairs well with any styling system.

**When NOT to use**: If you need Excel-like cell editing, column freezing, or pivot — use AG Grid.

---

### AG Grid

**Install**: `npm install ag-grid-community ag-grid-react`
**License**: Community (free) / Enterprise ($)

**Community free features**
- Sorting, filtering, pagination
- Row grouping (one level)
- CSV export
- Cell rendering / editing

**Enterprise features** (license required)
- Server-side row model (stream 1M+ rows)
- Excel export
- Column pivoting
- Multi-level row grouping
- Tree data

**When it's worth the enterprise license**
- Reports that users will use like a spreadsheet
- Large data sets (>50K rows rendered)
- Users expect Excel-like behavior (copy-paste, cell selection)
- Finance/accounting modules

**When community is enough**
- Operational tables (logs, records) — usually <500 rows per view
- Basic sort/filter is all that's needed

---

### Tremor

**Install**: `npm install @tremor/react`

**Purpose-built for dashboards** — wraps Recharts + Tailwind with dashboard-specific components.

**Best components**
```
 AreaChart, BarChart, DonutChart  — pre-styled, zero config
Card, Metric                     — KPI cards
ProgressBar, ProgressCircle      — plan attainment
BadgeDelta                       — trend indicators (+12%, up)
DateRangePicker                  — reporting date range selection
MultiSelect                      — filter checkboxes
Tab, TabGroup                    — section navigation
Table                            — pre-styled data table
Tracker                          — period/status blocks (uptime, shift status)
```

**Quick KPI card**
```tsx
<Card>
  <Text>Revenue Today</Text>
  <Metric>$12,040</Metric>
  <BadgeDelta deltaType="increase">12% vs yesterday</BadgeDelta>
  <ProgressBar value={72} label="72% of daily target" />
</Card>
```

**When to use**: Fastest path to a good-looking dashboard if you're on Tailwind. Tremor components look polished by default. Good for MVPs.

**Watch out for**: Less flexible than building with shadcn/ui + Recharts directly. Theming is limited to their color palette system.

---

## 3. Premium/Design-Forward Libraries

### 21st.dev

**What it is**: Curated registry of high-quality React + Tailwind components, similar model to shadcn/ui — copy components into your project.

**Best use cases**
- Marketing-style dashboard hero sections
- Onboarding flows and empty states
- Navigation patterns (command palettes, side nav with icons)
- Complex filter UIs

**When to use**: When the default shadcn/ui aesthetic isn't distinctive enough and you want curated, design-reviewed components without building from scratch.

---

### Magic UI

**What it is**: Animation-first component library. Built on Framer Motion + Tailwind.

**Notable components**
```
AnimatedNumber    — smooth number transitions (KPI changes)
NumberTicker      — count-up animation
BorderBeam        — animated border highlight
Shimmer Button    — premium CTA buttons
Animated Gradient Text
Blur Fade         — entrance animations for cards/sections
```

**When to use**
- Investor demos or onboarding flows that need to feel alive
- "Hero" KPI numbers on an executive dashboard
- Empty state illustrations with animation

**When it's over-engineered**
- Day-to-day operational data entry screens — animation adds cognitive noise
- Any screen where users are inputting data repeatedly — motion fatigue

---

### Aceternity UI

**What it is**: Design-forward React components with modern CSS effects (glassmorphism, 3D transforms, spotlight effects).

**Notable components**
```
Spotlight         — cursor-following light effect on cards
Background Beams  — animated background gradients
3D Card Effect    — perspective tilt on hover
Glowing Stars     — decorative backgrounds
Moving Border     — animated card borders
```

**When to use**: Landing pages, login screens, marketing-facing dashboards shown to prospects.

**When it's wrong**: Internal operational tools used 8 hours/day. 3D effects and animation drain focus and battery on laptops.

---

### When Premium Components Are Worth It

**Worth it**
- Login/onboarding — first impression for new users, used rarely
- Executive/investor dashboard — needs to look impressive
- Marketing site — seen before users sign up
- One or two "hero" moments in product (milestone notifications, celebrations)

**Not worth it**
- Data entry forms (logs, records, submissions)
- CRUD tables used daily by ops staff
- Any screen with >5 interactive elements — animation competes with cognition
- Mobile use — complex effects often perform poorly

---

## 4. Micro-Libraries for Specific Needs

### Sparklines (inline charts)

| Library | Size | Best for |
|---------|------|----------|
| `react-sparklines` | ~8KB | Quick inline trend lines in table cells |
| `recharts` (small `LineChart`) | Larger | When already using Recharts |
| SVG hand-rolled | 0KB | Simple bars/lines — 20 lines of code |

For table cells showing 7-day trend: hand-rolled SVG sparkline is often better than adding a dependency.

---

### Number Animation

| Library | Notes |
|---------|-------|
| `countup.js` / `react-countup` | Count-up from 0 to value on mount. Good for KPI hero numbers. |
| `react-spring` | Full physics animation, `useSpring` for number interpolation. More control, larger bundle. |
| `framer-motion` | `useMotionValue` + `animate` — if already using Framer. |
| CSS `counter-reset` | CSS-only, zero JS. Limited to integers. |

**Recommendation**: `react-countup` for a quick KPI dashboard. Framer Motion if already in the project.

---

### Skeleton Loaders

| Approach | Notes |
|----------|-------|
| `shadcn/ui Skeleton` | Tailwind pulse animation. Copy into project. |
| `react-loading-skeleton` | Configurable widths, dark mode support, good defaults. |
| MUI `Skeleton` | If already on MUI — same theming system. |
| CSS-only | `animate-pulse` (Tailwind) on a div is often enough. |

**Rule of thumb**: Match skeleton shape to actual content layout. A skeleton that's 3 rows when real data is 3 rows looks intentional; a generic "bar" looks lazy.

---

### Date Pickers

| Library | Notes |
|---------|-------|
| `@mui/x-date-pickers` | Best if on MUI. Full calendar, range picker, time. |
| `react-day-picker` | Headless + light (~25KB). Pairs well with shadcn/ui. |
| `shadcn/ui Calendar` (built on react-day-picker) | Good default for Tailwind projects. |
| `flatpickr` / `react-flatpickr` | Standalone, no React dependency — good for non-React forms. |

**For date range filtering on dashboards**: `react-day-picker` with shadcn/ui Popover wrapper is the recommended pattern for Tailwind projects.

---

### Multi-Select / Tag Inputs

| Library | Notes |
|---------|-------|
| `cmdk` (Command) | Keyboard-driven, used in shadcn/ui Combobox. |
| `react-select` | Most full-featured: async, creatable, multi, group options. Still industry standard. |
| `downshift` | Headless, build your own UI on top. Maximum flexibility. |
| shadcn/ui `MultiSelect` | Community recipe — copy from shadcn/ui docs. Good enough for most cases. |

**For filtering dashboards**: `react-select` with `isMulti` remains the fastest implementation path despite being older.

---

### Tooltips and Popovers

| Library | Notes |
|---------|-------|
| `Radix UI Tooltip` | Accessible, used by shadcn/ui. Zero style, max control. |
| `Floating UI` (Popper.js successor) | Positioning engine used by most tooltip libraries under the hood. |
| `@tippyjs/react` | Full-featured: arrow, theme, trigger control. Good when Radix is not in stack. |
| Recharts built-in `<Tooltip>` | Use `content={<CustomTooltip />}` for full control. |

---

## 5. Component Selection Decision Framework

### Choosing a Library

**Step 1: What's already in the project?**
- Tailwind CSS -> shadcn/ui + Recharts + TanStack Table is the natural stack
- CSS-in-JS or plain CSS -> MUI or Chakra
- Heavy admin panel -> consider antd ProComponents
- No CSS framework -> pick one first, then choose UI library

**Step 2: Bundle size check**
```
shadcn/ui          — ~0KB (you own the code, treeshakeable)
Recharts           — ~150KB gzipped
Tremor             — ~200KB gzipped (includes Recharts)
antd               — ~500KB (use babel-plugin-import)
MUI                — ~300KB (treeshakeable with proper imports)
AG Grid Community  — ~400KB
TanStack Table     — ~14KB headless
```

**Step 3: Maintenance status** (check npm download trends, GitHub pulse, last release)
- Avoid libraries with <6 months of no activity if they're in your critical path
- Radix UI, TanStack, shadcn/ui, MUI — all actively maintained as of 2026
- Tremor: v3 rewrote to shadcn model — check docs match installed version

**Step 4: Accessibility requirements**
- Radix UI / shadcn/ui — WAI-ARIA by default
- MUI — ARIA by default
- Recharts/Nivo — limited ARIA; add `role="img"` + `aria-label` on chart containers manually
- AG Grid Community — basic ARIA; enterprise has more

---

### When to Build Custom vs Use Library

**Build custom when**
- The component is a core differentiator (e.g., specialized domain-specific visualizer)
- Existing libraries require more overriding than building fresh would take
- The interaction pattern is unique to your domain

**Use library when**
- It's a solved problem (date picker, data table, tooltip)
- You need to ship in days, not weeks
- The component needs accessibility out of the box

---

### Mixing Libraries — What Works, What Doesn't

**Safe combinations**
```
shadcn/ui + Recharts           — standard, no conflicts
shadcn/ui + TanStack Table     — headless table + shadcn Table styles
MUI + MUI X Charts             — same design token system, no conflicts
antd + antd Charts (G2)        — same ecosystem
Chakra + Nivo                  — Chakra for layout, Nivo for charts
Tremor + TanStack Table        — when Tremor's table isn't enough
```

**Problematic combinations**
```
MUI + antd                — two CSS-in-JS runtimes, conflicting theme systems, bundle bloat
Chakra v2 + MUI           — two component libraries with overlapping primitives, style conflicts
Two date pickers          — always pick one and standardize
Framer Motion + React Spring  — both do animation; pick one
```

**Rules for mixing**
1. One "base" design system per project (MUI, Chakra, shadcn, or antd — not two)
2. Specialized libraries (charts, tables, date pickers) can come from anywhere
3. Never import full libraries — always treeshake with named imports
4. Audit bundle size after adding each library (`npx bundlephobia` or webpack-bundle-analyzer)

---

### Performance for Data-Heavy Dashboards

**Virtualization** (render only visible rows)
```tsx
// TanStack Virtual — list virtualization
import { useVirtualizer } from '@tanstack/react-virtual'

const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 40,     // estimated row height
  overscan: 5,                // extra rows above/below viewport
})
```

**Chart performance**
- Recharts SVG: good up to ~1,000 points. Above that, downsample on server before sending.
- For real-time streaming (10+ updates/second), use Canvas-based renderer (Chart.js or D3 directly)
- Memoize chart `data` arrays: `useMemo` prevents re-render on parent state changes

**Table performance**
- Server-side pagination is always preferable over client-side for operational data
- Column filtering should debounce (300ms) before triggering API call
- Use `React.memo` on custom cell renderers

**General**
- Code-split by route — chart library ~150KB should only load on dashboard routes
- Avoid rendering hidden tabs — use lazy-loaded Tab panels (`{activeTab === 'charts' && <Charts />}`)
- Skeleton loaders prevent layout shift on async data

---

## 6. Component Composition Patterns

### Card -> Header + Content + Footer

Standard dashboard card pattern that works across all libraries:

```tsx
// shadcn/ui — canonical pattern
<Card className="h-full">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Revenue Today
    </CardTitle>
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? "ACTIVE" : "INACTIVE"}
    </Badge>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$12,040</div>
    <p className="text-xs text-muted-foreground mt-1">+12% vs yesterday</p>
    <AreaChart data={trendData} className="mt-4 h-24" />
  </CardContent>
  <CardFooter className="pt-0">
    <Button variant="ghost" size="sm" className="px-0 text-xs">
      View breakdown ->
    </Button>
  </CardFooter>
</Card>
```

---

### Dashboard Grid Layouts

**CSS Grid (recommended)**
```css
/* 12-column responsive grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1rem;
}

/* KPI row: 4 cards across */
.kpi-card { grid-column: span 3; }          /* 4 across on desktop */
@media (max-width: 1024px) { .kpi-card { grid-column: span 6; } }  /* 2 across tablet */
@media (max-width: 640px)  { .kpi-card { grid-column: span 12; } } /* 1 across mobile */

/* Wide chart: 8 col, sidebar: 4 col */
.chart-main    { grid-column: span 8; }
.chart-sidebar { grid-column: span 4; }
```

**Tailwind CSS Grid (shadcn projects)**
```tsx
<div className="grid grid-cols-12 gap-4">
  <div className="col-span-3 md:col-span-6 sm:col-span-12"><KPICard /></div>
  <div className="col-span-3 md:col-span-6 sm:col-span-12"><KPICard /></div>
  <div className="col-span-3 md:col-span-6 sm:col-span-12"><KPICard /></div>
  <div className="col-span-3 md:col-span-6 sm:col-span-12"><KPICard /></div>
  <div className="col-span-8 md:col-span-12"><MainChart /></div>
  <div className="col-span-4 md:col-span-12"><SidePanel /></div>
</div>
```

---

### Responsive Breakpoints for Data Dashboards

| Breakpoint | Width | Dashboard behavior |
|-----------|-------|--------------------|
| `sm` | 640px | Stack all cards. Hide secondary columns in tables. |
| `md` | 768px | 2-column KPI grid. Charts full width. |
| `lg` | 1024px | 3 or 4 column KPI grid. Sidebar visible. |
| `xl` | 1280px | Full dashboard layout. All columns visible. |
| `2xl` | 1536px | Consider max-width container — tables become hard to scan at full 1536px width. |

**Practical rule**: Design for `lg` first (most users are on desktop), ensure usable at `md` (tablet), don't optimize heavily for `sm` unless field workers use phones.

---

### Collapsible Sections and Drill-Down Patterns

**Collapsible section (shadcn/ui Collapsible)**
```tsx
<Collapsible open={isOpen} onOpenChange={setIsOpen}>
  <CollapsibleTrigger asChild>
    <Button variant="ghost" className="w-full justify-between p-4">
      <span className="font-semibold">Team Breakdown</span>
      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <TeamTable data={teamData} />
  </CollapsibleContent>
</Collapsible>
```

**Drill-down pattern (click row -> detail panel)**
```tsx
// Table row click -> Sheet (slide-over)
const [selectedRow, setSelectedRow] = useState(null)

<Table>
  {rows.map(row => (
    <TableRow
      key={row.id}
      className="cursor-pointer hover:bg-muted"
      onClick={() => setSelectedRow(row)}
    />
  ))}
</Table>

<Sheet open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
  <SheetContent side="right" className="w-[540px]">
    <SheetHeader>
      <SheetTitle>Record #{selectedRow?.id}</SheetTitle>
    </SheetHeader>
    <DetailView record={selectedRow} />
  </SheetContent>
</Sheet>
```

**Tab-based drill-down** (when detail has multiple sections)
```tsx
// Dialog with Tabs for multi-section detail
<Dialog>
  <DialogContent className="max-w-2xl">
    <DialogHeader><DialogTitle>Shift Report — Day Shift</DialogTitle></DialogHeader>
    <Tabs defaultValue="output">
      <TabsList>
        <TabsTrigger value="output">Output</TabsTrigger>
        <TabsTrigger value="resources">Resources</TabsTrigger>
        <TabsTrigger value="equipment">Equipment</TabsTrigger>
      </TabsList>
      <TabsContent value="output"><OutputDetail /></TabsContent>
      <TabsContent value="resources"><ResourceDetail /></TabsContent>
      <TabsContent value="equipment"><EquipmentDetail /></TabsContent>
    </Tabs>
  </DialogContent>
</Dialog>
```

---

## Quick Reference: Stack Recommendations by Project Type

| Scenario | Recommended Stack |
|----------|-----------------|
| New React + Tailwind project | shadcn/ui + Recharts + TanStack Table |
| Needs fastest time to dashboard | Tremor (all-in-one) |
| Heavy admin/internal tool | antd + ProComponents |
| MUI already in project | MUI + MUI X Charts + DataGrid |
| Complex data grid (Excel-like) | AG Grid Enterprise |
| Marketing/investor demo | shadcn/ui + Magic UI/Aceternity accents |
| Need unique design identity | Chakra UI + Nivo |
| Maximum performance, huge data | TanStack Virtual + AG Grid + hand-rolled SVG |
