export const PRESETS: Record<string, { url: string; model: string }> = {
  openai: { url: "https://api.openai.com/v1", model: "gpt-4o" },
  azure: { url: "https://YOUR_RESOURCE.openai.azure.com/v1", model: "gpt-4o" },
  anthropic: { url: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-20241022" },
  ollama: { url: "http://localhost:11434/v1", model: "llama3.2" },
  deepseek: { url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
};

export const MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "o1-preview",
  "o1-mini",
  "custom",
];
