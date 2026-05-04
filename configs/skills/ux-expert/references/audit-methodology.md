# UX Audit Methodology — Reference Guide

A systematic approach for auditing existing pages and features, producing prioritized, actionable findings.

---

## Table of Contents

1. [When to Run an Audit](#1-when-to-run-an-audit)
2. [The 8 Audit Dimensions](#2-the-8-audit-dimensions)
   - 2.1 Information Architecture
   - 2.2 Visual Hierarchy
   - 2.3 Screen Real Estate
   - 2.4 Interaction Cost
   - 2.5 Cognitive Load
   - 2.6 Context & Orientation
   - 2.7 Data Presentation
   - 2.8 Responsiveness & Edge Cases
3. [Severity Rating System](#3-severity-rating-system)
4. [Reading Code for UX Insight](#4-reading-code-for-ux-insight)
5. [Finding Report Template](#5-finding-report-template)
6. [Redesign Spec Template](#6-redesign-spec-template)
7. [Audit Checklist](#7-audit-checklist)

---

## 1. When to Run an Audit

Run a full audit when:
- A page has grown organically and users report confusion
- Preparing a redesign sprint — audit first, design second
- A feature lands in production but adoption is low
- Page has multiple competing sections with unclear priority

A targeted audit (2-3 dimensions only) is appropriate when:
- A specific complaint has been raised ("I can't find X")
- A single component is being refactored

Always audit against **real user goals**, not designer intent. The question is not "is this well-designed?" but "can the user accomplish their task efficiently and without confusion?"

---

## 2. The 8 Audit Dimensions

### 2.1 Information Architecture

**What it is**: The structure, labeling, and grouping of content.

**What to look for**:
- Is the primary task/metric shown first, or buried?
- Are related items grouped visually and semantically (same card, same section)?
- Are unrelated items accidentally grouped (proximity implies relationship)?
- Are labels using domain terms the user understands, or system/developer terms?
- Are any critical data points completely absent from the page?
- Is there redundant information shown in multiple places without purpose?

**Severity criteria**:
- Critical: Primary task requires hunting across multiple sections or is not present
- Major: Related data is split across unrelated areas; user must mentally join information
- Minor: Labels use jargon; groupings are imprecise but understandable
- Enhancement: Minor reordering would create a more logical scan path

**Common findings**:
- Summary KPIs buried below a large table
- "Total" figure placed below the detail it summarizes instead of above
- Actions (buttons) placed far from the data they act on
- Section headings that describe UI structure ("Panel A") rather than content ("Today's Output")

---

### 2.2 Visual Hierarchy

**What it is**: Whether the visual weight of elements matches their informational importance.

**What to look for**:
- What does the eye land on first? Is that the right thing?
- Are primary metrics visually larger/bolder/more contrasted than secondary metrics?
- Do decorative elements (borders, background fills, icons) compete with data?
- Is typography differentiated enough (size, weight) to signal importance levels?
- Are action buttons visually dominant relative to their importance?
- Are error/warning states visually prominent, or easy to miss?

**Severity criteria**:
- Critical: A misleading or dangerous value (e.g., negative balance, error state) is not visually distinct
- Major: The most important metric on the page has the same visual weight as secondary data
- Minor: Hierarchy exists but subtle; users slow down to parse it
- Enhancement: Tightening visual contrast or size ratios would improve scanning speed

**Common findings**:
- All table columns same width and weight — no column stands out as primary
- A single hero number (e.g., today's total) rendered in the same size as its breakdown rows
- Warning icons same color as neutral icons
- Primary CTA button styled same as secondary actions

---

### 2.3 Screen Real Estate

**What it is**: Whether the available space is used in proportion to content importance.

**What to look for**:
- Are large empty areas (whitespace waste) adjacent to dense, hard-to-read areas?
- Does a rarely-used feature take up a fixed large block while a critical feature is compact?
- Are cards or panels padded excessively at the expense of content density?
- Is anything forcing horizontal scroll on standard viewport widths?
- Are there collapsible or tabbed sections that hide content the user needs on every visit?
- Does a modal or drawer take over the full screen for a simple action?

**Severity criteria**:
- Critical: Key content is hidden behind an interaction (tab/scroll) on every page load for the primary workflow
- Major: A core metric requires scrolling past a large decorative or secondary section
- Minor: Padding is generous but does not hide content
- Enhancement: Tightening spacing would allow one more row or metric without scrolling

**Common findings**:
- A full-height sidebar with 3 items and large icons, consuming 30% of width
- Summary cards with 40px padding showing a 2-digit number
- A table that requires horizontal scroll because columns include rarely-needed fields
- Empty state illustration that takes up the full page body

---

### 2.4 Interaction Cost

**What it is**: The number of steps (clicks, scrolls, page changes, searches) required to reach key information or complete a task.

**What to look for**:
- How many clicks does the primary workflow take?
- Does the user have to leave the current page to get context they need to make a decision?
- Are frequently repeated actions exposed directly, or buried in menus?
- Does a form require filling out fields that could be auto-populated or defaulted?
- Do confirmation dialogs appear for low-risk actions?
- Is pagination forcing navigation for data the user needs all at once?

**Severity criteria**:
- Critical: Primary task requires 5+ steps when 1-2 is feasible
- Major: Common context-switching (e.g., check a value on page A to fill a form on page B) with no way to avoid it
- Minor: An action requires one extra click that could be removed
- Enhancement: Keyboard shortcuts or quick-add patterns would accelerate power users

**Common findings**:
- "Add entry" requires navigating to a separate page, filling a form, then navigating back
- Filters reset on page reload, requiring re-application every session
- A drill-down that opens a new page when a detail panel would suffice
- Date picker defaulting to today minus one year instead of today

---

### 2.5 Cognitive Load

**What it is**: The mental effort required to understand, parse, and act on the page.

**What to look for**:
- Are there more than 7+/-2 items in any list or menu without grouping?
- Is all data shown flat, with no progressive disclosure for detail?
- Are multiple different charts/tables showing overlapping data without clear differentiation?
- Does the page require the user to remember information from one section to apply it in another?
- Are there unlabeled icons that require learning?
- Does the page show data for states that don't apply (e.g., future period data when period is not open)?

**Severity criteria**:
- Critical: Page presents contradictory or ambiguous values that require external knowledge to interpret
- Major: User must hold multiple pieces of information in working memory simultaneously to accomplish the task
- Minor: A section is dense but parseable with effort
- Enhancement: Progressive disclosure or inline guidance would smooth the learning curve

**Common findings**:
- A dashboard showing 12 KPI cards with no grouping or priority signal
- A table with 15 columns, most of which are rarely needed
- Two charts on the same page showing different views of the same data with no explanation of how they relate
- Status indicators using color alone (inaccessible) with no label or legend

---

### 2.6 Context & Orientation

**What it is**: Whether the user always knows where they are, what time period they are viewing, what filters are active, and what state the system is in.

**What to look for**:
- Is the active date/period always visible without scrolling?
- Are active filters displayed persistently (as chips or a summary bar)?
- Is the current page/section indicated in navigation?
- After an action (save, delete, submit), does the UI confirm what happened?
- When data is stale or cached, is this communicated?
- On drill-down pages, is there a breadcrumb or back-path?

**Severity criteria**:
- Critical: User cannot tell which time period or entity they are viewing data for — data could be misread
- Major: Active filters are not visible; user does not realize data is filtered
- Minor: Breadcrumb is present but inaccurate or incomplete
- Enhancement: Timestamp of last data refresh would increase trust

**Common findings**:
- A data table with no indication of which month/period it covers
- Filters applied in a sidebar that closes after application — active filters are invisible
- A success toast that disappears in 2 seconds with no persistent confirmation
- A loading state with no indication of what is loading or how long it will take

---

### 2.7 Data Presentation

**What it is**: Whether data is shown in the right format, chart type, and level of precision.

**What to look for**:
- Are comparisons (trend, target vs actual) shown in a way that makes the comparison obvious?
- Are large numbers formatted with thousands separators, units, and appropriate precision?
- Is a bar chart used when a line chart would better show trend over time?
- Are percentages shown alongside absolutes where both matter?
- Are empty/null values displayed as blank, zero, or "---"? Is it consistent?
- Is negative/bad data visually distinguished from positive/good data (e.g., red/green, down arrow)?
- Are dates formatted consistently and in the user's locale?

**Severity criteria**:
- Critical: Chart type or scale distorts the data (e.g., a pie chart with 12 slices; a bar chart with non-zero baseline making a small difference look large)
- Major: Numbers lack units or formatting, requiring mental calculation
- Minor: Inconsistent formatting (some numbers with commas, some without)
- Enhancement: Adding a trend indicator (up/down arrow + delta) would speed comprehension

**Common findings**:
- Large numbers shown as "11000" instead of "11,000"
- A pie chart used for a time series
- A table mixing different units in the same column without a unit column
- "0" shown for days with no data, indistinguishable from actual zero-value days
- Percentage precision: "31.2847%" when "31.3%" is sufficient

---

### 2.8 Responsiveness & Edge Cases

**What it is**: How the page behaves at the boundaries — empty data, loading, errors, mobile viewports, long text.

**What to look for**:
- Is there a meaningful empty state (first-use, no results, no data for period)?
- Are loading states present and informative?
- Are error states actionable (does the user know what to do)?
- Does the layout break on mobile or narrow viewports?
- What happens with very long names/values in table cells?
- What happens when there are 0, 1, 2, and 200+ rows in a table?
- Are there any hardcoded heights that clip content?

**Severity criteria**:
- Critical: An error state shows a raw stack trace or blank screen with no guidance
- Major: Empty state for the primary list/table shows nothing — user doesn't know if data is missing or if there's a bug
- Minor: Long text is clipped with no tooltip; information is lost
- Enhancement: Empty states could include a call-to-action (e.g., "No entries yet — add the first one")

**Common findings**:
- Empty table with no message — blank white space
- Skeleton loader that never resolves if the API errors — spinner runs forever
- A card layout that stacks to single column on mobile but the stacked order is wrong (action before context)
- A name column that truncates long names to just a few characters

---

## 3. Severity Rating System

| Severity | Definition | Action |
|----------|-----------|--------|
| **Critical** | Users cannot accomplish their primary task, or are actively misled by the UI (wrong data appears correct, correct data is invisible) | Fix before release or as hotfix |
| **Major** | Significant friction or confusion. Key information is buried, misrepresented, or requires undue effort to access | Fix in current sprint |
| **Minor** | Suboptimal but functional. Improvement enhances experience without blocking the task | Include in polish pass |
| **Enhancement** | Delight-level polish. No user is struggling, but improvement would increase confidence or speed | Backlog — pick up when bandwidth allows |

When multiple findings interact (e.g., buried data + no orientation = can't find + don't know what you're looking at), escalate the combined severity by one level.

---

## 4. Reading Code for UX Insight

### Layout Structure in React

Look for the outermost container to understand grid/flex structure:

```tsx
// Tells you: 2-column layout, first col wider
<div className="grid grid-cols-3 gap-4">
  <div className="col-span-2"> ... </div>  // main content
  <div> ... </div>                          // sidebar
</div>
```

Check for hardcoded heights that may clip content:
```tsx
// Risk: clips content at exactly 400px
<div className="h-[400px] overflow-hidden">
```

Check for `overflow-x-auto` or `overflow-x-scroll` — signals a component that may cause horizontal scroll.

### Conditional Rendering — What Gets Hidden

Look for conditions that hide entire sections:

```tsx
// Audit question: does the user know this section is hidden?
{someCondition && <ImportantSection />}

// Audit question: is the empty state meaningful?
{data.length === 0 ? <EmptyState /> : <DataTable rows={data} />}
```

If `<EmptyState />` is just `null` or `<div />`, that is a Major finding.

### State Management — What Controls Visibility

Identify what state drives the UI:

```tsx
const [activeTab, setActiveTab] = useState('summary')
const [filters, setFilters] = useState({ period: null, site: null })
```

For `activeTab`: are any tabs hiding primary-task data? Tabs add interaction cost.

For `filters`: if filters are in local state (not URL params), they reset on navigation — context loss.

### Data Flow — API to Display

Trace the data path to find where things can go wrong:

1. Find the API call (usually `useQuery`, `useSWR`, `useEffect + fetch`)
2. Find where the response is mapped to display values
3. Look for transformations: are units converted, values rounded, nulls handled?

```tsx
// Audit questions at each step:
const { data, isLoading, error } = useQuery(...)
//      ^ is error handled?   ^ is loading state shown?

const rows = data?.items.map(item => ({
  ...item,
  total: item.trips * 22,        // hardcoded conversion — flag for domain review
  grade: item.grade?.toFixed(1)  // what if grade is null?
}))
```

### Identifying Redundant UI Elements

Search for components rendered but conditionally invisible, or rendered with empty data:

```tsx
// If `stats` is always empty on this page, this card renders as blank
<StatsCard title="Weekly Summary" data={stats} />
```

Cross-reference: if a component is present in the file but `stats` always comes back `[]` from the API for this route, that is a screen real estate finding.

### Responsive Breakpoints

Look for Tailwind responsive prefixes or CSS media queries:

```tsx
// md: breakpoint at 768px
<div className="flex-col md:flex-row">
```

Trace what happens below the breakpoint — does stacking order make sense? On mobile, context should appear before action.

---

## 5. Finding Report Template

Use this format for every finding in the audit report.

```
## Finding: [Short Descriptive Name]

**Dimension:** [Information Architecture | Visual Hierarchy | Screen Real Estate |
               Interaction Cost | Cognitive Load | Context & Orientation |
               Data Presentation | Responsiveness & Edge Cases]
**Severity:** [Critical | Major | Minor | Enhancement]
**File(s):** [Component file path(s) where the issue lives]

**Current:**
[Describe what exists today. Be specific — quote labels, describe layout, note line numbers if relevant.]

**Problem:**
[Why this is a problem, grounded in a UX principle or user impact. Avoid "it looks bad" — describe the failure mode: what does a user misunderstand, miss, or struggle to do?]

**Recommendation:**
[Specific, implementable change. Not "improve hierarchy" — instead "move the daily total card above the breakdown table and increase font size to 24px/semibold".]

**Principle:**
[The UX principle behind the recommendation, e.g.:
 - Fitts's Law: targets should be sized proportionally to their use frequency
 - Miller's Law: 7+/-2 items in working memory
 - Progressive Disclosure: show only what is needed for the current task
 - Signal-to-Noise: remove elements that do not carry information
 - Recognition over Recall: show context rather than requiring the user to remember it]
```

### Example Finding

```
## Finding: Period Label Missing from Data Table

**Dimension:** Context & Orientation
**Severity:** Critical
**File(s):** frontend/src/pages/ProductionPage.tsx, line 84

**Current:**
The data table renders without any visible header indicating which
operational period the data belongs to. The period is fetched in state but only
used to gate the "Add Entry" button.

**Problem:**
A user viewing historical data has no indication they are looking at January vs
February. If they navigate from a February page to a January page,
the table looks identical. They may enter data believing they are in the current
period when they are not, or draw incorrect conclusions from the data.

**Recommendation:**
Add a persistent period badge at the top of the table header:
"Viewing: January 2026 [CLOSED]" with the period status color-coded
(green = OPEN, grey = CLOSED). This should be sticky on scroll.

**Principle:**
Recognition over Recall — the user should not have to remember which period
they navigated from. The UI should make current context visible at all times.
```

---

## 6. Redesign Spec Template

Use this template to turn audit findings into an implementable design spec. One spec per page or major component redesign.

```markdown
# Redesign Spec: [Page/Component Name]

**Based on audit findings:** [list finding names]
**Target:** [what problem this spec solves in one sentence]

---

## Layout Wireframe

Replace with ASCII wireframe of the proposed layout.
Use boxes to represent sections. Label each box with its content type.

Example:

+-----------------------------------------------------+
|  [Page Title]        [Period Badge: Jan 2026 OPEN]   |
+------------------------+----------------------------+
|  HERO METRIC           |  SECONDARY METRICS (3)     |
|  Today's Output        |  [Target] [MTD] [Variance] |
|  1,240 units  ^ 12%   |                            |
+------------------------+----------------------------+
|  [Active Filters Bar: Site: All | Shift: All | X ]   |
+-----------------------------------------------------+
|  DATA TABLE                                          |
|  [Date] [Shift] [Team] [Count] [Total] [Actions]    |
|  ...                                                 |
|  [Pagination or Load More]                           |
+-----------------------------------------------------+
|  [Empty State — only shown when table is empty]      |
+-----------------------------------------------------+


---

## Component Inventory

List every component needed. Mark as New / Modified / Unchanged / Removed.

| Component | Status | Notes |
|-----------|--------|-------|
| PageHeader | Modified | Add period badge alongside title |
| HeroMetricCard | New | Large-format card for primary KPI |
| SecondaryMetricsRow | New | 3-up row of smaller metric cards |
| ActiveFiltersBar | New | Persistent display of active filters |
| DataTable | Modified | Remove 3 low-use columns; add unit column |
| EmptyState | New | Replaces null render |
| PaginationBar | Unchanged | |

---

## Data Requirements

For each data point shown, specify the source.

| Display Value | Source | Transformation | Null Behavior |
|---------------|--------|---------------|---------------|
| Today's Output | GET /output?date=today | sum(count) | Show "---" |
| Target | GET /targets?period=current | daily_target field | Show "No target set" |
| Variance % | Derived | (actual - target) / target * 100 | Hide if no target |
| Period Label | Context from period store | period.name + period.status | Fallback: "No period" |

---

## Interaction Specifications

Describe behaviors that require code beyond layout.

- **Filter persistence**: Active filters stored in URL params (`?site=1&shift=DAY`).
  Restoring URL restores filter state. Filters survive page refresh.

- **Period badge click**: Opens period selector drawer (existing component).
  Drawer closes on selection; page reloads with new period context.

- **Empty state CTA**: "Add First Entry" button routes to /data/add
  with current period pre-populated.

- **Negative variance**: Variance value rendered in red with a down-arrow icon.
  Positive variance rendered in green with up-arrow. Zero: neutral, no icon.

---

## Responsive Behavior

| Viewport | Layout Change |
|----------|--------------|
| < 768px (mobile) | Hero metric full width. Secondary metrics collapse to 2-up then 1-up. Table gains horizontal scroll. Filters collapse to a "Filters (2)" button. |
| 768-1024px (tablet) | Hero + secondary metrics side by side. Table shows 5 columns max. |
| > 1024px (desktop) | Full layout as wireframe above. |

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| No entries for period | Empty state with message and CTA |
| API error on load | Error card with retry button; no blank screen |
| 200+ rows | Paginate at 50 rows; show "Showing 1-50 of 212" |
| Very long name | Truncate at 24 chars with tooltip showing full name |
| Period is CLOSED | Hide "Add Entry" button; show "Period closed" badge in red |
| Zero value day (legitimate) | Show row with 0, not blank; distinguish from missing data |
```

---

## 7. Audit Checklist

Use this checklist before declaring an audit complete.

### Coverage
- [ ] All 8 dimensions reviewed
- [ ] Every section/tab/state of the page has been examined (not just the happy path)
- [ ] Both mobile and desktop viewports considered
- [ ] Empty state, loading state, and error state reviewed

### Findings Quality
- [ ] Every finding specifies a dimension and severity
- [ ] Every finding has a specific recommendation (not just "improve X")
- [ ] Critical findings are anchored to a specific user task that fails
- [ ] No finding is purely aesthetic without a user impact

### Code Review
- [ ] Hardcoded values flagged (magic numbers, hardcoded strings)
- [ ] Null/undefined handling checked for every displayed value
- [ ] Conditional rendering traced — nothing important hidden unexpectedly
- [ ] Filter/state reset behavior confirmed (URL params vs local state)

### Output
- [ ] Findings sorted by severity (Critical first)
- [ ] Total count by severity noted (e.g., "2 Critical, 4 Major, 6 Minor, 3 Enhancement")
- [ ] Redesign spec written for any section requiring structural changes
- [ ] Quick wins (< 1 hour fixes) called out separately
