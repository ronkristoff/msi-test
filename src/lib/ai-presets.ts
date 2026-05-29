export const PRESETS: Record<string, { url: string; model: string }> = {
  "z.ai": { url: "https://api.z.ai/api/coding/paas/v4", model: "glm-5.1" },
  openai: { url: "https://api.openai.com/v1", model: "gpt-4o" },
  azure: { url: "https://YOUR_RESOURCE.openai.azure.com/v1", model: "gpt-4o" },
  anthropic: { url: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-20241022" },
  ollama: { url: "http://localhost:11434/v1", model: "llama3.2" },
  deepseek: { url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
};

export const MODELS = [
  "glm-5.1",
  "glm-5",
  "glm-5-turbo",
  "glm-4.7",
  "glm-4.5-air",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "o1-preview",
  "o1-mini",
  "custom",
];

export function hasAiConfig(workspace?: {
  ai_config?: { endpoint_url?: string; model_name?: string; api_key_masked?: string };
} | null): boolean {
  return !!(
    workspace?.ai_config?.endpoint_url &&
    workspace?.ai_config?.model_name &&
    workspace?.ai_config?.api_key_masked
  );
}
