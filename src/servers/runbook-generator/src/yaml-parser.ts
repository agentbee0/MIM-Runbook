import yaml from "js-yaml";
import {
  IncidentFileSchema,
  StakeholdersFileSchema,
  type Incident,
  type StakeholdersFile,
  type ValidateYamlOutput,
} from "./types.js";
import { ZodError } from "zod";

export function parseYaml(content: string): unknown {
  return yaml.load(content);
}

export function parseIncidentYaml(yamlContent: string): {
  data?: Incident;
  errors: ValidateYamlOutput["errors"];
  warnings: ValidateYamlOutput["warnings"];
} {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (e) {
    return {
      errors: [{ field: "yaml", message: `YAML syntax error: ${(e as Error).message}` }],
      warnings: [],
    };
  }

  const result = IncidentFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      errors: formatZodErrors(result.error),
      warnings: [],
    };
  }

  const warnings = validateIncidentWarnings(result.data.incident);
  return { data: result.data.incident, errors: [], warnings };
}

export function parseStakeholdersYaml(yamlContent: string): {
  data?: StakeholdersFile;
  errors: ValidateYamlOutput["errors"];
  warnings: ValidateYamlOutput["warnings"];
} {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (e) {
    return {
      errors: [{ field: "yaml", message: `YAML syntax error: ${(e as Error).message}` }],
      warnings: [],
    };
  }

  const result = StakeholdersFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      errors: formatZodErrors(result.error),
      warnings: [],
    };
  }

  const warnings = validateStakeholderWarnings(result.data);
  return { data: result.data, errors: [], warnings };
}

export function validateBoth(
  incidentYaml: string,
  stakeholdersYaml: string
): ValidateYamlOutput {
  const incResult = parseIncidentYaml(incidentYaml);
  const stResult = parseStakeholdersYaml(stakeholdersYaml);

  return {
    valid: incResult.errors.length === 0 && stResult.errors.length === 0,
    errors: [...incResult.errors, ...stResult.errors],
    warnings: [...incResult.warnings, ...stResult.warnings],
  };
}

function formatZodErrors(error: ZodError): ValidateYamlOutput["errors"] {
  return error.errors.map((e) => ({
    field: e.path.join(".") || "root",
    message: e.message,
  }));
}

function validateIncidentWarnings(incident: Incident): ValidateYamlOutput["warnings"] {
  const warnings: ValidateYamlOutput["warnings"] = [];

  if (!incident.detected_at) {
    warnings.push({
      field: "incident.detected_at",
      message: "detected_at is missing; opened_at will be used as detection time",
    });
  }

  if (incident.change_related === undefined) {
    warnings.push({
      field: "incident.change_related",
      message: "change_related not specified; will default to false",
    });
  }

  if (!incident.region) {
    warnings.push({
      field: "incident.region",
      message: "region not specified; region-specific guidance will be omitted from runbook",
    });
  }

  const validCategories = ["Database", "Network", "Application", "Cloud/Infra", "Security", "Other"];
  if (!validCategories.includes(incident.category)) {
    warnings.push({
      field: "incident.category",
      message: `Category '${incident.category}' is not a standard category. Valid: ${validCategories.join(", ")}. Generic investigation steps will be used.`,
    });
  }

  return warnings;
}

function validateStakeholderWarnings(data: StakeholdersFile): ValidateYamlOutput["warnings"] {
  const warnings: ValidateYamlOutput["warnings"] = [];
  const roles = data.stakeholders.map((s) => s.role);

  const requiredRoles = ["Incident Commander", "Technical Lead", "Communications Lead"];
  for (const role of requiredRoles) {
    const found = roles.some((r) => r.toLowerCase().includes(role.toLowerCase()));
    if (!found) {
      warnings.push({
        field: "stakeholders",
        message: `No stakeholder with role '${role}' found. Escalation matrix may be incomplete.`,
      });
    }
  }

  const hasBridgeUrl = data.stakeholders.some((s) => s.bridge_url);
  if (!hasBridgeUrl) {
    warnings.push({
      field: "stakeholders",
      message: "No stakeholder has a bridge_url set. Zoom bridge link will be omitted from communication templates.",
    });
  }

  if (!data.vendor_escalations || data.vendor_escalations.length === 0) {
    warnings.push({
      field: "vendor_escalations",
      message: "No vendor escalations configured. Vendor escalation section will be empty.",
    });
  }

  return warnings;
}
