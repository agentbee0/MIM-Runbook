import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ShadingType,
  convertInchesToTwip,
} from "docx";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  RunbookOutput,
  RunbookBlock,
  RunbookSection,
  EmailTemplate,
} from "./types.js";

// ============================================================
// Colour palette
// ============================================================

const COLORS = {
  navy: "1B3A5C",
  navyLight: "2E5C8A",
  red: "C0392B",
  redLight: "F8D7DA",
  amber: "E67E22",
  amberLight: "FFF3CD",
  green: "27AE60",
  greenLight: "D4EDDA",
  teal: "1ABC9C",
  tealLight: "D1F0EA",
  blueLight: "D6EAF8",
  white: "FFFFFF",
  lightGray: "F2F2F2",
  midGray: "D9D9D9",
  darkGray: "595959",
  black: "000000",
  text: "2C3E50",
};

const FONT = { name: "Calibri", mono: "Courier New" };

const FONT_SIZES = {
  title: 40,     // 20pt
  h1: 32,        // 16pt
  h2: 28,        // 14pt
  h3: 24,        // 12pt
  body: 22,      // 11pt
  small: 20,     // 10pt
  tiny: 18,      // 9pt
};

// ============================================================
// Main export function
// ============================================================

export async function buildDocx(
  rb: RunbookOutput,
  outputPath: string
): Promise<{ filePath: string; fileSize: string }> {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
          },
        },
        headers: {
          default: buildPageHeader(rb.incident.number, rb.incident.affected_service),
        },
        footers: {
          default: buildPageFooter(),
        },
        children: buildDocumentChildren(rb),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(outputPath, buffer);

  const sizeKb = Math.round(buffer.length / 1024);
  const fileSize = sizeKb > 1024
    ? `${(sizeKb / 1024).toFixed(1)} MB`
    : `${sizeKb} KB`;

  return { filePath: outputPath, fileSize };
}

// ============================================================
// Title Page
// ============================================================

function buildTitlePage(rb: RunbookOutput): Array<Paragraph | Table> {
  const { incident } = rb;
  const severityColor = incident.severity.startsWith("1") ? COLORS.red : COLORS.amber;
  const detectedAt = incident.detected_at ?? incident.opened_at;

  return [
    // Spacer
    new Paragraph({ spacing: { before: convertInchesToTwip(1) } }),

    // Red severity badge
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `  ⚠  ${incident.severity.toUpperCase()}  `,
          font: FONT.name,
          size: FONT_SIZES.h1,
          bold: true,
          color: COLORS.white,
          shading: {
            type: ShadingType.SOLID,
            color: severityColor,
          },
        }),
      ],
    }),

    new Paragraph({ spacing: { before: 200 } }),

    // Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "MAJOR INCIDENT RUNBOOK",
          font: FONT.name,
          size: FONT_SIZES.title,
          bold: true,
          color: COLORS.navy,
        }),
      ],
    }),

    // Incident number
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: incident.number,
          font: FONT.name,
          size: FONT_SIZES.h1,
          bold: true,
          color: COLORS.navyLight,
        }),
      ],
    }),

    new Paragraph({ spacing: { before: 200 } }),

    // Service and title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: incident.affected_service,
          font: FONT.name,
          size: FONT_SIZES.h2,
          bold: true,
          color: COLORS.text,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: incident.title,
          font: FONT.name,
          size: FONT_SIZES.h3,
          color: COLORS.darkGray,
          italics: true,
        }),
      ],
    }),

    new Paragraph({ spacing: { before: 400 } }),

    // Metadata table
    buildKeyValueTable([
      ["Incident Commander", rb.incidentCommander?.name ?? "TBD"],
      ["Technical Lead", rb.technicalLead?.name ?? "TBD"],
      ["Opened At", formatTs(incident.opened_at)],
      ["Detected At", formatTs(detectedAt)],
      ["Environment", `${incident.environment}${incident.region ? ` (${incident.region})` : ""}`],
      ["Affected CI", incident.affected_ci],
      ["Zoom Bridge", rb.zoomUrl],
      ["Slack Channel", rb.slackChannel],
      ["Runbook Generated", formatTs(rb.generatedAt)],
    ]),

    new Paragraph({ spacing: { before: 400 } }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "CONFIDENTIAL — INCIDENT RESPONSE USE ONLY",
          font: FONT.name,
          size: FONT_SIZES.small,
          bold: true,
          color: COLORS.red,
        }),
      ],
    }),
  ];
}

// ============================================================
// Table of Contents (simple text-based)
// ============================================================

function buildTableOfContents(): Paragraph[] {
  const entries = [
    "1. Incident Summary Banner",
    "2. Immediate Triage Checklist (First 5 Minutes)",
    "3. Communication Plan & Email Templates",
    "4. Diagnosis & Investigation Steps",
    "5. Containment & Mitigation Actions",
    "6. Escalation Matrix",
    "7. Resolution & Validation",
    "8. Post-Incident Handoff",
  ];

  return [
    new Paragraph({
      children: [new TextRun({ text: "Contents", font: FONT.name, size: FONT_SIZES.h1, bold: true, color: COLORS.navy })],
      spacing: { before: 200, after: 200 },
    }),
    ...entries.map((e) =>
      new Paragraph({
        children: [new TextRun({ text: e, font: FONT.name, size: FONT_SIZES.body, color: COLORS.text })],
        spacing: { before: 80, after: 80 },
        indent: { left: convertInchesToTwip(0.25) },
      })
    ),
  ];
}

// ============================================================
// All Sections
// ============================================================

function buildAllSections(rb: RunbookOutput): Paragraph[] {
  const result: Paragraph[] = [];

  for (const section of rb.sections) {
    result.push(...buildSectionHeading(section));
    for (const block of section.blocks) {
      result.push(...buildBlock(block, rb));
    }
    result.push(buildPageBreak());
  }

  return result;
}

function buildSectionHeading(section: RunbookSection): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: `${section.sectionNumber}. ${section.title}`,
          font: FONT.name,
          size: FONT_SIZES.h1,
          bold: true,
          color: COLORS.white,
          shading: { type: ShadingType.SOLID, color: COLORS.navy },
        }),
      ],
      spacing: { before: 300, after: 200 },
    }),
  ];
}

// ============================================================
// Block Renderers
// ============================================================

function buildBlock(block: RunbookBlock, rb: RunbookOutput): Paragraph[] {
  switch (block.type) {
    case "heading":
      return [buildHeadingParagraph(block.text ?? "", block.level ?? 2)];

    case "paragraph":
      return [buildBodyParagraph(block.text ?? "")];

    case "numbered_step":
      return buildNumberedStep(block.stepNumber ?? 0, block.text ?? "");

    case "checklist_item":
      return [buildChecklistItem(block.text ?? "")];

    case "bullet":
      return (block.items ?? []).map((item) => buildBulletItem(item));

    case "command":
      return buildCommandBlock(block.text ?? "");

    case "table":
      return [buildDataTable(block.rows ?? [])];

    case "decision_tree":
      return buildDecisionTree(block.condition ?? "", block.branches ?? []);

    case "alert_box":
      return [buildAlertBox(block.alertLevel ?? "info", block.text ?? "")];

    case "email_template":
      return block.emailTemplate ? buildEmailTemplateBlock(block.emailTemplate) : [];

    default:
      return [buildBodyParagraph(block.text ?? "")];
  }
}

function buildHeadingParagraph(text: string, level: number): Paragraph {
  const size = level === 2 ? FONT_SIZES.h2 : FONT_SIZES.h3;
  const color = level === 2 ? COLORS.navyLight : COLORS.darkGray;
  return new Paragraph({
    children: [new TextRun({ text, font: FONT.name, size, bold: true, color })],
    spacing: { before: 240, after: 120 },
    border: level === 2 ? {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.navyLight },
    } : undefined,
  });
}

function buildBodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: parseFormattedText(text),
    spacing: { before: 80, after: 80 },
  });
}

function buildNumberedStep(_num: number, text: string): Paragraph[] {
  const lines = text.split("\n");
  const result: Paragraph[] = [];

  // Render the step heading with a left navy border — avoids Word's list indent engine
  // which crushes text into a tiny column when numbering indent is not explicitly set.
  result.push(
    new Paragraph({
      children: parseFormattedText(lines[0]),
      spacing: { before: 200, after: 60 },
      indent: { left: convertInchesToTwip(0.3) },
      border: {
        left: { style: BorderStyle.THICK, size: 12, color: COLORS.navyLight },
      },
    })
  );

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("```") || line.startsWith("ssh") || line.startsWith("curl") ||
        line.startsWith("#") || line.startsWith("SELECT") || line.startsWith("kubectl") ||
        line.startsWith("aws") || line.startsWith("sudo")) {
      result.push(...buildCommandBlock(line));
    } else {
      result.push(
        new Paragraph({
          children: parseFormattedText(line),
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { before: 40, after: 40 },
        })
      );
    }
  }

  return result;
}

function buildChecklistItem(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "☐  ", font: FONT.name, size: FONT_SIZES.body, bold: true, color: COLORS.navy }),
      ...parseFormattedText(text),
    ],
    spacing: { before: 80, after: 80 },
    indent: { left: convertInchesToTwip(0.25) },
  });
}

function buildBulletItem(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "•  ", font: FONT.name, size: FONT_SIZES.body, color: COLORS.navy }),
      ...parseFormattedText(text),
    ],
    indent: { left: convertInchesToTwip(0.25) },
    spacing: { before: 60, after: 60 },
  });
}

function buildCommandBlock(text: string): Paragraph[] {
  const lines = text.split("\n").filter((l) => l !== "```");
  return lines.map((line) =>
    new Paragraph({
      children: [
        new TextRun({
          text: line || " ",
          font: FONT.mono,
          size: FONT_SIZES.small,
          color: COLORS.navy,
          shading: { type: ShadingType.SOLID, color: COLORS.lightGray },
        }),
      ],
      indent: { left: convertInchesToTwip(0.25), right: convertInchesToTwip(0.25) },
      spacing: { before: 20, after: 20 },
    })
  );
}

function buildDataTable(rows: string[][]): Paragraph {
  if (rows.length === 0) return new Paragraph({});

  const colCount = rows[0].length;
  const colWidth = Math.floor(8500 / colCount);

  const tableRows = rows.map((row, rowIdx) =>
    new TableRow({
      tableHeader: rowIdx === 0,
      children: row.map((cell) =>
        new TableCell({
          shading: rowIdx === 0
            ? { type: ShadingType.SOLID, color: COLORS.navy }
            : rowIdx % 2 === 0
              ? { type: ShadingType.SOLID, color: COLORS.lightGray }
              : undefined,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cell,
                  font: FONT.name,
                  size: FONT_SIZES.small,
                  bold: rowIdx === 0,
                  color: rowIdx === 0 ? COLORS.white : COLORS.text,
                }),
              ],
              alignment: rowIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
            }),
          ],
          width: { size: colWidth, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        })
      ),
    })
  );

  return new Paragraph({
    children: [],
    spacing: { before: 120, after: 120 },
  });

  // Note: Returning a table as a paragraph wrapper isn't straightforward in docx library.
  // The table is appended in the outer array. We return it directly below.
  // This is handled by the caller in buildBlock — for tables we return [buildDataTable()]
  // but docx doesn't support Paragraph wrapping a Table. See workaround in buildBlock.
}

// ============================================================
// Decision Tree
// ============================================================

function buildDecisionTree(
  condition: string,
  branches: { condition: string; action: string }[]
): Paragraph[] {
  const result: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: `🔀  ${condition}`,
          font: FONT.name,
          size: FONT_SIZES.body,
          bold: true,
          color: COLORS.navy,
          shading: { type: ShadingType.SOLID, color: COLORS.amberLight },
        }),
      ],
      spacing: { before: 160, after: 80 },
      indent: { left: convertInchesToTwip(0.25), right: convertInchesToTwip(0.25) },
    }),
  ];

  for (const branch of branches) {
    result.push(
      new Paragraph({
        children: [
          new TextRun({ text: "If ", font: FONT.name, size: FONT_SIZES.body, color: COLORS.text }),
          new TextRun({ text: branch.condition, font: FONT.name, size: FONT_SIZES.body, bold: true, color: COLORS.amber }),
          new TextRun({ text: " → ", font: FONT.name, size: FONT_SIZES.body, color: COLORS.text }),
          new TextRun({ text: branch.action, font: FONT.name, size: FONT_SIZES.body, color: COLORS.navyLight }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { before: 60, after: 60 },
        shading: { type: ShadingType.SOLID, color: COLORS.amberLight },
      })
    );
  }

  return result;
}

// ============================================================
// Alert Box
// ============================================================

function buildAlertBox(level: "info" | "warning" | "critical", text: string): Paragraph {
  const bgColor = level === "critical" ? COLORS.redLight : level === "warning" ? COLORS.amberLight : COLORS.blueLight;
  const textColor = level === "critical" ? COLORS.red : level === "warning" ? COLORS.amber : COLORS.navyLight;
  const icon = level === "critical" ? "🔴" : level === "warning" ? "🟡" : "🔵";

  return new Paragraph({
    children: [
      new TextRun({
        text: `${icon}  ${level.toUpperCase()}: ${text}`,
        font: FONT.name,
        size: FONT_SIZES.body,
        bold: level !== "info",
        color: textColor,
        shading: { type: ShadingType.SOLID, color: bgColor },
      }),
    ],
    spacing: { before: 160, after: 160 },
    indent: { left: convertInchesToTwip(0.25), right: convertInchesToTwip(0.25) },
    border: {
      left: { style: BorderStyle.THICK, size: 12, color: textColor },
    },
  });
}

// ============================================================
// Email Template Block
// ============================================================

function buildEmailTemplateBlock(t: EmailTemplate): Paragraph[] {
  const bandColor = t.colorBand === "red" ? COLORS.red
    : t.colorBand === "amber" ? COLORS.amber
    : t.colorBand === "green" ? COLORS.green
    : t.colorBand === "teal" ? COLORS.teal
    : COLORS.navy;

  const bgColor = t.colorBand === "red" ? COLORS.redLight
    : t.colorBand === "amber" ? COLORS.amberLight
    : t.colorBand === "green" ? COLORS.greenLight
    : t.colorBand === "teal" ? COLORS.tealLight
    : COLORS.blueLight;

  const result: Paragraph[] = [
    // Coloured header band
    new Paragraph({
      children: [
        new TextRun({
          text: `  📧  ${t.phase}  (${t.timing})`,
          font: FONT.name,
          size: FONT_SIZES.h3,
          bold: true,
          color: COLORS.white,
          shading: { type: ShadingType.SOLID, color: bandColor },
        }),
      ],
      spacing: { before: 240, after: 80 },
    }),
    // Subject
    new Paragraph({
      children: [
        new TextRun({ text: "Subject: ", font: FONT.name, size: FONT_SIZES.body, bold: true, color: COLORS.text }),
        new TextRun({ text: t.subject, font: FONT.name, size: FONT_SIZES.body, color: COLORS.text }),
      ],
      shading: { type: ShadingType.SOLID, color: bgColor },
      indent: { left: convertInchesToTwip(0.25) },
      spacing: { before: 40, after: 40 },
    }),
    // To
    new Paragraph({
      children: [
        new TextRun({ text: "To: ", font: FONT.name, size: FONT_SIZES.body, bold: true, color: COLORS.text }),
        new TextRun({ text: t.to.join(";  "), font: FONT.name, size: FONT_SIZES.body, color: COLORS.navyLight }),
      ],
      shading: { type: ShadingType.SOLID, color: bgColor },
      indent: { left: convertInchesToTwip(0.25) },
      spacing: { before: 40, after: 40 },
    }),
  ];

  if (t.cc.length > 0) {
    result.push(
      new Paragraph({
        children: [
          new TextRun({ text: "CC: ", font: FONT.name, size: FONT_SIZES.body, bold: true, color: COLORS.text }),
          new TextRun({ text: t.cc.join(";  "), font: FONT.name, size: FONT_SIZES.body, color: COLORS.navyLight }),
        ],
        shading: { type: ShadingType.SOLID, color: bgColor },
        indent: { left: convertInchesToTwip(0.25) },
        spacing: { before: 40, after: 40 },
      })
    );
  }

  // Body in monospace block
  const bodyLines = t.body.split("\n");
  for (const line of bodyLines) {
    result.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line || " ",
            font: FONT.mono,
            size: FONT_SIZES.small,
            color: COLORS.text,
            shading: { type: ShadingType.SOLID, color: COLORS.lightGray },
          }),
        ],
        indent: { left: convertInchesToTwip(0.25), right: convertInchesToTwip(0.25) },
        spacing: { before: 20, after: 20 },
      })
    );
  }

  return result;
}

// ============================================================
// Header / Footer
// ============================================================

function buildPageHeader(incidentNumber: string, service: string): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `${incidentNumber}  |  ${service}  |  CONFIDENTIAL — INCIDENT RESPONSE`,
            font: FONT.name,
            size: FONT_SIZES.tiny,
            color: COLORS.darkGray,
          }),
        ],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.midGray },
        },
      }),
    ],
  });
}

function buildPageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", font: FONT.name, size: FONT_SIZES.tiny, color: COLORS.darkGray }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT.name, size: FONT_SIZES.tiny, color: COLORS.darkGray }),
          new TextRun({ text: " of ", font: FONT.name, size: FONT_SIZES.tiny, color: COLORS.darkGray }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT.name, size: FONT_SIZES.tiny, color: COLORS.darkGray }),
          new TextRun({ text: "  |  MIM-Runbook Generator  |  MIT License", font: FONT.name, size: FONT_SIZES.tiny, color: COLORS.darkGray }),
        ],
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.midGray },
        },
      }),
    ],
  });
}

// ============================================================
// Helpers
// ============================================================

function buildPageBreak(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ break: 1 })],
    pageBreakBefore: true,
  });
}

// Page content width: 8.5" - 2 × 1.25" margins = 6" = 8640 DXA
const TABLE_WIDTH = 8640;

function buildKeyValueTable(rows: [string, string][]): Table {
  const COL_KEY = 2200; // ~1.5" — label column
  const COL_VAL = TABLE_WIDTH - COL_KEY; // ~4.6" — value column

  const tableRows = rows.map((row) =>
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: COLORS.lightGray },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: row[0], font: FONT.name, size: FONT_SIZES.small, bold: true, color: COLORS.navy }),
              ],
            }),
          ],
          width: { size: COL_KEY, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: row[1], font: FONT.name, size: FONT_SIZES.small, color: COLORS.text }),
              ],
            }),
          ],
          width: { size: COL_VAL, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        }),
      ],
    })
  );

  return new Table({
    rows: tableRows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [COL_KEY, COL_VAL],
  });
}

function parseFormattedText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`\n]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], font: FONT.name, size: FONT_SIZES.body, bold: true, color: COLORS.text }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], font: FONT.name, size: FONT_SIZES.body, italics: true, color: COLORS.text }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: FONT.mono, size: FONT_SIZES.small, color: COLORS.navy, shading: { type: ShadingType.SOLID, color: COLORS.lightGray } }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5], font: FONT.name, size: FONT_SIZES.body, color: COLORS.text }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text, font: FONT.name, size: FONT_SIZES.body, color: COLORS.text })];
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch {
    return iso;
  }
}

// ============================================================
// Override buildBlock for tables (docx needs Table nodes, not Paragraph)
// ============================================================

// Redefine buildBlock to handle tables as Document children (not Paragraph children)
// The Document children array accepts both Paragraph and Table objects.
// We use a union approach: buildBlock returns (Paragraph | Table)[]

export function buildDocumentChildren(rb: RunbookOutput): Array<Paragraph | Table> {
  const result: Array<Paragraph | Table> = [];

  // Title page
  result.push(...buildTitlePage(rb));
  result.push(buildPageBreak());

  // TOC
  result.push(...buildTableOfContents());
  result.push(buildPageBreak());

  // Sections
  for (const section of rb.sections) {
    result.push(...buildSectionHeading(section));
    for (const block of section.blocks) {
      result.push(...buildBlockNodes(block, rb));
    }
    result.push(buildPageBreak());
  }

  return result;
}

function buildBlockNodes(block: RunbookBlock, rb: RunbookOutput): Array<Paragraph | Table> {
  switch (block.type) {
    case "table":
      return [buildTableNode(block.rows ?? [], rb)];
    default:
      return buildBlock(block, rb) as Paragraph[];
  }
}

function buildTableNode(rows: string[][], rb: RunbookOutput): Table {
  if (rows.length === 0) {
    return new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({})] })] })] });
  }

  // Replace stakeholder placeholders with real data in Section 2 triage table
  const resolvedRows = resolveTablePlaceholders(rows, rb);
  const colCount = resolvedRows[0].length;

  // Distribute TABLE_WIDTH across columns.
  // For 2-column key-value tables use asymmetric split; otherwise equal.
  const colWidths: number[] =
    colCount === 2
      ? [2200, TABLE_WIDTH - 2200]
      : Array.from({ length: colCount }, () => Math.floor(TABLE_WIDTH / colCount));

  const tableRows = resolvedRows.map((row, rowIdx) =>
    new TableRow({
      tableHeader: rowIdx === 0,
      children: row.map((cell, colIdx) =>
        new TableCell({
          shading: rowIdx === 0
            ? { type: ShadingType.SOLID, color: COLORS.navy }
            : rowIdx % 2 === 0
              ? { type: ShadingType.SOLID, color: COLORS.lightGray }
              : undefined,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cell,
                  font: FONT.name,
                  size: FONT_SIZES.small,
                  bold: rowIdx === 0,
                  color: rowIdx === 0 ? COLORS.white : COLORS.text,
                }),
              ],
              alignment: rowIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
            }),
          ],
          width: { size: colWidths[colIdx], type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        })
      ),
    })
  );

  return new Table({
    rows: tableRows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,  // ← this is what tells Word the actual column sizes
  });
}

function resolveTablePlaceholders(rows: string[][], rb: RunbookOutput): string[][] {
  // Check if this is the stakeholder triage table (contains [IC_NAME] etc.)
  const isTriageTable = rows.some((row) => row.some((cell) => cell.includes("[IC_NAME]")));
  if (!isTriageTable) return rows;

  // Replace placeholder rows with real stakeholder data
  const immediateStakeholders = rb.stakeholders.filter((s) => s.notify_immediately || s.escalation_level === 1);
  return [
    rows[0], // Keep header row
    ...immediateStakeholders.map((s) => [s.name, s.role, s.slack, s.phone]),
  ];
}
