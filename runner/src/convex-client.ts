import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import * as fs from "fs/promises";
import * as path from "path";
import mime from "mime";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { AiConfig } from "../../convex/ai/model";
import type { CapturedPage, DiscoveredFlow } from "./types";

export class RunnerConvexClient {
  private client: ConvexHttpClient;
  private secret: string;

  constructor(convexUrl: string, runnerSecret: string) {
    this.client = new ConvexHttpClient(convexUrl);
    this.secret = runnerSecret;
  }

  async getPendingWork(): Promise<
    FunctionReturnType<typeof api.runs.queries.getPendingWork>
  > {
    return this.client.query(api.runs.queries.getPendingWork, {});
  }

  async claimRun(runId: string, runnerId: string): Promise<void> {
    await this.client.action(api.runs.actions.runnerClaimRun, {
      runner_secret: this.secret,
      run_id: runId as Id<"runs">,
      runner_id: runnerId,
    });
  }

  async writeStepResult(args: {
    workspace_id: string;
    run_result_id: string;
    step_number: number;
    command: string;
    locator?: string;
    status: "passed" | "failed" | "skipped" | "healed";
    error_message?: string;
    screenshot_file_id?: string;
    duration_ms: number;
    heal_reason?: string;
    heal_confidence?: number;
    before_screenshot_file_id?: string;
  }): Promise<void> {
    await this.client.action(api.runs.actions.runnerWriteStepResult, {
      runner_secret: this.secret,
      workspace_id: args.workspace_id as Id<"workspaces">,
      run_result_id: args.run_result_id as Id<"run_results">,
      step_number: args.step_number,
      command: args.command,
      locator: args.locator,
      status: args.status,
      error_message: args.error_message,
      screenshot_file_id: args.screenshot_file_id as Id<"_storage"> | undefined,
      duration_ms: args.duration_ms,
      heal_reason: args.heal_reason,
      heal_confidence: args.heal_confidence,
      before_screenshot_file_id: args.before_screenshot_file_id as Id<"_storage"> | undefined,
    });
  }

  async writeRunResult(args: {
    run_result_id: string;
    status: "passed" | "failed" | "skipped";
    duration_ms: number;
    console_log_file_id?: string;
    trace_file_id?: string;
    video_file_id?: string;
    screenshot_file_ids?: string[];
    error_message?: string;
  }): Promise<void> {
    await this.client.action(api.runs.actions.runnerWriteRunResult, {
      runner_secret: this.secret,
      run_result_id: args.run_result_id as Id<"run_results">,
      status: args.status,
      duration_ms: args.duration_ms,
      console_log_file_id: args.console_log_file_id as Id<"_storage"> | undefined,
      trace_file_id: args.trace_file_id as Id<"_storage"> | undefined,
      video_file_id: args.video_file_id as Id<"_storage"> | undefined,
      screenshot_file_ids: args.screenshot_file_ids as Id<"_storage">[] | undefined,
      error_message: args.error_message,
    });
  }

  async completeRun(runId: string): Promise<void> {
    await this.client.action(api.runs.actions.runnerCompleteRun, {
      runner_secret: this.secret,
      run_id: runId as Id<"runs">,
    });
  }

  async forceCompleteRun(
    runId: string,
    status: "failed" | "cancelled" | "timed_out",
    errorMessage?: string,
  ): Promise<void> {
    await this.client.action(api.runs.actions.runnerForceCompleteRun, {
      runner_secret: this.secret,
      run_id: runId as Id<"runs">,
      forced_status: status,
      error_message: errorMessage,
    });
  }

  async sendHeartbeat(runId: string): Promise<void> {
    await this.client.action(api.runs.actions.runnerHeartbeat, {
      runner_secret: this.secret,
      run_id: runId as Id<"runs">,
    });
  }

  async generateUploadUrl(): Promise<string> {
    return this.client.action(api.files.actions.runnerGenerateUploadUrl, {
      runner_secret: this.secret,
    });
  }

  async uploadFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const contentType = mime.getType(fileName) || "application/octet-stream";
    return this.uploadBuffer(buffer, contentType);
  }

  async uploadBuffer(buffer: Buffer, contentType: string): Promise<string> {
    const uploadUrl = await this.generateUploadUrl();

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const { storageId } = await response.json();
    return storageId;
  }

  async getPendingExplorations(): Promise<
    FunctionReturnType<typeof api.explorations.queries.getPendingExplorations>
  > {
    return this.client.query(api.explorations.queries.getPendingExplorations, {});
  }

  async claimExploration(explorationId: string, runnerId: string): Promise<void> {
    await this.client.action(api.explorations.actions.runnerClaimExploration, {
      runner_secret: this.secret,
      exploration_id: explorationId as Id<"explorations">,
      runner_id: runnerId,
    });
  }

  async updateExplorationProgress(
    explorationId: string,
    progressMessage: string,
    pagesCaptured: number,
  ): Promise<void> {
    await this.client.action(api.explorations.actions.runnerUpdateExplorationProgress, {
      runner_secret: this.secret,
      exploration_id: explorationId as Id<"explorations">,
      progress_message: progressMessage,
      pages_captured: pagesCaptured,
    });
  }

  async completeExploration(
    explorationId: string,
    capturedPages: CapturedPage[],
    discoveredFlows?: DiscoveredFlow[],
  ): Promise<void> {
    await this.client.action(api.explorations.actions.runnerCompleteExploration, {
      runner_secret: this.secret,
      exploration_id: explorationId as Id<"explorations">,
      captured_pages: capturedPages.map((p) => ({
        ...p,
        screenshot_storage_id: p.screenshot_storage_id as Id<"_storage"> | undefined,
      })),
      discovered_flows: discoveredFlows,
    });
  }

  async failExploration(explorationId: string, errorMessage: string): Promise<void> {
    await this.client.action(api.explorations.actions.runnerFailExploration, {
      runner_secret: this.secret,
      exploration_id: explorationId as Id<"explorations">,
      error_message: errorMessage,
    });
  }

  async getWorkspaceAiConfig(workspaceId: string): Promise<AiConfig> {
    return this.client.action(api.workspaces.actions.runnerGetWorkspaceAiConfig, {
      runner_secret: this.secret,
      workspace_id: workspaceId as Id<"workspaces">,
    });
  }

  async recordHealingHistory(args: {
    workspace_id: string;
    test_id: string;
    step_index: number;
    original_instruction: string;
    healed_selector: string;
    healed_description?: string;
    confidence: number;
    reason?: string;
    run_id?: string;
  }): Promise<void> {
    await this.client.action(api.runs.actions.runnerRecordHealingHistory, {
      runner_secret: this.secret,
      workspace_id: args.workspace_id as Id<"workspaces">,
      test_id: args.test_id as Id<"tests">,
      step_index: args.step_index,
      original_instruction: args.original_instruction,
      healed_selector: args.healed_selector,
      healed_description: args.healed_description,
      confidence: args.confidence,
      reason: args.reason,
      run_id: args.run_id as Id<"runs"> | undefined,
    });
  }
}
