import { Stagehand } from "@browserbasehq/stagehand";
import type { AiConfig } from "../../convex/ai/model";

export type { AiConfig as WorkspaceAiConfig };

export function createStagehandConfig(config: AiConfig) {
  const modelName = config.stagehand_model_name || config.model_name;

  return {
    env: "LOCAL" as const,
    model: {
      modelName,
      apiKey: config.api_key,
      baseURL: config.endpoint_url,
    },
    verbose: 0 as const,
    disablePino: true,
  };
}

export async function initStagehand(config: AiConfig, log: (msg: string) => void): Promise<Stagehand> {
  const stagehandConfig = createStagehandConfig(config);
  log(`Initializing Stagehand with model=${stagehandConfig.model.modelName}, endpoint=${config.endpoint_url}`);

  const stagehand = new Stagehand(stagehandConfig);
  await stagehand.init();
  return stagehand;
}
