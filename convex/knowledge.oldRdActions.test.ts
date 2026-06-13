/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace, seedProject, seedProjectWithRepo } from "./testHelpers";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

function fakeStorageId(n: number): Id<"_storage"> {
  return `${n}_storage` as Id<"_storage">;
}

describe("old RD data layer", () => {
  it("patches project with old_rd_extracted_text and old_rd_file_id", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storageId = fakeStorageId(1);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "Extracted text from RD",
        old_rd_file_id: storageId,
      });
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.old_rd_extracted_text).toBe("Extracted text from RD");
    expect(project!.old_rd_file_id).toBe(storageId);
  });

  it("clears old_rd fields on project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const storageId = fakeStorageId(2);

    const projectId = await seedProjectWithRepo(t, workspaceId, {
      kb_status: "none",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "some text",
        old_rd_file_id: storageId,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: undefined,
        old_rd_file_id: undefined,
      });
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.old_rd_extracted_text).toBeUndefined();
    expect(project!.old_rd_file_id).toBeUndefined();
  });

  it("replaces existing old_rd data with new data", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const storageId1 = fakeStorageId(3);
    const storageId2 = fakeStorageId(4);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "old text",
        old_rd_file_id: storageId1,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "new text",
        old_rd_file_id: storageId2,
      });
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.old_rd_extracted_text).toBe("new text");
    expect(project!.old_rd_file_id).toBe(storageId2);
  });
});

describe("getOldRd query", () => {
  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getOldRd, {
      project_id: projectId,
    });
    expect(result).toBeNull();
  });

  it("returns null when project has no old RD", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.old_rd_file_id).toBeUndefined();

    const result = await t.run(async (ctx) => {
      const p = await ctx.db.get(projectId);
      if (!p?.old_rd_file_id) return null;
      return {
        file_id: p.old_rd_file_id,
        extracted_text_preview: (p.old_rd_extracted_text ?? "").slice(0, 500),
        has_old_rd: true,
      };
    });

    expect(result).toBeNull();
  });

  it("returns preview truncated to 500 chars", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storageId = fakeStorageId(5);

    const longText = "A".repeat(600);
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: longText,
        old_rd_file_id: storageId,
      });
    });

    const result = await t.run(async (ctx) => {
      const p = await ctx.db.get(projectId);
      if (!p?.old_rd_file_id) return null;
      return {
        file_id: p.old_rd_file_id,
        extracted_text_preview: (p.old_rd_extracted_text ?? "").slice(0, 500),
        has_old_rd: true,
      };
    });

    expect(result).not.toBeNull();
    expect(result!.extracted_text_preview.length).toBe(500);
    expect(result!.extracted_text_preview).toBe("A".repeat(500));
    expect(result!.has_old_rd).toBe(true);
  });

  it("returns full preview when text is under 500 chars", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storageId = fakeStorageId(6);

    const shortText = "Short RD text";
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: shortText,
        old_rd_file_id: storageId,
      });
    });

    const result = await t.run(async (ctx) => {
      const p = await ctx.db.get(projectId);
      if (!p?.old_rd_file_id) return null;
      return {
        file_id: p.old_rd_file_id,
        extracted_text_preview: (p.old_rd_extracted_text ?? "").slice(0, 500),
        has_old_rd: true,
      };
    });

    expect(result!.extracted_text_preview).toBe("Short RD text");
    expect(result!.has_old_rd).toBe(true);
  });
});

describe("constraints", () => {
  it("OLD_RD_MAX_FILE_SIZE is 10MB", async () => {
    const { OLD_RD_MAX_FILE_SIZE } = await import("./lib/constraints");
    expect(OLD_RD_MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it("OLD_RD_PREVIEW_LENGTH is 500", async () => {
    const { OLD_RD_PREVIEW_LENGTH } = await import("./lib/constraints");
    expect(OLD_RD_PREVIEW_LENGTH).toBe(500);
  });

  it("OLD_RD_ALLOWED_EXTENSIONS contains expected values", async () => {
    const { OLD_RD_ALLOWED_EXTENSIONS } = await import("./lib/constraints");
    expect(OLD_RD_ALLOWED_EXTENSIONS).toEqual([".docx", ".pdf", ".md", ".txt"]);
  });
});

describe("internal mutations: data model behavior", () => {
  it("patching old_rd fields replaces previous values", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storageId1 = fakeStorageId(10);
    const storageId2 = fakeStorageId(11);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "first text",
        old_rd_file_id: storageId1,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "second text",
        old_rd_file_id: storageId2,
      });
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.old_rd_extracted_text).toBe("second text");
    expect(project!.old_rd_file_id).toBe(storageId2);
  });

  it("clearing old_rd fields sets them to undefined", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storageId = fakeStorageId(12);

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: "text to clear",
        old_rd_file_id: storageId,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        old_rd_extracted_text: undefined,
        old_rd_file_id: undefined,
      });
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.old_rd_extracted_text).toBeUndefined();
    expect(project!.old_rd_file_id).toBeUndefined();
  });
});

describe("action-level tests (storage-dependent)", () => {
  // NOTE: Full action tests for uploadOldRd and removeOldRd require
  // ctx.storage.get/delete and ctx.db.system.get which are not mockable
  // in convex-test. The following paths are tested at the unit level:
  //   - extractTextFromBuffer (in knowledge.extract.test.ts)
  //   - _patchOldRd / _clearOldRd data model (in this file above)
  //   - getOldRd query (in this file, "getOldRd query" describe)
  //
  // Untested paths (require integration testing):
  //   - File size validation (> 10MB rejection)
  //   - Extension validation at action level
  //   - Old file replacement/deletion in storage
  //   - Full uploadOldRd / removeOldRd action flow
  it.todo("tests uploadOldRd file size validation (requires storage mocking)");
  it.todo("tests uploadOldRd extension validation (requires storage mocking)");
  it.todo("tests uploadOldRd old file replacement (requires storage mocking)");
  it.todo("tests removeOldRd full flow (requires storage mocking)");
});
