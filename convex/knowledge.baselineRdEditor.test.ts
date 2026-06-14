/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
  seedBaselineRd,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

const DEFAULT_SECTIONS = [
  { id: "overview", title: "Overview", content: "Original overview.", confidence: 0.75 },
  { id: "tech-stack", title: "Tech Stack", content: "Next.js, Convex", confidence: 0.85 },
  {
    id: "tech-stack-divergent",
    title: "Tech Stack",
    content: "Next.js",
    confidence: 0.4,
    divergence_note: "PRD mentions Vue.",
    bmad_alignment: { prd_section_title: "Tech Stack", agreement: "diverge" },
  },
] as const;

async function seedRdForEditor(
  t: ReturnType<typeof convexTest>,
  ownerId = "user1",
  status: "draft" | "approved" | "archived" | "failed" = "draft",
) {
  const workspaceId = await seedWorkspace(t, ownerId);
  const projectId = await seedProject(t, workspaceId);
  const kbId = await seedKnowledgeBase(t, workspaceId, projectId, { status: "ready" });

  const rdId = await seedBaselineRd(t, workspaceId, projectId, kbId, {
    status,
    sections: [...DEFAULT_SECTIONS],
  });

  return { workspaceId, projectId, kbId, rdId };
}

describe("updateBaselineRd mutation — auth & ownership", () => {
  it("throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const { rdId } = await seedRdForEditor(t);

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        section_updates: [{ id: "overview", content: "edited" }],
      }),
    ).rejects.toThrow(/authenticated/i);
  });

  it("throws when caller has no workspace membership", async () => {
    const t = convexTest(schema, modules);
    const { rdId } = await seedRdForEditor(t, "user1");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        section_updates: [{ id: "overview", content: "edited" }],
      }),
    ).rejects.toThrow(/workspace not found|not authenticated/i);
  });

  it("throws on cross-workspace RD (IDOR guard)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    await seedWorkspace(t, "user1");
    const other = await seedRdForEditor(t, "user2");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: other.rdId as never,
        section_updates: [{ id: "overview", content: "edited" }],
      }),
    ).rejects.toThrow(/not found or access denied/i);
  });
});

describe("updateBaselineRd mutation — section_updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patches only content and preserves title/confidence/divergence_note/bmad_alignment", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId, workspaceId, projectId, kbId } = await seedRdForEditor(t);

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [{ id: "overview", content: "Edited by human." }],
    });

    const rd = await t.run(async (ctx) => {
      return ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId as never))
        .first();
    });
    expect(rd).not.toBeNull();
    const overview = rd!.sections.find((s) => s.id === "overview")!;
    expect(overview.content).toBe("Edited by human.");
    expect(overview.title).toBe("Overview");
    expect(overview.confidence).toBe(0.75);

    const divergent = rd!.sections.find((s) => s.id === "tech-stack-divergent")!;
    expect(divergent.title).toBe("Tech Stack");
    expect(divergent.confidence).toBe(0.4);
    expect(divergent.divergence_note).toBe("PRD mentions Vue.");
    expect(divergent.bmad_alignment?.agreement).toBe("diverge");
    expect(workspaceId).toBeTruthy();
    expect(kbId).toBeTruthy();
  });

  it("sets updated_at on successful content patch", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId, projectId } = await seedRdForEditor(t);

    const beforeRd = await t.run(async (ctx) => {
      return ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId as never))
        .first();
    });
    expect(beforeRd!.updated_at).toBeUndefined();

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [{ id: "overview", content: "x" }],
    });

    const afterRd = await t.run(async (ctx) => {
      return ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId as never))
        .first();
    });
    expect(afterRd!.updated_at).toEqual(expect.any(Number));
    expect(afterRd!.updated_at!).toBeGreaterThan(0);
  });

  it("does not change status when only content is updated", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "draft");

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [{ id: "overview", content: "edited" }],
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(rd!.status).toBe("draft");
  });

  it("applies multiple section updates in one call", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t);

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [
        { id: "overview", content: "v2 overview" },
        { id: "tech-stack", content: "v2 stack" },
        { id: "tech-stack-divergent", content: "v2 divergent" },
      ],
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(rd!.sections.find((s) => s.id === "overview")!.content).toBe("v2 overview");
    expect(rd!.sections.find((s) => s.id === "tech-stack")!.content).toBe("v2 stack");
    expect(rd!.sections.find((s) => s.id === "tech-stack-divergent")!.content).toBe("v2 divergent");
  });

  it("throws ConvexError for unknown section id", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t);

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        section_updates: [{ id: "nonexistent", content: "x" }],
      }),
    ).rejects.toThrow(/Unknown section id: nonexistent/);
  });

  it("empty section_updates array is a no-op (does not set updated_at)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t);

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [],
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(rd!.updated_at).toBeUndefined();
  });

  it("does not mutate the original sections array reference (immutability)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t);

    const before = await t.run(async (ctx) => ctx.db.get(rdId as never));
    const beforeSections = before!.sections;
    const beforeOverviewContent = beforeSections.find((s) => s.id === "overview")!.content;

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [{ id: "overview", content: "completely new content" }],
    });

    expect(beforeSections.find((s) => s.id === "overview")!.content).toBe(beforeOverviewContent);

    const after = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(after!.sections.find((s) => s.id === "overview")!.content).toBe("completely new content");
    expect(after!.sections).not.toBe(beforeSections);
  });
});

describe("updateBaselineRd mutation — status transitions", () => {
  it("transitions draft → approved", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "draft");

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      status: "approved",
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(rd!.status).toBe("approved");
  });

  it("transitions approved → draft", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "approved");

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      status: "draft",
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(rd!.status).toBe("draft");
  });

  it("throws when approving an already-approved RD", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "approved");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        status: "approved",
      }),
    ).rejects.toThrow(/Only a draft Baseline RD can be approved/);
  });

  it("throws when reverting a draft RD to draft", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "draft");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        status: "draft",
      }),
    ).rejects.toThrow(/Only an approved Baseline RD can be reverted to draft/);
  });

  it("throws when approving an archived RD (archived is read-only)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "archived");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        status: "approved",
      }),
    ).rejects.toThrow(/Cannot edit an archived or failed Baseline RD/);
  });
});

describe("updateBaselineRd mutation — archived/failed guards", () => {
  it("throws when editing content on an archived RD", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "archived");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: rdId as never,
        section_updates: [{ id: "overview", content: "x" }],
      }),
    ).rejects.toThrow(/Cannot edit an archived or failed Baseline RD/);
  });

  it("throws when editing content on a failed RD", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const other = await seedRdForEditor(t, "user1", "failed");

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
        rd_id: other.rdId as never,
        section_updates: [{ id: "overview", content: "x" }],
      }),
    ).rejects.toThrow(/Cannot edit an archived or failed Baseline RD/);
  });
});

describe("updateBaselineRd mutation — combined section_updates + status", () => {
  it("applies both content patch and status transition in one call", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const { rdId } = await seedRdForEditor(t, "user1", "draft");

    const { api } = await import("./_generated/api");
    await t.mutation(api.knowledge.baselineRdMutations.updateBaselineRd, {
      rd_id: rdId as never,
      section_updates: [{ id: "overview", content: "final edit before approve" }],
      status: "approved",
    });

    const rd = await t.run(async (ctx) => ctx.db.get(rdId as never));
    expect(rd!.status).toBe("approved");
    expect(rd!.sections.find((s) => s.id === "overview")!.content).toBe("final edit before approve");
    expect(rd!.updated_at).toEqual(expect.any(Number));
  });
});
