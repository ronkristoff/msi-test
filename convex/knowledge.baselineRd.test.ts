/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace, seedProject, seedKnowledgeBase, seedModule, seedBaselineRd, seedBmadMetadata } from "./testHelpers";
import {
  baselineRdSchema,
  buildBaselineRdPrompt,
  applyBmadConfidenceAdjustment,
  clampSectionConfidence,
  parseOldRdHeadings,
  boundModulesForPrompt,
  ensureRequiredSections,
  REQUIRED_RD_SECTION_IDS,
  type RdGenerationContext,
  type RdSection,
} from "./knowledge/baselinePrompts";

const modules = import.meta.glob("./**/*.ts");

describe("baseline_rds schema", () => {
  it("accepts a draft RD row with all required fields", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    const rdId = await t.run(async (ctx) => {
      return ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [
          {
            id: "overview",
            title: "Overview",
            content: "A modular monolith.",
            confidence: 0.75,
          },
          {
            id: "tech-stack",
            title: "Tech Stack",
            content: "Next.js, Convex",
            confidence: 0.8,
            bmad_alignment: {
              prd_section_title: "Tech Stack",
              agreement: "agree",
            },
          },
        ],
        generated_at: Date.now(),
      });
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId));
    expect(rd).not.toBeNull();
    expect(rd!.status).toBe("draft");
    expect(rd!.version).toBe(1);
    expect(rd!.sections).toHaveLength(2);
    expect(rd!.sections[1].bmad_alignment?.agreement).toBe("agree");
  });

  it("rejects a row with an invalid status value", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("baseline_rds", {
          workspace_id: workspaceId,
          project_id: projectId,
          knowledge_base_id: kbId,
          version: 1,
          // @ts-expect-error testing invalid status
          status: "garbage",
          sections: [],
          generated_at: Date.now(),
        });
      }),
    ).rejects.toThrow();
  });
});

describe("baselineRdSchema zod validation", () => {
  const sixRequired = (): RdSection[] => [
    { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
    { id: "tech-stack", title: "Tech Stack", content: "x", confidence: 0.7 },
    { id: "modules", title: "Modules", content: "x", confidence: 0.7 },
    { id: "api-surface", title: "API Surface", content: "x", confidence: 0.7 },
    { id: "data-model", title: "Data Model", content: "x", confidence: 0.7 },
    { id: "user-flows", title: "User Flows", content: "x", confidence: 0.7 },
  ];

  it("passes for a valid RD with the six required sections", () => {
    const result = baselineRdSchema.safeParse({ sections: sixRequired() });
    expect(result.success).toBe(true);
  });

  it("fails when sections is empty", () => {
    const result = baselineRdSchema.safeParse({ sections: [] });
    expect(result.success).toBe(false);
  });

  it("fails when confidence is out of range", () => {
    const sections = sixRequired();
    sections[0] = { ...sections[0], confidence: 1.5 };
    const result = baselineRdSchema.safeParse({ sections });
    expect(result.success).toBe(false);
  });

  it("fails when a required section field is missing", () => {
    const sections = sixRequired();
    // @ts-expect-error testing missing field
    sections[0] = { id: "overview", title: "Overview", confidence: 0.7 };
    const result = baselineRdSchema.safeParse({ sections });
    expect(result.success).toBe(false);
  });

  it("allows an optional decision-log section (BMAD)", () => {
    const sections = [
      ...sixRequired(),
      { id: "decision-log", title: "Decision Log", content: "ADR-0001", confidence: 0.6 },
    ];
    const result = baselineRdSchema.safeParse({ sections });
    expect(result.success).toBe(true);
  });

  it("accepts bmad_alignment object shape", () => {
    const sections = sixRequired();
    sections[0] = {
      ...sections[0],
      bmad_alignment: { prd_section_title: "Overview", agreement: "agree" },
    };
    const result = baselineRdSchema.safeParse({ sections });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid bmad_alignment agreement value", () => {
    const sections = sixRequired();
    sections[0] = {
      ...sections[0],
      bmad_alignment: {
        prd_section_title: "Overview",
        // @ts-expect-error testing invalid agreement
        agreement: "wrong",
      },
    };
    const result = baselineRdSchema.safeParse({ sections });
    expect(result.success).toBe(false);
  });
});

describe("buildBaselineRdPrompt", () => {
  const baseContext: RdGenerationContext = {
    architectureSummary: {
      architecture_summary: "A modular monolith.",
      architecture_type: "monolith",
      folder_structure: "src/",
      tech_stack: ["Next.js", "Convex"],
    },
    modules: [
      {
        name: "auth",
        description: "Authentication",
        apis: [{ path: "/api/login", method: "POST" }],
        data_models: [{ name: "User" }],
        user_flows: [{ name: "Login" }],
      },
    ],
    kbStats: { total_files: 42, total_size_bytes: 102400 },
  };

  it("always includes the six required section titles", () => {
    const prompt = buildBaselineRdPrompt(baseContext);
    expect(prompt).toContain("Overview");
    expect(prompt).toContain("Tech Stack");
    expect(prompt).toContain("Modules");
    expect(prompt).toContain("API Surface");
    expect(prompt).toContain("Data Model");
    expect(prompt).toContain("User Flows");
  });

  it("includes Old RD headings when provided", () => {
    const prompt = buildBaselineRdPrompt({
      ...baseContext,
      oldRdHeadings: ["Introduction", "System Architecture", "Glossary"],
    });
    expect(prompt).toContain("Introduction");
    expect(prompt).toContain("System Architecture");
    expect(prompt).toContain("Glossary");
  });

  it("omits Old RD section when oldRdHeadings is undefined", () => {
    const prompt = buildBaselineRdPrompt(baseContext);
    expect(prompt).not.toContain("Old RD");
  });

  it("includes BMAD cross-reference instructions when bmadContext is provided", () => {
    const prompt = buildBaselineRdPrompt({
      ...baseContext,
      bmadContext: {
        prdSections: "### Section A\nfoo",
        adrs: "- ADR-0001: Adopt X",
      },
    });
    expect(prompt).toContain("BMAD");
    expect(prompt).toContain("Decision Log");
    expect(prompt).toContain("ADR-0001");
    expect(prompt).toContain("Section A");
  });

  it("omits BMAD instructions when bmadContext is null", () => {
    const prompt = buildBaselineRdPrompt(baseContext);
    expect(prompt).not.toContain("BMAD");
    expect(prompt).not.toContain("Decision Log");
  });

  it("includes module apis, data_models, and user_flows in the prompt", () => {
    const prompt = buildBaselineRdPrompt(baseContext);
    expect(prompt).toContain('"path":"/api/login"');
    expect(prompt).toContain('"name":"User"');
    expect(prompt).toContain('"name":"Login"');
  });
});

describe("applyBmadConfidenceAdjustment", () => {
  const baseSection: RdSection = {
    id: "overview",
    title: "Overview",
    content: "x",
    confidence: 0.75,
  };

  it("boosts +0.1 when agreement is 'agree', capped at 0.95", () => {
    const out = applyBmadConfidenceAdjustment([
      {
        ...baseSection,
        confidence: 0.75,
        bmad_alignment: { prd_section_title: "Overview", agreement: "agree" },
      },
    ]);
    expect(out[0].confidence).toBeCloseTo(0.85, 5);
  });

  it("caps at 0.95 when boost would exceed", () => {
    const out = applyBmadConfidenceAdjustment([
      {
        ...baseSection,
        confidence: 0.9,
        bmad_alignment: { prd_section_title: "Overview", agreement: "agree" },
      },
    ]);
    expect(out[0].confidence).toBe(0.95);
  });

  it("reduces -0.15 when agreement is 'diverge', floored at 0.1", () => {
    const out = applyBmadConfidenceAdjustment([
      {
        ...baseSection,
        confidence: 0.5,
        bmad_alignment: { prd_section_title: "Overview", agreement: "diverge" },
      },
    ]);
    expect(out[0].confidence).toBeCloseTo(0.35, 5);
  });

  it("floors at 0.1 when penalty would drop below", () => {
    const out = applyBmadConfidenceAdjustment([
      {
        ...baseSection,
        confidence: 0.15,
        bmad_alignment: { prd_section_title: "Overview", agreement: "diverge" },
      },
    ]);
    expect(out[0].confidence).toBe(0.1);
  });

  it("does not modify confidence when bmad_alignment is absent", () => {
    const out = applyBmadConfidenceAdjustment([
      { ...baseSection, confidence: 0.75 },
    ]);
    expect(out[0].confidence).toBe(0.75);
  });

  it("does not modify confidence when agreement is 'partial'", () => {
    const out = applyBmadConfidenceAdjustment([
      {
        ...baseSection,
        confidence: 0.6,
        bmad_alignment: { prd_section_title: "Overview", agreement: "partial" },
      },
    ]);
    expect(out[0].confidence).toBe(0.6);
  });

  it("returns new array (immutability) and does not mutate input", () => {
    const input: RdSection[] = [
      {
        ...baseSection,
        confidence: 0.7,
        bmad_alignment: { prd_section_title: "Overview", agreement: "agree" },
      },
    ];
    const out = applyBmadConfidenceAdjustment(input);
    expect(out).not.toBe(input);
    expect(out[0]).not.toBe(input[0]);
    expect(input[0].confidence).toBe(0.7);
  });

  it("handles empty array", () => {
    expect(applyBmadConfidenceAdjustment([])).toEqual([]);
  });

  it("backfills divergence_note when agreement is 'diverge' and none provided", () => {
    const out = applyBmadConfidenceAdjustment([
      {
        ...baseSection,
        confidence: 0.5,
        bmad_alignment: { prd_section_title: "Overview", agreement: "diverge" },
      },
    ]);
    expect(out[0].divergence_note).toBeTruthy();
    expect(out[0].divergence_note).toContain("Overview");
  });
});

describe("clampSectionConfidence", () => {
  it("clamps high confidence down to 0.95", () => {
    const out = clampSectionConfidence([
      { id: "x", title: "X", content: "x", confidence: 1.0 },
    ]);
    expect(out[0].confidence).toBe(0.95);
  });

  it("clamps low confidence up to 0.1", () => {
    const out = clampSectionConfidence([
      { id: "x", title: "X", content: "x", confidence: 0.0 },
    ]);
    expect(out[0].confidence).toBe(0.1);
  });

  it("leaves in-range confidence unchanged", () => {
    const out = clampSectionConfidence([
      { id: "x", title: "X", content: "x", confidence: 0.5 },
    ]);
    expect(out[0].confidence).toBe(0.5);
  });
});

describe("internal mutations: _storeBaselineRd", () => {
  it("inserts a draft RD and returns the new _id with version", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const result = await t.mutation(
      internal.knowledge.internal._storeBaselineRd,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        sections: [
          { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
        ],
      },
    );

    expect(result._id).toBeTruthy();
    expect(result.version).toBe(1);

    const rd = await t.run(async (ctx) => ctx.db.get(result._id));
    expect(rd!.status).toBe("draft");
    expect(rd!.version).toBe(1);
    expect(rd!.sections).toHaveLength(1);
    expect(rd!.generated_at).toBeGreaterThan(0);
  });

  it("computes version atomically — two stores produce versions 1 and 2", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const first = await t.mutation(
      internal.knowledge.internal._storeBaselineRd,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        sections: [
          { id: "overview", title: "Overview", content: "v1", confidence: 0.7 },
        ],
      },
    );
    const second = await t.mutation(
      internal.knowledge.internal._storeBaselineRd,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        sections: [
          { id: "overview", title: "Overview", content: "v2", confidence: 0.7 },
        ],
      },
    );

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });
});

describe("internal mutations: _archiveBaselineRd", () => {
  it("archives all non-archived RDs for a project and returns count", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const rdIds: string[] = [];
    for (const version of [1, 2, 3]) {
      const id = await t.run(async (ctx) => {
        return ctx.db.insert("baseline_rds", {
          workspace_id: workspaceId,
          project_id: projectId,
          knowledge_base_id: kbId,
          version,
          status: "draft",
          sections: [],
          generated_at: Date.now(),
        });
      });
      rdIds.push(id);
    }

    const { internal } = await import("./_generated/api");
    const archivedCount = await t.mutation(
      internal.knowledge.internal._archiveBaselineRd,
      { project_id: projectId },
    );

    expect(archivedCount).toBe(3);

    for (const id of rdIds) {
      const rd = await t.run(async (ctx) => ctx.db.get(id));
      expect(rd!.status).toBe("archived");
    }
  });

  it("is idempotent on re-run (returns 0 the second time)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [],
        generated_at: Date.now(),
      });
    });

    const { internal } = await import("./_generated/api");
    const first = await t.mutation(
      internal.knowledge.internal._archiveBaselineRd,
      { project_id: projectId },
    );
    const second = await t.mutation(
      internal.knowledge.internal._archiveBaselineRd,
      { project_id: projectId },
    );

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it("respects project scope — does not archive other projects' RDs", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectIdA = await seedProject(t, workspaceId);
    const projectIdB = await seedProject(t, workspaceId);
    const kbIdA = await seedKnowledgeBase(t, workspaceId, projectIdA);
    const kbIdB = await seedKnowledgeBase(t, workspaceId, projectIdB);

    const rdIdA = await t.run(async (ctx) => {
      return ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectIdA,
        knowledge_base_id: kbIdA,
        version: 1,
        status: "draft",
        sections: [],
        generated_at: Date.now(),
      });
    });
    const rdIdB = await t.run(async (ctx) => {
      return ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectIdB,
        knowledge_base_id: kbIdB,
        version: 1,
        status: "draft",
        sections: [],
        generated_at: Date.now(),
      });
    });

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveBaselineRd,
      { project_id: projectIdA },
    );

    expect(count).toBe(1);
    const rdA = await t.run(async (ctx) => ctx.db.get(rdIdA));
    const rdB = await t.run(async (ctx) => ctx.db.get(rdIdB));
    expect(rdA!.status).toBe("archived");
    expect(rdB!.status).toBe("draft");
  });

  it("returns 0 when no RDs exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveBaselineRd,
      { project_id: projectId },
    );
    expect(count).toBe(0);
  });

  it("archives more than 100 rows via paginated loop (no infinite loop on already-archived rows)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    for (let i = 0; i < 105; i++) {
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        version: i + 1,
        status: "draft",
      });
    }

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveBaselineRd,
      { project_id: projectId },
    );
    expect(count).toBe(105);
  });
});

describe("internal mutations: _getLatestRdVersion", () => {
  it("returns 0 when no RDs exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { internal } = await import("./_generated/api");
    const version = await t.query(
      internal.knowledge.internal._getLatestRdVersion,
      { project_id: projectId },
    );
    expect(version).toBe(0);
  });

  it("returns the max version across draft and archived", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    for (const version of [1, 2, 5]) {
      await t.run(async (ctx) => {
        await ctx.db.insert("baseline_rds", {
          workspace_id: workspaceId,
          project_id: projectId,
          knowledge_base_id: kbId,
          version,
          status: version === 5 ? "draft" : "archived",
          sections: [],
          generated_at: Date.now(),
        });
      });
    }

    const { internal } = await import("./_generated/api");
    const version = await t.query(
      internal.knowledge.internal._getLatestRdVersion,
      { project_id: projectId },
    );
    expect(version).toBe(5);
  });

  it("respects project scope", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectIdA = await seedProject(t, workspaceId);
    const projectIdB = await seedProject(t, workspaceId);
    const kbIdA = await seedKnowledgeBase(t, workspaceId, projectIdA);
    const kbIdB = await seedKnowledgeBase(t, workspaceId, projectIdB);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectIdA,
        knowledge_base_id: kbIdA,
        version: 3,
        status: "draft",
        sections: [],
        generated_at: Date.now(),
      });
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectIdB,
        knowledge_base_id: kbIdB,
        version: 7,
        status: "draft",
        sections: [],
        generated_at: Date.now(),
      });
    });

    const { internal } = await import("./_generated/api");
    const vA = await t.query(
      internal.knowledge.internal._getLatestRdVersion,
      { project_id: projectIdA },
    );
    expect(vA).toBe(3);
  });
});

describe("getBaselineRd public query", () => {
  it("returns null when no RD exists", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("returns the highest-version non-archived RD", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "archived",
        sections: [{ id: "overview", title: "Overview", content: "v1", confidence: 0.5 }],
        generated_at: Date.now(),
      });
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 3,
        status: "draft",
        sections: [{ id: "overview", title: "Overview", content: "v3", confidence: 0.8 }],
        generated_at: Date.now(),
      });
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 2,
        status: "archived",
        sections: [{ id: "overview", title: "Overview", content: "v2", confidence: 0.6 }],
        generated_at: Date.now(),
      });
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });

    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.status).toBe("draft");
    expect(result!.sections[0].content).toBe("v3");
  });

  it("returns null when all RDs are archived", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "archived",
        sections: [],
        generated_at: Date.now(),
      });
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("respects workspace ownership — cross-workspace returns null", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    await seedWorkspace(t);
    const otherWorkspaceId = await seedWorkspace(t, "user2");
    const projectId = await seedProject(t, otherWorkspaceId);
    const kbId = await seedKnowledgeBase(t, otherWorkspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: otherWorkspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [],
        generated_at: Date.now(),
      });
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("skips failed RDs — returns lower-version draft when highest is failed", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [{ id: "overview", title: "Overview", content: "good", confidence: 0.5 }],
        generated_at: Date.now(),
      });
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 2,
        status: "failed",
        sections: [],
        rd_generation_error: "timeout",
        generated_at: Date.now(),
      });
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.status).toBe("draft");
  });

  it("whitelists returned fields — does not leak rd_generation_error", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [{ id: "overview", title: "Overview", content: "x", confidence: 0.5 }],
        generated_at: Date.now(),
        rd_generation_error: "previous failure",
      });
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getBaselineRd, {
      project_id: projectId as never,
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("rd_generation_error");
    expect(result).not.toHaveProperty("workspace_id");
  });
});

describe("parseOldRdHeadings", () => {
  it("returns [] for empty input", () => {
    expect(parseOldRdHeadings("")).toEqual([]);
  });

  it("extracts ## and # headings", () => {
    const text = "# Title\n\nIntro\n\n## Section A\nfoo\n\n## Section B\nbar";
    expect(parseOldRdHeadings(text)).toEqual([
      "Title",
      "Section A",
      "Section B",
    ]);
  });

  it("ignores non-heading lines", () => {
    const text = "Some paragraph\nMore text";
    expect(parseOldRdHeadings(text)).toEqual([]);
  });
});

describe("boundModulesForPrompt", () => {
  it("returns all modules when total is under budget", () => {
    const mods = [
      { name: "auth", description: "Authentication" },
      { name: "billing", description: "Billing" },
    ];
    expect(boundModulesForPrompt(mods, 10000)).toHaveLength(2);
  });

  it("keeps all modules but truncates descriptions when budget exceeded", () => {
    const big = "x".repeat(200);
    const mods = [
      { name: "m1", description: big },
      { name: "m2", description: big },
      { name: "m3", description: big },
    ];
    const bounded = boundModulesForPrompt(mods, 500);
    expect(bounded).toHaveLength(3);
    expect(bounded.every((m) => m.name.length > 0)).toBe(true);
    const totalDescLen = bounded.reduce(
      (sum, m) => sum + (m.description?.length ?? 0),
      0,
    );
    expect(totalDescLen).toBeLessThan(big.length * 3);
  });

  it("returns empty for empty input", () => {
    expect(boundModulesForPrompt([], 1000)).toEqual([]);
  });
});

describe("ensureRequiredSections", () => {
  it("fills missing required sections with placeholders", () => {
    const out = ensureRequiredSections([
      { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
    ]);
    const ids = out.map((s) => s.id);
    for (const required of REQUIRED_RD_SECTION_IDS) {
      expect(ids).toContain(required);
    }
  });

  it("preserves existing required sections untouched", () => {
    const existing: RdSection = {
      id: "overview",
      title: "Overview",
      content: "kept",
      confidence: 0.85,
    };
    const out = ensureRequiredSections([existing]);
    const overview = out.find((s) => s.id === "overview");
    expect(overview).toEqual(existing);
  });

  it("placeholder confidence is at the minimum (0.1)", () => {
    const out = ensureRequiredSections([]);
    const placeholder = out.find((s) => s.id === "modules");
    expect(placeholder?.confidence).toBe(0.1);
  });

  it("returns new array (immutability)", () => {
    const input: RdSection[] = [
      { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
    ];
    const out = ensureRequiredSections(input);
    expect(out).not.toBe(input);
    expect(input).toHaveLength(1);
  });

  it("adds decision-log section when bmad flag is set", () => {
    const out = ensureRequiredSections(
      [
        { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
      ],
      { bmad: true },
    );
    expect(out.some((s) => s.id === "decision-log")).toBe(true);
  });

  it("does NOT add decision-log when bmad flag is false", () => {
    const out = ensureRequiredSections(
      [
        { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
      ],
      { bmad: false },
    );
    expect(out.some((s) => s.id === "decision-log")).toBe(false);
  });

  it("normalizes wrong-case IDs to lowercase (dedup)", () => {
    const out = ensureRequiredSections([
      { id: "Overview", title: "Overview", content: "x", confidence: 0.7 } as RdSection,
    ]);
    const overviews = out.filter((s) => s.id === "overview");
    expect(overviews).toHaveLength(1);
    expect(out.some((s) => s.id === "Overview")).toBe(false);
  });

  it("orders sections canonically", () => {
    const out = ensureRequiredSections([
      { id: "user-flows", title: "User Flows", content: "x", confidence: 0.7 },
      { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
    ]);
    expect(out[0].id).toBe("overview");
    expect(out[out.length - 1].id).toBe("user-flows");
  });
});

describe("internal queries: _getKbForBaselineRd", () => {
  it("returns KB + modules + null old_rd when no project text", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
      architecture_type: "monolith",
      folder_structure: "src/",
      total_files: 10,
      total_size_bytes: 1000,
      bmad_detected: false,
    });
    await seedModule(t, workspaceId, kbId, { name: "auth", description: "Auth module" });

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForBaselineRd,
      { knowledge_base_id: kbId },
    );

    expect(kb).not.toBeNull();
    expect(kb!.architecture_summary).toBe("Monolith");
    expect(kb!.tech_stack).toEqual(["Next.js"]);
    expect(kb!.bmad_detected).toBe(false);
    expect(kb!.modules).toHaveLength(1);
    expect(kb!.modules[0].name).toBe("auth");
    expect(kb!.old_rd_extracted_text).toBeNull();
  });

  it("returns old_rd_extracted_text when present on project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\n## Section A\nbody",
      });
    });

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForBaselineRd,
      { knowledge_base_id: kbId },
    );

    expect(kb!.old_rd_extracted_text).toContain("Old RD");
  });
});

describe("buildBaselineRdErrorMessage", () => {
  it("returns auth message for 401", async () => {
    const { buildBaselineRdErrorMessage } = await import(
      "./knowledge/baselineActions"
    );
    const msg = buildBaselineRdErrorMessage({ statusCode: 401, message: "bad key" });
    expect(msg).toContain("authentication");
  });

  it("returns model not available for 404", async () => {
    const { buildBaselineRdErrorMessage } = await import(
      "./knowledge/baselineActions"
    );
    const msg = buildBaselineRdErrorMessage({ statusCode: 404, message: "not found" });
    expect(msg).toContain("model not available");
  });

  it("includes underlying message for generic errors", async () => {
    const { buildBaselineRdErrorMessage } = await import(
      "./knowledge/baselineActions"
    );
    const msg = buildBaselineRdErrorMessage(new Error("rate limited"));
    expect(msg).toContain("rate limited");
  });
});

describe("generateBaselineRd action (AI mocked)", () => {
  beforeEach(async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockReset();
  });

  it("queries KB, builds prompt, clamps confidence, and stores RD", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    const mockSections: RdSection[] = [
      { id: "overview", title: "Overview", content: "App", confidence: 0.7 },
      { id: "tech-stack", title: "Tech Stack", content: "Next.js", confidence: 0.7 },
      { id: "modules", title: "Modules", content: "Auth", confidence: 0.7 },
      { id: "api-surface", title: "API Surface", content: "POST /login", confidence: 0.7 },
      { id: "data-model", title: "Data Model", content: "User", confidence: 0.7 },
      { id: "user-flows", title: "User Flows", content: "Login flow", confidence: 0.7 },
    ];
    generateObjectMock.mockResolvedValue({ object: { sections: mockSections } } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
      architecture_type: "monolith",
      folder_structure: "src/",
    });
    await seedModule(t, workspaceId, kbId, { name: "auth" });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRd,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    expect(result.baselineRdId).toBeTruthy();
    expect(result.version).toBe(1);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);

    const stored = await t.run(async (ctx) => {
      const rd = await ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId as never))
        .first();
      return rd;
    });
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("draft");
    expect(stored!.version).toBe(1);

    const userFlows = stored!.sections.find((s) => s.id === "user-flows");
    expect(userFlows?.bmad_alignment).toBeUndefined();
    expect(userFlows?.confidence).toBe(0.7);
  });

  it("throws ConvexError with auth message when AI returns 401", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockRejectedValue({ statusCode: 401, message: "bad key" } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    const { internal } = await import("./_generated/api");
    await expect(
      t.action(internal.knowledge.baselineActions.generateBaselineRd, {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      }),
    ).rejects.toThrow("authentication");
  });

  it("throws ConvexError when KB has no architecture_summary", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({ object: { sections: [] } } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    const { internal } = await import("./_generated/api");
    await expect(
      t.action(internal.knowledge.baselineActions.generateBaselineRd, {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      }),
    ).rejects.toThrow("architecture extraction");

    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("fills missing required sections with placeholders after generation", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: {
        sections: [
          { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
        ],
      },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRd,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.baselineRdId as never));
    const ids = stored!.sections.map((s) => s.id);
    for (const required of REQUIRED_RD_SECTION_IDS) {
      expect(ids).toContain(required);
    }
  });

  it("non-BMAD path: no bmad_alignment on sections → no clamp applied", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: {
        sections: [
          { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
          { id: "tech-stack", title: "Tech Stack", content: "x", confidence: 0.7 },
          { id: "modules", title: "Modules", content: "x", confidence: 0.7 },
          { id: "api-surface", title: "API Surface", content: "x", confidence: 0.7 },
          { id: "data-model", title: "Data Model", content: "x", confidence: 0.7 },
          { id: "user-flows", title: "User Flows", content: "x", confidence: 0.5 },
        ],
      },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
      bmad_detected: false,
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRd,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.baselineRdId as never));
    const userFlows = stored!.sections.find((s) => s.id === "user-flows");
    expect(userFlows?.bmad_alignment).toBeUndefined();
    expect(userFlows?.confidence).toBe(0.5);
  });

  it("BMAD path: KB has bmad_detected → cross-ref applied and clamp adjusts confidence", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: {
        sections: [
          { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
          { id: "tech-stack", title: "Tech Stack", content: "x", confidence: 0.7 },
          { id: "modules", title: "Modules", content: "x", confidence: 0.7 },
          { id: "api-surface", title: "API Surface", content: "x", confidence: 0.7 },
          { id: "data-model", title: "Data Model", content: "x", confidence: 0.7 },
          {
            id: "user-flows",
            title: "User Flows",
            content: "x",
            confidence: 0.6,
            bmad_alignment: { prd_section_title: "User Flows", agreement: "diverge" },
            divergence_note: "PRD mentions OAuth, code uses session",
          },
        ],
      },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
      bmad_detected: true,
    });
    await seedBmadMetadata(t, workspaceId, kbId, [
      {
        type: "prd_section",
        key: "User Flows",
        content: "PRD says OAuth login",
        source_path: "_bmad-output/prd.md",
      },
    ]);

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRd,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.baselineRdId as never));
    const userFlows = stored!.sections.find((s) => s.id === "user-flows");
    expect(userFlows?.bmad_alignment?.agreement).toBe("diverge");
    expect(userFlows?.confidence).toBeCloseTo(0.45, 5);
    expect(userFlows?.divergence_note).toBeTruthy();

    const prompt = generateObjectMock.mock.calls[0][0]?.prompt as { prompt?: string };
    expect(prompt).toBeDefined();
  });
});

describe("resync archival: resyncKnowledgeBase archives previous RD", () => {
  it("resyncKnowledgeBase calls _archiveBaselineRd before re-ingestion", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        repo_url: "https://github.com/test/repo",
        encrypted_pat: "encrypted_pat",
        kb_status: "ready",
      });
    });

    const draftRdId = await t.run(async (ctx) => {
      return ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [{ id: "overview", title: "Overview", content: "x", confidence: 0.5 }],
        generated_at: Date.now(),
      });
    });

    const { api } = await import("./_generated/api");
    // The resync action may throw downstream at clearRagNamespace (no real RAG
    // backend in the test environment), but _archiveBaselineRd runs before that
    // step. We assert that archival happened regardless of the downstream error.
    await expect(
      t.action(api.knowledge.triggerIngestion.resyncKnowledgeBase, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow();

    const rd = await t.run(async (ctx) => ctx.db.get(draftRdId));
    expect(rd!.status).toBe("archived");
  });

  it("subsequent generation after archival creates version N+1", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: {
        sections: [
          { id: "overview", title: "Overview", content: "fresh", confidence: 0.8 },
          { id: "tech-stack", title: "Tech Stack", content: "x", confidence: 0.8 },
          { id: "modules", title: "Modules", content: "x", confidence: 0.8 },
          { id: "api-surface", title: "API Surface", content: "x", confidence: 0.8 },
          { id: "data-model", title: "Data Model", content: "x", confidence: 0.8 },
          { id: "user-flows", title: "User Flows", content: "x", confidence: 0.8 },
        ],
      },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [{ id: "overview", title: "Overview", content: "old", confidence: 0.5 }],
        generated_at: Date.now(),
      });
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._archiveBaselineRd, {
      project_id: projectId,
    });

    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRd,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    expect(result.version).toBe(2);
  });
});

describe("triggerBaselineRd manual action", () => {

  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerBaselineRd, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow();
  });

  it("requires KB to be 'ready'", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({ object: { sections: [] } } as never);

    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "building" });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { kb_status: "building" });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerBaselineRd, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("'ready'");
  });

  it("rejects cross-workspace access (IDOR guard)", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({ object: { sections: [] } } as never);

    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    await seedWorkspace(t);
    const otherWorkspaceId = await seedWorkspace(t, "user2");
    const projectId = await seedProject(t, otherWorkspaceId);
    await seedKnowledgeBase(t, otherWorkspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { kb_status: "ready" });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerBaselineRd, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("not found");
  });

  it("archives previous RD then generates version N+1", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: {
        sections: [
          { id: "overview", title: "Overview", content: "new", confidence: 0.8 },
          { id: "tech-stack", title: "Tech Stack", content: "x", confidence: 0.8 },
          { id: "modules", title: "Modules", content: "x", confidence: 0.8 },
          { id: "api-surface", title: "API Surface", content: "x", confidence: 0.8 },
          { id: "data-model", title: "Data Model", content: "x", confidence: 0.8 },
          { id: "user-flows", title: "User Flows", content: "x", confidence: 0.8 },
        ],
      },
    } as never);

    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { kb_status: "ready" });
      await ctx.db.insert("baseline_rds", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        version: 1,
        status: "draft",
        sections: [{ id: "overview", title: "Overview", content: "old", confidence: 0.5 }],
        generated_at: Date.now(),
      });
    });

    const { api } = await import("./_generated/api");
    const result = await t.action(
      api.knowledge.triggerIngestion.triggerBaselineRd,
      { project_id: projectId as never },
    );

    expect(result.version).toBe(2);
    expect(result.baselineRdId).toBeTruthy();

    const rds = await t.run(async (ctx) => {
      return ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId as never))
        .collect();
    });

    expect(rds).toHaveLength(2);
    const archived = rds.find((r) => r.version === 1);
    const fresh = rds.find((r) => r.version === 2);
    expect(archived!.status).toBe("archived");
    expect(fresh!.status).toBe("draft");
    expect(fresh!._id).toBe(result.baselineRdId);
  });
});

describe("_logBaselineRdFailure internal mutation", () => {
  it("inserts a failed RD row with rd_generation_error set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const result = await t.mutation(
      internal.knowledge.internal._logBaselineRdFailure,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        error_message: "AI provider timeout",
      },
    );

    expect(result._id).toBeTruthy();
    expect(result.version).toBe(1);

    const rd = await t.run(async (ctx) => ctx.db.get(result._id));
    expect(rd).not.toBeNull();
    expect(rd!.status).toBe("failed");
    expect(rd!.version).toBe(1);
    expect(rd!.sections).toEqual([]);
    expect(rd!.rd_generation_error).toBe("AI provider timeout");
  });

  it("truncates error_message to the max length", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { RD_ERROR_MESSAGE_MAX_LENGTH } = await import("./lib/constraints");
    const huge = "E".repeat(RD_ERROR_MESSAGE_MAX_LENGTH + 500);

    const { internal } = await import("./_generated/api");
    const result = await t.mutation(
      internal.knowledge.internal._logBaselineRdFailure,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        error_message: huge,
      },
    );

    const rd = await t.run(async (ctx) => ctx.db.get(result._id));
    expect(rd!.rd_generation_error!.length).toBe(RD_ERROR_MESSAGE_MAX_LENGTH);
  });
});

describe("generateBaselineRdWithLogging wrapper", () => {
  beforeEach(async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockReset();
  });

  it("returns success result when underlying action succeeds", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: {
        sections: [
          { id: "overview", title: "Overview", content: "x", confidence: 0.7 },
          { id: "tech-stack", title: "Tech Stack", content: "x", confidence: 0.7 },
          { id: "modules", title: "Modules", content: "x", confidence: 0.7 },
          { id: "api-surface", title: "API Surface", content: "x", confidence: 0.7 },
          { id: "data-model", title: "Data Model", content: "x", confidence: 0.7 },
          { id: "user-flows", title: "User Flows", content: "x", confidence: 0.7 },
        ],
      },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRdWithLogging,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    expect(result.baselineRdId).toBeTruthy();
    expect(result.version).toBe(1);
    expect(result).not.toHaveProperty("error");
  });

  it("catches errors and logs via _logBaselineRdFailure (does not throw)", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockRejectedValue({ statusCode: 401, message: "bad key" } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRdWithLogging,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    expect(result.baselineRdId).toBeNull();
    expect(result.error).toBeTruthy();

    const rds = await t.run(async (ctx) => {
      return ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId as never))
        .collect();
    });
    expect(rds).toHaveLength(1);
    expect(rds[0].status).toBe("failed");
    expect(rds[0].rd_generation_error).toBeTruthy();
    expect(rds[0].sections).toEqual([]);
  });
});

describe("ingestion workflow auto-trigger", () => {
  it("generateBaselineRdWithLogging is registered as an internal action", async () => {
    const mod = await import("./knowledge/baselineActions");
    expect(mod.generateBaselineRdWithLogging).toBeDefined();
  });

  it("ingestionWorkflow source calls generateBaselineRdWithLogging as its final step", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const workflowPath = path.resolve(
      process.cwd(),
      "convex/knowledge/ingestionWorkflow.ts",
    );
    const source = fs.readFileSync(workflowPath, "utf-8");
    expect(source).toContain(
      "internal.knowledge.baselineActions.generateBaselineRdWithLogging",
    );
    // Verify it appears AFTER _setLastSyncedAt (the previous last step)
    const loggingIdx = source.indexOf("generateBaselineRdWithLogging");
    const syncedIdx = source.indexOf("_setLastSyncedAt");
    expect(syncedIdx).toBeGreaterThan(-1);
    expect(loggingIdx).toBeGreaterThan(syncedIdx);
  });

  it("KB stays 'ready' when RD generation throws — wrapper catches and logs", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockRejectedValue({ statusCode: 401, message: "bad key" } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.baselineActions.generateBaselineRdWithLogging,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
      },
    );

    expect(result.baselineRdId).toBeNull();
    expect(result.error).toBeTruthy();

    const kb = await t.run(async (ctx) => ctx.db.get(kbId as never));
    expect(kb!.status).toBe("ready");
  });
});

describe("seedBaselineRd test helper", () => {
  it("seeds a draft RD with default sections and version 1", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const rdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const rd = await t.run(async (ctx) => ctx.db.get(rdId));
    expect(rd).not.toBeNull();
    expect(rd!.version).toBe(1);
    expect(rd!.status).toBe("draft");
    expect(rd!.sections.length).toBeGreaterThan(0);
  });

  it("accepts overrides for version, status, sections, rd_generation_error", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const rdId = await seedBaselineRd(t, workspaceId, projectId, kbId, {
      version: 3,
      status: "archived",
      sections: [
        { id: "overview", title: "Overview", content: "custom", confidence: 0.4 },
      ],
      rd_generation_error: "boom",
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId));
    expect(rd!.version).toBe(3);
    expect(rd!.status).toBe("archived");
    expect(rd!.sections).toHaveLength(1);
    expect(rd!.rd_generation_error).toBe("boom");
  });
});
