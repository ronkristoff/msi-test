import type { Doc } from "./convex";

export type WorkspaceMasked = Omit<Doc<"workspaces">, "ai_config"> & {
  ai_config: Omit<Doc<"workspaces">["ai_config"], "api_key"> & {
    api_key_masked: string;
  };
};
