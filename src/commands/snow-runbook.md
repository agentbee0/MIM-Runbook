---
name: snow-runbook
description: >
  Phase 2: Fetches a live ServiceNow incident by number, generates a complete MIM runbook,
  and optionally posts the runbook reference back to the ServiceNow ticket as work notes.
  Requires ServiceNow instance credentials configured in .env or provided at runtime.
argument-hint: "INC0078342 [--instance company.service-now.com] [--update-ticket]"
---

# /snow-runbook — ServiceNow Live Integration

**Description**: Pull a live Sev1 incident from ServiceNow, generate a complete runbook (3 output files), and optionally write the runbook back to the ticket.

**Requires**: Phase 2 setup (ServiceNow credentials in `.env` or provided at runtime).

---

## Prerequisites

Configure ServiceNow credentials in `servers/runbook-generator/.env`:

```
SNOW_INSTANCE=your-company.service-now.com
SNOW_AUTH_TYPE=basic
SNOW_USERNAME=your-service-account
SNOW_PASSWORD=your-password
```

Or provide credentials at runtime when prompted.

---

## Workflow

### Step 1: Collect Incident Number

- If incident number provided as argument (e.g., `/snow-runbook INC0078342`) → use it
- Otherwise → ask the user for the incident number

### Step 2: Collect ServiceNow Credentials

Check environment variables:
- If `SNOW_INSTANCE`, `SNOW_AUTH_TYPE`, and `SNOW_USERNAME`/`SNOW_PASSWORD` are set → use them
- Otherwise → prompt the user for:
  - ServiceNow instance URL (e.g., `company.service-now.com`)
  - Authentication type (Basic or Bearer/OAuth)
  - Username + password (Basic) OR OAuth token (Bearer)

**Security note**: Never log or display passwords. Treat auth tokens as secrets.

### Step 3: Fetch Incident

- Call `fetch_snow_incident` with the instance, incident number, and auth credentials
- Display a summary of the fetched incident to the user for confirmation before proceeding

### Step 4: Fetch Stakeholders

- Call `fetch_snow_stakeholders` using the `assignment_group` from the fetched incident
- Note: SNOW user data may be incomplete. Show the user the stakeholder YAML and ask if they want to:
  - Use it as-is (fast path)
  - Enhance it with phone numbers / Slack handles before generating

### Step 5: Generate Runbook

- Call `generate_runbook` with the fetched YAML
- All 3 output files will be generated

### Step 6: Offer to Update ServiceNow Ticket

Ask the user:
> "Should I post the runbook information back to incident [INC_NUMBER] in ServiceNow as work notes?"

If yes:
- Call `update_snow_incident` with the sys_id and work notes containing:
  - Runbook generated at: [timestamp]
  - Output files: [paths]
  - Incident Commander: [name]
  - Bridge URL: [zoom_url]
  - Slack channel: [channel]

### Step 7: Offer PIR Ticket Creation (post-resolution)

After the incident is resolved, offer:
> "Should I create a Post-Incident Review (PIR) Problem ticket in ServiceNow?"

If yes → call `create_snow_pir_ticket`

---

## Example Usage

```
/snow-runbook INC0078342
/snow-runbook INC0078342 --update-ticket
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Wrong credentials | Check SNOW_USERNAME and SNOW_PASSWORD in .env |
| `No incident found` | Incident number not found | Verify the incident number in ServiceNow |
| `403 Forbidden` | Service account lacks permission | Grant the service account `itil` or `rest_service` role in SNOW |
| `Connection refused` | Wrong instance URL | Verify `SNOW_INSTANCE` does not include `https://` prefix |
