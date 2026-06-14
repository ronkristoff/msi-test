import { z } from "zod";
import {
  DRIFT_MAX_CONTEXT_CHARS,
  DRIFT_OLD_RD_MAX_CHARS,
} from "../lib/constraints";

export const DRIFT_DIMENSIONS = [
  "old-rd-vs-code",
  "bmad-prd-vs-code",
  "bmad-conventions-vs-code",
  "adr-drift",
] as const;

export type DriftDimension = (typeof DRIFT_DIMENSIONS)[number];

const BMAD_DIMENSIONS: ReadonlySet<DriftDimension> = new Set([
  "bmad-prd-vs-code",
  "bmad-conventions-vs-code",
  "adr-drift",
]);

export const DIMENSION_LABELS: Record<DriftDimension, string> = {
  "old-rd-vs-code": "Old RD vs Code",
  "bmad-prd-vs-code": "BMAD PRD vs Code",
  "bmad-conventions-vs-code": "Conventions vs Code",
  "adr-drift": "Architecture Decision Drift",
};

export const DIMENSION_ORDER: DriftDimension[] = [
  "old-rd-vs-code",
  "bmad-prd-vs-code",
  "bmad-conventions-vs-code",
  "adr-drift",
];

export const SEVERITY_LABELS: Record<string, string> = {
  breaking: "Breaking",
  significant: "Significant",
  incremental: "Incremental",
};

export const CATEGORY_LABELS: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

export const KNOWN_RD_SECTION_IDS = [
  "overview",
  "tech-stack",
  "modules",
  "api-surface",
  "data-model",
  "user-flows",
  "decision-log",
] as const;

const driftItemZod = z.object({
  dimension: z.enum(DRIFT_DIMENSIONS),
  category: z.enum(["added", "removed", "changed"]),
  severity: z.enum(["breaking", "significant", "incremental"]),
  title: z.string(),
  description: z.string(),
  rd_section_id: z.string().optional(),
  evidence: z.string().optional(),
  old_rd_reference: z.string().optional(),
});

export const driftReportSchema = z.object({
  items: z.array(driftItemZod),
});

export type DriftItem = z.infer<typeof driftItemZod>;

export type BmadDriftContext = {
  prdSections: string;
  adrs: string;
  conventions: string;
};

export type BaselineRdSectionRef = {
  id: string;
  title: string;
  content: string;
};

export type DriftGenerationContext = {
  oldRdText: string;
  baselineRdSections: BaselineRdSectionRef[];
  architectureSummary: {
    architecture_summary: string;
    architecture_type: string;
    folder_structure: string;
    tech_stack: string[];
  };
  kbStats: {
    total_files: number;
    total_size_bytes: number;
  };
  bmadContext?: BmadDriftContext | null;
};

export function filterDriftDimensions(
  items: DriftItem[],
  opts: { bmad: boolean },
): DriftItem[] {
  if (opts.bmad) {
    return items.map((i) => ({ ...i }));
  }
  return items
    .filter((i) => !BMAD_DIMENSIONS.has(i.dimension))
    .map((i) => ({ ...i }));
}

export function validateDriftItemSectionIds(items: DriftItem[]): DriftItem[] {
  const known = new Set<string>(KNOWN_RD_SECTION_IDS);
  return items.map((i) => {
    if (i.rd_section_id && !known.has(i.rd_section_id)) {
      const { rd_section_id: _dropped, ...rest } = i;
      void _dropped;
      return rest as DriftItem;
    }
    return { ...i };
  });
}

export function boundDriftContext(
  ctx: DriftGenerationContext,
  opts?: { oldRdMaxChars?: number; totalMaxChars?: number },
): DriftGenerationContext {
  const oldRdMaxChars = opts?.oldRdMaxChars ?? DRIFT_OLD_RD_MAX_CHARS;
  const totalMaxChars = opts?.totalMaxChars ?? DRIFT_MAX_CONTEXT_CHARS;

  const oldRdText =
    ctx.oldRdText.length > oldRdMaxChars
      ? ctx.oldRdText.slice(0, oldRdMaxChars) + "\n\n...(Old RD truncated)"
      : ctx.oldRdText;

  const baselineRdSections: BaselineRdSectionRef[] = [];
  let used = oldRdText.length;
  for (const s of ctx.baselineRdSections) {
    const sep = baselineRdSections.length > 0 ? 2 : 0;
    const titleOverhead = `${s.title} (id: ${s.id})\n`.length;
    if (used + sep + titleOverhead > totalMaxChars) break;
    let content = s.content;
    const remaining = totalMaxChars - used - sep - titleOverhead;
    if (content.length > remaining) {
      const truncMarker = "\n...(section truncated)";
      const avail = remaining - truncMarker.length;
      content = avail > 15 ? content.slice(0, avail) + truncMarker : "";
    }
    baselineRdSections.push({ id: s.id, title: s.title, content });
    used += sep + titleOverhead + content.length;
  }

  return { ...ctx, oldRdText, baselineRdSections };
}

export function buildDriftReportPrompt(ctx: DriftGenerationContext): string {
  const sectionsBlock = ctx.baselineRdSections.length
    ? ctx.baselineRdSections
        .map((s) => `### ${s.title} (id: ${s.id})\n${s.content}`)
        .join("\n\n")
    : "_(no Baseline RD sections available)_";

  const bmadBlock = ctx.bmadContext
    ? `\n## BMAD Context (cross-reference sources)\n\n### BMAD PRD Sections\n${ctx.bmadContext.prdSections || "_(none detected)_"}\n\n### Architectural Decision Records\n${ctx.bmadContext.adrs || "_(none detected)_"}\n\n### Declared Conventions\n${ctx.bmadContext.conventions || "_(none detected)_"}\n`
    : "";

  const dimensionsInstructions = ctx.bmadContext
    ? `Produce drift items across ALL FOUR dimensions:
1. **old-rd-vs-code** — features added, removed, or changed between the Old RD and the current code/Baseline RD. Always populate this dimension when an Old RD exists.
2. **bmad-prd-vs-code** — divergences between the declared BMAD PRD sections and the extracted code structure.
3. **bmad-conventions-vs-code** — detected code patterns that violate the declared conventions.
4. **adr-drift** — architecture decisions that have changed since the ADRs were written.`
    : `Produce drift items ONLY in the **old-rd-vs-code** dimension. Do NOT produce any bmad-* or adr-drift items.`;

  return `You are a senior business analyst comparing an Old Requirements Document against the current state of a software project's codebase (captured as a Baseline RD built from source analysis).

## Old Requirements Document
${ctx.oldRdText}

## Baseline RD (derived from current code)
${sectionsBlock}

## Architecture Summary
- **Type**: ${ctx.architectureSummary.architecture_type}
- **Tech Stack**: ${ctx.architectureSummary.tech_stack.join(", ")}
- **Folder Structure**: ${ctx.architectureSummary.folder_structure}
- **Summary**: ${ctx.architectureSummary.architecture_summary}

## Knowledge Base Stats
- Files analyzed: ${ctx.kbStats.total_files}
- Total size: ${ctx.kbStats.total_size_bytes} bytes
${bmadBlock}
## Task
Identify every meaningful difference ("drift") between the Old RD and the current code. Return a JSON object with a single \`items\` array. Each item MUST include: \`dimension\`, \`category\`, \`severity\`, \`title\`, \`description\`, and optionally \`rd_section_id\`, \`evidence\`, and \`old_rd_reference\`.

${dimensionsInstructions}

## Category Semantics
- \`added\` — feature/capability present in the code/Baseline RD but absent from the Old RD (or BMAD PRD for BMAD dimensions).
- \`removed\` — described in the Old RD (or BMAD PRD) but not found in the code.
- \`changed\` — exists in both but materially differs in implementation, scope, or behavior.

## Severity Semantics
- \`breaking\` — drift likely breaks existing integrations, APIs, or user contracts.
- \`significant\` — drift changes meaningful behavior but is non-breaking.
- \`incremental\` — drift is additive or cosmetic (new optional feature, minor refactor).

## rd_section_id Contract
When referencing a Baseline RD section, use one of: ${KNOWN_RD_SECTION_IDS.map((id) => `\`${id}\``).join(", ")}. Invalid IDs are stripped in post-processing.

Ground every claim in the Old RD text and the Baseline RD sections above. Be specific. If there is no meaningful drift, return an empty \`items\` array.`;
}
