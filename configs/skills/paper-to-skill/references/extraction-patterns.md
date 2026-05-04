# Methodology Extraction Patterns

Patterns for extracting actionable skill specifications from different types of
research papers.

---

## Paper Type: Algorithm Paper

**Signals:** Contains "Algorithm N:", pseudocode blocks, formal notation, complexity analysis.

**Extraction strategy:**
1. Find the main algorithm block (usually Algorithm 1)
2. Map each line of pseudocode to a natural language step
3. Extract input/output types from the algorithm header
4. Pull parameter defaults from the experiments section
5. Note convergence criteria or stopping conditions

**Example:** EvoSkills Algorithm 1 → 6-phase workflow with Generator, Verifier, Oracle roles.

---

## Paper Type: System/Architecture Paper

**Signals:** Contains system diagrams, component descriptions, API specifications, deployment notes.

**Extraction strategy:**
1. Identify the core pipeline stages from the architecture diagram description
2. Map each component to a skill phase
3. Extract input/output formats from API or interface descriptions
4. Pull configuration parameters from the deployment section
5. Note scalability limits and failure modes

---

## Paper Type: Benchmark/Evaluation Paper

**Signals:** Contains comparison tables, metric definitions, dataset descriptions, evaluation protocols.

**Extraction strategy:**
1. Extract the evaluation protocol as the skill's workflow
2. Map metrics to assertion types (accuracy → contains, format → output_format)
3. Pull dataset characteristics as input format specification
4. Extract the comparison methodology as the skill's core logic
5. Note statistical significance thresholds

---

## Paper Type: Technique/Method Paper

**Signals:** Contains "our method", step-by-step procedure, before/after comparisons, case studies.

**Extraction strategy:**
1. Extract the method's step-by-step procedure as workflow phases
2. Map each "our contribution" to a skill capability
3. Pull before/after examples as eval case fixtures
4. Extract decision criteria from the case studies
5. Note limitations from the discussion section

---

## Common Extraction Pitfalls

| Pitfall                               | Detection                                      | Fix                                    |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Confusing results with methodology    | Skill spec lists numbers, not steps            | Focus on "how", not "what score"       |
| Including all paper content           | Skill spec > 1000 words                        | Extract only the actionable algorithm  |
| Missing parameter ranges              | Steps say "set X" without values               | Check experiments section for ranges   |
| Ignoring failure modes                | No error handling in spec                      | Read limitations and threats to validity|
| Over-specializing to paper's dataset  | Skill only works for paper's specific domain   | Generalize input format, keep method   |
