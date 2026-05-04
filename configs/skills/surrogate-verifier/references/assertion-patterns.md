# Assertion Patterns by Skill Category

Catalog of assertion patterns organized by skill category. Each pattern includes the
assertion type, typical targets, recommended weight, and false-positive avoidance notes.

---

## Development Skills (code generation, testing, building)

| Pattern                       | Type            | Target Example                   | Weight | Notes                                    |
| ----------------------------- | --------------- | -------------------------------- | ------ | ---------------------------------------- |
| Code block present            | `output_format` | `code_block`                     | 0.8    | Most dev skills produce code             |
| Language-specific syntax      | `matches_regex` | `def \w+\(` (Python function)    | 0.6    | Match language the skill targets         |
| Import statements             | `contains`      | `import` or `from ... import`    | 0.4    | Only if skill generates complete files   |
| Test function naming          | `matches_regex` | `def test_\w+`                   | 0.8    | For test-generation skills               |
| No placeholder code           | `not_contains`  | `TODO`, `FIXME`, `pass  # `      | 0.3    | Generated code should be complete        |
| Tool usage for file reading   | `calls_tool`    | `Read`                           | 0.5    | Skills that analyze existing code        |

## Review Skills (code review, architecture, security)

| Pattern                       | Type            | Target Example                   | Weight | Notes                                    |
| ----------------------------- | --------------- | -------------------------------- | ------ | ---------------------------------------- |
| Severity classification       | `matches_regex` | `CRITICAL\|HIGH\|MEDIUM\|LOW`    | 1.0    | Reviews must classify findings           |
| File:line references          | `matches_regex` | `\w+\.\w+:\d+`                   | 0.8    | Findings should cite locations           |
| Recommendation present        | `contains`      | `Recommendation` or `Fix`        | 0.6    | Reviews should suggest fixes             |
| Structured output             | `output_format` | `markdown_table`                 | 0.8    | Findings tables are standard             |
| No false praise               | `not_contains`  | `looks great`, `no issues found` | 0.3    | Unless genuinely clean                   |

## Research Skills (analysis, literature review, investigation)

| Pattern                       | Type            | Target Example                   | Weight | Notes                                    |
| ----------------------------- | --------------- | -------------------------------- | ------ | ---------------------------------------- |
| Citation present              | `matches_regex` | `\[[\d]+\]` or `http`           | 0.8    | Research should cite sources             |
| Multi-section output          | `matches_regex` | `^## .+`                         | 0.6    | Structured analysis with headings        |
| Evidence-based claims         | `contains`      | `according to`, `the data shows` | 0.4    | Claims should reference evidence         |
| Comparison structure          | `output_format` | `markdown_table`                 | 0.6    | Comparative analysis needs tables        |
| Web search tool usage         | `calls_tool`    | `WebSearch`                      | 0.5    | Research skills should search            |

## Business Skills (proposals, market analysis, feasibility)

| Pattern                       | Type            | Target Example                   | Weight | Notes                                    |
| ----------------------------- | --------------- | -------------------------------- | ------ | ---------------------------------------- |
| Quantitative data             | `matches_regex` | `\$[\d,.]+[KMB]?` or `\d+%`     | 0.8    | Business analysis needs numbers          |
| Risk identification           | `contains`      | `risk`, `assumption`             | 0.6    | Should identify uncertainties            |
| Recommendation section        | `matches_regex` | `^## .*(Recommend|Next Step)`    | 1.0    | Must conclude with actionable guidance   |
| Framework application         | `contains`      | `SWOT`, `TAM`, `Lean Canvas`     | 0.4    | Domain frameworks demonstrate depth      |
| Numbered list structure       | `output_format` | `numbered_list`                  | 0.6    | Actionable steps should be ordered       |

## Visualization Skills (diagrams, images, presentations)

| Pattern                       | Type            | Target Example                   | Weight | Notes                                    |
| ----------------------------- | --------------- | -------------------------------- | ------ | ---------------------------------------- |
| Output file created           | `matches_regex` | `\.(html\|svg\|png\|pdf)`        | 1.0    | Visualization must produce files         |
| File write tool usage         | `calls_tool`    | `Write`                          | 0.8    | Must write the output file               |
| Structural markup             | `contains`      | `<svg` or `<div` or `<html`      | 0.6    | HTML/SVG output expected                 |
| No broken references          | `not_contains`  | `undefined`, `NaN`, `null`       | 0.3    | Output should be complete                |

---

## Weight Calibration Guide

| Weight Range | Meaning                     | Use When                                           |
| ------------ | --------------------------- | -------------------------------------------------- |
| 0.9 - 1.0   | Must-have                   | Core output of the skill; failure means broken      |
| 0.6 - 0.8   | Expected                    | Standard quality signal; absence is concerning      |
| 0.3 - 0.5   | Nice-to-have                | Quality indicator but not essential                 |
| 0.1 - 0.2   | Weak signal                 | Informational; high false-positive risk             |

Prefer fewer high-weight assertions over many low-weight ones. 5-7 assertions with
clear signals produce better diagnostics than 15 weak checks.
