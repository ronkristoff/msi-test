# Sprint Change Proposal: MSI Forge

**Date:** 2026-06-10
**Status:** Approved — Schema Validated by Architect (ADR 0008)
**Scope:** Major — Strategic Product Expansion

---

## 1. Issue Summary

**Trigger:** MSI Analyst PRD introduced as a new product dimension to be combined with the existing MSI Test platform.

**Problem:** MSI Test generates and runs Playwright tests but treats the target application as a black box. Test generation relies on user-provided PRDs which may be stale. The system lacks deep code context — it doesn't understand the application's modules, APIs, data models, or user flows.

**Solution:** Combine MSI Analyst (code intelligence) with MSI Test (test automation) into a unified platform called **MSI Forge**. The Analyst modules reverse-engineer production code into a structured Knowledge Base and generate accurate Baseline RDs. The Test modules consume these RDs alongside live crawling for context-aware test generation.

**Integration flow:**

```
Analyst (BA tool) → generates accurate Baseline RD from live code
                         ↓
Test (Dev tool)    → uses accurate RD + live crawling → better test plans
```

---

## 2. Impact Analysis

### 2.1 Epic Impact

| # | Combined Epic | Source | Status |
|---|---|---|---|
| C1 | **Knowledge Base Construction** — GitHub repo connection, code ingestion, RAG embeddings, architecture/module/API/data/flow extraction | Analyst Epics 1+2, merged | **New** |
| C2 | **Baseline RD & Drift** — Old RD upload, Baseline RD generation, Drift Report, viewer/editor/export | Analyst Epic 3 | **New** |
| C3 | **AI Chat for BAs** — Chat interface with RAG grounding, streaming, project Q&A | Analyst Epic 4 | **New** |
| C4 | **Feature Analysis & Story Gen** — Impact analysis, user story generation, story management, export | Analyst Epics 5+6 | **New** |
| C5 | **Context-Aware Test Generation** — Test module consumes Baseline RDs from Analyst, combines with live crawling for smarter test plans | **New — Integration Epic** | **New** |

Analyst Epic 1 (foundation/auth/CRUD) collapses into existing infrastructure — no new epic needed. Auth, workspace CRUD, dashboard, Agent Component, and Coolify deployment are already implemented.

### 2.2 Story Impact

**Existing stories — no modification needed.** All existing MSI Test features remain intact. This is additive.

**New stories** — see §4 Detailed Change Proposals for full story definitions.

**Analyst PRD's original epics and stories** are restructured to match MSI Forge's module organization pattern (`convex/{domain}/` — queries.ts, mutations.ts, actions.ts per module).

### 2.3 Artifact Conflicts

| Artifact | Change Required |
|---|---|
| `docs/PRD.md` | Rewrite to unified MSI Forge PRD covering both Analyst + Test |
| `CONTEXT.md` | Expanded glossary with Analyst terms (Knowledge Base, Baseline RD, Drift Report, Code Chunk, Module, Impact Analysis) |
| `convex/schema.ts` | Add 4 new tables, extend `projects` table with 5 new columns |
| `convex/lib/validation.ts` | New validators for repo_url, PAT encryption, RD sections |
| `convex/lib/constraints.ts` | New constants for PAT length, file size limits |
| `src/components/AppLayout.tsx` | New "Analyst" nav section in sidebar |
| `src/lib/schemas.ts` | New zod schemas for Analyst forms |
| ADRs | New ADR: "0008-combined-analyst-test-platform.md" |
| UI | Rebrand "MSI Test" → "MSI Forge" (logo, titles, metadata) |

### 2.4 Technical Impact

| Area | Impact |
|---|---|
| **Schema** | 4 new tables (`knowledge_bases`, `kb_modules`, `baseline_rds`, `user_stories`), 5 new columns on `projects` |
| **Convex modules** | 5 new module directories: `knowledge/`, `modules/`, `baseline/`, `chat/`, `stories/` |
| **Components** | RAG Component already installed — configure per-project namespaces. Agent Component already configured — add Analyst persona |
| **Frontend routes** | ~8 new pages under `(auth)/analyst/` and `(auth)/projects/[id]/` |
| **Runner** | No impact — Analyst doesn't use the Runner |
| **Deployment** | No impact — same Coolify + Docker |
| **Auth** | No impact — same Better Auth, same workspace scoping |

---

## 3. Recommended Approach

**Direct Adjustment (Option 1).** All Analyst modules are additive — new tables, new Convex modules, new frontend pages. No existing features are modified or removed. Integration epic (C5) adds a new consumption path for test generation but doesn't change existing generation workflows.

| Dimension | Assessment |
|---|---|
| Implementation effort | ~5-6 weeks (vs. 8 weeks greenfield — shared infra cuts ~30%) |
| Technical risk | Low — isolated modules, shared patterns, no breaking changes |
| Timeline impact | Adds 5-6 weeks to roadmap, but Test features continue working throughout |
| Long-term sustainability | Follows existing `convex/{domain}/` organization pattern. Each Analyst module is independently testable |

**Epic execution order:** C1 → C2 → C5 → C3 → C4

C3 (Chat) and C4 (Stories) can run in parallel with C5 (Integration) since C1 (Knowledge Base) is the shared dependency.

---

## 4. Detailed Change Proposals

### 4.1 Schema Changes

#### New Tables

**Table: `knowledge_bases`**

```typescript
knowledge_bases: defineTable({
  workspace_id: v.id("workspaces"),
  project_id: v.id("projects"),
  status: v.union(v.literal("building"), v.literal("ready"), v.literal("error")),
  architecture_summary: v.optional(v.string()),
  tech_stack: v.optional(v.array(v.string())),
  folder_structure: v.optional(v.string()),
  architecture_type: v.optional(v.string()),
  total_files: v.optional(v.number()),
  total_size_bytes: v.optional(v.number()),
  error_message: v.optional(v.string()),
  last_synced_at: v.optional(v.number()),
})
  .index("by_workspace_id", ["workspace_id"])
  .index("by_project_id", ["project_id"]),
```

**Table: `kb_modules`**

```typescript
kb_modules: defineTable({
  workspace_id: v.id("workspaces"),
  knowledge_base_id: v.id("knowledge_bases"),
  name: v.string(),
  description: v.optional(v.string()),
  file_count: v.optional(v.number()),
  files: v.optional(v.array(v.string())),
  apis: v.optional(v.any()),        // AI-extracted, variable structure per project
  data_models: v.optional(v.any()), // AI-extracted, variable structure per project
  user_flows: v.optional(v.any()),  // AI-extracted, variable structure per project
  dependencies: v.optional(v.array(v.string())), // module names, not IDs
})
  .index("by_workspace_id", ["workspace_id"])
  .index("by_knowledge_base_id", ["knowledge_base_id"]),
```

**Table: `baseline_rds`**

```typescript
baseline_rds: defineTable({
  workspace_id: v.id("workspaces"),
  project_id: v.id("projects"),
  version: v.number(),
  status: v.union(v.literal("draft"), v.literal("approved")),
  sections: v.array(v.object({
    title: v.string(),
    content_md: v.string(),
    content_html: v.optional(v.string()),
    confidence: v.number(), // 0-1
  })),
  created_at: v.number(),
  updated_at: v.number(),
})
  .index("by_workspace_id", ["workspace_id"])
  .index("by_project_id", ["project_id"])
  .index("by_project_id_and_version", ["project_id", "version"]),
```

**Table: `user_stories`**

```typescript
user_stories: defineTable({
  workspace_id: v.id("workspaces"),
  project_id: v.id("projects"),
  thread_id: v.optional(v.string()), // Agent Component thread
  title: v.string(),
  description: v.string(), // "As a... I want... So that..."
  acceptance_criteria: v.array(v.string()),
  affected_components: v.optional(v.object({
    modules: v.optional(v.array(v.string())),
    apis: v.optional(v.array(v.string())),
    data_models: v.optional(v.array(v.string())),
  })),
  status: v.union(v.literal("draft"), v.literal("approved"), v.literal("exported")),
  created_at: v.number(),
  updated_at: v.number(),
})
  .index("by_workspace_id", ["workspace_id"])
  .index("by_project_id", ["project_id"])
  .index("by_project_id_and_status", ["project_id", "status"]),
```

#### Extended: `projects` table

Add these columns to the existing `projects` definition:

```typescript
// ADD to existing projects table:
repo_url: v.optional(v.string()),
encrypted_pat: v.optional(v.string()),      // AES-256-GCM encrypted
old_rd_extracted_text: v.optional(v.string()),
old_rd_file_id: v.optional(v.id("_storage")),
kb_status: v.optional(v.union(v.literal("none"), v.literal("building"), v.literal("ready"), v.literal("error"))),
```

### 4.2 Convex Module Organization

New modules under `convex/`, following existing domain pattern:

| Module | Files | Purpose |
|---|---|---|
| `knowledge/` | `queries.ts`, `mutations.ts`, `actions.ts`, `internal.ts` | Knowledge Base CRUD, ingestion workflow, chat actions, status tracking |
| `kb_modules/` | `queries.ts` | Module queries (read-only, populated by AI) |
| `baseline/` | `queries.ts`, `mutations.ts`, `actions.ts` | Baseline RD generation, editing, drift detection, export |
| `stories/` | `queries.ts`, `mutations.ts` | User story CRUD, status management, export |
| `ai/analyst/` | `tools.ts`, `prompts.ts` | Analyst-specific agent tools and prompts (extends existing `convex/ai/`) |

Note: No separate `chat/` directory initially — chat uses Agent Component's built-in thread management and lives in `knowledge/actions.ts`. Promotes to its own module when complexity warrants (Rule of Three).

### 4.3 Frontend Routes

| Route | Page | Purpose |
|---|---|---|
| `/projects/[id]/knowledge` | Knowledge Base detail | KB status, architecture summary, module list |
| `/projects/[id]/modules/[moduleId]` | Module detail | APIs, data models, user flows per module |
| `/projects/[id]/baseline` | Baseline RD viewer | Formatted RD with confidence scores, inline editing |
| `/projects/[id]/baseline/drift` | Drift Report | Side-by-side or listed drift items |
| `/projects/[id]/chat` | BA Chat | Agent-powered RAG-grounded conversation |
| `/projects/[id]/chat/[threadId]` | Chat thread | Specific conversation thread |
| `/projects/[id]/stories` | Story list | All user stories with filtering, status management |
| `/projects/[id]/stories/[storyId]` | Story detail | Single story view with acceptance criteria |

### 4.4 Integration Epic (C5) Stories

These are the bridge between Analyst and Test:

**Story C5.1: Test generation consumes Baseline RD**

OLD: Test generation uses only user-provided PRD text + live crawling results
NEW: When a Baseline RD exists for a project, test generation queries it as additional context. The system prompt includes module names, API surface, and user flows from the KB.

**Story C5.2: Exploration uses Knowledge Base for smarter scenario proposals**

OLD: Exploration Analysis Agent proposes scenarios based only on captured page structure
NEW: When KB exists, scenarios are cross-referenced against detected modules and user flows. Gaps are flagged.

**Story C5.3: Drift-aware test regeneration**

When a project's code is re-synced (KB refresh), the system detects which modules changed and suggests which tests may need regeneration.

### 4.5 Rebranding

| Asset | OLD | NEW |
|---|---|---|
| App name | MSI Test | MSI Forge |
| Page titles | MSITest | MSI Forge |
| Sidebar branding | MSITest logo text | MSI Forge logo text |
| `package.json` name | msi-test | msi-forge |
| Repository | msi-test | msi-forge (rename optional) |
| `CONTEXT.md` title | MSITest | MSI Forge |

---

## 5. Implementation Handoff

### Change Scope

**Major** — Strategic product expansion requiring coordinated implementation across schema, backend, frontend, and documentation.

### Handoff Plan

| Role | Responsibility |
|---|---|
| **Architect** (Winston) | Finalize unified architecture, write ADR 0008, approve schema changes |
| **Developer** (Amelia) | Implement C1→C2→C5→C3→C4 sequentially, following existing module patterns |
| **Tech Writer** (Paige) | Rewrite `docs/PRD.md` to unified MSI Forge PRD, update `CONTEXT.md` |
| **UX Designer** (Sally) | Design new nav structure, Analyst pages, rebrand assets |

### Success Criteria

1. All 4 new tables created and indexed in Convex schema
2. `projects` table extended with 5 new columns
3. Knowledge Base construction pipeline works end-to-end (GitHub → RAG → AI analysis → KB)
4. Baseline RD generated with <20% hallucination rate (BA-verified)
5. Test generation uses Baseline RD context when available
6. Chat provides grounded answers citing specific modules/files
7. All existing Test features continue functioning without regression
8. MSI Forge branding applied across UI
9. Unified PRD replaces existing MSI Test PRD
10. Full test coverage (80%+) for all new modules

---

*Proposal drafted by Correct Course workflow. Awaiting user approval.*
