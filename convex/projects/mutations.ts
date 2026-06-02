import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { validateProjectName, normalizeAppUrl } from "../lib/validation";
import {
  TEST_DATA_MAX_KEYS,
  TEST_DATA_MAX_KEY_LEN,
  TEST_DATA_MAX_VALUE_LEN,
} from "../lib/constraints";

const KEEP_SENTINEL = "___KEEP___";

function validateTestData(data: Record<string, string>): void {
  const keys = Object.keys(data);
  if (keys.length > TEST_DATA_MAX_KEYS) {
    throw new ConvexError(`Test data cannot exceed ${TEST_DATA_MAX_KEYS} entries`);
  }
  for (const key of keys) {
    if (key.length > TEST_DATA_MAX_KEY_LEN) {
      throw new ConvexError(`Test data key "${key.slice(0, 30)}..." exceeds ${TEST_DATA_MAX_KEY_LEN} characters`);
    }
    if (data[key].length > TEST_DATA_MAX_VALUE_LEN) {
      throw new ConvexError(`Test data value for "${key}" exceeds ${TEST_DATA_MAX_VALUE_LEN} characters`);
    }
  }
}

export const createProject = mutation({
  args: {
    workspace_id: v.id("workspaces"),
    name: v.string(),
    app_url: v.string(),
    prd_text: v.optional(v.string()),
    prd_file_id: v.optional(v.id("_storage")),
    test_data: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    if (args.workspace_id !== workspace._id) {
      throw new ConvexError("Not found or access denied");
    }

    const name = validateProjectName(args.name);
    const appUrl = normalizeAppUrl(args.app_url);

    if (args.test_data) {
      validateTestData(args.test_data);
    }

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_workspace_id_and_name", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("name", name),
      )
      .first();
    if (existing) {
      throw new ConvexError("A project with this name already exists in this workspace");
    }

    return ctx.db.insert("projects", {
      workspace_id: args.workspace_id,
      name,
      app_url: appUrl,
      ...(args.prd_text?.trim() ? { prd_text: args.prd_text.trim() } : {}),
      ...(args.prd_file_id ? { prd_file_id: args.prd_file_id } : {}),
      ...(args.test_data ? { test_data: args.test_data } : {}),
    });
  },
});

export const updateProject = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.optional(v.string()),
    app_url: v.optional(v.string()),
    prd_text: v.optional(v.string()),
    prd_file_id: v.optional(v.id("_storage")),
    clear_prd: v.optional(v.boolean()),
    explore_auth_mode: v.optional(
      v.union(v.literal("none"), v.literal("form"), v.literal("cookie")),
    ),
    explore_login_url: v.optional(v.string()),
    explore_username: v.optional(v.string()),
    explore_password: v.optional(v.string()),
    explore_cookie_name: v.optional(v.string()),
    explore_cookie_value: v.optional(v.string()),
    test_data: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = validateProjectName(args.name);

      if (name !== project.name) {
        const existing = await ctx.db
          .query("projects")
          .withIndex("by_workspace_id_and_name", (q) =>
            q.eq("workspace_id", project.workspace_id).eq("name", name),
          )
          .first();
        if (existing) {
          throw new ConvexError("A project with this name already exists in this workspace");
        }
      }
      updates.name = name;
    }

    if (args.app_url !== undefined) {
      updates.app_url = normalizeAppUrl(args.app_url);
    }

    if (args.clear_prd) {
      if (project.prd_file_id) {
        await ctx.storage.delete(project.prd_file_id);
      }
      updates.prd_text = undefined;
      updates.prd_file_id = undefined;
    } else if (args.prd_text !== undefined) {
      if (project.prd_file_id) {
        await ctx.storage.delete(project.prd_file_id);
      }
      updates.prd_text = args.prd_text.trim() || undefined;
      updates.prd_file_id = undefined;
    } else if (args.prd_file_id !== undefined) {
      updates.prd_text = undefined;
      updates.prd_file_id = args.prd_file_id;
    }

    if (args.explore_auth_mode !== undefined) {
      if (args.explore_auth_mode === "none") {
        updates.explore_auth_mode = "none";
        updates.explore_login_url = undefined;
        updates.explore_username = undefined;
        updates.explore_password = undefined;
        updates.explore_cookie_name = undefined;
        updates.explore_cookie_value = undefined;
      } else if (args.explore_auth_mode === "form") {
        updates.explore_auth_mode = "form";
        updates.explore_login_url = args.explore_login_url?.trim() || undefined;
        updates.explore_username = args.explore_username?.trim() || undefined;
        if (args.explore_password && args.explore_password !== KEEP_SENTINEL) {
          updates.explore_password = args.explore_password;
        }
        updates.explore_cookie_name = undefined;
        updates.explore_cookie_value = undefined;
      } else if (args.explore_auth_mode === "cookie") {
        updates.explore_auth_mode = "cookie";
        updates.explore_cookie_name = args.explore_cookie_name?.trim() || undefined;
        if (args.explore_cookie_value && args.explore_cookie_value !== KEEP_SENTINEL) {
          updates.explore_cookie_value = args.explore_cookie_value;
        }
        updates.explore_login_url = undefined;
        updates.explore_username = undefined;
        updates.explore_password = undefined;
      }
    }

    if (args.test_data !== undefined) {
      if (Object.keys(args.test_data).length > 0) {
        validateTestData(args.test_data);
        updates.test_data = args.test_data;
      } else {
        updates.test_data = undefined;
      }
    }

    await ctx.db.patch(args.project_id, updates);
  },
});

export const archiveProject = mutation({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");
    await ctx.db.patch(args.project_id, { status: "archived" });
  },
});

export const unarchiveProject = mutation({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");
    await ctx.db.patch(args.project_id, { status: undefined });
  },
});
