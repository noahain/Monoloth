# Environment Validation Rules

Complete catalog of validation rules organized by severity.

---

## CRITICAL Rules

### RULE-C01: Missing Required Variable

A variable referenced in application code (`os.environ["VAR"]`, `process.env.VAR`, etc.)
with no fallback is absent from the `.env` file.

**Detection:** Variable appears in code via `environ["KEY"]` or `environ.get("KEY")` without
a default parameter, AND is absent from `.env`.

**Fix:** Add the variable to `.env` with an appropriate value.

### RULE-C02: Empty Security Variable

A security-critical variable (`*SECRET*`, `*KEY*`, `*TOKEN*`, `*PASSWORD*`) exists but
has an empty value.

**Detection:** Variable name matches security patterns and value is empty or whitespace-only.

**Fix:** Set a proper value or remove if unused.

---

## HIGH Rules

### RULE-H01: Insecure Default Value

Variable has a well-known insecure default: `changeme`, `password`, `secret`, `xxx`,
`replace_me`, `your_key_here`, `TODO`.

**Detection:** Value matches insecure pattern list (case-insensitive).

### RULE-H02: Type Mismatch

Variable value does not match the expected type inferred from code usage.

| Code Pattern                  | Expected Type | Invalid Example     |
| ----------------------------- | ------------- | ------------------- |
| `int(environ["X"])`           | integer       | `X=abc`             |
| `float(environ["X"])`         | float         | `X=not_a_number`    |
| `environ["X"] == "true"`      | boolean       | `X=yes` (ambiguous) |
| URL parsing on `environ["X"]` | URL           | `X=not_a_url`       |
| `Path(environ["X"])`          | path          | (no validation)     |

### RULE-H03: Debug Mode in Production

`DEBUG=true`, `DEBUG=1`, or `NODE_ENV=development` in a file named `.env.production`
or `.env.prod`.

---

## MEDIUM Rules

### RULE-M01: Unreferenced Variable

Variable exists in `.env` but is not referenced in any code file or manifest.

**Risk:** Stale configuration that confuses developers.

### RULE-M02: Duplicate Definition

Same variable name appears multiple times in the `.env` file. The last definition wins
but the earlier one is likely a mistake.

---

## LOW Rules

### RULE-L01: Format Issue

Line does not match `KEY=VALUE` format, has trailing whitespace, or uses inconsistent quoting.

### RULE-L02: Naming Convention Violation

Variable name uses mixed case (`myVariable`) instead of `SCREAMING_SNAKE_CASE`.

### RULE-L03: Comment Without Space

Comment line starts with `#` without a space after it: `#comment` vs `# comment`.
