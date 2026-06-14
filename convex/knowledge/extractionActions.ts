"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { generateObject } from "ai";
import { getWorkspaceModel } from "../ai/model";
import {
  buildArchitectureExtractionPrompt,
  buildModuleExtractionPrompt,
  architectureSchema,
  moduleSchema,
  type BmadContext,
} from "./extractionPrompts";
import {
  buildFileTree,
  sampleCodeForExtraction,
  buildDirectorySummary,
} from "./extractionContext";
import {
  getErrorStatusCode,
  getErrorMessage,
} from "./embeddingActions";
import { EXTRACTION_MAX_MODULES } from "../lib/constraints";

type ChunkData = {
  _id: string;
  file_path: string;
  chunk_index: number;
  language?: string;
  directory: string;
  content: string;
  char_count: number;
};

function buildExtractionErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);
  const message = getErrorMessage(error);

  if (statusCode === 401 || statusCode === 403) {
    return "AI extraction failed: authentication error. Check workspace AI config.";
  }
  if (statusCode === 404) {
    return `AI extraction failed: model not available (${message}).`;
  }
  return `AI extraction failed: ${message}`;
}

export { buildExtractionErrorMessage };

export const extractArchitectureAndModules = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const chunks: ChunkData[] = await ctx.runQuery(
      internal.knowledge.internal._getChunksForExtraction,
      { knowledge_base_id: args.knowledge_base_id },
    );

    if (chunks.length === 0) {
      return { architectureExtracted: false, modulesExtracted: 0 };
    }

    const kb = await ctx.runQuery(
      internal.knowledge.internal._getKbForExtraction,
      { knowledge_base_id: args.knowledge_base_id },
    );

    let bmadContext: BmadContext | null = null;
    if (kb?.bmad_detected) {
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

    const fileTree = buildFileTree(chunks);
    const sampledCode = sampleCodeForExtraction(chunks);
    const directorySummary = buildDirectorySummary(chunks);

    const aiConfig = await ctx.runQuery(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: args.workspace_id },
    );

    if (!aiConfig?.ai_config) {
      throw new ConvexError("Workspace AI config not found");
    }

    const model = getWorkspaceModel(aiConfig.ai_config);

    // Phase 1: Architecture summary extraction
    const archPrompt = buildArchitectureExtractionPrompt({
      fileTree,
      sampledCode,
      bmadContext,
    });

    let architectureResult;
    try {
      const result = await generateObject({
        model,
        schema: architectureSchema,
        prompt: archPrompt,
      });
      architectureResult = result.object;
    } catch (error: unknown) {
      throw new ConvexError(buildExtractionErrorMessage(error));
    }

    await ctx.runMutation(
      internal.knowledge.internal._storeArchitectureSummary,
      {
        knowledge_base_id: args.knowledge_base_id,
        architecture_summary: architectureResult.architecture_summary,
        tech_stack: architectureResult.tech_stack,
        folder_structure: architectureResult.folder_structure,
        architecture_type: architectureResult.architecture_type,
      },
    );

    // Phase 2: Module extraction
    const modulePrompt = buildModuleExtractionPrompt({
      architectureSummary: architectureResult,
      directoryStructure: directorySummary,
      sampledCode,
      bmadContext,
    });

    let moduleResult;
    try {
      const result = await generateObject({
        model,
        schema: moduleSchema,
        prompt: modulePrompt,
      });
      moduleResult = result.object;
    } catch (error: unknown) {
      throw new ConvexError(buildExtractionErrorMessage(error));
    }

    const modules = (moduleResult.modules ?? []).slice(0, EXTRACTION_MAX_MODULES);

    if (modules.length > 0) {
      await ctx.runMutation(
        internal.knowledge.internal._deleteModulesByKb,
        { knowledge_base_id: args.knowledge_base_id },
      );

      await ctx.runMutation(
        internal.knowledge.internal._storeModules,
        {
          knowledge_base_id: args.knowledge_base_id,
          workspace_id: args.workspace_id,
          modules,
        },
      );
    }

    return {
      architectureExtracted: true,
      modulesExtracted: modules.length,
    };
  },
});
