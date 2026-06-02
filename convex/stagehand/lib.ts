"use node";

import { Stagehand } from "@browserbasehq/convex-stagehand";
import { components } from "../_generated/api";

export function isBrowserbaseConfigured(): boolean {
  return !!(
    process.env.BROWSERBASE_API_KEY &&
    process.env.BROWSERBASE_PROJECT_ID &&
    process.env.MODEL_API_KEY
  );
}

export function createStagehand(): Stagehand {
  return new Stagehand(components.stagehand, {
    browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
    browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID!,
    modelApiKey: process.env.MODEL_API_KEY!,
  });
}

export type UnavailableResult = { available: false; reason: string };

export type GuardResult =
  | { ok: true; stagehand: Stagehand }
  | { ok: false; result: UnavailableResult };
