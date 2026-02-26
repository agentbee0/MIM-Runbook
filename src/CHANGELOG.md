# Changelog

All notable changes to MIM-Runbook are documented here.

## [1.0.0] — 2026-02-26

### Added — Phase 1 (MVP)

**Core Output**
- Generates 3 output files per incident:
  - `.md` — Markdown source (Git-diffable)
  - `.docx` — Formatted Word document with title page, severity badge, header/footer
  - `.xlsx` — Excel action tracker with 4 sheets

**Runbook Sections (8 total)**
- Section 1: Incident Summary Banner with quick-reference table
- Section 2: Triage Checklist with T+0–T+5 steps, exact bridge join script
- Section 3: Communication Plan with 6 phase-specific email templates (pre-filled emails)
- Section 4: Diagnosis & Investigation with category-routing (6 categories)
- Section 5: Containment & Mitigation with rollback commands and CAB guidance
- Section 6: Escalation Matrix (15/30/60/120 min thresholds) + vendor table
- Section 7: Resolution & Validation with health check criteria
- Section 8: Post-Incident Handoff with PIR template and SNOW closure checklist

**Category-Specific Investigation**
- Database (Oracle RAC/MySQL/PostgreSQL cluster health, connection pools, replication lag)
- Network (traceroute, BGP, firewall rules, CDN/load balancer)
- Application (APM, deployment history, feature flags, container restarts)
- Cloud/Infra (AZ health, EC2/Kubernetes, IAM changes, autoscaling)
- Security (SIEM, auth logs, DLP — with breach escalation warning)
- Generic (fallback for unrecognised categories)

**Email Templates (6 templates)**
- Template 1: Initial Incident Notification (T+0)
- Template 2: War Room Established (T+5)
- Template 3: 30-Minute Status Update (recurring)
- Template 4: Mitigation In Progress
- Template 5: Service Restored
- Template 6: Incident Closed + PIR Invitation

**MCP Server Tools (Phase 1)**
- `generate_runbook` — Core generation tool
- `load_yaml_file` — File reader
- `list_input_files` — Directory listing
- `validate_incident_yaml` — Schema validation with field-level errors

**Plugin Files**
- Commands: `/generate-runbook`, `/validate-yaml`
- Skills: `runbook-generation`, `incident-triage`
- Test YAML: `incident-example.yaml`, `stakeholders-example.yaml`

---

## [Planned] — 2.0.0 — ServiceNow Integration (Phase 2)

**Additional MCP Tools**
- `fetch_snow_incident` — Live incident fetch via ServiceNow Table API
- `fetch_snow_stakeholders` — Fetch assignment group members
- `update_snow_incident` — Post runbook notes back to SNOW ticket
- `create_snow_pir_ticket` — Create PIR Problem record in ServiceNow

**Additional Command**
- `/snow-runbook` — End-to-end SNOW fetch + generate + update pipeline
