---
baseline_commit: ba01227b4e5b36fb61777fb9620c841786da33c0
---

# Story 2.4: Baseline RD & Drift Export

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want to export the Baseline RD as Markdown or HTML and the Drift Report as a document,
so that I can share it with the client or team outside the platform.

## Acceptance Criteria

1. **AC1 — Baseline RD export as Markdown**: When the current Baseline RD has `status: "approved"`, an "Export" control in the `BaselineRdViewer` header offers a "Markdown" option. Clicking it downloads a `.md` file named `baseline-rd-v{version}.md` to the BA's device. The file contains a top-level `# Baseline Requirements Document` heading, a metadata line (`Version {version} · Generated {ISO date} · Status: Approved`), then each section as `## {title}` followed by the section's `content` (verbatim markdown source). See [Format: Baseline RD Markdown](#format-baseline-rd-markdown).

2. **AC2 — Baseline RD export as HTML**: The Export control also offers an "HTML" option. Clicking it downloads a `.html` file named `baseline-rd-v{version}.html`. The file is a self-contained (inline `<style>`, no external resources) HTML document that renders each section title as an `<h2>` and section content inside a preformatted `<div style="white-space: pre-wrap">`. HTML special characters in content (`&`, `<`, `>`, `"`) are escaped via a pure `escapeHtml` function. See [Format: Baseline RD HTML](#format-baseline-rd-html).

3. **AC3 — Drift Report export as Markdown**: When a non-failed Drift Report exists (`driftReport !== null && driftReport.status !== "failed"`), an "Export Drift Report" button appears on the drift page alongside the existing "Regenerate" button. Clicking it downloads a `.md` file named `drift-report-v{version}.md`. The file groups items by dimension (using display labels from `DriftDimensions.tsx`), each item with severity, category, title, description, evidence (if present), and the Baseline RD section reference (if present). Empty reports produce a valid file with "No drift items detected." See [Format: Drift Report Markdown](#format-drift-report-markdown).

4. **AC4 — BMAD PRD format export (bmad_detected only)**: When the project's Knowledge Base has `bmad_detected === true` AND the Baseline RD is approved, the Export control offers an additional "BMAD PRD" option. Clicking it downloads three files in sequence: `prd.md` (RD sections as a BMAD-style PRD with YAML front matter), `addendum.md` (confidence scores table, divergence notes, generation metadata), and `decision-log.md` (ADRs from `getBmadMetadata`, or "No ADRs detected." when none exist). The three downloads fire from a single user click (sequential `downloadFile` calls). See [Format: BMAD PRD Files](#format-bmad-prd-files).

5. **AC5 — Export control placement and visibility**:
   - **Baseline RD page**: The Export control sits in the `BaselineRdViewer` header bar, inside the existing `ml-auto flex items-center gap-2` div (alongside Approve/Mark-as-Draft). Visible ONLY when `rd.status === "approved"`. Hidden when status is `draft` (the BA must approve first — matches the epic AC wording "Given an approved Baseline RD"). The BMAD PRD option appears only when `bmadDetected === true`.
   - **Drift page**: The "Export Drift Report" button sits in the drift page's existing `flex justify-end mb-4` div (next to Regenerate). Visible when `hasOldRd && driftReport !== null && !isFailedReport`. Hidden when the report is failed, null, or no Old RD.
   - Neither control appears in loading, empty, or error states.

6. **AC6 — Export utilities are pure and unit-tested**: All string-building functions live in `exportFormatters.ts` — a pure module with NO React, NO Convex, NO DOM imports (fully unit-testable like `baselinePrompts.ts`). The DOM download helper lives in `downloadFile.ts` — a thin wrapper around `Blob` + `URL.createObjectURL` + anchor click (mirrors the existing `FlakinessMap/ExportCsv.tsx` pattern). The `downloadFile` helper is NOT unit-tested (DOM side-effect); the formatters ARE.

7. **AC7 — Filename conventions**:
   - Baseline RD Markdown: `baseline-rd-v{version}.md`
   - Baseline RD HTML: `baseline-rd-v{version}.html`
   - Drift Report: `drift-report-v{version}.md`
   - BMAD PRD files: `prd.md`, `addendum.md`, `decision-log.md` (exact names — BMAD tooling expects these; no version suffix per FR-B8)

8. **AC8 — Tests**:
   - **Unit tests** (`exportFormatters.test.ts`): Markdown structure (heading, metadata, sections), HTML structure (DOCTYPE, escaped content, confidence badges), drift markdown (dimension grouping, empty-report case), BMAD prd/addendum/decision-log content, ADR formatting, "No ADRs detected" case, HTML escaping (`<script>` → `&lt;script&gt;`), version interpolation in filenames.
   - **Component tests** (`ExportBaselineRd.test.tsx`): export control hidden when draft, visible when approved, dropdown opens on click, Markdown/HTML options present, BMAD option present only when `bmadDetected`, clicking an option calls `downloadFile` with the right filename (mock `downloadFile`). `ExportDriftReport.test.tsx`: button click calls `downloadFile` with `drift-report-v{version}.md`.

## Tasks / Subtasks

- [x] Task 1: Pure formatter module + download helper (AC: #1, #2, #3, #4, #6, #7)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/exportFormatters.ts` — pure module, NO React/DOM/Convex imports.
  - [x] Export `buildBaselineRdMarkdown(rd: { version; generated_at; sections }): string`.
  - [x] Export `buildBaselineRdHtml(rd: { version; generated_at; updated_at?; sections }): string`.
  - [x] Export `buildDriftReportMarkdown(report: { version; generated_at; items }): string` — reuse `DIMENSION_LABELS`, `SEVERITY_LABELS`, `CATEGORY_LABELS`, `RD_SECTION_LABELS` from `./drift/DriftDimensions` and `groupByDimension` for grouping. Import the `DriftItem` type from `./drift/DriftDimensions`.
  - [x] Export `buildBmadPrdMarkdown(rd: { version; generated_at; sections }): string` — YAML front matter + `## {title}` sections.
  - [x] Export `buildBmadAddendumMarkdown(rd: { version; generated_at; updated_at?; sections }): string` — confidence table + divergence notes + metadata.
  - [x] Export `buildBmadDecisionLogMarkdown(adrs: Array<{ key; content; source_path; metadata? }>): string` — each ADR as `## {key/title}` with status and content; "No ADRs detected." when array is empty.
  - [x] Export `escapeHtml(s: string): string` — escape `&`, `<`, `>`, `"`.
  - [x] Create `src/app/(auth)/projects/[id]/baseline/downloadFile.ts` — `downloadFile(content: string, filename: string, mimeType?: string): void`. Default mimeType `"text/plain;charset=utf-8;"`. Mirrors `FlakinessMap/ExportCsv.tsx:26-34` exactly (Blob → createObjectURL → anchor → click → revokeObjectURL).

- [x] Task 2: Write formatter unit tests (AC: #8) — TDD: write these FIRST, watch them fail, then implement Task 1.
  - [x] Create `src/app/(auth)/projects/[id]/baseline/exportFormatters.test.ts`.
  - [x] `buildBaselineRdMarkdown`: contains `# Baseline Requirements Document`; contains `Version {version}`; each section renders as `## {title}` followed by content; multi-section ordering preserved; empty content string still produces `## {title}\n\n`.
  - [x] `buildBaselineRdHtml`: starts with `<!DOCTYPE html>`; contains `<title>` with version; content with `<script>` tags is escaped to `&lt;script&gt;`; each section title in `<h2>`; confidence badge class applied (`conf-high`/`conf-medium`/`conf-low`); `&` in content escaped.
  - [x] `buildDriftReportMarkdown`: groups by dimension with display labels; each item shows severity + category + title + description; evidence present when item has evidence; RD section reference present when `rd_section_id` set; empty items array → "No drift items detected."; ADR-drift dimension included when present.
  - [x] `buildBmadPrdMarkdown`: starts with YAML front matter (`---\n`); contains `title:`, `version:`, `generated_at:`; sections as `## {title}`.
  - [x] `buildBmadAddendumMarkdown`: confidence table with all sections; divergence note included when present; metadata block with version + generated_at + updated_at.
  - [x] `buildBmadDecisionLogMarkdown`: empty array → "No ADRs detected."; ADR entries render `## {key}` + content; multiple ADRs separated by `---`.
  - [x] `escapeHtml`: `<` → `&lt;`; `>` → `&gt;`; `&` → `&amp;`; `"` → `&quot;`; `&` escaped before others (ordering).

- [x] Task 3: ExportBaselineRd component (AC: #1, #2, #4, #5)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx` — client component.
  - [x] Props: `{ rd: Doc<"baseline_rds">; bmadDetected: boolean }`.
  - [x] When `bmadDetected === true`, query BMAD metadata: `const bmadMetadata = useQuery(api.knowledge.queries.getBmadMetadata, bmadDetected ? { knowledge_base_id: rd.knowledge_base_id } : "skip")`. Extract `adrs` array (defensive null check — query may return null on workspace mismatch).
  - [x] Dropdown: `useState<boolean>(false)` for open/close. A "Export" `<Button variant="secondary" size="sm">` toggles the menu. Menu is an absolutely-positioned `<div>` with format options. Click-outside closes (useEffect + `document.addEventListener("click", handler)` with ref check — standard pattern). Close after a format is clicked.
  - [x] Options: "Markdown" (always), "HTML" (always), "BMAD PRD" (only when `bmadDetected`).
  - [x] Markdown handler: `downloadFile(buildBaselineRdMarkdown(rd), \`baseline-rd-v${rd.version}.md\`, "text/markdown;charset=utf-8;")`.
  - [x] HTML handler: `downloadFile(buildBaselineRdHtml(rd), \`baseline-rd-v${rd.version}.html\`, "text/html;charset=utf-8;")`.
  - [x] BMAD handler: three sequential `downloadFile` calls — `buildBmadPrdMarkdown(rd)` → `prd.md`, `buildBmadAddendumMarkdown(rd)` → `addendum.md`, `buildBmadDecisionLogMarkdown(adrs ?? [])` → `decision-log.md`. No delay between calls (browsers handle sequential downloads; Chrome may show a "allow multiple downloads" prompt — expected).
  - [x] Wrap each handler in try/catch + `useErrorLogger` (project rule: all UI catch blocks call `logError`).

- [x] Task 4: Write ExportBaselineRd component tests (AC: #8)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx`.
  - [x] Mock `convex/react` (`useQuery` returns `null` for BMAD metadata by default), `@/lib/convex`, `@/lib/error-logger`.
  - [x] Mock `./downloadFile` via `vi.mock("./downloadFile", () => ({ downloadFile: vi.fn() }))` and `./exportFormatters` via `vi.mock("./exportFormatters", ...)` returning spy functions. Alternatively, test the real formatters + mock only `downloadFile` (preferred — integration of formatter → download is the real behavior).
  - [x] Tests: control not rendered when `rd.status === "draft"`; Export button rendered when approved; clicking Export opens menu; menu shows "Markdown" and "HTML"; menu shows "BMAD PRD" only when `bmadDetected === true`; clicking Markdown calls `downloadFile` with `.md` filename; clicking HTML calls `downloadFile` with `.html` filename; clicking BMAD PRD calls `downloadFile` three times (prd.md, addendum.md, decision-log.md); menu closes after selection.

- [x] Task 5: ExportDriftReport component (AC: #3, #5)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/drift/ExportDriftReport.tsx` — client component.
  - [x] Props: `{ report: Doc<"drift_reports"> }`.
  - [x] Single `<Button variant="secondary" size="sm">` labeled "Export Drift Report" with a download SVG icon.
  - [x] Handler: `downloadFile(buildDriftReportMarkdown(report), \`drift-report-v${report.version}.md\`, "text/markdown;charset=utf-8;")`.
  - [x] Import `buildDriftReportMarkdown` from `../exportFormatters` and `downloadFile` from `../downloadFile`.
  - [x] Wrap in try/catch + `useErrorLogger`.

- [x] Task 6: Write ExportDriftReport component tests (AC: #8)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/drift/ExportDriftReport.test.tsx`.
  - [x] Mock `../downloadFile` (`vi.mock`); use real `buildDriftReportMarkdown` OR mock it too — preferred: real formatter + mocked download.
  - [x] Tests: button renders; clicking calls `downloadFile` once with `drift-report-v{version}.md` filename; correct markdown content passed (verify via `expect(downloadFile).toHaveBeenCalledWith(content, filename, mimeType)` where content includes section titles).

- [x] Task 7: Wire ExportBaselineRd into the baseline page (AC: #5)
  - [x] Modify `src/app/(auth)/projects/[id]/baseline/page.tsx`: derive `const bmadDetected = kb?.bmad_detected === true;` and pass `<BaselineRdViewer rd={baselineRd} bmadDetected={bmadDetected} />`.
  - [x] Modify `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx`:
    - Add `bmadDetected: boolean` to props.
    - Import `ExportBaselineRd`.
    - In the header's `ml-auto flex items-center gap-2` div, render `<ExportBaselineRd rd={rd} bmadDetected={bmadDetected} />` BEFORE the Approve/Mark-as-Draft buttons. The control internally checks `rd.status === "approved"` and renders null otherwise — OR the viewer gates it. Preferred: ExportBaselineRd handles its own visibility (single responsibility); the viewer always renders it and the component returns null when not approved.

- [x] Task 8: Wire ExportDriftReport into the drift page (AC: #5)
  - [x] Modify `src/app/(auth)/projects/[id]/baseline/drift/page.tsx`:
    - Import `ExportDriftReport`.
    - In the `flex justify-end mb-4` div (lines 175-194), add `<ExportDriftReport report={driftReport} />` alongside the existing Regenerate button. This div is inside the `hasOldRd && driftReport !== null && !isFailedReport` branch, so the visibility gate is already satisfied.

- [x] Task 9: Update existing tests for prop changes (AC: #8)
  - [x] `BaselineRdViewer.test.tsx`: the viewer now receives `bmadDetected` prop via the page. The page test mocks `getKnowledgeBase` returning `readyKb` (which lacks `bmad_detected` — defaults to `false`). Add a test case where `mockKb` includes `bmad_detected: true` and verify the BMAD PRD export option appears in the dropdown when RD is approved. Add a test case verifying Export control is absent when RD is draft (already covered by existing "approve" tests — the control is only in the approved state).
  - [x] `DriftReportViewer.test.tsx`: no changes needed (the export button is in the page, not the viewer). But if existing drift page tests exist, verify they still pass with the new button in the `flex justify-end` div.

- [x] Task 10: Run validation (AC: #8)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test` — all frontend tests pass (new formatter + component tests + existing viewer/drift tests unbroken).
  - [x] `pnpm test:convex` — all backend tests pass (no backend changes — verify no regressions).

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements (frontend only):**
- Pure formatter functions for Markdown, HTML, and BMAD PRD format exports
- A shared `downloadFile` DOM helper (Blob + anchor pattern)
- `ExportBaselineRd` dropdown component (Markdown / HTML / BMAD PRD)
- `ExportDriftReport` button component (Markdown)
- Wiring into the existing baseline and drift pages
- Comprehensive unit + component tests

**This story does NOT implement:**
- Server-side export (no Convex file storage, no HTTP routes — all client-side)
- Rich markdown rendering in HTML export (content is preformatted text — see [HTML Export Decision](#html-export-decision))
- Zip bundling for BMAD PRD files (three sequential downloads — see [BMAD PRD Multi-File Decision](#bmad-prd-multi-file-decision))
- Export of archived or failed RDs/reports (gate: approved / non-failed)
- Export from the drift page for the Baseline RD (the baseline page owns RD export)
- Copy-to-clipboard (Epic 4 story 4.4 owns copyable story text; not in this story's ACs)
- Export progress UI (downloads are instant — no progress bar needed)

### No Schema Changes, No Backend Changes

This story is **entirely frontend**. All data sources already exist:
- `api.knowledge.queries.getBaselineRd` (Story 2.1) — returns `{ _id, project_id, knowledge_base_id, version, status, sections, generated_at, updated_at }`.
- `api.knowledge.queries.getDriftReport` (Story 2.2) — returns `{ _id, baseline_rd_id, version, status, items, bmad_detected, generated_at, ... }`.
- `api.knowledge.queries.getKnowledgeBase` (Story 1.6) — returns the raw KB document including `bmad_detected`.
- `api.knowledge.queries.getBmadMetadata` (Story 1.9) — returns `{ prd_sections, adrs, conventions, domain_terms }` where each `adr` is a `Doc<"kb_bmad_metadata">` with `{ key, content, source_path, metadata }`.

**Do NOT modify** `convex/schema.ts`, `convex/knowledge/queries.ts`, or any other backend file. Zero backend changes.

### Format: Baseline RD Markdown

```markdown
# Baseline Requirements Document

_Version 3 · Generated 2026-06-14T10:30:00.000Z · Status: Approved_

## Overview

The application is a test management platform...

## Tech Stack

- Next.js 16
- Convex
- Tailwind CSS v4

## Modules
...
```

**Rules:**
- Top-level `#` heading (exactly one).
- Metadata line in italic (`_..._`), single line.
- Each section: `## {section.title}` followed by a blank line, then `section.content` verbatim, then a blank line before the next section.
- No confidence scores in the Markdown body (those go in `addendum.md` for BMAD format). The Markdown export is a clean document for sharing.

### Format: Baseline RD HTML

A self-contained HTML document with inline `<style>`. Structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Baseline Requirements Document — v{version}</title>
  <style>
    /* Inline styles — see implementation. Body max-width 820px, readable typography. */
    /* Section content: white-space: pre-wrap; font-family: monospace; background: #f6f8fa; padding: 16px; border-radius: 6px; */
    /* Confidence badges: .conf-high (green), .conf-medium (yellow), .conf-low (red) */
  </style>
</head>
<body>
  <h1>Baseline Requirements Document</h1>
  <div class="metadata">Version {version} · Generated {date} · Status: Approved</div>
  <h2>{section.title} <span class="confidence conf-{band}">{label} ({confidence})</span></h2>
  <div class="section-content">{escaped content}</div>
  ...
</body>
</html>
```

**HTML Export Decision**: Section content is rendered as preformatted text (`white-space: pre-wrap` in a styled div), NOT as rendered markdown. Rationale: (a) no markdown library is installed (established in Story 2.3), (b) consistent with how the viewer renders content, (c) adding a renderer is scope creep. A future enhancement story can add `react-markdown` for both the viewer and the HTML export. The content IS readable in the HTML file — it preserves the markdown formatting visually via `pre-wrap`.

**Critical**: All content passed through `escapeHtml` before insertion. The content is AI-generated (semi-untrusted). Never insert raw content into HTML — XSS prevention even in a downloaded file (the file could be opened by a third party).

### Format: Drift Report Markdown

```markdown
# Drift Report

_Version 2 · Generated 2026-06-14T12:00:00.000Z · Baseline RD v3_

## Old RD vs Code (3 items)

### [Breaking] [Added] New authentication module
The codebase includes an Auth module using Better Auth that is not described in the Old RD.

**RD section:** Modules

**Evidence:**
```
convex/lib/requireAuth.ts implements requireAuth()...
```

---

### [Significant] [Changed] API endpoint renamed
...

## Architecture Decision Drift (1 item)

### [Breaking] [Changed] ADR-0003 overridden
...
```

**Rules:**
- Top-level `#` heading + metadata line (version, generated date, baseline RD reference).
- Items grouped by dimension using `DIMENSION_LABELS` display names (via `groupByDimension` from `DriftDimensions.tsx`).
- ADR-drift dimension shown as a separate `## Architecture Decision Drift` section (matches the viewer).
- Each item: `### [{severity}] [{category}] {title}` followed by description.
- Optional fields included when present: `**RD section:** {RD_SECTION_LABELS[id]}`, `**Evidence:**` in a fenced code block, `**Old RD reference:** {text}`.
- Empty report: `## No drift items detected.\n\nThe current code matches the Old Requirements Document.` after the metadata line.
- Items separated by `---` (horizontal rule).

### Format: BMAD PRD Files

**prd.md** — BMAD-style PRD with YAML front matter:

```markdown
---
title: Baseline Requirements Document
version: {version}
generated_at: {ISO date}
status: approved
---

# Requirements Document

## Overview
{content}

## Tech Stack
{content}

## Modules
{content}

## API Surface
{content}

## Data Model
{content}

## User Flows
{content}

## Decision Log
{decision-log content if the section exists}
```

**addendum.md** — supplementary details:

```markdown
# Baseline RD Addendum

Generated from Knowledge Base analysis. Confidence scores reflect AI self-assessment of evidence quality per section.

## Section Confidence Scores

| Section | Confidence | Assessment |
|---------|-----------|------------|
| Overview | 0.85 | High |
| Tech Stack | 0.40 | Low |
| Modules | 0.72 | Medium |

## Divergence Notes

### Tech Stack
{divergence_note}

_BMAD alignment: diverge (PRD section: "Tech Stack")_

## Generation Metadata

- **Version:** {version}
- **Generated:** {ISO date}
- **Last edited:** {ISO date or "Never"}
- **Sections:** {count}
```

**Rules for addendum.md:**
- Confidence table includes ALL sections, with band labels matching `baselineRdHelpers.ts` (`confidenceLabel`): ≥0.8 "High", ≥0.5 "Medium", <0.5 "Low".
- Divergence notes section: only sections with a `divergence_note` appear. If none, omit the section entirely (don't render an empty "## Divergence Notes" with nothing under it).
- BMAD alignment line included when `bmad_alignment` is present on the section.

**decision-log.md** — ADRs from `getBmadMetadata`:

```markdown
# Decision Log

## ADR-0001: Separate Test Runner

Status: accepted

{ADR content from kb_bmad_metadata.content}

---

## ADR-0002: Runner Uses Convex Subscriptions

Status: accepted

{content}
```

When no ADRs exist (`adrs.length === 0`):

```markdown
# Decision Log

No ADRs detected.
```

**ADR metadata casting**: `kb_bmad_metadata.metadata` is `v.optional(v.any())` (Story 1.5 schema debt, documented in `deferred-work.md` line 70). Cast defensively: `const m = (entry.metadata ?? {}) as { title?: string; status?: string }`. Use `entry.key` as the ADR identifier (e.g., "ADR-0001"). Use `m.title` for the heading if present, otherwise fall back to `entry.key`. Use `m.status` if present (e.g., "accepted", "superseded"). This mirrors the Story 1.9 defensive cast pattern documented in `_getBmadMetadataForExtraction`.

### BMAD PRD Multi-File Decision

FR-B8 specifies "three files": `prd.md`, `addendum.md`, `decision-log.md`. The implementation fires three sequential `downloadFile` calls from a single click handler (no `setTimeout` delay — browsers process synchronous anchor clicks in sequence).

**Why not zip**: Adding `jszip` (or similar) is a new dependency (~44KB) for a single export feature. The sequential-download approach requires zero dependencies. Chrome's "allow multiple downloads" prompt is a one-time per-site permission; Firefox and Safari download all three without prompts. This is the pragmatic MVP choice.

**Why not concatenate into one file**: BMAD tooling expects three separate files with exact names (`prd.md`, `addendum.md`, `decision-log.md`). Concatenating breaks round-trip compatibility with BMAD import — the entire point of FR-B8.

### Download Pattern — Mirror Existing Code

The `downloadFile` helper mirrors two existing implementations in the codebase:

1. `src/components/FlakinessMap/ExportCsv.tsx:26-34` — `downloadCsv(content, filename)`:
   ```typescript
   const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
   const url = URL.createObjectURL(blob);
   const link = document.createElement("a");
   link.href = url;
   link.download = filename;
   link.click();
   URL.revokeObjectURL(url);
   ```

2. `src/app/(auth)/runs/[id]/page.tsx:144-150` — inline `handleDownloadLog`:
   ```typescript
   const blob = new Blob([parts.join("\n\n")], { type: "text/plain" });
   const blobUrl = URL.createObjectURL(blob);
   const a = document.createElement("a");
   a.href = blobUrl;
   a.download = `run-${String(runId).slice(0, 12)}-logs.txt`;
   a.click();
   URL.revokeObjectURL(blobUrl);
   ```

The new `downloadFile` generalizes this pattern with a configurable `mimeType` parameter (default `"text/plain;charset=utf-8;"`). Callers pass `"text/markdown;charset=utf-8;"` or `"text/html;charset=utf-8;"` as appropriate. **Do NOT add a `downloadCsv`-style naming convention** — the FlakinessMap's `downloadCsv` is CSV-specific; this helper is format-agnostic.

### Dropdown Pattern — Minimal State, No UI Library

The codebase has NO dropdown/menu/popover component in `src/components/ui/`. Building a minimal dropdown for the Export control:

```tsx
const [open, setOpen] = useState(false);
const ref = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!open) return;
  const handler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [open]);
```

**Why `mousedown` not `click`**: `mousedown` fires before `click`, so the outside-click closes the menu before any underlying element's click handler runs. This prevents accidental double-actions. The existing codebase doesn't have a click-outside pattern to mirror, so this is the standard React dropdown approach.

**Why not `<details>`/`<summary>`**: Native, but doesn't close on option click without JS anyway. The `useState` approach is cleaner and closes immediately after selection.

**Menu positioning**: `absolute right-0 top-full mt-1` relative to the button container (`relative`). `z-10` to sit above section cards. `min-w-[160px]` for consistent width. Styling matches existing card/pill aesthetics (`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--elev-raised)]`).

### ADR Data Flow for BMAD PRD Export

```
ExportBaselineRd (bmadDetected=true)
  → useQuery(api.knowledge.queries.getBmadMetadata, { knowledge_base_id: rd.knowledge_base_id })
  → returns { prd_sections, adrs, conventions, domain_terms } | null
  → adrs: Array<Doc<"kb_bmad_metadata">>  where each = { _id, kb_id, type: "adr", key, content, source_path, metadata }
  → buildBmadDecisionLogMarkdown(adrs ?? [])  // null-safe
```

The `getBmadMetadata` query uses `getOptionalMemberWorkspace` for ownership — it returns `null` on workspace mismatch (not an error). The ExportBaselineRd component must handle `bmadMetadata === undefined` (loading — though by the time the BA clicks export, it's loaded since `bmadDetected` was true on page load) and `bmadMetadata === null` (treat as empty ADRs: pass `[]` to the formatter). Use the `"skip"` pattern when `!bmadDetected` to avoid unnecessary queries on non-BMAD projects.

### Existing Code to Modify

| File | Change | Breaking? |
|------|--------|-----------|
| `src/app/(auth)/projects/[id]/baseline/page.tsx` | Derive `bmadDetected` from `kb`; pass to `<BaselineRdViewer>` | No — additive prop |
| `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx` | Accept `bmadDetected` prop; render `<ExportBaselineRd>` in header | No — additive prop + component |
| `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` | Render `<ExportDriftReport>` in the `flex justify-end` div | No — additive component |
| `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx` | Update mocked `getKnowledgeBase` to optionally include `bmad_detected`; add BMAD export test | No — additive test cases |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/app/(auth)/projects/[id]/baseline/exportFormatters.ts` | Pure formatter functions: `buildBaselineRdMarkdown`, `buildBaselineRdHtml`, `buildDriftReportMarkdown`, `buildBmadPrdMarkdown`, `buildBmadAddendumMarkdown`, `buildBmadDecisionLogMarkdown`, `escapeHtml`. NO React/DOM/Convex imports. |
| `src/app/(auth)/projects/[id]/baseline/exportFormatters.test.ts` | Unit tests for all formatters (vitest, no rendering). |
| `src/app/(auth)/projects/[id]/baseline/downloadFile.ts` | `downloadFile(content, filename, mimeType?)` DOM helper. NO React. |
| `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx` | Export dropdown component (Markdown / HTML / BMAD PRD). Client component. |
| `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx` | Component tests (dropdown visibility, option clicks, download calls). |
| `src/app/(auth)/projects/[id]/baseline/drift/ExportDriftReport.tsx` | Export button component (Markdown). Client component. |
| `src/app/(auth)/projects/[id]/baseline/drift/ExportDriftReport.test.tsx` | Component tests. |

### Key Existing APIs (all exist — no backend deps)

- `api.knowledge.queries.getBaselineRd` — returns the RD with `sections`, `status`, `version`, `generated_at`, `updated_at`, `knowledge_base_id`. **The data source for RD exports.**
- `api.knowledge.queries.getDriftReport` — returns the report with `items`, `version`, `baseline_rd_id`, `bmad_detected`, `generated_at`. **The data source for drift export.**
- `api.knowledge.queries.getKnowledgeBase` — returns the raw KB document including `bmad_detected`. **The source for the BMAD-export visibility gate.**
- `api.knowledge.queries.getBmadMetadata` — returns `{ prd_sections, adrs, conventions, domain_terms }`. **The source of ADRs for `decision-log.md`.**
- `Doc<"baseline_rds">` from `@/lib/convex` — frontend type for the RD.
- `Doc<"drift_reports">` from `@/lib/convex` — frontend type for the drift report.
- `DIMENSION_LABELS`, `SEVERITY_LABELS`, `CATEGORY_LABELS`, `RD_SECTION_LABELS`, `groupByDimension`, `DriftItem` type from `DriftDimensions.tsx` — **reuse for drift markdown formatting** (single source of truth for labels).
- `confidenceLabel` from `baselineRdHelpers.ts` — reuse for the addendum confidence table band labels (High/Medium/Low). Alternatively, inline the same logic in `exportFormatters.ts` to keep it pure (no cross-file import). **Preferred: inline the logic** (`buildBmadAddendumMarkdown` is pure — it should not import from a `.tsx` file that imports Convex types). Define a local `confidenceBand(confidence): string` in `exportFormatters.ts`.

### UI Components (all exist — no new ones)

- `Button` (`src/components/ui/Button.tsx`) — variants: `primary`, `secondary`, `ghost`, `danger`; sizes: `default`, `sm`, `icon`. Use `variant="secondary" size="sm"` for the Export button (matches Regenerate/Back buttons).
- `StatusPill` (`src/components/ui/StatusPill.tsx`) — not needed in this story (the export components don't show status pills).
- No `Alert` needed — export errors are caught + logged; no inline error display (the download either works or silently fails; the BA re-clicks). If an error occurs, `logError` captures it for debugging. This matches the FlakinessMap CSV export behavior (no error UI).

### Previous Story Intelligence

**Story 2.3 (Baseline RD Viewer & Inline Editor) — direct predecessor:**
1. **Page structure**: The baseline page (`page.tsx`) is the integration point. It already queries `getBaselineRd` and `getKnowledgeBase`. This story adds `bmadDetected` derivation and passes it through.
2. **Viewer header layout**: The `BaselineRdViewer` header has a `ml-auto flex items-center gap-2` div with status buttons. The Export control slots in here. When approved: Export + "Mark as Draft" coexist. When draft: only "Approve" (Export is hidden).
3. **`whitespace-pre-wrap` rendering**: Story 2.3 renders section content as preformatted text (no markdown library). The HTML export mirrors this — content goes in a styled `<div>` with `white-space: pre-wrap`. Consistent decision, documented in [HTML Export Decision](#html-export-decision).
4. **Test mocking pattern**: `BaselineRdViewer.test.tsx` hoists `vi.mock("convex/react", ...)`, uses string-keyed `useQuery` mock matching on query reference name, `mockXxx` module-level let variables reset in `beforeEach`. Follow this exact pattern for the new component tests.
5. **Error scraping regex**: `err.message.replace(/^Uncaught ConvexError:\s*/, "")` — not needed here (no Convex mutations in this story), but the try/catch + `useErrorLogger` pattern still applies to click handlers.

**Story 2.2 (Drift Report Generation):**
1. **Drift page layout**: The drift page (`drift/page.tsx`) has a `flex justify-end mb-4` div with the Regenerate button (lines 175-194). The Export button slots in alongside. This div is inside the `hasOldRd && driftReport !== null && !isFailedReport` branch — the visibility gate is already correct.
2. **DriftDimensions.tsx**: THE source of label maps (`DIMENSION_LABELS`, `SEVERITY_LABELS`, `CATEGORY_LABELS`, `RD_SECTION_LABELS`) and the `groupByDimension` function. The drift markdown formatter imports these — DO NOT duplicate label maps.

**Story 2.1 (Baseline RD Generation):**
1. **Section structure**: `ensureRequiredSections` (`baselinePrompts.ts:176-216`) guarantees the six required sections exist (plus `decision-log` for BMAD projects). The formatter can assume these sections are present. The `decision-log` section appears on BMAD RDs — include it in the BMAD PRD `prd.md` when present.

**Epic 1 Retrospective — defects to avoid:**

| Epic 1 Defect | Mitigation in This Story |
|---------------|--------------------------|
| **`v.any()` type debt** | No schema changes. Formatter functions accept typed params (`Doc<"baseline_rds">`, `Doc<"drift_reports">`). ADR metadata cast is defensive (`as { title?: string; status?: string }`) — documented, not silent. |
| **Missing error handlers** | All click handlers wrapped in try/catch + `useErrorLogger`. Download failures (rare — browser blocks) are caught + logged. |
| **Reinventing wheels** | `downloadFile` mirrors `ExportCsv.tsx` exactly. Drift labels imported from `DriftDimensions.tsx` (not duplicated). Formatter structure mirrors `baselinePrompts.ts` (pure module, no side effects). |
| **Wrong file locations** | Formatters + components colocated with the baseline page (matches `BaselineRdViewer.tsx` / `BaselineRdSection.tsx` / `baselineRdHelpers.ts` convention). Drift export component in the drift subfolder (matches `DriftReportViewer.tsx` convention). |

### Git Intelligence

Recent commits (single `feat:` commit per story — follow this pattern):
- `ba01227` — Story 2.3 (Baseline RD Viewer & Inline Editor) — **direct predecessor; the viewer and page are the integration points.**
- `4a8dfcd` — Story 2.2 (Drift Report Generation) — **owns the drift page and DriftDimensions.tsx.**
- `90b4f4b` — Story 2.1 (Baseline RD Generation) — **owns the schema, queries, and section structure.**

Baseline commit for this story: `ba01227` (latest on main — Story 2.3 complete).

### Project Structure Notes

- `exportFormatters.ts` — pure module, NO `"use client"`, NO React, NO Convex imports. Fully unit-testable without jsdom. Mirrors `baselinePrompts.ts` (also a pure module in the same folder). The drift label imports from `./drift/DriftDimensions` are type-only-safe (the labels are plain constant objects).
- `downloadFile.ts` — pure DOM module, NO React. NO `"use client"` needed (it's not a component). But it uses `document`/`URL` — only call from event handlers (client-side). The file has no module-level DOM access, so it imports cleanly in tests (vitest jsdom provides `document` and `URL`).
- `ExportBaselineRd.tsx` — `"use client"` component. Uses `useState`, `useEffect`, `useRef`, `useQuery` from `convex/react`.
- `ExportDriftReport.tsx` — `"use client"` component. Minimal (a button + handler).
- All new files are under `src/app/(auth)/projects/[id]/baseline/` — colocated with the page they serve (matches `BaselineRdViewer.tsx`, `BaselineRdSection.tsx`, `baselineRdHelpers.ts`).

### Deferred Work to Resolve This Story

Per retrospective action item A8 ("every story spec includes a deferred-work section"), review `deferred-work.md` for items this story can opportunistically resolve:

- **Unsafe type cast on metadata field** (`deferred-work.md` line 70): This story casts ADR `metadata` defensively (`as { title?: string; status?: string }`). Does NOT fix the underlying `v.any()` schema debt (out of scope — would need a schema migration affecting Story 1.9 code). Documented in [ADR metadata casting](#format-bmad-prd-files).
- **No `*-free` model guard**: Not applicable — this story makes no AI calls.
- **Stale drift report detection**: Already resolved by Story 2.3 (AC10). Not re-addressed here.
- **Duplicated error-scraping regex** (`deferred-work.md` line 38): This story does not scrape ConvexError messages (no mutations called). No new duplication introduced.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — ACs and user story (lines 570-595)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md#Story 2.4 Enhanced] — BMAD PRD format ACs (lines 243-255)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-27] — Export Baseline RD as Markdown or HTML
- [Source: _bmad-output/planning-artifacts/epics.md#FR-62] — Export Baseline RD as Markdown or HTML (duplicate FR)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-B8] — Baseline RD exportable as BMAD PRD format (prd.md + addendum.md + decision-log.md)
- [Source: _bmad-output/implementation-artifacts/2-3-baseline-rd-viewer-inline-editor.md] — **Direct predecessor; the viewer and page are the integration points**
- [Source: _bmad-output/implementation-artifacts/2-2-drift-report-generation.md] — **Owns the drift page and DriftDimensions.tsx**
- [Source: _bmad-output/implementation-artifacts/2-1-baseline-rd-generation.md] — **Owns the schema, queries, and section structure**
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md] — Epic 1 lessons (defects to avoid)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#line 70] — Unsafe metadata cast (addressed defensively in this story)
- [Source: _bmad-output/project-context.md] — Critical implementation rules (versions, error logging, immutability, no comments)
- [Source: convex/knowledge/queries.ts:156-191] — `getBaselineRd` query — **the data source for RD exports**
- [Source: convex/knowledge/queries.ts:193-230] — `getDriftReport` query — **the data source for drift export**
- [Source: convex/knowledge/queries.ts:248-288] — `getBmadMetadata` query — **the source of ADRs for decision-log.md**
- [Source: convex/knowledge/queries.ts:106-125] — `getKnowledgeBase` query — **the source of `bmad_detected`**
- [Source: convex/lib/validation.ts:147-163] — `rdSectionValidator` (section shape: id, title, content, confidence, divergence_note?, bmad_alignment?)
- [Source: convex/lib/validation.ts:165-187] — `driftItemValidator` (item shape: dimension, category, severity, title, description, rd_section_id?, evidence?, old_rd_reference?)
- [Source: convex/schema.ts:444-462] — `baseline_rds` table (no changes needed)
- [Source: convex/schema.ts:464-483] — `drift_reports` table (no changes needed)
- [Source: convex/knowledge/baselinePrompts.ts:158-165] — `REQUIRED_RD_SECTION_IDS` — the six guaranteed section IDs
- [Source: src/app/(auth)/projects/[id]/baseline/page.tsx] — **THE page to modify** (derive `bmadDetected`, pass to viewer)
- [Source: src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx] — **THE viewer to modify** (add Export control in header)
- [Source: src/app/(auth)/projects/[id]/baseline/baselineRdHelpers.ts] — `confidenceLabel` logic reference (inline in formatter to keep it pure)
- [Source: src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx] — **THE test mocking pattern** (hoist vi.mock, string-keyed useQuery mock, beforeEach reset)
- [Source: src/app/(auth)/projects/[id]/baseline/drift/page.tsx:175-194] — **WHERE to add the Export button** (alongside Regenerate in the `flex justify-end` div)
- [Source: src/app/(auth)/projects/[id]/baseline/drift/DriftDimensions.tsx] — **THE label source** (DIMENSION_LABELS, SEVERITY_LABELS, CATEGORY_LABELS, RD_SECTION_LABELS, groupByDimension, DriftItem type)
- [Source: src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.tsx] — component structure reference (card-per-group, severity badges)
- [Source: src/components/FlakinessMap/ExportCsv.tsx:26-34] — **THE download pattern to mirror** (Blob + createObjectURL + anchor + click + revoke)
- [Source: src/app/(auth)/runs/[id]/page.tsx:122-151] — **Alternative download pattern** (inline handleDownloadLog)
- [Source: src/components/ui/Button.tsx] — Button component (variants, sizes)
- [Source: convex/testHelpers.ts:193-294] — `seedBaselineRd`, `seedDriftReport` seed helpers (not needed — this story has no backend tests)

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2)

### Debug Log References

- Initial formatter test run failed on `buildBaselineRdMarkdown` empty-content section: `trimEnd()` removed the trailing newlines that the AC-required `## {title}\n\n` pattern needs. Fixed by removing `trimEnd()` from the markdown builder (trailing newline on a `.md` file is standard).
- ExportBaselineRd component tests initially failed because `<button role="menuitem">` overrides the implicit `button` role, making `getByRole("button")` unable to find menu items. Fixed by removing explicit ARIA roles — the minimal dropdown uses plain `<button>` elements (matches the "no UI library" Dev Notes decision).

### Completion Notes List

- **Task 1 + 2 (TDD)**: Pure `exportFormatters.ts` module with 7 exports (`buildBaselineRdMarkdown`, `buildBaselineRdHtml`, `buildDriftReportMarkdown`, `buildBmadPrdMarkdown`, `buildBmadAddendumMarkdown`, `buildBmadDecisionLogMarkdown`, `escapeHtml`). 36 unit tests covering markdown structure, HTML escaping (`<script>` → `&lt;script&gt;`), drift grouping by dimension, empty-report case, BMAD prd/addendum/decision-log formats, ADR formatting, and "No ADRs detected" case. Drift labels imported from `DriftDimensions.tsx` (single source of truth — no duplication). `confidenceBand`/`confidenceAssessment` inlined locally to keep the addendum formatter pure (per Dev Notes preference).
- **Task 3 + 4 (TDD)**: `ExportBaselineRd.tsx` dropdown component — renders null when RD is not approved, shows Markdown/HTML always, BMAD PRD only when `bmadDetected`. Uses `"skip"` pattern for conditional `getBmadMetadata` query. BMAD handler fires three sequential `downloadFile` calls (`prd.md`, `addendum.md`, `decision-log.md`). 9 component tests. Click-outside via `mousedown` listener (closes before underlying click handlers fire).
- **Task 5 + 6 (TDD)**: `ExportDriftReport.tsx` — single button, calls `downloadFile(buildDriftReportMarkdown(report), "drift-report-v{version}.md")`. 2 component tests.
- **Task 7**: Wired `ExportBaselineRd` into `BaselineRdViewer` header (`ml-auto flex items-center gap-2` div, before Approve/Mark-as-Draft). Page derives `bmadDetected = kb?.bmad_detected === true` and passes it through.
- **Task 8**: Wired `ExportDriftReport` into drift page `flex justify-end mb-4` div alongside Regenerate (inside the already-gated `hasOldRd && driftReport !== null && !isFailedReport` branch).
- **Task 9**: Updated `BaselineRdViewer.test.tsx` — added `getBmadMetadata` to mocked api + useQuery handler, added `mockBmadMetadata` variable, added 3 new test cases (Export absent when draft, BMAD PRD option when bmad_detected=true, no BMAD option when false). 17 total tests pass.
- **Task 10**: `pnpm lint` — 0 errors (43 pre-existing warnings, none from new files). `pnpm test` — 274 passed (22 files). `pnpm test:convex` — 863 passed (no backend changes, no regressions).
- **No schema changes, no backend changes** — entirely frontend, as specified. All data sources (`getBaselineRd`, `getDriftReport`, `getKnowledgeBase`, `getBmadMetadata`) already existed.
- All click handlers wrapped in try/catch + `useErrorLogger` per project rule.
- `downloadFile.ts` mirrors `ExportCsv.tsx:26-34` exactly (Blob → createObjectURL → anchor → click → revokeObjectURL).

### File List

**New files:**
- `src/app/(auth)/projects/[id]/baseline/exportFormatters.ts` — pure formatter module (7 exports)
- `src/app/(auth)/projects/[id]/baseline/exportFormatters.test.ts` — 36 unit tests
- `src/app/(auth)/projects/[id]/baseline/downloadFile.ts` — DOM download helper
- `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx` — Export dropdown component
- `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx` — 9 component tests
- `src/app/(auth)/projects/[id]/baseline/drift/ExportDriftReport.tsx` — Export button component
- `src/app/(auth)/projects/[id]/baseline/drift/ExportDriftReport.test.tsx` — 2 component tests

**Modified files:**
- `src/app/(auth)/projects/[id]/baseline/page.tsx` — derive `bmadDetected`, pass to viewer
- `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx` — accept `bmadDetected` prop, render `ExportBaselineRd` in header
- `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` — render `ExportDriftReport` alongside Regenerate
- `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx` — mock `getBmadMetadata`, add 3 export-visibility test cases

## Change Log

- 2026-06-14: Story 2.4 created — Baseline RD & Drift Export (frontend-only; pure formatters for Markdown/HTML/BMAD PRD; no schema or backend changes; gates on approved RD / non-failed drift report; BMAD PRD format produces three files via sequential downloads).
- 2026-06-14: Story 2.4 implemented — all 10 tasks complete (TDD: 50 new tests across 5 test files, 0 lint errors, 0 regressions). Status → review.
- 2026-06-14: Code review complete — 3-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 10 patches applied (4 decision-needed resolved + 6 unambiguous), 3 deferred, 13 dismissed. 281 frontend tests pass, 0 lint errors. Status → done.

### Review Findings

_Decision-needed (resolved → patch, all applied):_

- [x] [Review][Patch] downloadFile helper fragility — append anchor to DOM before click, remove after; defer URL.revokeObjectURL via setTimeout to avoid Safari revoking the blob before fetch completes [src/app/(auth)/projects/[id]/baseline/downloadFile.ts:8-12]
- [x] [Review][Patch] BMAD PRD export fires while bmadMetadata===undefined (loading) → adrs defaults to [] → silent "No ADRs detected." Disable BMAD PRD option while query is loading [src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx:82-89]
- [x] [Review][Patch] Export dropdown lacks keyboard/ARIA support — add aria-haspopup="menu", aria-expanded, role="menu"/role="menuitem", Escape-to-close, and arrow-key navigation [src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx:80-117]
- [x] [Review][Patch] Drift report metadata line omits "· Baseline RD v{version}" — add baseline_rd_version field to DriftReportExportInput, include in metadata line when present, pass from ExportDriftReport [src/app/(auth)/projects/[id]/baseline/exportFormatters.ts — buildDriftReportMarkdown]

_Patch (all applied):_

- [x] [Review][Patch] Partial BMAD export if 2nd/3rd builder throws after 1st download already fired — build all three strings before any downloadFile call [src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx:85-89]
- [x] [Review][Patch] Evidence containing triple backticks breaks the code fence early — scan for longest backtick run and use a longer fence [src/app/(auth)/projects/[id]/baseline/exportFormatters.ts — codeFence helper]
- [x] [Review][Patch] section.title containing `|` or newline breaks the addendum markdown table — escape pipes and replace newlines before table insertion [src/app/(auth)/projects/[id]/baseline/exportFormatters.ts — sanitizeTableCell helper]
- [x] [Review][Patch] buildBmadPrdMarkdown emits `## {title}\n{content}` with no blank line between heading and content — strict CommonMark parsers may not recognize the heading. Add blank line to match buildBaselineRdMarkdown [src/app/(auth)/projects/[id]/baseline/exportFormatters.ts — buildBmadPrdMarkdown]
- [x] [Review][Patch] Drift report H1 casing typo: `# Drift report` should be `# Drift Report` (capital R) per spec Format section line 210 [src/app/(auth)/projects/[id]/baseline/exportFormatters.ts — buildDriftReportMarkdown]
- [x] [Review][Patch] buildDriftReportMarkdown tests don't assert the H1 text or the metadata line — add assertions for `# Drift Report` and the version/Generated metadata to catch format regressions [src/app/(auth)/projects/[id]/baseline/exportFormatters.test.ts]

_Defer (pre-existing or test-quality, not blocking):_

- [x] [Review][Defer] useErrorLogger mock returns a fresh vi.fn() per call so logError invocations can never be asserted; catch blocks are effectively untested [src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx, drift/ExportDriftReport.test.tsx] — deferred, test-quality
- [x] [Review][Defer] groupByDimension return order is implicit — drift markdown output order relies on the helper's insertion order with no sort guarantee [src/app/(auth)/projects/[id]/baseline/exportFormatters.ts — buildDriftReportMarkdown] — deferred, robustness
- [x] [Review][Defer] ExportBaselineRd test mocks useQuery to always return null — BMAD PRD path never exercised with non-empty ADRs (adrs propagation untested) [src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx] — deferred, test-coverage
