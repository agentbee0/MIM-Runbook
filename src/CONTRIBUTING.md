# Contributing to MIM-Runbook

Thank you for contributing to MIM-Runbook! This plugin helps incident response teams act faster and smarter during Sev1 outages.

---

## How to Contribute

### Adding a New Incident Category

Categories route the investigation steps in Section 4 and containment options in Section 5.

1. Open `servers/runbook-generator/src/runbook-generator.ts`
2. Add a new `get[Category]DiagnosisSteps()` function following the pattern of existing ones
3. Add a new `get[Category]ContainmentSteps()` function
4. Add your category to the routing logic in `buildSection4()` and `buildSection5()`
5. Update the valid categories list in `yaml-parser.ts` (`validateIncidentWarnings()`)
6. Add the category to the SKILL.md documentation

### Improving Runbook Sections

Each section is built by a dedicated function in `runbook-generator.ts`:
- `buildSection1()` through `buildSection8()`
- Each function returns a `RunbookSection` object with `blocks: RunbookBlock[]`
- Blocks use the `RunbookBlockType` union type (see `types.ts`)

Keep sections prescription-focused: write instructions, not explanations.

### Improving the Word Document

The `.docx` formatter is in `servers/runbook-generator/src/docx-builder.ts`.

- The `COLORS` object at the top controls all colour values
- `FONT_SIZES` controls all text sizes
- Each block type has a dedicated renderer function (`buildNumberedStep`, `buildAlertBox`, etc.)
- Test your changes by running the full generation pipeline and opening the .docx in Microsoft Word

### Improving the Excel Tracker

The `.xlsx` builder is in `servers/runbook-generator/src/xlsx-builder.ts`.

- Each sheet has a dedicated function (`buildSheet1ActionItems`, etc.)
- Column widths, header styles, and conditional formatting are all configurable at the top
- Test by opening the generated .xlsx in Excel and verifying formulas work

### Adding a New Skill

Skills are auto-triggered domain knowledge files.

1. Create a directory under `skills/` with a descriptive name
2. Add a `SKILL.md` file with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: >
     When this skill activates and what it provides.
   ---
   ```
3. Write the knowledge content using markdown
4. Link to it from the README

### Adding or Improving Commands

Commands are explicit slash-command workflows.

1. Create a `.md` file under `commands/`
2. Include YAML frontmatter with `name`, `description`, and `argument-hint`
3. Define a clear numbered workflow
4. Document inputs, outputs, and any MCP tool dependencies

### Improving ServiceNow Integration (Phase 2)

The ServiceNow client is in `servers/runbook-generator/src/snow-client.ts`.

1. ServiceNow Table API docs: https://docs.servicenow.com/bundle/vancouver-api-reference/page/integrate/inbound-rest/concept/c_TableAPI.html
2. Test against a personal developer instance (PDI) — free at https://developer.servicenow.com
3. Add tests in a `test/` directory

---

## Development Setup

```bash
cd servers/runbook-generator
npm install
npm run dev  # starts the MCP server with tsx (hot reload)
npm run build  # TypeScript compile check
```

---

## Code Style

- TypeScript strict mode — no `any` types
- Pure functions where possible (easier to test)
- Each runbook section in its own function
- Error messages should be actionable: say what went wrong AND how to fix it

---

## Submitting a Pull Request

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-improvement`
3. Make your changes and run `npm run build` to verify no TypeScript errors
4. Test the full pipeline: generate a runbook from the example YAML files
5. Open a PR with a clear description of what you changed and why

---

## Reporting Issues

- Bug reports: Include the incident YAML (anonymised), error message, and Node.js version
- Feature requests: Describe the use case and why it would help incident responders
