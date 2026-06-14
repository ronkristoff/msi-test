"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { generateObject } from "ai";
import { getWorkspaceModel } from "../ai/model";
import {
  driftReportSchema,
  buildDriftReportPrompt,
  filterDriftDimensions,
  validateDriftItemSectionIds,
  boundDriftContext,
  type BmadDriftContext,
  type DriftItem,
} from "./driftPrompts";
import {
  getErrorStatusCode,
  getErrorMessage,
} from "./embeddingActions";
import { MAX_DRIFT_ITEMS } from "../lib/constraints";

export function buildDriftReportErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);
  const message = getErrorMessage(error);

  if (statusCode === 401 || statusCode === 403) {
    return "Drift Report generation failed: authentication error. Check workspace AI config.";
  }
  if (statusCode === 404) {
    return `Drift Report generation failed: model not available (${message}).`;
  }
  return `Drift Report generation failed: ${message}`;
}

export const generateDriftReport = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    baseline_rd_id: v.id("baseline_rds"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.runQuery(
      internal.knowledge.internal._getKbForDriftReport,
      {
        knowledge_base_id: args.knowledge_base_id,
        baseline_rd_id: args.baseline_rd_id,
      },
    );

    if (!kb) {
      throw new ConvexError("Knowledge base not found for Drift Report generation");
    }

    if (kb.project_id !== args.project_id) {
      throw new ConvexError("Knowledge base does not belong to the specified project");
    }

    if (!kb.old_rd_extracted_text) {
      return { driftReportId: null, reason: "no_old_rd" as const };
    }

    if (!kb.baseline_rd) {
      return { driftReportId: null, reason: "no_baseline_rd" as const };
    }

    let bmadContext: BmadDriftContext | null = null;
    if (kb.bmad_detected) {
      const bmadData = await ctx.runQuery(
        internal.knowledge.internal._getBmadMetadataForDrift,
        { knowledge_base_id: args.knowledge_base_id },
      );
      if (
        bmadData.detected &&
        (bmadData.prdSections || bmadData.adrs || bmadData.conventions)
      ) {
        bmadContext = {
          prdSections: bmadData.prdSections,
          adrs: bmadData.adrs,
          conventions: bmadData.conventions,
        };
      }
    }

    const aiConfig = await ctx.runQuery(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: args.workspace_id },
    );

    if (!aiConfig?.ai_config) {
      throw new ConvexError("Workspace AI config not found");
    }

    const model = getWorkspaceModel(aiConfig.ai_config);

    const bounded = boundDriftContext({
      oldRdText: kb.old_rd_extracted_text,
      baselineRdSections: kb.baseline_rd.sections,
      architectureSummary: {
        architecture_summary: kb.architecture_summary ?? "unknown",
        architecture_type: kb.architecture_type ?? "unknown",
        folder_structure: kb.folder_structure ?? "unknown",
        tech_stack: kb.tech_stack ?? [],
      },
      kbStats: {
        total_files: kb.total_files,
        total_size_bytes: kb.total_size_bytes,
      },
      bmadContext,
    });

    const prompt = buildDriftReportPrompt(bounded);

    let resultObject: { items: DriftItem[] };
    try {
      const result = await generateObject({
        model,
        schema: driftReportSchema,
        prompt,
      });
      resultObject = result.object;
    } catch (error: unknown) {
      throw new ConvexError(buildDriftReportErrorMessage(error));
    }

    let items = resultObject.items;
    const hasBmadContext = bmadContext !== null;
    items = filterDriftDimensions(items, { bmad: hasBmadContext });
    items = validateDriftItemSectionIds(items);
    items = items.slice(0, MAX_DRIFT_ITEMS);

    const stored = await ctx.runMutation(
      internal.knowledge.internal._storeDriftReport,
      {
        project_id: args.project_id,
        workspace_id: args.workspace_id,
        knowledge_base_id: args.knowledge_base_id,
        baseline_rd_id: args.baseline_rd_id,
        baseline_rd_version: kb.baseline_rd.version,
        bmad_detected: hasBmadContext,
        items,
      },
    );

    return { driftReportId: stored._id, version: stored.version };
  },
});

export const generateDriftReportWithLogging = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    baseline_rd_id: v.id("baseline_rds"),
  },
  handler: async (ctx, args) => {
    try {
      return await ctx.runAction(
        internal.knowledge.driftActions.generateDriftReport,
        args,
      );
    } catch (error: unknown) {
      const message = getErrorMessage(error) || "Drift Report generation failed";
      try {
        const kb = await ctx.runQuery(
          internal.knowledge.internal._getKbForExtraction,
          { knowledge_base_id: args.knowledge_base_id },
        );
        const bmadDetected = kb?.bmad_detected ?? false;
        const logged = await ctx.runMutation(
          internal.knowledge.internal._logDriftReportFailure,
          {
            project_id: args.project_id,
            workspace_id: args.workspace_id,
            knowledge_base_id: args.knowledge_base_id,
            baseline_rd_id: args.baseline_rd_id,
            bmad_detected: bmadDetected,
            error_message: message,
          },
        );
        return {
          driftReportId: null,
          version: logged.version,
          error: message,
        };
      } catch {
        return { driftReportId: null, version: 0, error: message };
      }
    }
  },
});
