# ADR 0008: Combined Analyst + Test Platform (MSI Forge)

## Status

Accepted

## Context

MSI Test is a fully implemented AI testing platform (20 Convex tables, 120+ functions, 22 pages). It generates and executes Playwright tests but treats target applications as black boxes — test generation relies on user-provided PRDs which may be stale, and exploration is limited to page structure without understanding business logic.

MSI Analyst is a PRD-only concept for an AI code intelligence platform targeting business analysts. It reverse-engineers production code into a Knowledge Base, generates accurate Baseline Requirements Documents, and provides a ChatGPT-style interface for BAs to query project knowledge and generate user stories.

The integration insight: BAs produce accurate RDs from live code via Analyst, and those RDs feed Test generation with ground-truth context instead of stale documents. The combination of accurate RD + live crawling produces more precise test plans than either alone.

Both products share the same technical stack: Next.js + Convex + Better Auth + `@convex-dev/agent` + BYOK AI config + Coolify deployment. The Analyst modules slot into the existing architecture as new domain modules.

## Decision

Combine MSI Test and MSI Analyst into a single platform called **MSI Forge**. The Analyst modules are added as new Convex domain directories following the existing `convex/{domain}/` organization pattern. No existing Test modules are modified — the integration is purely additive via new Agent tools that read Knowledge Base data.

### Architecture

```
MSI Forge
├── Test Modules (existing — unchanged)
│   ├── ai/              — Test generation, exploration, healing, refinement
│   ├── runs/            — Run lifecycle, results
│   ├── suites/          — Suite management
│   ├── tests/           — Test CRUD
│   ├── explorations/    — URL exploration
│   └── ...
│
├── Analyst Modules (new)
│   ├── knowledge/       — Knowledge Base CRUD, ingestion workflow
│   ├── kb_modules/      — Module queries (read-only)
│   ├── baseline/        — Baseline RD generation, drift, editing, export
│   ├── chat/            — BA chat with RAG context injection
│   ├── stories/         — User story CRUD, status, export
│   └── ai/analyst/      — Analyst agent tools and prompts
│
└── Integration Bridge (new — C5 epic)
    └── readKnowledgeBase tool added to Test Generation Agent's tool set
    └── readBaselineRd tool added to Test Generation Agent's tool set
    └── Context injection in buildPrdGenerationPrompt / buildNlGenerationPrompt
```

### Schema: New Tables

Four new tables added to the existing 20-table schema. All follow existing conventions: `workspace_id` for multi-tenant isolation, consistent indexing patterns.

| Table | Purpose | Key Indexes |
|---|---|---|
| `knowledge_bases` | Per-project code analysis state and results | `by_workspace_id`, `by_project_id` |
| `kb_modules` | Detected modules with APIs, data models, user flows | `by_workspace_id`, `by_knowledge_base_id` |
| `baseline_rds` | Generated requirements documents with versioning | `by_workspace_id`, `by_project_id`, `by_project_id_and_version` |
| `user_stories` | AI-generated user stories with status lifecycle | `by_workspace_id`, `by_project_id`, `by_project_id_and_status` |

### Schema: Extended Tables

The `projects` table gains five optional columns. All are optional because a project can be Test-only (app URL, no repo) or Analyst-only (repo URL, no app URL) or both.

| Column | Type | Purpose |
|---|---|---|
| `repo_url` | `optional(string)` | GitHub repository URL for code ingestion |
| `encrypted_pat` | `optional(string)` | AES-256-GCM encrypted GitHub PAT (never returned to client) |
| `old_rd_extracted_text` | `optional(string)` | Parsed text from uploaded old Requirements Document |
| `old_rd_file_id` | `optional(id<_storage>)` | Original uploaded old RD file reference |
| `kb_status` | `optional(union)` | Knowledge Base status: none / building / ready / error |

### Component Usage

| Component | Current Use | Analyst Use |
|---|---|---|
| `@convex-dev/agent` | 5 agents (Test Gen, Hybrid Gen, Exploration Analysis, Failure Analysis, Heal) | 2 new agents (Analyst Chat, Impact Analysis). Shares same Agent Component instance and workspace BYOK config |
| `@convex-dev/workflow` | Not currently used (was listed in package.json) | Durable ingestion pipeline (GitHub read → chunk → embed → AI analysis). Survives server restarts |
| RAG storage | Not currently used | Per-project namespace. Code chunks + embeddings stored in Agent Component's built-in vector store |
| `@convex-dev/rate-limiter` | AI rate limiting per workspace | Same rate limiter for Analyst AI calls |
| `@convex-dev/action-cache` | Caching browser snapshots | Caching GitHub API responses (file tree, file contents) |

### Agent Definitions

Two new Agent instances follow the existing factory pattern (`createXxxAgent(model)`):

1. **Analyst Chat Agent** — `generateText` with streaming. RAG-powered context injection. System prompt includes project's architecture summary and module map. Thread scoped per project chat thread (Agent Component manages thread/message persistence).

2. **Impact Analysis Agent** — `generateObject` with zod schema for structured impact output. Called from within the chat agent as a tool. No persistent thread — one-shot analysis per invocation.

Existing agents gain new tools (no prompt changes to existing agents — tools are additive):

- **Test Generation Agent** gains `readKnowledgeBase` tool — returns module names, API surface, data models, user flows
- **Test Generation Agent** gains `readBaselineRd` tool — returns the latest Baseline RD sections and confidence scores
- **Exploration Analysis Agent** gains `readKnowledgeBase` tool — cross-references discovered pages against known modules

### Integration Bridge (C5 Epic)

The connection between Analyst and Test is through Agent tools, not direct function calls. This is the same pattern already used: `readProjectContext`, `readExistingTests`, `readTestCode` are all tool definitions that execute internal queries.

New tools follow the identical pattern:

```typescript
readKnowledgeBase: createTool({
  description: "Read the Knowledge Base for a project — modules, APIs, data models, user flows",
  inputSchema: z.object({ project_id: z.string() }),
  execute: async (ctx, input) => {
    return ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, {
      project_id: input.project_id as Id<"projects">,
    });
  },
}),

readBaselineRd: createTool({
  description: "Read the latest Baseline Requirements Document for a project",
  inputSchema: z.object({ project_id: z.string() }),
  execute: async (ctx, input) => {
    return ctx.runQuery(internal.ai.tools.queries.readBaselineRdQuery, {
      project_id: input.project_id as Id<"projects">,
    });
  },
}),
```

Test generation prompt builders (`buildPrdGenerationPrompt`, `buildNlGenerationPrompt`) gain optional KB context injection — when a Baseline RD exists, its sections are included alongside existing PRD text and snapshot context. This is a purely additive change to prompt construction.

### Security

| Concern | Approach |
|---|---|
| PAT storage | AES-256-GCM encryption at rest. Encrypted in a Convex action, decrypted only in actions. Never returned to frontend. Key stored in environment variable `ENCRYPTION_KEY` |
| PAT masking | Follow existing `maskApiKey()` pattern from `convex/lib/validation.ts` |
| Data isolation | Same `workspace_id` scoping as all existing tables. `getOptionalOwnedEntity` pattern for queries |
| Chat grounding | RAG results scoped to project namespace. Cross-project data never leaks |

### Frontend

New routes are scoped under existing `/projects/[id]/` — no new top-level route group needed. Analyst tabs appear on the project detail page alongside existing Explore/Generate tabs.

| Route | Purpose |
|---|---|
| `/projects/[id]/knowledge` | KB status, architecture, module list |
| `/projects/[id]/knowledge/modules/[moduleId]` | Module detail (APIs, data models, flows) |
| `/projects/[id]/baseline` | Baseline RD viewer with inline editing |
| `/projects/[id]/baseline/drift` | Drift Report |
| `/projects/[id]/chat` | BA chat interface |
| `/projects/[id]/chat/[threadId]` | Chat thread |
| `/projects/[id]/stories` | Story list with status filtering |
| `/projects/[id]/stories/[storyId]` | Story detail |

Sidebar gains an "Analyst" section in `NAV_SECTIONS` alongside existing "Overview" and "Testing" sections.

### Module Organization

Following the existing `convex/{domain}/` pattern exactly:

```
convex/
├── knowledge/
│   ├── queries.ts      — getKnowledgeBase, getKnowledgeBases
│   ├── mutations.ts    — createKnowledgeBase, updateStatus
│   ├── actions.ts      — triggerIngestion (Workflow entry point)
│   └── internal.ts     — internal queries for workflow steps
├── kb_modules/
│   └── queries.ts      — getModules, getModuleDetail
├── baseline/
│   ├── queries.ts      — getBaselineRd, getLatestBaselineRd
│   ├── mutations.ts    — updateSection, approveRd
│   └── actions.ts      — generateBaselineRd, generateDriftReport
├── chat/
│   ├── queries.ts      — getThreads, getThreadMessages
│   ├── mutations.ts    — createThread
│   └── actions.ts      — sendMessage (Agent Component streaming)
├── stories/
│   ├── queries.ts      — getStories, getStory
│   └── mutations.ts    — createStory, updateStatus, exportStories
└── ai/analyst/
    ├── tools.ts        — readKnowledgeBase, readBaselineRd tool logic
    └── prompts.ts      — ANALYST_CHAT_PROMPT, IMPACT_ANALYSIS_PROMPT
```

## Consequences

### Positive

- **Accurate test generation** — Tests are grounded in actual code structure (modules, APIs, data models) instead of potentially stale PRDs
- **No disruption** — All 20 existing tables, 120+ functions, and 22 pages remain unchanged. Analyst modules are pure additions
- **Shared infrastructure** — Auth, AI config, Agent Component, rate limiting, file storage, deployment all reused without modification
- **Consistent patterns** — New modules follow the same `convex/{domain}/` organization, same auth helpers, same validator patterns
- **Progressive rollout** — Each epic (C1→C2→C5→C3→C4) delivers standalone value. KB is useful even without chat. Baseline RD is useful even without integration bridge

### Negative

- **Schema complexity** — 24 total tables (from 20). More indexes, more query patterns to reason about. Acceptable for a single-developer project at this scale
- **GitHub API dependency** — Code ingestion depends on GitHub REST API availability and rate limits. Mitigated by pagination, batching, and Workflow durability
- **Embedding cost** — Per-project ingestion uses OpenAI text-embedding-3-small tokens. Estimated under $2/project for medium repos (per Analyst PRD)
- **Two user personas in one UI** — BAs and devs share the same app. Sidebar sections separate concerns, but the project detail page gains many tabs. Acceptable for 5-user MVP
- **`kb_modules` table uses `v.any()` for nested API/data model/flow structures** — The API surface, data models, and user flows are AI-extracted and vary per project. Strongly typing them would require schema migrations every time the extraction format changes. `v.any()` for these sub-fields is pragmatic; the outer structure (name, description, file_count) is fully typed. This is a deliberate trade-off matching the existing pattern in `explorations.proposed_scenarios` and `captured_pages`

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| GitHub PAT auth fails for SSO-protected repos | Medium | Document PAT scope requirements. Post-MVP: consider GitHub OAuth |
| LLM hallucinates module/API structure | Medium | Confidence scores per Baseline RD section. BA reviews before approval. Tool returns raw code evidence alongside AI interpretation |
| Large repos exceed ingestion time/cost budget | Low | Configurable include/exclude patterns. Cap file count per project. Workflow survives restarts |
| Convex vector store search quality insufficient for RAG | Low | If search quality is poor, swap to external vector DB without schema changes — only the search action changes |

## Validation

This ADR validates the Sprint Change Proposal (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10.md`) with the following amendments:

1. **`kb_modules.apis`, `data_models`, `user_flows`** — Use `v.any()` for nested structures (deliberate trade-off, see Negative section)
2. **`kb_modules.dependencies`** — Changed from `v.array(v.id("kb_modules"))` to `v.array(v.string())` (module names, not IDs — avoids circular reference issues and cross-KB ID leakage)
3. **No `convex/modules/` directory** — Renamed to `convex/kb_modules/` to match the table name and avoid confusion with JavaScript modules
4. **No separate `convex/chat/` directory initially** — Chat uses Agent Component's built-in thread management. The chat action lives in `convex/knowledge/actions.ts` alongside ingestion. Promotes to its own module only when complexity warrants it (Rule of Three)
5. **Integration bridge is tool-based, not prompt-based** — The Sprint Change Proposal mentioned "context injection in system prompt." This is partially correct: KB summary goes in the prompt for broad context, but detailed module/API/flow data is exposed via Agent tools so the LLM pulls it on demand rather than cramming everything into every prompt
