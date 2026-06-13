/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace, seedProject, seedProjectWithRepo } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("knowledge mutations", () => {
  describe("validation: validateRepoUrl", () => {
    it("accepts valid GitHub URL", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(validateRepoUrl("https://github.com/owner/repo")).toBe("https://github.com/owner/repo");
    });

    it("normalizes URL with extra path segments", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(validateRepoUrl("https://github.com/owner/repo/tree/main")).toBe("https://github.com/owner/repo");
    });

    it("trims whitespace", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(validateRepoUrl("  https://github.com/owner/repo  ")).toBe("https://github.com/owner/repo");
    });

    it("rejects empty URL", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(() => validateRepoUrl("")).toThrow("Repository URL is required");
    });

    it("rejects non-GitHub URL", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(() => validateRepoUrl("https://gitlab.com/owner/repo")).toThrow("Only GitHub repositories are supported");
    });

    it("rejects GitHub URL without owner/repo", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(() => validateRepoUrl("https://github.com/")).toThrow();
      expect(() => validateRepoUrl("https://github.com/owner")).toThrow();
    });

    it("rejects URL exceeding max length", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      const longUrl = `https://github.com/${"a".repeat(500)}/repo`;
      expect(() => validateRepoUrl(longUrl)).toThrow();
    });

    it("rejects invalid URL", async () => {
      const { validateRepoUrl } = await import("./lib/validation");
      expect(() => validateRepoUrl("not-a-url")).toThrow("Invalid repository URL");
    });
  });

  describe("validation: validatePatLength", () => {
    it("accepts valid PAT length", async () => {
      const { validatePatLength } = await import("./lib/validation");
      expect(() => validatePatLength("ghp_12345678")).not.toThrow();
    });

    it("rejects PAT too short", async () => {
      const { validatePatLength } = await import("./lib/validation");
      expect(() => validatePatLength("short")).toThrow("at least 8");
    });

    it("rejects PAT too long", async () => {
      const { validatePatLength } = await import("./lib/validation");
      expect(() => validatePatLength("a".repeat(201))).toThrow("at most 200");
    });
  });

  describe("validation: maskPat", () => {
    it("masks PAT following maskApiKey pattern", async () => {
      const { maskPat } = await import("./lib/validation");
      expect(maskPat("ghp_abcdef12345678")).toBe("ghp••••••••5678");
    });

    it("returns dots for short PAT", async () => {
      const { maskPat } = await import("./lib/validation");
      expect(maskPat("abc")).toBe("••••••••");
    });
  });

  describe("data layer: patch project repo", () => {
    it("patches project with repo data and sets kb_status", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.patch(projectId, {
          repo_url: "https://github.com/owner/repo",
          encrypted_pat: "enc:value",
          kb_status: "none",
        });
      });

      const project = await t.run(async (ctx) => ctx.db.get(projectId));
      expect(project!.repo_url).toBe("https://github.com/owner/repo");
      expect(project!.encrypted_pat).toBe("enc:value");
      expect(project!.kb_status).toBe("none");
    });

    it("overwrites existing repo data on duplicate update", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProjectWithRepo(t, workspaceId, {
        repo_url: "https://github.com/old/repo",
        encrypted_pat: "old:enc",
        kb_status: "ready",
      });

      await t.run(async (ctx) => {
        await ctx.db.patch(projectId, {
          repo_url: "https://github.com/new/repo",
          encrypted_pat: "new:enc",
          kb_status: "none",
        });
      });

      const project = await t.run(async (ctx) => ctx.db.get(projectId));
      expect(project!.repo_url).toBe("https://github.com/new/repo");
      expect(project!.encrypted_pat).toBe("new:enc");
      expect(project!.kb_status).toBe("none");
    });
  });

  describe("data layer: clear project repo", () => {
    it("clears repo_url, encrypted_pat and sets kb_status to none", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProjectWithRepo(t, workspaceId, {
        repo_url: "https://github.com/owner/repo",
        encrypted_pat: "enc:value",
        kb_status: "ready",
      });

      await t.run(async (ctx) => {
        await ctx.db.patch(projectId, {
          repo_url: undefined,
          encrypted_pat: undefined,
          kb_status: "none",
        });
      });

      const project = await t.run(async (ctx) => ctx.db.get(projectId));
      expect(project!.repo_url).toBeUndefined();
      expect(project!.encrypted_pat).toBeUndefined();
      expect(project!.kb_status).toBe("none");
    });
  });

  describe("data layer: knowledge_bases table", () => {
    it("can insert and query knowledge bases", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const kbId = await t.run(async (ctx) => {
        return ctx.db.insert("knowledge_bases", {
          workspace_id: workspaceId,
          project_id: projectId,
          status: "building",
        });
      });

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb!.status).toBe("building");
      expect(kb!.workspace_id).toBe(workspaceId);
      expect(kb!.project_id).toBe(projectId);
    });

    it("can query knowledge bases by project_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.insert("knowledge_bases", {
          workspace_id: workspaceId,
          project_id: projectId,
          status: "ready",
          tech_stack: ["react", "typescript"],
          total_files: 42,
        });
      });

      const kbs = await t.run(async (ctx) => {
        return ctx.db
          .query("knowledge_bases")
          .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
          .collect();
      });

      expect(kbs).toHaveLength(1);
      expect(kbs[0].tech_stack).toEqual(["react", "typescript"]);
      expect(kbs[0].total_files).toBe(42);
    });
  });

  describe("data layer: kb_modules table", () => {
    it("can insert and query KB modules", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const kbId = await t.run(async (ctx) => {
        return ctx.db.insert("knowledge_bases", {
          workspace_id: workspaceId,
          project_id: projectId,
          status: "ready",
        });
      });

      const modId = await t.run(async (ctx) => {
        return ctx.db.insert("kb_modules", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          name: "auth",
          description: "Authentication module",
          file_count: 5,
          files: ["auth.ts", "login.ts"],
          apis: { endpoints: ["/login", "/logout"] },
          data_models: { User: { fields: ["id", "email"] } },
          user_flows: [{ name: "login", steps: 3 }],
          dependencies: ["database"],
        });
      });

      const mod = await t.run(async (ctx) => ctx.db.get(modId));
      expect(mod!.name).toBe("auth");
      expect(mod!.files).toEqual(["auth.ts", "login.ts"]);
      expect(mod!.apis).toEqual({ endpoints: ["/login", "/logout"] });
      expect(mod!.data_models).toEqual({ User: { fields: ["id", "email"] } });
      expect(mod!.dependencies).toEqual(["database"]);
    });

    it("can query KB modules by knowledge_base_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const kbId = await t.run(async (ctx) => {
        return ctx.db.insert("knowledge_bases", {
          workspace_id: workspaceId,
          project_id: projectId,
          status: "ready",
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("kb_modules", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          name: "users",
        });
        await ctx.db.insert("kb_modules", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          name: "payments",
        });
      });

      const mods = await t.run(async (ctx) => {
        return ctx.db
          .query("kb_modules")
          .withIndex("by_knowledge_base_id", (q) => q.eq("knowledge_base_id", kbId))
          .collect();
      });

      expect(mods).toHaveLength(2);
      expect(mods.map((m) => m.name).sort()).toEqual(["payments", "users"]);
    });
  });
});
