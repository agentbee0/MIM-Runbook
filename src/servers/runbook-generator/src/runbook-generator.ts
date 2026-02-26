import type {
  Incident,
  Stakeholder,
  VendorEscalation,
  RunbookOutput,
  RunbookSection,
  RunbookBlock,
  EmailTemplate,
  ActionItem,
  EscalationEntry,
} from "./types.js";

// ============================================================
// Main Entry Point
// ============================================================

export function generateRunbook(
  incident: Incident,
  stakeholders: Stakeholder[],
  vendors: VendorEscalation[]
): RunbookOutput {
  const ic = findByRole(stakeholders, "Incident Commander");
  const techLead = findByRole(stakeholders, "Technical Lead");
  const commsLead = findByRole(stakeholders, "Communications Lead");
  const customerLead = findByRole(stakeholders, "Customer Impact");
  const execSponsor = findByRole(stakeholders, "Executive Sponsor");
  const bridgeHolder = stakeholders.find((s) => s.bridge_url) ?? ic;

  const zoomUrl = bridgeHolder?.bridge_url ?? "[ZOOM_BRIDGE_URL]";
  const bridgePhone = bridgeHolder?.bridge_phone ?? "[BRIDGE_DIAL_IN]";
  const slackChannel = `#inc${incident.number.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const detectedAt = incident.detected_at ?? incident.opened_at;

  const emailTemplates = buildEmailTemplates(
    incident, stakeholders, ic, commsLead, zoomUrl, slackChannel
  );

  const actionItems: ActionItem[] = [];
  let actionCounter = 1;

  function addAction(
    phase: ActionItem["phase"],
    action: string,
    owner: string,
    team: string,
    priority: ActionItem["priority"],
    targetBy: string,
    notes = ""
  ): void {
    actionItems.push({
      id: `ACT-${String(actionCounter++).padStart(3, "0")}`,
      phase, action, owner, team, priority, status: "Open", targetBy, notes,
    });
  }

  const sections: RunbookSection[] = [
    buildSection1(incident),
    buildSection2(incident, ic, zoomUrl, slackChannel, addAction),
    buildSection3(incident, stakeholders, ic, commsLead, emailTemplates, addAction),
    buildSection4(incident, ic, techLead, addAction),
    buildSection5(incident, techLead, addAction),
    buildSection6(stakeholders, vendors),
    buildSection7(incident, ic, addAction),
    buildSection8(incident, ic, commsLead, addAction),
  ];

  const escalationEntries = buildEscalationEntries(stakeholders);

  return {
    incident,
    stakeholders,
    vendors,
    sections,
    emailTemplates,
    actionItems,
    escalationEntries,
    generatedAt: new Date().toISOString(),
    slackChannel,
    zoomUrl,
    incidentCommander: ic,
    technicalLead: techLead,
    commsLead: commsLead ?? null,
  };
}

// ============================================================
// Section 1: Incident Summary Banner
// ============================================================

function buildSection1(incident: Incident): RunbookSection {
  const blocks: RunbookBlock[] = [
    {
      type: "table",
      rows: [
        ["Field", "Value"],
        ["Incident Number", incident.number],
        ["Title", incident.title],
        ["Severity", incident.severity],
        ["Priority", incident.priority],
        ["State", incident.state],
        ["Affected Service", incident.affected_service],
        ["Affected CI / Resource", incident.affected_ci],
        ["Environment", `${incident.environment}${incident.region ? ` (${incident.region})` : ""}`],
        ["Category", `${incident.category} / ${incident.subcategory}`],
        ["Assigned To", incident.assigned_to],
        ["Assignment Group", incident.assignment_group],
        ["Reported By", incident.caller_id],
        ["Opened At", formatTimestamp(incident.opened_at)],
        ["Detected At", formatTimestamp(incident.detected_at ?? incident.opened_at)],
        ["Change Related", incident.change_related ? "YES — investigate recent changes" : "No"],
        ["Related Incident", incident.related_incident || "None"],
      ],
    },
    { type: "paragraph", text: "**Business Impact**" },
    { type: "paragraph", text: incident.business_impact },
    { type: "alert_box", alertLevel: "critical", text: `⚠️  This is a Severity ${incident.severity} incident. Every minute of delay costs revenue and customer trust. Follow this runbook from top to bottom without skipping steps.` },
  ];

  if (incident.description) {
    blocks.push(
      { type: "paragraph", text: "**Incident Description**" },
      { type: "paragraph", text: incident.description }
    );
  }

  return { sectionNumber: 1, title: "Incident Summary Banner", blocks };
}

// ============================================================
// Section 2: Immediate Triage Checklist (First 5 Minutes)
// ============================================================

function buildSection2(
  incident: Incident,
  ic: Stakeholder | null,
  zoomUrl: string,
  slackChannel: string,
  addAction: AddActionFn
): RunbookSection {
  addAction("Triage", `Confirm alert is genuine — check ${incident.affected_ci} directly`, ic?.name ?? "On-Call Engineer", ic?.team ?? "Operations", "P1", "T+2");
  addAction("Triage", "Assess blast radius — identify all affected services and users", ic?.name ?? "On-Call Engineer", ic?.team ?? "Operations", "P1", "T+3");
  addAction("Triage", "Open Zoom bridge and Slack incident channel", ic?.name ?? "On-Call Engineer", ic?.team ?? "Operations", "P1", "T+5");
  addAction("Triage", "Page all immediate-notify stakeholders", ic?.name ?? "On-Call Engineer", ic?.team ?? "Operations", "P1", "T+5");

  const blocks: RunbookBlock[] = [
    { type: "alert_box", alertLevel: "warning", text: "Complete all steps in this section within 5 minutes of picking up the alert. Do not investigate root cause yet — your goal is to confirm, assess, and mobilise." },
    {
      type: "numbered_step", stepNumber: 1,
      text: `**T+0 — Confirm the alert is genuine.**\n\nCheck that ${incident.affected_ci} is actually unreachable or degraded. Do NOT assume the monitoring tool is always right — false positives happen.\n\nRun: \`ping ${incident.affected_ci}\` and \`curl -I https://${incident.affected_ci}/health\` (or equivalent health endpoint)\n\nIf the CI responds normally → the alert may be a false positive. Acknowledge in monitoring and add a note to ${incident.number} before standing down.`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**T+1 — Check the monitoring dashboard.**\n\nOpen the primary monitoring dashboard for '${incident.affected_service}'. Look for:\n• Red/critical alerts in the last 15 minutes\n• Any correlated alerts (DB + App + Network firing together suggests a larger blast radius)\n• Comparison to baseline from same time yesterday`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**T+2 — Assess blast radius.**\n\nAnswer these questions before joining the bridge:\n• How many users/customers are affected? (check active sessions, error rates)\n• What downstream services depend on '${incident.affected_ci}'?\n• Is this isolated to one region (${incident.region ?? "check all regions"}) or multi-region?\n• Are any other Sev1/Sev2 incidents currently open that could be related?`,
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: `**T+3 — Open the incident Slack channel.**\n\nCreate channel: ${slackChannel}\n\nPaste this message as the first post:\n\n\`\`\`\n🚨 INCIDENT OPEN: ${incident.number}\nSeverity: ${incident.severity}\nService: ${incident.affected_service}\nCI: ${incident.affected_ci}\nImpact: ${incident.business_impact}\nBridge: ${zoomUrl}\nRunbook: [paste link to this document]\nIC: ${ic?.name ?? "[Incident Commander]"} (${ic?.slack ?? "[slack handle]"})\n\`\`\``,
    },
    {
      type: "numbered_step", stepNumber: 5,
      text: `**T+4 — Join the Zoom bridge call.**\n\nBridge URL: ${zoomUrl}\nDial-in: ${ic?.bridge_phone ?? "[see stakeholders list]"}\n\nWhen you join, say:\n> "This is [YOUR NAME], I'm the on-call engineer. I'm declaring this a Sev1 for ${incident.affected_service}. Incident number ${incident.number}. ${ic?.name ? ic.name + " is the Incident Commander." : "We need to assign an Incident Commander now."} I'll begin triage while the team joins."\n\nRecord the exact time you joined.`,
    },
    {
      type: "numbered_step", stepNumber: 6,
      text: `**T+5 — Page immediate-notify stakeholders.**\n\nThe following people must be notified RIGHT NOW (use phone if Slack is unresponsive):`,
    },
  ];

  const immediateStakeholders = getStakeholdersByLevel(1, true, []);
  if (immediateStakeholders.length > 0) {
    // Just a note — we use the actual stakeholders passed in at runtime
  }

  blocks.push({
    type: "table",
    rows: [
      ["Name", "Role", "Slack", "Phone"],
      // These will be populated with real data in docx-builder and xlsx-builder
      // The generator embeds a marker that builders replace with actual stakeholder rows
      ["[IC_NAME]", "Incident Commander", "[IC_SLACK]", "[IC_PHONE]"],
      ["[TECH_LEAD_NAME]", "Technical Lead", "[TECH_SLACK]", "[TECH_PHONE]"],
      ["[COMMS_LEAD_NAME]", "Communications Lead", "[COMMS_SLACK]", "[COMMS_PHONE]"],
    ],
  });

  return { sectionNumber: 2, title: "Immediate Triage Checklist (First 5 Minutes)", blocks };
}

// ============================================================
// Section 3: Communication Plan
// ============================================================

function buildSection3(
  incident: Incident,
  stakeholders: Stakeholder[],
  ic: Stakeholder | null,
  commsLead: Stakeholder | null,
  emailTemplates: EmailTemplate[],
  addAction: AddActionFn
): RunbookSection {
  addAction("Comms", "Send Initial Incident Notification email (Template 1)", commsLead?.name ?? "Comms Lead", commsLead?.team ?? "Communications", "P1", "T+5");
  addAction("Comms", "Post Slack message to incident channel", commsLead?.name ?? "Comms Lead", commsLead?.team ?? "Communications", "P1", "T+5");
  addAction("Comms", "Send War Room Established email (Template 2)", commsLead?.name ?? "Comms Lead", commsLead?.team ?? "Communications", "P1", "T+10");
  addAction("Comms", "Send T+30 Status Update email (Template 3)", commsLead?.name ?? "Comms Lead", commsLead?.team ?? "Communications", "P1", "T+30");

  const blocks: RunbookBlock[] = [
    { type: "paragraph", text: `**Communication Owner**: ${commsLead?.name ?? "Comms Lead"} (${commsLead?.slack ?? "assign a comms lead now"})` },
    { type: "paragraph", text: `**Update Cadence**: Status updates every **30 minutes** until Sev1 is resolved, then final resolution email.` },
    { type: "heading", level: 2, text: "Stakeholder Role Map" },
    {
      type: "table",
      rows: [
        ["Name", "Role", "Notify When", "Method", "Email"],
        ...stakeholders.map((s) => [
          s.name,
          s.role,
          s.escalation_level === 1 ? "Immediately (T+0)" :
            s.escalation_level === 2 ? "T+30 or if not resolved" : "T+60 or if escalated",
          s.notify_immediately ? "Phone + Slack + Email" : "Slack + Email",
          s.email,
        ]),
      ],
    },
    { type: "heading", level: 2, text: "Slack Communication Steps" },
    {
      type: "numbered_step", stepNumber: 1,
      text: `Create Slack channel: **${incident.number.toLowerCase().replace(/inc/, "#inc")}** (format: \`/incident-channel ${incident.number}\` or create manually)`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `Invite the following people to the channel:\n${stakeholders.filter((s) => s.escalation_level === 1).map((s) => s.slack).join(" ")}`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: "Pin the Incident Summary message at the top of the channel so all joiners see it immediately.",
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: "Post a status update in the channel every 30 minutes, even if there is nothing new to report. Silence breeds rumour.",
    },
    { type: "heading", level: 2, text: "Email Templates" },
    { type: "paragraph", text: "Six ready-to-send email templates are provided below — one for each phase of the incident. Copy-paste the template, fill in the bracketed placeholders [LIKE THIS], and send." },
  ];

  for (const template of emailTemplates) {
    blocks.push({ type: "email_template", emailTemplate: template });
  }

  return { sectionNumber: 3, title: "Communication Plan", blocks };
}

// ============================================================
// Section 4: Diagnosis & Investigation
// ============================================================

function buildSection4(
  incident: Incident,
  ic: Stakeholder | null,
  techLead: Stakeholder | null,
  addAction: AddActionFn
): RunbookSection {
  const category = incident.category.toLowerCase();

  addAction("Diagnosis", `Run initial ${incident.category} health check on ${incident.affected_ci}`, techLead?.name ?? "Technical Lead", techLead?.team ?? "Engineering", "P1", "T+10");
  addAction("Diagnosis", "Collect logs from affected CI and downstream services", techLead?.name ?? "Technical Lead", techLead?.team ?? "Engineering", "P1", "T+15");
  addAction("Diagnosis", "Check recent change/deployment history (last 4 hours)", techLead?.name ?? "Technical Lead", techLead?.team ?? "Engineering", "P1", "T+15");
  addAction("Diagnosis", "Document working hypothesis in Slack channel", ic?.name ?? "IC", ic?.team ?? "Operations", "P2", "T+20");

  const blocks: RunbookBlock[] = [
    { type: "paragraph", text: `**Owner**: ${techLead?.name ?? "Technical Lead"} (${techLead?.slack ?? "assign tech lead"})\n\n**Goal of this section**: Understand WHAT is broken and WHY, so you can take the right containment action. Work through steps in order. Document every finding in the Slack channel as you go.` },
    { type: "alert_box", alertLevel: "info", text: "For every check below: state what you expected vs. what you found. 'Good' means the result matches expected baseline. 'Bad' means it deviates and needs investigation." },
  ];

  if (category.includes("database")) {
    blocks.push(...getDatabaseDiagnosisSteps(incident));
  } else if (category.includes("network")) {
    blocks.push(...getNetworkDiagnosisSteps(incident));
  } else if (category.includes("application")) {
    blocks.push(...getApplicationDiagnosisSteps(incident));
  } else if (category.includes("cloud") || category.includes("infra")) {
    blocks.push(...getCloudInfraDiagnosisSteps(incident));
  } else if (category.includes("security")) {
    blocks.push(...getSecurityDiagnosisSteps(incident));
  } else {
    blocks.push(...getGenericDiagnosisSteps(incident));
  }

  blocks.push(
    { type: "heading", level: 2, text: "Root Cause Hypothesis Log" },
    { type: "paragraph", text: "Before moving to containment, post your working hypothesis in the Slack channel:" },
    {
      type: "command",
      text: `We believe the root cause is: [YOUR HYPOTHESIS]\nEvidence supporting this: [LIST EVIDENCE]\nEvidence against this: [CONTRADICTORY FINDINGS]\nConfidence level: High / Medium / Low\nRecommended next action: [SPECIFIC ACTION]`,
    }
  );

  return { sectionNumber: 4, title: "Diagnosis & Investigation Steps", blocks };
}

function getDatabaseDiagnosisSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Check cluster/node health.**\n\nSSH to primary node: \`ssh admin@${incident.affected_ci}\`\nCheck cluster status:\n\`\`\`\n# For Oracle RAC:\nsrvctl status database -d $(srvctl config database | head -1)\ncrsctl status resource -t | grep -E "(ONLINE|OFFLINE|UNKNOWN)"\n\n# For MySQL/Aurora:\nmysqlsh --uri admin@${incident.affected_ci} -- cluster.status()\n\n# For PostgreSQL:\npsql -h ${incident.affected_ci} -U postgres -c "SELECT pg_is_in_recovery();\"\n\`\`\`\n\n✅ **Good**: All nodes ONLINE, primary responding\n❌ **Bad**: Nodes OFFLINE or UNKNOWN → proceed to Step 2\n⚡ **Decision**: If all nodes show ONLINE but DB is unresponsive → go to Step 3 (connection pool exhaustion)`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Check database error logs (last 30 minutes).**\n\n\`\`\`\n# Oracle alert log:\ntail -500 /u01/app/oracle/diag/rdbms/*/*/trace/alert_*.log\ngrep -i "ORA-" /u01/app/oracle/diag/rdbms/*/*/trace/alert_*.log | tail -50\n\n# MySQL:\nmysqlsh -- dba.getCluster().status()\ntail -200 /var/log/mysql/error.log\n\n# PostgreSQL:\ngrep "FATAL\\|ERROR\\|PANIC" /var/log/postgresql/postgresql-*.log | tail -50\n\`\`\`\n\n✅ **Good**: Only routine messages\n❌ **Bad**: ORA-04031 (shared pool), ORA-00060 (deadlocks), ORA-12170 (connection timeout) → document errors and go to Step 4`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Check connection pool exhaustion.**\n\n\`\`\`\n# Oracle — check active sessions:\nSELECT COUNT(*) FROM v$session WHERE status = 'ACTIVE';\nSELECT value FROM v$parameter WHERE name = 'sessions';\n\n# Check for blocking sessions:\nSELECT sid, serial#, username, blocking_session, seconds_in_wait, state, wait_class\nFROM v$session\nWHERE blocking_session IS NOT NULL;\n\n# Application side — check pool config:\n# Look for POOL_SIZE, MAX_CONNECTIONS, CONNECTION_TIMEOUT in app config\n\`\`\`\n\n✅ **Good**: Active sessions < 80% of max sessions limit\n❌ **Bad**: Sessions at max, or blocking sessions detected → go to Step 6 (kill blocking sessions as mitigation)\n⚡ **Decision**: If connection pool is exhausted → go to Section 5, Step 3`,
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: `**Check replication lag (if applicable).**\n\n\`\`\`\n# MySQL replication:\nSHOW SLAVE STATUS\\G\n# Look for: Seconds_Behind_Master (>60 = bad, >300 = critical)\n# And: Slave_IO_Running: Yes, Slave_SQL_Running: Yes\n\n# PostgreSQL streaming replication:\nSELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,\n  (sent_lsn - replay_lsn) AS replication_lag\nFROM pg_stat_replication;\n\`\`\`\n\n✅ **Good**: Lag < 10 seconds, all replicas running\n❌ **Bad**: Lag > 60 seconds or replica stopped → note for root cause; may need to failover to another replica`,
    },
    {
      type: "numbered_step", stepNumber: 5,
      text: `**Check disk, CPU, and memory on the DB host.**\n\n\`\`\`\ntop -b -n 1 | head -20\ndf -h | grep -E "(Use%|/$)"\niostat -x 1 3\nfree -h\n\`\`\`\n\n✅ **Good**: CPU < 80%, Memory available > 20%, Disk < 85%, IO wait < 20%\n❌ **Bad**: Any threshold breached → resource exhaustion is a likely contributing factor`,
    },
    {
      type: "numbered_step", stepNumber: 6,
      text: `**Check recent DDL/DML changes and deployments (last 4 hours).**\n\nQuery audit log or release tracker:\n\`\`\`\n# Oracle:\nSELECT username, timestamp, action_name, obj_name\nFROM dba_audit_trail\nWHERE timestamp > SYSDATE - (4/24)\nORDER BY timestamp DESC;\n\`\`\`\n\nCheck deployment pipeline for any releases in last 4 hours: [CHECK YOUR DEPLOYMENT TOOL]\n\n⚡ **Decision**: If a deployment occurred within 2 hours of incident detection → this is your primary hypothesis. Go to Section 5 for rollback options.`,
    },
    {
      type: "decision_tree",
      condition: "After completing all diagnosis steps, which best describes your findings?",
      branches: [
        { condition: "DB nodes are offline / cluster split-brain", action: "Go to Section 5, Step 1: Cluster restart / failover" },
        { condition: "Connection pool exhausted, DB nodes healthy", action: "Go to Section 5, Step 2: Connection pool flush and restart app tier" },
        { condition: "Blocking sessions preventing progress", action: "Go to Section 5, Step 3: Kill blocking sessions" },
        { condition: "Recent deployment suspected", action: "Go to Section 5, Step 4: Rollback deployment" },
        { condition: "Disk / memory / CPU exhaustion", action: "Go to Section 5, Step 5: Resource remediation" },
        { condition: "None of the above / unclear", action: "Escalate: page vendor support (see Section 6) and senior DBA now" },
      ],
    },
  ];
}

function getNetworkDiagnosisSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Confirm reachability from multiple vantage points.**\n\n\`\`\`\n# From your workstation:\nping -c 5 ${incident.affected_ci}\ntraceroute ${incident.affected_ci}\nmtr --report ${incident.affected_ci}\n\n# From another host in the same region:\nssh jump-host "ping -c 5 ${incident.affected_ci}"\nssh jump-host "curl -o /dev/null -s -w '%{http_code}' https://${incident.affected_ci}/health"\n\`\`\`\n\n✅ **Good**: Reachable from all vantage points, <10ms latency\n❌ **Bad**: Unreachable from some/all → packet loss indicates routing or firewall issue\n⚡ **Decision**: If reachable from internal but not external → check firewall/CDN (Step 3)`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Check routing tables and BGP status.**\n\n\`\`\`\n# Check routing:\nip route show\nnetstat -rn\n\n# For BGP environments (check with network team):\nshow ip bgp summary   # (on router/switch)\nshow ip route bgp\n\n# Check DNS resolution:\ndig ${incident.affected_ci}\nnslookup ${incident.affected_ci}\n\`\`\`\n\n✅ **Good**: Correct routes present, BGP peers UP, DNS resolves correctly\n❌ **Bad**: Missing routes, BGP peer DOWN, DNS returns wrong IP → network team escalation required`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Check firewall and security group rules.**\n\nVerify no rule was recently changed that blocks traffic to/from ${incident.affected_ci}:\n\`\`\`\n# Linux firewall:\nsudo iptables -L -n -v | head -50\nsudo firewall-cmd --list-all\n\n# AWS Security Groups (if applicable):\naws ec2 describe-security-groups --group-ids [SG_ID] --query 'SecurityGroups[*].IpPermissions'\n\`\`\`\n\n⚡ **Decision**: If a rule was changed in last 4 hours → revert the change (Section 5)`,
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: `**Check CDN and load balancer health.**\n\nVerify CDN edge nodes are serving traffic and not returning errors:\n\`\`\`\ncurl -I -H "Host: ${incident.affected_service}" https://[CDN_EDGE_IP]/health\ncurl -I https://${incident.affected_service}/health\n\`\`\`\n\nCheck load balancer health page in your cloud console or management tool. Look for:\n• Backend instance health checks failing\n• SSL certificate expiry (check expiry date)\n• Origin connection errors`,
    },
    {
      type: "decision_tree",
      condition: "What did network diagnosis reveal?",
      branches: [
        { condition: "BGP peer down or routing change", action: "Section 5, Step 1: Revert routing change or failover to backup link" },
        { condition: "Firewall rule blocking traffic", action: "Section 5, Step 2: Revert firewall rule change" },
        { condition: "DNS misconfiguration", action: "Section 5, Step 3: Fix DNS record and force propagation" },
        { condition: "CDN/Load balancer issue", action: "Section 5, Step 4: Bypass CDN or failover load balancer" },
        { condition: "Unresolved — no root cause found", action: "Escalate to Senior Network Engineer and vendor (Section 6)" },
      ],
    },
  ];
}

function getApplicationDiagnosisSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Check error rate and latency in APM.**\n\nOpen your APM dashboard (DataDog / New Relic / Dynatrace / CloudWatch) for '${incident.affected_service}'.\n\nLook for:\n• Error rate > 1% (baseline) → is it now 10%? 50%? 100%?\n• P99 latency spike (when did it spike? correlates to deployment or upstream change?)\n• Specific endpoints/operations with highest error rates\n\n✅ **Good**: Error rate and latency within normal range\n❌ **Bad**: Error rate > 5% or P99 > 10x baseline → record exact error types and go to Step 2`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Check application error logs.**\n\n\`\`\`\n# Kubernetes pods:\nkubectl logs -n production deployment/${incident.affected_ci} --since=30m | grep -i "error\\|fatal\\|exception" | tail -100\nkubectl get events -n production --sort-by='.lastTimestamp' | tail -30\n\n# Docker:\ndocker logs ${incident.affected_ci} --since 30m 2>&1 | grep -i "error\\|fatal" | tail -100\n\n# Traditional host:\nsudo journalctl -u ${incident.affected_ci} --since "30 minutes ago" | grep -i "error\\|fatal"\ntail -200 /var/log/${incident.affected_ci}/app.log | grep -i "ERROR\\|FATAL"\n\`\`\`\n\n✅ **Good**: Normal log volume, no new error patterns\n❌ **Bad**: New error patterns (NullPointerException, ConnectionRefused, OutOfMemoryError) → record and go to Step 4`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Check deployment history (last 4 hours).**\n\nCheck your deployment pipeline (Jenkins / GitHub Actions / ArgoCD / Spinnaker) for:\n• Any deployment to ${incident.affected_ci} or its dependencies in last 4 hours\n• Time of deployment vs. time of first alert (within 15 minutes = likely causal)\n• What changed: code diff, config change, feature flag change\n\n⚡ **Decision**: Deployment within 2 hours → go to Section 5, Step 1 for rollback`,
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: `**Check feature flags and configuration.**\n\nIf your org uses a feature flag system (LaunchDarkly / Flagsmith / Unleash):\n• Check if any flag was recently toggled for ${incident.affected_service}\n• Check for config changes in your config management system (Consul / etcd / AWS Parameter Store)\n\n\`\`\`\n# Example: AWS Parameter Store change history\naws ssm get-parameter-history --name /prod/${incident.affected_ci}/config --max-items 5\n\`\`\`\n\n✅ **Good**: No flag or config changes in last 4 hours\n❌ **Bad**: Flag/config changed recently → Section 5, Step 2: revert flag/config`,
    },
    {
      type: "decision_tree",
      condition: "Application diagnosis outcome?",
      branches: [
        { condition: "Recent deployment identified", action: "Section 5, Step 1: Rollback deployment" },
        { condition: "Feature flag / config change", action: "Section 5, Step 2: Revert flag or config" },
        { condition: "Memory leak / OOM", action: "Section 5, Step 3: Restart pods/instances, then investigate heap dumps" },
        { condition: "Upstream dependency failure (DB, API, cache)", action: "Investigate the upstream dependency: restart diagnosis loop for that CI" },
        { condition: "No clear cause", action: "Escalate to senior engineer; consider blue/green failover (Section 5, Step 4)" },
      ],
    },
  ];
}

function getCloudInfraDiagnosisSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Check cloud provider status and AZ health.**\n\nBefore assuming your config is broken, check if the cloud provider has an active incident:\n• AWS: https://health.aws.amazon.com/health/status\n• Azure: https://azure.status.microsoft/\n• GCP: https://status.cloud.google.com/\n\nIf there is an active provider-side incident → note the incident ID, post to Slack, and move to Section 5, Step 5 (failover to backup region).\n\n✅ **Good**: All provider services operational in ${incident.region ?? "your region"}\n❌ **Bad**: Provider incident active → escalate to vendor (Section 6) and prepare failover`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Check compute instance / container health.**\n\n\`\`\`\n# AWS EC2:\naws ec2 describe-instance-status --instance-ids [INSTANCE_IDS] --include-all-instances\naws ec2 get-console-output --instance-id [INSTANCE_ID]\n\n# Kubernetes:\nkubectl get nodes -o wide\nkubectl get pods -n production -o wide | grep -v "Running\\|Completed"\nkubectl describe node [UNHEALTHY_NODE]\n\n# Check autoscaling:\naws autoscaling describe-auto-scaling-groups --auto-scaling-group-names [ASG_NAME]\n\`\`\`\n\n✅ **Good**: All instances running/healthy, node Ready, autoscaling group healthy\n❌ **Bad**: Instances impaired, nodes NotReady → check instance logs and system events`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Check IAM / permission changes.**\n\nA permission change can silently break services (S3 access denied, RDS connection refused):\n\`\`\`\n# AWS CloudTrail (last 4 hours):\naws cloudtrail lookup-events \\\n  --start-time $(date -u -v-4H +%Y-%m-%dT%H:%M:%SZ) \\\n  --lookup-attributes AttributeKey=EventName,AttributeValue=PutRolePolicy\n\n# Also check: DeleteBucketPolicy, RevokeSecurityGroupIngress\n\`\`\`\n\n⚡ **Decision**: If IAM change found near incident start time → revert the permission change`,
    },
    {
      type: "decision_tree",
      condition: "Cloud/Infra diagnosis outcome?",
      branches: [
        { condition: "Provider-side AZ/region incident", action: "Section 5, Step 5: Failover to secondary region" },
        { condition: "Compute instances impaired", action: "Section 5, Step 1: Replace/restart impaired instances" },
        { condition: "IAM/permission change", action: "Section 5, Step 2: Revert IAM change via CloudTrail event" },
        { condition: "Autoscaling stuck or misconfigured", action: "Section 5, Step 3: Manually scale out, fix ASG policy" },
        { condition: "Unknown", action: "Escalate to cloud architect; open cloud provider P1 case (Section 6)" },
      ],
    },
  ];
}

function getSecurityDiagnosisSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Check SIEM for correlated alerts.**\n\nOpen your SIEM (Splunk / QRadar / Sentinel / Elastic SIEM) and run:\n\`\`\`\nindex=security host=${incident.affected_ci} earliest=-30m | stats count by source, severity\n\`\`\`\n\nLook for:\n• Authentication failures spike\n• Lateral movement indicators (unusual logins across multiple hosts)\n• Data exfiltration indicators (large outbound transfers)\n• Malware signatures or C2 beaconing\n\n✅ **Good**: No correlated security alerts\n❌ **Bad**: Multiple security alerts firing simultaneously → this is likely a coordinated attack or breach`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Check authentication logs for anomalies.**\n\n\`\`\`\n# Linux auth log:\ngrep -i "failed\\|invalid\\|breach" /var/log/auth.log | tail -100\ngrep -i "accepted\\|opened" /var/log/auth.log | awk '{print $9}' | sort | uniq -c | sort -rn | head -20\n\n# Windows Event Log (Security):\nGet-WinEvent -LogName Security -MaxEvents 100 | Where {$_.Id -in @(4625,4648,4672,4720)} | Format-List\n\`\`\`\n\n⚠️ **IMPORTANT**: If you suspect an active breach, do NOT power off affected systems — this destroys forensic evidence. Isolate from network instead.`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Check DLP (Data Loss Prevention) alerts.**\n\nVerify if any sensitive data may have been exfiltrated:\n• Check DLP console for alerts in last 24 hours\n• Look for large transfers to external IPs\n• Check firewall logs for unusual outbound connections\n\n\`\`\`\nnetstat -an | grep ESTABLISHED | grep -v "127.0.0.1\\|10.\\|192.168.\\|172." | head -20\n\`\`\``,
    },
    {
      type: "alert_box", alertLevel: "critical",
      text: "SECURITY INCIDENT HANDLING: If you confirm a breach or data exfiltration — STOP. Escalate immediately to the CISO and Legal team BEFORE taking any containment action. Containment may need to be coordinated with law enforcement.",
    },
  ];
}

function getGenericDiagnosisSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Check primary health endpoint.**\n\n\`\`\`\ncurl -v -m 10 https://${incident.affected_ci}/health\ncurl -v -m 10 https://${incident.affected_ci}/status\nping -c 5 ${incident.affected_ci}\n\`\`\`\n\n✅ **Good**: 200 OK response, ping responding\n❌ **Bad**: Timeout, 5xx error, no route to host → proceed to Step 2`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Check system logs for errors (last 30 minutes).**\n\n\`\`\`\nsudo journalctl -u ${incident.affected_ci} --since "30 minutes ago" | grep -i "error\\|fatal\\|critical"\ntail -200 /var/log/syslog | grep -i "error\\|fail\\|critical"\n\`\`\`\n\n✅ **Good**: No new error patterns\n❌ **Bad**: New errors → document them verbatim; search for known fixes`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Check system resources.**\n\n\`\`\`\ntop -b -n 1 | head -20\ndf -h\nfree -h\nnetstat -s | grep -i "failed\\|retransmit\\|error"\n\`\`\`\n\n✅ **Good**: CPU < 80%, Memory available, Disk < 85%\n❌ **Bad**: Resource exhaustion → immediate escalation required`,
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: `**Check recent deployments and configuration changes.**\n\nQuery your deployment tool and change management system for changes to '${incident.affected_ci}' in the last 4 hours.\n\n⚡ **Decision**: If a change was made → rollback is the fastest path to service restoration`,
    },
  ];
}

// ============================================================
// Section 5: Containment & Mitigation
// ============================================================

function buildSection5(
  incident: Incident,
  techLead: Stakeholder | null,
  addAction: AddActionFn
): RunbookSection {
  const category = incident.category.toLowerCase();

  addAction("Containment", "Execute primary containment action (per diagnosis findings)", techLead?.name ?? "Technical Lead", techLead?.team ?? "Engineering", "P1", "T+20");
  addAction("Containment", "Validate containment effectiveness — monitor error rates", techLead?.name ?? "Technical Lead", techLead?.team ?? "Engineering", "P1", "T+30");
  addAction("Containment", "Document all actions taken with exact timestamps in Slack", techLead?.name ?? "Technical Lead", techLead?.team ?? "Engineering", "P2", "T+35");

  const blocks: RunbookBlock[] = [
    { type: "paragraph", text: `**Owner**: ${techLead?.name ?? "Technical Lead"}\n\n**Rule**: Before executing any containment action, announce it in ${incident.number.toLowerCase()} Slack channel:\n> "About to execute: [ACTION]. Expected impact: [IMPACT]. Rollback plan: [ROLLBACK]. Approvals: [NAMES]"\n\nFor **irreversible or high-risk actions**, obtain verbal approval from the Incident Commander and document it in the Slack channel.` },
    { type: "alert_box", alertLevel: "warning", text: "CAB Emergency Approval: Some actions below (marked ⚠️ CAB) require Change Advisory Board emergency approval. To get fast approval: (1) Call the CAB emergency line at [CAB_PHONE], (2) State incident number and requested change, (3) Get verbal approval from the CAB chair, (4) Log the change in your ITSM tool immediately after." },
  ];

  if (category.includes("database")) {
    blocks.push(...getDatabaseContainmentSteps(incident));
  } else if (category.includes("network")) {
    blocks.push(...getNetworkContainmentSteps(incident));
  } else if (category.includes("application")) {
    blocks.push(...getApplicationContainmentSteps(incident));
  } else if (category.includes("cloud") || category.includes("infra")) {
    blocks.push(...getCloudInfraContainmentSteps(incident));
  } else {
    blocks.push(...getGenericContainmentSteps(incident));
  }

  return { sectionNumber: 5, title: "Containment & Mitigation Actions", blocks };
}

function getDatabaseContainmentSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Option A: Failover to standby/replica (FASTEST — preferred first action).**\n\n⚠️ CAB required if this is a planned-change environment.\n\n\`\`\`\n# Oracle Data Guard failover:\ndgmgrl sys/[PASSWORD]@${incident.affected_ci}\nFAILOVER TO [STANDBY_DB_NAME];\n\n# MySQL MHA failover:\nmasterha_master_switch --conf=/etc/mha/app.conf --master_state=dead --orig_master_is_new_slave\n\n# AWS RDS Failover:\naws rds failover-db-cluster --db-cluster-identifier [CLUSTER_ID]\n\`\`\`\n\n**Rollback**: If standby is worse, re-failover back: \`SWITCHOVER TO [PRIMARY_DB];\`\n\nMonitor: Check application error rates within 5 minutes of failover.`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Option B: Restart connection pool (if pool exhaustion is the cause).**\n\n\`\`\`\n# Restart application connection pool (varies by tech stack):\n# Spring Boot:\ncurl -X POST https://[APP_HOST]/actuator/loggers/com.zaxxer.hikari -d '{"configuredLevel":"DEBUG"}'\n# Direct kill: kill application processes and let them restart\nsystemctl restart ${incident.affected_ci}-app\n\n# AWS RDS Proxy (if used):\naws rds failover-db-cluster --db-cluster-identifier [CLUSTER]\n\`\`\`\n\n**Monitor**: After restart, watch connection count in DB metrics dashboard.`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Option C: Kill blocking sessions.**\n\n\`\`\`\n-- Oracle: Find and kill blocking sessions:\nSELECT 'ALTER SYSTEM KILL SESSION ''' || sid || ',' || serial# || ''' IMMEDIATE;'\nFROM v$session\nWHERE blocking_session IS NOT NULL;\n-- Execute the generated statements above after reviewing them\n\n-- MySQL: Kill blocking connections\nSELECT CONCAT('KILL ', id, ';') FROM information_schema.processlist\nWHERE time > 300 AND command != 'Sleep'\nORDER BY time DESC LIMIT 10;\n\`\`\`\n\n⚠️ **Review each session before killing** — some long-running transactions may be legitimate batch jobs.`,
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: `**Option D: Rollback a recent deployment (if deployment is suspected).**\n\nGet the last known-good deployment tag from your pipeline:\n\`\`\`\n# Kubernetes:\nkubectl rollout undo deployment/${incident.affected_ci} -n production\nkubectl rollout status deployment/${incident.affected_ci} -n production\n\n# AWS CodeDeploy:\naws deploy create-deployment \\\n  --application-name [APP_NAME] \\\n  --deployment-group-name [GROUP] \\\n  --deployment-config-name CodeDeployDefault.AllAtOnce \\\n  --revision revisionType=GitHub,gitHubLocation={repository=[REPO],commitId=[LAST_GOOD_COMMIT]}\n\`\`\``,
    },
  ];
}

function getApplicationContainmentSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Rollback deployment to last known-good version.**\n\n⚠️ CAB required in production.\n\n\`\`\`\n# Kubernetes:\nkubectl rollout undo deployment/${incident.affected_ci} -n production\nkubectl rollout status deployment/${incident.affected_ci} -n production --timeout=5m\n\n# Docker Swarm:\ndocker service update --rollback ${incident.affected_ci}\n\n# Traditional (restart with previous version):\nsudo systemctl stop ${incident.affected_ci}\n# Replace binary/artifact with previous version\nsudo systemctl start ${incident.affected_ci}\n\`\`\`\n\n**Validate**: Check error rate in APM dashboard within 2 minutes of rollback.`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Disable problematic feature flag.**\n\nIf a feature flag was recently enabled, turn it OFF:\n\`\`\`\n# LaunchDarkly CLI:\nlaunchdarkly flags update [FLAG_KEY] --off --environment production\n\n# Or via API:\ncurl -X PATCH https://app.launchdarkly.com/api/v2/flags/default/[FLAG_KEY] \\\n  -H "Authorization: [API_KEY]" \\\n  -d '[{"op":"replace","path":"/environments/production/on","value":false}]'\n\`\`\`\n\n**Validate**: Error rate should drop within 1-2 minutes.`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Restart affected services (last resort — short-term fix only).**\n\n\`\`\`\n# Kubernetes — rolling restart:\nkubectl rollout restart deployment/${incident.affected_ci} -n production\n\n# Systemd:\nsudo systemctl restart ${incident.affected_ci}\n\n# ECS:\naws ecs update-service --cluster production --service ${incident.affected_ci} --force-new-deployment\n\`\`\`\n\n⚠️ **Note**: A restart may mask the root cause. Capture heap dumps and thread dumps BEFORE restarting if OOM or deadlock is suspected:\n\`jmap -dump:format=b,file=/tmp/heapdump.hprof [PID]\``,
    },
  ];
}

function getNetworkContainmentSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Revert the routing change / re-advertise the route.**\n\n⚠️ CAB required.\n\n\`\`\`\n# Rollback network change via your network management tool\n# Or re-advertise the withdrawn BGP route\n# Specific commands depend on your network vendor — contact your network team\n\`\`\`\n\n**Validate**: Run \`traceroute ${incident.affected_ci}\` from multiple vantage points.`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Revert firewall rule change.**\n\n\`\`\`\n# Linux iptables — remove the blocking rule:\nsudo iptables -D INPUT -s [BLOCKED_IP] -j DROP\n\n# AWS Security Group — restore the inbound rule:\naws ec2 authorize-security-group-ingress \\\n  --group-id [SG_ID] \\\n  --protocol tcp --port [PORT] --cidr [CIDR]\n\`\`\``,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Bypass CDN and route traffic directly to origin.**\n\nUpdate DNS to point directly to origin load balancer (bypasses CDN caching and edge issues):\n\`\`\`\n# AWS Route 53 — update record to point to ALB:\naws route53 change-resource-record-sets --hosted-zone-id [ZONE_ID] \\\n  --change-batch file://failover-dns.json\n\`\`\`\n\n**Monitor**: DNS propagation takes 1-5 minutes. Monitor via: \`watch -n 10 "dig ${incident.affected_ci} @8.8.8.8"\`\n\n**Rollback**: Revert DNS record back to CDN CNAME once CDN issue is resolved.`,
    },
  ];
}

function getCloudInfraContainmentSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Replace impaired instances / restart pods.**\n\n\`\`\`\n# AWS EC2 — terminate impaired instance (ASG will replace):\naws ec2 terminate-instances --instance-ids [IMPAIRED_INSTANCE_ID]\n\n# Kubernetes — delete and reschedule pod:\nkubectl delete pod [POD_NAME] -n production\n# If node is impaired, cordon it:\nkubectl cordon [NODE_NAME]\nkubectl drain [NODE_NAME] --ignore-daemonsets --delete-emptydir-data\n\`\`\``,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Failover to backup region / AZ.**\n\n⚠️ CAB required — high blast radius action.\n\n\`\`\`\n# AWS Route 53 health-check based failover:\naws route53 change-resource-record-sets --hosted-zone-id [ZONE_ID] \\\n  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"[DOMAIN]","Type":"A","Failover":"SECONDARY","HealthCheckId":"[HC_ID]","TTL":60,"ResourceRecords":[{"Value":"[BACKUP_IP]"}]}}]}'\n\`\`\`\n\n**Validate**: Test from external after 60 seconds (TTL).`,
    },
  ];
}

function getGenericContainmentSteps(incident: Incident): RunbookBlock[] {
  return [
    {
      type: "numbered_step", stepNumber: 1,
      text: `**Restart the affected service (first, safest option).**\n\n\`\`\`\nsudo systemctl restart ${incident.affected_ci}\nsudo systemctl status ${incident.affected_ci}\n\`\`\`\n\n**Validate**: Check health endpoint within 2 minutes. If no improvement → go to Step 2.`,
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `**Rollback most recent change.**\n\nIdentify the most recent change to ${incident.affected_ci} and revert it. Contact the change owner and ask them to revert via normal rollback procedure.\n\n⚠️ CAB required for all production rollbacks.`,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: `**Failover to backup/standby (if available).**\n\nIf a backup system or standby environment exists for '${incident.affected_service}', activate it now. Update DNS/load balancer to route traffic to the backup.\n\nGet specific failover procedure from: [LINK TO DR PROCEDURE]`,
    },
  ];
}

// ============================================================
// Section 6: Escalation Matrix
// ============================================================

function buildSection6(stakeholders: Stakeholder[], vendors: VendorEscalation[]): RunbookSection {
  const blocks: RunbookBlock[] = [
    { type: "paragraph", text: "Use this matrix to escalate if the incident is not resolved within the stated time window. **Do not wait until the time is up** — if you are not making progress, escalate sooner." },
    {
      type: "table",
      rows: [
        ["Time Elapsed", "Action", "Escalate To", "Contact Method"],
        ["T+15 (not contained)", "Escalate to Technical Lead + IC if not already engaged", stakeholders.filter((s) => s.escalation_level === 1).map((s) => s.name).join(", "), "Phone + Slack"],
        ["T+30 (not contained)", "Escalate to VP/Senior Management; consider vendor support", stakeholders.filter((s) => s.escalation_level === 2).map((s) => s.name).join(", ") || "Level 2 contacts", "Phone + Email"],
        ["T+60 (not contained)", "Escalate to C-Suite; open P1 case with relevant vendor", stakeholders.filter((s) => s.escalation_level === 3).map((s) => s.name).join(", ") || "Executive team", "Phone"],
        ["T+120 (still unresolved)", "Consider declaring Major Incident; invoke DR plan; all hands", "All stakeholders + DRI team", "Emergency all-hands bridge"],
      ],
    },
    { type: "heading", level: 2, text: "Individual Escalation Contacts" },
    {
      type: "table",
      rows: [
        ["Name", "Role", "Escalation Level", "Phone", "Email", "Slack"],
        ...stakeholders.map((s) => [
          s.name,
          s.role,
          s.escalation_level === 1 ? "Level 1 — Immediate" :
            s.escalation_level === 2 ? "Level 2 — T+30" : "Level 3 — T+60+",
          s.phone,
          s.email,
          s.slack,
        ]),
      ],
    },
  ];

  if (vendors && vendors.length > 0) {
    blocks.push(
      { type: "heading", level: 2, text: "Vendor / Third-Party Escalation" },
      {
        type: "table",
        rows: [
          ["Vendor", "Account Number", "Support URL", "Phone", "Severity to Declare"],
          ...vendors.map((v) => [v.vendor, v.account_number, v.support_url, v.phone, v.severity_mapping]),
        ],
      }
    );
  }

  return { sectionNumber: 6, title: "Escalation Matrix", blocks };
}

// ============================================================
// Section 7: Resolution & Validation
// ============================================================

function buildSection7(
  incident: Incident,
  ic: Stakeholder | null,
  addAction: AddActionFn
): RunbookSection {
  addAction("Resolution", `Validate ${incident.affected_service} end-to-end health checks pass`, ic?.name ?? "IC", ic?.team ?? "Operations", "P1", "T+0 post-fix");
  addAction("Resolution", "Confirm error rate and latency return to baseline", ic?.name ?? "IC", ic?.team ?? "Operations", "P1", "T+5 post-fix");
  addAction("Resolution", "Run synthetic monitor / smoke test", ic?.name ?? "IC", ic?.team ?? "Operations", "P1", "T+5 post-fix");
  addAction("Resolution", "Formally downgrade to Sev2 / close bridge once all checks pass", ic?.name ?? "IC", ic?.team ?? "Operations", "P2", "T+10 post-fix");
  addAction("Resolution", "Send Service Restored notification (Email Template 5)", ic?.name ?? "IC", ic?.team ?? "Operations", "P1", "T+5 post-fix");

  const blocks: RunbookBlock[] = [
    { type: "paragraph", text: `**Owner**: ${ic?.name ?? "Incident Commander"}\n\nBefore declaring the incident resolved, ALL of the following criteria must be met. Do not close the incident if any item is failing or unclear.` },
    { type: "heading", level: 2, text: "Resolution Criteria Checklist" },
    { type: "checklist_item", text: `Health endpoint returns 200 OK: \`curl -I https://${incident.affected_ci}/health\`` },
    { type: "checklist_item", text: `Synthetic monitor for '${incident.affected_service}' is GREEN (check your monitoring tool)` },
    { type: "checklist_item", text: "Error rate has returned to pre-incident baseline (check APM dashboard)" },
    { type: "checklist_item", text: "P99 latency has returned to normal range" },
    { type: "checklist_item", text: "Customer-facing checkout / primary user flow is functioning end-to-end" },
    { type: "checklist_item", text: "Alerting rules are no longer firing" },
    { type: "checklist_item", text: "On-call engineer has monitored for 10 minutes with no re-trigger" },
    { type: "checklist_item", text: "Business stakeholder (Customer Impact Lead) has confirmed no open customer complaints" },
    { type: "heading", level: 2, text: "Severity Downgrade Criteria" },
    {
      type: "table",
      rows: [
        ["Condition", "Action"],
        ["All health checks pass, no customer impact, stable for 10 min", "Downgrade to Sev2 and continue monitoring"],
        ["Partial restoration (some customers still affected)", "Downgrade to Sev2, keep bridge open, continue investigation"],
        ["Workaround in place (not fully resolved)", "Downgrade to Sev2, open follow-up task for permanent fix"],
      ],
    },
    { type: "heading", level: 2, text: "Closing the Bridge" },
    {
      type: "numbered_step", stepNumber: 1,
      text: "Announce in the Zoom bridge: \"Service is restored. All health checks passing. We are closing the bridge. Thank you everyone.\"",
    },
    {
      type: "numbered_step", stepNumber: 2,
      text: `Post in Slack channel ${incident.number.toLowerCase().replace(/inc/, "#inc")}:\n\n\`\`\`\n✅ INCIDENT RESOLVED: ${incident.number}\nService: ${incident.affected_service}\nResolved At: [TIMESTAMP UTC]\nDuration: [X hours Y minutes]\nRoot Cause (preliminary): [ROOT_CAUSE_HYPOTHESIS]\nAction Taken: [SUMMARY_OF_FIX]\nNext Steps: PIR to be scheduled within 5 business days\n\`\`\``,
    },
    {
      type: "numbered_step", stepNumber: 3,
      text: "Send the Service Restored email (Template 5 in Section 3).",
    },
    {
      type: "numbered_step", stepNumber: 4,
      text: "Stand down all escalated stakeholders — send personal message or call to confirm they know the incident is over.",
    },
  ];

  return { sectionNumber: 7, title: "Resolution & Validation", blocks };
}

// ============================================================
// Section 8: Post-Incident Handoff
// ============================================================

function buildSection8(
  incident: Incident,
  ic: Stakeholder | null,
  commsLead: Stakeholder | null,
  addAction: AddActionFn
): RunbookSection {
  addAction("Resolution", "Update ServiceNow incident ticket with timeline and resolution", ic?.name ?? "IC", ic?.team ?? "Operations", "P2", "T+30 post-fix");
  addAction("Resolution", "Create PIR ticket and schedule PIR meeting", ic?.name ?? "IC", ic?.team ?? "Operations", "P2", "T+2 days");
  addAction("Resolution", "Send PIR invitation email (Template 6)", commsLead?.name ?? "Comms Lead", commsLead?.team ?? "Communications", "P2", "T+1 day");

  const blocks: RunbookBlock[] = [
    { type: "paragraph", text: `**Owner**: ${ic?.name ?? "Incident Commander"}\n\nComplete this section before closing ${incident.number} in ServiceNow. A well-documented post-incident record prevents the same incident from happening again.` },
    { type: "heading", level: 2, text: "Documentation Before Closing" },
    { type: "checklist_item", text: "Complete timeline of events documented (use Slack channel history + Excel Timeline sheet)" },
    { type: "checklist_item", text: "All containment actions documented with exact timestamps and who performed them" },
    { type: "checklist_item", text: "Root cause hypothesis documented (even if unconfirmed — note confidence level)" },
    { type: "checklist_item", text: "Customer impact quantified (number of users, duration, business cost)" },
    { type: "checklist_item", text: "Any temporary workarounds noted with follow-up tasks created" },
    { type: "checklist_item", text: "All follow-up Jira/ticket items created and assigned with due dates" },
    { type: "heading", level: 2, text: "ServiceNow Resolution Update" },
    {
      type: "paragraph",
      text: `Update ticket **${incident.number}** in ServiceNow with the following information:\n\n**Resolution Notes Template**:`,
    },
    {
      type: "command",
      text: `RESOLUTION NOTES — ${incident.number}

Incident opened: [OPENED_TIMESTAMP]
Service restored: [RESOLVED_TIMESTAMP]
Total duration: [X hours Y minutes]

Root Cause (Preliminary):
[DESCRIBE THE ROOT CAUSE - be specific, not generic. E.g., "Oracle RAC node prod-oracle-01 crashed due to ORA-04031 (shared pool memory exhaustion) triggered by an unoptimized query deployed in release v2.4.1 at 13:45 UTC"]

Containment Actions Taken:
1. [TIMESTAMP] [ACTION] — performed by [NAME]
2. [TIMESTAMP] [ACTION] — performed by [NAME]

Customer Impact:
- Duration of impact: [X hours Y minutes]
- Services affected: [LIST]
- Estimated users impacted: [NUMBER]

Follow-up Actions (link to tickets):
- [JIRA-XXX]: Root cause investigation
- [JIRA-XXX]: Monitoring/alerting improvements
- [JIRA-XXX]: Process improvements

PIR scheduled: [DATE] [TIME] with [ATTENDEES]`,
    },
    { type: "heading", level: 2, text: "Post-Incident Review (PIR) Ticket" },
    { type: "paragraph", text: "Raise a PIR ticket (Problem record in ServiceNow) within 24 hours of resolution. Use the template below:" },
    {
      type: "command",
      text: `PIR TICKET — ${incident.number}

Title: PIR: ${incident.title}
Category: Problem Management
Priority: 2 - High
Assigned To: ${ic?.name ?? "[INCIDENT COMMANDER]"}

Description:
Post-Incident Review for ${incident.number} — ${incident.title}

Incident Summary:
- Severity: ${incident.severity}
- Affected Service: ${incident.affected_service}
- Detected: [TIMESTAMP]
- Resolved: [TIMESTAMP]
- Duration: [X hours Y minutes]
- Impact: ${incident.business_impact}

Review Meeting:
- Date: [PIR_DATE] (within 5 business days)
- Duration: 60 minutes
- Attendees: ${ic?.name ?? "[IC]"}, [TECH_LEAD], [COMMS_LEAD], [AFFECTED_TEAM_LEADS]

Agenda:
1. Timeline walkthrough (15 min)
2. Root cause analysis (20 min)
3. What went well (10 min)
4. What to improve (10 min)
5. Action items (5 min)

Pre-reads:
- This runbook: [LINK]
- Incident timeline (Excel Sheet 3): [LINK]
- Monitoring dashboard screenshots: [LINK]`,
    },
    { type: "heading", level: 2, text: "ServiceNow Ticket Closure Checklist" },
    { type: "checklist_item", text: `Set State to "Resolved"` },
    { type: "checklist_item", text: "Set Close Code to appropriate category (e.g., 'Software', 'Infrastructure', 'User Error')" },
    { type: "checklist_item", text: "Fill in Resolution Notes (use template above)" },
    { type: "checklist_item", text: "Link PIR Problem ticket in the Related Problems field" },
    { type: "checklist_item", text: "Attach this runbook (.docx) and the action tracker (.xlsx) to the ticket" },
    { type: "checklist_item", text: "Send Template 6 (PIR Invitation email) to all stakeholders" },
    { type: "checklist_item", text: "Archive the Slack incident channel (do NOT delete — retain for audit)" },
  ];

  return { sectionNumber: 8, title: "Post-Incident Handoff", blocks };
}

// ============================================================
// Email Templates
// ============================================================

function buildEmailTemplates(
  incident: Incident,
  stakeholders: Stakeholder[],
  ic: Stakeholder | null,
  commsLead: Stakeholder | null,
  zoomUrl: string,
  slackChannel: string
): EmailTemplate[] {
  const immediate = stakeholders.filter((s) => s.notify_immediately || s.escalation_level === 1);
  const level2 = stakeholders.filter((s) => s.escalation_level === 2);
  const level3 = stakeholders.filter((s) => s.escalation_level === 3);
  const allStakeholders = stakeholders;

  const toImmediate = immediate.map((s) => s.email);
  const ccLevel2 = level2.map((s) => s.email);
  const toLevel2 = level2.map((s) => s.email);
  const ccLevel3 = level3.map((s) => s.email);
  const toAll = allStakeholders.map((s) => s.email);

  const detectedAt = incident.detected_at ?? incident.opened_at;

  return [
    {
      phase: "Initial Incident Notification",
      timing: "T+0 (send immediately upon declaring Sev1)",
      to: toImmediate,
      cc: ccLevel2,
      subject: `[SEV1 — ACTIVE] ${incident.number}: ${incident.affected_service} — ${incident.title}`,
      colorBand: "red",
      body: `Team,

We are declaring a Severity 1 incident affecting ${incident.affected_service}.

INCIDENT DETAILS
================
Incident Number : ${incident.number}
Severity        : ${incident.severity}
Priority        : ${incident.priority}
Affected Service: ${incident.affected_service}
Affected CI     : ${incident.affected_ci}
Environment     : ${incident.environment}${incident.region ? ` (${incident.region})` : ""}
Detected At     : ${formatTimestamp(detectedAt)} UTC
Incident Commander: ${ic?.name ?? "[INCIDENT COMMANDER]"} — ${ic?.phone ?? "[PHONE]"}

BUSINESS IMPACT
===============
${incident.business_impact}

CURRENT STATUS
==============
We have declared a Sev1 and are mobilising the response team. Investigation is starting now.

WAR ROOM
========
Zoom Bridge : ${zoomUrl}
Slack Channel: ${slackChannel}

All Level 1 stakeholders, please join the bridge immediately.

Next update: T+30 minutes or sooner if there is a significant development.

-- ${commsLead?.name ?? "Incident Response Team"}`,
    },
    {
      phase: "War Room / Bridge Established",
      timing: "T+5 (once bridge call is open and team is assembling)",
      to: toImmediate,
      cc: ccLevel2,
      subject: `[SEV1 — WAR ROOM OPEN] ${incident.number}: Bridge call is live — join now`,
      colorBand: "red",
      body: `Team,

The incident bridge for ${incident.number} is now active.

BRIDGE DETAILS
==============
Zoom URL  : ${zoomUrl}
Dial-In   : ${ic?.bridge_phone ?? "[DIAL-IN NUMBER + PIN]"}
Slack     : ${slackChannel}

ON THE CALL NOW
===============
${ic?.name ?? "[INCIDENT COMMANDER]"} — Incident Commander
[NAMES OF ENGINEERS ON CALL — update as people join]

CURRENT WORKING HYPOTHESIS
===========================
[UPDATE THIS — e.g., "We believe the Oracle cluster primary node has crashed. Investigating logs now."]

WHO WE NEED
===========
If you are a ${incident.assignment_group} engineer and are NOT on the call, please join immediately.

Next update: T+30 minutes.

-- ${commsLead?.name ?? ic?.name ?? "Incident Response Team"}`,
    },
    {
      phase: "30-Minute Status Update",
      timing: "T+30 (and every 30 minutes thereafter until resolved)",
      to: [...toImmediate, ...toLevel2],
      cc: ccLevel3,
      subject: `[SEV1 — T+[ELAPSED]MIN UPDATE] ${incident.number}: Status Update — [CURRENT_STATUS_HEADLINE]`,
      colorBand: "amber",
      body: `Team,

Status update for ${incident.number} as of [CURRENT_TIME] UTC (T+[ELAPSED] minutes).

CURRENT STATUS
==============
[REPLACE WITH: "Investigating" / "Root cause identified" / "Mitigation in progress" / "Monitoring after fix"]

ACTIONS TAKEN SO FAR
====================
[TIMESTAMP] [ACTION TAKEN] — [NAME]
[TIMESTAMP] [ACTION TAKEN] — [NAME]
[ADD MORE ROWS AS NEEDED]

CURRENT WORKING HYPOTHESIS
===========================
[REPLACE WITH YOUR CURRENT ROOT CAUSE HYPOTHESIS AND CONFIDENCE LEVEL]

NEXT STEPS
==========
[ACTION 1] — Owner: [NAME], ETA: [TIME]
[ACTION 2] — Owner: [NAME], ETA: [TIME]

ESTIMATED RESOLUTION
====================
[PROVIDE AN ETA OR STATE "ETA UNKNOWN — next update in 30 minutes"]

Bridge is still active: ${zoomUrl}
Slack: ${slackChannel}

-- ${commsLead?.name ?? "Incident Response Team"}`,
    },
    {
      phase: "Mitigation In Progress",
      timing: "T+[X] (send when a containment action is being executed)",
      to: [...toImmediate, ...toLevel2],
      cc: ccLevel3,
      subject: `[SEV1 — MITIGATION ACTIVE] ${incident.number}: Containment action underway for ${incident.affected_service}`,
      colorBand: "amber",
      body: `Team,

We are now executing a containment action for ${incident.number}.

CONTAINMENT ACTION
==================
Action         : [DESCRIBE THE ACTION, e.g., "Failing over Oracle cluster to standby node"]
Executed By    : [NAME]
Start Time     : [TIMESTAMP] UTC
Expected Impact: [e.g., "Brief 30-60 second connection interruption during failover"]
Expected ETA   : Service should begin recovering within [X] minutes

RISK ASSESSMENT
===============
Risk Level  : [High / Medium / Low]
Rollback Plan: [HOW TO ROLL BACK IF THIS ACTION MAKES THINGS WORSE]

IF THIS ACTION FAILS
====================
Escalation to: ${level2.map((s) => s.name).join(", ") || "[LEVEL 2 CONTACTS]"}
Vendor support: [VENDOR_NAME] — open ticket at [SUPPORT_URL]

We will send a follow-up update within 15 minutes of execution.

Bridge: ${zoomUrl}
Slack: ${slackChannel}

-- ${commsLead?.name ?? ic?.name ?? "Incident Response Team"}`,
    },
    {
      phase: "Service Restored",
      timing: "T+[X] (send within 10 minutes of confirming service is restored)",
      to: toAll,
      cc: [],
      subject: `[SEV1 — RESOLVED ✅] ${incident.number}: ${incident.affected_service} has been restored`,
      colorBand: "green",
      body: `Team,

${incident.affected_service} has been restored.

RESOLUTION SUMMARY
==================
Incident Number  : ${incident.number}
Affected Service : ${incident.affected_service}
Incident Opened  : ${formatTimestamp(detectedAt)} UTC
Service Restored : [RESOLVED_TIMESTAMP] UTC
Total Duration   : [X hours Y minutes]

ROOT CAUSE (PRELIMINARY)
========================
[REPLACE WITH ROOT CAUSE SUMMARY — 2-3 sentences. E.g., "An Oracle RAC primary node failure caused by shared pool memory exhaustion triggered by a runaway query introduced in release v2.4.1 (deployed at 13:45 UTC). Failover to the standby node restored service."]

REMEDIATION APPLIED
===================
[ACTION 1 — e.g., "Failover to Oracle standby node prod-oracle-02 at [TIME] UTC"]
[ACTION 2 — e.g., "Runaway query identified and index added to prevent recurrence"]

MONITORING STATUS
=================
✅ Synthetic monitor: GREEN
✅ Error rate: Within normal range
✅ P99 latency: Normal
✅ Customer-facing checkout: Functioning

NEXT STEPS
==========
1. Post-Incident Review (PIR) will be scheduled within 5 business days
2. Root cause analysis in progress
3. Monitoring continues for the next 2 hours

Thank you to everyone who responded — especially ${ic?.name ?? "the Incident Commander"} and ${incident.assignment_group}.

Full runbook and action log attached.

-- ${commsLead?.name ?? ic?.name ?? "Incident Response Team"}`,
    },
    {
      phase: "Incident Closed + PIR Invitation",
      timing: "T+24h (within 24 hours of resolution, once PIR is scheduled)",
      to: [...toImmediate, ...toLevel2],
      cc: ccLevel3,
      subject: `[${incident.number} CLOSED] Post-Incident Review scheduled — ${incident.title}`,
      colorBand: "navy",
      body: `Team,

${incident.number} has been formally closed. The Post-Incident Review (PIR) has been scheduled.

INCIDENT SUMMARY
================
Incident : ${incident.number}
Service  : ${incident.affected_service}
Severity : ${incident.severity}
Duration : [X hours Y minutes]
Customers Affected: [NUMBER / PERCENTAGE]
Business Impact: ${incident.business_impact}

PIR DETAILS
===========
Date    : [PIR_DATE]
Time    : [PIR_TIME] UTC
Duration: 60 minutes
Link    : [ZOOM_OR_CALENDAR_LINK]

Attendees (required):
${ic?.name ?? "[INCIDENT COMMANDER]"} — Incident Commander
[TECHNICAL LEAD NAME]
[COMMS LEAD NAME]
[ADD OTHER KEY RESPONDERS]

PRE-READ MATERIALS
==================
Please review these before the PIR:
1. Incident runbook: [LINK TO .docx]
2. Action tracker / timeline: [LINK TO .xlsx]
3. Preliminary root cause document: [LINK]

PIR AGENDA
==========
1. Timeline walkthrough (15 min)
2. Root cause deep dive (20 min)
3. What went well (10 min)
4. What to improve (10 min)
5. Action item assignment (5 min)

If you cannot attend, please send your notes to ${ic?.email ?? "[IC_EMAIL]"} before the meeting.

-- ${commsLead?.name ?? ic?.name ?? "Incident Response Team"}`,
    },
  ];
}

// ============================================================
// Escalation Entries Builder
// ============================================================

function buildEscalationEntries(stakeholders: Stakeholder[]): EscalationEntry[] {
  return stakeholders.map((s, i) => ({
    id: `ESC-${String(i + 1).padStart(3, "0")}`,
    contactName: s.name,
    role: s.role,
    method: s.notify_immediately ? "Phone + Slack + Email" : "Slack + Email",
  }));
}

// ============================================================
// Helpers
// ============================================================

function findByRole(stakeholders: Stakeholder[], roleKeyword: string): Stakeholder | null {
  return (
    stakeholders.find((s) =>
      s.role.toLowerCase().includes(roleKeyword.toLowerCase())
    ) ?? null
  );
}

function getStakeholdersByLevel(
  level: number,
  immediateOnly: boolean,
  stakeholders: Stakeholder[]
): Stakeholder[] {
  return stakeholders.filter(
    (s) => s.escalation_level === level && (!immediateOnly || s.notify_immediately)
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch {
    return iso;
  }
}

type AddActionFn = (
  phase: ActionItem["phase"],
  action: string,
  owner: string,
  team: string,
  priority: ActionItem["priority"],
  targetBy: string,
  notes?: string
) => void;

// ============================================================
// Markdown Export (for saving .md file)
// ============================================================

export function runbookToMarkdown(rb: RunbookOutput): string {
  const lines: string[] = [];

  lines.push(`# Major Incident Runbook — ${rb.incident.number}`);
  lines.push(`> Generated: ${new Date(rb.generatedAt).toUTCString()}`);
  lines.push(`> Incident Commander: ${rb.incidentCommander?.name ?? "TBD"}`);
  lines.push("");

  for (const section of rb.sections) {
    lines.push(`---`);
    lines.push(`## ${section.sectionNumber}. ${section.title}`);
    lines.push("");

    for (const block of section.blocks) {
      lines.push(...blockToMarkdown(block, rb));
      lines.push("");
    }
  }

  return lines.join("\n");
}

function blockToMarkdown(block: RunbookBlock, rb: RunbookOutput): string[] {
  switch (block.type) {
    case "heading":
      return [`${"#".repeat((block.level ?? 2) + 1)} ${block.text}`];

    case "paragraph":
      return [block.text ?? ""];

    case "numbered_step":
      return [
        `**Step ${block.stepNumber}:** ${block.text ?? ""}`,
      ];

    case "checklist_item":
      return [`- [ ] ${block.text}`];

    case "bullet":
      return (block.items ?? []).map((item) => `- ${item}`);

    case "command":
      return ["```", block.text ?? "", "```"];

    case "table": {
      const rows = block.rows ?? [];
      if (rows.length === 0) return [];
      const result: string[] = [];
      result.push("| " + rows[0].join(" | ") + " |");
      result.push("| " + rows[0].map(() => "---").join(" | ") + " |");
      for (let i = 1; i < rows.length; i++) {
        result.push("| " + rows[i].join(" | ") + " |");
      }
      return result;
    }

    case "decision_tree": {
      const result: string[] = [`**${block.condition}**`, ""];
      for (const branch of block.branches ?? []) {
        result.push(`- If **${branch.condition}** → ${branch.action}`);
      }
      return result;
    }

    case "alert_box": {
      const icon = block.alertLevel === "critical" ? "🔴" : block.alertLevel === "warning" ? "🟡" : "🔵";
      return [`> ${icon} **${(block.alertLevel ?? "info").toUpperCase()}**: ${block.text}`];
    }

    case "email_template": {
      const t = block.emailTemplate;
      if (!t) return [];

      // Inline stakeholder data for triage table
      const lines: string[] = [];
      lines.push(`### 📧 Email Template ${t.phase} (${t.timing})`);
      lines.push(`**Subject**: \`${t.subject}\``);
      lines.push(`**To**: ${t.to.join("; ")}`);
      if (t.cc.length > 0) lines.push(`**CC**: ${t.cc.join("; ")}`);
      lines.push("");
      lines.push("```");
      lines.push(t.body);
      lines.push("```");
      return lines;
    }

    default:
      return [block.text ?? ""];
  }
}

// Inline stakeholder table into Section 2
function resolveStakeholderTable(rb: RunbookOutput): RunbookBlock {
  const ic = rb.incidentCommander;
  const techLead = rb.technicalLead;
  const commsLead = rb.commsLead;
  const bridgeHolder = rb.stakeholders.find((s) => s.bridge_url) ?? ic;

  return {
    type: "table",
    rows: [
      ["Name", "Role", "Slack", "Phone"],
      ...(rb.stakeholders
        .filter((s) => s.notify_immediately || s.escalation_level === 1)
        .map((s) => [s.name, s.role, s.slack, s.phone])),
    ],
  };
}
