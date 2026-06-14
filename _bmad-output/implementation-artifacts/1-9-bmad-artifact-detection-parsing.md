---
baseline_commit: e6df243c6c056ed18eaab3c53861a9d81ab9d132
---

# Story 1.9: BMAD Artifact Detection & Parsing

Status: done

## Story

As the system,
I want to detect and parse BMAD Method artifacts in analyzed projects,
so that downstream features can cross-reference declared intent against actual code.

## Acceptance Criteria

1. **AC1 — Schema: `kb_bmad_metadata` table created**: A new `kb_bmad_metadata` table is added to `convex/schema.ts` with fields: `kb_id` (Id<"knowledge_bases">), `workspace_id` (Id<"workspaces">), `type` (union of "prd_section" | "adr" | "convention" | "domain_term"), `key` (string), `content` (string), `source_path` (string), `metadata` (v.any()). Indexes: `by_kb_id`, `by_kb_id_and_type`, `by_workspace_id`. Index names must NOT be `by_creation_time` or `by_id` (reserved).

2. **AC2 — Schema: `knowledge_bases` extended with BMAD fields**: Two new optional fields added to the `knowledge_bases` table: `bmad_detected: v.optional(v.boolean())` and `bmad_parsed_at: v.optional(v.number())`. Both optional — existing KBs and non-BMAD projects have them undefined. Non-breaking.

3. **AC3 — Exclude patterns updated**: `_bmad-output` and `_bmad` are added to `INGESTION_EXCLUDE_DIRS` in `convex/lib/constraints.ts`. `AGENTS.md` and `CONTEXT.md` remain included in code chunking (they are `.md` files, already in `INGESTION_INCLUDE_EXTENSIONS`). This prevents BMAD planning artifacts from polluting code embeddings while keeping agent instructions as useful RAG context.

4. **AC4 — BMAD detection runs in ingestion workflow**: A new workflow step `detectAndParseBmad` is added to `convex/knowledge/ingestionWorkflow.ts`. It runs AFTER the file tree is fetched and BEFORE `extractArchitectureAndModules`, so extraction prompts can use BMAD context. The step scans the file tree for BMAD indicators (`_bmad-output/`, `_bmad/`, `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/adr/`). If no indicators found, sets `bmad_detected = false` and returns (graceful no-op).

5. **AC5 — BMAD artifacts parsed into structured metadata**: When BMAD artifacts are found, the system fetches their content from GitHub and parses them:
   - PRD files (`_bmad-output/planning-artifacts/*prd*.md`) → parsed into sections by `##` headers → stored as type `"prd_section"` with `{ key: sectionTitle, content: sectionContent }`
   - ADR files (`docs/adr/*.md`) → parsed into individual decisions → stored as type `"adr"` with `{ key: adrId, content: decisionText, metadata: { title, status } }`
   - project-context files (`_bmad-output/project-context.md`) → parsed into discrete convention rules from `###` subsections → stored as type `"convention"` with `{ key: ruleCategory, content: rulesText }`
   - CONTEXT.md (root) → parsed into domain glossary terms from `## Glossary` bullet entries → stored as type `"domain_term"` with `{ key: termName, content: termDefinition }`
   - Each entry includes `source_path` pointing to the original file
   - `knowledge_bases.bmad_detected` is set to `true` and `bmad_parsed_at` to current timestamp

6. **AC6 — Extraction prompts wired with BMAD context**: `convex/knowledge/extractionActions.ts` replaces the current `bmadContext = null` placeholder with actual BMAD metadata fetched via a new `_getBmadMetadataForExtraction` internal query. The query returns `{ prdSections: string, adrs: string }` (concatenated text of all prd_section and adr entries). When `bmad_detected` is false/undefined, `bmadContext` remains null — no regression.

7. **AC7 — Public query for BMAD metadata**: A new `getBmadMetadata` query in `convex/knowledge/queries.ts` returns BMAD metadata for a given `knowledge_base_id`, grouped by type. Uses `getOptionalMemberWorkspace` for ownership check. Returns `{ prd_sections, adrs, conventions, domain_terms }` arrays with counts.

8. **AC8 — Collapsible "Declared Intent" UI section**: When `bmad_detected` is true, the KB viewer page (`KnowledgeReady.tsx`) shows a collapsible "Declared Intent" section below the header. It displays: PRD outline (section titles), ADR count and list (id + title), convention count, and domain terms from CONTEXT.md. Collapsed by default. Uses existing `StatusPill` / card patterns. The "BMAD Detected" badge already exists in `page.tsx` (forward-compatible code) — no change needed there.

9. **AC9 — Re-sync clears BMAD metadata**: The `resyncKnowledgeBase` action in `convex/knowledge/triggerIngestion.ts` calls `_deleteBmadMetadataByKb` as part of its cleanup sequence (alongside `_deleteModulesByKb`, `_deleteChunksByKb`, `clearRagNamespace`). The `_resetKbForResync` mutation in `convex/knowledge/internal.ts` also clears `bmad_detected` and `bmad_parsed_at`. The workflow's BMAD step re-detects and re-parses on re-sync.

10. **AC10 — Tests**: Backend tests in `convex/knowledge.bmad.test.ts` covering: parsing functions (PRD section splitting, ADR extraction, convention parsing, domain term parsing), `_storeBmadMetadata` / `_deleteBmadMetadataByKb` mutations, `_setBmadDetected` mutation, `getBmadMetadata` query, `_getBmadMetadataForExtraction` query, `_resetKbForResync` clearing BMAD fields, and workflow step registration. Frontend tests extending `knowledge.test.tsx` for the "Declared Intent" collapsible section (visible when `bmad_detected`, hidden when not, shows PRD/ADR/convention/domain term counts). All tests use existing seed helpers and mock patterns.

## Tasks / Subtasks

- [x] Task 1: Schema changes (AC: #1, #2)
  - [x] Add `kb_bmad_metadata` table to `convex/schema.ts` with indexes `by_kb_id`, `by_kb_id_and_type`, `by_workspace_id`
  - [x] Add `bmad_detected: v.optional(v.boolean())` and `bmad_parsed_at: v.optional(v.number())` to `knowledge_bases` table

- [x] Task 2: Update exclude patterns (AC: #3)
  - [x] Add `"_bmad-output"`, `"_bmad"` to `INGESTION_EXCLUDE_DIRS` array in `convex/lib/constraints.ts`

- [x] Task 3: Create BMAD parsing module (AC: #5)
  - [x] Create `convex/knowledge/bmadParsing.ts` — pure functions, no `"use node"`, no Convex imports
  - [x] `detectBmadFiles(tree: TreeEntry[]): TreeEntry[]` — scans full tree for BMAD indicators
  - [x] `categorizeBmadFile(path: string): BmadFileType` — determines parse strategy per file
  - [x] `parsePrd(content: string, sourcePath: string): BmadMetadataEntry[]` — splits on `##` headers
  - [x] `parseAdr(content: string, sourcePath: string): BmadMetadataEntry | null` — extracts id/title/status/decision
  - [x] `parseProjectContext(content: string, sourcePath: string): BmadMetadataEntry[]` — extracts `###` subsections
  - [x] `parseContextMd(content: string, sourcePath: string): BmadMetadataEntry[]` — extracts glossary terms from `## Glossary` bullets
  - [x] Export `BmadMetadataEntry` type: `{ type, key, content, source_path, metadata? }`

- [x] Task 4: Create BMAD detection + parsing action (AC: #4, #5)
  - [x] Create `convex/knowledge/bmadActions.ts` with `"use node"` at top
  - [x] `detectAndParseBmad` internal action: takes `project_id`, `knowledge_base_id`, `workspace_id`, `repo_url`, `encrypted_pat`, `bmad_files` (TreeEntry[])
  - [x] If `bmad_files.length === 0`: call `_setBmadDetected({ knowledge_base_id, detected: false })`, return `{ detected: false }`
  - [x] Otherwise: decrypt PAT, fetch each BMAD file's content via `fetchFileContent`, categorize and parse via `bmadParsing.ts` functions, collect entries
  - [x] Cap total entries at a reasonable limit (e.g., 200) to prevent oversized metadata
  - [x] Call `_storeBmadMetadata({ kb_id, workspace_id, entries })` internal mutation
  - [x] Call `_setBmadDetected({ knowledge_base_id, detected: true })` which also sets `bmad_parsed_at`
  - [x] Return `{ detected: true, entryCount: entries.length }`

- [x] Task 5: Add internal mutations/queries for BMAD storage (AC: #4, #5, #6, #9)
  - [x] In `convex/knowledge/internal.ts`, add:
    - `_storeBmadMetadata` — batch insert entries into `kb_bmad_metadata`
    - `_deleteBmadMetadataByKb` — batch delete by `kb_id` (same BATCH_SIZE=100 pattern as `_deleteModulesByKb`)
    - `_setBmadDetected` — patches KB record with `bmad_detected` and `bmad_parsed_at` (when detected=true)
    - `_getBmadMetadataForExtraction` — internal query returning `{ prdSections: string, adrs: string, detected: boolean }` for extraction prompts
    - `_getBmadFileList` — internal query returning BMAD files from tree result (optional, if tree modification approach used)
  - [x] Update `_resetKbForResync` to also clear `bmad_detected` and `bmad_parsed_at`

- [x] Task 6: Modify `decryptAndFetchTree` to return BMAD files (AC: #4)
  - [x] In `convex/knowledge/ingestionActions.ts`, after fetching the full tree but before filtering, call `detectBmadFiles(tree)` to get BMAD-related entries
  - [x] Return `{ files, truncated, bmadFiles }` — the BMAD file entries from the unfiltered tree
  - [x] This does NOT change filtering — BMAD files in `_bmad-output/` are still excluded from code chunking via exclude dirs. The `bmadFiles` are returned separately for the BMAD parsing step.

- [x] Task 7: Add BMAD step to ingestion workflow (AC: #4)
  - [x] In `convex/knowledge/ingestionWorkflow.ts`, add a new `step.runAction` call for `detectAndParseBmad` AFTER tree fetch, BEFORE `extractArchitectureAndModules`
  - [x] Pass `treeResult.bmadFiles` to the step (no extra GitHub tree fetch needed)
  - [x] Step is retry-safe (idempotent — `_deleteBmadMetadataByKb` before `_storeBmadMetadata`)

- [x] Task 8: Wire extraction prompts with BMAD context (AC: #6)
  - [x] In `convex/knowledge/extractionActions.ts`, replace lines 73-77 (the forward-compatible placeholder):
    - Query `_getBmadMetadataForExtraction` with the KB ID
    - If `detected` and data present, construct `BmadContext` from returned `prdSections` and `adrs`
    - Otherwise `bmadContext` remains null (no regression)
  - [x] Both `buildArchitectureExtractionPrompt` and `buildModuleExtractionPrompt` already accept `bmadContext` — just pass the real value instead of null

- [x] Task 9: Add public query for BMAD metadata (AC: #7)
  - [x] In `convex/knowledge/queries.ts`, add `getBmadMetadata` query
  - [x] Args: `knowledge_base_id: v.id("knowledge_bases")`
  - [x] Uses `getOptionalMemberWorkspace` for ownership check
  - [x] Queries `kb_bmad_metadata` by `by_kb_id_and_type` index for each type
  - [x] Returns `{ prd_sections: [...], adrs: [...], conventions: [...], domain_terms: [...] }`

- [x] Task 10: Update re-sync to clear BMAD metadata (AC: #9)
  - [x] In `convex/knowledge/triggerIngestion.ts` `resyncKnowledgeBase`, add `_deleteBmadMetadataByKb` call in the cleanup sequence (after `_deleteModulesByKb`, before `_deleteChunksByKb`)
  - [x] Verify `_resetKbForResync` (updated in Task 5) clears `bmad_detected`/`bmad_parsed_at`

- [x] Task 11: Add "Declared Intent" UI section (AC: #8)
  - [x] Create `src/app/(auth)/projects/[id]/knowledge/DeclaredIntent.tsx` component
  - [x] Collapsible card (collapsed by default) with BMAD metadata summary
  - [x] Sections: PRD outline (section keys), ADR list (key + title from metadata), convention count, domain terms
  - [x] In `page.tsx`, add `useQuery(api.knowledge.queries.getBmadMetadata, ...)` with "skip" pattern when `!bmadDetected`
  - [x] Pass metadata to `KnowledgeReady` or render `DeclaredIntent` directly when `bmadDetected && kb.status === "ready"`
  - [x] Follow existing card/styling patterns from `KnowledgeReady.tsx`

- [x] Task 12: Add test helpers (AC: #10)
  - [x] In `convex/testHelpers.ts`, add `seedBmadMetadata(t, workspaceId, kbId, entries)` helper

- [x] Task 13: Write backend tests (AC: #10)
  - [x] Create `convex/knowledge.bmad.test.ts`
  - [x] Test `detectBmadFiles`: full tree with and without BMAD indicators
  - [x] Test `parsePrd`: splits markdown on `##` headers correctly
  - [x] Test `parseAdr`: extracts id, title, status, decision from ADR format
  - [x] Test `parseProjectContext`: extracts `###` subsections as conventions
  - [x] Test `parseContextMd`: extracts glossary terms from `- **Term** — Definition` format
  - [x] Test `_storeBmadMetadata`: inserts entries, returns count
  - [x] Test `_deleteBmadMetadataByKb`: deletes all entries for KB, returns count
  - [x] Test `_setBmadDetected`: sets `bmad_detected` and `bmad_parsed_at` on KB
  - [x] Test `_resetKbForResync`: clears `bmad_detected` and `bmad_parsed_at` (extend existing test)
  - [x] Test `getBmadMetadata`: returns grouped metadata, respects workspace ownership
  - [x] Test `_getBmadMetadataForExtraction`: returns concatenated PRD sections and ADRs
  - [x] Test `detectAndParseBmad` action registration

- [x] Task 14: Write frontend tests (AC: #10)
  - [x] Extend `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx`
  - [x] Test: "Declared Intent" section visible when `bmad_detected` is true and KB ready
  - [x] Test: "Declared Intent" section hidden when `bmad_detected` is false/undefined
  - [x] Test: section expands/collapses on click
  - [x] Test: shows correct PRD section count, ADR count, convention count, domain term count

- [x] Task 15: Run validation (AC: #10)
  - [x] `pnpm lint` — zero new errors
  - [x] `pnpm test` — all frontend tests pass
  - [x] `pnpm test:convex` — all backend tests pass

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- `kb_bmad_metadata` table + `bmad_detected`/`bmad_parsed_at` fields on `knowledge_bases`
- Exclude pattern update (`_bmad-output`, `_bmad` excluded from embeddings)
- BMAD file detection from the full GitHub tree
- Parsing of PRD sections, ADRs, conventions, domain terms into structured metadata
- New workflow step in ingestion pipeline (runs on both initial build AND re-sync)
- Wiring real BMAD context into extraction prompts (completing enhanced Story 1.5 ACs)
- `getBmadMetadata` public query for UI consumption
- Collapsible "Declared Intent" UI section in KB viewer (completing enhanced Story 1.6 ACs)
- Re-sync cleanup of old BMAD metadata
- Backend + frontend tests

**This story does NOT implement:**
- Baseline RD cross-referencing with BMAD PRD (Story 2.1 enhanced ACs — Epic 2 scope)
- BMAD-aware drift dimensions (Story 2.2 enhanced ACs — Epic 2 scope)
- Impact analysis ADR conflict checks (Story 4.1 enhanced ACs — Epic 4 scope)
- BMAD-format export (Story 2.4, 4.4 enhanced ACs — Epic 2/4 scope)
- BMAD story file format generation (Story 4.2 enhanced ACs — Epic 4 scope)
- Parsing `_bmad/` framework code (only `_bmad-output/` planning artifacts are parsed; `_bmad/` is excluded from embeddings but not parsed — it's framework tooling, not project intent)

### Critical Architecture: BMAD Detection Flow in the Workflow

The BMAD step is inserted between tree fetch and extraction. This ordering is deliberate:

```
┌─────────────────────────────────────────────────────────────┐
│ ingestionWorkflow                                           │
├─────────────────────────────────────────────────────────────┤
│ 1. _getProjectForIngestion (existing)                       │
│ 2. decryptAndFetchTree → { files, truncated, bmadFiles }    │
│    ↑ MODIFIED to also return bmadFiles from unfiltered tree │
│ 3. fetchAndChunkFiles (existing — unchanged)                │
│ 4. embedChunks (existing — unchanged)                       │
│ 5. ★ detectAndParseBmad ← NEW STEP                          │
│    ├── If bmadFiles empty → set bmad_detected=false, return │
│    ├── Fetch each BMAD file content from GitHub             │
│    ├── Parse into structured entries (pure functions)       │
│    ├── _storeBmadMetadata (batch insert)                    │
│    └── _setBmadDetected(true) + bmad_parsed_at              │
│ 6. extractArchitectureAndModules (existing — MODIFIED)      │
│    └── Now queries _getBmadMetadataForExtraction            │
│        └── Constructs BmadContext for prompts               │
│ 7. Set status "ready" (existing)                            │
└─────────────────────────────────────────────────────────────┘
```

**Why BMAD step is BEFORE extraction:** The enhanced Story 1.5 ACs require extraction prompts to include BMAD PRD sections and ADRs. If BMAD parsing ran after extraction, the first build would never have BMAD context. By parsing first, extraction immediately benefits from declared intent.

**Why `decryptAndFetchTree` returns `bmadFiles`:** The full tree is already fetched in this step. BMAD files in `_bmad-output/` are excluded from code chunking by the exclude dirs filter, but we still need their paths for BMAD detection. Returning them alongside the filtered code files avoids a second tree fetch.

### Architecture: `detectBmadFiles` — Tree Scanning

Pure function in `convex/knowledge/bmadParsing.ts`:

```typescript
const BMAD_PATH_PREFIXES = ["_bmad-output/", "_bmad/", "docs/adr/"];
const BMAD_PATH_EXACT = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];

export function detectBmadFiles(tree: TreeEntry[]): TreeEntry[] {
  return tree.filter((entry) => {
    if (entry.type !== "blob") return false;
    return (
      BMAD_PATH_PREFIXES.some((p) => entry.path.startsWith(p)) ||
      BMAD_PATH_EXACT.includes(entry.path)
    );
  });
}
```

This scans the FULL unfiltered tree. Called in `decryptAndFetchTree` BEFORE `filterFiles`.

### Architecture: File Categorization and Parsing

Each detected BMAD file is categorized by path to determine its parser:

```typescript
type BmadFileType = "prd" | "adr" | "project_context" | "context_md" | "agents_md" | "other";

function categorizeBmadFile(path: string): BmadFileType {
  if (path.startsWith("docs/adr/") && path.endsWith(".md")) return "adr";
  if (path === "CONTEXT.md") return "context_md";
  if (path === "AGENTS.md" || path === "CLAUDE.md") return "agents_md";
  if (path.includes("project-context")) return "project_context";
  if (/\bprd\b/i.test(path) && path.endsWith(".md")) return "prd";
  return "other";
}
```

**PRD parsing** — splits on `## ` headers, skipping the first `#` title:
```typescript
function parsePrd(content: string, sourcePath: string): BmadMetadataEntry[] {
  const sections = content.split(/\n(?=## )/);
  return sections
    .filter((s) => s.startsWith("## "))
    .map((s) => {
      const lineEnd = s.indexOf("\n");
      const title = s.slice(3, lineEnd === -1 ? s.length : lineEnd).trim();
      const body = lineEnd === -1 ? "" : s.slice(lineEnd + 1).trim();
      return { type: "prd_section", key: title, content: body, source_path: sourcePath };
    });
}
```

**ADR parsing** — extracts id from filename, title from `# ADR NNNN:`, status from `## Status`:
```typescript
function parseAdr(content: string, sourcePath: string): BmadMetadataEntry | null {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const statusMatch = content.match(/^##\s+Status\s*\n\s*(\w+)/m);
  const decisionMatch = content.match(/^##\s+Decision\s*\n([\s\S]*?)(?=\n##\s|$)/m);

  const filename = sourcePath.split("/").pop() ?? sourcePath;
  const idMatch = filename.match(/^(\d+)/);
  const adrId = idMatch ? `ADR-${idMatch[1].padStart(4, "0")}` : filename;

  return {
    type: "adr",
    key: adrId,
    content: decisionMatch?.[1]?.trim() ?? content.slice(0, 500),
    source_path: sourcePath,
    metadata: {
      title: titleMatch?.[1]?.trim() ?? adrId,
      status: statusMatch?.[1]?.trim() ?? "Unknown",
    },
  };
}
```

**project-context.md parsing** — extracts `###` subsections as convention categories:
```typescript
function parseProjectContext(content: string, sourcePath: string): BmadMetadataEntry[] {
  // Strip YAML frontmatter
  const body = content.replace(/^---[\s\S]*?---\n/, "");
  const sections = body.split(/\n(?=### )/);
  return sections
    .filter((s) => s.startsWith("### "))
    .map((s) => {
      const lineEnd = s.indexOf("\n");
      const title = s.slice(4, lineEnd === -1 ? s.length : lineEnd).trim();
      const rules = lineEnd === -1 ? "" : s.slice(lineEnd + 1).trim();
      return { type: "convention", key: title, content: rules, source_path: sourcePath };
    });
}
```

**CONTEXT.md parsing** — extracts glossary terms from `## Glossary` bullets:
```typescript
function parseContextMd(content: string, sourcePath: string): BmadMetadataEntry[] {
  const glossaryMatch = content.match(/^##\s+Glossary\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  if (!glossaryMatch) return [];
  const lines = glossaryMatch[1].split("\n");
  const entries: BmadMetadataEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^-\s+\*\*(.+?)\*\*\s+[—–-]\s+(.+)$/);
    if (match) {
      entries.push({
        type: "domain_term",
        key: match[1].trim(),
        content: match[2].trim(),
        source_path: sourcePath,
      });
    }
  }
  return entries;
}
```

**Reference formats (from this project's own artifacts):**
- ADR format: See `docs/adr/0001-separate-test-runner.md` — `# ADR NNNN: Title`, `## Status` (Accepted/Proposed/Superseded), `## Context`, `## Decision`, `## Consequences`
- CONTEXT.md format: See project root `CONTEXT.md` — `## Glossary` with `- **Term** — Definition` entries
- project-context.md format: See `_bmad-output/project-context.md` — YAML frontmatter, `### Rule Category` subsections
- PRD format: See `_bmad-output/planning-artifacts/prd-msi-analyst.md` — `##` numbered sections

### Architecture: `detectAndParseBmad` Internal Action

New file `convex/knowledge/bmadActions.ts`:

```typescript
"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { decryptPat } from "./crypto";
import { parseOwnerRepo, fetchFileContent } from "./github";
import {
  detectBmadFiles,
  categorizeBmadFile,
  parsePrd,
  parseAdr,
  parseProjectContext,
  parseContextMd,
  type BmadMetadataEntry,
} from "./bmadParsing";
import { GITHUB_DEFAULT_BRANCH } from "../lib/constraints";

const MAX_BMAD_ENTRIES = 200;
const MAX_BMAD_FILE_SIZE = 200 * 1024; // 200KB per file

export const detectAndParseBmad = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    repo_url: v.string(),
    encrypted_pat: v.string(),
    bmad_files: v.array(v.object({
      path: v.string(),
      size: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    if (args.bmad_files.length === 0) {
      await ctx.runMutation(internal.knowledge.internal._setBmadDetected, {
        knowledge_base_id: args.knowledge_base_id,
        detected: false,
      });
      return { detected: false, entryCount: 0 };
    }

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError("Encryption key not configured");
    }

    const pat = decryptPat(args.encrypted_pat, encryptionKey);
    const { owner, repo } = parseOwnerRepo(args.repo_url);

    const entries: BmadMetadataEntry[] = [];

    for (const file of args.bmad_files) {
      if (entries.length >= MAX_BMAD_ENTRIES) break;
      if (file.size && file.size > MAX_BMAD_FILE_SIZE) continue;

      const content = await fetchFileContent(
        owner, repo, GITHUB_DEFAULT_BRANCH, file.path, pat,
      );
      if (!content) continue;

      const fileType = categorizeBmadFile(file.path);
      let parsed: BmadMetadataEntry[] = [];

      switch (fileType) {
        case "prd":
          parsed = parsePrd(content, file.path);
          break;
        case "adr":
          const adr = parseAdr(content, file.path);
          parsed = adr ? [adr] : [];
          break;
        case "project_context":
          parsed = parseProjectContext(content, file.path);
          break;
        case "context_md":
          parsed = parseContextMd(content, file.path);
          break;
        default:
          continue; // Skip agents_md, other — not parsed for metadata
      }

      for (const entry of parsed) {
        if (entries.length >= MAX_BMAD_ENTRIES) break;
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      // BMAD files existed but none were parseable
      await ctx.runMutation(internal.knowledge.internal._setBmadDetected, {
        knowledge_base_id: args.knowledge_base_id,
        detected: false,
      });
      return { detected: false, entryCount: 0 };
    }

    await ctx.runMutation(internal.knowledge.internal._storeBmadMetadata, {
      kb_id: args.knowledge_base_id,
      workspace_id: args.workspace_id,
      entries,
    });

    await ctx.runMutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: args.knowledge_base_id,
      detected: true,
    });

    return { detected: true, entryCount: entries.length };
  },
});
```

### Architecture: `_setBmadDetected` Internal Mutation

In `convex/knowledge/internal.ts`:

```typescript
export const _setBmadDetected = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    detected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      bmad_detected: args.detected,
    };
    if (args.detected) {
      patch.bmad_parsed_at = Date.now();
    } else {
      patch.bmad_parsed_at = undefined;
    }
    await ctx.db.patch(args.knowledge_base_id, patch);
  },
});
```

### Architecture: `_storeBmadMetadata` and `_deleteBmadMetadataByKb`

Follow the exact same batch pattern as `_storeModules` and `_deleteModulesByKb`:

```typescript
export const _storeBmadMetadata = internalMutation({
  args: {
    kb_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    entries: v.array(v.object({
      type: v.union(
        v.literal("prd_section"),
        v.literal("adr"),
        v.literal("convention"),
        v.literal("domain_term"),
      ),
      key: v.string(),
      content: v.string(),
      source_path: v.string(),
      metadata: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    const ids: Id<"kb_bmad_metadata">[] = [];
    for (const entry of args.entries) {
      const id = await ctx.db.insert("kb_bmad_metadata", {
        kb_id: args.kb_id,
        workspace_id: args.workspace_id,
        ...entry,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const _deleteBmadMetadataByKb = internalMutation({
  args: { knowledge_base_id: v.id("knowledge_bases") },
  handler: async (ctx, args) => {
    // Same BATCH_SIZE=100 loop pattern as _deleteModulesByKb
    let deletedCount = 0;
    const BATCH_SIZE = 100;
    let hasMore = true;
    while (hasMore) {
      const items = await ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id", (q) => q.eq("kb_id", args.knowledge_base_id))
        .take(BATCH_SIZE);
      if (items.length === 0) { hasMore = false; break; }
      for (const item of items) { await ctx.db.delete(item._id); deletedCount++; }
      if (items.length < BATCH_SIZE) { hasMore = false; }
    }
    return deletedCount;
  },
});
```

### Architecture: `_getBmadMetadataForExtraction` Internal Query

Returns data in the `BmadContext` format that `extractionPrompts.ts` already expects:

```typescript
export const _getBmadMetadataForExtraction = internalQuery({
  args: { knowledge_base_id: v.id("knowledge_bases") },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb || !kb.bmad_detected) {
      return { detected: false, prdSections: "", adrs: "" };
    }

    const prdEntries = await ctx.db
      .query("kb_bmad_metadata")
      .withIndex("by_kb_id_and_type", (q) =>
        q.eq("kb_id", args.knowledge_base_id).eq("type", "prd_section"),
      )
      .collect();

    const adrEntries = await ctx.db
      .query("kb_bmad_metadata")
      .withIndex("by_kb_id_and_type", (q) =>
        q.eq("kb_id", args.knowledge_base_id).eq("type", "adr"),
      )
      .collect();

    const prdSections = prdEntries
      .map((e) => `### ${e.key}\n${e.content}`)
      .join("\n\n");

    const adrs = adrEntries
      .map((e) => {
        const meta = e.metadata as { title?: string; status?: string };
        return `- **${e.key}**: ${meta?.title ?? e.key} (${meta?.status ?? "Unknown"})\n${e.content}`;
      })
      .join("\n\n");

    return { detected: true, prdSections, adrs };
  },
});
```

### Architecture: Wiring Extraction Prompts (extractionActions.ts)

Replace lines 73-77 in `convex/knowledge/extractionActions.ts`:

```typescript
// BEFORE (current placeholder):
const bmadContext: BmadContext | null = null;
if (kb && (kb as Record<string, unknown>).bmad_detected) {
  // Forward-compatible: Story 1.9 will add ...
}

// AFTER:
let bmadContext: BmadContext | null = null;
if (kb?.bmad_detected) {
  const bmadData = await ctx.runQuery(
    internal.knowledge.internal._getBmadMetadataForExtraction,
    { knowledge_base_id: args.knowledge_base_id },
  );
  if (bmadData.detected && (bmadData.prdSections || bmadData.adrs)) {
    bmadContext = {
      prdSections: bmadData.prdSections,
      adrs: bmadData.adrs,
    };
  }
}
```

The `BmadContext` type and prompt builders already exist in `extractionPrompts.ts` — no changes needed there.

### Architecture: `getBmadMetadata` Public Query

In `convex/knowledge/queries.ts`:

```typescript
export const getBmadMetadata = query({
  args: { knowledge_base_id: v.id("knowledge_bases") },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb || kb.workspace_id !== memberWorkspace.workspace._id) return null;

    const [prdSections, adrs, conventions, domainTerms] = await Promise.all([
      ctx.db.query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "prd_section"))
        .collect(),
      ctx.db.query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "adr"))
        .collect(),
      ctx.db.query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "convention"))
        .collect(),
      ctx.db.query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "domain_term"))
        .collect(),
    ]);

    return { prd_sections: prdSections, adrs, conventions, domain_terms: domainTerms };
  },
});
```

### Architecture: `decryptAndFetchTree` Modification

In `convex/knowledge/ingestionActions.ts`, add BMAD detection before filtering:

```typescript
// After fetching tree, before filtering:
const bmadFiles = detectBmadFiles(tree).map((entry) => ({
  path: entry.path,
  size: entry.size ?? 0,
}));

const filtered = filterFiles(tree); // existing — unchanged
const files = filtered.map((entry) => ({
  path: entry.path,
  size: entry.size ?? 0,
}));

return { files, truncated, bmadFiles };
```

### Architecture: Workflow Step Addition

In `convex/knowledge/ingestionWorkflow.ts`, insert after the tree fetch step and before `fetchAndChunkFiles`:

```typescript
// After decryptAndFetchTree, before fetchAndChunkFiles:
if (treeResult.bmadFiles && treeResult.bmadFiles.length > 0) {
  await step.runAction(
    internal.knowledge.bmadActions.detectAndParseBmad,
    {
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      workspace_id: project.workspace_id,
      repo_url: project.repo_url,
      encrypted_pat: project.encrypted_pat,
      bmad_files: treeResult.bmadFiles,
    },
    { retry: true },
  );
} else {
  // No BMAD files — set detected=false
  await step.runMutation(internal.knowledge.internal._setBmadDetected, {
    knowledge_base_id: args.knowledge_base_id,
    detected: false,
  });
}
```

### Architecture: Re-Sync Cleanup

In `convex/knowledge/triggerIngestion.ts` `resyncKnowledgeBase`, add after `_deleteModulesByKb`:

```typescript
await ctx.runMutation(internal.knowledge.internal._deleteBmadMetadataByKb, {
  knowledge_base_id: existingKb._id,
});
```

And in `_resetKbForResync` (internal.ts), add:
```typescript
bmad_detected: undefined,
bmad_parsed_at: undefined,
```

### Architecture: "Declared Intent" UI Component

Create `src/app/(auth)/projects/[id]/knowledge/DeclaredIntent.tsx`:

```tsx
"use client";

import { useState } from "react";

type DeclaredIntentProps = {
  metadata: {
    prd_sections: { key: string }[];
    adrs: { key: string; metadata?: { title?: string; status?: string } }[];
    conventions: { key: string }[];
    domain_terms: { key: string; content: string }[];
  };
};

export function DeclaredIntent({ metadata }: DeclaredIntentProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
          Declared Intent
        </h3>
        <svg /* chevron icon, rotate based on expanded */ />
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-[var(--border-soft)]">
          {/* PRD outline, ADR list, convention count, domain terms */}
        </div>
      )}
    </div>
  );
}
```

Wire in `page.tsx`:
```typescript
const bmadMetadata = useQuery(
  api.knowledge.queries.getBmadMetadata,
  bmadDetected && kb && kb.status === "ready"
    ? { knowledge_base_id: kb._id }
    : "skip",
);
```

### Forward-Compatible Code Already in Place

These pieces were written in Stories 1.5/1.6 with Story 1.9 in mind:

1. **`extractionActions.ts:73-77`** — `bmadContext = null` placeholder with `// Forward-compatible: Story 1.9 will add...` comment. Replace with real query (Task 8).
2. **`extractionPrompts.ts:43-46`** — `BmadContext` type already defined as `{ prdSections: string, adrs: string }`. Both prompt builders already accept and render `bmadContext`. No changes needed.
3. **`page.tsx:104-128`** — Already reads `bmad_detected` from KB document and renders "BMAD Detected" badge. Has `TODO(Story 1.9)` comment for the collapsible section. Wire the query and component (Task 11).

### Existing Code to Modify

| File | Change | Breaking? |
|------|--------|-----------|
| `convex/schema.ts` | ADD `kb_bmad_metadata` table; ADD `bmad_detected`/`bmad_parsed_at` to `knowledge_bases` | No — additive, both optional |
| `convex/lib/constraints.ts` | ADD `"_bmad-output"`, `"_bmad"` to `INGESTION_EXCLUDE_DIRS` | No — more files excluded (desired) |
| `convex/knowledge/ingestionActions.ts` | MODIFY `decryptAndFetchTree` return to include `bmadFiles` | No — only consumer is workflow |
| `convex/knowledge/ingestionWorkflow.ts` | ADD BMAD detection step | No — new step, additive |
| `convex/knowledge/internal.ts` | ADD `_storeBmadMetadata`, `_deleteBmadMetadataByKb`, `_setBmadDetected`, `_getBmadMetadataForExtraction`; MODIFY `_resetKbForResync` | No — additive + extend existing |
| `convex/knowledge/extractionActions.ts` | REPLACE null placeholder with real BMAD query | No — was designed for this |
| `convex/knowledge/queries.ts` | ADD `getBmadMetadata` query | No — new export |
| `convex/knowledge/triggerIngestion.ts` | ADD `_deleteBmadMetadataByKb` to re-sync cleanup | No — additive to cleanup sequence |
| `src/app/(auth)/projects/[id]/knowledge/page.tsx` | ADD `getBmadMetadata` query, render `DeclaredIntent` | No — additive, conditional |
| `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` | Accept optional `bmadMetadata` prop, render `DeclaredIntent` | No — optional prop |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/knowledge/bmadParsing.ts` | Pure parsing functions for BMAD artifacts (no Convex/Node imports — fully testable) |
| `convex/knowledge/bmadActions.ts` | `"use node"` action — fetches BMAD file content from GitHub, calls parsers, stores metadata |
| `src/app/(auth)/projects/[id]/knowledge/DeclaredIntent.tsx` | Collapsible UI component showing parsed BMAD metadata summary |
| `convex/knowledge.bmad.test.ts` | Backend tests for parsing, storage, queries |

### Key Dependencies

- No new npm packages needed
- `fetchFileContent`, `parseOwnerRepo` from `convex/knowledge/github.ts` — already available for fetching BMAD file content
- `decryptPat` from `convex/knowledge/crypto.ts` — already available
- `GITHUB_DEFAULT_BRANCH` from `convex/lib/constraints.ts` — already available
- All Convex hooks, UI components, testing libraries already installed

### Previous Story Intelligence (Story 1.8)

**Key learnings from Story 1.8:**
1. **Re-sync cleanup order matters:** Story 1.8 review found KB status should be set to "building" BEFORE destructive cleanup. Follow the same pattern — status first, cleanup second.
2. **Batch delete pattern:** Use `BATCH_SIZE = 100` loop with `.take()` for safe batch deletion. Same pattern as `_deleteModulesByKb` and `_deleteChunksByKb`.
3. **`_resetKbForResync` clears optional fields:** Use `patch` with `undefined` to remove optional fields. Extend this for `bmad_detected`/`bmad_parsed_at`.
4. **Convex `patch` with `undefined`:** This is the correct way to clear optional fields in Convex — it removes the field entirely.
5. **Extraction idempotency:** Story 1.8 wired `_deleteModulesByKb` before `_storeModules` for idempotent extraction on retry. Same pattern for BMAD: `_deleteBmadMetadataByKb` before `_storeBmadMetadata` (or just delete in re-sync cleanup and let workflow step store fresh).
6. **Test file location:** Backend tests at `convex/` root (`convex/knowledge.bmad.test.ts`). Frontend tests co-located with source.
7. **Registration tests:** For actions that can't run fully in tests (need GitHub API), test registration (function is exported) + test pure logic separately.

**What Story 1.8 established that this story builds on:**
- Re-sync cleanup sequence in `resyncKnowledgeBase` — extend with BMAD metadata cleanup
- `_resetKbForResync` mutation — extend to clear BMAD fields
- Workflow retry safety pattern — BMAD step must be idempotent
- Test helper `seedKnowledgeBase` — extend with `seedBmadMetadata`

### Git Intelligence

Recent commits:
- `e6df243` — Story 1.8 — KB re-sync with code review fixes
- `81ebcfa` — Story 1.7 — module detail view
- `ad67e42` — Stories 1.5 & 1.6 — AI extraction + KB viewer UI
- `a26975a` — Story 1.4 — vector embeddings & RAG storage
- `b56819b` — Stories 1.2 & 1.3 — ingestion pipeline
- Pattern: each story is a single `feat:` commit

### Non-BMAD Project Regression Safety

**Critical design principle:** When `bmad_detected` is false or undefined, ALL behavior must be identical to current implementation.

- Extraction prompts: `bmadContext` is null → prompt section is empty string → identical to current
- KB viewer: "Declared Intent" section not rendered, badge not shown → identical to current
- `getBmadMetadata` query returns null/empty → no UI impact
- Exclude pattern change: only affects repos with `_bmad-output/` or `_bmad/` dirs. Repos without these are unaffected.
- Workflow step: if no BMAD files in tree, `_setBmadDetected(false)` is a no-op mutation → negligible overhead

### Schema Change Verification

After adding fields to `knowledge_bases`, the existing `seedKnowledgeBase` test helper needs updating to accept the new optional fields (but existing tests don't need to pass them — they're optional).

After adding `kb_bmad_metadata` table, Convex dev server (`pnpm dev`) must be running for schema sync. The table will appear automatically — no migration needed since all fields are new.

### Project Structure Notes

- New `convex/knowledge/bmadParsing.ts` contains ONLY pure functions — no `"use node"`, no Convex imports. This makes it fully testable without convex-test infrastructure.
- New `convex/knowledge/bmadActions.ts` has `"use node"` (needs `fetchFileContent`, `decryptPat`). CANNOT export queries or mutations — only internal actions.
- `DeclaredIntent.tsx` is a client component (`"use client"`) — uses `useState` for collapse toggle.
- All new backend code follows the domain directory pattern: `convex/knowledge/` → type files.
- Parsing logic is intentionally simple (regex + string splitting). No markdown parser dependency. BMAD artifacts have predictable structure.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9] — ACs and user story
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md] — Full BMAD-aware change proposal with schema design
- [Source: convex/schema.ts#knowledge_bases] — KB table schema (add fields here)
- [Source: convex/schema.ts#kb_modules] — Reference table pattern for new `kb_bmad_metadata`
- [Source: convex/lib/constraints.ts#INGESTION_EXCLUDE_DIRS] — Exclude dirs to extend
- [Source: convex/knowledge/github.ts#filterFiles] — File filtering logic (excludes BMAD dirs via exclude list)
- [Source: convex/knowledge/github.ts#fetchFileContent] — File content fetcher for BMAD files
- [Source: convex/knowledge/ingestionActions.ts#decryptAndFetchTree] — Action to modify (return bmadFiles)
- [Source: convex/knowledge/ingestionWorkflow.ts] — Workflow to extend (add BMAD step)
- [Source: convex/knowledge/extractionActions.ts#L73-77] — Forward-compatible placeholder to replace
- [Source: convex/knowledge/extractionPrompts.ts#L43-46] — BmadContext type (already defined, no changes)
- [Source: convex/knowledge/internal.ts#_deleteModulesByKb] — Batch delete pattern to follow for `_deleteBmadMetadataByKb`
- [Source: convex/knowledge/internal.ts#_storeModules] — Batch insert pattern to follow for `_storeBmadMetadata`
- [Source: convex/knowledge/internal.ts#_resetKbForResync] — Mutation to extend (clear BMAD fields)
- [Source: convex/knowledge/queries.ts#getModules] — Query pattern with `getOptionalMemberWorkspace` to follow for `getBmadMetadata`
- [Source: convex/knowledge/triggerIngestion.ts#resyncKnowledgeBase] — Re-sync cleanup to extend
- [Source: src/app/(auth)/projects/[id]/knowledge/page.tsx#L104-128] — Forward-compatible badge code (already done)
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx] — Component to extend with DeclaredIntent
- [Source: convex/testHelpers.ts#seedKnowledgeBase] — Seed helper pattern for new `seedBmadMetadata`
- [Source: convex/testHelpers.ts#seedModule] — Batch seed pattern reference
- [Source: _bmad-output/project-context.md] — Reference format for convention parsing
- [Source: CONTEXT.md] — Reference format for domain term parsing
- [Source: docs/adr/0001-separate-test-runner.md] — Reference format for ADR parsing
- [Source: _bmad-output/planning-artifacts/prd-msi-analyst.md] — Reference format for PRD section parsing
- [Source: _bmad-output/implementation-artifacts/1-8-knowledge-base-re-sync.md] — Previous story learnings (re-sync cleanup patterns)
- [Source: _bmad-output/project-context.md] — Critical implementation rules

## Dev Agent Record

### Agent Model Used

glm-5.1 (zai-coding-plan/glm-5.1)

### Debug Log References

- Fixed `parseContextMd` regex bug: the `m` flag on the glossary regex caused `$` to match end-of-line prematurely, capturing only the first glossary entry. Rewrote as a line-by-line state machine for robust parsing.

### Completion Notes List

- All 15 tasks completed. All 10 acceptance criteria satisfied.
- Schema: Added `kb_bmad_metadata` table with 3 indexes (`by_kb_id`, `by_kb_id_and_type`, `by_workspace_id`) and `bmad_detected`/`bmad_parsed_at` optional fields on `knowledge_bases`.
- Exclude patterns: `_bmad-output` and `_bmad` added to `INGESTION_EXCLUDE_DIRS` to prevent BMAD artifacts from polluting code embeddings.
- BMAD parsing module (`bmadParsing.ts`): 6 pure functions — `detectBmadFiles`, `categorizeBmadFile`, `parsePrd`, `parseAdr`, `parseProjectContext`, `parseContextMd`. No Convex/Node imports, fully testable.
- BMAD action (`bmadActions.ts`): `"use node"` internal action that fetches BMAD files from GitHub, parses them, and stores metadata. Idempotent (deletes before storing). Capped at 200 entries.
- Internal mutations/queries: `_storeBmadMetadata`, `_deleteBmadMetadataByKb`, `_setBmadDetected`, `_getBmadMetadataForExtraction` added to `internal.ts`. `_resetKbForResync` extended to clear BMAD fields.
- Workflow: BMAD step inserted between embedding and extraction in `ingestionWorkflow.ts`. Tree result now includes `bmadFiles`.
- Extraction: Forward-compatible placeholder replaced with real `_getBmadMetadataForExtraction` query in `extractionActions.ts`.
- Public query: `getBmadMetadata` added to `queries.ts` with `getOptionalMemberWorkspace` ownership check.
- Re-sync: `_deleteBmadMetadataByKb` added to cleanup sequence in `triggerIngestion.ts`.
- Frontend: `DeclaredIntent.tsx` collapsible component, wired in `page.tsx` with "skip" pattern query.
- Tests: 37 backend tests (`knowledge.bmad.test.ts`), 6 new frontend tests in `knowledge.test.tsx`. All 871 total tests pass (685 convex + 186 frontend).
- Lint: 0 errors. Only pre-existing warnings.

### File List

**Modified:**
- `convex/schema.ts` — Added `kb_bmad_metadata` table + `bmad_detected`/`bmad_parsed_at` fields on `knowledge_bases`
- `convex/lib/constraints.ts` — Added `_bmad-output`, `_bmad` to `INGESTION_EXCLUDE_DIRS`
- `convex/knowledge/internal.ts` — Added `_storeBmadMetadata`, `_deleteBmadMetadataByKb`, `_setBmadDetected`, `_getBmadMetadataForExtraction`; extended `_resetKbForResync`
- `convex/knowledge/ingestionActions.ts` — `decryptAndFetchTree` now returns `bmadFiles` via `detectBmadFiles`
- `convex/knowledge/ingestionWorkflow.ts` — Added BMAD detection step between embedding and extraction
- `convex/knowledge/extractionActions.ts` — Replaced null placeholder with real BMAD metadata query
- `convex/knowledge/queries.ts` — Added `getBmadMetadata` public query
- `convex/knowledge/triggerIngestion.ts` — Added `_deleteBmadMetadataByKb` to re-sync cleanup
- `convex/testHelpers.ts` — Added `seedBmadMetadata` helper
- `src/app/(auth)/projects/[id]/knowledge/page.tsx` — Added `getBmadMetadata` query + `DeclaredIntent` rendering
- `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx` — Extended with 6 Declared Intent tests

**Created:**
- `convex/knowledge/bmadParsing.ts` — Pure parsing functions for BMAD artifacts
- `convex/knowledge/bmadActions.ts` — `"use node"` action for BMAD detection + parsing
- `src/app/(auth)/projects/[id]/knowledge/DeclaredIntent.tsx` — Collapsible UI component
- `convex/knowledge.bmad.test.ts` — 37 backend tests

### Review Findings

- [x] [Review][Patch] [CRITICAL] `_storeBmadMetadata` rejects entries without `metadata` key [convex/knowledge/internal.ts:449, convex/schema.ts:408] — schema + validator use `v.any()` (required key) but parsers (`parsePrd`, `parseProjectContext`, `parseContextMd`) produce entries WITHOUT `metadata` field. Only `parseAdr` includes it. Production ingestion of any repo with PRD/convention/domain terms fails. Tests masked this by manually passing `metadata: null`. Fix: change to `v.optional(v.any())` in both schema and validator.
- [x] [Review][Patch] [HIGH] No error handling in `detectAndParseBmad` [convex/knowledge/bmadActions.ts:36-95] — single malformed file or GitHub fetch failure throws, aborting entire ingestion pipeline. Wrap per-file processing in try/catch, log, continue.
- [x] [Review][Patch] [HIGH] `agents_md` files (AGENTS.md, CLAUDE.md) fetched from GitHub but never parsed [convex/knowledge/bmadParsing.ts:20,27 + bmadActions.ts:68-70] — detected in `detectBmadFiles`, fetched via `fetchFileContent`, then hit switch `default: continue`. Wasted API calls + false expectation of ingestion. Filter them out before fetching or add a parser.
- [x] [Review][Patch] [HIGH] File-size guard bypassed when `file.size` is 0/undefined [convex/knowledge/ingestionActions.ts:42 + bmadActions.ts:57] — `ingestionActions` maps undefined→0, then `if (file.size && ...)` short-circuits on falsy 0. Guard is dead code. Fix: `if (file.size !== undefined && file.size > MAX_BMAD_FILE_SIZE) continue;` and/or enforce content-length cap after fetch.
- [x] [Review][Patch] [HIGH] Unbounded BMAD context strings blow AI context window [convex/knowledge/internal.ts:558-567] — `_getBmadMetadataForExtraction` concatenates all entries via `.collect()` + `.join()` with no size limit. Up to 200 entries × ~100KB each. Injected into extraction prompts alongside already-capped `sampledCode`. Add a character budget/truncation.
- [x] [Review][Patch] [MEDIUM] `MAX_BMAD_FILE_SIZE` (200KB) unreachable — `fetchFileContent` caps at 100KB [convex/knowledge/bmadActions.ts:20 + github.ts:184] — files 100-200KB silently dropped. Align limits.
- [x] [Review][Patch] [MEDIUM] PRD detection regex `\bprd\b` dangerously broad [convex/knowledge/bmadParsing.ts:37] — matches "prd" anywhere in path (`docs/sprint-prd-process.md` → false positive PRD). Constrain to `_bmad-output/` prefix.
- [x] [Review][Patch] [MEDIUM] `parseContextMd` glossary regex misses `:` separator format [convex/knowledge/bmadParsing.ts:127] — only matches `- **Term** — Def`. Common `- **Term**: Def` colon format silently produces `[]`. Extend regex character class.
- [x] [Review][Patch] [LOW] `parseAdr` never returns null despite `| null` type [convex/knowledge/bmadParsing.ts:61-87] — signature says `BmadMetadataEntry | null` but all paths return non-null. Empty/garbage ADR files produce entries with empty content. Add null return for invalid content or fix type.
- [x] [Review][Patch] [LOW] Double type cast in `page.tsx` bypasses type system [src/app/(auth)/projects/[id]/knowledge/page.tsx:32-34] — `(kb as Record<string, unknown>)?.bmad_detected as boolean | undefined` when `kb?.bmad_detected` works directly (schema has the field, generated types include it).
- [x] [Review][Patch] [LOW] `categorizeBmadFile` substring `includes("project-context")` false positives [convex/knowledge/bmadParsing.ts:36] — matches `archive/project-context-old.md`, `foo-project-context-bar.md`. Anchor to path segments.
- [x] [Review][Patch] [LOW] `DeclaredIntent` unbounded `title` attribute on domain term chips [src/app/(auth)/projects/[id]/knowledge/DeclaredIntent.tsx:121] — `title={term.content}` can be up to ~100KB. Truncate tooltip text.
- [x] [Review][Defer] Delete-then-store not atomic — partial failure leaves inconsistent state [convex/knowledge/bmadActions.ts:104-112] — deferred, mitigated by workflow retry:true + _setBmadDetected called last
- [x] [Review][Defer] 200 sequential DB inserts in `_storeBmadMetadata` [convex/knowledge/internal.ts:489-498] — deferred, same pattern as `_storeModules`, not a regression
- [x] [Review][Defer] Re-sync deletes all data before workflow starts — no rollback on `start()` failure [convex/knowledge/triggerIngestion.ts:147-186] — deferred, pre-existing pattern from Story 1.8

## Change Log

- 2026-06-14: Story 1.9 implemented — BMAD artifact detection, parsing, storage, extraction wiring, UI, re-sync cleanup, and comprehensive tests
