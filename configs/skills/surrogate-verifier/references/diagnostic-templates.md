# Failure Diagnostic Templates

Structured templates for producing actionable failure diagnostics. Each template
covers a root-cause category with severity, explanation pattern, and remediation format.

---

## Root-Cause Categories

### 1. Missing Capability (HIGH)

The skill definition promises a feature that the output does not deliver.

**Detection signal:** `contains` assertion failed for a target derived from a stated capability.

**Diagnostic template:**
```
[HIGH] Missing capability: "{target}"
  Skill definition claims: {quoted section from SKILL.md where capability is stated}
  Output analysis: The output does not contain {target} or equivalent content.
  Root cause: {hypothesis — missing workflow step, unclear instruction, or dependency gap}
  Remediation: Add explicit workflow step: "In Phase {N}, generate {target} by {method}"
```

**Worked example:**
```
[HIGH] Missing capability: "## Error Handling"
  Skill definition claims: "Workflow Phase 3: Document error handling patterns"
  Output analysis: The output contains 4 sections but none addressing error handling.
  Root cause: Phase 3 instruction says "document error handling" but does not specify
    the output heading format or what constitutes error handling content.
  Remediation: Change Phase 3 instruction to: "Generate a section titled '## Error
    Handling' with a table of error scenarios, their causes, and recovery steps."
```

---

### 2. Format Mismatch (HIGH)

The output structure does not match the declared format.

**Detection signal:** `output_format` assertion failed.

**Diagnostic template:**
```
[HIGH] Format mismatch: expected "{target}" format
  Skill definition specifies: {output format instruction from SKILL.md}
  Actual output: {brief description of what the output looks like}
  Root cause: {ambiguous format instruction, conflicting instructions, or missing format constraint}
  Remediation: Replace "{vague instruction}" with "Output as a {target} with columns: [A, B, C]"
```

---

### 3. Incomplete Output (MEDIUM)

Multiple assertions in the same logical group failed, indicating a section is partially present.

**Detection signal:** 2+ `contains` assertions failed that relate to the same skill phase or section.

**Diagnostic template:**
```
[MEDIUM] Incomplete output: {section/phase name}
  Expected items: {list of targets that should be present}
  Present items: {list of targets found}
  Missing items: {list of targets not found}
  Root cause: {workflow step produces partial output, context cap reached, or scope ambiguity}
  Remediation: {add explicit enumeration of required items in the workflow instruction}
```

---

### 4. Hallucinated Content (HIGH)

The output contains content that should not be present.

**Detection signal:** `not_contains` assertion failed (forbidden pattern IS present).

**Diagnostic template:**
```
[HIGH] Hallucinated content: "{target}" found in output
  Constraint: The skill should not produce {target}
  Location: Found at approximately {position description}
  Root cause: {missing negative constraint, or positive instruction that inadvertently encourages it}
  Remediation: Add explicit constraint: "Do NOT include {target} unless {specific condition}"
```

---

### 5. Wrong Tool Usage (MEDIUM)

The skill used unexpected tools or failed to use expected ones.

**Detection signal:** `calls_tool` assertion failed.

**Diagnostic template:**
```
[MEDIUM] Wrong tool usage: expected "{target}" tool
  Skill workflow specifies: {tool usage instruction from SKILL.md}
  Actual tools used: {list of tools detected in output, if identifiable}
  Root cause: {ambiguous tool instruction, or skill defaulted to a different approach}
  Remediation: Change instruction to explicitly name the tool: "Use the {target} tool to {action}"
```

---

### 6. Partial Success (LOW)

Some assertions in a logical group pass while others fail, indicating the skill is close
but not fully aligned.

**Diagnostic template:**
```
[LOW] Partial success: {N}/{M} assertions passed in {group}
  Passed: {list of passed targets}
  Failed: {list of failed targets}
  Gap analysis: {what the passing assertions tell us about the output's strengths}
  Remediation: {targeted fix for the specific failed assertions without disrupting passing ones}
```

---

## Diagnostic Output Format

Combine all findings into a single structured diagnostic:

```
DIAGNOSTIC: [{skill-name}] failed on "{task-prompt-summary}"

FAILED ASSERTIONS ({N}/{M} total):
  1. [SEVERITY] type={type} target="{target}" — {Category}: {one-line explanation}
  2. [SEVERITY] type={type} target="{target}" — {Category}: {one-line explanation}

ROOT CAUSES:
  - {Category}: {Detailed explanation with SKILL.md section reference}
  - {Category}: {Detailed explanation}

REMEDIATION (ordered by impact):
  1. {Highest-impact fix with exact SKILL.md change}
  2. {Second fix}
  3. {Third fix if applicable}

CONFIDENCE: {high|medium|low} — {why: e.g., "high: clear format mismatch with explicit fix"}
```

## Escalation Signals

When these patterns appear, the verifier should recommend **test escalation** (harder assertions
for the next round):

- All format assertions pass but content assertions fail → skill produces correct structure but wrong content
- Tool assertions pass but output assertions fail → skill invokes correct tools but misinterprets results
- All assertions pass at low weights but fail at high weights → skill handles easy cases but misses core requirements
