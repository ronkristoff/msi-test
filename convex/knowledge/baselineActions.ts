"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { generateObject } from "ai";
import { getWorkspaceModel } from "../ai/model";
import {
  baselineRdSchema,
  buildBaselineRdPrompt,
  applyBmadConfidenceAdjustment,
  clampSectionConfidence,
  ensureRequiredSections,
  parseOldRdHeadings,
  boundModulesForPrompt,
  type BmadContext,
  type RdSection,
} from "./baselinePrompts";
import {
  getErrorStatusCode,
  getErrorMessage,
} from "./embeddingActions";

export function buildBaselineRdErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);
  const message = getErrorMessage(error);

  if (statusCode === 401 || statusCode === 403) {
    return "Baseline RD generation failed: authentication error. Check workspace AI config.";
  }
  if (statusCode === 404) {
    return `Baseline RD generation failed: model not available (${message}).`;
  }
  return `Baseline RD generation failed: ${message}`;
}

export const generateBaselineRd = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<{ baselineRdId: Id<"baseline_rds">; version: number }> => {
    const kb = await ctx.runQuery(
      internal.knowledge.internal._getKbForBaselineRd,
      { knowledge_base_id: args.knowledge_base_id },
    );

    if (!kb) {
      throw new ConvexError("Knowledge base not found for Baseline RD generation");
    }

    if (kb.project_id !== args.project_id) {
      throw new ConvexError("Knowledge base does not belong to the specified project");
    }

    if (!kb.architecture_summary || !kb.tech_stack) {
      throw new ConvexError(
        "Knowledge base has not completed architecture extraction",
      );
    }

    let bmadContext: BmadContext | null = null;
    if (kb.bmad_detected) {
      const bmadData = await ctx.runQuery(
        internal.knowledge.internal._getBmadMetadataForExtraction,
        { knowledge_base_id: args.knowledge_base_id },
      );
      if (bmadData.detected && (bmadData.prdSections || bmadData.adrs)) {
        bmadContext = {
          prdSections: bmadData.prdSections,
          adrs: bmadData.adrs,
        };
      }
    }

    const oldRdHeadings = kb.old_rd_extracted_text
      ? parseOldRdHeadings(kb.old_rd_extracted_text)
      : undefined;

    const aiConfig = await ctx.runQuery(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: args.workspace_id },
    );

    if (!aiConfig?.ai_config) {
      throw new ConvexError("Workspace AI config not found");
    }

    const model = getWorkspaceModel(aiConfig.ai_config);

    const boundedModules = boundModulesForPrompt(kb.modules);

    const prompt = buildBaselineRdPrompt({
      architectureSummary: {
        architecture_summary: kb.architecture_summary,
        architecture_type: kb.architecture_type ?? "unknown",
        folder_structure: kb.folder_structure ?? "unknown",
        tech_stack: kb.tech_stack,
      },
      modules: boundedModules,
      kbStats: {
        total_files: kb.total_files,
        total_size_bytes: kb.total_size_bytes,
      },
      oldRdHeadings,
      bmadContext,
    });

    let resultObject: { sections: RdSection[] };
    try {
      const result = await generateObject({
        model,
        schema: baselineRdSchema,
        prompt,
      });
      resultObject = result.object;
    } catch (error: unknown) {
      throw new ConvexError(buildBaselineRdErrorMessage(error));
    }

    const hasBmadContext = bmadContext !== null;
    let sections = resultObject.sections;
    if (hasBmadContext) {
      sections = applyBmadConfidenceAdjustment(sections);
    } else {
      sections = sections.map((s) =>
        s.bmad_alignment ? { ...s, bmad_alignment: undefined } : s,
      );
    }
    sections = clampSectionConfidence(sections);
    sections = ensureRequiredSections(sections, { bmad: hasBmadContext });

    const stored = await ctx.runMutation(
      internal.knowledge.internal._storeBaselineRd,
      {
        project_id: args.project_id,
        workspace_id: args.workspace_id,
        knowledge_base_id: args.knowledge_base_id,
        sections,
      },
    );

    return { baselineRdId: stored._id, version: stored.version };
  },
});

export const generateBaselineRdWithLogging = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<{ baselineRdId: Id<"baseline_rds"> | null; version: number; error?: string }> => {
    try {
      return await ctx.runAction(
        internal.knowledge.baselineActions.generateBaselineRd,
        args,
      );
    } catch (error: unknown) {
      const message = getErrorMessage(error) || "Baseline RD generation failed";
      try {
        const logged = await ctx.runMutation(
          internal.knowledge.internal._logBaselineRdFailure,
          {
            project_id: args.project_id,
            workspace_id: args.workspace_id,
            knowledge_base_id: args.knowledge_base_id,
            error_message: message,
          },
        );
        return { baselineRdId: null, version: logged.version, error: message };
      } catch {
        return { baselineRdId: null, version: 0, error: message };
      }
    }
  },
});
