import { describe, expect, it } from "vitest";
import { buildImpactAnalysisPrompt } from "./impactPrompts";
import { IMPACT_ANALYSIS_PROMPT } from "./impactAgent";
import { CHAT_RAG_MAX_CONTEXT_CHARS } from "../lib/constraints";
import type { BmadContext } from "./impactSchema";

const bmadContext: BmadContext = {
  prd_sections: [{ key: "Overview", content: "The product is a test platform." }],
  adrs: [{ key: "ADR-0003", content: "Use Convex Agent Component." }],
  conventions: [{ key: "use-zod-validation", content: "All inputs validated with zod." }],
  domain_terms: [{ key: "Knowledge Base", content: "Structured codebase map." }],
};

describe("buildImpactAnalysisPrompt", () => {
  it("returns undefined when both inputs are null", () => {
    expect(buildImpactAnalysisPrompt(null, null)).toBeUndefined();
  });

  it("returns undefined when ragText is empty and bmadContext is null", () => {
    expect(buildImpactAnalysisPrompt("", null)).toBeUndefined();
  });

  it("returns undefined when ragText is whitespace and bmadContext is null", () => {
    expect(buildImpactAnalysisPrompt("   ", null)).toBeUndefined();
  });

  it("includes IMPACT_ANALYSIS_PROMPT and RAG header when only ragText provided", () => {
    const result = buildImpactAnalysisPrompt("some code context", null);
    expect(result).toBeDefined();
    expect(result!).toContain(IMPACT_ANALYSIS_PROMPT);
    expect(result!).toContain("## Retrieved Codebase Context");
    expect(result!).toContain("some code context");
  });

  it("places IMPACT_ANALYSIS_PROMPT before the RAG context block", () => {
    const result = buildImpactAnalysisPrompt("RAG_BODY", null);
    expect(result).toBeDefined();
    const promptIdx = result!.indexOf(IMPACT_ANALYSIS_PROMPT);
    const headerIdx = result!.indexOf("## Retrieved Codebase Context");
    expect(promptIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeGreaterThan(promptIdx);
  });

  it("includes BMAD section when only bmadContext provided", () => {
    const result = buildImpactAnalysisPrompt(null, bmadContext);
    expect(result).toBeDefined();
    expect(result!).toContain(IMPACT_ANALYSIS_PROMPT);
    expect(result!).toContain("## BMAD Project Context");
  });

  it("includes ADR content in BMAD section", () => {
    const result = buildImpactAnalysisPrompt(null, bmadContext);
    expect(result!).toContain("ADR-0003");
    expect(result!).toContain("Use Convex Agent Component.");
  });

  it("includes convention content in BMAD section", () => {
    const result = buildImpactAnalysisPrompt(null, bmadContext);
    expect(result!).toContain("use-zod-validation");
    expect(result!).toContain("All inputs validated with zod.");
  });

  it("includes PRD section content in BMAD section", () => {
    const result = buildImpactAnalysisPrompt(null, bmadContext);
    expect(result!).toContain("Overview");
    expect(result!).toContain("The product is a test platform.");
  });

  it("includes domain term content in BMAD section", () => {
    const result = buildImpactAnalysisPrompt(null, bmadContext);
    expect(result!).toContain("Knowledge Base");
    expect(result!).toContain("Structured codebase map.");
  });

  it("includes both RAG and BMAD sections when both provided", () => {
    const result = buildImpactAnalysisPrompt("rag text", bmadContext);
    expect(result).toBeDefined();
    expect(result!).toContain("## Retrieved Codebase Context");
    expect(result!).toContain("## BMAD Project Context");
    expect(result!).toContain("rag text");
    expect(result!).toContain("ADR-0003");
  });

  it("places IMPACT_ANALYSIS_PROMPT before both context sections", () => {
    const result = buildImpactAnalysisPrompt("rag text", bmadContext);
    const promptIdx = result!.indexOf(IMPACT_ANALYSIS_PROMPT);
    const ragIdx = result!.indexOf("## Retrieved Codebase Context");
    const bmadIdx = result!.indexOf("## BMAD Project Context");
    expect(promptIdx).toBeGreaterThan(-1);
    expect(ragIdx).toBeGreaterThan(promptIdx);
    expect(bmadIdx).toBeGreaterThan(promptIdx);
  });

  it("truncates ragText longer than CHAT_RAG_MAX_CONTEXT_CHARS with marker", () => {
    const oversized = "a".repeat(CHAT_RAG_MAX_CONTEXT_CHARS + 100);
    const result = buildImpactAnalysisPrompt(oversized, null);
    expect(result).toBeDefined();
    expect(result!).toContain("[truncated]");
    const ragSection = result!.slice(
      result!.indexOf("## Retrieved Codebase Context"),
    );
    const aRun = ragSection.match(/a+/g) ?? [];
    const longestRun = Math.max(...aRun.map((s) => s.length));
    expect(longestRun).toBe(CHAT_RAG_MAX_CONTEXT_CHARS);
  });

  it("does NOT truncate ragText exactly at the boundary", () => {
    const exact = "b".repeat(CHAT_RAG_MAX_CONTEXT_CHARS);
    const result = buildImpactAnalysisPrompt(exact, null);
    expect(result).toBeDefined();
    expect(result!).not.toContain("[truncated]");
    expect(result!).toContain(exact);
  });

  it("omits BMAD section when bmadContext has all empty arrays", () => {
    const emptyBmad: BmadContext = {
      prd_sections: [],
      adrs: [],
      conventions: [],
      domain_terms: [],
    };
    const result = buildImpactAnalysisPrompt("rag text", emptyBmad);
    expect(result).toBeDefined();
    expect(result!).toContain("## Retrieved Codebase Context");
    expect(result!).not.toContain("### ADRs");
    expect(result!).not.toContain("### Conventions");
    expect(result!).not.toContain("### PRD Sections");
    expect(result!).not.toContain("### Domain Terms");
  });

  it("omits BMAD data section when bmadContext is null but ragText present", () => {
    const result = buildImpactAnalysisPrompt("rag text", null);
    expect(result).toBeDefined();
    expect(result!).toContain("## Retrieved Codebase Context");
    expect(result!).not.toContain("### ADRs");
    expect(result!).not.toContain("### Conventions");
  });

  it("omits specific BMAD subsections that are empty", () => {
    const partial: BmadContext = {
      prd_sections: [],
      adrs: [{ key: "ADR-0001", content: "decision" }],
      conventions: [],
      domain_terms: [],
    };
    const result = buildImpactAnalysisPrompt(null, partial);
    expect(result).toBeDefined();
    expect(result!).toContain("## BMAD Project Context");
    expect(result!).toContain("ADR-0001");
    expect(result!).not.toContain("### Conventions");
    expect(result!).not.toContain("### PRD Sections");
  });
});
