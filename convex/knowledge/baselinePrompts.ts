import { z } from "zod";
import { BASELINE_RD_MAX_CONTEXT_CHARS } from "../lib/constraints";

export type RdSection = {
  id: string;
  title: string;
  content: string;
  confidence: number;
  divergence_note?: string;
  bmad_alignment?: {
    prd_section_title: string;
    agreement: "agree" | "diverge" | "partial";
  };
};

const rdSectionZod = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  divergence_note: z.string().optional(),
  bmad_alignment: z
    .object({
      prd_section_title: z.string(),
      agreement: z.enum(["agree", "diverge", "partial"]),
    })
    .optional(),
});

export const baselineRdSchema = z.object({
  sections: z.array(rdSectionZod).min(1),
});

export type BmadContext = {
  prdSections: string;
  adrs: string;
};

export type KbModuleSummary = {
  name: string;
  description?: string;
  apis?: unknown;
  data_models?: unknown;
  user_flows?: unknown;
};

export type RdGenerationContext = {
  architectureSummary: {
    architecture_summary: string;
    architecture_type: string;
    folder_structure: string;
    tech_stack: string[];
  };
  modules: KbModuleSummary[];
  kbStats: {
    total_files: number;
    total_size_bytes: number;
  };
  oldRdHeadings?: string[];
  bmadContext?: BmadContext | null;
};

const MIN_CONFIDENCE = 0.1;
const MAX_CONFIDENCE = 0.95;
const AGREE_BOOST = 0.1;
const DIVERGE_PENALTY = 0.15;

export function applyBmadConfidenceAdjustment(
  sections: RdSection[],
): RdSection[] {
  return sections.map((s) => {
    if (!s.bmad_alignment) return s;
    let confidence = s.confidence;
    let divergence_note = s.divergence_note;
    if (s.bmad_alignment.agreement === "agree") {
      confidence = Math.min(MAX_CONFIDENCE, confidence + AGREE_BOOST);
    } else if (s.bmad_alignment.agreement === "diverge") {
      confidence = Math.max(MIN_CONFIDENCE, confidence - DIVERGE_PENALTY);
      if (!divergence_note) {
        divergence_note = `Diverges from BMAD PRD section "${s.bmad_alignment.prd_section_title}".`;
      }
    }
    return { ...s, confidence, divergence_note };
  });
}

const clamp = (n: number) =>
  Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, n));

export function clampSectionConfidence(sections: RdSection[]): RdSection[] {
  return sections.map((s) => ({ ...s, confidence: clamp(s.confidence) }));
}

export function boundModulesForPrompt(
  modules: KbModuleSummary[],
  maxChars: number = BASELINE_RD_MAX_CONTEXT_CHARS,
): KbModuleSummary[] {
  const measure = (m: KbModuleSummary): number => {
    let len = `- name: ${m.name}`.length;
    if (m.description) len += `\n  description: ${m.description}`.length;
    if (m.apis) len += `\n  apis: ${JSON.stringify(m.apis)}`.length;
    if (m.data_models) len += `\n  data_models: ${JSON.stringify(m.data_models)}`.length;
    if (m.user_flows) len += `\n  user_flows: ${JSON.stringify(m.user_flows)}`.length;
    return len;
  };

  let used = 0;
  const out: KbModuleSummary[] = [];
  for (const m of modules) {
    const separator = out.length > 0 ? 1 : 0;
    const remaining = maxChars - used - separator;
    if (remaining <= m.name.length + 12) break;

    let candidate: KbModuleSummary = { ...m };
    while (measure(candidate) > remaining) {
      if (candidate.user_flows) {
        candidate = { ...candidate, user_flows: undefined };
      } else if (candidate.data_models) {
        candidate = { ...candidate, data_models: undefined };
      } else if (candidate.apis) {
        candidate = { ...candidate, apis: undefined };
      } else if (candidate.description) {
        const overhead = `- name: ${candidate.name}\n  description: `.length;
        const availForDesc = remaining - overhead;
        if (availForDesc > 15) {
          candidate = {
            ...candidate,
            description:
              candidate.description.slice(0, availForDesc - "...(truncated)".length) +
              "...(truncated)",
          };
        } else {
          candidate = { ...candidate, description: undefined };
        }
      } else {
        break;
      }
    }
    used += measure(candidate) + separator;
    out.push(candidate);
  }
  return out;
}

export function parseOldRdHeadings(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n(?=#{1,2} )/)
    .filter((s) => /^#{1,2} /.test(s))
    .map((s) => {
      const lineEnd = s.indexOf("\n");
      const header = lineEnd === -1 ? s : s.slice(0, lineEnd);
      return header.replace(/^#{1,2}\s+/, "").trim();
    })
    .filter((h) => h.length > 0);
}

export const REQUIRED_RD_SECTION_IDS = [
  "overview",
  "tech-stack",
  "modules",
  "api-surface",
  "data-model",
  "user-flows",
] as const;

const REQUIRED_RD_SECTION_TITLES: Record<string, string> = {
  overview: "Overview",
  "tech-stack": "Tech Stack",
  modules: "Modules",
  "api-surface": "API Surface",
  "data-model": "Data Model",
  "user-flows": "User Flows",
};

export function ensureRequiredSections(
  sections: RdSection[],
  opts?: { bmad?: boolean },
): RdSection[] {
  const seen = new Set<string>();
  const normalized = sections
    .map((s) => ({ ...s, id: s.id.toLowerCase().trim() }))
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

  const requiredIds = opts?.bmad
    ? [...REQUIRED_RD_SECTION_IDS, "decision-log"]
    : [...REQUIRED_RD_SECTION_IDS];

  for (const id of requiredIds) {
    if (!seen.has(id)) {
      normalized.push({
        id,
        title:
          id === "decision-log"
            ? "Decision Log"
            : REQUIRED_RD_SECTION_TITLES[id] ?? id,
        content: "_(section not generated — manually edit to populate)_",
        confidence: MIN_CONFIDENCE,
      });
    }
  }

  const orderIndex = new Map(requiredIds.map((id, i) => [id, i]));
  return [...normalized].sort((a, b) => {
    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
}

export function buildBaselineRdPrompt(ctx: RdGenerationContext): string {
  const arch = ctx.architectureSummary;
  const moduleLines = ctx.modules
    .map((m) => {
      let line = `- **${m.name}**`;
      if (m.description) line += ` — ${m.description}`;
      if (m.apis) line += `\n  - APIs: ${JSON.stringify(m.apis)}`;
      if (m.data_models)
        line += `\n  - Data Models: ${JSON.stringify(m.data_models)}`;
      if (m.user_flows)
        line += `\n  - User Flows: ${JSON.stringify(m.user_flows)}`;
      return line;
    })
    .join("\n");

  const oldRdSection = ctx.oldRdHeadings?.length
    ? `\n## Old Requirements Document Headings (mirror where possible)\n\nThe project has an existing Requirements Document with these section headings. Use them as additional organizational hints for the new RD where they fit; the six required sections below are always present.\n\n${ctx.oldRdHeadings.map((h) => `- ${h}`).join("\n")}\n`
    : "";

  const bmadSection = ctx.bmadContext
    ? `\n## BMAD Project Context (Cross-Reference Source)\n\nCross-reference each section against the matching BMAD PRD section. Populate \`bmad_alignment\` per section with the matching PRD section title and an \`agreement\` of \`agree\`, \`diverge\`, or \`partial\`. Populate \`divergence_note\` when agreement is \`diverge\` or \`partial\`. Also generate an additional **Decision Log** section synthesizing the ADRs below.\n\n### BMAD PRD Sections\n${ctx.bmadContext.prdSections}\n\n### Architectural Decision Records\n${ctx.bmadContext.adrs}\n`
    : "";

  const decisionLogInstruction = ctx.bmadContext
    ? `\n7. **decision-log** (BMAD only): A synthesized decision log drawn from the ADRs above. Format as markdown bullet list referencing each ADR.`
    : "";

  const confidenceGuidance = ctx.bmadContext
    ? `Self-assess each section's confidence based on evidence quality. Code analysis alone typically yields ~0.75. When the BMAD PRD agrees with your analysis, target ~+0.1 (capped at 0.95). When they diverge, target ~−0.15 (floored at 0.1). The system clamps and applies these adjustments deterministically in post-processing — your reported value is guidance only.`
    : `Self-assess each section's confidence based on evidence quality (code coverage, sample size). Typical baseline is ~0.75. Always within [0.1, 0.95].`;

  return `You are a senior business analyst generating an authoritative Requirements Document (RD) for a software project, derived from a Knowledge Base built by analyzing its source code.

## Architecture Summary
- **Type**: ${arch.architecture_type}
- **Tech Stack**: ${arch.tech_stack.join(", ")}
- **Folder Structure**: ${arch.folder_structure}
- **Summary**: ${arch.architecture_summary}

## Modules (${ctx.modules.length} detected)
${moduleLines || "_(no modules detected)_"}

## Knowledge Base Stats
- Files analyzed: ${ctx.kbStats.total_files}
- Total size: ${ctx.kbStats.total_size_bytes} bytes
${oldRdSection}${bmadSection}
## Task
Generate a Requirements Document as a JSON object with a single \`sections\` array. Each section object has: \`id\`, \`title\`, \`content\` (markdown body), \`confidence\` (number in [0, 1]), and optionally \`divergence_note\` and \`bmad_alignment\`.

Produce exactly these sections, in this order:
1. **overview** (title: "Overview") — a 2-3 paragraph description of what the application does, its purpose, and its primary users.
2. **tech-stack** (title: "Tech Stack") — a markdown list of technologies, frameworks, libraries, and tools with versions when known. Drawn from the architecture summary.
3. **modules** (title: "Modules") — a markdown overview of each major module with its responsibilities. Drawn from the modules list above.
4. **api-surface** (title: "API Surface") — a markdown catalogue of API endpoints grouped by module. Drawn from each module's apis.
5. **data-model** (title: "Data Model") — a markdown description of database tables/schemas and their relationships. Drawn from each module's data_models.
6. **user-flows** (title: "User Flows") — a markdown description of the primary user-facing flows grouped by module. Drawn from each module's user_flows.${decisionLogInstruction}

## Confidence Guidance
${confidenceGuidance}

Use markdown formatting inside each section's \`content\`. Be specific and ground every claim in the Knowledge Base evidence above. Do not invent features that are not supported by the modules or architecture summary.`;
}

export { clamp, MIN_CONFIDENCE, MAX_CONFIDENCE, AGREE_BOOST, DIVERGE_PENALTY };
