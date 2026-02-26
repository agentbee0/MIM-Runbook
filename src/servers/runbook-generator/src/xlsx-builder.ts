import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { RunbookOutput, ActionItem } from "./types.js";

// ============================================================
// Color palette (ARGB format for ExcelJS)
// ============================================================

const COLORS = {
  navy: "FF1B3A5C",
  navyLight: "FF2E5C8A",
  red: "FFC0392B",
  redLight: "FFF8D7DA",
  amber: "FFE67E22",
  amberLight: "FFFFF3CD",
  green: "FF27AE60",
  greenLight: "FFD4EDDA",
  teal: "FF1ABC9C",
  tealLight: "FFD1F0EA",
  white: "FFFFFFFF",
  lightGray: "FFF2F2F2",
  midGray: "FFD9D9D9",
  darkGray: "FF595959",
  black: "FF000000",
  text: "FF2C3E50",
  headerFont: "FFFFFFFF",
  openStatus: "FFF8D7DA",
  inProgressStatus: "FFFFF3CD",
  doneStatus: "FFD4EDDA",
  blockedStatus: "FFE8D5E8",
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLORS.midGray } },
  bottom: { style: "thin", color: { argb: COLORS.midGray } },
  left: { style: "thin", color: { argb: COLORS.midGray } },
  right: { style: "thin", color: { argb: COLORS.midGray } },
};

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: COLORS.navy },
};

// ============================================================
// Main export function
// ============================================================

export async function buildXlsx(
  rb: RunbookOutput,
  outputPath: string
): Promise<{ filePath: string; fileSize: string }> {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MIM-Runbook Generator";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  buildSheet1ActionItems(workbook, rb);
  buildSheet2EscalationLog(workbook, rb);
  buildSheet3Timeline(workbook, rb);
  buildSheet4Summary(workbook, rb);

  await workbook.xlsx.writeFile(outputPath);

  const { size } = await import("node:fs").then((fs) => fs.promises.stat(outputPath));
  const sizeKb = Math.round(size / 1024);
  const fileSize = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

  return { filePath: outputPath, fileSize };
}

// ============================================================
// Sheet 1: Action Items
// ============================================================

function buildSheet1ActionItems(workbook: ExcelJS.Workbook, rb: RunbookOutput): void {
  const sheet = workbook.addWorksheet("Action Items", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 0 }],
    properties: { tabColor: { argb: COLORS.navy.slice(2) } },
  });

  sheet.columns = [
    { header: "#",           key: "id",          width: 10 },
    { header: "Phase",       key: "phase",        width: 16 },
    { header: "Action",      key: "action",       width: 45 },
    { header: "Owner",       key: "owner",        width: 22 },
    { header: "Team",        key: "team",         width: 20 },
    { header: "Priority",    key: "priority",     width: 10 },
    { header: "Status",      key: "status",       width: 16 },
    { header: "Started At",  key: "startedAt",    width: 20 },
    { header: "Target By",   key: "targetBy",     width: 14 },
    { header: "Completed At",key: "completedAt",  width: 20 },
    { header: "Notes",       key: "notes",        width: 40 },
  ];

  // Style header row
  styleHeaderRow(sheet.getRow(1));

  // Add data rows
  for (const item of rb.actionItems) {
    const row = sheet.addRow({
      id: item.id,
      phase: item.phase,
      action: item.action,
      owner: item.owner,
      team: item.team,
      priority: item.priority,
      status: item.status,
      startedAt: "",
      targetBy: item.targetBy,
      completedAt: "",
      notes: item.notes,
    });

    // Style rows alternately
    const isEven = row.number % 2 === 0;
    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGray.slice(2) } };
      }
    });

    // Conditional formatting for priority
    const priorityCell = row.getCell("priority");
    if (item.priority === "P1") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redLight.slice(2) } };
      priorityCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.red.slice(2) } };
    } else if (item.priority === "P2") {
      priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amberLight.slice(2) } };
    }

    // Status dropdown validation
    const statusCell = row.getCell("status");
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.openStatus.slice(2) } };
    statusCell.font = { name: "Calibri", size: 10, bold: true };
  }

  // Add data validation for Status column
  const lastRow = Math.max(rb.actionItems.length + 1, 2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dv = (sheet as any).dataValidations;
  dv.add(`G2:G${lastRow + 100}`, {
    type: "list",
    allowBlank: false,
    formulae: ['"Open,In Progress,Blocked,Done"'],
    showErrorMessage: true,
    errorTitle: "Invalid Status",
    error: "Please select: Open, In Progress, Blocked, or Done",
  });

  // Add data validation for Priority column
  dv.add(`F2:F${lastRow + 100}`, {
    type: "list",
    allowBlank: false,
    formulae: ['"P1,P2,P3"'],
  });

  // Conditional formatting for status column
  sheet.addConditionalFormatting({
    ref: `G2:G${lastRow + 100}`,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "Open",
        priority: 1,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLORS.openStatus.slice(2) } },
          font: { color: { argb: COLORS.red.slice(2) } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "In Progress",
        priority: 2,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLORS.amberLight.slice(2) } },
          font: { color: { argb: COLORS.amber.slice(2) } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "Done",
        priority: 3,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLORS.greenLight.slice(2) } },
          font: { color: { argb: COLORS.green.slice(2) } },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "Blocked",
        priority: 4,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLORS.blockedStatus.slice(2) } },
        },
      },
    ],
  });

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 11 },
  };

  // Row height for data rows
  for (let i = 2; i <= lastRow + 1; i++) {
    sheet.getRow(i).height = 32;
  }
}

// ============================================================
// Sheet 2: Escalation Log
// ============================================================

function buildSheet2EscalationLog(workbook: ExcelJS.Workbook, rb: RunbookOutput): void {
  const sheet = workbook.addWorksheet("Escalation Log", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { tabColor: { argb: COLORS.amber.slice(2) } },
  });

  sheet.columns = [
    { header: "Time (UTC)",    key: "time",         width: 22 },
    { header: "Contact Name",  key: "name",         width: 22 },
    { header: "Role",          key: "role",         width: 24 },
    { header: "Method",        key: "method",       width: 18 },
    { header: "Topic",         key: "topic",        width: 40 },
    { header: "Response",      key: "response",     width: 40 },
    { header: "Next Action",   key: "nextAction",   width: 40 },
  ];

  styleHeaderRow(sheet.getRow(1));

  // Add pre-populated escalation entries from stakeholders
  for (const entry of rb.escalationEntries) {
    const row = sheet.addRow({
      time: "",
      name: entry.contactName,
      role: entry.role,
      method: entry.method,
      topic: "",
      response: "",
      nextAction: "",
    });
    styleDataRow(row, row.number);
  }

  // Add 20 empty rows for manual entries during incident
  for (let i = 0; i < 20; i++) {
    const row = sheet.addRow({});
    styleDataRow(row, row.number);
  }

  // Method validation
  const dv2 = (sheet as any).dataValidations;
  dv2.add(`D2:D${rb.escalationEntries.length + 25}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Slack,Phone,Email,Zoom,Teams,SMS"'],
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
}

// ============================================================
// Sheet 3: Incident Timeline
// ============================================================

function buildSheet3Timeline(workbook: ExcelJS.Workbook, rb: RunbookOutput): void {
  const sheet = workbook.addWorksheet("Incident Timeline", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { tabColor: { argb: COLORS.teal.slice(2) } },
  });

  sheet.columns = [
    { header: "Time (UTC)",        key: "time",        width: 22 },
    { header: "Event Type",        key: "eventType",   width: 20 },
    { header: "Event Description", key: "description", width: 55 },
    { header: "Logged By",         key: "loggedBy",    width: 22 },
    { header: "Evidence / Link",   key: "evidence",    width: 40 },
  ];

  styleHeaderRow(sheet.getRow(1));

  // Pre-seed timeline with known events from the incident
  const detectedAt = rb.incident.detected_at ?? rb.incident.opened_at;
  const seedEvents = [
    { time: formatTs(detectedAt), eventType: "Incident Detected", description: rb.incident.short_description, loggedBy: rb.incident.caller_id, evidence: "" },
    { time: formatTs(rb.incident.opened_at), eventType: "Incident Opened", description: `${rb.incident.number} declared Sev1`, loggedBy: rb.incident.assigned_to, evidence: "" },
    { time: "[T+0]", eventType: "IC Engaged", description: `${rb.incidentCommander?.name ?? "IC"} joined as Incident Commander`, loggedBy: rb.incidentCommander?.name ?? "", evidence: "" },
    { time: "[T+0]", eventType: "Bridge Opened", description: `Zoom bridge opened: ${rb.zoomUrl}`, loggedBy: rb.incidentCommander?.name ?? "", evidence: rb.zoomUrl },
    { time: "[T+0]", eventType: "Slack Channel Created", description: `Incident channel created: ${rb.slackChannel}`, loggedBy: "", evidence: "" },
  ];

  for (const event of seedEvents) {
    const row = sheet.addRow(event);
    styleDataRow(row, row.number);
  }

  // Add 30 empty rows for manual timeline entries
  for (let i = 0; i < 30; i++) {
    const row = sheet.addRow({});
    styleDataRow(row, row.number);
  }

  // Event type validation
  const dv3 = (sheet as any).dataValidations;
  dv3.add(`B2:B${seedEvents.length + 35}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Incident Detected,Incident Opened,IC Engaged,Bridge Opened,Triage,Investigation,Hypothesis,Action Taken,Mitigation Applied,Vendor Contacted,Service Restored,Incident Closed,Post-Incident"'],
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
}

// ============================================================
// Sheet 4: Incident Summary Dashboard
// ============================================================

function buildSheet4Summary(workbook: ExcelJS.Workbook, rb: RunbookOutput): void {
  const sheet = workbook.addWorksheet("Summary Dashboard", {
    properties: { tabColor: { argb: COLORS.green.slice(2) } },
  });

  sheet.getColumn(1).width = 35;
  sheet.getColumn(2).width = 55;

  // Title banner
  const titleRow = sheet.addRow(["INCIDENT SUMMARY DASHBOARD", ""]);
  titleRow.getCell(1).value = "INCIDENT SUMMARY DASHBOARD";
  sheet.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
  titleRow.getCell(1).fill = HEADER_FILL;
  titleRow.getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: COLORS.headerFont } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 40;

  sheet.addRow([]);

  // Incident metadata section
  addSectionHeader(sheet, "INCIDENT DETAILS");
  addMetaRow(sheet, "Incident Number", rb.incident.number);
  addMetaRow(sheet, "Title", rb.incident.title);
  addMetaRow(sheet, "Severity", rb.incident.severity);
  addMetaRow(sheet, "Priority", rb.incident.priority);
  addMetaRow(sheet, "State", rb.incident.state);
  addMetaRow(sheet, "Affected Service", rb.incident.affected_service);
  addMetaRow(sheet, "Affected CI", rb.incident.affected_ci);
  addMetaRow(sheet, "Environment", `${rb.incident.environment}${rb.incident.region ? ` (${rb.incident.region})` : ""}`);
  addMetaRow(sheet, "Business Impact", rb.incident.business_impact);
  addMetaRow(sheet, "Opened At", formatTs(rb.incident.opened_at));
  addMetaRow(sheet, "Detected At", formatTs(rb.incident.detected_at ?? rb.incident.opened_at));
  addMetaRow(sheet, "Resolved At", "[TO BE FILLED]");
  addMetaRow(sheet, "Total Duration", "[TO BE FILLED]");

  sheet.addRow([]);

  // War room section
  addSectionHeader(sheet, "WAR ROOM");
  addMetaRow(sheet, "Incident Commander", `${rb.incidentCommander?.name ?? "TBD"} | ${rb.incidentCommander?.phone ?? ""} | ${rb.incidentCommander?.slack ?? ""}`);
  addMetaRow(sheet, "Technical Lead", `${rb.technicalLead?.name ?? "TBD"} | ${rb.technicalLead?.phone ?? ""} | ${rb.technicalLead?.slack ?? ""}`);
  addMetaRow(sheet, "Zoom Bridge", rb.zoomUrl);
  addMetaRow(sheet, "Slack Channel", rb.slackChannel);
  addMetaRow(sheet, "Assignment Group", rb.incident.assignment_group);

  sheet.addRow([]);

  // Live counters (formula-based)
  addSectionHeader(sheet, "ACTION TRACKER SUMMARY (LIVE)");

  const totalActionsRow = sheet.addRow(["Total Actions", `=COUNTA('Action Items'!A2:A1000)-COUNTBLANK('Action Items'!A2:A1000)`]);
  styleMetaRow(totalActionsRow);

  const openRow = sheet.addRow(["Open Actions", `=COUNTIF('Action Items'!G2:G1000,"Open")`]);
  styleMetaRow(openRow);
  openRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redLight.slice(2) } };

  const inProgressRow = sheet.addRow(["In Progress", `=COUNTIF('Action Items'!G2:G1000,"In Progress")`]);
  styleMetaRow(inProgressRow);
  inProgressRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amberLight.slice(2) } };

  const doneRow = sheet.addRow(["Completed", `=COUNTIF('Action Items'!G2:G1000,"Done")`]);
  styleMetaRow(doneRow);
  doneRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenLight.slice(2) } };

  const blockedRow = sheet.addRow(["Blocked", `=COUNTIF('Action Items'!G2:G1000,"Blocked")`]);
  styleMetaRow(blockedRow);
  blockedRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blockedStatus.slice(2) } };

  // Percentage complete
  const pctRow = sheet.addRow([
    "% Complete",
    `=IFERROR(TEXT(COUNTIF('Action Items'!G2:G1000,"Done")/COUNTA('Action Items'!A2:A1000)*100,"0.0")&"%","0%")`,
  ]);
  styleMetaRow(pctRow);
  pctRow.getCell(1).font = { name: "Calibri", size: 11, bold: true };
  pctRow.getCell(2).font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.green.slice(2) } };

  sheet.addRow([]);

  // Stakeholder contact quick-ref
  addSectionHeader(sheet, "STAKEHOLDER QUICK REFERENCE");
  for (const s of rb.stakeholders) {
    const row = sheet.addRow([
      `${s.name} (${s.role})`,
      `${s.phone} | ${s.email} | ${s.slack}`,
    ]);
    styleMetaRow(row);
  }

  sheet.addRow([]);
  addSectionHeader(sheet, "VENDOR ESCALATIONS");
  for (const v of rb.vendors) {
    const row = sheet.addRow([
      `${v.vendor} — ${v.severity_mapping}`,
      `Account: ${v.account_number} | Phone: ${v.phone}`,
    ]);
    styleMetaRow(row);
  }

  // Generated timestamp at bottom
  sheet.addRow([]);
  const genRow = sheet.addRow(["Generated By", `MIM-Runbook Generator — ${formatTs(rb.generatedAt)}`]);
  genRow.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: COLORS.darkGray.slice(2) } };
  genRow.getCell(2).font = { name: "Calibri", size: 9, italic: true, color: { argb: COLORS.darkGray.slice(2) } };
}

// ============================================================
// Helpers
// ============================================================

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.headerFont } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN_BORDER;
  });
  row.height = 28;
}

function styleDataRow(row: ExcelJS.Row, rowNumber: number): void {
  const isEven = rowNumber % 2 === 0;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = THIN_BORDER;
    cell.font = { name: "Calibri", size: 10 };
    cell.alignment = { vertical: "middle", wrapText: true };
    if (isEven) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGray.slice(2) } };
    }
  });
  row.height = 22;
}

function addSectionHeader(sheet: ExcelJS.Worksheet, title: string): void {
  const row = sheet.addRow([title, ""]);
  sheet.mergeCells(`A${row.number}:B${row.number}`);
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyLight.slice(2) } };
  row.getCell(1).font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.headerFont } };
  row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  row.height = 24;
}

function addMetaRow(sheet: ExcelJS.Worksheet, key: string, value: string): void {
  const row = sheet.addRow([key, value]);
  row.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.darkGray.slice(2) } };
  row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: COLORS.text.slice(2) } };
  row.getCell(1).alignment = { vertical: "middle" };
  row.getCell(2).alignment = { vertical: "middle", wrapText: true };
  row.getCell(1).border = THIN_BORDER;
  row.getCell(2).border = THIN_BORDER;
  row.height = 20;
}

function styleMetaRow(row: ExcelJS.Row): void {
  row.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.darkGray.slice(2) } };
  row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: COLORS.text.slice(2) } };
  row.getCell(1).border = THIN_BORDER;
  row.getCell(2).border = THIN_BORDER;
  row.getCell(1).alignment = { vertical: "middle" };
  row.getCell(2).alignment = { vertical: "middle", wrapText: true };
  row.height = 20;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch {
    return iso;
  }
}
