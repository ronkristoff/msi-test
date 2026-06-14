import { describe, expect, it } from "vitest";
import { buildRagSystemPrompt } from "./ragContext";
import { ANALYST_CHAT_PROMPT } from "./agents";
import { CHAT_RAG_MAX_CONTEXT_CHARS } from "../lib/constraints";

describe("buildRagSystemPrompt", () => {
  it("returns undefined for null input", () => {
    expect(buildRagSystemPrompt(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(buildRagSystemPrompt("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(buildRagSystemPrompt("   ")).toBeUndefined();
  });

  it("returns a string containing the agent prompt, context header, and RAG text", () => {
    const result = buildRagSystemPrompt("some code context");
    expect(typeof result).toBe("string");
    expect(result).toContain(ANALYST_CHAT_PROMPT);
    expect(result).toContain("## Retrieved Codebase Context");
    expect(result).toContain("some code context");
  });

  it("places the agent prompt before the RAG context block", () => {
    const result = buildRagSystemPrompt("RAG_BODY");
    expect(result).toBeDefined();
    const promptIdx = result!.indexOf(ANALYST_CHAT_PROMPT);
    const headerIdx = result!.indexOf("## Retrieved Codebase Context");
    expect(promptIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeGreaterThan(promptIdx);
  });

  it("truncates input longer than CHAT_RAG_MAX_CONTEXT_CHARS with marker", () => {
    const oversized = "a".repeat(CHAT_RAG_MAX_CONTEXT_CHARS + 100);
    const result = buildRagSystemPrompt(oversized);
    expect(result).toBeDefined();
    expect(result).toContain("[truncated]");
    const ragSection = result!.slice(
      result!.indexOf("## Retrieved Codebase Context"),
    );
    const aRun = ragSection.match(/a+/g) ?? [];
    const longestRun = Math.max(...aRun.map((s) => s.length));
    expect(longestRun).toBe(CHAT_RAG_MAX_CONTEXT_CHARS);
  });

  it("does NOT truncate input exactly at the boundary", () => {
    const exact = "b".repeat(CHAT_RAG_MAX_CONTEXT_CHARS);
    const result = buildRagSystemPrompt(exact);
    expect(result).toBeDefined();
    expect(result).not.toContain("[truncated]");
    expect(result).toContain(exact);
  });
});
