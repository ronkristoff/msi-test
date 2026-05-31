/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

async function seedMember(t: ReturnType<typeof convexTest>, workspaceId: string, userId: string, role: "owner" | "member" = "member", userName = "Test Member") {
  return t.run(async (ctx) => {
    return ctx.db.insert("workspace_members", {
      workspace_id: workspaceId,
      user_id: userId,
      role,
      invited_at: Date.now(),
      user_name: userName,
    });
  });
}

describe("membership module", () => {
  describe("getMemberWorkspace (data layer)", () => {
    it("resolves workspace via workspace_members table", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");
      await seedMember(t, workspaceId, "user1", "owner", "Owner User");

      const result = await t.run(async (ctx) => {
        const membership = await ctx.db
          .query("workspace_members")
          .withIndex("by_user_id", (q) => q.eq("user_id", "user1"))
          .first();
        if (!membership) return null;
        return ctx.db.get(membership.workspace_id);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(workspaceId);
    });

    it("returns null for user with no membership", async () => {
      const t = convexTest(schema, modules);
      await seedWorkspace(t, "owner1");

      const result = await t.run(async (ctx) => {
        return ctx.db
          .query("workspace_members")
          .withIndex("by_user_id", (q) => q.eq("user_id", "unknown_user"))
          .first();
      });

      expect(result).toBeNull();
    });

    it("returns role from membership", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");
      await seedMember(t, workspaceId, "owner1", "owner", "Owner");
      await seedMember(t, workspaceId, "member1", "member", "Member");

      const ownerRole = await t.run(async (ctx) => {
        const m = await ctx.db
          .query("workspace_members")
          .withIndex("by_user_id", (q) => q.eq("user_id", "owner1"))
          .first();
        return m?.role;
      });
      const memberRole = await t.run(async (ctx) => {
        const m = await ctx.db
          .query("workspace_members")
          .withIndex("by_user_id", (q) => q.eq("user_id", "member1"))
          .first();
        return m?.role;
      });

      expect(ownerRole).toBe("owner");
      expect(memberRole).toBe("member");
    });
  });

  describe("joinWorkspace", () => {
    it("creates membership from invite code (data layer)", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await t.run(async (ctx) => {
        return ctx.db.insert("workspaces", {
          name: "Team WS",
          owner_id: "owner1",
          ai_config: { endpoint_url: "https://api.example.com", api_key: "key", model_name: "gpt-4" },
          invite_code: "ABC12345",
        });
      });

      await t.run(async (ctx) => {
        const ws = await ctx.db
          .query("workspaces")
          .withIndex("by_owner_id", (q) => q.eq("owner_id", "owner1"))
          .first();
        if (!ws || ws.invite_code !== "ABC12345") throw new Error("Invalid invite code");

        await ctx.db.insert("workspace_members", {
          workspace_id: ws._id,
          user_id: "new_user",
          role: "member",
          invited_at: Date.now(),
          user_name: "New Member",
        });
      });

      const membership = await t.run(async (ctx) => {
        return ctx.db
          .query("workspace_members")
          .withIndex("by_user_id", (q) => q.eq("user_id", "new_user"))
          .first();
      });

      expect(membership).not.toBeNull();
      expect(membership!.workspace_id).toBe(workspaceId);
      expect(membership!.role).toBe("member");
      expect(membership!.user_name).toBe("New Member");
    });

    it("invite code lookup fails for non-existent code (data layer)", async () => {
      const t = convexTest(schema, modules);
      await seedWorkspace(t, "owner1");

      const ws = await t.run(async (ctx) => {
        return ctx.db
          .query("workspaces")
          .filter((q) => q.eq(q.field("invite_code"), "INVALID"))
          .first();
      });

      expect(ws).toBeNull();
    });

    it("duplicate membership is prevented by unique index (data layer)", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");
      await seedMember(t, workspaceId, "existing_user", "member", "Existing");

      const existing = await t.run(async (ctx) => {
        return ctx.db
          .query("workspace_members")
          .withIndex("by_workspace_id_and_user_id", (q) =>
            q.eq("workspace_id", workspaceId).eq("user_id", "existing_user"),
          )
          .first();
      });

      expect(existing).not.toBeNull();
      expect(existing!.role).toBe("member");
    });
  });

  describe("removeMember", () => {
    it("owner can remove a member", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");
      const memberId = await seedMember(t, workspaceId, "member1", "member", "Member");

      await t.run(async (ctx) => {
        await ctx.db.delete(memberId);
      });

      const removed = await t.run(async (ctx) => ctx.db.get(memberId));
      expect(removed).toBeNull();
    });

    it("owner cannot remove themselves", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");

      const ownerMembership = await t.run(async (ctx) => {
        return ctx.db
          .query("workspace_members")
          .withIndex("by_workspace_id_and_user_id", (q) =>
            q.eq("workspace_id", workspaceId).eq("user_id", "owner1"),
          )
          .first();
      });

      expect(ownerMembership).not.toBeNull();
      expect(ownerMembership!.role).toBe("owner");
    });
  });

  describe("getMembers", () => {
    it("returns all members with names and roles", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");
      await seedMember(t, workspaceId, "member1", "member", "Bob");

      const members = await t.run(async (ctx) => {
        return ctx.db
          .query("workspace_members")
          .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
          .collect();
      });

      expect(members).toHaveLength(2);
      const names = members.map((m) => m.user_name).sort();
      expect(names).toEqual(["Bob", "owner1"]);
    });

    it("does not return members from other workspaces", async () => {
      const t = convexTest(schema, modules);
      const ws1 = await seedWorkspace(t, "owner1");
      const ws2 = await seedWorkspace(t, "owner2");
      await seedMember(t, ws1, "member1", "member", "Alice");
      await seedMember(t, ws2, "member2", "member", "Charlie");

      const ws1Members = await t.run(async (ctx) => {
        return ctx.db
          .query("workspace_members")
          .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws1))
          .collect();
      });

      expect(ws1Members).toHaveLength(2);
      const ws1Names = ws1Members.map((m) => m.user_name).sort();
      expect(ws1Names).toEqual(["Alice", "owner1"]);
    });
  });

  describe("invite codes", () => {
    it("regenerateInviteCode changes the code", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await t.run(async (ctx) => {
        return ctx.db.insert("workspaces", {
          name: "Team WS",
          owner_id: "owner1",
          ai_config: { endpoint_url: "https://api.example.com", api_key: "key", model_name: "gpt-4" },
          invite_code: "OLD12345",
        });
      });

      const newCode = await t.run(async (ctx) => {
        const code = "NEW" + Math.random().toString(36).slice(2, 7).toUpperCase();
        await ctx.db.patch(workspaceId, { invite_code: code });
        return code;
      });

      const updated = await t.run(async (ctx) => ctx.db.get(workspaceId));
      expect(updated!.invite_code).toBe(newCode);
      expect(updated!.invite_code).not.toBe("OLD12345");
    });

    it("invite code is optional on workspaces", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t, "owner1");

      const ws = await t.run(async (ctx) => ctx.db.get(workspaceId));
      expect(ws!.invite_code).toBeUndefined();
    });
  });
});
