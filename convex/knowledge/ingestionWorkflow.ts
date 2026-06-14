import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { defineWorkflow, vWorkflowId } from "@convex-dev/workflow";
import { mutation } from "../_generated/server";
import { cancel } from "@convex-dev/workflow";
import { getOwnedEntity } from "../lib/requireAuth";
import { ConvexError } from "convex/values";

export const ingestionWorkflow = defineWorkflow(components.workflow, {
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
  },
}).handler(async (step, args) => {
  const project = await step.runQuery(
    internal.knowledge.internal._getProjectForIngestion,
    { project_id: args.project_id },
    { retry: true },
  );

  if (!project || !project.repo_url || !project.encrypted_pat) {
    await step.runMutation(internal.knowledge.internal._updateKbStatus, {
      knowledge_base_id: args.knowledge_base_id,
      project_id: args.project_id,
      status: "error",
      error_message: "Project has no connected repository",
    });
    return { success: false, error: "No repository connected" };
  }

  const treeResult: {
    files: { path: string; size: number }[];
    truncated: boolean;
    bmadFiles: { path: string; size: number }[];
  } = await step.runAction(
    internal.knowledge.ingestionActions.decryptAndFetchTree,
    {
      project_id: args.project_id,
      repo_url: project.repo_url,
      encrypted_pat: project.encrypted_pat,
      knowledge_base_id: args.knowledge_base_id,
    },
    { retry: true },
  );

  const progressMsg = treeResult.truncated
    ? `Repository truncated — processing ${treeResult.files.length} of more than 100k entries...`
    : `Reading ${treeResult.files.length} files...`;

  await step.runMutation(internal.knowledge.internal._updateKbStatus, {
    knowledge_base_id: args.knowledge_base_id,
    project_id: args.project_id,
    status: "building",
    progress_message: progressMsg,
  });

  const chunkResult: {
    totalFiles: number;
    totalSize: number;
    chunkCount: number;
    skippedFiles: number;
  } = await step.runAction(
    internal.knowledge.ingestionActions.fetchAndChunkFiles,
    {
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      workspace_id: project.workspace_id,
      repo_url: project.repo_url,
      encrypted_pat: project.encrypted_pat,
      files: treeResult.files,
    },
    { retry: true },
  );

  await step.runMutation(internal.knowledge.internal._updateKbStats, {
    knowledge_base_id: args.knowledge_base_id,
    total_files: chunkResult.totalFiles,
    total_size_bytes: chunkResult.totalSize,
  });

  await step.runMutation(internal.knowledge.internal._updateKbStatus, {
    knowledge_base_id: args.knowledge_base_id,
    project_id: args.project_id,
    status: "building",
    progress_message: `Chunking complete. ${chunkResult.chunkCount} chunks created from ${chunkResult.totalFiles} files. Generating embeddings...`,
  });

  await step.runAction(
    internal.knowledge.embeddingActions.embedChunks,
    {
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      workspace_id: project.workspace_id,
    },
    { retry: true },
  );

  if (treeResult.bmadFiles && treeResult.bmadFiles.length > 0) {
    await step.runAction(
      internal.knowledge.bmadActions.detectAndParseBmad,
      {
        project_id: args.project_id,
        knowledge_base_id: args.knowledge_base_id,
        workspace_id: project.workspace_id,
        repo_url: project.repo_url,
        encrypted_pat: project.encrypted_pat,
        bmad_files: treeResult.bmadFiles,
      },
      { retry: true },
    );
  } else {
    await step.runMutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: args.knowledge_base_id,
      detected: false,
    });
  }

  await step.runMutation(internal.knowledge.internal._updateKbStatus, {
    knowledge_base_id: args.knowledge_base_id,
    project_id: args.project_id,
    status: "building",
    progress_message: "Analyzing code structure...",
  });

  await step.runAction(
    internal.knowledge.extractionActions.extractArchitectureAndModules,
    {
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      workspace_id: project.workspace_id,
    },
    { retry: true },
  );

  await step.runMutation(internal.knowledge.internal._updateKbStatus, {
    knowledge_base_id: args.knowledge_base_id,
    project_id: args.project_id,
    status: "ready",
    progress_message: "Knowledge Base ready",
  });

  await step.runMutation(internal.knowledge.internal._setLastSyncedAt, {
    knowledge_base_id: args.knowledge_base_id,
  });

  return { success: true, chunkCount: chunkResult.chunkCount };
});

export const cancelIngestion = mutation({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workflow_id: vWorkflowId,
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");

    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb || kb.project_id !== args.project_id) {
      throw new ConvexError("Knowledge base not found for this project");
    }

    if (kb.status !== "building") {
      throw new ConvexError("Knowledge base is not currently building");
    }

    await cancel(ctx, components.workflow, args.workflow_id);

    await ctx.db.patch(args.knowledge_base_id, {
      status: "error",
      error_message: "Cancelled by user",
      progress_message: undefined,
    });

    await ctx.db.patch(args.project_id, {
      kb_status: "error",
    });
  },
});
