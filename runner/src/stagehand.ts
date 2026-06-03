import { Stagehand, LLMClient } from "@browserbasehq/stagehand";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, NoObjectGeneratedError } from "ai";
import type { AiConfig } from "../../convex/ai/model";
import type {
  ChatCompletionOptions,
  CreateChatCompletionOptions,
  LLMResponse,
  LLMParsedResponse,
} from "@browserbasehq/stagehand";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatMessagePart[];
};

type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string };

class ZAiClient extends LLMClient {
  type = "openai" as const;
  hasVision = true;

  private model;

  constructor(modelName: string, model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>) {
    super(modelName);
    this.model = model;
  }

  getLanguageModel() {
    return this.model;
  }

  async createChatCompletion<T>(
    opts: CreateChatCompletionOptions,
  ): Promise<T extends { response_model: unknown } ? LLMParsedResponse<T> : LLMResponse> {
    const { options } = opts;
    const messages = this.formatMessages(options.messages);

    if (options.response_model) {
      try {
        const result = await generateObject({
          model: this.model,
          messages,
          schema: options.response_model.schema as Parameters<typeof generateObject>[0]["schema"],
          temperature: options.temperature,
        });
        return { data: result.object as T, usage: { prompt_tokens: result.usage.promptTokens, completion_tokens: result.usage.completionTokens, total_tokens: result.usage.promptTokens + result.usage.completionTokens } } as unknown as Promise<LLMParsedResponse<T>>;
      } catch (err) {
        if (!(err instanceof NoObjectGeneratedError) && !(err instanceof SyntaxError)) throw err;
        const schemaStr = JSON.stringify(options.response_model.schema);
        const fallbackMessages = [...messages, {
          role: "user" as const,
          content: `Respond in this JSON schema format:\n${schemaStr}\n\nYou must respond in JSON format. Do not include any other text, formatting or markdown. Do not include \`\`\` or \`\`\`json. Only the JSON object itself.`,
        }];
        const textResult = await generateText({ model: this.model, messages: fallbackMessages, temperature: options.temperature });
        const text = textResult.text?.trim() ?? "";
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const jsonStart = cleaned.indexOf("{");
        if (jsonStart === -1) {
          throw new Error(`Failed to extract JSON from model response`);
        }
        let depth = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < cleaned.length; i++) {
          if (cleaned[i] === "{") depth++;
          if (cleaned[i] === "}") depth--;
          if (depth === 0) { jsonEnd = i; break; }
        }
        if (jsonEnd === -1) {
          throw new Error(`Failed to extract JSON from model response`);
        }
        const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
        return { data: parsed as T, usage: { prompt_tokens: textResult.usage.promptTokens ?? 0, completion_tokens: textResult.usage.completionTokens ?? 0, total_tokens: (textResult.usage.promptTokens ?? 0) + (textResult.usage.completionTokens ?? 0) } } as unknown as Promise<LLMParsedResponse<T>>;
      }
    }

    const tools: Record<string, { description: string; parameters: unknown }> = {};
    if (options.tools) {
      for (const tool of options.tools) {
        tools[tool.name] = { description: tool.description, parameters: tool.parameters };
      }
    }

    const result = await generateText({
      model: this.model,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      toolChoice: Object.keys(tools).length > 0
        ? options.tool_choice === "required" ? "required" : options.tool_choice === "none" ? "none" : "auto"
        : undefined,
      temperature: options.temperature,
    });

    const response: LLMResponse = {
      id: `chatcmpl_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: this.model.modelId,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: result.text || null,
          tool_calls: (result.toolCalls || []).map((tc) => ({
            id: tc.toolCallId || `call_${Date.now()}`,
            type: "function" as const,
            function: { name: tc.toolName, arguments: JSON.stringify(tc.args) },
          })),
        },
        finish_reason: result.finishReason || "stop",
      }],
      usage: {
        prompt_tokens: result.usage.promptTokens ?? 0,
        completion_tokens: result.usage.completionTokens ?? 0,
        total_tokens: (result.usage.promptTokens ?? 0) + (result.usage.completionTokens ?? 0),
      },
    };

    return response as unknown as Promise<T>;
  }

  private formatMessages(messages: ChatCompletionOptions["messages"]): ChatMessage[] {
    return messages.map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        const parts: ChatMessagePart[] = msg.content.map((c) => {
          if ("image_url" in c && c.image_url) {
            return { type: "image" as const, image: c.image_url.url };
          }
          return { type: "text" as const, text: c.text || "" };
        });
        if (msg.role === "system") {
          return { role: msg.role, content: parts.map((p) => p.type === "text" ? p.text : "[Image]").join("\n") };
        }
        return { role: msg.role, content: parts };
      }
      return { role: msg.role, content: msg.content };
    });
  }
}

export type StagehandInstance = Stagehand;
export type { AiConfig as WorkspaceAiConfig };

export function initStagehandConfig(config: AiConfig, cacheDir?: string) {
  return {
    env: "LOCAL" as const,
    experimental: true,
    disableAPI: true,
    verbose: 1 as const,
    disablePino: true,
    cacheDir,
    localBrowserLaunchOptions: {
      headless: true,
    },
  };
}

export async function initStagehand(
  config: AiConfig,
  log: (msg: string) => void,
  cacheDir?: string,
): Promise<Stagehand> {
  const modelName = config.stagehand_model_name || config.model_name;
  const stagehandConfig = initStagehandConfig(config, cacheDir);
  const cacheLog = cacheDir ? `, cacheDir=${cacheDir}` : "";
  log(`Initializing Stagehand with model=${modelName}, endpoint=${config.endpoint_url}${cacheLog}`);

  const provider = createOpenAI({
    apiKey: config.api_key,
    baseURL: config.endpoint_url,
  });

  const stagehand = new Stagehand({
    ...stagehandConfig,
    llmClient: new ZAiClient(modelName, provider.chat(modelName)),
  });

  await stagehand.init();
  return stagehand;
}
