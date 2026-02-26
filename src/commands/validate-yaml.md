---
name: validate-yaml
description: >
  Validates incident and/or stakeholders YAML files against the MIM-Runbook schema.
  Reports field-level errors with fix suggestions and warnings for optional but recommended fields.
argument-hint: "path/to/file.yaml [incident|stakeholders|both]"
---

# /validate-yaml — YAML Schema Validator

**Description**: Validates YAML files before running `/generate-runbook`. Identifies missing required fields, type errors, and schema violations with actionable fix suggestions.

**Argument**: Path to a YAML file, optionally followed by schema type (incident | stakeholders | both).

---

## Workflow

### Step 1: Load the file

- If a file path was provided → call `load_yaml_file`
- If no path provided → call `list_input_files` and ask the user to pick a file
- If the user pasted YAML directly → use that content

### Step 2: Determine schema type

- If schema type provided as argument → use it
- Otherwise, look at the YAML structure:
  - Has `incident:` root key → validate as "incident"
  - Has `stakeholders:` root key → validate as "stakeholders"
  - Unclear → ask the user which schema to use

### Step 3: Run validation

- Call `validate_incident_yaml` with the appropriate schema

### Step 4: Present results

**If valid (no errors)**:
```
✅ YAML is valid!
  • 0 errors
  • X warnings (see below)
You can now run /generate-runbook
```

**If invalid (errors present)**:

Present each error in this format:
```
❌ Error in field: incident.severity
   Found    : "Critical"
   Expected : One of: "1 - Critical", "2 - High", "3 - Moderate", "4 - Low"
   Fix      : Change to: severity: "1 - Critical"
```

**For warnings**:
```
⚠️  Warning: incident.region is not set
   Impact  : Region-specific guidance will be omitted from the runbook
   Fix     : Add  region: "us-east-1"  (or your cloud region)
```

---

## Common Errors and Fixes

| Error | Fix |
|-------|-----|
| `incident.email` invalid format | Ensure email is in `user@domain.com` format |
| `incident.opened_at` invalid date | Use ISO 8601 format: `2026-02-26T14:28:00Z` |
| `stakeholders[0].escalation_level` out of range | Must be 1, 2, or 3 |
| Missing required field `incident.affected_ci` | Add the CI hostname or resource name |
| `incident.category` not in allowed list | Use: Database \| Network \| Application \| Cloud/Infra \| Security \| Other |

---

## Example Usage

```
/validate-yaml
/validate-yaml ../input/incident-example.yaml
/validate-yaml ../input/stakeholders-example.yaml stakeholders
/validate-yaml ../input/incident-example.yaml incident
```
