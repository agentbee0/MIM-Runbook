import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { parseIncidentYaml, parseStakeholdersYaml, validateBoth } from "./yaml-parser.js";
import { generateRunbook, runbookToMarkdown } from "./runbook-generator.js";
import { buildDocx, buildDocumentChildren } from "./docx-builder.js";
import { buildXlsx } from "./xlsx-builder.js";
import {
  fetchSnowIncident,
  fetchSnowStakeholders,
  updateSnowIncident,
  createSnowPirTicket,
} from "./snow-client.js";
import type { SnowConfig } from "./types.js";

// ============================================================
// Default paths
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_INPUT_DIR = resolve(
  __dirname,
  process.env.RUNBOOK_INPUT_DIR ?? "../../../../input"
);
const DEFAULT_OUTPUT_DIR = resolve(
  __dirname,
  process.env.RUNBOOK_OUTPUT_DIR ?? "../../../../output"
);

// ============================================================
// MCP Server
// ============================================================

const server = new McpServer({
  name: "mim-runbook-generator",
  version: "1.0.0",
});

// ============================================================
// Tool 1: generate_runbook
// ============================================================

server.tool(
  "generate_runbook",
  "Generates a complete Major Incident Management runbook from incident and stakeholders YAML. " +
    "Produces three output files: a Markdown source (.md), a formatted Word document (.docx), " +
    "and an Excel action tracker (.xlsx) with 4 sheets.",
  {
    incident_yaml: z.string().describe("Full content of the incident YAML (incident: {...} root key)"),
    stakeholders_yaml: z.string().describe("Full content of the stakeholders YAML (stakeholders: [...] root key)"),
    output_dir: z.string().optional().describe("Directory to write output files. Defaults to the configured output directory."),
  },
  async (args) => {
    try {
      const outputDir = args.output_dir
        ? resolve(args.output_dir)
        : DEFAULT_OUTPUT_DIR;

      if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

      // Parse YAML
      const incResult = parseIncidentYaml(args.incident_yaml);
      if (incResult.errors.length > 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Incident YAML validation failed", errors: incResult.errors }, null, 2),
          }],
          isError: true,
        };
      }

      const stResult = parseStakeholdersYaml(args.stakeholders_yaml);
      if (stResult.errors.length > 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Stakeholders YAML validation failed", errors: stResult.errors }, null, 2),
          }],
          isError: true,
        };
      }

      const incident = incResult.data!;
      const stakeholdersFile = stResult.data!;

      // Generate runbook
      const rb = generateRunbook(incident, stakeholdersFile.stakeholders, stakeholdersFile.vendor_escalations);

      // Build filenames
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const baseName = `RB-${incident.number}-${ts}`;
      const mdPath = join(outputDir, `${baseName}.md`);
      const docxPath = join(outputDir, `${baseName}.docx`);
      const xlsxPath = join(outputDir, `${baseName}.xlsx`);

      // Write Markdown
      const markdown = runbookToMarkdown(rb);
      writeFileSync(mdPath, markdown, "utf-8");

      // Write Word document
      await buildDocx(rb, docxPath);

      // Write Excel tracker
      await buildXlsx(rb, xlsxPath);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            incidentNumber: incident.number,
            markdownPath: mdPath,
            docxPath,
            xlsxPath,
            sectionCount: rb.sections.length,
            actionItemCount: rb.actionItems.length,
            emailTemplateCount: rb.emailTemplates.length,
            warnings: [...(incResult.warnings), ...(stResult.warnings)],
            message:
              `✅ Runbook generated for ${incident.number}.\n` +
              `📄 Markdown: ${mdPath}\n` +
              `📝 Word doc: ${docxPath}\n` +
              `📊 Excel tracker: ${xlsxPath}\n` +
              `Sections: ${rb.sections.length} | Action items: ${rb.actionItems.length} | Email templates: ${rb.emailTemplates.length}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool 2: load_yaml_file
// ============================================================

server.tool(
  "load_yaml_file",
  "Reads a YAML file from disk and returns its content as a string. Use this to load incident or stakeholders YAML files before passing them to generate_runbook.",
  {
    file_path: z.string().describe("Absolute or relative path to the YAML file"),
  },
  async (args) => {
    try {
      const filePath = resolve(args.file_path);
      const content = readFileSync(filePath, "utf-8");
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, content, filePath }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool 3: list_input_files
// ============================================================

server.tool(
  "list_input_files",
  "Lists available YAML files in the input directory. Returns file names, paths, sizes, and modification times.",
  {
    input_dir: z.string().optional().describe(`Directory to list. Defaults to ${DEFAULT_INPUT_DIR}`),
  },
  async (args) => {
    try {
      const dir = args.input_dir ? resolve(args.input_dir) : DEFAULT_INPUT_DIR;

      if (!existsSync(dir)) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: false, error: `Directory does not exist: ${dir}` }, null, 2),
          }],
          isError: true,
        };
      }

      const entries = readdirSync(dir)
        .filter((name) => [".yaml", ".yml"].includes(extname(name).toLowerCase()))
        .map((name) => {
          const filePath = join(dir, name);
          const stat = statSync(filePath);
          return {
            name,
            path: filePath,
            size: `${Math.round(stat.size / 1024 * 10) / 10} KB`,
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, directory: dir, files: entries, count: entries.length }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool 4: validate_incident_yaml
// ============================================================

server.tool(
  "validate_incident_yaml",
  "Validates incident and/or stakeholders YAML against the required schema. Returns a list of errors and warnings without generating any files.",
  {
    yaml_content: z.string().describe("YAML content to validate"),
    schema: z.enum(["incident", "stakeholders", "both"]).describe(
      "Which schema to validate against. Use 'both' if yaml_content contains two YAML documents separated by ---"
    ),
    stakeholders_yaml: z.string().optional().describe("Stakeholders YAML content (required when schema='both')"),
  },
  async (args) => {
    try {
      let result;

      if (args.schema === "both") {
        const stakeholdersYaml = args.stakeholders_yaml ?? "";
        result = validateBoth(args.yaml_content, stakeholdersYaml);
      } else if (args.schema === "incident") {
        const r = parseIncidentYaml(args.yaml_content);
        result = { valid: r.errors.length === 0, errors: r.errors, warnings: r.warnings };
      } else {
        const r = parseStakeholdersYaml(args.yaml_content);
        result = { valid: r.errors.length === 0, errors: r.errors, warnings: r.warnings };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ...result,
            message: result.valid
              ? `✅ YAML is valid (${result.warnings.length} warning${result.warnings.length !== 1 ? "s" : ""})`
              : `❌ YAML has ${result.errors.length} error(s). Fix them before generating the runbook.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ valid: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Phase 2 Tools
// ============================================================

// Tool 5: fetch_snow_incident

server.tool(
  "fetch_snow_incident",
  "Phase 2: Fetches a ServiceNow incident by number and returns it as YAML ready for use with generate_runbook.",
  {
    instance: z.string().describe("ServiceNow instance subdomain, e.g. 'mycompany.service-now.com'"),
    incident_number: z.string().describe("Incident number, e.g. INC0078342"),
    auth_token: z.string().describe("Authentication credential: base64(user:pass) for Basic, or OAuth bearer token"),
    auth_type: z.enum(["basic", "bearer"]).default("basic").describe("Authentication type"),
  },
  async (args) => {
    try {
      const config: SnowConfig = {
        instance: args.instance,
        authType: args.auth_type,
        ...(args.auth_type === "basic"
          ? { username: Buffer.from(args.auth_token, "base64").toString().split(":")[0], password: Buffer.from(args.auth_token, "base64").toString().split(":").slice(1).join(":") }
          : { bearerToken: args.auth_token }),
      };

      const result = await fetchSnowIncident(config, args.incident_number);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, incident_yaml: result.incident_yaml, message: `Fetched ${args.incident_number} from ServiceNow` }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// Tool 6: fetch_snow_stakeholders

server.tool(
  "fetch_snow_stakeholders",
  "Phase 2: Fetches members of a ServiceNow assignment group and returns them as stakeholders YAML.",
  {
    instance: z.string().describe("ServiceNow instance subdomain"),
    assignment_group: z.string().describe("Assignment group name, e.g. 'Database Operations'"),
    auth_token: z.string().describe("Authentication credential"),
    auth_type: z.enum(["basic", "bearer"]).default("basic"),
  },
  async (args) => {
    try {
      const config: SnowConfig = {
        instance: args.instance,
        authType: args.auth_type,
        ...(args.auth_type === "basic"
          ? { username: Buffer.from(args.auth_token, "base64").toString().split(":")[0], password: Buffer.from(args.auth_token, "base64").toString().split(":").slice(1).join(":") }
          : { bearerToken: args.auth_token }),
      };

      const result = await fetchSnowStakeholders(config, args.assignment_group);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ success: true, stakeholders_yaml: result.stakeholders_yaml, note: "Review and complete stakeholder details (phone, slack, escalation_level) before using" }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// Tool 7: update_snow_incident

server.tool(
  "update_snow_incident",
  "Phase 2: Updates a ServiceNow incident with work notes and optional runbook URL. Use after generating the runbook to post a link back to the ticket.",
  {
    instance: z.string(),
    sys_id: z.string().describe("ServiceNow sys_id of the incident (not the incident number)"),
    auth_token: z.string(),
    auth_type: z.enum(["basic", "bearer"]).default("basic"),
    work_notes: z.string().describe("Work notes to add to the incident"),
    runbook_url: z.string().optional().describe("Optional URL or file path to the generated runbook"),
  },
  async (args) => {
    try {
      const config: SnowConfig = {
        instance: args.instance,
        authType: args.auth_type,
        ...(args.auth_type === "basic"
          ? { username: Buffer.from(args.auth_token, "base64").toString().split(":")[0], password: Buffer.from(args.auth_token, "base64").toString().split(":").slice(1).join(":") }
          : { bearerToken: args.auth_token }),
      };

      const result = await updateSnowIncident(config, args.sys_id, args.work_notes, args.runbook_url);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ...result, message: `Updated ${args.sys_id} with work notes` }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// Tool 8: create_snow_pir_ticket

server.tool(
  "create_snow_pir_ticket",
  "Phase 2: Creates a Post-Incident Review (PIR) Problem ticket in ServiceNow linked to the parent incident.",
  {
    instance: z.string(),
    auth_token: z.string(),
    auth_type: z.enum(["basic", "bearer"]).default("basic"),
    parent_incident_number: z.string().describe("The incident number this PIR relates to, e.g. INC0078342"),
    title: z.string().describe("PIR ticket title"),
    description: z.string().describe("PIR description including timeline summary, root cause hypothesis, and action items"),
    assigned_to: z.string().optional().describe("Username of the person assigned to the PIR"),
    assignment_group: z.string().optional().describe("Group responsible for the PIR"),
  },
  async (args) => {
    try {
      const config: SnowConfig = {
        instance: args.instance,
        authType: args.auth_type,
        ...(args.auth_type === "basic"
          ? { username: Buffer.from(args.auth_token, "base64").toString().split(":")[0], password: Buffer.from(args.auth_token, "base64").toString().split(":").slice(1).join(":") }
          : { bearerToken: args.auth_token }),
      };

      const result = await createSnowPirTicket(config, args.parent_incident_number, {
        title: args.title,
        description: args.description,
        assignedTo: args.assigned_to,
        assignmentGroup: args.assignment_group,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ...result, message: `PIR ticket ${result.pir_number} created` }, null, 2),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Start server
// ============================================================

const transport = new StdioServerTransport();
await server.connect(transport);
