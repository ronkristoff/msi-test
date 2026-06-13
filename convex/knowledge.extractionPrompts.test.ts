/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

describe("extractionPrompts: zod schemas", () => {
  it("architectureSchema validates correct shape", async () => {
    const { architectureSchema } = await import("./knowledge/extractionPrompts");
    const result = architectureSchema.safeParse({
      architecture_summary: "A monolithic app",
      tech_stack: ["Next.js", "Convex"],
      folder_structure: "src/",
      architecture_type: "monolith",
    });
    expect(result.success).toBe(true);
  });

  it("architectureSchema rejects missing fields", async () => {
    const { architectureSchema } = await import("./knowledge/extractionPrompts");
    const result = architectureSchema.safeParse({
      architecture_summary: "Missing fields",
    });
    expect(result.success).toBe(false);
  });

  it("moduleSchema validates a module with all fields", async () => {
    const { moduleSchema } = await import("./knowledge/extractionPrompts");
    const result = moduleSchema.safeParse({
      modules: [
        {
          name: "auth",
          description: "Authentication module",
          file_count: 5,
          files: ["src/auth/login.ts"],
          dependencies: ["users"],
          apis: [{ path: "/api/login", method: "POST", description: "Login", request_shape: {}, response_shape: {} }],
          data_models: [{ name: "Session", type: "table", fields: {}, relationships: [] }],
          user_flows: [{ name: "Login", route: "/login", description: "User logs in", components: ["LoginForm"] }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("moduleSchema accepts modules with minimal fields", async () => {
    const { moduleSchema } = await import("./knowledge/extractionPrompts");
    const result = moduleSchema.safeParse({
      modules: [{ name: "core" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("extractionPrompts: buildArchitectureExtractionPrompt", () => {
  it("includes file tree and sampled code in prompt", async () => {
    const { buildArchitectureExtractionPrompt } = await import("./knowledge/extractionPrompts");
    const prompt = buildArchitectureExtractionPrompt({
      fileTree: "src/\n  index.ts\n  app/\n    page.tsx",
      sampledCode: "import { app } from './app';",
      bmadContext: null,
    });
    expect(prompt).toContain("src/");
    expect(prompt).toContain("index.ts");
    expect(prompt).toContain("import { app }");
  });

  it("does not include BMAD context when null", async () => {
    const { buildArchitectureExtractionPrompt } = await import("./knowledge/extractionPrompts");
    const prompt = buildArchitectureExtractionPrompt({
      fileTree: "src/",
      sampledCode: "code",
      bmadContext: null,
    });
    expect(prompt).not.toContain("BMAD");
    expect(prompt).not.toContain("PRD");
  });

  it("includes BMAD context when provided", async () => {
    const { buildArchitectureExtractionPrompt } = await import("./knowledge/extractionPrompts");
    const prompt = buildArchitectureExtractionPrompt({
      fileTree: "src/",
      sampledCode: "code",
      bmadContext: {
        prdSections: "## Overview\nThis is a test tool",
        adrs: "ADR 001: Use Convex",
      },
    });
    expect(prompt).toContain("BMAD");
    expect(prompt).toContain("This is a test tool");
  });
});

describe("extractionPrompts: buildModuleExtractionPrompt", () => {
  it("includes architecture summary and directory structure", async () => {
    const { buildModuleExtractionPrompt } = await import("./knowledge/extractionPrompts");
    const prompt = buildModuleExtractionPrompt({
      architectureSummary: {
        architecture_summary: "Monolith with API routes",
        tech_stack: ["Next.js"],
        folder_structure: "src/app/",
        architecture_type: "monolith",
      },
      directoryStructure: "src/auth/\n  login.ts\nsrc/api/\n  routes.ts",
      sampledCode: "export function login() {}",
      bmadContext: null,
    });
    expect(prompt).toContain("Monolith with API routes");
    expect(prompt).toContain("src/auth/");
    expect(prompt).toContain("export function login");
  });

  it("does not include BMAD context when null", async () => {
    const { buildModuleExtractionPrompt } = await import("./knowledge/extractionPrompts");
    const prompt = buildModuleExtractionPrompt({
      architectureSummary: {
        architecture_summary: "Test",
        tech_stack: [],
        folder_structure: "",
        architecture_type: "monolith",
      },
      directoryStructure: "",
      sampledCode: "",
      bmadContext: null,
    });
    expect(prompt).not.toContain("BMAD");
  });
});
