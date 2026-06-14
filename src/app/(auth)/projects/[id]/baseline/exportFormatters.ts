import type { DriftItem } from "./drift/DriftDimensions";
import {
  DIMENSION_LABELS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  RD_SECTION_LABELS,
  groupByDimension,
} from "./drift/DriftDimensions";

export type RdSectionExport = {
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

export type BaselineRdExportInput = {
  version: number;
  generated_at: number;
  updated_at?: number;
  sections: RdSectionExport[];
};

export type DriftReportExportInput = {
  version: number;
  generated_at: number;
  items: DriftItem[];
  baseline_rd_version?: number;
};

export type BmadAdrExport = {
  key: string;
  content: string;
  source_path: string;
  metadata?: unknown;
};

function codeFence(content: string): string {
  const runs = content.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  return "`".repeat(Math.max(3, longest + 1));
}

function sanitizeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function confidenceBand(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function confidenceAssessment(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.5) return "Medium";
  return "Low";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildBaselineRdMarkdown(rd: BaselineRdExportInput): string {
  const date = new Date(rd.generated_at).toISOString();
  const lines: string[] = [
    "# Baseline Requirements Document",
    "",
    `_Version ${rd.version} · Generated ${date} · Status: Approved_`,
    "",
  ];
  for (const section of rd.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
  }
  return lines.join("\n");
}

export function buildBaselineRdHtml(rd: BaselineRdExportInput): string {
  const date = new Date(rd.generated_at).toISOString();
  const sectionsHtml = rd.sections
    .map((section) => {
      const band = confidenceBand(section.confidence);
      const assessment = confidenceAssessment(section.confidence);
      return `  <h2>${escapeHtml(section.title)} <span class="confidence conf-${band}">${assessment} (${section.confidence})</span></h2>
  <div class="section-content">${escapeHtml(section.content)}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Baseline Requirements Document — v${rd.version}</title>
  <style>
    body { max-width: 820px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, system-ui, sans-serif; color: #1f2328; line-height: 1.6; }
    h1 { font-size: 1.8em; border-bottom: 2px solid #d0d7de; padding-bottom: 0.3em; }
    h2 { font-size: 1.3em; margin-top: 2em; border-bottom: 1px solid #d8dee4; padding-bottom: 0.2em; }
    .metadata { color: #57606a; font-size: 0.9em; margin-bottom: 2em; }
    .section-content { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, monospace; background: #f6f8fa; padding: 16px; border-radius: 6px; font-size: 0.85em; }
    .confidence { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 600; margin-left: 8px; vertical-align: middle; }
    .conf-high { background: #dafbe1; color: #1a7f37; }
    .conf-medium { background: #fff8c5; color: #9a6700; }
    .conf-low { background: #ffebe9; color: #cf222e; }
  </style>
</head>
<body>
  <h1>Baseline Requirements Document</h1>
  <div class="metadata">Version ${rd.version} · Generated ${date} · Status: Approved</div>
${sectionsHtml}
</body>
</html>`;
}

export function buildDriftReportMarkdown(report: DriftReportExportInput): string {
  const date = new Date(report.generated_at).toISOString();
  const baselineRef =
    report.baseline_rd_version !== undefined
      ? ` · Baseline RD v${report.baseline_rd_version}`
      : "";
  const lines: string[] = [
    "# Drift Report",
    "",
    `_Version ${report.version} · Generated ${date}${baselineRef}_`,
    "",
  ];

  if (report.items.length === 0) {
    lines.push("## No drift items detected.");
    lines.push("");
    lines.push("The current code matches the Old Requirements Document.");
    return lines.join("\n").trimEnd();
  }

  const groups = groupByDimension(report.items);
  for (const group of groups) {
    const label = DIMENSION_LABELS[group.dimension];
    const count = group.items.length;
    lines.push(`## ${label} (${count} item${count === 1 ? "" : "s"})`);
    lines.push("");
    group.items.forEach((item, idx) => {
      const severity = SEVERITY_LABELS[item.severity];
      const category = CATEGORY_LABELS[item.category];
      lines.push(`### [${severity}] [${category}] ${item.title}`);
      lines.push(item.description);
      if (item.rd_section_id) {
        const sectionLabel = RD_SECTION_LABELS[item.rd_section_id] ?? item.rd_section_id;
        lines.push("");
        lines.push(`**RD section:** ${sectionLabel}`);
      }
      if (item.evidence) {
        const fence = codeFence(item.evidence);
        lines.push("");
        lines.push("**Evidence:**");
        lines.push(fence);
        lines.push(item.evidence);
        lines.push(fence);
      }
      if (item.old_rd_reference) {
        lines.push("");
        lines.push(`**Old RD reference:** ${item.old_rd_reference}`);
      }
      if (idx < group.items.length - 1) {
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    });
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildBmadPrdMarkdown(rd: BaselineRdExportInput): string {
  const date = new Date(rd.generated_at).toISOString();
  const lines: string[] = [
    "---",
    "title: Baseline Requirements Document",
    `version: ${rd.version}`,
    `generated_at: ${date}`,
    "status: approved",
    "---",
    "",
    "# Requirements Document",
    "",
  ];
  for (const section of rd.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function buildBmadAddendumMarkdown(rd: BaselineRdExportInput): string {
  const generatedIso = new Date(rd.generated_at).toISOString();
  const editedIso =
    rd.updated_at !== undefined ? new Date(rd.updated_at).toISOString() : "Never";

  const lines: string[] = [
    "# Baseline RD Addendum",
    "",
    "Generated from Knowledge Base analysis. Confidence scores reflect AI self-assessment of evidence quality per section.",
    "",
    "## Section Confidence Scores",
    "",
    "| Section | Confidence | Assessment |",
    "|---------|-----------|------------|",
  ];
  for (const section of rd.sections) {
    const assessment = confidenceAssessment(section.confidence);
    const safeTitle = sanitizeTableCell(section.title);
    lines.push(`| ${safeTitle} | ${section.confidence} | ${assessment} |`);
  }
  lines.push("");

  const divergent = rd.sections.filter((s) => s.divergence_note);
  if (divergent.length > 0) {
    lines.push("## Divergence Notes");
    lines.push("");
    for (const section of divergent) {
      lines.push(`### ${section.title}`);
      lines.push(section.divergence_note as string);
      if (section.bmad_alignment) {
        lines.push("");
        lines.push(
          `_BMAD alignment: ${section.bmad_alignment.agreement} (PRD section: "${section.bmad_alignment.prd_section_title}")_`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## Generation Metadata");
  lines.push("");
  lines.push(`- **Version:** ${rd.version}`);
  lines.push(`- **Generated:** ${generatedIso}`);
  lines.push(`- **Last edited:** ${editedIso}`);
  lines.push(`- **Sections:** ${rd.sections.length}`);

  return lines.join("\n").trimEnd();
}

export function buildBmadDecisionLogMarkdown(adrs: BmadAdrExport[]): string {
  if (adrs.length === 0) {
    return "# Decision Log\n\nNo ADRs detected.";
  }

  const blocks = adrs.map((adr) => {
    const m = (adr.metadata ?? {}) as { title?: string; status?: string };
    const heading = m.title ? `${adr.key}: ${m.title}` : adr.key;
    const lines: string[] = [`## ${heading}`];
    if (m.status) {
      lines.push("");
      lines.push(`Status: ${m.status}`);
    }
    lines.push("");
    lines.push(adr.content);
    return lines.join("\n");
  });

  return `# Decision Log\n\n${blocks.join("\n\n---\n\n")}`;
}
