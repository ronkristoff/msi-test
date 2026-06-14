/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
  seedBmadMetadata,
} from "./testHelpers";
import {
  detectBmadFiles,
  categorizeBmadFile,
  parsePrd,
  parseAdr,
  parseProjectContext,
  parseContextMd,
  type BmadMetadataEntry,
} from "./knowledge/bmadParsing";
import type { TreeEntry } from "./knowledge/github";

const modules = import.meta.glob("./**/*.ts");

describe("bmadParsing: detectBmadFiles", () => {
  it("returns BMAD file entries from a full tree", () => {
    const tree: TreeEntry[] = [
      { path: "src/app/page.tsx", type: "blob", size: 100 },
      { path: "_bmad-output/planning-artifacts/prd.md", type: "blob", size: 500 },
      { path: "_bmad-output/project-context.md", type: "blob", size: 300 },
      { path: "docs/adr/0001-test.md", type: "blob", size: 200 },
      { path: "AGENTS.md", type: "blob", size: 150 },
      { path: "CONTEXT.md", type: "blob", size: 800 },
      { path: "node_modules/react/index.js", type: "blob", size: 1000 },
      { path: "convex/schema.ts", type: "blob", size: 400 },
    ];

    const result = detectBmadFiles(tree);
    expect(result).toHaveLength(5);
    expect(result.map((e) => e.path)).toEqual([
      "_bmad-output/planning-artifacts/prd.md",
      "_bmad-output/project-context.md",
      "docs/adr/0001-test.md",
      "AGENTS.md",
      "CONTEXT.md",
    ]);
  });

  it("returns empty array when no BMAD indicators present", () => {
    const tree: TreeEntry[] = [
      { path: "src/app/page.tsx", type: "blob", size: 100 },
      { path: "convex/schema.ts", type: "blob", size: 400 },
      { path: "README.md", type: "blob", size: 50 },
    ];

    const result = detectBmadFiles(tree);
    expect(result).toHaveLength(0);
  });

  it("filters out tree entries (directories)", () => {
    const tree: TreeEntry[] = [
      { path: "_bmad-output/", type: "tree" },
      { path: "_bmad-output/planning-artifacts/prd.md", type: "blob", size: 500 },
      { path: "docs/adr/", type: "tree" },
    ];

    const result = detectBmadFiles(tree);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("_bmad-output/planning-artifacts/prd.md");
  });

  it("detects CLAUDE.md as a BMAD indicator", () => {
    const tree: TreeEntry[] = [
      { path: "CLAUDE.md", type: "blob", size: 100 },
      { path: "src/app.tsx", type: "blob", size: 200 },
    ];

    const result = detectBmadFiles(tree);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("CLAUDE.md");
  });

  it("detects files under _bmad/ prefix", () => {
    const tree: TreeEntry[] = [
      { path: "_bmad/skills/my-skill.md", type: "blob", size: 100 },
      { path: "src/app.tsx", type: "blob", size: 200 },
    ];

    const result = detectBmadFiles(tree);
    expect(result).toHaveLength(1);
  });
});

describe("bmadParsing: categorizeBmadFile", () => {
  it("categorizes ADR files correctly", () => {
    expect(categorizeBmadFile("docs/adr/0001-test.md")).toBe("adr");
    expect(categorizeBmadFile("docs/adr/0042-convex-agent.md")).toBe("adr");
  });

  it("categorizes CONTEXT.md correctly", () => {
    expect(categorizeBmadFile("CONTEXT.md")).toBe("context_md");
  });

  it("categorizes AGENTS.md and CLAUDE.md as agents_md", () => {
    expect(categorizeBmadFile("AGENTS.md")).toBe("agents_md");
    expect(categorizeBmadFile("CLAUDE.md")).toBe("agents_md");
  });

  it("categorizes project-context files correctly", () => {
    expect(categorizeBmadFile("_bmad-output/project-context.md")).toBe("project_context");
    expect(categorizeBmadFile("_bmad-output/planning-artifacts/project-context.md")).toBe("project_context");
  });

  it("categorizes PRD files correctly", () => {
    expect(categorizeBmadFile("_bmad-output/planning-artifacts/prd-msi-analyst.md")).toBe("prd");
    expect(categorizeBmadFile("_bmad-output/planning-artifacts/my-prd-doc.md")).toBe("prd");
  });

  it("categorizes unknown files as other", () => {
    expect(categorizeBmadFile("_bmad-output/something.md")).toBe("other");
    expect(categorizeBmadFile("_bmad/random.md")).toBe("other");
  });
});

describe("bmadParsing: parsePrd", () => {
  it("splits markdown on ## headers", () => {
    const content = `# My PRD

## Introduction
This is the intro.

## Requirements
- Req 1
- Req 2

## Conclusion
Done`;

    const result = parsePrd(content, "_bmad-output/planning-artifacts/prd.md");
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("prd_section");
    expect(result[0].key).toBe("Introduction");
    expect(result[0].content).toBe("This is the intro.");
    expect(result[1].key).toBe("Requirements");
    expect(result[1].content).toBe("- Req 1\n- Req 2");
    expect(result[2].key).toBe("Conclusion");
    expect(result[2].content).toBe("Done");
  });

  it("returns empty array when no ## headers present", () => {
    const content = `# Title only\n\nSome text without headers.`;
    const result = parsePrd(content, "test.md");
    expect(result).toHaveLength(0);
  });

  it("includes source_path in each entry", () => {
    const content = `## Section A\nContent A`;
    const result = parsePrd(content, "_bmad-output/planning-artifacts/prd.md");
    expect(result[0].source_path).toBe("_bmad-output/planning-artifacts/prd.md");
  });
});

describe("bmadParsing: parseAdr", () => {
  it("extracts id, title, status, and decision from ADR format", () => {
    const content = `# ADR 0001: Separate Test Runner

## Status

Accepted

## Context

Some context text.

## Decision

We decided to use a separate runner.

## Consequences

- Pro 1
- Con 1`;

    const result = parseAdr(content, "docs/adr/0001-separate-test-runner.md");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("adr");
    expect(result!.key).toBe("ADR-0001");
    expect(result!.content).toBe("We decided to use a separate runner.");
    expect(result!.metadata?.title).toBe("ADR 0001: Separate Test Runner");
    expect(result!.metadata?.status).toBe("Accepted");
    expect(result!.source_path).toBe("docs/adr/0001-separate-test-runner.md");
  });

  it("handles ADR without explicit Decision section", () => {
    const content = `# ADR 0042: Some Decision

## Status

Proposed

## Context

Context here.`;

    const result = parseAdr(content, "docs/adr/0042-some-decision.md");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("ADR-0042");
    expect(result!.metadata?.status).toBe("Proposed");
    expect(result!.content.length).toBeGreaterThan(0);
  });

  it("uses filename as key when no numeric prefix", () => {
    const content = `# Some Title\n\n## Status\n\nAccepted`;
    const result = parseAdr(content, "docs/adr/no-number.md");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("no-number");
  });
});

describe("bmadParsing: parseProjectContext", () => {
  it("extracts ### subsections as conventions", () => {
    const content = `---
date: '2026-06-13'
---

# Project Context

### Language Rules

- Use strict TypeScript
- No any type

### Framework Rules

- Use App Router
- Server components by default`;

    const result = parseProjectContext(content, "_bmad-output/project-context.md");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("convention");
    expect(result[0].key).toBe("Language Rules");
    expect(result[0].content).toContain("Use strict TypeScript");
    expect(result[1].key).toBe("Framework Rules");
    expect(result[1].content).toContain("Use App Router");
  });

  it("strips YAML frontmatter before parsing", () => {
    const content = `---
key: value
---

### Only Section

Rule here`;

    const result = parseProjectContext(content, "test.md");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("Only Section");
  });

  it("returns empty array when no ### headers", () => {
    const content = `# Title\n\nSome text.`;
    const result = parseProjectContext(content, "test.md");
    expect(result).toHaveLength(0);
  });
});

describe("bmadParsing: parseContextMd", () => {
  it("extracts glossary terms from ## Glossary bullets", () => {
    const content = `# Project Title

## Glossary

- **Workspace** — Top-level organizational container.
- **Project** — A client engagement.
- **Knowledge Base** — A structured, indexed representation.

## Other Section

Not parsed.`;

    const result = parseContextMd(content, "CONTEXT.md");
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("domain_term");
    expect(result[0].key).toBe("Workspace");
    expect(result[0].content).toBe("Top-level organizational container.");
    expect(result[1].key).toBe("Project");
    expect(result[2].key).toBe("Knowledge Base");
  });

  it("returns empty array when no Glossary section", () => {
    const content = `# Title\n\n## Not Glossary\n\n- Some text`;
    const result = parseContextMd(content, "CONTEXT.md");
    expect(result).toHaveLength(0);
  });

  it("handles em-dash and en-dash separators", () => {
    const content = `## Glossary\n\n- **Term1** — Definition one\n- **Term2** – Definition two\n- **Term3** - Definition three`;
    const result = parseContextMd(content, "CONTEXT.md");
    expect(result).toHaveLength(3);
  });
});

describe("bmadParsing: BmadMetadataEntry type export", () => {
  it("BmadMetadataEntry has correct structure", () => {
    const entry: BmadMetadataEntry = {
      type: "prd_section",
      key: "Test",
      content: "Content",
      source_path: "test.md",
    };
    expect(entry.type).toBe("prd_section");
    expect(entry.key).toBe("Test");

    const entryWithMeta: BmadMetadataEntry = {
      type: "adr",
      key: "ADR-0001",
      content: "Decision",
      source_path: "docs/adr/0001.md",
      metadata: { title: "Title", status: "Accepted" },
    };
    expect(entryWithMeta.metadata?.title).toBe("Title");
  });
});

describe("bmad: _storeBmadMetadata", () => {
  it("inserts entries and returns ids", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const ids = await t.mutation(internal.knowledge.internal._storeBmadMetadata, {
      kb_id: kbId,
      workspace_id: workspaceId,
      entries: [
        { type: "prd_section", key: "Intro", content: "Intro content", source_path: "prd.md", metadata: null },
        { type: "adr", key: "ADR-0001", content: "Decision text", source_path: "docs/adr/0001.md", metadata: { title: "ADR 1", status: "Accepted" } },
      ],
    });

    expect(ids).toHaveLength(2);

    const entries = await t.run(async (ctx) => {
      return ctx.db.query("kb_bmad_metadata").withIndex("by_kb_id", (q) => q.eq("kb_id", kbId)).collect();
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe("Intro");
    expect(entries[1].key).toBe("ADR-0001");
  });
});

describe("bmad: _deleteBmadMetadataByKb", () => {
  it("deletes all entries for a KB and returns count", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await seedBmadMetadata(t, workspaceId, kbId, [
      { type: "prd_section", key: "S1", content: "c1", source_path: "p.md" },
      { type: "prd_section", key: "S2", content: "c2", source_path: "p.md" },
      { type: "adr", key: "ADR-0001", content: "d1", source_path: "a.md" },
    ]);

    const { internal } = await import("./_generated/api");
    const deletedCount = await t.mutation(internal.knowledge.internal._deleteBmadMetadataByKb, {
      knowledge_base_id: kbId,
    });

    expect(deletedCount).toBe(3);

    const remaining = await t.run(async (ctx) => {
      return ctx.db.query("kb_bmad_metadata").withIndex("by_kb_id", (q) => q.eq("kb_id", kbId)).collect();
    });
    expect(remaining).toHaveLength(0);
  });

  it("returns 0 when no entries exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const deletedCount = await t.mutation(internal.knowledge.internal._deleteBmadMetadataByKb, {
      knowledge_base_id: kbId,
    });

    expect(deletedCount).toBe(0);
  });
});

describe("bmad: _setBmadDetected", () => {
  it("sets bmad_detected=true and bmad_parsed_at when detected", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: kbId,
      detected: true,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.bmad_detected).toBe(true);
    expect(kb!.bmad_parsed_at).toBeDefined();
    expect(typeof kb!.bmad_parsed_at).toBe("number");
  });

  it("sets bmad_detected=false and clears bmad_parsed_at", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: kbId,
      detected: true,
    });
    await t.mutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: kbId,
      detected: false,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.bmad_detected).toBe(false);
    expect(kb!.bmad_parsed_at).toBeUndefined();
  });
});

describe("bmad: _resetKbForResync clears BMAD fields", () => {
  it("clears bmad_detected and bmad_parsed_at", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: kbId,
      detected: true,
    });

    await t.mutation(internal.knowledge.internal._resetKbForResync, {
      knowledge_base_id: kbId,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.bmad_detected).toBeUndefined();
    expect(kb!.bmad_parsed_at).toBeUndefined();
  });
});

describe("bmad: _getBmadMetadataForExtraction", () => {
  it("returns detected=false when bmad_detected is not set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const result = await t.query(internal.knowledge.internal._getBmadMetadataForExtraction, {
      knowledge_base_id: kbId,
    });

    expect(result.detected).toBe(false);
    expect(result.prdSections).toBe("");
    expect(result.adrs).toBe("");
  });

  it("returns concatenated PRD sections and ADRs when detected", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await seedBmadMetadata(t, workspaceId, kbId, [
      { type: "prd_section", key: "Overview", content: "Project overview text", source_path: "prd.md" },
      { type: "prd_section", key: "Goals", content: "Goal 1", source_path: "prd.md" },
      { type: "adr", key: "ADR-0001", content: "Use separate runner", source_path: "docs/adr/0001.md", metadata: { title: "Separate Runner", status: "Accepted" } },
    ]);

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: kbId,
      detected: true,
    });

    const result = await t.query(internal.knowledge.internal._getBmadMetadataForExtraction, {
      knowledge_base_id: kbId,
    });

    expect(result.detected).toBe(true);
    expect(result.prdSections).toContain("Overview");
    expect(result.prdSections).toContain("Project overview text");
    expect(result.prdSections).toContain("Goals");
    expect(result.adrs).toContain("ADR-0001");
    expect(result.adrs).toContain("Separate Runner");
    expect(result.adrs).toContain("Accepted");
  });
});

describe("bmad: getBmadMetadata public query", () => {
  it("returns grouped metadata for authenticated workspace member", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await seedBmadMetadata(t, workspaceId, kbId, [
      { type: "prd_section", key: "Intro", content: "Intro content", source_path: "prd.md" },
      { type: "adr", key: "ADR-0001", content: "Decision", source_path: "a.md", metadata: { title: "T1", status: "Accepted" } },
      { type: "convention", key: "Naming", content: "Use PascalCase", source_path: "pc.md" },
      { type: "domain_term", key: "Workspace", content: "Top-level container", source_path: "CONTEXT.md" },
    ]);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBmadMetadata, {
      knowledge_base_id: kbId,
    });

    expect(result).not.toBeNull();
    expect(result!.prd_sections).toHaveLength(1);
    expect(result!.adrs).toHaveLength(1);
    expect(result!.conventions).toHaveLength(1);
    expect(result!.domain_terms).toHaveLength(1);
  });

  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBmadMetadata, {
      knowledge_base_id: kbId,
    });

    expect(result).toBeNull();
  });

  it("returns null when KB belongs to different workspace", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    await seedWorkspace(t);

    const otherWorkspaceId = await t.run(async (ctx) => {
      const wsId = await ctx.db.insert("workspaces", {
        name: "Other WS",
        owner_id: "user2",
        ai_config: { endpoint_url: "https://api.example.com", api_key: "key", model_name: "gpt-4" },
      });
      await ctx.db.insert("workspace_members", {
        workspace_id: wsId,
        user_id: "user2",
        role: "owner",
        invited_at: Date.now(),
        user_name: "user2",
      });
      return wsId;
    });

    const otherProjectId = await seedProject(t, otherWorkspaceId);
    const otherKbId = await seedKnowledgeBase(t, otherWorkspaceId, otherProjectId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBmadMetadata, {
      knowledge_base_id: otherKbId,
    });

    expect(result).toBeNull();
  });
});

describe("bmad: detectAndParseBmad action registration", () => {
  it("detectAndParseBmad is registered as an internal action", async () => {
    const mod = await import("./knowledge/bmadActions");
    expect(mod.detectAndParseBmad).toBeDefined();
  });
});

describe("bmad: ingestionActions.decryptAndFetchTree returns bmadFiles", () => {
  it("decryptAndFetchTree is still registered", async () => {
    const mod = await import("./knowledge/ingestionActions");
    expect(mod.decryptAndFetchTree).toBeDefined();
  });
});
