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
import type * as ai_errors from "../ai/errors.js";
import type * as ai_exploreApp from "../ai/exploreApp.js";
import type * as ai_generateNlTests from "../ai/generateNlTests.js";
import type * as ai_generatePrdTests from "../ai/generatePrdTests.js";
import type * as ai_model from "../ai/model.js";
import type * as ai_regenerateTest from "../ai/regenerateTest.js";
import type * as ai_tools_definitions from "../ai/tools/definitions.js";
import type * as ai_tools_logic from "../ai/tools/logic.js";
import type * as ai_tools_queries from "../ai/tools/queries.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as environments_mutations from "../environments/mutations.js";
import type * as environments_queries from "../environments/queries.js";
import type * as explorations_actions from "../explorations/actions.js";
import type * as explorations_internal from "../explorations/internal.js";
import type * as explorations_mutations from "../explorations/mutations.js";
import type * as explorations_queries from "../explorations/queries.js";
import type * as files_actions from "../files/actions.js";
import type * as http from "../http.js";
import type * as lib_constraints from "../lib/constraints.js";
import type * as lib_requireAuth from "../lib/requireAuth.js";
import type * as lib_runner from "../lib/runner.js";
import type * as lib_validation from "../lib/validation.js";
import type * as logs_mutations from "../logs/mutations.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as runs_actions from "../runs/actions.js";
import type * as runs_internal from "../runs/internal.js";
import type * as runs_mutations from "../runs/mutations.js";
import type * as runs_queries from "../runs/queries.js";
import type * as suites_mutations from "../suites/mutations.js";
import type * as suites_queries from "../suites/queries.js";
import type * as testHelpers from "../testHelpers.js";
import type * as tests_mutations from "../tests/mutations.js";
import type * as tests_queries from "../tests/queries.js";
import type * as users_mutations from "../users/mutations.js";
import type * as workspaces_mutations from "../workspaces/mutations.js";
import type * as workspaces_queries from "../workspaces/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/agents": typeof ai_agents;
  "ai/errors": typeof ai_errors;
  "ai/exploreApp": typeof ai_exploreApp;
  "ai/generateNlTests": typeof ai_generateNlTests;
  "ai/generatePrdTests": typeof ai_generatePrdTests;
  "ai/model": typeof ai_model;
  "ai/regenerateTest": typeof ai_regenerateTest;
  "ai/tools/definitions": typeof ai_tools_definitions;
  "ai/tools/logic": typeof ai_tools_logic;
  "ai/tools/queries": typeof ai_tools_queries;
  auth: typeof auth;
  crons: typeof crons;
  "dashboard/queries": typeof dashboard_queries;
  "environments/mutations": typeof environments_mutations;
  "environments/queries": typeof environments_queries;
  "explorations/actions": typeof explorations_actions;
  "explorations/internal": typeof explorations_internal;
  "explorations/mutations": typeof explorations_mutations;
  "explorations/queries": typeof explorations_queries;
  "files/actions": typeof files_actions;
  http: typeof http;
  "lib/constraints": typeof lib_constraints;
  "lib/requireAuth": typeof lib_requireAuth;
  "lib/runner": typeof lib_runner;
  "lib/validation": typeof lib_validation;
  "logs/mutations": typeof logs_mutations;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "runs/actions": typeof runs_actions;
  "runs/internal": typeof runs_internal;
  "runs/mutations": typeof runs_mutations;
  "runs/queries": typeof runs_queries;
  "suites/mutations": typeof suites_mutations;
  "suites/queries": typeof suites_queries;
  testHelpers: typeof testHelpers;
  "tests/mutations": typeof tests_mutations;
  "tests/queries": typeof tests_queries;
  "users/mutations": typeof users_mutations;
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
};
