/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
  seedBaselineRd,
  seedDriftReport,
  seedBmadMetadata,
} from "./testHelpers";
import {
  driftReportSchema,
  buildDriftReportPrompt,
  filterDriftDimensions,
  validateDriftItemSectionIds,
  boundDriftContext,
  KNOWN_RD_SECTION_IDS,
  type DriftGenerationContext,
  type DriftItem,
} from "./knowledge/driftPrompts";

const modules = import.meta.glob("./**/*.ts");

const baseItem = (overrides: Partial<DriftItem> = {}): DriftItem => ({
  dimension: "old-rd-vs-code",
  category: "added",
  severity: "incremental",
  title: "Sample drift",
  description: "A sample drift item.",
  rd_section_id: "overview",
  ...overrides,
});

describe("drift_reports schema", () => {
  it("accepts a draft report row with all required fields", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const reportId = await t.run(async (ctx) => {
      return ctx.db.insert("drift_reports", {
        workspace_id: workspaceId,
        project_id: projectId,
        knowledge_base_id: kbId,
        baseline_rd_id: baselineRdId,
        version: 1,
        status: "draft",
        items: [baseItem()],
        bmad_detected: false,
        generated_at: Date.now(),
      });
    });

    const report = await t.run(async (ctx) => ctx.db.get(reportId));
    expect(report).not.toBeNull();
    expect(report!.status).toBe("draft");
    expect(report!.version).toBe(1);
    expect(report!.items).toHaveLength(1);
    expect(report!.bmad_detected).toBe(false);
  });

  it("rejects a row with an invalid status value", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("drift_reports", {
          workspace_id: workspaceId,
          project_id: projectId,
          knowledge_base_id: kbId,
          baseline_rd_id: baselineRdId,
          version: 1,
          // @ts-expect-error testing invalid status
          status: "garbage",
          items: [],
          bmad_detected: false,
          generated_at: Date.now(),
        });
      }),
    ).rejects.toThrow();
  });

  it("rejects a row with an invalid dimension on an item", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("drift_reports", {
          workspace_id: workspaceId,
          project_id: projectId,
          knowledge_base_id: kbId,
          baseline_rd_id: baselineRdId,
          version: 1,
          status: "draft",
          items: [
            {
              // @ts-expect-error testing invalid dimension
              dimension: "not-a-real-dimension",
              category: "added",
              severity: "incremental",
              title: "x",
              description: "x",
            },
          ],
          bmad_detected: false,
          generated_at: Date.now(),
        });
      }),
    ).rejects.toThrow();
  });
});

describe("driftReportSchema zod validation", () => {
  it("passes for a valid report with items", () => {
    const result = driftReportSchema.safeParse({ items: [baseItem()] });
    expect(result.success).toBe(true);
  });

  it("passes for an empty items array (no drift detected is valid)", () => {
    const result = driftReportSchema.safeParse({ items: [] });
    expect(result.success).toBe(true);
  });

  it("fails when dimension is invalid", () => {
    const result = driftReportSchema.safeParse({
      items: [
        {
          ...baseItem(),
          // @ts-expect-error testing invalid dimension
          dimension: "bogus",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("fails when category is invalid", () => {
    const result = driftReportSchema.safeParse({
      items: [
        {
          ...baseItem(),
          // @ts-expect-error testing invalid category
          category: "bogus",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("fails when severity is invalid", () => {
    const result = driftReportSchema.safeParse({
      items: [
        {
          ...baseItem(),
          // @ts-expect-error testing invalid severity
          severity: "bogus",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all four dimensions", () => {
    const dimensions = [
      "old-rd-vs-code",
      "bmad-prd-vs-code",
      "bmad-conventions-vs-code",
      "adr-drift",
    ] as const;
    const result = driftReportSchema.safeParse({
      items: dimensions.map((d) => baseItem({ dimension: d })),
    });
    expect(result.success).toBe(true);
  });
});

describe("buildDriftReportPrompt", () => {
  const baseContext: DriftGenerationContext = {
    oldRdText: "# Old RD\nThe app should have login.",
    baselineRdSections: [
      { id: "overview", title: "Overview", content: "A monolith." },
      { id: "tech-stack", title: "Tech Stack", content: "Next.js, Convex." },
    ],
    architectureSummary: {
      architecture_summary: "A modular monolith.",
      architecture_type: "monolith",
      folder_structure: "src/",
      tech_stack: ["Next.js", "Convex"],
    },
    kbStats: { total_files: 10, total_size_bytes: 1024 },
  };

  it("contains Old RD text", () => {
    const prompt = buildDriftReportPrompt(baseContext);
    expect(prompt).toContain("Old RD");
    expect(prompt).toContain("login");
  });

  it("contains Baseline RD sections", () => {
    const prompt = buildDriftReportPrompt(baseContext);
    expect(prompt).toContain("Overview");
    expect(prompt).toContain("A monolith.");
    expect(prompt).toContain("Tech Stack");
  });

  it("requests only old-rd-vs-code dimension when no bmadContext", () => {
    const prompt = buildDriftReportPrompt(baseContext);
    expect(prompt).toContain("ONLY");
    expect(prompt).toContain("old-rd-vs-code");
    expect(prompt).not.toContain("ALL FOUR");
  });

  it("requests all four dimensions when bmadContext is provided", () => {
    const prompt = buildDriftReportPrompt({
      ...baseContext,
      bmadContext: {
        prdSections: "### Goals\nShip MVP",
        adrs: "- ADR-0001: Use Convex",
        conventions: "### Naming\nUse PascalCase",
      },
    });
    expect(prompt).toContain("ALL FOUR");
    expect(prompt).toContain("bmad-prd-vs-code");
    expect(prompt).toContain("bmad-conventions-vs-code");
    expect(prompt).toContain("adr-drift");
  });

  it("includes BMAD context (PRD, ADRs, conventions) when provided", () => {
    const prompt = buildDriftReportPrompt({
      ...baseContext,
      bmadContext: {
        prdSections: "### Goals\nShip MVP",
        adrs: "- ADR-0001: Use Convex",
        conventions: "### Naming\nUse PascalCase",
      },
    });
    expect(prompt).toContain("Ship MVP");
    expect(prompt).toContain("ADR-0001");
    expect(prompt).toContain("PascalCase");
  });

  it("omits BMAD context block when bmadContext is null", () => {
    const prompt = buildDriftReportPrompt(baseContext);
    expect(prompt).not.toContain("BMAD Context");
    expect(prompt).not.toContain("Ship MVP");
  });

  it("lists all known rd_section_id values", () => {
    const prompt = buildDriftReportPrompt(baseContext);
    for (const id of KNOWN_RD_SECTION_IDS) {
      expect(prompt).toContain(id);
    }
  });
});

describe("filterDriftDimensions", () => {
  const items: DriftItem[] = [
    baseItem({ dimension: "old-rd-vs-code", title: "a" }),
    baseItem({ dimension: "bmad-prd-vs-code", title: "b" }),
    baseItem({ dimension: "bmad-conventions-vs-code", title: "c" }),
    baseItem({ dimension: "adr-drift", title: "d" }),
  ];

  it("strips BMAD-dimension items when bmad is false", () => {
    const out = filterDriftDimensions(items, { bmad: false });
    expect(out).toHaveLength(1);
    expect(out[0].dimension).toBe("old-rd-vs-code");
  });

  it("preserves all dimensions when bmad is true", () => {
    const out = filterDriftDimensions(items, { bmad: true });
    expect(out).toHaveLength(4);
  });

  it("returns a new array (immutability)", () => {
    const out = filterDriftDimensions(items, { bmad: true });
    expect(out).not.toBe(items);
    expect(out[0]).not.toBe(items[0]);
    expect(items).toHaveLength(4);
  });

  it("handles empty array", () => {
    expect(filterDriftDimensions([], { bmad: false })).toEqual([]);
  });
});

describe("validateDriftItemSectionIds", () => {
  it("preserves valid section IDs", () => {
    const items = [
      baseItem({ rd_section_id: "overview" }),
      baseItem({ rd_section_id: "api-surface" }),
    ];
    const out = validateDriftItemSectionIds(items);
    expect(out[0].rd_section_id).toBe("overview");
    expect(out[1].rd_section_id).toBe("api-surface");
  });

  it("strips invalid section IDs to undefined", () => {
    const items = [
      baseItem({ rd_section_id: "bogus-section" }),
    ];
    const out = validateDriftItemSectionIds(items);
    expect(out[0].rd_section_id).toBeUndefined();
  });

  it("preserves undefined rd_section_id", () => {
    const items = [baseItem({ rd_section_id: undefined })];
    const out = validateDriftItemSectionIds(items);
    expect(out[0].rd_section_id).toBeUndefined();
  });

  it("returns a new array (immutability)", () => {
    const items = [baseItem({ rd_section_id: "overview" })];
    const out = validateDriftItemSectionIds(items);
    expect(out).not.toBe(items);
    expect(out[0]).not.toBe(items[0]);
    expect(items[0].rd_section_id).toBe("overview");
  });
});

describe("boundDriftContext", () => {
  const ctx: DriftGenerationContext = {
    oldRdText: "x".repeat(1000),
    baselineRdSections: [
      { id: "a", title: "A", content: "y".repeat(500) },
      { id: "b", title: "B", content: "z".repeat(500) },
    ],
    architectureSummary: {
      architecture_summary: "sum",
      architecture_type: "monolith",
      folder_structure: "src/",
      tech_stack: ["Next.js"],
    },
    kbStats: { total_files: 1, total_size_bytes: 1 },
  };

  it("truncates old RD text when exceeding oldRdMaxChars", () => {
    const out = boundDriftContext(ctx, { oldRdMaxChars: 100, totalMaxChars: 100000 });
    expect(out.oldRdText.length).toBeLessThan(ctx.oldRdText.length);
    expect(out.oldRdText).toContain("truncated");
  });

  it("bounds baseline sections when exceeding totalMaxChars", () => {
    const out = boundDriftContext(ctx, { oldRdMaxChars: 100000, totalMaxChars: 300 });
    expect(out.baselineRdSections.length).toBeLessThanOrEqual(ctx.baselineRdSections.length);
  });

  it("preserves content when under budget", () => {
    const out = boundDriftContext(ctx, { oldRdMaxChars: 100000, totalMaxChars: 100000 });
    expect(out.oldRdText).toBe(ctx.oldRdText);
    expect(out.baselineRdSections).toHaveLength(2);
  });

  it("returns a new object (immutability)", () => {
    const out = boundDriftContext(ctx, { oldRdMaxChars: 100000, totalMaxChars: 100000 });
    expect(out).not.toBe(ctx);
    expect(out.baselineRdSections).not.toBe(ctx.baselineRdSections);
  });
});

describe("internal mutations: _storeDriftReport", () => {
  it("inserts a draft report and returns the new _id with version", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const { internal } = await import("./_generated/api");
    const result = await t.mutation(
      internal.knowledge.internal._storeDriftReport,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        baseline_rd_id: baselineRdId,
        bmad_detected: false,
        items: [baseItem()],
      },
    );

    expect(result._id).toBeTruthy();
    expect(result.version).toBe(1);

    const report = await t.run(async (ctx) => ctx.db.get(result._id));
    expect(report!.status).toBe("draft");
    expect(report!.version).toBe(1);
    expect(report!.items).toHaveLength(1);
    expect(report!.generated_at).toBeGreaterThan(0);
  });

  it("computes version atomically — two stores produce versions 1 and 2", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const { internal } = await import("./_generated/api");
    const first = await t.mutation(
      internal.knowledge.internal._storeDriftReport,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        baseline_rd_id: baselineRdId,
        bmad_detected: false,
        items: [baseItem({ title: "v1" })],
      },
    );
    const second = await t.mutation(
      internal.knowledge.internal._storeDriftReport,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        baseline_rd_id: baselineRdId,
        bmad_detected: false,
        items: [baseItem({ title: "v2" })],
      },
    );

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });
});

describe("internal mutations: _archiveDriftReport", () => {
  it("archives all non-archived reports for a project and returns count", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const ids: string[] = [];
    for (const version of [1, 2, 3]) {
      const id = await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
        version,
        status: "draft",
      });
      ids.push(id);
    }

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveDriftReport,
      { project_id: projectId },
    );

    expect(count).toBe(3);
    for (const id of ids) {
      const report = await t.run(async (ctx) => ctx.db.get(id));
      expect(report!.status).toBe("archived");
    }
  });

  it("is idempotent on re-run (returns 0 the second time)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 1,
      status: "draft",
    });

    const { internal } = await import("./_generated/api");
    const first = await t.mutation(
      internal.knowledge.internal._archiveDriftReport,
      { project_id: projectId },
    );
    const second = await t.mutation(
      internal.knowledge.internal._archiveDriftReport,
      { project_id: projectId },
    );

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it("respects project scope — does not archive other projects' reports", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectIdA = await seedProject(t, workspaceId);
    const projectIdB = await seedProject(t, workspaceId);
    const kbIdA = await seedKnowledgeBase(t, workspaceId, projectIdA);
    const kbIdB = await seedKnowledgeBase(t, workspaceId, projectIdB);
    const rdIdA = await seedBaselineRd(t, workspaceId, projectIdA, kbIdA);
    const rdIdB = await seedBaselineRd(t, workspaceId, projectIdB, kbIdB);

    const idA = await seedDriftReport(t, workspaceId, projectIdA, kbIdA, rdIdA, {
      status: "draft",
    });
    const idB = await seedDriftReport(t, workspaceId, projectIdB, kbIdB, rdIdB, {
      status: "draft",
    });

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveDriftReport,
      { project_id: projectIdA },
    );

    expect(count).toBe(1);
    const reportA = await t.run(async (ctx) => ctx.db.get(idA));
    const reportB = await t.run(async (ctx) => ctx.db.get(idB));
    expect(reportA!.status).toBe("archived");
    expect(reportB!.status).toBe("draft");
  });

  it("returns 0 when no reports exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveDriftReport,
      { project_id: projectId },
    );
    expect(count).toBe(0);
  });

  it("archives more than 100 rows via paginated loop", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    for (let i = 0; i < 105; i++) {
      await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
        version: i + 1,
        status: "draft",
      });
    }

    const { internal } = await import("./_generated/api");
    const count = await t.mutation(
      internal.knowledge.internal._archiveDriftReport,
      { project_id: projectId },
    );
    expect(count).toBe(105);
  });
});

describe("internal queries: _getLatestDriftVersion", () => {
  it("returns 0 when no reports exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { internal } = await import("./_generated/api");
    const version = await t.query(
      internal.knowledge.internal._getLatestDriftVersion,
      { project_id: projectId },
    );
    expect(version).toBe(0);
  });

  it("returns the max version across draft and archived", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    for (const version of [1, 2, 5]) {
      await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
        version,
        status: version === 5 ? "draft" : "archived",
      });
    }

    const { internal } = await import("./_generated/api");
    const version = await t.query(
      internal.knowledge.internal._getLatestDriftVersion,
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
    const rdIdA = await seedBaselineRd(t, workspaceId, projectIdA, kbIdA);
    const rdIdB = await seedBaselineRd(t, workspaceId, projectIdB, kbIdB);

    await seedDriftReport(t, workspaceId, projectIdA, kbIdA, rdIdA, { version: 3 });
    await seedDriftReport(t, workspaceId, projectIdB, kbIdB, rdIdB, { version: 7 });

    const { internal } = await import("./_generated/api");
    const vA = await t.query(
      internal.knowledge.internal._getLatestDriftVersion,
      { project_id: projectIdA },
    );
    expect(vA).toBe(3);
  });
});

describe("internal mutations: _logDriftReportFailure", () => {
  it("inserts a failed report row with generation_error set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const { internal } = await import("./_generated/api");
    const result = await t.mutation(
      internal.knowledge.internal._logDriftReportFailure,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        baseline_rd_id: baselineRdId,
        bmad_detected: false,
        error_message: "AI provider timeout",
      },
    );

    expect(result._id).toBeTruthy();
    expect(result.version).toBe(1);

    const report = await t.run(async (ctx) => ctx.db.get(result._id));
    expect(report!.status).toBe("failed");
    expect(report!.version).toBe(1);
    expect(report!.items).toEqual([]);
    expect(report!.generation_error).toBe("AI provider timeout");
  });

  it("truncates error_message to the max length", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const { DRIFT_ERROR_MESSAGE_MAX_LENGTH } = await import("./lib/constraints");
    const huge = "E".repeat(DRIFT_ERROR_MESSAGE_MAX_LENGTH + 500);

    const { internal } = await import("./_generated/api");
    const result = await t.mutation(
      internal.knowledge.internal._logDriftReportFailure,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        baseline_rd_id: baselineRdId,
        bmad_detected: false,
        error_message: huge,
      },
    );

    const report = await t.run(async (ctx) => ctx.db.get(result._id));
    expect(report!.generation_error!.length).toBe(DRIFT_ERROR_MESSAGE_MAX_LENGTH);
  });
});

describe("getDriftReport public query", () => {
  it("returns null when no report exists", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("returns the highest-version draft report", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 1,
      status: "archived",
    });
    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 3,
      status: "draft",
      items: [baseItem({ title: "v3 drift" })],
    });
    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 2,
      status: "archived",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });

    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
    expect(result!.status).toBe("draft");
    expect(result!.items[0].title).toBe("v3 drift");
  });

  it("returns baseline_rd_version when set on the report", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 1,
      baseline_rd_version: 5,
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });

    expect(result).not.toBeNull();
    expect(result!.baseline_rd_version).toBe(5);
  });

  it("returns baseline_rd_version undefined when not set (legacy reports)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });

    expect(result).not.toBeNull();
    expect(result!.baseline_rd_version).toBeUndefined();
  });

  it("returns null when all reports are archived", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      status: "archived",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("returns the failed report (highest version) so frontend can show error state", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 1,
      status: "draft",
    });
    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 2,
      status: "failed",
      generation_error: "timeout",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.status).toBe("failed");
    expect(result!.generation_error).toBe("timeout");
  });

  it("respects workspace ownership — cross-workspace returns null", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    await seedWorkspace(t);
    const otherWorkspaceId = await seedWorkspace(t, "user2");
    const projectId = await seedProject(t, otherWorkspaceId);
    const kbId = await seedKnowledgeBase(t, otherWorkspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, otherWorkspaceId, projectId, kbId);

    await seedDriftReport(t, otherWorkspaceId, projectId, kbId, baselineRdId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });
    expect(result).toBeNull();
  });

  it("whitelists returned fields — does not leak workspace_id (generation_error is intentional)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      status: "draft",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getDriftReport, {
      project_id: projectId as never,
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("workspace_id");
  });
});

describe("buildDriftReportErrorMessage", () => {
  it("returns auth message for 401", async () => {
    const { buildDriftReportErrorMessage } = await import(
      "./knowledge/driftActions"
    );
    const msg = buildDriftReportErrorMessage({ statusCode: 401, message: "bad key" });
    expect(msg).toContain("authentication");
  });

  it("returns model not available for 404", async () => {
    const { buildDriftReportErrorMessage } = await import(
      "./knowledge/driftActions"
    );
    const msg = buildDriftReportErrorMessage({ statusCode: 404, message: "not found" });
    expect(msg).toContain("model not available");
  });

  it("includes underlying message for generic errors", async () => {
    const { buildDriftReportErrorMessage } = await import(
      "./knowledge/driftActions"
    );
    const msg = buildDriftReportErrorMessage(new Error("rate limited"));
    expect(msg).toContain("rate limited");
  });
});

describe("generateDriftReport action (AI mocked)", () => {
  beforeEach(async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockReset();
  });

  it("queries KB, builds prompt, filters dimensions, validates section IDs, and stores report", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    generateObjectMock.mockResolvedValue({
      object: {
        items: [
          baseItem({ dimension: "old-rd-vs-code", title: "added login" }),
          baseItem({ dimension: "old-rd-vs-code", title: "removed logout" }),
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
      architecture_type: "monolith",
      folder_structure: "src/",
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nThe app has a login page.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    expect(result.driftReportId).toBeTruthy();
    expect(result.version).toBe(1);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);

    const stored = await t.run(async (ctx) => {
      const report = await ctx.db
        .query("drift_reports")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", projectId as never),
        )
        .first();
      return report;
    });
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("draft");
    expect(stored!.items).toHaveLength(2);
  });

  it("early-returns no_old_rd when project has no Old RD text", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({ object: { items: [] } } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    expect(result.driftReportId).toBeNull();
    expect(result.reason).toBe("no_old_rd");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("early-returns no_baseline_rd when baseline RD is missing", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({ object: { items: [] } } as never);

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
        old_rd_extracted_text: "# Old RD\nLogin required.",
      });
    });

    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId, {
      status: "archived",
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    expect(result.driftReportId).toBeNull();
    expect(result.reason).toBe("no_baseline_rd");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("throws ConvexError with auth message when AI returns 401", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockRejectedValue({
      statusCode: 401,
      message: "bad key",
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    await expect(
      t.action(internal.knowledge.driftActions.generateDriftReport, {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      }),
    ).rejects.toThrow("authentication");
  });

  it("non-BMAD path: strips BMAD-dimension items the model may emit", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    generateObjectMock.mockResolvedValue({
      object: {
        items: [
          baseItem({ dimension: "old-rd-vs-code", title: "real" }),
          baseItem({ dimension: "bmad-prd-vs-code", title: "spurious" }),
          baseItem({ dimension: "adr-drift", title: "spurious adr" }),
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
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.driftReportId as never));
    expect(stored!.items).toHaveLength(1);
    expect(stored!.items[0].dimension).toBe("old-rd-vs-code");
    expect(stored!.bmad_detected).toBe(false);
  });

  it("BMAD path: preserves all dimensions when bmad_detected is true", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    generateObjectMock.mockResolvedValue({
      object: {
        items: [
          baseItem({ dimension: "old-rd-vs-code", title: "a" }),
          baseItem({ dimension: "bmad-prd-vs-code", title: "b" }),
          baseItem({ dimension: "bmad-conventions-vs-code", title: "c" }),
          baseItem({ dimension: "adr-drift", title: "d" }),
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
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await seedBmadMetadata(t, workspaceId, kbId, [
      {
        type: "prd_section",
        key: "Goals",
        content: "Ship MVP",
        source_path: "prd.md",
      },
      {
        type: "adr",
        key: "ADR-0001",
        content: "Use Convex",
        source_path: "adr.md",
        metadata: { title: "Backend", status: "Accepted" },
      },
      {
        type: "convention",
        key: "Naming",
        content: "PascalCase",
        source_path: "conv.md",
      },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.driftReportId as never));
    expect(stored!.items).toHaveLength(4);
    expect(stored!.bmad_detected).toBe(true);

    const prompt = (generateObjectMock.mock.calls[0][0] as { prompt?: string })?.prompt;
    expect(prompt).toContain("ALL FOUR");
  });

  it("strips invalid rd_section_id values in post-processing", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    generateObjectMock.mockResolvedValue({
      object: {
        items: [
          baseItem({ rd_section_id: "overview" }),
          baseItem({ rd_section_id: "bogus-id", title: "invalid ref" }),
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
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.driftReportId as never));
    const invalidRef = stored!.items.find((i) => i.title === "invalid ref");
    expect(invalidRef!.rd_section_id).toBeUndefined();
    const validRef = stored!.items.find((i) => i.title === "Sample drift");
    expect(validRef!.rd_section_id).toBe("overview");
  });

  it("caps items array to MAX_DRIFT_ITEMS", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    const { MAX_DRIFT_ITEMS } = await import("./lib/constraints");
    const manyItems: DriftItem[] = Array.from({ length: MAX_DRIFT_ITEMS + 50 }, (_, i) =>
      baseItem({ title: `item-${i}` }),
    );
    generateObjectMock.mockResolvedValue({
      object: { items: manyItems },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.driftReportId as never));
    expect(stored!.items).toHaveLength(MAX_DRIFT_ITEMS);
  });

  it("BMAD detected but empty metadata → treats as non-BMAD (no hallucinated dimensions)", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);

    generateObjectMock.mockResolvedValue({
      object: {
        items: [
          baseItem({ dimension: "old-rd-vs-code", title: "real" }),
          baseItem({ dimension: "bmad-prd-vs-code", title: "spurious" }),
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
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReport,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    const stored = await t.run(async (ctx) => ctx.db.get(result.driftReportId as never));
    expect(stored!.bmad_detected).toBe(false);
    expect(stored!.items.every((i) => i.dimension === "old-rd-vs-code")).toBe(true);

    const prompt = (generateObjectMock.mock.calls[0][0] as { prompt?: string })?.prompt;
    expect(prompt).toContain("ONLY");
    expect(prompt).not.toContain("ALL FOUR");
  });
});

describe("generateDriftReportWithLogging wrapper", () => {
  beforeEach(async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockReset();
  });

  it("returns success result when underlying action succeeds", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: { items: [baseItem()] },
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReportWithLogging,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    expect(result.driftReportId).toBeTruthy();
    expect(result.version).toBe(1);
    expect(result).not.toHaveProperty("error");
  });

  it("catches errors and logs via _logDriftReportFailure (does not throw)", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockRejectedValue({
      statusCode: 401,
      message: "bad key",
    } as never);

    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    const result = await t.action(
      internal.knowledge.driftActions.generateDriftReportWithLogging,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    expect(result.driftReportId).toBeNull();
    expect(result.error).toBeTruthy();

    const reports = await t.run(async (ctx) => {
      return ctx.db
        .query("drift_reports")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", projectId as never),
        )
        .collect();
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe("failed");
    expect(reports[0].generation_error).toBeTruthy();
    expect(reports[0].items).toEqual([]);
  });

  it("preserves bmad_detected from KB in the failure record", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockRejectedValue({
      statusCode: 401,
      message: "bad key",
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
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { internal } = await import("./_generated/api");
    await t.action(
      internal.knowledge.driftActions.generateDriftReportWithLogging,
      {
        project_id: projectId as never,
        knowledge_base_id: kbId as never,
        workspace_id: workspaceId as never,
        baseline_rd_id: baselineRdId as never,
      },
    );

    const reports = await t.run(async (ctx) => {
      return ctx.db
        .query("drift_reports")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", projectId as never),
        )
        .collect();
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].bmad_detected).toBe(true);
  });
});

describe("triggerDriftReport manual action", () => {
  beforeEach(async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockReset();
  });

  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerDriftReport, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow();
  });

  it("requires KB to be 'ready'", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "building" });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { kb_status: "building" });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerDriftReport, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("'ready'");
  });

  it("requires an Old RD", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { kb_status: "ready" });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerDriftReport, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("Old RD");
  });

  it("requires a Baseline RD", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        kb_status: "ready",
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerDriftReport, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("Baseline RD");
  });

  it("rejects cross-workspace access (IDOR guard)", async () => {
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
      await ctx.db.patch(projectId, {
        kb_status: "ready",
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.triggerDriftReport, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("not found");
  });

  it("archives previous report then generates version N+1", async () => {
    const ai = await import("ai");
    const generateObjectMock = vi.mocked(ai.generateObject);
    generateObjectMock.mockResolvedValue({
      object: { items: [baseItem({ title: "fresh" })] },
    } as never);

    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        kb_status: "ready",
        old_rd_extracted_text: "# Old RD\nLogin.",
      });
    });

    await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 1,
      status: "draft",
    });

    const { api } = await import("./_generated/api");
    const result = await t.action(
      api.knowledge.triggerIngestion.triggerDriftReport,
      { project_id: projectId as never },
    );

    expect(result.version).toBe(2);
    expect(result.driftReportId).toBeTruthy();

    const reports = await t.run(async (ctx) => {
      return ctx.db
        .query("drift_reports")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", projectId as never),
        )
        .collect();
    });
    expect(reports).toHaveLength(2);
    const archived = reports.find((r) => r.version === 1);
    const fresh = reports.find((r) => r.version === 2);
    expect(archived!.status).toBe("archived");
    expect(fresh!.status).toBe("draft");
    expect(fresh!._id).toBe(result.driftReportId);
  });
});

describe("resync archival: resyncKnowledgeBase archives previous drift report", () => {
  it("resyncKnowledgeBase calls _archiveDriftReport before re-ingestion", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        repo_url: "https://github.com/test/repo",
        encrypted_pat: "encrypted_pat",
        kb_status: "ready",
      });
    });

    const draftReportId = await seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, {
      version: 1,
      status: "draft",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.resyncKnowledgeBase, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow();

    const report = await t.run(async (ctx) => ctx.db.get(draftReportId));
    expect(report!.status).toBe("archived");
  });
});

describe("ingestion workflow auto-trigger", () => {
  it("generateDriftReportWithLogging is registered as an internal action", async () => {
    const mod = await import("./knowledge/driftActions");
    expect(mod.generateDriftReportWithLogging).toBeDefined();
  });

  it("ingestionWorkflow source calls generateDriftReportWithLogging conditionally on baselineRdId", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const workflowPath = path.resolve(
      process.cwd(),
      "convex/knowledge/ingestionWorkflow.ts",
    );
    const source = fs.readFileSync(workflowPath, "utf-8");
    expect(source).toContain(
      "internal.knowledge.driftActions.generateDriftReportWithLogging",
    );
    expect(source).toContain("baselineResult.baselineRdId");
  });

  it("resyncKnowledgeBase source calls _archiveDriftReport after _archiveBaselineRd", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const triggerPath = path.resolve(
      process.cwd(),
      "convex/knowledge/triggerIngestion.ts",
    );
    const source = fs.readFileSync(triggerPath, "utf-8");
    const baselineIdx = source.indexOf("_archiveBaselineRd");
    const driftIdx = source.indexOf("_archiveDriftReport");
    expect(baselineIdx).toBeGreaterThan(-1);
    expect(driftIdx).toBeGreaterThan(-1);
    expect(driftIdx).toBeGreaterThan(baselineIdx);
  });
});

describe("_getBmadMetadataForDrift", () => {
  it("returns detected:false when KB has no bmad_detected", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const result = await t.query(
      internal.knowledge.internal._getBmadMetadataForDrift,
      { knowledge_base_id: kbId },
    );

    expect(result.detected).toBe(false);
    expect(result.prdSections).toBe("");
    expect(result.adrs).toBe("");
    expect(result.conventions).toBe("");
  });

  it("returns prdSections, adrs, and conventions when bmad_detected", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      bmad_detected: true,
    });

    await seedBmadMetadata(t, workspaceId, kbId, [
      { type: "prd_section", key: "Goals", content: "Ship MVP", source_path: "prd.md" },
      { type: "adr", key: "ADR-0001", content: "Use Convex", source_path: "adr.md", metadata: { title: "Backend", status: "Accepted" } },
      { type: "convention", key: "Naming", content: "PascalCase", source_path: "conv.md" },
    ]);

    const { internal } = await import("./_generated/api");
    const result = await t.query(
      internal.knowledge.internal._getBmadMetadataForDrift,
      { knowledge_base_id: kbId },
    );

    expect(result.detected).toBe(true);
    expect(result.prdSections).toContain("Goals");
    expect(result.adrs).toContain("ADR-0001");
    expect(result.conventions).toContain("PascalCase");
  });
});

describe("_getKbForDriftReport", () => {
  it("returns baseline_rd null when the RD is archived", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId, {
      status: "archived",
    });

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForDriftReport,
      { knowledge_base_id: kbId, baseline_rd_id: baselineRdId },
    );

    expect(kb).not.toBeNull();
    expect(kb!.baseline_rd).toBeNull();
  });

  it("returns baseline_rd sections when RD is a valid draft", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdId = await seedBaselineRd(t, workspaceId, projectId, kbId, {
      status: "draft",
    });

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForDriftReport,
      { knowledge_base_id: kbId, baseline_rd_id: baselineRdId },
    );

    expect(kb).not.toBeNull();
    expect(kb!.baseline_rd).not.toBeNull();
    expect(kb!.baseline_rd!.sections.length).toBeGreaterThan(0);
  });

  it("returns baseline_rd null when RD belongs to a different project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectIdA = await seedProject(t, workspaceId);
    const projectIdB = await seedProject(t, workspaceId);
    const kbIdA = await seedKnowledgeBase(t, workspaceId, projectIdA, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const kbIdB = await seedKnowledgeBase(t, workspaceId, projectIdB, {
      status: "ready",
      architecture_summary: "Monolith",
      tech_stack: ["Next.js"],
    });
    const baselineRdIdB = await seedBaselineRd(t, workspaceId, projectIdB, kbIdB);

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForDriftReport,
      { knowledge_base_id: kbIdA, baseline_rd_id: baselineRdIdB },
    );

    expect(kb).not.toBeNull();
    expect(kb!.baseline_rd).toBeNull();
  });
});
