---
name: runbook-generation
description: >
  Generates Major Incident Management (MIM) runbooks for Sev1/P1 incidents.
  Activates when the user mentions Sev1, P1 incidents, incident runbooks, war rooms,
  major incident response, or asks for help with incident documentation.
---

# MIM Runbook Generation Framework

When generating a Major Incident Management runbook, always produce all 8 sections below in order. Each section must be complete, prescriptive, and usable by a junior engineer with no prior incident experience.

---

## Runbook Structure (8 Mandatory Sections)

### Section 1: Incident Summary Banner

Produce a quick-reference table containing:
- Incident number, title, severity, priority
- State/status, affected service, affected CI
- Environment + region
- Category / subcategory
- Assigned to, assignment group
- Opened at, detected at
- Business impact statement (verbatim from YAML)
- Incident Commander, Technical Lead, Comms Lead names

Follow with an alert box: "This is a Severity X incident — follow this runbook from top to bottom."

### Section 2: Immediate Triage Checklist (T+0 to T+5)

6 numbered steps:
1. T+0 — Confirm the alert is genuine (specific commands to verify CI is actually down)
2. T+1 — Check the monitoring dashboard (dashboards to open by name)
3. T+2 — Assess blast radius (3 specific questions to answer)
4. T+3 — Open the Slack incident channel (exact message template to paste)
5. T+4 — Join the Zoom bridge (bridge URL, dial-in, exact words to say on joining)
6. T+5 — Page immediate-notify stakeholders (table of names, Slack handles, phones)

### Section 3: Communication Plan

Include:
- Communication owner (Comms Lead name from stakeholders)
- Update cadence (every 30 minutes)
- Stakeholder role map table (name, role, notify-when, method, email)
- Slack channel setup steps
- **6 email templates** (see Email Templates section below)

### Section 4: Diagnosis & Investigation Steps

Route investigation steps based on `incident.category`:
- **Database**: Cluster health, error logs, connection pool, replication lag, disk/CPU/memory, recent DDL/deployments
- **Network**: Reachability from multiple vantage points, routing/BGP, firewall rules, CDN/load balancer
- **Application**: APM error rates, application logs, deployment history, feature flags/config
- **Cloud/Infra**: Cloud provider status page, compute health, IAM changes, autoscaling
- **Security**: SIEM alerts, auth logs, DLP alerts + STOP if breach confirmed
- **Other**: Generic fallback (health endpoint, system logs, resources, recent changes)

Each step must include:
- What to check and how (exact commands, queries, or tool names)
- ✅ Good result vs ❌ Bad result
- ⚡ Decision tree: "If X → go to Step N. If Y → go to Step M."

End with a decision tree block and a "Root Cause Hypothesis Log" template.

### Section 5: Containment & Mitigation Actions

Route containment options based on category:
- Database: Failover, connection pool restart, kill blocking sessions, deployment rollback
- Application: Deployment rollback, feature flag disable, service restart
- Network: Route revert, firewall rule revert, CDN bypass, DNS fix
- Cloud/Infra: Instance replacement, region failover

For each action:
- Full command or procedure
- Expected impact / blast radius
- Rollback instructions if the action fails
- CAB emergency approval note where required

### Section 6: Escalation Matrix

Produce two tables:
1. Time-based escalation: T+15 / T+30 / T+60 / T+120 → who to escalate to, contact method
2. Individual contact table: all stakeholders with role, escalation level, phone, email, Slack

If vendors are present, add a vendor escalation sub-section.

### Section 7: Resolution & Validation

Include:
- Checklist of resolution criteria (all must pass)
- Severity downgrade decision table
- Bridge close procedure (exact words to say)
- Slack resolution message template
- Instructions to send Template 5 (Service Restored email)

### Section 8: Post-Incident Handoff

Include:
- Documentation checklist before closing
- ServiceNow resolution notes template (pre-filled with incident number and fields)
- PIR ticket template (filled with incident details)
- ServiceNow ticket closure checklist
- Reminder to send Template 6 (PIR Invitation email)

---

## Email Templates

Generate **6 email templates** in Section 3. Each template must have:
- Phase name and timing
- `To:` — real email addresses from stakeholders YAML (escalation_level 1 + notify_immediately)
- `CC:` — escalation_level 2 on Templates 1–3; escalation_level 3 on Templates 3–6
- `Subject:` — pre-filled with incident number, severity, service name, and phase status
- `Body:` — pre-filled with incident data, stakeholder names, Zoom URL, Slack channel

### Email routing rules:
- `notify_immediately: true` → To: on Templates 1–4
- `escalation_level: 2` → CC on Templates 1–3; To on Templates 4–6
- `escalation_level: 3` (exec) → CC only on Templates 3–6, never To on initial alert

### Templates:
1. **Initial Notification** (T+0) — declare Sev1, bridge details, IC contact
2. **War Room Established** (T+5) — bridge is live, who's on call, working hypothesis
3. **Status Update** (T+30 recurring) — actions taken, current status, ETA, next update time
4. **Mitigation In Progress** (when action starts) — what action, risk, rollback plan, ETA
5. **Service Restored** (on resolution) — duration, root cause summary, validation status
6. **Incident Closed + PIR Invite** (T+24h) — formal closure, PIR details, pre-read materials

---

## Style Rules

- Address the reader directly: "You should now...", "Open the dashboard at...", "Copy-paste this message..."
- Never assume prior knowledge. Define acronyms on first use (e.g., CAB — Change Advisory Board)
- Use checkbox `☐` prefix for all checklist items
- Use numbered steps for sequential actions
- Use monospace code blocks for all commands, queries, and copy-paste messages
- Mark high-risk or irreversible actions with ⚠️ CAB
- Include T+0, T+5, T+15 time markers throughout

---

## Data Quality

Before generating:
- Extract Incident Commander: first stakeholder where role contains "Incident Commander"
- Extract Technical Lead: first stakeholder where role contains "Technical Lead"
- Extract Comms Lead: first stakeholder where role contains "Communications Lead"
- Extract Zoom URL: first stakeholder where bridge_url is set
- Derive Slack channel: `#inc` + incident number lowercased (e.g., `#inc0078342`)
