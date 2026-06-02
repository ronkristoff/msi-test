"use node";

import { action, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { isBrowserbaseConfigured, createStagehand, type GuardResult } from "./lib";
import { z } from "zod";

type ReachabilityResult =
  | { available: false; reason: string }
  | { available: true; reachable: boolean; title?: string; error?: string };

type ExtractionResult =
  | { available: false; reason: string }
  | {
      available: true;
      title: string;
      description?: string;
      headings: string[];
      linkCount: number;
      imageCount: number;
      structureText: string;
    };

type ChangeDetectionResult =
  | { available: false; reason: string }
  | {
      available: true;
      changed: boolean;
      previousTitle?: string;
      currentTitle?: string;
      summary: string;
    };

async function requireStagehand(ctx: ActionCtx): Promise<GuardResult> {
  if (!isBrowserbaseConfigured()) {
    return { ok: false, result: { available: false, reason: "Browserbase not configured" } };
  }
  const workspace = await ctx.runQuery(api.workspaces.queries.getWorkspaceForUser, {});
  if (!workspace || workspace.stagehand_enabled !== true) {
    return { ok: false, result: { available: false, reason: "Stagehand not enabled for this workspace" } };
  }
  return { ok: true, stagehand: createStagehand() };
}

export const checkUrlReachability = action({
  args: {
    project_id: v.id("projects"),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ReachabilityResult> => {
    const guard = await requireStagehand(ctx);
    if (!guard.ok) return guard.result;

    const project = await ctx.runQuery(api.projects.queries.getProject, {
      project_id: args.project_id,
    });
    const targetUrl = args.url?.trim() || project?.app_url;
    if (!targetUrl) {
      return { available: true, reachable: false, error: "No URL provided" };
    }

    try {
      const result = await guard.stagehand.extract(ctx, {
        url: targetUrl,
        instruction: "Extract the page title",
        schema: z.object({ title: z.string() }),
      });
      return { available: true, reachable: true, title: result.title };
    } catch (err) {
      return {
        available: true,
        reachable: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const extractPageInfo = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args): Promise<ExtractionResult> => {
    const guard = await requireStagehand(ctx);
    if (!guard.ok) return guard.result;

    const result = await guard.stagehand.extract(ctx, {
      url: args.url,
      instruction:
        "Extract the page title, meta description, all heading texts (h1-h3), the count of links on the page, the count of images, and a concise text summary of the page structure.",
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        headings: z.array(z.string()),
        linkCount: z.number(),
        imageCount: z.number(),
        structureText: z.string(),
      }),
    });

    return {
      available: true,
      title: result.title,
      description: result.description,
      headings: result.headings,
      linkCount: result.linkCount,
      imageCount: result.imageCount,
      structureText: result.structureText,
    };
  },
});

export const detectPageChanges = action({
  args: {
    project_id: v.id("projects"),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ChangeDetectionResult> => {
    const guard = await requireStagehand(ctx);
    if (!guard.ok) return guard.result;

    const project = await ctx.runQuery(api.projects.queries.getProject, {
      project_id: args.project_id,
    });
    if (!project) {
      return { available: false, reason: "Project not found" };
    }

    const previousPage = await ctx.runQuery(
      internal.stagehand.internal.getLastCapturedPage,
      { project_id: args.project_id },
    );

    if (!previousPage) {
      return {
        available: true,
        changed: true,
        summary: "No previous exploration found — first check",
      };
    }

    const targetUrl = args.url?.trim() || project.app_url;
    if (!targetUrl) {
      return { available: false, reason: "No URL to check" };
    }

    const result = await guard.stagehand.extract(ctx, {
      url: targetUrl,
      instruction: "Extract the page title",
      schema: z.object({ title: z.string() }),
    });

    const titleChanged = result.title !== previousPage.title;

    return {
      available: true,
      changed: titleChanged,
      previousTitle: previousPage.title,
      currentTitle: result.title,
      summary: titleChanged
        ? `Page title changed from "${previousPage.title}" to "${result.title}"`
        : "No changes detected",
    };
  },
});
