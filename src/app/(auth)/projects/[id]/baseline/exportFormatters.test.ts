import { describe, expect, it } from "vitest";
import {
  buildBaselineRdMarkdown,
  buildBaselineRdHtml,
  buildDriftReportMarkdown,
  buildBmadPrdMarkdown,
  buildBmadAddendumMarkdown,
  buildBmadDecisionLogMarkdown,
  escapeHtml,
} from "./exportFormatters";

const GENERATED_AT = 1718362200000;
const ISO = new Date(GENERATED_AT).toISOString();

function makeSection(overrides: Partial<{
  id: string;
  title: string;
  content: string;
  confidence: number;
  divergence_note: string;
  bmad_alignment: { prd_section_title: string; agreement: "agree" | "diverge" | "partial" };
}> = {}) {
  return {
    id: "overview",
    title: "Overview",
    content: "The application is a test management platform.",
    confidence: 0.85,
    ...overrides,
  };
}

const baseRd = {
  _id: "rd1" as never,
  version: 3,
  status: "approved" as const,
  generated_at: GENERATED_AT,
  knowledge_base_id: "kb1" as never,
  sections: [
    makeSection({ id: "overview", title: "Overview", content: "The application is a test management platform.", confidence: 0.85 }),
    makeSection({ id: "tech-stack", title: "Tech Stack", content: "- Next.js 16\n- Convex", confidence: 0.4, divergence_note: "PRD mentions Vue.", bmad_alignment: { prd_section_title: "Tech Stack", agreement: "diverge" } }),
    makeSection({ id: "modules", title: "Modules", content: "Auth module.", confidence: 0.72 }),
  ],
};

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes &", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes & before < > \" (ordering — no double escaping)", () => {
    expect(escapeHtml("<a href=\"x\">A & B</a>")).toBe(
      "&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });
});

describe("buildBaselineRdMarkdown", () => {
  it("contains the top-level heading", () => {
    const out = buildBaselineRdMarkdown(baseRd);
    expect(out).toContain("# Baseline Requirements Document");
  });

  it("contains the version in the metadata line", () => {
    const out = buildBaselineRdMarkdown(baseRd);
    expect(out).toContain("Version 3");
  });

  it("renders each section as ## title followed by content", () => {
    const out = buildBaselineRdMarkdown(baseRd);
    expect(out).toContain("## Overview");
    expect(out).toContain("The application is a test management platform.");
    expect(out).toContain("## Tech Stack");
    expect(out).toContain("- Next.js 16");
  });

  it("preserves multi-section ordering", () => {
    const out = buildBaselineRdMarkdown(baseRd);
    const overviewIdx = out.indexOf("## Overview");
    const techIdx = out.indexOf("## Tech Stack");
    const modulesIdx = out.indexOf("## Modules");
    expect(overviewIdx).toBeLessThan(techIdx);
    expect(techIdx).toBeLessThan(modulesIdx);
  });

  it("renders a section heading even when content is empty", () => {
    const out = buildBaselineRdMarkdown({
      ...baseRd,
      sections: [makeSection({ content: "" })],
    });
    expect(out).toMatch(/## Overview\n\n/);
  });

  it("includes the ISO generation date in metadata", () => {
    const out = buildBaselineRdMarkdown(baseRd);
    expect(out).toContain(`Generated ${ISO}`);
  });
});

describe("buildBaselineRdHtml", () => {
  it("starts with DOCTYPE", () => {
    const out = buildBaselineRdHtml(baseRd);
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("contains a title element with the version", () => {
    const out = buildBaselineRdHtml(baseRd);
    expect(out).toContain("<title>");
    expect(out).toContain("v3");
  });

  it("escapes script tags in section content", () => {
    const out = buildBaselineRdHtml({
      ...baseRd,
      sections: [makeSection({ content: "<script>alert(1)</script>" })],
    });
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>alert");
  });

  it("renders each section title in an h2", () => {
    const out = buildBaselineRdHtml(baseRd);
    expect(out).toContain("<h2>Overview");
    expect(out).toContain("<h2>Tech Stack");
  });

  it("applies confidence badge class based on band", () => {
    const out = buildBaselineRdHtml(baseRd);
    expect(out).toContain("conf-high");
    expect(out).toContain("conf-low");
    expect(out).toContain("conf-medium");
  });

  it("escapes ampersands in content", () => {
    const out = buildBaselineRdHtml({
      ...baseRd,
      sections: [makeSection({ content: "Tom & Jerry" })],
    });
    expect(out).toContain("Tom &amp; Jerry");
  });
});

describe("buildDriftReportMarkdown", () => {
  const driftItems = [
    {
      dimension: "old-rd-vs-code" as const,
      category: "added" as const,
      severity: "breaking" as const,
      title: "New authentication module",
      description: "Codebase includes an Auth module using Better Auth.",
      rd_section_id: "modules",
      evidence: "convex/lib/requireAuth.ts implements requireAuth()",
    },
    {
      dimension: "old-rd-vs-code" as const,
      category: "changed" as const,
      severity: "significant" as const,
      title: "API endpoint renamed",
      description: "Endpoint was renamed.",
    },
    {
      dimension: "adr-drift" as const,
      category: "changed" as const,
      severity: "breaking" as const,
      title: "ADR-0003 overridden",
      description: "ADR-0003 decision was overridden.",
    },
  ];

  const report = {
    version: 2,
    generated_at: GENERATED_AT,
    items: driftItems,
    baseline_rd_version: 3,
  };

  it("uses the correct top-level heading", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("# Drift Report");
    expect(out).not.toContain("# Drift report");
  });

  it("includes the version and generation date in the metadata line", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain(`Version 2 · Generated ${ISO}`);
  });

  it("includes the baseline RD version in the metadata line when provided", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("Baseline RD v3");
  });

  it("omits the baseline RD reference when not provided", () => {
    const out = buildDriftReportMarkdown({ version: 2, generated_at: GENERATED_AT, items: driftItems });
    expect(out).not.toContain("Baseline RD");
  });

  it("groups items by dimension using display labels", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("## Old RD vs Code");
    expect(out).toContain("## Architecture Decision Drift");
  });

  it("shows severity, category, title, and description per item", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("[Breaking]");
    expect(out).toContain("[Added]");
    expect(out).toContain("New authentication module");
    expect(out).toContain("Codebase includes an Auth module using Better Auth.");
  });

  it("includes evidence when item has evidence", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("**Evidence:**");
    expect(out).toContain("convex/lib/requireAuth.ts implements requireAuth()");
  });

  it("uses a longer code fence when evidence contains triple backticks", () => {
    const out = buildDriftReportMarkdown({
      ...report,
      items: [
        {
          dimension: "old-rd-vs-code" as const,
          category: "added" as const,
          severity: "breaking" as const,
          title: "Code snippet drift",
          description: "Evidence has a fenced block.",
          evidence: "```js\nconst x = 1;\n```",
        },
      ],
    });
    expect(out).toContain("\n````\n");
    expect(out).toContain("```js\nconst x = 1;");
  });

  it("includes RD section reference when rd_section_id is set", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("**RD section:**");
    expect(out).toContain("Modules");
  });

  it("renders the no-items message for an empty report", () => {
    const out = buildDriftReportMarkdown({ ...report, items: [] });
    expect(out).toContain("No drift items detected.");
  });

  it("includes the ADR-drift dimension when present", () => {
    const out = buildDriftReportMarkdown(report);
    expect(out).toContain("ADR-0003 overridden");
  });
});

describe("buildBmadPrdMarkdown", () => {
  it("starts with YAML front matter", () => {
    const out = buildBmadPrdMarkdown(baseRd);
    expect(out.startsWith("---\n")).toBe(true);
  });

  it("contains required YAML keys", () => {
    const out = buildBmadPrdMarkdown(baseRd);
    expect(out).toContain("title:");
    expect(out).toContain("version: 3");
    expect(out).toContain(`generated_at: ${ISO}`);
  });

  it("renders sections as ## headings", () => {
    const out = buildBmadPrdMarkdown(baseRd);
    expect(out).toContain("## Overview");
    expect(out).toContain("## Tech Stack");
    expect(out).toContain("## Modules");
  });
});

describe("buildBmadAddendumMarkdown", () => {
  it("contains a confidence table with all sections", () => {
    const out = buildBmadAddendumMarkdown(baseRd);
    expect(out).toContain("## Section Confidence Scores");
    expect(out).toContain("Overview");
    expect(out).toContain("Tech Stack");
    expect(out).toContain("Modules");
    expect(out).toContain("0.85");
  });

  it("escapes pipe characters in section titles in the confidence table", () => {
    const out = buildBmadAddendumMarkdown({
      ...baseRd,
      sections: [makeSection({ title: "A | B", confidence: 0.9 })],
    });
    expect(out).toContain("A \\| B");
  });

  it("includes the divergence note when present", () => {
    const out = buildBmadAddendumMarkdown(baseRd);
    expect(out).toContain("## Divergence Notes");
    expect(out).toContain("PRD mentions Vue.");
  });

  it("omits the divergence notes section when none present", () => {
    const out = buildBmadAddendumMarkdown({
      ...baseRd,
      sections: [makeSection({ confidence: 0.9 })],
    });
    expect(out).not.toContain("## Divergence Notes");
  });

  it("contains a generation metadata block", () => {
    const out = buildBmadAddendumMarkdown(baseRd);
    expect(out).toContain("## Generation Metadata");
    expect(out).toContain(`**Version:** 3`);
    expect(out).toContain(`**Generated:** ${ISO}`);
    expect(out).toContain("**Sections:** 3");
  });

  it("shows Last edited timestamp when updated_at is present", () => {
    const out = buildBmadAddendumMarkdown({ ...baseRd, updated_at: GENERATED_AT + 1000 });
    const editedIso = new Date(GENERATED_AT + 1000).toISOString();
    expect(out).toContain(`**Last edited:** ${editedIso}`);
  });

  it("shows Never when updated_at is absent", () => {
    const out = buildBmadAddendumMarkdown(baseRd);
    expect(out).toContain("**Last edited:** Never");
  });
});

describe("buildBmadDecisionLogMarkdown", () => {
  it("renders the no-ADRs message for an empty array", () => {
    const out = buildBmadDecisionLogMarkdown([]);
    expect(out).toContain("# Decision Log");
    expect(out).toContain("No ADRs detected.");
  });

  it("renders ADR entries with key heading and content", () => {
    const adrs = [
      {
        key: "ADR-0001",
        content: "We chose a separate test runner.",
        source_path: "docs/adr/0001.md",
        metadata: { title: "Separate Test Runner", status: "accepted" },
      },
    ];
    const out = buildBmadDecisionLogMarkdown(adrs);
    expect(out).toContain("# Decision Log");
    expect(out).toContain("ADR-0001");
    expect(out).toContain("Separate Test Runner");
    expect(out).toContain("Status: accepted");
    expect(out).toContain("We chose a separate test runner.");
  });

  it("separates multiple ADRs with a horizontal rule", () => {
    const adrs = [
      { key: "ADR-0001", content: "First decision.", source_path: "a.md", metadata: { status: "accepted" } },
      { key: "ADR-0002", content: "Second decision.", source_path: "b.md", metadata: { status: "accepted" } },
    ];
    const out = buildBmadDecisionLogMarkdown(adrs);
    expect(out).toContain("ADR-0001");
    expect(out).toContain("ADR-0002");
    expect(out).toContain("\n---\n");
  });

  it("falls back to key for heading when metadata.title is absent", () => {
    const adrs = [
      { key: "ADR-0007", content: "No title in metadata.", source_path: "c.md" },
    ];
    const out = buildBmadDecisionLogMarkdown(adrs);
    expect(out).toContain("ADR-0007");
  });
});
