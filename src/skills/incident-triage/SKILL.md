---
name: incident-triage
description: >
  ITIL-aligned incident triage methodology for first responders to Sev1/P1 incidents.
  Activates when user mentions triage, blast radius assessment, incident bridge calls,
  first response, or "first 5 minutes" of an incident.
---

# Incident Triage Framework

This skill guides the first 15 minutes of a Sev1 response — from alert receipt to war room established.

---

## The First 5 Minutes — Priority Order

Before doing ANYTHING else, complete these actions in order:

1. **Confirm** — Is this a genuine outage or a false alert?
2. **Assess** — What is the blast radius? Who and what is affected?
3. **Declare** — Formally declare the Sev1 and assign an Incident Commander
4. **Mobilise** — Open bridge, create Slack channel, page responders
5. **Communicate** — Send the first external notification

**Do NOT skip to diagnosis or root cause until these 5 steps are complete.**

---

## Confirming an Alert

An alert is genuine if:
- The CI is unreachable from 2 or more independent vantage points
- Customer-facing error rates are elevated (>5% above baseline)
- Multiple correlated alerts firing simultaneously
- A stakeholder or customer has reported the same issue

An alert may be a false positive if:
- Only one monitor is firing and others show green
- The CI responds to manual checks
- The alert has fired before and self-cleared within 2 minutes

**Rule**: If you cannot confirm within 2 minutes, treat it as genuine and proceed.

---

## Blast Radius Assessment

Answer these 4 questions before joining the bridge:

| Question | How to Check |
|----------|-------------|
| How many users/sessions are affected? | Check active session count in APM or analytics dashboard |
| Which downstream services are impacted? | Review service dependency map; check for cascading alerts |
| Is this single-region or multi-region? | Ping/traceroute from multiple regions; check CDN edge status |
| Are there any other open incidents? | Check incident management tool for active Sev1/Sev2 |

---

## Declaring the Sev1

A Sev1 must be declared if ANY of the following are true:
- A production service is completely unavailable (success rate = 0%)
- Customer data is at risk of loss or exposure
- Revenue-generating functionality is impaired for >5 minutes
- The incident affects >20% of active users
- SLA breach is imminent or has occurred

**How to declare**: Assign an Incident Commander immediately. If no IC is available, the first responder assumes the IC role until relieved.

---

## Incident Commander Role

The IC is not a technical investigator — the IC is a coordinator. Responsibilities:
- Chair the bridge call and keep the team focused
- Make go/no-go decisions on risky containment actions
- Ensure communication cadence is maintained
- Escalate to the next level if progress stalls
- Declare resolution when all criteria are met

---

## Bridge Call Etiquette

When joining the bridge call, always say:
1. Your name and role
2. What you can see from your position ("I can see DB alerts firing on prod-oracle-cluster-01")
3. What you're going to do next ("I'm going to check the Oracle alert log")

Rules on the bridge:
- **One voice at a time** — no talking over people
- **State your actions before you take them** — "I'm about to kill session 47 on node 2"
- **Announce findings immediately** — post in Slack channel at the same time
- **No side conversations** — stay on topic; move speculation to Slack DMs
- **No hero actions** — all risky containment actions must get IC approval first

---

## Slack Incident Channel

Create the channel as soon as possible. Standard format: `#inc0078342`

Pin the following as the first message:
```
🚨 INCIDENT: INC0078342
Severity: 1 - Critical
Service: [SERVICE NAME]
CI: [HOSTNAME]
Impact: [BUSINESS IMPACT]
Bridge: [ZOOM URL]
IC: [IC NAME] ([SLACK HANDLE])
Runbook: [LINK]
```

Update this pinned message every 30 minutes with the current status.

---

## Common Triage Mistakes

| Mistake | Why It's Harmful | What to Do Instead |
|---------|-----------------|-------------------|
| Jumping straight to diagnosis | Miss the blast radius; solution doesn't address real scope | Always assess blast radius first |
| Not declaring an IC | No accountability; team pulls in different directions | Assign IC in the first 2 minutes |
| Silently trying fixes | Team doesn't know what's happening; rollback is impossible | Announce every action in Slack before doing it |
| Not sending external comms | Leadership is blindsided; customers frustrated | First notification within 5 minutes of declaration |
| Skipping validation | Think it's fixed; it's not | Always run all health checks before declaring resolved |
| Closing too early | Incident re-opens; looks worse than original | Monitor for 10 minutes after apparent resolution |

---

## Severity Definitions

| Severity | Definition | Response Time |
|---------|-----------|--------------|
| Sev1 / P1 | Production service down or data at risk; major revenue impact | Immediate — 24/7 |
| Sev2 / P2 | Significant degradation affecting many users; workaround available | < 30 minutes during business hours |
| Sev3 / P3 | Minor issue, small number of users, workaround available | < 4 hours |
| Sev4 / P4 | Cosmetic, informational, or very minor impact | Next business day |

---

## ITIL Incident Management Quick Reference

- **Incident**: Unplanned interruption or degradation of service
- **Problem**: Root cause of one or more incidents
- **Change**: Scheduled modification to infrastructure or application
- **CAB**: Change Advisory Board — approves high-risk changes (including emergency changes during incidents)
- **CMDB**: Configuration Management Database — contains CI (Configuration Item) records
- **SLA**: Service Level Agreement — time-bound commitment to resolution
- **PIR**: Post-Incident Review — blameless review conducted after a Sev1 to prevent recurrence
- **RCA**: Root Cause Analysis — systematic investigation to identify the underlying cause
- **MTTR**: Mean Time to Restore — average time from detection to service restoration
- **MTTA**: Mean Time to Acknowledge — average time from alert to first human response
