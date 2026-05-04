# Evaluation Rubric

Detailed scoring criteria for each dimension of package quality evaluation.

## Score Scale

General criteria for the 1-5 scale. Dimension-specific tables below refine these.

| Score | General Criteria                                                                            |
| ----- | ------------------------------------------------------------------------------------------- |
| 1     | Absent or fundamentally broken — the dimension is not addressed or fails on load            |
| 2     | Present but severely lacking — minimal effort, major gaps, does not meet basic expectations |
| 3     | Functional with notable gaps — covers the basics but misses important aspects               |
| 4     | Strong with minor improvements possible — well-executed, small refinements remain           |
| 5     | Comprehensive, no meaningful gaps — exemplary execution of this dimension                   |

---

## Per-Dimension Scoring Criteria

### D1: Frontmatter Quality (20%)

| Score | Criteria                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | Missing `name` or `description` field, or YAML frontmatter absent/unparseable                                           |
| 2     | Both fields present but description is under 100 characters, generic, or contains no trigger phrases                    |
| 3     | Description is 100-200 characters with 1-2 trigger phrases, or 200+ characters but no trigger phrases                   |
| 4     | Description is 200-800 characters, contains 3+ trigger phrases, but lacks a "Use this skill when..." clause             |
| 5     | Description is 200-800 characters, contains 4+ trigger phrases, includes "Use this skill when..." clause, keyword-dense |

### D2: Trigger Coverage (18%)

| Score | Criteria                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | Zero trigger phrases in description or body; package activates only on exact name match                                      |
| 2     | 1-2 trigger phrases, all using the same root word (e.g., "review" and "reviewer" but no synonyms)                            |
| 3     | 3-4 distinct trigger phrases covering 2+ synonym families, but missing implied contexts or interrogative forms               |
| 4     | 5-7 trigger phrases across 3+ synonym families, includes at least one implied context scenario                               |
| 5     | 8+ trigger phrases across 4+ synonym families, covers imperative and interrogative forms, includes implied context scenarios |

### D3: Structural Completeness (20%)

| Score | Criteria                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | No workflow, no structure beyond a heading and a few sentences or bare commands                                                                                                  |
| 2     | Has a workflow or step list but missing 3+ of: prerequisites, error handling, output format, limitations, reference table                                                        |
| 3     | Has a workflow and 2-3 of the structural elements; missing error handling or output format specification                                                                         |
| 4     | Has workflow, output format, error handling or limitations, and reference table; missing 1 minor element (e.g., calibration rules)                                               |
| 5     | All structural elements present: workflow/phases, prerequisites (if applicable), error handling, output format, limitations, reference table, calibration rules or quality gates |

### D4: Content Depth (22%)

| Score | Criteria                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Bare commands or single-sentence instructions with no explanatory context, decision guidance, or examples                                          |
| 2     | Commands with brief explanations but no multi-step workflows, no decision frameworks, no output examples                                           |
| 3     | Multi-step workflow present but lacks decision frameworks (when X vs Y), error recovery, or verbatim output templates                              |
| 4     | Multi-step workflow with decision guidance and output templates; missing cross-cutting analysis, severity schemes, or advanced calibration         |
| 5     | Multi-phase workflow with decision frameworks, severity/scoring systems, verbatim output templates, cross-cutting synthesis, and calibration rules |

### D5: Consistency and Integrity (12%)

| Score | Criteria                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Directory name does not match frontmatter `name` field, OR package contains cross-package `../` references that break standalone packaging (CRITICAL findings)                         |
| 2     | Name matches but 2+ referenced files do not exist on disk, or description promises features the body does not deliver                                                                  |
| 3     | Name matches, 1 referenced file missing or 1 description-body mismatch, minor terminology inconsistencies                                                                              |
| 4     | Name matches, all referenced files exist and are self-contained (no `../` paths), description aligns with body, minor terminology variation                                            |
| 5     | Name matches directory exactly, all referenced files exist within the package directory, description accurately reflects body, consistent terminology throughout, fully self-contained |

### D6: CONTRIBUTING.md Compliance (8%)

| Score | Criteria                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Invalid YAML frontmatter that prevents parsing, or name is not kebab-case                                                       |
| 2     | YAML parses but 2+ violations: name over 64 chars, description over 1024 chars, angle brackets present, pushy language          |
| 3     | 1 violation present (e.g., description slightly over 1024 chars, or contains one instance of pushy language)                    |
| 4     | All conventions met with one borderline case (e.g., description at 1010 characters, or a debatable trigger phrase)              |
| 5     | Full compliance: kebab-case name under 64 chars, description under 1024 chars, no angle brackets, no pushy language, valid YAML |

---

## Type-Specific Scoring Criteria

The shared D1-D6 criteria above apply to all package types. The following sections
document additional scoring adjustments for each non-skill package type. These
adjustments modify D3 and D4 scores based on type-specific quality signals.

### Agent Scoring Adjustments

**D3 adjustments for AGENT.md:**

| Condition                                 | Impact              |
| ----------------------------------------- | ------------------- |
| Missing `model` field (opus/sonnet/haiku) | -0.5 from D3 score  |
| Missing `color` field                     | -0.25 from D3 score |
| Missing `metadata.category`               | -0.5 from D3 score  |
| Missing `metadata.execution_phase`        | -0.5 from D3 score  |
| Missing `metadata.language_targets`       | -0.25 from D3 score |
| All agent metadata absent                 | Cap D3 at 3/5       |

**D4 adjustments for AGENT.md:**

| Condition                                             | Impact              |
| ----------------------------------------------------- | ------------------- |
| No decision tree or algorithm section                 | Cap D4 at 2/5       |
| No phase markers (START/END or numbered phases)       | -0.5 from D4 score  |
| No severity classification (CRITICAL/HIGH/MEDIUM/LOW) | -0.5 from D4 score  |
| Only generic advice, no language-specific patterns    | -0.5 from D4 score  |
| No VIOLATION/BLOCK/PASS outcome paths                 | -0.25 from D4 score |

### Hook Scoring Adjustments

**D3 adjustments for HOOK.md:**

| Condition                      | Impact             |
| ------------------------------ | ------------------ |
| No `hook.events` list          | Cap D3 at 2/5      |
| Missing `hook.handler.type`    | -0.5 from D3 score |
| Missing `hook.handler.command` | -0.5 from D3 score |
| No handler script in directory | -1.0 from D3 score |

**D4 adjustments for HOOK.md:**

| Condition                                             | Impact              |
| ----------------------------------------------------- | ------------------- |
| No handler script exists                              | Cap D4 at 1/5       |
| Handler is a placeholder/stub                         | Cap D4 at 2/5       |
| No stdin JSON handling documented                     | -0.5 from D4 score  |
| No exit code semantics documented                     | -0.5 from D4 score  |
| No edge case documentation (timeout, malformed input) | -0.25 from D4 score |

### Rule Scoring Adjustments

**D3 adjustments for RULE.md:**

| Condition                                                      | Impact             |
| -------------------------------------------------------------- | ------------------ |
| Missing `metadata.scope` (global/project)                      | -0.5 from D3 score |
| Language-specific rule without `metadata.applies_to.languages` | -0.5 from D3 score |

**D4 adjustments for RULE.md:**

| Condition                                                    | Impact              |
| ------------------------------------------------------------ | ------------------- |
| Only vague principles, no concrete requirements              | Cap D4 at 2/5       |
| No code examples for key rules                               | -0.5 from D4 score  |
| No anti-patterns shown                                       | -0.25 from D4 score |
| Thresholds use "reasonable"/"appropriate" instead of numbers | -0.5 from D4 score  |

### Command Scoring Adjustments

**D3 adjustments for COMMAND.md:**

| Condition                 | Impact              |
| ------------------------- | ------------------- |
| Missing `command.syntax`  | -0.5 from D3 score  |
| Missing `command.handler` | -0.5 from D3 score  |
| No argument documentation | -0.25 from D3 score |

**D4 adjustments for COMMAND.md:**

| Condition                  | Impact              |
| -------------------------- | ------------------- |
| No step-by-step workflow   | Cap D4 at 2/5       |
| No decision points marked  | -0.5 from D4 score  |
| No output format specified | -0.25 from D4 score |
| No termination criteria    | -0.25 from D4 score |

### Utility Scoring Adjustments

**D3 adjustments for UTILITY.md:**

| Condition                                            | Impact              |
| ---------------------------------------------------- | ------------------- |
| Missing `utility.runtime`                            | -0.5 from D3 score  |
| Missing `utility.entry_point` or file does not exist | -1.0 from D3 score  |
| Missing `utility.executable`                         | -0.25 from D3 score |

**D4 adjustments for UTILITY.md:**

| Condition                                         | Impact              |
| ------------------------------------------------- | ------------------- |
| No working entry_point script                     | Cap D4 at 1/5       |
| Entry point lacks argparse or CLI handling        | -0.5 from D4 score  |
| No error handling in script (bare except or none) | -0.5 from D4 score  |
| No usage examples in body                         | -0.25 from D4 score |
| Undocumented external dependencies                | -0.5 from D4 score  |

### Preset Scoring Adjustments

**D3 adjustments for PRESET.md:**

| Condition                                | Impact              |
| ---------------------------------------- | ------------------- |
| Missing `preset.packages`                | Cap D3 at 1/5       |
| No package type sections in preset       | -0.5 from D3 score  |
| Missing `preset.compatibility.platforms` | -0.25 from D3 score |

**D4 adjustments for PRESET.md:**

| Condition                                          | Impact                         |
| -------------------------------------------------- | ------------------------------ |
| References non-existent packages                   | CRITICAL — caps overall at 40% |
| No explanation of why packages work together       | -0.5 from D4 score             |
| No target workflow or use case described           | -0.5 from D4 score             |
| References aspirational (not yet created) packages | -1.0 from D4 score             |

---

## Dimension Weights and Justification

| Dimension                     | Weight | Justification                                                                                                                                                          |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4: Content Depth             | 22%    | Highest weight because shallow packages waste activation — once triggered, the package must deliver substantive guidance or the user loses trust in the package system |
| D1: Frontmatter Quality       | 20%    | Controls discoverability — Claude Code uses the description to match packages to queries; a poor description means the package is invisible                            |
| D3: Structural Completeness   | 20%    | Structural gaps cause unpredictable behavior — missing error handling leads to silent failures, missing output format leads to inconsistent results                    |
| D2: Trigger Coverage          | 18%    | Breadth of activation — even with a good description, narrow trigger vocabulary means the package misses valid queries phrased differently                             |
| D5: Consistency and Integrity | 12%    | Internal coherence — mismatches between name, description, and content cause confusion but do not prevent function if frontmatter is correct                           |
| D6: CONTRIBUTING Compliance   | 8%     | Lowest weight because convention violations are easy to fix and rarely affect runtime behavior, but they block PR acceptance                                           |

---

## Worked Example: `github` Skill (Deficient)

Evaluating the current `github` skill as a calibration baseline.

| Dimension                     | Score | Rationale                                                                                                                                |
| ----------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1: Frontmatter Quality       | 2/5   | Description exists (134 chars) but contains no trigger phrases, no "Use when" clause, under 200 chars                                    |
| D2: Trigger Coverage          | 1/5   | Zero trigger synonyms in description or body; activates only on exact command references                                                 |
| D3: Structural Completeness   | 1/5   | No prerequisites, no error handling, no limitations, no reference table, no workflow phases                                              |
| D4: Content Depth             | 1/5   | Six bare commands with minimal explanatory context; no decision frameworks, no output examples                                           |
| D5: Consistency and Integrity | 4/5   | Directory name matches frontmatter `name`; no referenced files to check; description matches body                                        |
| D6: CONTRIBUTING Compliance   | 4/5   | Kebab-case name, under 64 chars, description under 1024 chars, no angle brackets; minor: description uses quotes instead of block scalar |

**Score Calculation:**

```text
D1: 2 x 0.20 = 0.400
D2: 1 x 0.18 = 0.180
D3: 1 x 0.20 = 0.200
D4: 1 x 0.22 = 0.220
D5: 4 x 0.12 = 0.480
D6: 4 x 0.08 = 0.320
Sum = 1.800
Overall = 1.800 / 5 x 100 = 36% — Deficient
```

This score reflects a skill that loads correctly but provides minimal guidance and
activates on almost no natural-language queries.

---

## Worked Example: `architecture-reviewer` Skill (Exemplary)

Evaluating the `architecture-reviewer` skill as the upper calibration point.

| Dimension                     | Score | Rationale                                                                                                                                                                 |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1: Frontmatter Quality       | 5/5   | Description is ~680 chars, contains 10+ trigger phrases ("review architecture", "critique design", "audit system", etc.), includes implied activation context             |
| D2: Trigger Coverage          | 5/5   | Broad synonym coverage across synonym families: review/critique/audit/evaluate/assess/check; imperative and contextual forms; domain terms (SOC2, HIPAA, scalability)     |
| D3: Structural Completeness   | 5/5   | All sections present: scan script as prerequisites, 4-phase workflow, severity table, output template with compliance checklist, calibration rules, reference file table  |
| D4: Content Depth             | 5/5   | Multi-phase workflow with decision frameworks (3 modes), severity classification, scored output with arithmetic verification, cross-cutting analysis, 7 calibration rules |
| D5: Consistency and Integrity | 5/5   | Directory matches name, 10+ reference files referenced and present, description accurately reflects the body content, consistent terminology                              |
| D6: CONTRIBUTING Compliance   | 4/5   | All conventions met; minor: description block scalar formatting could be slightly more concise                                                                            |

**Score Calculation:**

```text
D1: 5 x 0.20 = 1.000
D2: 5 x 0.18 = 0.900
D3: 5 x 0.20 = 1.000
D4: 5 x 0.22 = 1.100
D5: 5 x 0.12 = 0.600
D6: 4 x 0.08 = 0.320
Sum = 4.920
Overall = 4.920 / 5 x 100 = 98.4% — Exemplary
```

This score reflects a skill with comprehensive coverage, deep multi-phase workflows,
and broad trigger activation. The 1.6% gap comes from a minor formatting preference
in CONTRIBUTING compliance.

---

## Calibration Rules for Meta-Evaluation

1. If all packages in a Full Audit score above 80%, spot-check the lowest-scoring dimension
   across all packages — the rubric may be too lenient if no dimension scores below 3/5.
2. If a package scores below 40%, verify CRITICAL findings are genuine before reporting.
   Distinguish between truly missing frontmatter and frontmatter that is merely sparse.
3. When comparing scores across packages, a 10+ percentage point gap should correspond to
   visible quality differences. If two packages feel similar in quality but score 15 points
   apart, re-examine the dimension that diverges most.
4. Self-evaluation must produce the same score regardless of whether the evaluator is
   aware it is evaluating itself. Run the same rubric, check the same files, apply the
   same caps.
5. Do not round dimension scores to avoid half-scores — use 3.5 when the package clearly
   falls between two levels. Round only the final percentage to one decimal place.
6. A single CRITICAL finding dominates the overall score by design. This is intentional:
   a package that cannot activate or cannot load has zero utility regardless of content quality.
7. Type-specific adjustments are additive to shared criteria. Apply shared scoring first,
   then adjust for type-specific signals. Never double-penalize: if a shared criterion and
   a type-specific criterion flag the same gap, apply only the stricter cap.
