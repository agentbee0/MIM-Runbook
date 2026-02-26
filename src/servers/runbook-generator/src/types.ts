import { z } from "zod";

// ============================================================
// Incident Schema
// ============================================================

export const IncidentSchema = z.object({
  number: z.string().describe("Incident number, e.g. INC0078342"),
  title: z.string().describe("Full incident title / short description"),
  severity: z.string().describe("Severity label, e.g. '1 - Critical'"),
  priority: z.string().describe("Priority label, e.g. '1 - Critical'"),
  state: z.string().describe("Current state, e.g. 'In Progress'"),
  category: z.string().describe("Category: Database | Network | Application | Cloud/Infra | Security | Other"),
  subcategory: z.string().describe("Subcategory for more specific routing"),
  affected_service: z.string().describe("Business service affected, e.g. 'E-Commerce Customer Portal'"),
  affected_ci: z.string().describe("Configuration Item hostname/name, e.g. 'prod-oracle-cluster-01'"),
  environment: z.string().describe("Environment, e.g. 'Production'"),
  region: z.string().optional().describe("Cloud/DC region, e.g. 'us-east-1'"),
  business_impact: z.string().describe("Human-readable business impact statement"),
  opened_at: z.string().describe("ISO 8601 timestamp when incident was opened"),
  detected_at: z.string().optional().describe("ISO 8601 timestamp when issue was first detected"),
  assigned_to: z.string().describe("Name or ID of the assigned engineer"),
  assignment_group: z.string().describe("Name of the owning team/group"),
  caller_id: z.string().describe("Who raised / reported the incident"),
  short_description: z.string().describe("One-line summary"),
  description: z.string().describe("Full incident description with symptoms and context"),
  change_related: z.boolean().optional().default(false),
  related_incident: z.string().optional().default(""),
  resolution_notes: z.string().optional().default(""),
  close_code: z.string().optional().default(""),
});

export type Incident = z.infer<typeof IncidentSchema>;

// ============================================================
// Stakeholder Schema
// ============================================================

export const StakeholderSchema = z.object({
  name: z.string(),
  role: z.string().describe(
    "Role during incident: Incident Commander | Technical Lead | Communications Lead | " +
    "Customer Impact Lead | Executive Sponsor | Bridge Coordinator | On-Call Engineer"
  ),
  title: z.string().describe("Job title"),
  team: z.string().describe("Team or department name"),
  email: z.string().email().describe("Email address"),
  phone: z.string().describe("Phone number including country code"),
  slack: z.string().describe("Slack handle, e.g. @username"),
  escalation_level: z.number().min(1).max(3).describe("1=immediate notify, 2=T+30, 3=T+60+"),
  notify_immediately: z.boolean().default(false),
  bridge_url: z.string().optional().describe("Zoom or Teams meeting URL"),
  bridge_phone: z.string().optional().describe("Bridge dial-in number + PIN"),
});

export type Stakeholder = z.infer<typeof StakeholderSchema>;

export const VendorEscalationSchema = z.object({
  vendor: z.string(),
  account_number: z.string(),
  support_url: z.string(),
  phone: z.string(),
  severity_mapping: z.string().describe("How to declare severity to this vendor, e.g. 'SEV1', 'P1'"),
});

export type VendorEscalation = z.infer<typeof VendorEscalationSchema>;

export const StakeholdersFileSchema = z.object({
  stakeholders: z.array(StakeholderSchema),
  vendor_escalations: z.array(VendorEscalationSchema).optional().default([]),
});

export type StakeholdersFile = z.infer<typeof StakeholdersFileSchema>;

export const IncidentFileSchema = z.object({
  incident: IncidentSchema,
});

export type IncidentFile = z.infer<typeof IncidentFileSchema>;

// ============================================================
// Runbook Internal Representation
// ============================================================

export type RunbookBlockType =
  | "heading"
  | "paragraph"
  | "checklist_item"
  | "numbered_step"
  | "command"
  | "table"
  | "decision_tree"
  | "email_template"
  | "alert_box"
  | "bullet";

export interface RunbookBlock {
  type: RunbookBlockType;
  level?: number;               // heading level 1-3
  text?: string;                // primary text content
  checked?: boolean;            // for checklist_item
  stepNumber?: number;          // for numbered_step
  rows?: string[][];            // for table (first row = header)
  condition?: string;           // for decision_tree: "If X..."
  branches?: { condition: string; action: string }[];
  emailTemplate?: EmailTemplate;
  alertLevel?: "info" | "warning" | "critical"; // for alert_box
  items?: string[];             // for bullet list items
}

export interface EmailTemplate {
  phase: string;                // "Initial Notification" | "War Room Open" | etc.
  timing: string;               // "T+0" | "T+5" | "T+30 (repeat)" | etc.
  to: string[];                 // email addresses
  cc: string[];
  subject: string;
  body: string;
  colorBand: "red" | "amber" | "teal" | "green" | "navy";
}

export interface RunbookSection {
  sectionNumber: number;
  title: string;
  blocks: RunbookBlock[];
}

export interface ActionItem {
  id: string;                   // "ACT-001"
  phase: string;                // "Triage" | "Comms" | "Diagnosis" | "Containment" | "Resolution"
  action: string;
  owner: string;
  team: string;
  priority: "P1" | "P2" | "P3";
  status: "Open";
  targetBy: string;             // "T+5" | "T+15" | "T+30" etc.
  notes: string;
}

export interface EscalationEntry {
  id: string;
  contactName: string;
  role: string;
  method: string;
}

export interface RunbookOutput {
  incident: Incident;
  stakeholders: Stakeholder[];
  vendors: VendorEscalation[];
  sections: RunbookSection[];
  emailTemplates: EmailTemplate[];
  actionItems: ActionItem[];
  escalationEntries: EscalationEntry[];
  generatedAt: string;
  slackChannel: string;
  zoomUrl: string;
  incidentCommander: Stakeholder | null;
  technicalLead: Stakeholder | null;
  commsLead: Stakeholder | null;
}

// ============================================================
// ServiceNow Types (Phase 2)
// ============================================================

export interface SnowIncidentRecord {
  sys_id: string;
  number: string;
  short_description: string;
  description: { value: string };
  priority: { value: string; display_value: string };
  severity: { value: string; display_value: string };
  state: { value: string; display_value: string };
  category: { value: string; display_value: string };
  subcategory: { value: string; display_value: string };
  assigned_to: { value: string; display_value: string };
  assignment_group: { value: string; display_value: string };
  cmdb_ci: { value: string; display_value: string };
  business_service: { value: string; display_value: string };
  impact: { value: string; display_value: string };
  urgency: { value: string; display_value: string };
  caller_id: { value: string; display_value: string };
  opened_at: { value: string; display_value: string };
  business_impact?: { value: string };
}

export interface SnowConfig {
  instance: string;
  authType: "basic" | "bearer";
  username?: string;
  password?: string;
  bearerToken?: string;
}

// ============================================================
// Tool Input/Output Types
// ============================================================

export interface GenerateRunbookInput {
  incident_yaml: string;
  stakeholders_yaml: string;
  output_dir?: string;
}

export interface GenerateRunbookOutput {
  success: boolean;
  incidentNumber?: string;
  markdownPath?: string;
  docxPath?: string;
  xlsxPath?: string;
  sectionCount?: number;
  actionItemCount?: number;
  error?: string;
}

export interface ValidateYamlOutput {
  valid: boolean;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
}
