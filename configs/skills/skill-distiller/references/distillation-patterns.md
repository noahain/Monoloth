# Distillation Patterns

Catalog of patterns for converting high-reasoning skill instructions into deterministic
rules that lower-capability models can follow reliably.

---

## Pattern 1: Decision Tree → Lookup Table

**Source:** "Analyze the input and determine the appropriate strategy..."

**Distilled:**
```
Check the input against this table and use the matching strategy:

| Input Pattern        | Strategy       | Action                          |
| -------------------- | -------------- | ------------------------------- |
| Contains SQL queries | sql-optimizer  | Run EXPLAIN, suggest indexes    |
| Contains Python code | code-analysis  | Read imports, check types       |
| Contains prose text  | text-analysis  | Extract key claims, cite sources|
| None of the above    | generic        | Summarize content, list topics  |
```

**When to use:** Any instruction that says "determine", "analyze", "decide", or "choose"
based on input characteristics. Convert the implicit decision into an explicit lookup.

---

## Pattern 2: Domain Knowledge → Reference File

**Source:** "Apply best practices for React component architecture..."

**Distilled:**
```
Read `references/react-patterns.md` and apply the rules listed there.
For each component, check:
1. Does it have more than 200 lines? → Extract sub-components
2. Does it mix data fetching with rendering? → Separate into container/presenter
3. Does it use inline styles? → Move to CSS modules
```

**When to use:** Any instruction referencing domain expertise. Create a reference file
with the explicit rules instead of assuming the model knows them.

---

## Pattern 3: Multi-Step Inference → Atomic Steps

**Source:** "Consider the architecture's scalability implications and recommend improvements."

**Distilled:**
```
1. Count the number of database queries per request (Read the route handler)
2. If count > 3: flag as "N+1 query risk", recommend batch loading
3. Check if caching layer exists (Grep for redis, memcached, lru_cache)
4. If no cache found: recommend adding cache for endpoints called > 100x/day
5. Check if horizontal scaling is possible (Grep for session state, file writes)
6. If stateful operations found: list them and recommend extraction to external store
```

**When to use:** Any instruction that requires the model to "consider", "evaluate", or
"assess" something holistically. Break into concrete, sequential checks.

---

## Pattern 4: Open-Ended Output → Template

**Source:** "Produce a comprehensive report covering all findings."

**Distilled:**
```
Output this exact template, filling in each section:

## Summary
[1-2 sentences: what was analyzed and the overall verdict]

## Findings
| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | ...      | ...      | ...   | ... |

## Recommendation
[Top 3 actions ordered by impact, as a numbered list]
```

**When to use:** Any output instruction that says "comprehensive", "detailed", or
"thorough" without specifying structure. Provide the exact output skeleton.

---

## Pattern 5: Conditional Logic → Guard Clauses

**Source:** "Handle edge cases appropriately based on the input characteristics."

**Distilled:**
```
Before processing, check these guards in order. Stop at the first match:

1. If input is empty → output "Error: no input provided" and stop
2. If input exceeds 10,000 characters → truncate to first 10,000 and add "[truncated]"
3. If input contains no recognizable code → output "No code detected. Provide source code."
4. Otherwise → proceed to Phase 2
```

**When to use:** Any instruction about edge cases, error handling, or input validation.
Convert to ordered guard clauses with explicit actions.

---

## Anti-Patterns to Avoid

| Anti-Pattern                     | Problem                                        | Fix                            |
| -------------------------------- | ---------------------------------------------- | ------------------------------ |
| Expanding examples too much      | Distilled skill becomes longer than original   | Keep 2-3 examples max per step |
| Over-specifying tool parameters  | Brittle if tool interface changes               | Specify intent, not exact args |
| Removing all judgment            | Some steps genuinely need model reasoning       | Keep LOW-complexity sections   |
| Duplicating reference content    | Bloats SKILL.md, violates DRY                   | Reference file, not inline     |
