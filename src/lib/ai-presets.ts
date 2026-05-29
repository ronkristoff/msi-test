export type PresetConfig = {
  label: string;
  url: string;
  model: string;
  models: string[];
};

export const PRESETS: Record<string, PresetConfig> = {
  "z.ai": {
    label: "Z.AI",
    url: "https://api.z.ai/api/coding/paas/v4",
    model: "glm-5.1",
    models: ["glm-5.1", "glm-5", "glm-5-turbo", "glm-4.7", "glm-4.5-air"],
  },
  openai: {
    label: "Openai",
    url: "https://api.openai.com/v1",
    model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
  },
  azure: {
    label: "Azure",
    url: "https://YOUR_RESOURCE.openai.azure.com/v1",
    model: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  anthropic: {
    label: "Anthropic",
    url: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-20241022",
    models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
  },
  ollama: {
    label: "Ollama",
    url: "http://localhost:11434/v1",
    model: "llama3.2",
    models: ["llama3.2", "llama3.1", "mistral", "codellama", "phi3"],
  },
  deepseek: {
    label: "Deepseek",
    url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
};

export function findPresetByUrl(endpoint: string): string | null {
  return Object.entries(PRESETS).find(([, p]) => p.url === endpoint)?.[0] ?? null;
}

export function hasAiConfig(workspace?: {
  ai_config?: { endpoint_url?: string; model_name?: string; api_key_masked?: string };
} | null): boolean {
  return !!(
    workspace?.ai_config?.endpoint_url &&
    workspace?.ai_config?.model_name &&
    workspace?.ai_config?.api_key_masked
  );
}
