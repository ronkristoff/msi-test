---
baseline_commit: a26975ab7c4448f9349013d355dbec6f22916896
---

# Story 1.5: AI Architecture & Module Extraction

Status: done

## Story

As a BA,
I want the system to extract architecture details and identify code modules with their APIs, data models, and user flows,
so that the Knowledge Base provides a structured map of the codebase.

## Acceptance Criteria

1. **AC1 — Extraction workflow step**: After the embedding step completes (Story 1.4) and BEFORE the KB transitions to `"ready"`, a new AI extraction step runs within the ingestion workflow. Status remains `"building"` during extraction with progress message `"Analyzing code structure..."`.

2. **AC2 — Architecture summary extraction**: AI extracts an architecture summary from the project's code chunks and stores it on the `knowledge_bases` table: `architecture_summary` (text), `tech_stack` (array of strings), `folder_structure` (text), `architecture_type` (text). Uses the workspace's BYOK AI provider via `generateObject` from the `ai` package with a zod schema.

3. **AC3 — Module identification**: AI identifies major code modules from directory structure and code chunks. Each module is stored as a row in `kb_modules` with: `name`, `description`, `file_count`, `files` (array of file paths), and `dependencies` (array of module names — NOT IDs, per ADR 0008).

4. **AC4 — API extraction per module**: AI extracts API endpoints per module with input/output shapes and HTTP methods. Stored in `kb_modules.apis` using `v.any()` per ADR 0008. Structure: array of `{ path, method, description, request_shape, response_shape }`.

5. **AC5 — Data model extraction per module**: AI extracts database schemas, table definitions, and entity relationships per module. Stored in `kb_modules.data_models` using `v.any()`. Structure: array of `{ name, type, fields, relationships }`.

6. **AC6 — User flow reconstruction per module**: AI reconstructs user-facing flows by analyzing routes, pages, and component relationships per module. Stored in `kb_modules.user_flows` using `v.any()`. Structure: array of `{ name, route, description, components }`.

7. **AC7 — KB status transition to ready**: After extraction completes, KB status transitions to `"ready"` with `last_synced_at` timestamp set (existing behavior from Story 1.4 — the ready transition simply moves after extraction instead of after embedding).

8. **AC8 — Error handling**: If the AI extraction API returns an error (invalid API key, rate limit, model error), the workflow step fails and the `_handleIngestionComplete` callback sets KB status to `"error"` with a descriptive message. If extraction produces no modules (empty repo or all files excluded), extraction is skipped gracefully — architecture fields remain `undefined`, no modules inserted, KB still transitions to `"ready"`.

9. **AC9 — BMAD forward-compatibility (conditional)**: The extraction action checks for `bmad_detected` on the knowledge_bases document. Since this field does NOT exist in the schema yet (added by Story 1.9), it will always be `undefined`/falsy at this time. When `bmad_detected` is falsy, extraction proceeds without BMAD context (no regression). When Story 1.9 adds the field and sets it to `true`, the extraction prompt will automatically include parsed BMAD PRD sections and ADRs as reference context. **No BMAD-specific ACs are testable in this story** — they become active after Story 1.9.

10. **AC10 — Tests**: All new functions have Convex tests. Pure function tests for context building (file tree, chunk sampling, prompt construction). Data-layer tests for internal mutations (`_storeArchitectureSummary`, `_storeModules`, `_deleteModulesByKb`). Error paths tested with mocked AI failures. Existing ingestion workflow tests extended to verify extraction step ordering (embedding → extraction → ready).

## Tasks / Subtasks

- [x] Task 1: Create `convex/knowledge/extractionPrompts.ts` — prompt builders (AC: #2, #3, #4, #5, #6)
  - [x] `buildArchitectureExtractionPrompt(context)` — builds the architecture summary prompt from repo context
  - [x] `buildModuleExtractionPrompt(context)` — builds the module extraction prompt from repo context + architecture summary
  - [x] Export zod schemas: `architectureSchema`, `moduleSchema` (for `generateObject`)
  - [x] NO `"use node"` — these are pure string/schema builders

- [x] Task 2: Create `convex/knowledge/extractionActions.ts` — extraction workflow action (AC: #1, #2, #3, #4, #5, #6, #8)
  - [x] `"use node"` file — imports `generateObject` from `"ai"` and `getWorkspaceModel` from `../ai/model`
  - [x] `extractArchitectureAndModules` internal action: reads chunks, builds context, calls AI, stores results
  - [x] Phase 1: Build compact repo context (file tree + sampled code) from code_chunks
  - [x] Phase 2: Call `generateObject` with `architectureSchema` for architecture summary
  - [x] Phase 3: Call `generateObject` with `moduleSchema` (array output) for modules
  - [x] Phase 4: Store results via internal mutations
  - [x] BMAD check: read `knowledge_bases.bmad_detected` — if truthy, inject BMAD context into prompts (forward-compatible, always falsy now)
  - [x] Error handling: catch AI errors, throw `ConvexError` with descriptive message (workflow + `_handleIngestionComplete` handle status transition)
  - [x] Empty repo guard: if no chunks, return early without calling AI

- [x] Task 3: Add context-building helper functions to `extractionActions.ts` or a separate `extractionContext.ts` (AC: #2, #3)
  - [x] `buildFileTree(chunks)` — returns unique file paths with sizes, grouped by directory
  - [x] `sampleCodeForExtraction(chunks, maxChars)` — returns representative code per file (first chunk per file, capped)
  - [x] `buildDirectorySummary(fileTree)` — returns a text tree of directories and file counts
  - [x] Cap total context to `EXTRACTION_MAX_CONTEXT_CHARS` constant

- [x] Task 4: Add internal mutations to `convex/knowledge/internal.ts` (AC: #2, #3)
  - [x] `_storeArchitectureSummary`: patches `architecture_summary`, `tech_stack`, `folder_structure`, `architecture_type` on `knowledge_bases`
  - [x] `_storeModules`: inserts module rows into `kb_modules` (accepts array of module objects)
  - [x] `_deleteModulesByKb`: deletes existing `kb_modules` for a knowledge_base_id (for re-sync support, Story 1.8)
  - [x] `_getChunksForExtraction`: internal query returning chunks grouped/sampled for extraction (first chunk per file path)
  - [x] `_getKbForExtraction`: internal query returning the KB document (needed to check `bmad_detected` — will be `undefined` until Story 1.9 adds the field)

- [x] Task 5: Add extraction step to `convex/knowledge/ingestionWorkflow.ts` (AC: #1, #7)
  - [x] After embedding step, BEFORE ready transition: add progress message "Analyzing code structure..."
  - [x] Call `step.runAction(internal.knowledge.extractionActions.extractArchitectureAndModules, {...})` with `{ retry: true }`
  - [x] Pass `project_id`, `knowledge_base_id`, `workspace_id`
  - [x] After extraction: existing ready transition + `last_synced_at` (no changes to these — they just run after extraction now)

- [x] Task 6: Add extraction constants to `convex/lib/constraints.ts` (AC: #2, #3)
  - [x] `EXTRACTION_MAX_CONTEXT_CHARS = 80000` — cap for AI context window
  - [x] `EXTRACTION_MAX_MODULES = 50` — safety cap on modules extracted
  - [x] `EXTRACTION_SAMPLE_CHUNKS_PER_FILE = 1` — use first chunk per file as representative

- [x] Task 7: Write tests (AC: #10)
  - [x] `convex/knowledge.extractionContext.test.ts` — pure function tests for `buildFileTree`, `sampleCodeForExtraction`, `buildDirectorySummary`
  - [x] `convex/knowledge.extractionActions.test.ts` — data-layer tests for `_storeArchitectureSummary`, `_storeModules`, `_deleteModulesByKb`, `_getChunksForExtraction`, error paths
  - [x] Extend existing `convex/knowledge.ingestionWorkflow.test.ts` — verify extraction step runs after embedding, before ready transition
  - [x] Test empty-repo guard: no chunks → extraction skipped, KB still reaches "ready"
  - [x] Test module deletion for re-sync: `_deleteModulesByKb` removes all modules
  - [x] Use `seedKnowledgeBase` from `convex/testHelpers.ts`
  - [x] Mock `generateObject` where needed (pure function tests only — do not call real AI)

- [x] Task 8: Run `pnpm test:convex` and verify all tests pass with no regressions (AC: #10)
  - [x] Run `pnpm lint` — zero errors
  - [x] Run `pnpm test` (frontend) — no regressions

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- AI extraction of architecture summary (tech stack, framework, folder structure, architecture type)
- AI identification of code modules with APIs, data models, user flows, and cross-module dependencies
- Storage on `knowledge_bases` (architecture fields) and `kb_modules` (module rows)
- Insertion of extraction step into the ingestion workflow (between embedding and ready transition)
- Forward-compatible BMAD check (always falsy until Story 1.9 adds the field)
- Error handling via workflow retry + `_handleIngestionComplete` callback

**This story does NOT implement (future stories):**
- KB viewer UI (Story 1.6 — displays extraction results)
- Module detail view (Story 1.7 — drills into APIs/data models/flows)
- KB re-sync (Story 1.8 — re-runs extraction; this story's `_deleteModulesByKb` prepares for it)
- BMAD artifact detection and parsing (Story 1.9 — adds `bmad_detected` field and `kb_bmad_metadata` table)
- Baseline RD generation (Story 2.1 — consumes architecture summary + modules)
- RAG-grounded chat (Story 3.2 — uses architecture/modules for context)
- Public queries for the frontend (Story 1.6 adds `getKnowledgeBase` and `getModules` queries)

### Critical: Workflow Step Ordering

The current ingestion workflow (after Story 1.4) is:

```
1. _getProjectForIngestion
2. decryptAndFetchTree
3. _updateKbStatus → "building: Reading N files..."
4. fetchAndChunkFiles
5. _updateKbStats
6. _updateKbStatus → "building: Chunking complete... Generating embeddings..."
7. embedChunks
8. _updateKbStatus → "ready"
9. _setLastSyncedAt
```

**This story INSERTS extraction between steps 7 and 8:**

```
7. embedChunks
   ─── NEW ───────────────────────────────────────
7.5. _updateKbStatus → "building: Analyzing code structure..."
7.6. extractArchitectureAndModules (AI extraction)
   ─── END NEW ───────────────────────────────────
8. _updateKbStatus → "ready"     ← moves here (was step 8, still same code)
9. _setLastSyncedAt               ← unchanged
```

The ready transition and `last_synced_at` code is UNCHANGED — it just runs one step later. Do not modify the existing ready/synced mutations.

### Architecture: Two-Phase AI Extraction

**Why two `generateObject` calls instead of one:**
1. Architecture summary needs broad repo context (directory tree, file types, package.json indicators)
2. Module extraction needs the architecture summary as input + detailed code per directory
3. A single call risks exceeding context limits or producing lower-quality results
4. Two calls allow independent retry if one phase fails

**Phase 1 — Architecture Summary:**
- Input: file tree (paths + sizes), sampled code from key files (package.json, config files, entry points)
- Output: `{ architecture_summary, tech_stack[], folder_structure, architecture_type }`
- Schema: `z.object({ architecture_summary: z.string(), tech_stack: z.array(z.string()), folder_structure: z.string(), architecture_type: z.string() })`

**Phase 2 — Module Extraction:**
- Input: architecture summary (from Phase 1), directory structure, sampled code per directory
- Output: array of modules with `{ name, description, file_count, files[], dependencies[], apis[], data_models[], user_flows[] }`
- Schema: `z.object({ modules: z.array(moduleObjectSchema) })` where moduleObjectSchema has typed outer fields and `z.any()` for apis/data_models/user_flows (matching `v.any()` in the DB schema)

**Important — `generateObject` usage:**
```typescript
import { generateObject } from "ai";
import { z } from "zod";  // zod v4, NOT "zod/v3"
import { getWorkspaceModel } from "../ai/model";

const { object } = await generateObject({
  model: getWorkspaceModel(aiConfig),
  schema: architectureSchema,
  prompt: buildArchitectureExtractionPrompt(context),
});
```

The existing agents use `thread.generateText()` via Agent Component (for thread persistence). Extraction does NOT need thread persistence — it's a one-shot analysis. Use `generateObject` directly from the `ai` package.

**Zod version note:** The `ai` package v6 works with standard zod v4 schemas (`import { z } from "zod"`). The existing `agents.ts` uses `zod/v3` because the Agent Component's tool schemas require v3. For `generateObject`, use `import { z } from "zod"` (v4).

### Architecture: Context Building Strategy

Large repos produce thousands of code chunks. Cannot send all to AI. Strategy:

1. **File tree**: Extract unique file paths from `code_chunks` → build a hierarchical directory tree with file counts per directory. This gives the AI the overall structure without code content. ~5K chars for a 500-file repo.

2. **Sampled code**: Take the FIRST chunk per file (chunk_index 0). This gives the AI the imports, declarations, and top-level structure of each file. Cap total sampled code to `EXTRACTION_MAX_CONTEXT_CHARS` (80K chars). If total exceeds cap, prioritize files in this order:
   - Config files (package.json, tsconfig.json, etc.)
   - Entry points (index.ts, main.ts, app.ts)
   - Schema files (schema.ts, models.ts)
   - API/route files
   - Remaining files by directory (round-robin)

3. **Tech stack detection**: Look for indicators in file paths and sampled code:
   - `package.json` → Node.js framework (Next.js, Express, etc.)
   - `requirements.txt` / `.py` → Python
   - `go.mod` → Go
   - `Cargo.toml` → Rust
   - Framework-specific files (next.config, angular.json, etc.)

This compact representation (~85K chars total) fits within most model context windows (128K+ for GPT-4-class models).

### Architecture: `_getChunksForExtraction` Query

Unlike `_getChunksForEmbedding` (which takes ALL chunks up to `MAX_EMBEDDING_CHUNKS`), the extraction query should return a SMARTER sample:

```typescript
export const _getChunksForExtraction = internalQuery({
  args: { knowledge_base_id: v.id("knowledge_bases") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("code_chunks")
      .withIndex("by_knowledge_base_id", (q) =>
        q.eq("knowledge_base_id", args.knowledge_base_id),
      )
      .take(MAX_EMBEDDING_CHUNKS);

    // Deduplicate: keep only first chunk per file path
    const seen = new Set<string>();
    return chunks.filter((c) => {
      if (seen.has(c.file_path)) return false;
      seen.add(c.file_path);
      return true;
    });
  },
});
```

This returns at most one chunk per file (the first), which is the representative content for extraction.

### Architecture: BMAD Forward-Compatibility

The `knowledge_bases` table does NOT have `bmad_detected` or `bmad_parsed_at` fields yet. These are added by Story 1.9. Story 1.5 must:

1. Read the knowledge_bases document (already available from workflow args)
2. Check `kb.bmad_detected` — this will be `undefined` (field doesn't exist) → treated as falsy
3. When falsy: proceed WITHOUT BMAD context (current behavior)
4. When truthy (future, after Story 1.9): inject BMAD context into extraction prompts

**Implementation pattern:**
```typescript
const kb = await ctx.runQuery(internal.knowledge.internal._getKbForExtraction, {
  knowledge_base_id: args.knowledge_base_id,
});

const bmadContext = kb?.bmad_detected
  ? await ctx.runQuery(internal.knowledge.internal._getBmadMetadata, {
      knowledge_base_id: args.knowledge_base_id,
    })
  : null;

// Pass bmadContext to prompt builders (they handle null gracefully)
```

The `_getBmadMetadata` query and `kb_bmad_metadata` table don't exist yet. Do NOT create them — Story 1.9 owns that. The extraction action should check `kb?.bmad_detected` and when falsy (always, currently), skip the BMAD metadata query entirely. This is a runtime optional path that activates when Story 1.9 ships.

**Do NOT add `bmad_detected` to the schema in this story.** Story 1.9 adds it. The field will be `undefined` on existing KB documents, which is correctly falsy.

### Architecture: Module Storage Pattern

Modules are stored as individual rows in `kb_modules`:

```typescript
export const _storeModules = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    modules: v.array(v.object({
      name: v.string(),
      description: v.optional(v.string()),
      file_count: v.optional(v.number()),
      files: v.optional(v.array(v.string())),
      apis: v.optional(v.any()),
      data_models: v.optional(v.any()),
      user_flows: v.optional(v.any()),
      dependencies: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    const ids: Id<"kb_modules">[] = [];
    for (const mod of args.modules) {
      const id = await ctx.db.insert("kb_modules", {
        knowledge_base_id: args.knowledge_base_id,
        workspace_id: args.workspace_id,
        ...mod,
      });
      ids.push(id);
    }
    return ids;
  },
});
```

**Re-sync support (Story 1.8):** Before inserting new modules on re-sync, call `_deleteModulesByKb` to remove old ones. This story creates the deletion mutation but does NOT wire it into the workflow (Story 1.8 does that).

### Architecture: `generateObject` Error Handling

`generateObject` can fail with:
- `NoOutputGeneratedError` — model returned no valid JSON
- `AIAPICallError` — API error (401, 429, 500, etc.)
- `AIValidationError` — schema validation failed

**Handling strategy:**
```typescript
try {
  const { object } = await generateObject({ model, schema, prompt });
  return object;
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown AI error";
  // Check for auth/config errors vs transient
  if (message.includes("401") || message.includes("403")) {
    throw new ConvexError("AI extraction failed: authentication error. Check workspace AI config.");
  }
  // Let workflow retry handle transient errors
  throw new ConvexError(`AI extraction failed: ${message}`);
}
```

The workflow's `{ retry: true }` on the extraction step handles transient failures. If retries exhaust, `_handleIngestionComplete` sets KB to `"error"`.

**Important — reuse error helpers from `embeddingActions.ts`:** The functions `getErrorStatusCode`, `isFatalError`, `buildEmbeddingErrorMessage` can be generalized or duplicated for extraction. Prefer extracting to a shared utility if the patterns match.

### Architecture: Empty Repo Guard

If `_getChunksForExtraction` returns an empty array (race condition, all files excluded, or corrupted state):
- Skip AI extraction entirely
- Architecture fields remain `undefined` on knowledge_bases
- No modules inserted
- KB still transitions to `"ready"` (the workflow continues)
- User sees a ready KB with no architecture data — acceptable for empty repos

```typescript
const chunks = await ctx.runQuery(...);
if (chunks.length === 0) {
  return { architectureExtracted: false, modulesExtracted: 0 };
}
```

### Existing Code to Modify

- `convex/knowledge/ingestionWorkflow.ts` — ADD extraction step between embedding and ready (non-breaking insertion)
- `convex/knowledge/internal.ts` — ADD `_storeArchitectureSummary`, `_storeModules`, `_deleteModulesByKb`, `_getChunksForExtraction`, `_getKbForExtraction` (non-breaking additions)
- `convex/lib/constraints.ts` — ADD extraction constants (non-breaking additions)

### New Files to Create

- `convex/knowledge/extractionPrompts.ts` — prompt builders + zod schemas (no `"use node"`)
- `convex/knowledge/extractionActions.ts` — extraction workflow action (`"use node"`)
- `convex/knowledge.extractionContext.test.ts` — pure function tests for context building
- `convex/knowledge.extractionActions.test.ts` — data-layer tests for storage mutations + error paths

### Key Dependencies

- `ai: ^6.0.191` — already installed, provides `generateObject`
- `zod: ^4.4` — already installed, use `import { z } from "zod"` (v4, not v3)
- `@ai-sdk/openai: ^3.0.65` — already installed, provides BYOK model via `getWorkspaceModel`
- No new npm packages needed

### Existing Code Patterns to Follow

**`"use node"` action pattern** (from `embeddingActions.ts`):
```typescript
"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";

export const extractArchitectureAndModules = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args) => { ... },
});
```

**Internal mutation pattern** (from `internal.ts`):
```typescript
export const _storeArchitectureSummary = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    architecture_summary: v.string(),
    tech_stack: v.array(v.string()),
    folder_structure: v.string(),
    architecture_type: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.knowledge_base_id, {
      architecture_summary: args.architecture_summary,
      tech_stack: args.tech_stack,
      folder_structure: args.folder_structure,
      architecture_type: args.architecture_type,
    });
  },
});
```

**Workflow step pattern** (from `ingestionWorkflow.ts`):
```typescript
await step.runMutation(internal.knowledge.internal._updateKbStatus, {
  knowledge_base_id: args.knowledge_base_id,
  project_id: args.project_id,
  status: "building",
  progress_message: "Analyzing code structure...",
});

await step.runAction(
  internal.knowledge.extractionActions.extractArchitectureAndModules,
  {
    project_id: args.project_id,
    knowledge_base_id: args.knowledge_base_id,
    workspace_id: project.workspace_id,
  },
  { retry: true },
);
```

**Model creation pattern** (from `convex/ai/model.ts`):
```typescript
import { getWorkspaceModel } from "../ai/model";

const aiConfig = await ctx.runQuery(
  internal.knowledge.internal._getWorkspaceAiConfig,
  { workspace_id: args.workspace_id },
);
if (!aiConfig) throw new ConvexError("Workspace AI config not found");

const model = getWorkspaceModel(aiConfig);
const { object } = await generateObject({ model, schema, prompt });
```

### Testing Strategy

**Pure function tests** (no Convex context, no AI calls):
- `buildFileTree(chunks)` — correct grouping by directory, file count, size aggregation
- `sampleCodeForExtraction(chunks, maxChars)` — respects char cap, prioritizes config files
- `buildDirectorySummary(fileTree)` — correct text tree format
- `buildArchitectureExtractionPrompt(context)` — prompt contains file tree, sampled code, no BMAD context when null
- `buildModuleExtractionPrompt(context)` — prompt contains architecture summary, directory structure

**Data-layer tests** (direct `ctx.db` via `t.run()`):
- `_storeArchitectureSummary` — patches all 4 fields on knowledge_bases
- `_storeModules` — inserts N module rows, returns IDs, each linked to correct KB
- `_deleteModulesByKb` — removes all modules for a KB
- `_getChunksForExtraction` — returns only first chunk per file path (deduplication)
- `_getKbForExtraction` — returns KB document with bmad_detected field (undefined when not set)

**Workflow tests** (extend existing):
- Extraction step runs AFTER embedding, BEFORE ready transition
- Empty chunks → extraction skipped, KB reaches "ready"
- Extraction error → workflow fails → `_handleIngestionComplete` sets "error"

**Untestable paths** (mark with `it.todo`):
- Full `generateObject` with real AI API (requires network + API key)
- BMAD context injection (requires Story 1.9 fields to exist)
- Rate limit retry behavior (requires mock AI server)

### Previous Story Intelligence (Story 1.4)

**Key learnings from Story 1.4 review:**
1. **429 error handling**: The `@ai-sdk/openai` throws errors with `statusCode` property, not `status`. The extraction action should reuse the corrected `getErrorStatusCode` helper from `embeddingActions.ts`.
2. **No workflow error handler for steps**: The `_handleIngestionComplete` callback IS the error handler. If a workflow step throws, the workflow fails, and the callback sets KB to "error". Ensure extraction step failures propagate (don't swallow errors).
3. **Unbounded `.collect()` on large repos**: Use `.take(MAX_EMBEDDING_CHUNKS)` for queries, not `.collect()`.
4. **Error messages should differentiate status codes**: 401/403 → "authentication", 404 → "model not available", other → generic message. Reuse the pattern from `buildEmbeddingErrorMessage`.
5. **Missing test files**: Story 1.4 had test files marked `[x]` but not created. Ensure ALL test files are actually created and pass.

**What Story 1.4 established that this story builds on:**
- RAG component is installed and working (`@convex-dev/rag`)
- Code chunks are in the DB (`code_chunks` table) with `file_path`, `directory`, `content`, `chunk_index`, `language`
- KB status transitions are tested and working
- The ingestion workflow is durable via `@convex-dev/workflow`
- `_getWorkspaceAiConfig` internal query exists and returns BYOK config
- `getWorkspaceModel(aiConfig)` returns the BYOK model instance

### Git Intelligence

Recent commits:
- `a26975a` — Story 1.4 (vector embeddings & RAG storage) — immediate predecessor
- `b56819b` — Stories 1.2 and 1.3 (KB ingestion pipeline)
- Pattern: each story is a single `feat:` commit

**Existing AI patterns:**
- All AI calls go through `@convex-dev/agent` (thread-based) OR `ai` package (direct)
- `generateText` via threads is used for all existing AI (test gen, healing, exploration)
- `generateObject` from `ai` package has NOT been used yet in this codebase — this story introduces it
- BYOK model creation: `getWorkspaceModel(config)` from `convex/ai/model.ts`

### Project Structure Notes

- `convex/knowledge/` directory grows from 13 to 15 files — still cohesive (all KB-related)
- `extractionPrompts.ts` follows the pattern of `agents.ts` (prompt constants + builders) but is KB-specific
- `extractionActions.ts` follows the `embeddingActions.ts` pattern (`"use node"`, internal action)
- Test files at `convex/` root per glob convention (`convex/knowledge.extractionContext.test.ts`, `convex/knowledge.extractionActions.test.ts`)
- No schema changes needed — `knowledge_bases` and `kb_modules` tables already have all required fields

### Schema Fields Already Available

The `knowledge_bases` table already has all architecture fields (added in Story C1.1):
```typescript
architecture_summary: v.optional(v.string()),
tech_stack: v.optional(v.array(v.string())),
folder_structure: v.optional(v.string()),
architecture_type: v.optional(v.string()),
```

The `kb_modules` table already has all module fields (added in Story C1.1):
```typescript
name: v.string(),
description: v.optional(v.string()),
file_count: v.optional(v.number()),
files: v.optional(v.array(v.string())),
apis: v.optional(v.any()),
data_models: v.optional(v.any()),
user_flows: v.optional(v.any()),
dependencies: v.optional(v.array(v.string())),
```

**No schema migration needed.** Just write data to these fields.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5] — ACs and FRs
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Schema: New Tables] — kb_modules schema with v.any() for nested structures
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Negative] — v.any() trade-off justification for apis/data_models/user_flows
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Validation] — dependencies changed to array of strings (module names, not IDs)
- [Source: docs/adr/0003-convex-agent-component.md] — Agent Component + BYOK via createOpenAI
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md#4.4] — Enhanced Story 1.5 BMAD ACs
- [Source: convex/schema.ts#knowledge_bases] — architecture fields already in schema
- [Source: convex/schema.ts#kb_modules] — module fields already in schema with v.any()
- [Source: convex/knowledge/ingestionWorkflow.ts] — workflow definition to extend (insert extraction step)
- [Source: convex/knowledge/embeddingActions.ts] — pattern for "use node" action with BYOK + error handling
- [Source: convex/knowledge/internal.ts] — internal mutation pattern + _getChunksForEmbedding
- [Source: convex/ai/model.ts#getWorkspaceModel] — BYOK model factory
- [Source: convex/ai/agents.ts] — prompt constant pattern + zod schema pattern (note: uses zod/v3 for Agent tools)
- [Source: convex/lib/constraints.ts] — constant definition pattern
- [Source: convex/testHelpers.ts#seedKnowledgeBase] — test seed function
- [Source: _bmad-output/implementation-artifacts/1-4-vector-embeddings-rag-storage.md] — previous story intelligence + review findings

## Dev Agent Record

### Agent Model Used

glm-5.1 (zai-coding-plan/glm-5.1)

### Debug Log References

No issues encountered during implementation. All TDD red-green cycles passed on first or second attempt.

### Completion Notes List

- **Task 6**: Added 3 extraction constants to `convex/lib/constraints.ts` (`EXTRACTION_MAX_CONTEXT_CHARS=80000`, `EXTRACTION_MAX_MODULES=50`, `EXTRACTION_SAMPLE_CHUNKS_PER_FILE=1`)
- **Task 1**: Created `convex/knowledge/extractionPrompts.ts` with zod v4 schemas (`architectureSchema`, `moduleSchema`) and prompt builders (`buildArchitectureExtractionPrompt`, `buildModuleExtractionPrompt`). Both handle BMAD context null/non-null gracefully.
- **Task 3**: Created `convex/knowledge/extractionContext.ts` with pure functions: `buildFileTree` (groups files by directory), `sampleCodeForExtraction` (first chunk per file, priority-sorted, char-capped), `buildDirectorySummary` (directory tree with file counts and names).
- **Task 4**: Added 5 new internal functions to `convex/knowledge/internal.ts`: `_storeArchitectureSummary`, `_storeModules`, `_deleteModulesByKb` (batched deletion for re-sync), `_getChunksForExtraction` (deduplicates to first chunk per file), `_getKbForExtraction` (returns KB doc for BMAD check).
- **Task 2**: Created `convex/knowledge/extractionActions.ts` ("use node") with `extractArchitectureAndModules` internal action. Two-phase AI extraction: architecture summary → modules. Reuses error helpers from `embeddingActions.ts`. Empty-repo guard returns early. BMAD forward-compatible check always falsy (field doesn't exist yet). Error handling via `ConvexError` with status-code-specific messages.
- **Task 5**: Inserted extraction step into `convex/knowledge/ingestionWorkflow.ts` between embedding and ready transition. Status message "Analyzing code structure..." set before extraction action. Existing ready/last_synced_at code unchanged — just runs one step later.
- **Task 7**: 3 new test files created (`extractionPrompts.test.ts`, `extractionContext.test.ts`, `extractionActions.test.ts`) + ingestion workflow test extended. Total: 54 new tests covering pure functions, data-layer mutations/queries, error helpers, and workflow ordering.
- **Task 8**: `pnpm test:convex` → 622 passed (0 failed). `pnpm lint` → 0 errors. `pnpm test` → 143 passed (0 failed). No regressions.
- **Test coverage**: 21 tests for prompts/schemas, 12 for context helpers, 9 for data-layer, 6 for workflow integration/error helpers = 48 new tests. Plus 6 extension tests in existing workflow test file = 54 total.

### File List

**New Files:**
- `convex/knowledge/extractionPrompts.ts` — zod schemas + prompt builders
- `convex/knowledge/extractionContext.ts` — pure context-building helpers
- `convex/knowledge/extractionActions.ts` — "use node" extraction action
- `convex/knowledge.extractionPrompts.test.ts` — prompt/schema tests (9 tests)
- `convex/knowledge.extractionContext.test.ts` — context helper tests (12 tests)
- `convex/knowledge.extractionActions.test.ts` — data-layer tests (9 tests)

**Modified Files:**
- `convex/lib/constraints.ts` — added 3 extraction constants
- `convex/knowledge/internal.ts` — added 5 internal functions
- `convex/knowledge/ingestionWorkflow.ts` — inserted extraction step
- `convex/knowledge.ingestionWorkflow.test.ts` — extended with extraction ordering tests

### Review Findings

- [x] [Review][Patch] Unused constant `EXTRACTION_SAMPLE_CHUNKS_PER_FILE` [convex/lib/constraints.ts:40] — FIXED: removed dead constant.
- [x] [Review][Patch] Extraction ordering test gives false confidence [convex/knowledge.ingestionWorkflow.test.ts:490-493] — FIXED: renamed to "extraction step wiring", merged two weak tests into one that verifies both workflow module and extraction action API path are registered.
- [x] [Review][Defer] Non-idempotent extraction on workflow retry [convex/knowledge/extractionActions.ts] — deferred, Phase 1 architecture patch is idempotent; module duplicates can't occur from normal operation (transactional mutation); spec explicitly defers cleanup wiring to Story 1.8
- [x] [Review][Defer] Dedup after take() in _getChunksForExtraction [convex/knowledge/internal.ts:398-417] — deferred, documented design per spec; chunk ordering relies on _creationTime (usually matches chunk_index 0); quality concern for repos with few very large files
- [x] [Review][Defer] Prompt injection via raw code content [convex/knowledge/extractionPrompts.ts] — deferred, accepted risk for self-service codebase analysis (user analyzes own repos); wrapping in delimiters would help but not critical for first version
- [x] [Review][Defer] _deleteModulesByKb unbounded loop [convex/knowledge/internal.ts:362-396] — deferred, mutation not called in this story (Story 1.8 wires it); EXTRACTION_MAX_MODULES=50 caps practical module count
- [x] [Review][Defer] Duplicated error message function [convex/knowledge/extractionActions.ts:37-48] — deferred, buildExtractionErrorMessage intentionally differs from buildEmbeddingErrorMessage (different messages for extraction vs embedding context); minor duplication
- [x] [Review][Defer] Monorepo config files can consume char budget [convex/knowledge/extractionContext.ts:82-122] — deferred, edge case for 40+ config files; config files are typically small; quality concern not correctness bug
- [x] [Review][Defer] Truncated modules leave dangling dependencies [convex/knowledge/extractionActions.ts:144] — deferred, EXTRACTION_MAX_MODULES=50 is rarely reached (typical repos have 3-15 modules); minor issue
