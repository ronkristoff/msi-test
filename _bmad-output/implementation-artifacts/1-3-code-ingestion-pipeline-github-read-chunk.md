---
baseline_commit: 25f37c2078336715e1c97b235b5cc614d4e655d0
---
Status: done

# Story 1.3: Code Ingestion Pipeline — GitHub Read & Chunk

## Story

As a BA,
I want to trigger code analysis on my connected GitHub repository,
so that the system reads all relevant source files and prepares them for AI analysis.

## Acceptance Criteria

1. **AC1 — Trigger action**: A `triggerIngestion` action accepts `project_id`, validates the project has a connected repo (`repo_url` + `encrypted_pat`) and `kb_status` is `none` or `error`, creates a `knowledge_bases` document with `status: "building"`, patches the project's `kb_status` to `"building"`, then starts the ingestion workflow. Returns `{ knowledgeBaseId, workflowId }`.

2. **AC2 — File tree read**: The workflow decrypts the PAT (via `decryptPat` from `convex/knowledge/crypto.ts`), parses `owner/repo` from `repo_url` (already normalized to `https://github.com/owner/repo`), and calls the GitHub Trees API: `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1`. Default branch is `"main"`. Response includes `tree` array with `{ path, type: "blob"|"tree", size }`.

3. **AC3 — File filtering**: Files are filtered by configurable include/exclude patterns. Defaults: include `*.ts, *.tsx, *.js, *.jsx, *.py, *.json, *.yaml, *.yml, *.css, *.html, *.sql, *.go, *.rs, *.java, *.md`; exclude directories `node_modules, .git, dist, build, __pycache__, .next, vendor, target, .cache`. Patterns stored in `convex/lib/constraints.ts`. The tree response `truncated: true` is handled by logging a warning (not an error) — if the repo exceeds 100k entries, only the returned entries are processed.

4. **AC4 — File content read**: For each filtered file, content is fetched via GitHub raw content URL: `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}` with Authorization header. Files larger than `MAX_FILE_SIZE_BYTES` (default 100KB) are skipped with a count tracked. Files are fetched in batches to respect GitHub rate limits. Rate limit response (HTTP 403 with `X-RateLimit-Remaining: 0`) causes the workflow to pause and wait until `X-RateLimit-Reset` timestamp, then retry.

5. **AC5 — Chunking**: File contents are split into meaningful chunks. Chunking strategy: files under `CHUNK_SIZE` (default 2000 chars) are a single chunk; larger files are split at function/class boundary heuristics (blank line + indentation decrease), with a hard maximum of `CHUNK_SIZE`. Each chunk records: `file_path`, `directory` (parent dir), `content`, `chunk_index` (0-based per file), `language` (from extension), `char_count`.

6. **AC6 — Chunk storage**: Chunks are stored in a new `code_chunks` table with indexes `by_knowledge_base_id`, `by_project_id`, `by_workspace_id`. The workflow deletes any existing chunks for the same `knowledge_base_id` before inserting (for re-sync support).

7. **AC7 — KB status transitions**: The workflow updates `knowledge_bases.status` and `projects.kb_status` at each stage via progress mutations. Transitions: `building` (start) → `building` with progress messages (reading tree, reading files, chunking) → after chunking completes, status remains `"building"` because embeddings (story 1-4) and AI extraction (story 1-5) are pending. On error, both `knowledge_bases.status` and `projects.kb_status` transition to `"error"` with `error_message`.

8. **AC8 — Workflow durability**: The pipeline uses `@convex-dev/workflow` (already installed `^0.4.3`, registered as `components.workflow`). Each network call (tree fetch, file content fetch) is a workflow step with `{ retry: true }`. Progress mutations use `step.runMutation(internal...)`. The workflow survives Convex server restarts.

9. **AC9 — Real-time progress**: A public `getIngestionProgress` query returns `{ kb_status, status, progress_message, error_message, total_files, total_size_bytes }` from the `knowledge_bases` document. The frontend subscribes to this for live updates.

10. **AC10 — Cancel support**: A `cancelIngestion` mutation (following the `cancelSuiteGeneration` pattern from `convex/ai/workflowShared.ts`) cancels the workflow and sets both statuses to `"error"` with message "Cancelled by user".

11. **AC11 — Tests**: All new functions have Convex tests. GitHub API client functions extracted as pure functions (testable without network). Chunking logic tested with edge cases (empty file, single-line file, file exactly at chunk boundary, oversized file). Data-layer tests for chunk storage/retrieval. Workflow status transitions tested at data layer. Progress query tested for auth scoping.

## Tasks / Subtasks

- [x] Task 1: Add `code_chunks` table to `convex/schema.ts` (AC: #6)
  - [x] Add `code_chunks` table with fields: `workspace_id`, `knowledge_base_id`, `project_id`, `file_path`, `directory`, `content`, `chunk_index`, `language`, `char_count`
  - [x] Add indexes: `by_knowledge_base_id`, `by_project_id`, `by_workspace_id`
- [x] Task 2: Add ingestion constants to `convex/lib/constraints.ts` (AC: #3, #4, #5)
  - [x] `GITHUB_DEFAULT_BRANCH = "main"`
  - [x] `INGESTION_INCLUDE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".yaml", ".yml", ".css", ".html", ".sql", ".go", ".rs", ".java", ".md"]`
  - [x] `INGESTION_EXCLUDE_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__", ".next", "vendor", "target", ".cache"]`
  - [x] `MAX_FILE_SIZE_BYTES = 100 * 1024` (100KB)
  - [x] `CHUNK_SIZE = 2000` (characters)
  - [x] `GITHUB_FILE_BATCH_SIZE = 10` (files per batch before checking rate limit)
- [x] Task 3: Create `convex/knowledge/github.ts` — GitHub API client pure functions (AC: #2, #3, #4)
  - [x] `"use node";` file — uses `fetch` with Node runtime for PAT header
  - [x] `parseOwnerRepo(repoUrl: string): { owner: string; repo: string }` — extracts owner/repo from normalized URL
  - [x] `fetchFileTree(owner, repo, branch, pat): Promise<{ tree: TreeEntry[]; truncated: boolean }>` — calls Trees API, returns filtered entries
  - [x] `filterFiles(entries: TreeEntry[], includeExts: string[], excludeDirs: string[]): TreeEntry[]` — pure function, filters by extension and excluded directories
  - [x] `fetchFileContent(owner, repo, branch, path, pat): Promise<string | null>` — fetches raw content, returns null for files exceeding size
  - [x] `checkRateLimit(response: Response): { remaining: number; resetAt: number }` — parses rate limit headers
  - [x] All functions throw `ConvexError` with descriptive messages on API errors
- [x] Task 4: Create `convex/knowledge/chunking.ts` — chunking logic pure functions (AC: #5)
  - [x] NO `"use node"` — pure functions, no Node built-ins needed
  - [x] `chunkFile(filePath: string, content: string, chunkSize: number): CodeChunk[]` — splits content into chunks
  - [x] `detectLanguage(filePath: string): string` — maps extension to language name
  - [x] `splitAtBoundaries(content: string, chunkSize: number): string[]` — splits at function/class boundary heuristics
  - [x] Edge cases: empty content (returns []), content smaller than chunkSize (returns [content]), content at exact boundary
- [x] Task 5: Add internal mutations/queries to `convex/knowledge/internal.ts` (AC: #6, #7, #9)
  - [x] `_createKnowledgeBase` — creates knowledge_bases doc, returns ID
  - [x] `_updateKbStatus` — patches status + progress_message + error_message on both knowledge_bases and projects tables
  - [x] `_deleteChunksByKb` — deletes all code_chunks for a knowledge_base_id (for re-sync)
  - [x] `_insertChunks` — inserts an array of code chunks (batch)
  - [x] `_updateKbStats` — updates total_files and total_size_bytes on knowledge_bases
  - [x] `_getProjectForIngestion` (internal query) — returns `{ repo_url, encrypted_pat, workspace_id, project_id }` for the workflow (no auth — trusted internal)
  - [x] `_getKnowledgeBaseForProject` (internal query) — returns the knowledge_bases doc for a project_id
- [x] Task 6: Add `getIngestionProgress` query to `convex/knowledge/queries.ts` (AC: #9)
  - [x] Public query using `getOptionalOwnedEntity` for auth scoping
  - [x] Returns `{ kb_status, status, progress_message, error_message, total_files, total_size_bytes }` or `null`
- [x] Task 7: Create `convex/knowledge/ingestionWorkflow.ts` — workflow definition (AC: #7, #8)
  - [x] `defineWorkflow(components.workflow, { args: { project_id, knowledge_base_id } })`
  - [x] Step 1: `step.runQuery(internal.knowledge.internal._getProjectForIngestion)` → get repo_url + encrypted_pat
  - [x] Step 2: `step.runAction(internal.knowledge.ingestionActions.decryptAndFetchTree)` → decrypt PAT, fetch tree, filter files, return `{ files: [{path, size}], truncated }`
  - [x] Step 3: Update progress via `step.runMutation(internal.knowledge.internal._updateKbStatus)` with message "Reading X files..."
  - [x] Step 4: `step.runAction(internal.knowledge.ingestionActions.fetchAndChunkFiles)` → batch-fetch files, chunk each, insert chunks via internal mutations. Returns `{ totalFiles, totalSize, chunkCount }`
  - [x] Step 5: `step.runMutation(internal.knowledge.internal._updateKbStats)` — set total_files, total_size_bytes
  - [x] Step 6: `step.runMutation(internal.knowledge.internal._updateKbStatus)` — set progress_message "Chunking complete. Ready for embedding."
  - [x] Export `cancelIngestion` mutation following `cancelSuiteGeneration` pattern
- [x] Task 8: Create `convex/knowledge/ingestionActions.ts` — workflow action steps (AC: #2, #4, #5)
  - [x] `"use node";` — needs `fetch` + `decryptPat` from crypto.ts
  - [x] `decryptAndFetchTree` (internal action) — decrypts PAT via `decryptPat(encrypted, process.env.ENCRYPTION_KEY)`, calls GitHub API, filters files, returns metadata (NOT content — just paths + sizes)
  - [x] `fetchAndChunkFiles` (internal action) — iterates files in batches, fetches content via `fetchFileContent`, chunks via `chunkFile`, stores via `ctx.runMutation(internal.knowledge.internal._insertChunks)`. Handles rate limits by checking headers and sleeping until reset.
- [x] Task 9: Create `convex/knowledge/triggerIngestion.ts` — public entry point (AC: #1)
  - [x] `"use node";` action file
  - [x] `triggerIngestion` action — validates project via internal query (has repo + PAT), checks kb_status, creates KB doc, patches project status, starts workflow via `start(ctx, internal.knowledge.ingestionWorkflow.ingestionWorkflow, {...})`
  - [x] Pre-flight: throw `ConvexError` if no repo connected, or KB already building
- [x] Task 10: Write tests (AC: #11)
  - [x] `convex/knowledge.chunking.test.ts` — test chunkFile, detectLanguage, splitAtBoundaries with edge cases
  - [x] `convex/knowledge.github.test.ts` — test filterFiles (pure), parseOwnerRepo, checkRateLimit header parsing (mock Response)
  - [x] `convex/knowledge.ingestionWorkflow.test.ts` — data-layer tests: _createKnowledgeBase, _updateKbStatus, _insertChunks, _deleteChunksByKb, _updateKbStats, getIngestionProgress auth scoping
  - [x] Use `seedProjectWithRepo` from `convex/testHelpers.ts`
  - [x] Add `seedKnowledgeBase` to `convex/testHelpers.ts`
- [x] Task 11: Run `pnpm test:convex` and verify all tests pass with no regressions (AC: #11)

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- GitHub repo file tree reading via REST API
- File content reading via raw.githubusercontent.com
- Include/exclude filtering
- Code chunking (splitting files into meaningful pieces)
- Chunk storage in `code_chunks` table
- `@convex-dev/workflow` durable pipeline skeleton
- Progress tracking via Convex subscription
- Cancel support

**This story does NOT implement (future stories):**
- Vector embeddings (story 1-4 — reads from `code_chunks`, generates embeddings, stores in Agent Component vector store)
- AI architecture/module extraction (story 1-5 — reads chunks/embeddings, extracts structure)
- KB status transition to `"ready"` (added by story 1-5 when all pipeline steps complete)
- KB viewer UI (story 1-6)

### KB Status Flow for This Story

```
none/error → building (triggerIngestion)
  → building: "Fetching file tree..." (workflow step 2)
  → building: "Reading N files..." (workflow step 3-4)
  → building: "Chunking complete" (workflow step 5-6)
  [STATUS STAYS "building" — stories 1-4 and 1-5 will extend the workflow with more steps]
  
  error (on failure at any step)
```

The workflow created in this story is the **first version** of the ingestion pipeline. Stories 1-4 and 1-5 will add steps between "chunking complete" and the final "ready" transition. Do NOT transition to `"ready"` in this story.

### Architecture: Workflow Pattern

Follow the EXACT pattern from `convex/ai/prdWorkflow.ts` + `convex/ai/generatePrdTests.ts`:

**Workflow starter** (`triggerIngestion.ts`) — `"use node"` action:
```typescript
export const triggerIngestion = action({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Pre-flight checks via ctx.runQuery
    // 2. Create KB doc via ctx.runMutation
    // 3. Patch project kb_status to "building"
    // 4. Start workflow
    const workflowId = await start(ctx, internal.knowledge.ingestionWorkflow.ingestionWorkflow, {
      project_id: args.project_id,
      knowledge_base_id: kbId,
    });
    return { knowledgeBaseId: kbId, workflowId };
  },
});
```

**Workflow definition** (`ingestionWorkflow.ts`):
```typescript
export const ingestionWorkflow = defineWorkflow(components.workflow, {
  args: { project_id: v.id("projects"), knowledge_base_id: v.id("knowledge_bases") },
}).handler(async (step, args) => {
  const project = await step.runQuery(internal.knowledge.internal._getProjectForIngestion, {
    project_id: args.project_id,
  });
  // ... steps with step.runAction / step.runMutation ...
});
```

### Architecture: GitHub API Integration

**File tree** — single API call gets entire repo structure:
```
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1
Authorization: Bearer {pat}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```
Response: `{ tree: [{ path, type, size, sha }], truncated: boolean }`

**File content** — use raw URL for efficiency (no API rate limit on raw.githubusercontent.com for authenticated requests, but still respect rate limits):
```
GET https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
Authorization: Bearer {pat}
```

**Rate limit headers**: Check `X-RateLimit-Remaining` on every response. When `0`, sleep until `X-RateLimit-Reset` (Unix timestamp) before continuing.

**Tree truncation**: If `truncated: true`, the repo has >100k entries. Only process returned entries. Log a warning via progress_message.

### Architecture: "use node" File Strategy

This story needs THREE `"use node"` files:
1. `convex/knowledge/github.ts` — GitHub API client (`fetch`, PAT in Authorization header)
2. `convex/knowledge/ingestionActions.ts` — workflow action steps (imports from `github.ts` + `crypto.ts`, needs `decryptPat`)
3. `convex/knowledge/triggerIngestion.ts` — public action (imports `start` from workflow, calls `ctx.runQuery`/`ctx.runMutation`)

These files CANNOT export queries or mutations. DB writes happen via `ctx.runMutation(internal...)`.

`convex/knowledge/chunking.ts` does NOT need `"use node"` — it's pure functions with no Node built-ins.

### Architecture: Code Chunks Table

New `code_chunks` table in schema:
```typescript
code_chunks: defineTable({
  workspace_id: v.id("workspaces"),
  knowledge_base_id: v.id("knowledge_bases"),
  project_id: v.id("projects"),
  file_path: v.string(),
  directory: v.string(),
  content: v.string(),
  chunk_index: v.number(),
  language: v.optional(v.string()),
  char_count: v.number(),
})
  .index("by_knowledge_base_id", ["knowledge_base_id"])
  .index("by_project_id", ["project_id"])
  .index("by_workspace_id", ["workspace_id"]),
```

Story 1-4 will read from this table to generate embeddings. Story 1-5 reads from this table (and embeddings) for AI extraction.

### Architecture: PAT Decryption Flow

The PAT is stored encrypted on the `projects` table as `encrypted_pat`. Decryption happens ONLY in actions:

```typescript
// In ingestionActions.ts or triggerIngestion.ts
const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) throw new ConvexError("Encryption key not configured");
const pat = decryptPat(project.encrypted_pat, encryptionKey);
```

The decrypted PAT is NEVER stored or returned to the client. It exists only in the action's transient memory during GitHub API calls.

### Existing Code to Modify

- `convex/schema.ts` — ADD `code_chunks` table (non-breaking)
- `convex/lib/constraints.ts` — ADD ingestion constants (non-breaking)
- `convex/knowledge/queries.ts` — ADD `getIngestionProgress` query (non-breaking)
- `convex/knowledge/internal.ts` — ADD KB/chunk mutations + queries (non-breaking)
- `convex/testHelpers.ts` — ADD `seedKnowledgeBase` helper (non-breaking)

### New Files to Create

- `convex/knowledge/github.ts` — GitHub API client (`"use node"`)
- `convex/knowledge/chunking.ts` — chunking pure functions
- `convex/knowledge/ingestionWorkflow.ts` — workflow definition + cancel mutation
- `convex/knowledge/ingestionActions.ts` — workflow action steps (`"use node"`)
- `convex/knowledge/triggerIngestion.ts` — public trigger action (`"use node"`)
- `convex/knowledge.chunking.test.ts` — chunking tests
- `convex/knowledge.github.test.ts` — GitHub client pure function tests
- `convex/knowledge.ingestionWorkflow.test.ts` — data-layer tests

### Key Dependencies

- `@convex-dev/workflow: ^0.4.3` — already installed, registered as `components.workflow`
- No new npm packages needed — `fetch` is built-in

### Chunking Strategy Detail

The chunking approach balances simplicity with RAG effectiveness:

1. **Small files** (< `CHUNK_SIZE` = 2000 chars): single chunk, content = full file
2. **Large files**: split at function/class boundaries:
   - Scan for lines matching `/^(export )?(async )?(function|class|const|interface|type) /` or blank-line + dedent
   - If no boundary found within `CHUNK_SIZE` chars from start, hard-split at nearest newline to `CHUNK_SIZE`
   - Each chunk starts at a boundary, extends to next boundary or `CHUNK_SIZE`
3. **Empty files**: return empty array (no chunks)
4. **Each chunk** records `chunk_index` (0-based within the file), `directory` (parent dir from `file_path`), `language` (from extension map)

### Testing Strategy

Following the pattern from story 1-2 review findings:

**Pure function tests** (no Convex context needed):
- `chunkFile` — empty, tiny, exact-boundary, oversized, no-boundary-found
- `detectLanguage` — all supported extensions, unknown extension
- `filterFiles` — include/exclude filtering, empty tree, all-excluded
- `parseOwnerRepo` — normal URL, URL with trailing slash, URL with extra path
- `checkRateLimit` — headers present, headers missing, remaining=0

**Data-layer tests** (direct `ctx.db` via `t.run()`):
- `_createKnowledgeBase` — creates doc with correct fields
- `_updateKbStatus` — patches both `knowledge_bases` and `projects` tables
- `_insertChunks` / `_deleteChunksByKb` — CRUD on code_chunks
- `_updateKbStats` — updates total_files, total_size_bytes
- `getIngestionProgress` — returns data for owned project, null for foreign/unauthenticated

**Untestable paths** (mark with `it.todo`):
- Full GitHub API `fetch` calls (network not mockable in convex-test)
- `decryptPat` with real `process.env.ENCRYPTION_KEY` in action context
- Workflow orchestration end-to-end (test data layer only)

### Git Intelligence

Recent commits show:
- Story 1-1 (schema + repo connection) and 1-2 (Old RD upload) are the immediate predecessors
- Existing workflow pattern (`prdWorkflow.ts`, `nlWorkflow.ts`) is well-established
- Test pattern uses `convexTest(schema, modules)` with `import.meta.glob` module map
- `seedProjectWithRepo` test helper exists and seeds `repo_url`, `encrypted_pat`, `kb_status`

### Project Structure Notes

- All new files follow the `convex/{domain}/` pattern per ADR 0008
- The `knowledge/` directory grows from 6 to 11 files — still cohesive (all KB-related)
- Test files at `convex/` root per glob convention (`import.meta.glob("./**/*.ts")`)
- No `convex/kb_modules/` directory needed yet (that's story 1-5's scope)

### References

- [Source: docs/adr/0008-combined-analyst-test-platform.md#Schema: New Tables] — knowledge_bases, kb_modules schema
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Component Usage] — workflow, action-cache, RAG storage
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Security] — PAT encryption/decryption rules
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Module Organization] — target file layout
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — ACs and FRs
- [Source: convex/ai/prdWorkflow.ts] — workflow definition pattern to follow
- [Source: convex/ai/generatePrdTests.ts] — workflow starter action pattern
- [Source: convex/ai/workflowShared.ts:cancelSuiteGeneration] — cancel pattern
- [Source: convex/knowledge/crypto.ts] — `encryptPat`/`decryptPat` API
- [Source: convex/knowledge/internal.ts] — existing internal mutation pattern
- [Source: convex/knowledge/queries.ts] — existing query + auth pattern
- [Source: convex/knowledge/mutations.ts] — existing action pattern with "use node"
- [Source: convex/lib/constraints.ts] — constant definition pattern
- [Source: convex/lib/requireAuth.ts:getOptionalOwnedEntity] — query auth pattern
- [Source: convex/projects/queries.ts:getProjectForAi] — internal query without auth pattern
- [Source: convex/testHelpers.ts:seedProjectWithRepo] — test seed function
- [Source: convex/_generated/ai/guidelines.md] — "use node" rules, function calling, schema rules
- [Source: _bmad-output/implementation-artifacts/1-2-old-rd-upload-text-extraction.md] — story 1-2 learnings (test patterns, storage gotchas)
- [Source: https://docs.github.com/rest/git/trees] — GitHub Trees API (recursive=1, truncated handling)
- [Source: https://docs.convex.dev/agents/workflows] — @convex-dev/workflow step API, retry options

## Dev Agent Record

### Agent Model Used

Claude (glm-5.1) via opencode

### Debug Log References

- Fixed infinite loop in `splitAtBoundaries` when `splitPoint === start` (no boundary or newline in window). Added fallback to hard-split at `windowEnd`.

### Completion Notes List

- **Task 1**: Added `code_chunks` table with 3 indexes + `progress_message` field to `knowledge_bases` (needed by AC7/AC9 `_updateKbStatus` and `getIngestionProgress`)
- **Task 2**: Added 6 ingestion constants to `constraints.ts` — all imported by `github.ts`, `chunking.ts`, and `ingestionActions.ts`
- **Task 3**: `github.ts` — 8 exported functions: `parseOwnerRepo`, `filterFiles`, `checkRateLimit`, `fetchFileTree`, `fetchFileContent` (with rate limit retry), `sleep`, `waitForRateLimitReset`, plus types `TreeEntry`, `FileTreeResult`, `RateLimitInfo`. All pure functions testable without network.
- **Task 4**: `chunking.ts` — `detectLanguage`, `getDirectory`, `splitAtBoundaries`, `chunkFile`. Boundary heuristic: scans for `function|class|const|interface|type|enum|trait|impl` at line start or blank lines, falls back to nearest newline, then hard split. All 21 chunking tests pass.
- **Task 5**: 7 new internal functions in `internal.ts`: `_createKnowledgeBase`, `_updateKbStatus`, `_deleteChunksByKb`, `_insertChunks`, `_updateKbStats`, `_getProjectForIngestion`, `_getKnowledgeBaseForProject`. All tested at data layer (18 tests).
- **Task 6**: `getIngestionProgress` public query with `getOptionalOwnedEntity` auth scoping — returns `{ kb_status, status, progress_message, error_message, total_files, total_size_bytes }` or `null`.
- **Task 7**: `ingestionWorkflow.ts` — 6-step workflow following `prdWorkflow.ts` pattern: query project → decrypt+fetch tree → update progress → fetch+chunk files → update stats → set "Chunking complete" message. Includes `cancelIngestion` mutation following `cancelSuiteGeneration` pattern.
- **Task 8**: `ingestionActions.ts` — `decryptAndFetchTree` (decrypts PAT, calls GitHub Trees API, filters files) + `fetchAndChunkFiles` (batch-iterates files, fetches content with rate limit retry, chunks, stores via `_insertChunks`). Deletes existing chunks before inserting for re-sync support.
- **Task 9**: `triggerIngestion.ts` — public action with pre-flight validation (repo connected, not already building), creates KB doc, patches status, starts workflow, returns `{ knowledgeBaseId, workflowId }`.
- **Task 10**: 3 test files with 59 new tests total (21 chunking + 20 GitHub + 18 data-layer). All pure functions tested without network. `seedKnowledgeBase` helper added to testHelpers.
- **Task 11**: All 543 Convex tests pass (including 59 new) + 143 frontend tests. Zero regressions. Zero new lint warnings.

### File List

**Modified:**
- `convex/schema.ts` — Added `code_chunks` table + `progress_message` field to `knowledge_bases`
- `convex/lib/constraints.ts` — Added 6 ingestion constants
- `convex/knowledge/internal.ts` — Added 7 internal mutations/queries for KB + chunk operations
- `convex/knowledge/queries.ts` — Added `getIngestionProgress` public query
- `convex/testHelpers.ts` — Added `seedKnowledgeBase` helper

**Created:**
- `convex/knowledge/github.ts` — GitHub API client pure functions (`"use node"`)
- `convex/knowledge/chunking.ts` — Chunking logic pure functions (no `"use node"`)
- `convex/knowledge/ingestionWorkflow.ts` — Workflow definition + `cancelIngestion` mutation
- `convex/knowledge/ingestionActions.ts` — Workflow action steps (`"use node"`)
- `convex/knowledge/triggerIngestion.ts` — Public trigger action (`"use node"`)
- `convex/knowledge.chunking.test.ts` — 21 chunking tests
- `convex/knowledge.github.test.ts` — 20 GitHub client tests
- `convex/knowledge.ingestionWorkflow.test.ts` — 18 data-layer tests

### Change Log

- 2026-06-14: Implemented full code ingestion pipeline — GitHub Trees API read, file filtering, content fetching with rate limit handling, chunking with boundary heuristics, durable workflow via @convex-dev/workflow, progress tracking, and cancel support. 59 new tests, all passing.
- 2026-06-13: Code review — 14 patches applied (4 CRITICAL, 3 HIGH, 6 MEDIUM, 1 LOW), 5 dismissed as noise. All 543 Convex + 143 frontend tests pass.

### Review Findings

- [x] [Review][Patch] Race condition: concurrent triggerIngestion creates duplicate KBs [triggerIngestion.ts:27-34] — fixed with kb_status guard replacing TOCTOU check
- [x] [Review][Patch] cancelIngestion patches KB without verifying project ownership [ingestionWorkflow.ts:97] — fixed with KB lookup + project_id verification
- [x] [Review][Patch] start() failure leaves orphaned KB in "building" [triggerIngestion.ts:51-58] — fixed with try/catch that sets status "error"
- [x] [Review][Patch] Missing kb_status guard allows re-trigger when KB is "ready" [triggerIngestion.ts:27-34] — fixed by checking kb_status is "none" or "error"
- [x] [Review][Patch] fetchFileContent silently returns null on auth failures [github.ts:137] — fixed by throwing ConvexError on 401/403
- [x] [Review][Patch] parseOwnerRepo doesn't strip .git suffix [github.ts:35-40] — fixed by stripping .git suffix
- [x] [Review][Patch] getIngestionProgress returns oldest KB, not most recent [queries.ts:78-81] — fixed with .order("desc") + workspace scoping
- [x] [Review][Patch] fetchFileContent size check uses string length, not byte count [github.ts:140] — fixed with TextEncoder byte comparison
- [x] [Review][Patch] Missing { retry: true } on workflow step calls [ingestionWorkflow.ts:32,58] — fixed by adding retry config to all steps
- [x] [Review][Patch] fetchFileContent/fetchFileTree have no fetch timeout [github.ts:84,125] — fixed with AbortController 30s timeout
- [x] [Review][Patch] _deleteChunksByKb deletes one-by-one [internal.ts:109-118] — fixed with batched pagination (100 at a time)
- [x] [Review][Patch] fetchAndChunkFiles processes entire repo in single action [ingestionActions.ts:49-135] — documented as known limitation (requires workflow restructuring)
- [x] [Review][Patch] getIngestionProgress doesn't verify KB's workspace matches project [queries.ts:78-81] — fixed with workspace_id comparison
- [x] [Review][Patch] fetchFileTree doesn't handle HTTP 429 [github.ts:92-102] — fixed with explicit 429 handling
