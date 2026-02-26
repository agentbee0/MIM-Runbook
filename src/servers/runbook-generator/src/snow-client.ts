/**
 * snow-client.ts — Phase 2: ServiceNow REST API Client
 *
 * Provides fetch/update operations for ServiceNow incidents via the Table API v1.
 * Supports Basic Auth and Bearer (OAuth) token authentication.
 *
 * ServiceNow Table API base: https://{instance}.service-now.com/api/now/table/
 */

import type { SnowConfig, SnowIncidentRecord, Incident, Stakeholder, VendorEscalation, StakeholdersFile } from "./types.js";
import yaml from "js-yaml";

// ============================================================
// State/Priority/Severity code maps
// ============================================================

const STATE_MAP: Record<string, string> = {
  "1": "New",
  "2": "In Progress",
  "3": "On Hold",
  "4": "Awaiting User Info",
  "5": "Awaiting Evidence",
  "6": "Resolved",
  "7": "Closed",
};

const PRIORITY_MAP: Record<string, string> = {
  "1": "1 - Critical",
  "2": "2 - High",
  "3": "3 - Moderate",
  "4": "4 - Low",
  "5": "5 - Planning",
};

const IMPACT_MAP: Record<string, string> = {
  "1": "High",
  "2": "Medium",
  "3": "Low",
};

// ============================================================
// Auth header builder
// ============================================================

function buildAuthHeader(config: SnowConfig): string {
  if (config.authType === "bearer") {
    if (!config.bearerToken) throw new Error("bearerToken is required when authType is 'bearer'");
    return `Bearer ${config.bearerToken}`;
  }
  if (!config.username || !config.password) {
    throw new Error("username and password are required when authType is 'basic'");
  }
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
}

function buildHeaders(config: SnowConfig): Record<string, string> {
  return {
    Authorization: buildAuthHeader(config),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ============================================================
// Fetch incident by number
// ============================================================

export async function fetchSnowIncident(
  config: SnowConfig,
  incidentNumber: string
): Promise<{ incident_yaml: string; raw: SnowIncidentRecord }> {
  const url = new URL(`https://${config.instance}/api/now/table/incident`);
  url.searchParams.set("sysparm_query", `number=${incidentNumber}`);
  url.searchParams.set("sysparm_limit", "1");
  url.searchParams.set(
    "sysparm_fields",
    "sys_id,number,short_description,description,priority,severity,state,category,subcategory," +
      "assigned_to,assignment_group,cmdb_ci,business_service,impact,urgency,caller_id,opened_at," +
      "business_impact,change_request,related_incidents"
  );
  url.searchParams.set("sysparm_display_value", "all");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(config),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ServiceNow API error ${response.status}: ${errorText}`);
  }

  const body = await response.json() as { result: SnowIncidentRecord[] };
  if (!body.result || body.result.length === 0) {
    throw new Error(`No incident found with number: ${incidentNumber}`);
  }

  const raw = body.result[0];
  const incident = mapSnowRecordToIncident(raw);
  const incident_yaml = yaml.dump({ incident });

  return { incident_yaml, raw };
}

// ============================================================
// Fetch stakeholders for an assignment group
// ============================================================

export async function fetchSnowStakeholders(
  config: SnowConfig,
  assignmentGroup: string
): Promise<{ stakeholders_yaml: string }> {
  // Step 1: Find the group sys_id
  const groupUrl = new URL(`https://${config.instance}/api/now/table/sys_user_group`);
  groupUrl.searchParams.set("sysparm_query", `name=${encodeURIComponent(assignmentGroup)}`);
  groupUrl.searchParams.set("sysparm_limit", "1");
  groupUrl.searchParams.set("sysparm_fields", "sys_id,name,manager");

  const groupResp = await fetch(groupUrl.toString(), { headers: buildHeaders(config) });
  if (!groupResp.ok) throw new Error(`Failed to fetch group: ${groupResp.status}`);

  const groupBody = await groupResp.json() as { result: { sys_id: string; name: string; manager: { display_value: string } }[] };
  const group = groupBody.result[0];
  if (!group) throw new Error(`Group '${assignmentGroup}' not found in ServiceNow`);

  // Step 2: Fetch group members
  const membersUrl = new URL(`https://${config.instance}/api/now/table/sys_user_grmember`);
  membersUrl.searchParams.set("sysparm_query", `group=${group.sys_id}`);
  membersUrl.searchParams.set("sysparm_limit", "20");
  membersUrl.searchParams.set("sysparm_fields", "user.sys_id,user.name,user.email,user.phone,user.title,user.department");
  membersUrl.searchParams.set("sysparm_display_value", "all");

  const membersResp = await fetch(membersUrl.toString(), { headers: buildHeaders(config) });
  if (!membersResp.ok) throw new Error(`Failed to fetch group members: ${membersResp.status}`);

  const membersBody = await membersResp.json() as {
    result: { user: { display_value: string; value: string }; "user.email"?: { display_value: string }; "user.phone"?: { display_value: string }; "user.title"?: { display_value: string } }[]
  };

  const stakeholders: Stakeholder[] = membersBody.result.slice(0, 6).map((m, i) => ({
    name: m.user?.display_value ?? `Member ${i + 1}`,
    role: i === 0 ? "Incident Commander" : i === 1 ? "Technical Lead" : "On-Call Engineer",
    title: "[FILL IN]",
    team: assignmentGroup,
    email: `[${m.user?.display_value?.toLowerCase().replace(/\s+/g, ".")  ?? "user"}@company.com]`,
    phone: "[FILL IN]",
    slack: `@${m.user?.display_value?.toLowerCase().replace(/\s+/g, ".") ?? "user"}`,
    escalation_level: i < 2 ? 1 : 2,
    notify_immediately: i < 2,
  }));

  const stakeholdersFile: StakeholdersFile = {
    stakeholders,
    vendor_escalations: [],
  };

  return { stakeholders_yaml: yaml.dump(stakeholdersFile) };
}

// ============================================================
// Update incident with work notes
// ============================================================

export async function updateSnowIncident(
  config: SnowConfig,
  sysId: string,
  workNotes: string,
  runbookUrl?: string
): Promise<{ success: boolean; updatedFields: string[] }> {
  const url = `https://${config.instance}/api/now/table/incident/${sysId}`;

  const payload: Record<string, string> = {
    work_notes: runbookUrl
      ? `${workNotes}\n\nRunbook: ${runbookUrl}`
      : workNotes,
  };

  const response = await fetch(url, {
    method: "PATCH",
    headers: buildHeaders(config),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update incident: ${response.status} — ${errorText}`);
  }

  return { success: true, updatedFields: Object.keys(payload) };
}

// ============================================================
// Create PIR ticket (Problem record)
// ============================================================

export async function createSnowPirTicket(
  config: SnowConfig,
  parentIncidentNumber: string,
  pirData: {
    title: string;
    description: string;
    assignedTo?: string;
    assignmentGroup?: string;
  }
): Promise<{ success: boolean; pir_number: string; sys_id: string }> {
  const url = `https://${config.instance}/api/now/table/problem`;

  const payload = {
    short_description: `PIR: ${pirData.title}`,
    description: pirData.description,
    problem_state: "1",           // 1 = Open
    priority: "2",                // High
    impact: "1",
    urgency: "2",
    cause_notes: `Related to incident: ${parentIncidentNumber}`,
    assigned_to: pirData.assignedTo ?? "",
    assignment_group: pirData.assignmentGroup ?? "",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create PIR ticket: ${response.status} — ${errorText}`);
  }

  const body = await response.json() as { result: { number: string; sys_id: string } };
  return {
    success: true,
    pir_number: body.result.number,
    sys_id: body.result.sys_id,
  };
}

// ============================================================
// Map SNOW record to internal Incident type
// ============================================================

function mapSnowRecordToIncident(r: SnowIncidentRecord): Incident {
  const priorityValue = typeof r.priority === "object" ? r.priority.value : String(r.priority);
  const severityValue = typeof r.severity === "object" ? r.severity.value : String(r.severity);
  const stateValue = typeof r.state === "object" ? r.state.value : String(r.state);

  return {
    number: r.number,
    title: r.short_description,
    severity: PRIORITY_MAP[severityValue] ?? `${severityValue} - Unknown`,
    priority: PRIORITY_MAP[priorityValue] ?? `${priorityValue} - Unknown`,
    state: STATE_MAP[stateValue] ?? stateValue,
    category: getCiString(r.category),
    subcategory: getCiString(r.subcategory),
    affected_service: getCiString(r.business_service) || "[Unknown Service]",
    affected_ci: getCiString(r.cmdb_ci) || "[Unknown CI]",
    environment: "Production",
    business_impact: getCiString(r.business_impact) || `${IMPACT_MAP[getCiString(r.impact)] ?? "High"} impact — ${r.short_description}`,
    opened_at: getCiString(r.opened_at),
    assigned_to: getCiString(r.assigned_to),
    assignment_group: getCiString(r.assignment_group),
    caller_id: getCiString(r.caller_id),
    short_description: r.short_description,
    description: getCiString(r.description),
    change_related: false,
    related_incident: "",
    resolution_notes: "",
    close_code: "",
  };
}

function getCiString(field: unknown): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object" && field !== null) {
    const f = field as { display_value?: string; value?: string };
    return f.display_value ?? f.value ?? "";
  }
  return String(field);
}
