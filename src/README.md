# MIM-Runbook

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Plugin: Claude Cowork](https://img.shields.io/badge/Plugin-Claude%20Cowork-blueviolet)](https://claude.com)

**Turn a Sev1 SNOW ticket into a complete incident runbook in seconds.**

A Claude Cowork plugin that takes a ServiceNow incident + stakeholder YAML and generates a complete, prescriptive Major Incident Management runbook — ready for a junior engineer to follow from T+0 to resolution.

---

## What It Produces

```
You provide two YAML files:
  incident-example.yaml     ← incident details (number, service, CI, impact)
  stakeholders-example.yaml ← contacts with roles and escalation levels
            |
            v
/generate-runbook
            |
            v
Three output files generated:

📄 RB-INC0078342-2026-02-26.md     ← Markdown source (Git-diffable)
📝 RB-INC0078342-2026-02-26.docx   ← Word document (share with team, attach to SNOW)
📊 RB-INC0078342-2026-02-26.xlsx   ← Excel action tracker (use live during incident)
```

---

## Quick Start

### 1. Install the plugin

**Claude Cowork:**
Upload the plugin folder via Customize > Browse plugins > Upload.

**Claude Code:**
```bash
claude plugin install --path /path/to/MIM-Runbook-plugin-src
```

### 2. Install MCP server dependencies

```bash
cd servers/runbook-generator
npm install
```

### 3. Add your incident YAML to the input/ directory

Copy `../input/incident-example.yaml` and `../input/stakeholders-example.yaml` as your starting templates. Edit them with your actual incident data.

### 4. Generate a runbook

```
/generate-runbook
```

Or with explicit paths:
```
/generate-runbook ../input/incident-example.yaml ../input/stakeholders-example.yaml
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/generate-runbook [incident.yaml] [stakeholders.yaml]` | Full pipeline: validate YAML, generate .md + .docx + .xlsx |
| `/validate-yaml [path]` | Validate YAML files against schema, get field-level error fixes |
| `/snow-runbook INC0078342` | Phase 2: Fetch from ServiceNow, generate runbook, post notes back |

---

## Skills (Auto-triggered)

These activate automatically when relevant — no slash command needed:

| Skill | When it activates |
|-------|------------------|
| `runbook-generation` | User mentions Sev1, P1 incident, runbook, war room |
| `incident-triage` | User asks about triage, blast radius, first 5 minutes, bridge call |

---

## Runbook Sections (8 total)

Every generated runbook includes all 8 sections:

| # | Section | What you get |
|---|---------|-------------|
| 1 | Incident Summary Banner | Quick-reference table with all key incident fields |
| 2 | Immediate Triage Checklist | T+0–T+5 steps with exact commands and bridge join script |
| 3 | Communication Plan | Stakeholder role map + **6 pre-filled email templates** |
| 4 | Diagnosis & Investigation | Category-specific steps (Database/Network/App/Cloud/Security) with decision trees |
| 5 | Containment & Mitigation | Rollback commands, failover procedures, CAB emergency process |
| 6 | Escalation Matrix | Time-based table (T+15/T+30/T+60/T+120) with all contact details |
| 7 | Resolution & Validation | Health check criteria, severity downgrade table, bridge close procedure |
| 8 | Post-Incident Handoff | PIR template, ServiceNow closure checklist, documentation guide |

---

## Email Templates (6 templates)

Section 3 includes six **ready-to-send** email templates, pre-filled with:
- Real email addresses from your stakeholders YAML
- Incident number, service name, severity in the subject line
- Zoom bridge URL and Slack channel pre-inserted
- IC name, phone, and Slack handle

| Template | Phase | Timing |
|----------|-------|--------|
| 1. Initial Notification | Alert stakeholders immediately | T+0 |
| 2. War Room Established | Bridge is live | T+5 |
| 3. Status Update | Ongoing communication | T+30 (every 30 min) |
| 4. Mitigation In Progress | When containment starts | When action begins |
| 5. Service Restored | All clear | On resolution |
| 6. Incident Closed + PIR Invite | Formal close + review | T+24h |

---

## Excel Tracker (4 Sheets)

| Sheet | Contents |
|-------|---------|
| Action Items | Pre-populated from runbook steps; Status dropdown; conditional formatting (Red=Open, Amber=In Progress, Green=Done) |
| Escalation Log | Pre-seeded with stakeholder contacts; method dropdown |
| Incident Timeline | Pre-seeded with known events; event type dropdown |
| Summary Dashboard | Live formula counters; stakeholder quick-ref; vendor contacts |

---

## YAML Schema Reference

### incident.yaml

```yaml
incident:
  number: "INC0078342"           # Required
  title: "..."                   # Required
  severity: "1 - Critical"       # Required
  priority: "1 - Critical"       # Required
  state: "In Progress"           # Required
  category: "Database"           # Required — Database|Network|Application|Cloud/Infra|Security|Other
  subcategory: "Availability"    # Required
  affected_service: "..."        # Required
  affected_ci: "hostname-01"     # Required — used in commands throughout runbook
  environment: "Production"      # Required
  region: "us-east-1"            # Optional — adds region context to commands
  business_impact: "..."         # Required — appears verbatim in runbook and emails
  opened_at: "2026-02-26T14:28:00Z"  # Required — ISO 8601
  detected_at: "2026-02-26T14:27:45Z" # Optional
  assigned_to: "Team Name"       # Required
  assignment_group: "Group Name" # Required
  caller_id: "Reporter"          # Required
  short_description: "..."       # Required
  description: |                 # Required — full context
    ...
  change_related: true           # Optional — flags recent change correlation
```

### stakeholders.yaml

```yaml
stakeholders:
  - name: "Full Name"
    role: "Incident Commander"    # Incident Commander|Technical Lead|Communications Lead|etc.
    title: "Job Title"
    team: "Team Name"
    email: "user@company.com"     # Used in email To:/CC: fields
    phone: "+1-555-0000"          # Used in escalation matrix
    slack: "@handle"              # Used in triage table and Slack templates
    escalation_level: 1           # 1=immediate, 2=T+30, 3=T+60+
    notify_immediately: true      # true = To: in Templates 1-4
    bridge_url: "https://..."     # Optional — Zoom meeting URL (used in all comms)
    bridge_phone: "+1-..."        # Optional — dial-in number + PIN

vendor_escalations:              # Optional
  - vendor: "Oracle Support"
    account_number: "ORA-12345"
    support_url: "https://support.oracle.com"
    phone: "+1-800-..."
    severity_mapping: "SEV1"
```

---

## Phase 2: ServiceNow Integration

Configure ServiceNow credentials in `servers/runbook-generator/.env`:

```
SNOW_INSTANCE=your-company.service-now.com
SNOW_AUTH_TYPE=basic
SNOW_USERNAME=your-service-account
SNOW_PASSWORD=your-password
```

Then run:
```
/snow-runbook INC0078342
```

This will:
1. Fetch the live incident from ServiceNow
2. Fetch stakeholders from the assignment group
3. Generate all 3 output files
4. Optionally post the runbook back to the ticket as work notes
5. Optionally create a PIR Problem record

See `CONNECTORS.md` for additional optional integrations (PagerDuty, Slack, Datadog, etc.)

---

## File Structure

```
MIM-Runbook-plugin-src/
├── commands/
│   ├── generate-runbook.md
│   ├── validate-yaml.md
│   └── snow-runbook.md
├── skills/
│   ├── runbook-generation/SKILL.md
│   └── incident-triage/SKILL.md
├── servers/
│   └── runbook-generator/
│       ├── src/
│       │   ├── index.ts           ← MCP server + 8 tools
│       │   ├── runbook-generator.ts
│       │   ├── docx-builder.ts
│       │   ├── xlsx-builder.ts
│       │   ├── yaml-parser.ts
│       │   ├── snow-client.ts
│       │   └── types.ts
│       └── package.json
├── .mcp.json
├── LICENSE
└── README.md

../input/
├── incident-example.yaml
└── stakeholders-example.yaml

../output/
└── (generated files appear here)
```

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add categories, improve output formatting, or extend the ServiceNow integration.
