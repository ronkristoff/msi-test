import { z } from "zod";

export const architectureSchema = z.object({
  architecture_summary: z.string(),
  tech_stack: z.array(z.string()),
  folder_structure: z.string(),
  architecture_type: z.string(),
});

const moduleObjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  file_count: z.number().optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  apis: z.any().optional(),
  data_models: z.any().optional(),
  user_flows: z.any().optional(),
});

export const moduleSchema = z.object({
  modules: z.array(moduleObjectSchema),
});

export type ArchitectureExtractionContext = {
  fileTree: string;
  sampledCode: string;
  bmadContext: BmadContext | null;
};

export type ModuleExtractionContext = {
  architectureSummary: {
    architecture_summary: string;
    tech_stack: string[];
    folder_structure: string;
    architecture_type: string;
  };
  directoryStructure: string;
  sampledCode: string;
  bmadContext: BmadContext | null;
};

export type BmadContext = {
  prdSections: string;
  adrs: string;
};

export function buildArchitectureExtractionPrompt(
  context: ArchitectureExtractionContext,
): string {
  const bmadSection = context.bmadContext
    ? `\n## BMAD Project Context (Reference Only)\n\n### PRD Sections:\n${context.bmadContext.prdSections}\n\n### Architectural Decision Records:\n${context.bmadContext.adrs}\n`
    : "";

  return `You are a senior software architect analyzing a codebase to extract its architecture.

## File Tree
${context.fileTree}

## Sampled Code (first chunk per file)
${context.sampledCode}
${bmadSection}
## Task
Analyze the file tree and sampled code above. Extract:
1. **architecture_summary**: A 2-3 paragraph description of the overall architecture, including how the codebase is organized, the main patterns used, and how data flows.
2. **tech_stack**: An array of technologies, frameworks, libraries, and tools used. Be specific (e.g., "Next.js 16", "Convex", "React 19", "Tailwind CSS v4").
3. **folder_structure**: A concise text description of the directory layout and what each major directory contains.
4. **architecture_type**: The architectural pattern (e.g., "monolith", "microservices", "serverless", "fullstack-app", "library", "monorepo").

Focus on accuracy. Only include technologies you can verify from the code or configuration files.`;
}

export function buildModuleExtractionPrompt(
  context: ModuleExtractionContext,
): string {
  const bmadSection = context.bmadContext
    ? `\n## BMAD Project Context (Reference Only)\n\n### PRD Sections:\n${context.bmadContext.prdSections}\n\n### ADRs:\n${context.bmadContext.adrs}\n`
    : "";

  const arch = context.architectureSummary;

  return `You are a senior software architect identifying major code modules in a codebase.

## Architecture Summary
- **Type**: ${arch.architecture_type}
- **Tech Stack**: ${arch.tech_stack.join(", ")}
- **Summary**: ${arch.architecture_summary}
- **Folder Structure**: ${arch.folder_structure}

## Directory Structure
${context.directoryStructure}

## Sampled Code (first chunk per file)
${context.sampledCode}
${bmadSection}
## Task
Identify the major code modules in this codebase. A module is a cohesive group of files that serve a specific purpose (e.g., "authentication", "billing", "test-runner", "UI components").

For each module, extract:
1. **name**: Short module name (kebab-case, e.g., "auth", "billing")
2. **description**: 1-2 sentence description of what this module does
3. **file_count**: Number of files in this module
4. **files**: Array of file paths belonging to this module
5. **dependencies**: Array of OTHER module names this module depends on (use names, not IDs)
6. **apis**: Array of API endpoints with { path, method, description, request_shape, response_shape }
7. **data_models**: Array of database schemas/entities with { name, type, fields, relationships }
8. **user_flows**: Array of user-facing flows with { name, route, description, components }

Only identify modules that genuinely exist. Do not invent modules for trivial directories. Aim for 3-15 modules for typical codebases.`;
}
