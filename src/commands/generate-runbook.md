---
name: generate-runbook
description: >
  Generates a complete Major Incident Management runbook from incident and stakeholders YAML files.
  Produces three output files: a Markdown source (.md), a formatted Word document (.docx),
  and an Excel action tracker (.xlsx) with 4 sheets (Action Items, Escalation Log, Incident Timeline,
  Summary Dashboard).
argument-hint: "Optional: path/to/incident.yaml path/to/stakeholders.yaml"
---

# /generate-runbook — MIM Runbook Generator

**Description**: End-to-end runbook generation. Reads incident + stakeholder YAML, validates the data, and generates a complete Sev1 runbook with 8 sections, 6 email templates, and an Excel action tracker.

**Argument**: Optional paths to incident and stakeholders YAML files. If not provided, files are selected from the input/ directory.

---

## Core Workflow

### Step 1: Locate Input Files

If file paths were provided as arguments:
- Call `load_yaml_file` for each path
- Proceed to Step 2

If no paths were provided:
- Call `list_input_files` to list YAML files in the input directory
- Present the list to the user and ask them to identify which file is the incident YAML and which is the stakeholders YAML
- Alternatively, if the user has pasted YAML content directly in the chat, use that content

### Step 2: Validate YAML

- Call `validate_incident_yaml` with schema="both" (or individually for each file)
- If there are **errors**: Display each error with the field name and a fix suggestion. Stop and ask the user to fix the YAML before proceeding.
- If there are **warnings** only: Display the warnings and ask the user if they want to proceed anyway. Default: proceed.

### Step 3: Generate Runbook

- Call `generate_runbook` with the incident YAML, stakeholders YAML, and optionally a custom output directory
- The tool will generate all 3 output files automatically

### Step 4: Present Results

After the tool returns:
1. Show the user the paths to all 3 generated files
2. Display the runbook sections inline in the chat (Markdown format) so the user can review immediately
3. Highlight any key information:
   - Incident Commander assigned
   - Bridge URL and Slack channel
   - Number of action items pre-populated in the tracker
   - Any warnings from YAML validation

### Step 5: Offer Next Actions

Ask the user if they want to:
- Open the Word document (provide file path)
- Review the 6 email templates (display inline)
- Make changes and regenerate
- Run `/snow-runbook` to push the runbook back to ServiceNow (Phase 2)

---

## Example Usage

```
/generate-runbook
/generate-runbook ../input/incident-example.yaml ../input/stakeholders-example.yaml
/generate-runbook /Users/myname/incidents/INC0078342.yaml /Users/myname/incidents/stakeholders.yaml
```

---

## Output Files

| File | Description |
|------|-------------|
| `RB-INCxxxxxxx-TIMESTAMP.md` | Source Markdown — Git-friendly, searchable |
| `RB-INCxxxxxxx-TIMESTAMP.docx` | Formatted Word document — share with team, attach to SNOW ticket |
| `RB-INCxxxxxxx-TIMESTAMP.xlsx` | Excel tracker — 4 sheets: Action Items, Escalation Log, Timeline, Summary |

---

## YAML Quick Reference

Your incident YAML must have an `incident:` root key. Minimum required fields:

```yaml
incident:
  number: "INC0000001"
  title: "Brief title of the incident"
  severity: "1 - Critical"
  priority: "1 - Critical"
  state: "In Progress"
  category: "Database"           # Database | Network | Application | Cloud/Infra | Security | Other
  subcategory: "Availability"
  affected_service: "Service Name"
  affected_ci: "hostname-or-resource"
  environment: "Production"
  business_impact: "Description of customer/business impact"
  opened_at: "2026-02-26T14:28:00Z"
  assigned_to: "Team Name"
  assignment_group: "Group Name"
  caller_id: "Reporter Name"
  short_description: "One-line summary"
  description: |
    Full incident description...
```

Your stakeholders YAML must have a `stakeholders:` root key. Minimum required fields per stakeholder:

```yaml
stakeholders:
  - name: "Full Name"
    role: "Incident Commander"    # Incident Commander | Technical Lead | Communications Lead | etc.
    title: "Job Title"
    team: "Team Name"
    email: "email@company.com"
    phone: "+1-555-0000"
    slack: "@handle"
    escalation_level: 1           # 1=immediate, 2=T+30, 3=T+60+
    notify_immediately: true
```
