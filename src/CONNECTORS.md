# Connectors

MIM-Runbook includes one bundled MCP server and supports optional connectors for integrations.

---

## Bundled: runbook-generator

The `runbook-generator` MCP server handles YAML parsing, runbook generation, and file output.

**Setup:**
```bash
cd servers/runbook-generator
npm install
```

**Tools provided (Phase 1):**
- `generate_runbook` — Generate .md, .docx, and .xlsx from incident + stakeholder YAML
- `load_yaml_file` — Read a YAML file from disk
- `list_input_files` — List YAML files in the input directory
- `validate_incident_yaml` — Validate YAML against the schema

**Tools provided (Phase 2 — ServiceNow):**
- `fetch_snow_incident` — Fetch a live incident from ServiceNow by number
- `fetch_snow_stakeholders` — Fetch assignment group members from ServiceNow
- `update_snow_incident` — Post runbook notes back to a ServiceNow incident
- `create_snow_pir_ticket` — Create a Post-Incident Review Problem ticket in ServiceNow

---

## Optional Connectors

Extend the plugin by adding connectors to `.mcp.json`:

```json
{
  "mcpServers": {
    "runbook-generator": {
      "command": "npx",
      "args": ["tsx", "servers/runbook-generator/src/index.ts"]
    }
  }
}
```

### Incident Management
- **ServiceNow** — Pull live incidents and update tickets (Phase 2, built-in — see above)
- **PagerDuty** — Trigger/acknowledge incidents and pull responder info
- **Opsgenie** — Alert management and on-call scheduling

### Communication
- **Slack** — Auto-create incident channel, post status updates
- **Microsoft Teams** — Post to Teams channel, create war room meeting
- **Zoom** — Create Zoom meeting for bridge call

### Observability
- **Datadog** — Pull active monitors, dashboards, and APM traces
- **New Relic** — Fetch error rates, latency, and deployment markers
- **PagerDuty** — Link incident alerts to runbook

### Document Storage
- **Google Drive** — Store generated runbooks and share with team
- **SharePoint / OneDrive** — Microsoft 365 document storage
- **Confluence** — Publish runbook as a Confluence page

### Cloud Providers (for Phase 2 enrichment)
- **AWS** — Fetch EC2/RDS/EKS status for the affected CI
- **Azure** — Fetch resource health and activity log
- **GCP** — Fetch Cloud Run/GKE/Cloud SQL status
