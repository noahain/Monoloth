# Synthesis Framework Reference

## Synthesis Methods

### Thematic Synthesis

Organize findings by recurring themes across papers rather than paper-by-paper summary.

**Process:**

1. Code each paper's key findings into thematic labels
2. Group papers sharing themes
3. For each theme: state the consensus, note disagreements, identify evolution
4. Cross-reference themes to reveal gaps

**Output structure:**

```
## Theme: [Label]

[Summary of what papers collectively show about this theme]

Papers contributing to this theme:
- [Author et al., Year]: [specific finding]
- [Author et al., Year]: [specific finding]

Points of agreement: [what converges]
Points of tension: [where papers disagree and why]
```

**Pitfall:** Forcing papers into themes they do not fit. If a paper contributes to multiple themes, list it in each. If it fits none, it may indicate a missing theme or misalignment with the review scope.

### Comparative Synthesis

Build structured comparisons across defined dimensions.

**Process:**

1. Identify comparison axes (method, dataset, metric, scale, limitations)
2. Extract comparable data points from each paper
3. Build comparison matrix
4. Analyze patterns in the matrix (what predicts success, what trade-offs exist)

**Output structure:**

| Dimension  | Paper A         | Paper B     | Paper C    |
| ---------- | --------------- | ----------- | ---------- |
| Method     | X               | Y           | Z          |
| Dataset    | D1              | D1, D2      | D2         |
| Key metric | 0.85            | 0.82        | 0.88       |
| Scale      | 1K samples      | 10K samples | 1K samples |
| Limitation | Domain-specific | Slow        | Requires X |

**Pitfall:** Comparing incomparable results. Papers using different datasets, metrics, or evaluation protocols cannot be directly compared on numbers. Note comparability constraints explicitly.

### Chronological Synthesis

Map the temporal evolution of a research area.

**Process:**

1. Order papers by publication date
2. Identify inflection points (papers that shifted the field's direction)
3. Track how methods, assumptions, and benchmarks changed over time
4. Note what drove changes (new datasets, new techniques, failures of prior approaches)

**Output structure:**

```
## [Year Range]: [Era Label]

State of knowledge: [what was understood/assumed]
Key developments:
- [Paper]: [what it introduced and why it mattered]
- [Paper]: [what it introduced and why it mattered]
Shift trigger: [what caused the transition to the next era]
```

**Pitfall:** Post-hoc narrative construction. The chronological story should match how the field actually evolved, not impose a clean narrative arc that the messy reality does not support.

### Gap Analysis

Identify what is unstudied, understudied, or contradictory.

**Categories of gaps:**

| Gap Type               | Description                               | Example                                                           |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| **Coverage gap**       | Topic or domain not yet studied           | "No work applies X to domain Y"                                   |
| **Methodological gap** | Approach not yet tried on a known problem | "X has been tested with method A but not B"                       |
| **Evidence gap**       | Claims made without sufficient evidence   | "Multiple papers claim X but none provide controlled experiments" |
| **Contradiction**      | Studies reach conflicting conclusions     | "Paper A finds X improves Y; Paper B finds it does not"           |
| **Scale gap**          | Only tested at small scale                | "All studies use <1K samples; real-world scale unknown"           |
| **Replication gap**    | Findings not independently replicated     | "Only the original authors have reported this result"             |

**Process:**

1. Map the space: what questions exist × what has been studied
2. Identify empty cells (unstudied combinations)
3. Identify weak cells (studied but with limitations)
4. Identify conflicting cells (contradictory findings)
5. Rank gaps by importance to the research question

## Extraction Template

For each included paper, extract:

```yaml
paper:
  id: "" # arXiv ID, DOI, or other identifier
  title: ""
  authors: []
  year: null
  venue: "" # Conference/journal name
  type: "" # empirical | theoretical | survey | position

research:
  question: "" # What question does this paper address?
  hypothesis: "" # What does it predict/propose?
  contribution: "" # What is the claimed novel contribution?

methodology:
  approach: "" # High-level method description
  datasets: [] # Datasets used
  metrics: [] # Evaluation metrics
  baselines: [] # What it compares against
  scale: "" # Data/compute scale

findings:
  primary: [] # Main results (quantitative where possible)
  secondary: [] # Supporting results
  negative: [] # What did NOT work (often buried in appendices)

assessment:
  strengths: [] # What this paper does well
  limitations: [] # As stated by authors + your assessment
  relevance: "" # How it relates to the review's research question
  themes: [] # Thematic labels for synthesis grouping
```

## Anti-Patterns

### The "List of Summaries" Review

Summarizing each paper sequentially without synthesis. This is a bibliography, not a review. Each paragraph should make a point that draws on multiple papers.

### The "Everything is Related" Review

Including papers with tenuous connections to fill space. A focused review of 15 relevant papers is more valuable than an unfocused review of 50.

### The Silent Resolution

When two papers contradict, picking the one you prefer and ignoring the other. Both must be presented, with analysis of why they disagree (different methods, data, definitions).

### The Missing Self-Critique

Every review has blind spots: databases not searched, languages not covered, recency bias, access limitations. Acknowledge them in a limitations section. A review that claims comprehensiveness is less credible than one that defines its boundaries.
