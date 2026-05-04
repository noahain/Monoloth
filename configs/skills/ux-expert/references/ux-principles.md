# UX Design Principles for B2B SaaS Dashboards and Data-Heavy Applications

A reference for building dashboards that serve operational users — people who need to act on data quickly, not just admire it.

---

## Table of Contents

1. [Information Hierarchy & Visual Weight](#1-information-hierarchy--visual-weight)
   - F-pattern and Z-pattern scanning
   - Visual hierarchy techniques
   - Information scent
   - Progressive disclosure
2. [Cognitive Load & Decision Psychology](#2-cognitive-load--decision-psychology)
   - Miller's Law
   - Hick's Law
   - Decision fatigue
   - Gestalt principles
   - Change blindness
3. [Dashboard-Specific Patterns](#3-dashboard-specific-patterns)
   - KPI cards
   - Data tables
   - Charts — when each type works
   - Filters and controls
   - Empty, loading, and error states
   - Responsive data layouts
4. [B2B SaaS UX Anti-Patterns](#4-b2b-saas-ux-anti-patterns)
5. [Summary-First, Details-on-Demand](#5-summary-first-details-on-demand)
6. [Quick Reference Checklists](#6-quick-reference-checklists)

---

## 1. Information Hierarchy & Visual Weight

### F-Pattern and Z-Pattern Scanning

Users do not read dashboards — they scan them. Eye-tracking studies (Nielsen Norman Group) show two dominant scan patterns depending on content density.

**F-Pattern** — triggered by text-heavy or table-heavy layouts:
- Users scan the top horizontal band fully
- Drop down and scan a second shorter horizontal band
- Scan the left edge vertically
- Implication: critical information belongs top-left; right-side content is frequently missed

**Z-Pattern** — triggered by sparse or visual-first layouts:
- Eyes travel left-to-right across the top
- Diagonal sweep down to the bottom-left
- Left-to-right across the bottom
- Implication: use for landing pages and summary cards, not dense tables

**Practical rule for dashboards**: Assume F-pattern on any page with more than two rows of content. Put the single most important metric top-left. Put navigation and secondary actions on the right where they can be found when needed but do not interrupt scanning.

---

### Visual Hierarchy Techniques

Visual weight is the sense that some elements "demand attention first." You have five levers:

| Lever | How to use it | Common mistake |
|-------|---------------|----------------|
| **Size** | Larger = more important. Scale KPI numbers (32-48px) vs labels (12-14px) | Scaling everything large — destroys the hierarchy |
| **Color** | Use one accent color for critical/actionable items. Reserve red for genuine alerts | Using 6+ colors — users can't build a mental model |
| **Contrast** | High contrast = foreground. Low contrast = secondary info | Using light gray on white for anything users need to read quickly |
| **Spacing** | White space groups related items and separates unrelated ones | Dense packing — makes everything feel equally important |
| **Typography weight** | Bold for values, regular/light for labels and supporting text | Bolding labels instead of values — inverts the hierarchy |

**The 3-second rule**: A new user should be able to identify the three most important things on a page within 3 seconds. If you cannot achieve this, the visual hierarchy is broken.

---

### Information Scent

Information scent is the user's ability to predict whether clicking something will lead to what they need. Poor information scent causes users to abandon exploration.

**Strong scent signals**:
- Labels that match the user's mental model vocabulary (e.g., "Server Response Time" not "Resource Utilization Metric")
- Numeric previews in navigation items ("Alerts (3)" not just "Alerts")
- Consistent iconography — once a user learns that a trend arrow means "click for detail," it works everywhere
- Breadcrumb trails that show where you are, not just where you came from

**Weak scent signals**:
- Generic labels ("Details", "More", "View")
- Unlabeled icons — acceptable only for universal metaphors (home, search, close)
- Collapsed sections with no preview of what's inside
- Identical-looking cards with different behaviors

**Practical test**: Ask a user who has never seen the page "what would happen if you clicked X?" If they cannot answer confidently, the scent is weak.

---

### Progressive Disclosure

Progressive disclosure is the practice of showing only the information needed for the current task, revealing more complexity on demand.

**Why it works**: It reduces cognitive load at initial page render while preserving access to full depth for power users.

**Three tiers of disclosure in dashboards**:

1. **Tier 1 — Always visible**: Summary metrics, status indicators, critical alerts. Should be readable in seconds without interaction.
2. **Tier 2 — One interaction away**: Expandable rows, tooltip details, filter panels, drill-down charts. Triggered by hover or click.
3. **Tier 3 — Navigation away**: Full record detail, historical data, audit logs. Requires navigating to a dedicated page.

**Implementation patterns**:
- Expandable table rows for inline detail without losing table context
- Hover tooltips for chart data points — show exact values on demand
- "Show more" controls that expand a truncated list (show 5, expand to 20)
- Detail drawers/slideovers that open without full page navigation
- Collapsible sections with clear visual state (chevron icon, not just color)

**Common mistake**: Using progressive disclosure to hide information that users need constantly. If users expand the same row every time they visit, that data belongs in Tier 1.

---

## 2. Cognitive Load & Decision Psychology

### Miller's Law

George Miller's 1956 paper established that working memory holds approximately 7 +/- 2 chunks of information at once. Exceeding this causes users to lose track, make errors, and feel frustrated.

**Chunks, not items**: A "chunk" is a meaningful unit. "32%" is one chunk. A table with 32 rows is 32 chunks. But a table with 32 rows grouped into 4 logical categories (8 rows each) is closer to 4 chunks — the grouping compresses the cognitive cost.

**Dashboard applications**:
- Limit KPI cards on a single view to 5-7 (never more than 9)
- Group related metrics visually — e.g., CPU, memory, and disk are one chunk ("server health")
- Paginate tables at 15-25 rows; do not show 200 rows by default
- Navigation menus with more than 7 top-level items need grouping or restructuring

---

### Hick's Law

Decision time increases logarithmically with the number of choices. Adding options always adds friction — even options the user will never choose.

**Formula implication**: Going from 2 to 4 choices roughly doubles decision time. Going from 4 to 8 doubles it again.

**Dashboard applications**:
- Default the most common date range (e.g., "Today" or "This month") — do not make users choose every time
- Limit filter dropdowns to the most useful values; put "Other" or "Custom" at the bottom
- Preset report configurations for the 3-4 most common use cases, with "Custom" as an escape hatch
- Action menus with more than 5 items should be restructured — separate primary actions (prominent) from secondary (overflow menu)

**The paradox of choice in B2B**: Enterprise users often want the ability to configure everything, but they act faster with smart defaults. The solution is progressive configuration — sensible defaults with accessible customization, not 40 settings on first use.

---

### Decision Fatigue in Data-Dense UIs

Decision fatigue occurs when users have made many small decisions throughout a session and their judgment quality degrades. In B2B dashboards, this manifests as:
- Skipping data validation that should be done
- Approving records without reviewing them
- Abandoning workflows partway through
- Making errors in bulk-edit operations

**Design responses**:
- Reduce micro-decisions: auto-populate defaults wherever reasonable, especially in forms
- Batch related approvals — show 5 pending items together rather than forcing 5 separate page navigations
- Surface exceptions, not everything — a dashboard that shows 200 green rows and 3 red ones should make the 3 red ones unmissable, not require scanning all 203
- Progress indicators in multi-step forms reduce anxiety and keep users oriented (reducing the cognitive burden of tracking "where am I?")

---

### Gestalt Principles in Dashboard Design

Gestalt principles describe how the human visual system creates order from complex stimuli. They are not aesthetic preferences — they are perceptual facts.

**Proximity**: Elements close together are perceived as related. Use consistent spacing to visually group metrics that belong together (e.g., day/night shift values for the same KPI). Inconsistent spacing creates false groupings.

**Similarity**: Elements that look alike are assumed to behave alike. If KPI cards all use the same card style, users expect them all to be clickable (or none of them). Mixing interactive and non-interactive elements with identical styling is a high-friction failure mode.

**Continuity**: The eye follows lines and curves. Use alignment to create visual flow — aligning left edges of cards in a column signals they are a list. Misalignment disrupts scanning.

**Closure**: Incomplete shapes are perceived as complete. Partial circles (progress rings), truncated bars, and cut-off charts work because users mentally complete them. Use this deliberately — a half-filled ring for "47% plan attainment" is instantly readable.

**Figure-ground**: Users separate foreground (content) from background (container). Poor contrast between figure and ground makes content disappear. This is the #1 reason dark-mode dashboards fail — designers often forget to check all chart colors against the dark background.

**Common Gestalt violations**:
- Cards with different padding but same border — proximity grouping breaks
- Using the same color for both a trend indicator (positive) and an action button (neutral) — similarity principle creates confusion
- Orphaned labels with too much space between label and value — users cannot tell what the label refers to

---

### Change Blindness and Attention Patterns

Change blindness is the failure to notice visual changes when attention is not directed at the changing element. It is a fundamental property of human vision, not a user deficiency.

**Dashboard implications**:
- Users will miss data that refreshes silently in a corner. A loading spinner or brief "Updated 2s ago" indicator directs attention.
- If a KPI changes significantly between page loads, animate the number briefly or show a delta badge — passive updates are invisible
- Do not use color alone to indicate state changes (accessibility + change blindness combined risk). Use color + icon + text.
- Status badges that blink or pulse for 2-3 seconds after a value change are not gimmicks — they exploit pre-attentive processing to overcome change blindness

**Pre-attentive attributes** (processed before conscious attention, extremely fast):
- Color — red cells in a green table are detected in ~50ms
- Size — a larger number stands out immediately
- Motion — animation in a static UI draws the eye instantly (use sparingly for precisely this reason)
- Orientation — a diagonal element in a grid of horizontal elements is immediately salient

Use pre-attentive attributes to direct attention to exceptions and critical states. Avoid using them for decoration.

---

## 3. Dashboard-Specific Patterns

### KPI Cards — What Works, What Doesn't

KPI cards are the highest-visibility real estate on any dashboard. They communicate "is the business healthy right now?"

**Anatomy of an effective KPI card**:
```
[Icon/Category label — small, low contrast]
[Primary value — large, high contrast, bold]
[Unit or context — small, secondary]
[Trend indicator — delta vs. previous period, colored]
[Sparkline — optional, shows trend shape]
```

**What works**:
- Single value per card — never two competing numbers at equal size
- Contextual delta: "+12% vs yesterday" beats a standalone number
- Consistent card sizes — variable sizes imply variable importance; use it deliberately
- Color that carries meaning: green/amber/red for status, not decoration
- Click-through to the underlying data — every KPI card should link to the drill-down view

**What doesn't work**:
- Percentage without absolute value: "+23%" is useless without "from 400 to 492"
- Stale data without timestamp: users cannot trust a KPI if they do not know when it was last updated
- More than 2 decimal places on operational metrics: "1,234.56" is precise enough; "1,234.5678" is noise
- Tooltips as the primary explanation: if a user needs a tooltip to understand what a KPI measures, the label is wrong
- Treating all KPIs as equal — the hero metric should be visually dominant

**Common mistakes**:
- Cards with no hierarchy — all 8 metrics at the same size and weight
- Showing MTD numbers without showing the target — context-free metrics are unactionable
- Loading states that shift layout — always use skeleton screens, never show empty space then pop content in

---

### Data Tables — When to Use, Column Prioritization, Row Density

Tables are the right choice for:
- Comparing multiple attributes across many items (equipment list, daily records)
- Enabling user-driven sorting and filtering
- Showing exact values that users need to read precisely
- Supporting bulk selection and batch operations

Tables are the wrong choice for:
- Showing a single metric over time (use a line chart)
- Showing proportional distribution (use a bar or pie chart)
- Summarizing totals for non-technical users (use KPI cards)

**Column prioritization rules**:
1. Most important columns leftmost (where F-pattern scanning begins)
2. Numeric columns right-aligned — this aligns decimal places for comparison
3. Text columns left-aligned
4. Dates: relative ("3 days ago") for recent; absolute for historical
5. Status columns: use color + text, never color alone
6. Action columns rightmost — separated from data columns visually
7. Maximum 6-8 columns visible without horizontal scroll; hide the rest behind a column picker

**Row density options** (offer all three in B2B products):
- Compact (24-28px row height) — power users processing large datasets
- Default (36-40px) — standard operational use
- Comfortable (48-56px) — scanning or touchscreen use

**Table UX checklist**:
- Sticky column headers on scroll
- Sortable columns — clicking header sorts; clicking again reverses; visual indicator of current sort
- Pagination OR infinite scroll (not both) — infinite scroll works poorly with filters
- Row hover state for clickable rows
- Selected row state for checked rows
- Empty state message when filters return no results (not a blank table)
- Loading skeleton that matches the table structure, not a spinner in the middle of the page

---

### Charts — When Each Type Works

Choosing the wrong chart type undermines trust in the data. Match the chart to the question being answered.

**Line chart** — best for: continuous data over time, trends, rate of change
- Use when: daily metrics over a month, resource consumption over a week
- Works poorly when: comparing discrete categories, showing composition
- Rules: start y-axis at 0 for absolute values; may start at a non-zero baseline for rates/percentages if clearly labeled; max 3-4 lines before it becomes unreadable; use different line styles not just colors for accessibility

**Bar chart (vertical)** — best for: comparing discrete categories, ranking
- Use when: output by team this month, usage by product
- Works poorly when: more than ~10 categories (switch to horizontal bar), time series with many points
- Rules: sort bars by value (not alphabetically) unless the category order has inherent meaning; include value labels on bars for B2B users who need exact numbers

**Horizontal bar chart** — best for: long category labels, ranking with many items
- Use when: equipment list sorted by usage, products sorted by revenue
- Works better than vertical when: category names are more than 3-4 words

**Area chart** — best for: cumulative totals over time, showing volume
- Use when: cumulative output vs target (the fill emphasizes progress toward a goal)
- Works poorly when: multiple overlapping areas (use line chart instead)

**Sparkline** — best for: trend direction at a glance inside a table or KPI card
- Use when: "is this metric going up or down this week?" — not for reading exact values
- Works poorly when: users need to compare sparklines across rows (scale varies)

**Stacked bar** — best for: part-to-whole relationships over categories
- Use when: showing how total output is split by category per day
- Works poorly when: more than 4-5 segments (color confusion) or when the middle segments are important (only bottom and top are easy to read)

**Heatmap** — best for: two-dimensional patterns, time-of-day x day-of-week, anomaly detection
- Use when: resource consumption by hour and day (reveals idle-time patterns), attendance patterns
- Works poorly when: users need exact values; heatmaps are for pattern recognition, not precision

**Pie / donut chart** — best for: composition with 3-4 segments, not for ranking
- Avoid when: more than 4 segments, when users need to compare non-adjacent slices, when absolute values matter
- The donut variant (with a center value) is better than pie because it shows the total
- In B2B dashboards: use sparingly. Bar charts are almost always more readable for the same data.

---

### Filters and Controls — Placement, Progressive Disclosure

Filters are the navigation system for data. Their placement and behavior determine whether users can find the slices they need.

**Placement patterns**:
- **Horizontal filter bar** (top of page) — best for 3-5 key filters; scannable; does not eat vertical space
- **Sidebar filter panel** — best for 6+ filters; supports faceted filtering (like e-commerce); hides complexity without losing access
- **Inline filters** (inside tables/charts) — best for column-specific controls; keeps context
- **Global filters** (persistent across views) — for tenant/site/period selectors that affect all data on the page

**Progressive disclosure for filters**:
1. Show 3-5 most-used filters always visible
2. "More filters" expansion reveals advanced options (date range, category selector)
3. Active filter chips show what is currently applied — always include a "Clear all" action
4. Saving filter presets ("Last month, Team A only") prevents repeated configuration for power users

**Filter UX rules**:
- Apply filters immediately on selection (do not require a "Submit" button for filters)
- Show result count update in real time as filters change ("Showing 47 of 312 records")
- Persist filters on page reload unless the user explicitly clears them
- Date range pickers: always offer presets (Today, This week, This month, Last month, Custom) — never raw date-only input as the primary option
- Multi-select dropdowns: show selected count in the trigger ("Product type: 3 selected")

---

### Empty States, Loading States, Error States

These three states are treated as afterthoughts in most B2B products. They are the moments users form lasting impressions about product quality.

**Empty states** (no data to show):
- Distinguish between "no data exists yet" vs "filters returned no results"
- "No data yet" empty state: explain what will appear here, provide a call to action to add data
- "No results" empty state: show active filters, suggest broadening the search, never just a blank table
- Never: a fully white page with nothing on it
- Example: empty records table -> "No records for this period. [Change date range] or [Add record]"

**Loading states**:
- Skeleton screens (gray placeholder shapes matching the content layout) are 40% faster perceived than spinners (Viget research, 2016)
- Use spinners only for actions, not for page loads
- Show partial data as it loads — do not wait for all data before rendering anything
- If loading takes more than 3 seconds, show a message explaining why (e.g., "Calculating monthly aggregates...")
- Never let a loading spinner run forever — set a timeout and show an error state

**Error states**:
- Be specific: "Could not load usage data for January. The database query timed out." beats "Something went wrong."
- Provide a recovery action: [Retry], [Refresh page], [Contact support]
- Never hide errors behind a console — surface them in the UI
- For form submission errors: highlight the specific fields that failed, not just a toast at the top
- For partial failures (some data loaded, some did not): show what loaded and mark the failed sections clearly

---

### Responsive Data Layouts

B2B dashboards are primarily desktop applications, but users often check data on phones. Responsive design for data-heavy UIs requires deliberate choices, not just fluid grids.

**Desktop-first for dashboards**: Unlike consumer apps, B2B dashboards should be designed for desktop first. The data density required by operational users does not compress well to mobile without deliberate redesign.

**Breakpoint strategies for data tables**:
- At tablet width: hide lower-priority columns, increase touch targets
- At mobile width: switch to card-based layout (one card per row, showing 3-4 key fields) — do not force a wide table onto a narrow screen
- Provide a "simplified view" toggle for mobile-constrained users

**KPI card grids**: Use CSS Grid with `auto-fill` and `minmax()` — cards reflow naturally. Set a minimum card width that ensures readability (240px minimum).

**Navigation**: On mobile, collapse the sidebar to a bottom tab bar or hamburger. In B2B contexts, limit mobile navigation to the 4-5 most-used sections.

---

## 4. B2B SaaS UX Anti-Patterns

These patterns are extremely common in enterprise and B2B products. They persist because they feel "organized" during design but create friction during use.

### Tab Overuse — Hiding Important Information Behind Clicks

**The problem**: Tabs fragment related data into separate views, forcing users to mentally integrate information across navigation interactions. A user comparing metrics across two categories must remember numbers from Tab A while looking at Tab B.

**Where tabs are appropriate**: Switching between fundamentally different modes or contexts (Settings vs Data Entry vs Reports). Tabs are not appropriate for related data that users need to compare.

**Better alternatives**:
- Put related data on the same page with clear section headers
- Use expandable/collapsible sections to manage density
- Use a split view or side-by-side layout for comparison data
- Consolidate the "Details", "History", and "Audit" tabs on a record page into a single scrollable page with anchor links

### Dashboard Bloat — Too Many Metrics

**The problem**: When everything is a KPI, nothing is. Product teams add metrics because stakeholders request them. The result is a 20-card dashboard where the user cannot identify the 3 things that actually need attention today.

**Signs of dashboard bloat**:
- More than 9 KPI cards on a single view
- Metrics that have never shown a non-green status
- Metrics that no one in the organization is responsible for acting on
- Multiple metrics measuring the same underlying thing at different granularities, all shown simultaneously

**The cure**:
- For each metric: "If this goes red, who acts, and what do they do?" If the answer is unclear, it should not be on the main dashboard.
- Role-based dashboards — the manager sees efficiency KPIs; the data entry operator sees today's entry status
- Move vanity metrics to a secondary "Reports" section

### Equal Visual Weight for Unequal Importance

**The problem**: When all elements on a page look identical (same card size, same font weight, same color), the user must read everything before they can identify what matters. This is the visual equivalent of a document with no headings.

**Examples**:
- 8 KPI cards all the same size — one card is "System Uptime" (critical: downtime means operations stop today), another is "Average Session Duration" (not actionable)
- A table with 12 columns all at equal width — the "Date" column is given the same space as the "Total Revenue" column
- Action buttons and informational labels using the same visual style

**The cure**: Map every element to a tier (critical / important / supporting) and establish a visual vocabulary that consistently represents each tier. Apply it without exception.

### Context Switching Between Pages for Related Data

**The problem**: Users must navigate between two or more pages to complete a single mental task. Every navigation is a context switch — the user must reload their mental model of where they are and what they were doing.

**Common examples**:
- "Orders" and "Inventory" are separate pages, but inventory balance is directly affected by order entries — users must navigate back and forth to reconcile
- Creating a record on Page A requires looking up an ID from Page B
- Viewing a KPI and seeing the underlying records requires navigating to a different module

**The cure**:
- Inline lookups: show related data as a tooltip, drawer, or expandable section — avoid full navigation for read-only reference data
- Contextual previews: hovering a record reference shows a summary popup
- Guided flows: when a user creates an entry, show the current balance inline in the form
- Co-locate data that is operationally related, even if it comes from different backend modules

### Over-Relying on Tables When Visual Summaries Would Work Better

**The problem**: Tables are the path of least resistance for developers (just render the database query). But tables require users to build the mental picture themselves — reading numbers, doing subtraction in their head, finding the outlier in 50 rows.

**When a table is the wrong tool**:
- Showing trends over time (use line chart)
- Comparing proportions (use bar chart)
- Identifying outliers in a dataset (use sorted bar chart with color thresholds)
- Showing progress toward a target (use progress bar, gauge, or bullet chart)

**The rule**: Before using a table, ask "what question is the user trying to answer?" If the answer involves a comparison, trend, or proportion, start with a chart. Tables are for lookup ("show me the exact value for item X on day Y") not analysis ("which item has the highest output this month?").

---

## 5. Summary-First, Details-on-Demand

### Ben Shneiderman's Mantra

Ben Shneiderman formulated this principle in 1996 for information visualization:

> **Overview first, zoom and filter, then details on demand.**

This is not a suggestion — it is the foundational principle of all usable data-dense interfaces. Every well-designed dashboard implements this in layers:

1. **Overview**: The aggregate, the summary, the answer to "is everything okay?" — visible without any interaction
2. **Zoom and filter**: The ability to narrow scope — by time, category, entity — to isolate the area of interest
3. **Details on demand**: The full record, the raw data, the audit log — available on request without cluttering the overview

### How to Implement This in Dashboard Design

**Layer 1 — Overview (0 interactions)**:
- KPI cards with trend indicators
- Status summary badges (e.g., "3 alerts", "2 pending approvals")
- Aggregate charts showing the current period at a glance
- Should answer: "Is everything on track? Is anything critical broken?"

**Layer 2 — Zoom and filter (1-2 interactions)**:
- Filter panel to narrow date range, category, or entity
- Clicking a KPI card to drill into its component metrics
- Expanding a chart to show a longer time window
- Should answer: "Which sub-area is underperforming? When did it start?"

**Layer 3 — Details on demand (3+ interactions or dedicated navigation)**:
- Full data table with all columns
- Individual record detail pages
- Audit logs and change history
- Raw export (CSV/Excel)
- Should answer: "What was the exact value on day X? Who entered it?"

**The principle in navigation architecture**:
- Dashboard -> Module List -> Module Detail -> Record Detail -> Audit History
- Each level is one step deeper; users never need to go deeper than their question requires
- Breadcrumbs or back navigation make it easy to return to the previous level

---

### Examples from Successful B2B Products

**Stripe Dashboard**:
- Overview: Revenue this period, Payment success rate, Dispute rate — all above the fold
- Zoom: Click any metric to see daily breakdown chart
- Details: Click any day to see transactions, click any transaction for full record
- The default view never shows individual transactions — they are two clicks away

**Linear (project management)**:
- Overview: Issue count by status (To Do / In Progress / Done) as summary cards
- Zoom: Click a status to see the filtered issue list
- Details: Click an issue for the full record with comments, history, sub-issues
- Keyboard shortcuts let power users access detail quickly without mouse navigation

**Datadog (monitoring)**:
- Overview: Service health as colored tiles (green/yellow/red) — all services at a glance
- Zoom: Click a service to see its metrics dashboard — time-series charts pre-filtered to that service
- Details: Click a time range on a chart to expand it; click a data point to see the exact value and correlated events
- Alert severity is visually encoded (color + icon) — critical issues are unmissable

**Grafana (observability)**:
- Panels (KPI cards + charts) compose a dashboard — each panel is independently zoomable
- Variable filters at the top affect all panels simultaneously — one interaction changes the entire page's data
- "Explore" mode is a dedicated deep-dive environment — separate from the overview dashboards
- Time range control is global and persistent — users never have to re-set the time range for each chart

**Common thread**: All four products implement Shneiderman's mantra as a literal navigation hierarchy. The overview is never a scaled-down version of the detail view — it is a qualitatively different representation of the same data designed for a different question.

---

## 6. Quick Reference Checklists

### Dashboard Design Review Checklist

**Hierarchy**
- [ ] Can a new user identify the top 3 metrics within 3 seconds?
- [ ] Is the most important metric top-left or visually dominant?
- [ ] Are interactive and non-interactive elements visually distinct?

**Cognitive load**
- [ ] Fewer than 9 KPI cards on a single view
- [ ] Tables paginated at 20-25 rows
- [ ] Filters have smart defaults (not blank on load)
- [ ] No more than 5 top-level navigation items without grouping

**Data visualization**
- [ ] Each chart answers a specific question (documented or obvious from label)
- [ ] Axes labeled with units
- [ ] Color used consistently (green = good, red = bad, blue = neutral/actionable)
- [ ] Color not the sole indicator of status (icon or text also present)

**States**
- [ ] Empty state for every list/table (explains what will appear and how to add it)
- [ ] Loading skeleton matches content layout
- [ ] Error state includes a recovery action

**Progressive disclosure**
- [ ] Overview answers "is everything okay?" without interaction
- [ ] Detail is available within 2-3 clicks from overview
- [ ] Dense data (full tables, audit logs) is behind dedicated navigation

### KPI Card Quick Check
- [ ] One primary value per card
- [ ] Delta vs previous period shown
- [ ] Timestamp of last update shown (or implicit from page-level refresh indicator)
- [ ] Card is clickable and leads to drill-down
- [ ] Units are explicit (MT, L, %, $)

### Table Quick Check
- [ ] Most important columns leftmost
- [ ] Numeric columns right-aligned
- [ ] Column count <= 8 visible by default
- [ ] Sortable headers with visual sort indicator
- [ ] Sticky header on scroll
- [ ] Pagination controls visible

### Form / Data Entry Quick Check
- [ ] Submit button uses `disabled` + visual loading state during submission
- [ ] Validation errors shown inline, not only in a toast
- [ ] Contextual reference data shown inline (e.g., current balance in a form)
- [ ] Defaults pre-populated where unambiguous (current date, current period)

---

*Reference compiled from: Nielsen Norman Group research, Shneiderman (1996) "The Eyes Have It", Fitts (1954), Miller (1956), Hick (1952), Gestalt psychology literature, and UX analysis of Stripe, Linear, Datadog, and Grafana dashboards.*
