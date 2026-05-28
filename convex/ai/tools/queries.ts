import { internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import {
  readExistingTestsLogic,
  readProjectContextLogic,
  readTestCodeLogic,
} from "./logic";

export const readExistingTestsQuery = internalQuery({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => readExistingTestsLogic(ctx, args.suite_id),
});

export const readProjectContextQuery = internalQuery({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => readProjectContextLogic(ctx, args.project_id),
});

export const readTestCodeQuery = internalQuery({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => readTestCodeLogic(ctx, args.test_id),
});
