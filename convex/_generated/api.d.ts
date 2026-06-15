/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_agents from "../ai/agents.js";
import type * as ai_aiRateLimit from "../ai/aiRateLimit.js";
import type * as ai_authContext from "../ai/authContext.js";
import type * as ai_browserClient from "../ai/browserClient.js";
import type * as ai_diff from "../ai/diff.js";
import type * as ai_errors from "../ai/errors.js";
import type * as ai_exploreApp from "../ai/exploreApp.js";
import type * as ai_feedbackDiscovery from "../ai/feedbackDiscovery.js";
import type * as ai_formatElements from "../ai/formatElements.js";
import type * as ai_formatPages from "../ai/formatPages.js";
import type * as ai_generateNlTests from "../ai/generateNlTests.js";
import type * as ai_generatePrdTests from "../ai/generatePrdTests.js";
import type * as ai_healTest from "../ai/healTest.js";
import type * as ai_model from "../ai/model.js";
import type * as ai_nlWorkflow from "../ai/nlWorkflow.js";
import type * as ai_nlWorkflowActions from "../ai/nlWorkflowActions.js";
import type * as ai_parse from "../ai/parse.js";
import type * as ai_prdWorkflow from "../ai/prdWorkflow.js";
import type * as ai_prdWorkflowActions from "../ai/prdWorkflowActions.js";
import type * as ai_refineTest from "../ai/refineTest.js";
import type * as ai_resolveContext from "../ai/resolveContext.js";
import type * as ai_snapshotAction from "../ai/snapshotAction.js";
import type * as ai_snapshotFormatter from "../ai/snapshotFormatter.js";
import type * as ai_suiteStatus from "../ai/suiteStatus.js";
import type * as ai_tools_definitions from "../ai/tools/definitions.js";
import type * as ai_tools_logic from "../ai/tools/logic.js";
import type * as ai_tools_queries from "../ai/tools/queries.js";
import type * as ai_workflowShared from "../ai/workflowShared.js";
import type * as auth from "../auth.js";
import type * as chat_agents from "../chat/agents.js";
import type * as chat_chatActions from "../chat/chatActions.js";
import type * as chat_impactActions from "../chat/impactActions.js";
import type * as chat_impactAgent from "../chat/impactAgent.js";
import type * as chat_impactPrompts from "../chat/impactPrompts.js";
import type * as chat_impactSchema from "../chat/impactSchema.js";
import type * as chat_internal from "../chat/internal.js";
import type * as chat_mutations from "../chat/mutations.js";
import type * as chat_preview from "../chat/preview.js";
import type * as chat_queries from "../chat/queries.js";
import type * as chat_ragContext from "../chat/ragContext.js";
import type * as chat_storyActions from "../chat/storyActions.js";
import type * as chat_storyAgent from "../chat/storyAgent.js";
import type * as chat_storyPersistence from "../chat/storyPersistence.js";
import type * as chat_storyPrompts from "../chat/storyPrompts.js";
import type * as chat_storySchema from "../chat/storySchema.js";
import type * as crons from "../crons.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as environments_mutations from "../environments/mutations.js";
import type * as environments_queries from "../environments/queries.js";
import type * as explorations_actions from "../explorations/actions.js";
import type * as explorations_internal from "../explorations/internal.js";
import type * as explorations_mutations from "../explorations/mutations.js";
import type * as explorations_queries from "../explorations/queries.js";
import type * as files_actions from "../files/actions.js";
import type * as flakiness_actions from "../flakiness/actions.js";
import type * as flakiness_queries from "../flakiness/queries.js";
import type * as http from "../http.js";
import type * as insights_queries from "../insights/queries.js";
import type * as knowledge_baselineActions from "../knowledge/baselineActions.js";
import type * as knowledge_baselinePrompts from "../knowledge/baselinePrompts.js";
import type * as knowledge_baselineRdMutations from "../knowledge/baselineRdMutations.js";
import type * as knowledge_bmadActions from "../knowledge/bmadActions.js";
import type * as knowledge_bmadParsing from "../knowledge/bmadParsing.js";
import type * as knowledge_chunking from "../knowledge/chunking.js";
import type * as knowledge_crypto from "../knowledge/crypto.js";
import type * as knowledge_driftActions from "../knowledge/driftActions.js";
import type * as knowledge_driftPrompts from "../knowledge/driftPrompts.js";
import type * as knowledge_embeddingActions from "../knowledge/embeddingActions.js";
import type * as knowledge_extract from "../knowledge/extract.js";
import type * as knowledge_extractionActions from "../knowledge/extractionActions.js";
import type * as knowledge_extractionContext from "../knowledge/extractionContext.js";
import type * as knowledge_extractionPrompts from "../knowledge/extractionPrompts.js";
import type * as knowledge_github from "../knowledge/github.js";
import type * as knowledge_ingestionActions from "../knowledge/ingestionActions.js";
import type * as knowledge_ingestionWorkflow from "../knowledge/ingestionWorkflow.js";
import type * as knowledge_internal from "../knowledge/internal.js";
import type * as knowledge_mutations from "../knowledge/mutations.js";
import type * as knowledge_oldRdActions from "../knowledge/oldRdActions.js";
import type * as knowledge_queries from "../knowledge/queries.js";
import type * as knowledge_rag from "../knowledge/rag.js";
import type * as knowledge_triggerIngestion from "../knowledge/triggerIngestion.js";
import type * as lib_constraints from "../lib/constraints.js";
import type * as lib_locking from "../lib/locking.js";
import type * as lib_requireAuth from "../lib/requireAuth.js";
import type * as lib_resolveSuiteTests from "../lib/resolveSuiteTests.js";
import type * as lib_runner from "../lib/runner.js";
import type * as lib_validation from "../lib/validation.js";
import type * as logs_mutations from "../logs/mutations.js";
import type * as members_mutations from "../members/mutations.js";
import type * as members_queries from "../members/queries.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as runs_actions from "../runs/actions.js";
import type * as runs_internal from "../runs/internal.js";
import type * as runs_mutations from "../runs/mutations.js";
import type * as runs_queries from "../runs/queries.js";
import type * as schedules_internal from "../schedules/internal.js";
import type * as schedules_mutations from "../schedules/mutations.js";
import type * as schedules_queries from "../schedules/queries.js";
import type * as stagehand_actions from "../stagehand/actions.js";
import type * as stagehand_internal from "../stagehand/internal.js";
import type * as stagehand_lib from "../stagehand/lib.js";
import type * as stories_mutations from "../stories/mutations.js";
import type * as stories_queries from "../stories/queries.js";
import type * as suites_mutations from "../suites/mutations.js";
import type * as suites_queries from "../suites/queries.js";
import type * as testHelpers from "../testHelpers.js";
import type * as test_lists_helpers from "../test_lists/helpers.js";
import type * as test_lists_mutations from "../test_lists/mutations.js";
import type * as test_lists_queries from "../test_lists/queries.js";
import type * as tests_mutations from "../tests/mutations.js";
import type * as tests_queries from "../tests/queries.js";
import type * as users_mutations from "../users/mutations.js";
import type * as workspaces_actions from "../workspaces/actions.js";
import type * as workspaces_mutations from "../workspaces/mutations.js";
import type * as workspaces_queries from "../workspaces/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/agents": typeof ai_agents;
  "ai/aiRateLimit": typeof ai_aiRateLimit;
  "ai/authContext": typeof ai_authContext;
  "ai/browserClient": typeof ai_browserClient;
  "ai/diff": typeof ai_diff;
  "ai/errors": typeof ai_errors;
  "ai/exploreApp": typeof ai_exploreApp;
  "ai/feedbackDiscovery": typeof ai_feedbackDiscovery;
  "ai/formatElements": typeof ai_formatElements;
  "ai/formatPages": typeof ai_formatPages;
  "ai/generateNlTests": typeof ai_generateNlTests;
  "ai/generatePrdTests": typeof ai_generatePrdTests;
  "ai/healTest": typeof ai_healTest;
  "ai/model": typeof ai_model;
  "ai/nlWorkflow": typeof ai_nlWorkflow;
  "ai/nlWorkflowActions": typeof ai_nlWorkflowActions;
  "ai/parse": typeof ai_parse;
  "ai/prdWorkflow": typeof ai_prdWorkflow;
  "ai/prdWorkflowActions": typeof ai_prdWorkflowActions;
  "ai/refineTest": typeof ai_refineTest;
  "ai/resolveContext": typeof ai_resolveContext;
  "ai/snapshotAction": typeof ai_snapshotAction;
  "ai/snapshotFormatter": typeof ai_snapshotFormatter;
  "ai/suiteStatus": typeof ai_suiteStatus;
  "ai/tools/definitions": typeof ai_tools_definitions;
  "ai/tools/logic": typeof ai_tools_logic;
  "ai/tools/queries": typeof ai_tools_queries;
  "ai/workflowShared": typeof ai_workflowShared;
  auth: typeof auth;
  "chat/agents": typeof chat_agents;
  "chat/chatActions": typeof chat_chatActions;
  "chat/impactActions": typeof chat_impactActions;
  "chat/impactAgent": typeof chat_impactAgent;
  "chat/impactPrompts": typeof chat_impactPrompts;
  "chat/impactSchema": typeof chat_impactSchema;
  "chat/internal": typeof chat_internal;
  "chat/mutations": typeof chat_mutations;
  "chat/preview": typeof chat_preview;
  "chat/queries": typeof chat_queries;
  "chat/ragContext": typeof chat_ragContext;
  "chat/storyActions": typeof chat_storyActions;
  "chat/storyAgent": typeof chat_storyAgent;
  "chat/storyPersistence": typeof chat_storyPersistence;
  "chat/storyPrompts": typeof chat_storyPrompts;
  "chat/storySchema": typeof chat_storySchema;
  crons: typeof crons;
  "dashboard/queries": typeof dashboard_queries;
  "environments/mutations": typeof environments_mutations;
  "environments/queries": typeof environments_queries;
  "explorations/actions": typeof explorations_actions;
  "explorations/internal": typeof explorations_internal;
  "explorations/mutations": typeof explorations_mutations;
  "explorations/queries": typeof explorations_queries;
  "files/actions": typeof files_actions;
  "flakiness/actions": typeof flakiness_actions;
  "flakiness/queries": typeof flakiness_queries;
  http: typeof http;
  "insights/queries": typeof insights_queries;
  "knowledge/baselineActions": typeof knowledge_baselineActions;
  "knowledge/baselinePrompts": typeof knowledge_baselinePrompts;
  "knowledge/baselineRdMutations": typeof knowledge_baselineRdMutations;
  "knowledge/bmadActions": typeof knowledge_bmadActions;
  "knowledge/bmadParsing": typeof knowledge_bmadParsing;
  "knowledge/chunking": typeof knowledge_chunking;
  "knowledge/crypto": typeof knowledge_crypto;
  "knowledge/driftActions": typeof knowledge_driftActions;
  "knowledge/driftPrompts": typeof knowledge_driftPrompts;
  "knowledge/embeddingActions": typeof knowledge_embeddingActions;
  "knowledge/extract": typeof knowledge_extract;
  "knowledge/extractionActions": typeof knowledge_extractionActions;
  "knowledge/extractionContext": typeof knowledge_extractionContext;
  "knowledge/extractionPrompts": typeof knowledge_extractionPrompts;
  "knowledge/github": typeof knowledge_github;
  "knowledge/ingestionActions": typeof knowledge_ingestionActions;
  "knowledge/ingestionWorkflow": typeof knowledge_ingestionWorkflow;
  "knowledge/internal": typeof knowledge_internal;
  "knowledge/mutations": typeof knowledge_mutations;
  "knowledge/oldRdActions": typeof knowledge_oldRdActions;
  "knowledge/queries": typeof knowledge_queries;
  "knowledge/rag": typeof knowledge_rag;
  "knowledge/triggerIngestion": typeof knowledge_triggerIngestion;
  "lib/constraints": typeof lib_constraints;
  "lib/locking": typeof lib_locking;
  "lib/requireAuth": typeof lib_requireAuth;
  "lib/resolveSuiteTests": typeof lib_resolveSuiteTests;
  "lib/runner": typeof lib_runner;
  "lib/validation": typeof lib_validation;
  "logs/mutations": typeof logs_mutations;
  "members/mutations": typeof members_mutations;
  "members/queries": typeof members_queries;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "runs/actions": typeof runs_actions;
  "runs/internal": typeof runs_internal;
  "runs/mutations": typeof runs_mutations;
  "runs/queries": typeof runs_queries;
  "schedules/internal": typeof schedules_internal;
  "schedules/mutations": typeof schedules_mutations;
  "schedules/queries": typeof schedules_queries;
  "stagehand/actions": typeof stagehand_actions;
  "stagehand/internal": typeof stagehand_internal;
  "stagehand/lib": typeof stagehand_lib;
  "stories/mutations": typeof stories_mutations;
  "stories/queries": typeof stories_queries;
  "suites/mutations": typeof suites_mutations;
  "suites/queries": typeof suites_queries;
  testHelpers: typeof testHelpers;
  "test_lists/helpers": typeof test_lists_helpers;
  "test_lists/mutations": typeof test_lists_mutations;
  "test_lists/queries": typeof test_lists_queries;
  "tests/mutations": typeof tests_mutations;
  "tests/queries": typeof tests_queries;
  "users/mutations": typeof users_mutations;
  "workspaces/actions": typeof workspaces_actions;
  "workspaces/mutations": typeof workspaces_mutations;
  "workspaces/queries": typeof workspaces_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  stagehand: import("@browserbasehq/convex-stagehand/_generated/component.js").ComponentApi<"stagehand">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
};
