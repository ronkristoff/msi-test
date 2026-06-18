---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - docs/PRD.md
  - docs/adr/0001-separate-test-runner.md
  - docs/adr/0002-runner-convex-subscriptions.md
  - docs/adr/0003-convex-agent-component.md
  - docs/adr/0004-stagehand-browser-interactions.md
  - docs/adr/0005-hybrid-test-format.md
  - docs/adr/0006-convex-stagehand-lightweight-tasks.md
  - docs/adr/0007-scheduled-monitoring-crons.md
  - docs/adr/0008-combined-analyst-test-platform.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md
---

# MSI Forge - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for MSI Forge, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: BA or developer creates a project with name, optional app URL, optional GitHub repo URL
FR-2: BA uploads existing RD (Word, PDF, Markdown) as context for drift detection
FR-3: BA enters GitHub PAT; encrypted at rest, never returned to frontend
FR-4: BA clicks "Analyze" to trigger ingestion pipeline; real-time progress visible
FR-5: System reads relevant source files from GitHub repo with include/exclude patterns
FR-6: System splits code into meaningful chunks grouped by file/directory
FR-7: System generates vector embeddings per code chunk in per-project namespaces
FR-8: AI extracts architecture summary: tech stack, framework, folder structure, type
FR-9: AI identifies modules, maps files to modules with cross-module dependencies
FR-10: AI extracts API endpoints with input/output shapes and HTTP methods
FR-11: AI extracts database schemas, table definitions, entity relationships
FR-12: AI reconstructs user-facing flows from routes, pages, components
FR-13: AI generates structured RD from KB with sections (Overview, Tech Stack, Modules, API, Data, Flows) + confidence scores; mirrors Old RD format if available
FR-14: AI produces Drift Report: Old RD vs KB, categorized as added/removed/changed
FR-15: BA views Baseline RD as HTML, edits sections inline; edits versioned with confidence scores
FR-16: BA views Drift Report as structured list grouped by type, linked to RD sections
FR-17: BA starts chat thread in project; title auto-generated from first message
FR-18: BA sends messages; AI responds with streaming; history preserved
FR-19: Every response grounded in KB via RAG; cites modules, files, APIs; says so when KB lacks answer
FR-20: Pasted feature request triggers structured impact analysis
FR-21: AI generates user stories with As a/I want/So that + acceptance criteria + affected components
FR-22: BA refines via follow-up; AI maintains full conversation context
FR-23: BA asks free-form questions; gets grounded answers with code evidence
FR-24: BA views all stories across threads, filtered by status
FR-25: BA changes story status: draft → approved → exported, with timestamps
FR-26: BA exports stories as Markdown or copyable text
FR-27: BA exports Baseline RD in Markdown or HTML
FR-28: BA triggers KB re-sync; previous RD archived, new version generated
FR-29: Runner renders app pages with Playwright, takes DOM snapshots + screenshots
FR-30: AI proposes testable flows based on rendered page structure
FR-31: User selects specific proposed flows for test generation
FR-32: Exploration progress visible in real-time
FR-33: Developer types requirements; AI generates Playwright tests
FR-34: Developer uploads MD/PDF with requirements for test generation
FR-35: When Baseline RD exists, test gen includes its context for more accurate tests
FR-36: Developer describes scenario in plain English; AI generates Playwright code
FR-37: Developer specifies multiple scenarios for batch generation
FR-38: When KB exists, NL gen includes KB context for grounded suggestions
FR-39: Test Gen Agent gains readKnowledgeBase tool
FR-40: Test Gen Agent gains readBaselineRd tool
FR-41: Exploration Agent cross-references pages against KB modules, flags gaps
FR-42: KB re-sync detects changed modules, flags tests needing regeneration
FR-43: Developer runs suite with real-time progress monitoring
FR-44: Screenshots at every step, video, console capture, full traces
FR-45: Developer runs single test individually for debugging
FR-46: Developer re-runs failed test to check flakiness
FR-47: AI generates root cause analysis for failures with confidence + suggested fix
FR-48: Auto-heal repairs failing tests with configurable threshold; saved as draft
FR-49: Healing knowledge persists across runs; proactive fix before re-failure
FR-50: Overall pass rate, failed/flaky/total counts with trend arrows
FR-51: Pass rate trend chart over last 20 runs
FR-52: Recent failure cards with AI root cause + suggested fixes
FR-53: Currently running tests with live progress bars
FR-54: Flakiness heatmap grid color-coded by stability with AI cluster analysis
FR-55: Suite CRUD with auto-generated names per generation source
FR-56: Test review: view code, edit inline, approve, delete, re-generate
FR-57: Environment management: staging/production/dev with base URLs
FR-58: Test lists: cross-project grouping into named executable lists
FR-59: Scheduled runs on cadence (hourly/daily/weekly) via Convex crons
FR-60: Monitoring page: all schedules, run history, run-vs-run diffs
FR-61: Export user stories as Markdown
FR-62: Export Baseline RD as Markdown or HTML
FR-63: Export dashboard data
FR-64: Slack webhook integration with configurable alert rules
FR-65: GitHub webhook listener for CI-triggered runs
FR-66: Sign in with email/password or Google OAuth
FR-67: Workspace creation with BYOK AI provider config
FR-68: Update AI provider config, profile, workspace settings

### BMAD-Aware Functional Requirements

FR-B1: System detects BMAD artifacts (_bmad-output/, AGENTS.md, CONTEXT.md, docs/adr/) after ingestion completes
FR-B2: System parses BMAD PRD into structured sections, ADRs into individual decisions, project-context into conventions, CONTEXT.md into domain terms
FR-B3: System stores parsed BMAD metadata in kb_bmad_metadata table, scoped to workspace
FR-B4: Baseline RD generation cross-references BMAD PRD when available; confidence boosted on agreement, flagged on divergence; decision log populated from ADRs
FR-B5: Drift Report includes BMAD-aware dimensions when available: PRD-vs-code divergence, ADR drift, convention violations
FR-B6: Impact Analysis checks feature request against BMAD ADRs, planned stories, and project conventions when available
FR-B7: User Story generation injects project conventions and generates in BMAD-compatible format when available
FR-B8: Baseline RD exportable as BMAD PRD format (prd.md + addendum.md + decision-log.md)
FR-B9: User Stories exportable as BMAD story files (one .md per story in BMAD template)

### NonFunctional Requirements

NFR-1: PAT stored AES-256-GCM encrypted at rest; decrypted only in actions; never returned to frontend
NFR-2: RAG results scoped to project namespace; cross-project data never leaks
NFR-3: All protected mutations use requireAuth / getOptionalOwnedEntity pattern
NFR-4: Ingestion pipeline uses @convex-dev/workflow for durability across server restarts
NFR-5: Time-to-impact-analysis under 5 minutes from feature request to completed analysis
NFR-6: Drift-to-regeneration turnaround under 2 minutes
NFR-7: 4 new tables + 5 extended columns on projects; workspace_id scoping for isolation
NFR-8: 80%+ test coverage for all new modules
NFR-9: OpenAI-compatible endpoints only (BYOK); non-compatible providers excluded for MVP
NFR-10: Embedding cost under $2/project for medium repos; Browserbase per-session metering

### Additional Requirements

ARCH-1: Separate Runner process for Playwright execution; Convex remains source of truth
ARCH-2: Runner uses Convex subscriptions (WebSocket) for dispatch; no public ingress needed
ARCH-3: All AI interactions via @convex-dev/agent + Vercel AI SDK; BYOK via createOpenAI({ baseURL, apiKey })
ARCH-4: Stagehand for smart exploration + NL-step test execution; raw Playwright for code tests
ARCH-5: Hybrid test format: execution_type field + steps array for NL instructions with optional code assertions
ARCH-6: @browserbasehq/convex-stagehand for lightweight server-side browser tasks; optional with graceful fallback
ARCH-7: Convex crons for scheduled runs; schedules table with cadence config; checkScheduledRuns every 60s
ARCH-8: 2 new Agent instances: Analyst Chat Agent (streaming + RAG) and Impact Analysis Agent (structured output via generateObject)
ARCH-9: Integration bridge is tool-based (not prompt-only): readKnowledgeBase and readBaselineRd as Agent tools
ARCH-10: No separate chat/ directory initially — chat in knowledge/actions.ts; promotes when complexity warrants
ARCH-11: kb_modules nested structures (apis, data_models, user_flows) use v.any() — deliberate trade-off
ARCH-12: Epic order: C1 → C2 → C5 → C3 → C4
ARCH-13: No existing Test features modified — all changes are additive
ARCH-14: Rebrand MSI Test → MSI Forge (logo, titles, metadata, package.json)

### UX Design Requirements

No dedicated UX design document. Frontend routes and layout defined in ADR 0008 §Frontend and Sprint Change Proposal §4.3.

### FR Coverage Map

FR-1:  Already Implemented — Project CRUD
FR-2:  Epic 1 — Old RD upload for drift context
FR-3:  Already Implemented — C1.1 PAT connection
FR-4:  Epic 1 — Analyze trigger for ingestion pipeline
FR-5:  Epic 1 — Read source files from GitHub
FR-6:  Epic 1 — Split code into chunks
FR-7:  Epic 1 — Generate vector embeddings
FR-8:  Epic 1 — Extract architecture summary
FR-9:  Epic 1 — Identify modules + dependencies
FR-10: Epic 1 — Extract API endpoints
FR-11: Epic 1 — Extract database schemas
FR-12: Epic 1 — Reconstruct user flows
FR-13: Epic 2 — Generate Baseline RD
FR-14: Epic 2 — Generate Drift Report
FR-15: Epic 2 — Baseline RD viewer + editor
FR-16: Epic 2 — Drift Report viewer
FR-17: Epic 3 — Start chat thread
FR-18: Epic 3 — Streaming chat messages
FR-19: Epic 3 — RAG-grounded responses
FR-20: Epic 4 — Feature request impact analysis
FR-21: Epic 4 — User story generation
FR-22: Epic 3 — Conversation refinement
FR-23: Epic 3 — Free-form project Q&A
FR-24: Epic 4 — Story list with filtering
FR-25: Epic 4 — Story status lifecycle
FR-26: Epic 4 — Story export
FR-27: Epic 2 — Baseline RD export
FR-28: Epic 1 — KB re-sync
FR-29: Already Implemented — Exploration
FR-30: Already Implemented — Scenario proposals
FR-31: Already Implemented — Flow selection
FR-32: Already Implemented — Exploration progress
FR-33: Already Implemented — PRD test generation
FR-34: Already Implemented — Upload-based test gen
FR-35: Epic 5 — Baseline RD context in test gen
FR-36: Already Implemented — NL test generation
FR-37: Already Implemented — Batch NL generation
FR-38: Epic 5 — KB context in NL generation
FR-39: Epic 5 — readKnowledgeBase tool
FR-40: Epic 5 — readBaselineRd tool
FR-41: Epic 5 — Exploration cross-references KB
FR-42: Epic 5 — Drift-aware test regeneration
FR-43: Already Implemented — Suite run
FR-44: Already Implemented — Step telemetry
FR-45: Already Implemented — Single test run
FR-46: Already Implemented — Failed test rerun
FR-47: Already Implemented — Root cause analysis
FR-48: Already Implemented — Auto-heal
FR-49: Already Implemented — Healing persistence
FR-50: Already Implemented — Dashboard overview
FR-51: Already Implemented — Pass rate trend
FR-52: Already Implemented — Failure cards
FR-53: Already Implemented — Live progress
FR-54: Already Implemented — Flakiness heatmap
FR-55: Already Implemented — Suite CRUD
FR-56: Already Implemented — Test review
FR-57: Already Implemented — Environment management
FR-58: Already Implemented — Test lists
FR-59: Already Implemented — Scheduled runs
FR-60: Already Implemented — Monitoring page
FR-61: Epic 4 — Story export as Markdown
FR-62: Epic 2 — Baseline RD export
FR-63: Already Implemented — Dashboard export
FR-64: Already Implemented — Slack webhook
FR-65: Already Implemented — GitHub webhook
FR-66: Already Implemented — Auth
FR-67: Already Implemented — Workspace + BYOK
FR-68: Already Implemented — Settings

FR-B1: Epic 1 — BMAD artifact detection
FR-B2: Epic 1 — BMAD artifact parsing
FR-B3: Epic 1 — BMAD metadata storage
FR-B4: Epic 2 — Baseline RD cross-references BMAD PRD
FR-B5: Epic 2 — BMAD-aware drift dimensions
FR-B6: Epic 4 — Impact analysis checks BMAD ADRs/conventions
FR-B7: Epic 4 — Story generation in BMAD-compatible format
FR-B8: Epic 2 — Baseline RD export as BMAD PRD format
FR-B9: Epic 4 — Story export as BMAD story files

## Epic List

### Epic 1: Knowledge Base Construction

A BA connects a GitHub repo to a project, triggers analysis, and the system builds a complete structured Knowledge Base — architecture summary, module map with APIs/data models/user flows, and vector-searchable code chunks. The BA can view the KB status, browse modules, and trigger re-syncs.

**FRs covered:** FR-2, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-28, FR-B1, FR-B2, FR-B3
**NFRs:** NFR-1, NFR-2, NFR-4, NFR-7, NFR-8, NFR-10
**Status:** C1.1 (schema + repo connection) COMPLETE. Remaining: Old RD upload, ingestion pipeline, chunking/embeddings, AI extraction, KB viewer UI.
**Depends on:** None (foundation epic)

### Epic 2: Baseline RD & Drift Report

A BA generates a structured Baseline Requirements Document from the Knowledge Base with confidence scores per section. If an Old RD was uploaded, they get a Drift Report showing what changed. They can view the RD as formatted HTML, edit sections inline, and export as Markdown or HTML.

**FRs covered:** FR-13, FR-14, FR-15, FR-16, FR-27, FR-62, FR-B4, FR-B5, FR-B8
**NFRs:** NFR-8
**Depends on:** Epic 1 (Knowledge Base must be built)

### Epic 3: AI Chat for BAs

A BA opens a ChatGPT-style interface within a project, asks questions, and gets answers grounded in the project's Knowledge Base with specific code citations. Every response is RAG-powered. The BA can ask about architecture, modules, APIs, or any aspect of the codebase.

**FRs covered:** FR-17, FR-18, FR-19, FR-22, FR-23
**NFRs:** NFR-2, NFR-5, NFR-8
**Depends on:** Epic 1 (Knowledge Base for RAG)

### Epic 4: Feature Analysis & Story Management

A BA pastes a feature request into chat and gets a structured impact analysis (affected modules, APIs, data models, flows). The AI generates user stories with acceptance criteria. The BA manages stories through a lifecycle (draft → approved → exported), views all stories across threads, and exports them as Markdown.

**FRs covered:** FR-20, FR-21, FR-24, FR-25, FR-26, FR-61, FR-B6, FR-B7, FR-B9
**NFRs:** NFR-5, NFR-8
**Depends on:** Epic 1 (KB) + Epic 3 (Chat interface)

### Epic 5: Context-Aware Test Generation

When a project has a Knowledge Base and Baseline RD, test generation automatically includes that context — producing more accurate tests than PRD text alone. Exploration cross-references discovered pages against KB modules. When code is re-synced, the system flags which tests may need regeneration.

**FRs covered:** FR-35, FR-38, FR-39, FR-40, FR-41, FR-42
**NFRs:** NFR-6, NFR-8
**Depends on:** Epic 1 (KB) + Epic 2 (Baseline RD). Can run in parallel with C3/C4.

### Epic 6: Foundation Hardening

A debt/hardening epic that closes the 5th-epic carry-forwards (disabled TypeScript build gate, missing Playwright smoke coverage, multi-workspace IDOR) and addresses technical debt accumulated across Epics 1–5: structural-aware truncation rollout, prompt-injection hardening, file-size cap violations, and deferred-work triage. No new features — this epic hardens the substrate before any deployment or feature work.

**NFRs:** NFR-3, NFR-8
**Source:** Epic 5 Retrospective action items E4–E11
**Depends on:** Epic 1–5 (all delivered functionality is stable; this epic hardens the substrate)

## Epic 1: Knowledge Base Construction

A BA connects a GitHub repo to a project, triggers analysis, and the system builds a complete structured Knowledge Base — architecture summary, module map with APIs/data models/user flows, and vector-searchable code chunks. The BA can view the KB status, browse modules, and trigger re-syncs.

### Story 1.1: Schema Extension & Project Repo Connection (COMPLETE)

As a business analyst,
I want to connect a GitHub repository to my project with a securely stored PAT token,
So that the system can read production code to build a Knowledge Base.

**Acceptance Criteria:**

**Given** a project without a connected repo
**When** the BA submits a valid GitHub repo URL and PAT
**Then** the PAT is encrypted with AES-256-GCM and stored on the project
**And** the repo URL is stored and `kb_status` is set to `none`

**Given** a project with a connected repo
**When** the BA queries the project
**Then** only `repo_url` and `kb_status` are returned — never the PAT or encrypted PAT

> **Status:** COMPLETE — all 8 acceptance criteria satisfied, 452 tests passing.

### Story 1.2: Old RD Upload & Text Extraction

As a BA,
I want to upload an existing Requirements Document to my project,
So that the system can use it as format reference and business context for drift detection.

**Acceptance Criteria:**

**Given** a project with a connected repo
**When** the BA uploads a Word, PDF, or Markdown file as an Old RD
**Then** the system extracts text content and stores it in `old_rd_extracted_text` on the project
**And** the original file is stored via Convex file storage with `old_rd_file_id`
**And** supported formats: `.docx`, `.pdf`, `.md`, `.txt`

**Given** a project that already has an Old RD
**When** the BA uploads a replacement
**Then** the previous file and extracted text are replaced

**FRs:** FR-2

### Story 1.3: Code Ingestion Pipeline — GitHub Read & Chunk

As a BA,
I want to trigger code analysis on my connected GitHub repository,
So that the system reads all relevant source files and prepares them for AI analysis.

**Acceptance Criteria:**

**Given** a project with a connected repo and valid encrypted PAT
**When** the BA clicks "Analyze"
**Then** the system decrypts the PAT, reads the GitHub repo file tree via GitHub REST API
**And** files are filtered by configurable include/exclude patterns (default: include `*.ts, *.tsx, *.js, *.jsx, *.py, *.json, *.yaml, *.yml`, exclude `node_modules, .git, dist, build, __pycache__`)
**And** relevant files are read and split into meaningful chunks grouped by file and directory
**And** the pipeline uses `@convex-dev/workflow` for durable execution across server restarts
**And** KB status transitions: `none` → `building` → `ready` (or `error` on failure)
**And** progress is visible in real-time via Convex subscription

**Given** the GitHub API returns a rate limit error
**When** the pipeline is running
**Then** the workflow pauses with backoff and retries
**And** KB status remains `building` with an error message shown

**FRs:** FR-4, FR-5, FR-6
**NFRs:** NFR-4

### Story 1.4: Vector Embeddings & RAG Storage

As the system,
I want to generate vector embeddings for each code chunk and store them in per-project namespaces,
So that the BA can later ask questions grounded in the project's codebase via semantic search.

**Acceptance Criteria:**

**Given** code chunks are produced by the ingestion pipeline
**When** the chunking step completes
**Then** the system generates text embeddings for each chunk using the workspace's AI provider
**And** embeddings are stored in the Agent Component's built-in vector store under a per-project namespace
**And** each chunk is associated with its source file path and module (once modules are identified)
**And** RAG queries are scoped to the project's namespace — cross-project data never leaks

**FRs:** FR-7
**NFRs:** NFR-2, NFR-10

### Story 1.5: AI Architecture & Module Extraction

As a BA,
I want the system to extract architecture details and identify code modules with their APIs, data models, and user flows,
So that the Knowledge Base provides a structured map of the codebase.

**Acceptance Criteria:**

**Given** code chunks and embeddings are stored for a project
**When** the embedding step completes
**Then** AI extracts an architecture summary: tech stack, framework, folder structure, architecture type
**And** AI identifies major modules and maps files to modules with cross-module dependencies
**And** AI extracts API endpoints with input/output shapes and HTTP methods per module
**And** AI extracts database schemas, table definitions, and entity relationships per module
**And** AI reconstructs user-facing flows by analyzing routes, pages, and component relationships per module
**And** extracted data is stored: architecture on `knowledge_bases`, modules on `kb_modules` table
**And** `kb_modules.apis`, `data_models`, `user_flows` use `v.any()` per ADR 0008
**And** KB status transitions to `ready` with `last_synced_at` timestamp

**Given** a project with `bmad_detected = true`
**When** AI extracts architecture summary and modules
**Then** the extraction prompt includes parsed BMAD PRD sections and ADRs as reference
**And** extracted module map is cross-referenced against BMAD PRD structure
**And** confidence is boosted when extraction aligns with declared architecture
**And** divergences are flagged with lower confidence

**Given** a project with `bmad_detected = false`
**When** AI extracts architecture and modules
**Then** extraction works exactly as originally specified (no regression)

**FRs:** FR-8, FR-9, FR-10, FR-11, FR-12, FR-B4 (partial)

### Story 1.6: Knowledge Base Viewer UI

As a BA,
I want to view the Knowledge Base status, architecture summary, and browse detected modules,
So that I can understand what the system learned about the codebase.

**Acceptance Criteria:**

**Given** a project with a KB in `building` status
**When** the BA navigates to `/projects/[id]/knowledge`
**Then** the page shows building progress with stage indicators

**Given** a project with a KB in `ready` status
**When** the BA navigates to `/projects/[id]/knowledge`
**Then** the page displays: architecture summary, tech stack badges, folder structure, total files/size
**And** a list of detected modules with name, description, file count, and dependency links
**And** each module links to `/projects/[id]/knowledge/modules/[moduleId]`

**Given** a project with a KB in `error` status
**When** the BA views the page
**Then** the error message is displayed with a "Retry" button

**Given** a project with `bmad_detected = true`
**When** the BA views the Knowledge Base page
**Then** a "BMAD Detected" badge is displayed
**And** a collapsible "Declared Intent" section shows:
- Parsed PRD outline (section titles)
- ADR count and list
- Convention count
- Domain terms from CONTEXT.md

### Story 1.7: Module Detail View

As a BA,
I want to drill into a specific module to see its APIs, data models, and user flows,
So that I can understand the detailed structure of each part of the codebase.

**Acceptance Criteria:**

**Given** a project with a ready KB
**When** the BA navigates to `/projects/[id]/knowledge/modules/[moduleId]`
**Then** the page displays the module name, description, files list, and dependency graph
**And** expandable sections for APIs (endpoints, methods, shapes), data models (tables, relationships), and user flows (routes, pages, components)

### Story 1.8: Knowledge Base Re-Sync

As a BA,
I want to trigger a re-sync of the Knowledge Base after code changes,
So that the system detects what changed and updates the structured knowledge.

**Acceptance Criteria:**

**Given** a project with a ready KB
**When** the BA clicks "Re-sync"
**Then** the previous Baseline RD is archived (version incremented)
**And** the ingestion pipeline re-runs: read, chunk, embed, extract
**And** KB status transitions to `building`, then back to `ready`
**And** the previous KB data is replaced with fresh extraction results
**And** `last_synced_at` is updated

**FRs:** FR-28

### Story 1.9: BMAD Artifact Detection & Parsing

As the system,
I want to detect and parse BMAD Method artifacts in analyzed projects,
So that downstream features can cross-reference declared intent against actual code.

**Acceptance Criteria:**

**Given** a project with a connected GitHub repo
**When** the ingestion pipeline completes (KB status = "ready")
**Then** the system scans the repo for BMAD indicators:
- `_bmad-output/` directory
- `_bmad/` directory
- `AGENTS.md` or `CLAUDE.md`
- `CONTEXT.md`
- `docs/adr/` directory

**Given** BMAD artifacts are found
**When** the system parses them
**Then** PRD is parsed into structured sections (title + content)
**And** architecture/ADRs are parsed into individual decisions (id, title, decision, status)
**And** project-context.md is parsed into discrete convention rules
**And** CONTEXT.md is parsed into domain glossary terms
**And** each artifact is stored in `kb_bmad_metadata` with `source_path`
**And** `knowledge_bases.bmad_detected` is set to `true`
**And** `knowledge_bases.bmad_parsed_at` is set to current timestamp

**Given** no BMAD artifacts are found
**When** the scan completes
**Then** `knowledge_bases.bmad_detected` is set to `false`
**And** no parsing occurs (graceful no-op)

**Given** the ingestion exclude patterns
**When** files are filtered for code chunking
**Then** `_bmad-output/` and `_bmad/` are excluded from embeddings
**And** `AGENTS.md` and `CONTEXT.md` ARE included (useful RAG context)

**FRs:** FR-B1, FR-B2, FR-B3

## Epic 2: Baseline RD & Drift Report

A BA generates a structured Baseline Requirements Document from the Knowledge Base with confidence scores per section. If an Old RD was uploaded, they get a Drift Report showing what changed. They can view the RD as formatted HTML, edit sections inline, and export as Markdown or HTML.

### Story 2.1: Baseline RD Generation

As a BA,
I want the system to generate a structured Requirements Document from the Knowledge Base,
So that I have an authoritative description of what the app currently does.

**Acceptance Criteria:**

**Given** a project with a ready Knowledge Base
**When** RD generation is triggered (automatically after KB build, or manually)
**Then** AI generates a structured RD with sections: Overview, Tech Stack, Modules, API Surface, Data Model, User Flows
**And** each section has a confidence score (0–1)
**And** if an Old RD exists, the Baseline RD mirrors its section format where possible
**And** the RD is stored in `baseline_rds` table with status `draft`, version 1
**And** `baseline_rds` table is created with indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_version`

**Given** a project with `bmad_detected = true`
**When** Baseline RD is generated
**Then** each RD section is cross-referenced against the matching BMAD PRD section
**And** confidence score is boosted (+0.1) when code analysis and PRD agree
**And** confidence score is reduced (-0.15) when they diverge, with a divergence note
**And** a decision log section is generated from parsed ADRs
**And** the RD format mirrors the project's BMAD PRD section structure

**Given** a project with `bmad_detected = false`
**When** Baseline RD is generated
**Then** generation works exactly as originally specified

**FRs:** FR-13, FR-B4

### Story 2.2: Drift Report Generation

As a BA,
I want to see how the current codebase differs from the Old Requirements Document,
So that I know which features were added, removed, or changed since the RD was written.

**Acceptance Criteria:**

**Given** a project with a ready KB and an uploaded Old RD
**When** the BA navigates to the Drift Report page
**Then** AI compares the Old RD text against the Knowledge Base
**And** produces a Drift Report with items categorized as: added, removed, changed
**And** each drift item links to the relevant Baseline RD section
**And** the report is viewable at `/projects/[id]/baseline/drift`

**Given** a project without an Old RD
**When** the BA navigates to the Drift Report page
**Then** a message explains that Drift Report requires an uploaded Old RD

**Given** a project with `bmad_detected = true` and an Old RD
**When** the BA views the Drift Report
**Then** the report includes three drift dimensions:
1. Old RD vs code (existing behavior)
2. BMAD PRD vs extracted code structure (new)
3. BMAD conventions vs detected code patterns (new)
**And** each drift item includes a severity: `breaking`, `significant`, or `incremental`
**And** ADR drifts are shown separately (architecture decisions that changed)

**Given** a project with `bmad_detected = false`
**When** the BA views the Drift Report
**Then** only Old RD vs code drift is shown (existing behavior)

**FRs:** FR-14, FR-16, FR-B5

### Story 2.3: Baseline RD Viewer & Inline Editor

As a BA,
I want to view the Baseline RD as formatted HTML and edit individual sections inline,
So that I can review and correct the AI-generated content before approving.

**Acceptance Criteria:**

**Given** a project with a generated Baseline RD
**When** the BA navigates to `/projects/[id]/baseline`
**Then** the RD is displayed as formatted HTML with visible confidence scores per section
**And** the BA can click a section to enter inline edit mode
**And** edits are saved to the `baseline_rds` table with updated `updated_at` timestamp
**And** the BA can approve the RD, changing status from `draft` to `approved`

**FRs:** FR-15

### Story 2.4: Baseline RD & Drift Export

As a BA,
I want to export the Baseline RD as Markdown or HTML and the Drift Report as a document,
So that I can share it with the client or team outside the platform.

**Acceptance Criteria:**

**Given** an approved Baseline RD
**When** the BA clicks "Export"
**Then** the system offers export as Markdown (`.md`) or HTML (`.html`)
**And** the exported file downloads to the BA's device

**Given** a generated Drift Report
**When** the BA clicks "Export Drift Report"
**Then** the drift items are exported as a structured Markdown document

**Given** an approved Baseline RD on a project with `bmad_detected = true`
**When** the BA clicks "Export"
**Then** the system also offers BMAD PRD format
**And** BMAD PRD format produces three files:
- `prd.md` (RD sections)
- `addendum.md` (supplementary details)
- `decision-log.md` (ADRs if available, or "No ADRs detected")

**FRs:** FR-27, FR-62, FR-B8

## Epic 3: AI Chat for BAs

A BA opens a ChatGPT-style interface within a project, asks questions, and gets answers grounded in the project's Knowledge Base with specific code citations. Every response is RAG-powered. The BA can ask about architecture, modules, APIs, or any aspect of the codebase.

### Story 3.1: Analyst Chat Agent & Thread Management

As a BA,
I want to start a chat thread within a project and have the AI respond with streaming output,
So that I can have a persistent conversation about the project.

**Acceptance Criteria:**

**Given** a project with a ready Knowledge Base
**When** the BA navigates to `/projects/[id]/chat` and sends a first message
**Then** a new thread is created with an auto-generated title from the first message
**And** the Analyst Chat Agent responds with streaming output using `generateText`
**And** the Agent uses the workspace's BYOK AI provider config
**And** message history is preserved within the thread via Agent Component's built-in persistence

**Given** an existing chat thread
**When** the BA sends a follow-up message
**Then** the AI maintains full conversation context across all previous messages

**FRs:** FR-17, FR-18
**NFRs:** NFR-5

### Story 3.2: RAG-Grounded Responses

As a BA,
I want every AI response to be grounded in the project's Knowledge Base with code citations,
So that I can trust the answers and verify them against actual code.

**Acceptance Criteria:**

**Given** a project with a ready KB
**When** the BA asks a question in chat
**Then** the system performs semantic search against the project's vector store namespace
**And** relevant code chunks are injected as RAG context into the Agent's prompt
**And** the AI response cites specific modules, files, APIs, or data models as sources
**And** RAG queries are scoped to the project's namespace only — cross-project data never leaks

**Given** a question the KB does not contain an answer for
**When** the AI responds
**Then** the AI explicitly states the KB does not contain the answer rather than fabricating one

**FRs:** FR-19, FR-23
**NFRs:** NFR-2

### Story 3.3: Chat Thread List & Navigation

As a BA,
I want to see all my chat threads for a project and navigate between them,
So that I can resume previous conversations.

**Acceptance Criteria:**

**Given** a project with chat threads
**When** the BA navigates to `/projects/[id]/chat`
**Then** the page displays a list of threads with auto-generated titles and last message preview
**And** clicking a thread navigates to `/projects/[id]/chat/[threadId]` with full message history loaded
**And** the BA can create a new thread from the thread list page

**FRs:** FR-17

### Story 3.4: Chat UI with Streaming Display

As a BA,
I want a ChatGPT-style interface with real-time streaming of AI responses,
So that I can read the answer as it's being generated.

**Acceptance Criteria:**

**Given** an active chat thread
**When** the BA sends a message
**Then** the AI response streams token-by-token via Convex subscription
**And** the chat interface displays a typing indicator during generation
**And** the complete response is persisted once streaming finishes
**And** the BA can send follow-up messages while maintaining full conversation context

**FRs:** FR-18, FR-22

## Epic 4: Feature Analysis & Story Management

A BA pastes a feature request into chat and gets a structured impact analysis (affected modules, APIs, data models, flows). The AI generates user stories with acceptance criteria. The BA manages stories through a lifecycle (draft → approved → exported), views all stories across threads, and exports them as Markdown.

### Story 4.1: Impact Analysis Agent

As a BA,
I want to paste a feature request and receive a structured impact analysis,
So that I understand what the codebase changes would be before committing to implementation.

**Acceptance Criteria:**

**Given** a project with a ready KB
**When** the BA pastes a feature request into the chat
**Then** the Impact Analysis Agent runs via `generateObject` with a zod schema
**And** the response includes: affected modules, affected APIs, affected data models, affected user flows, and hidden dependencies
**And** the analysis is grounded in the project's Knowledge Base via RAG

**Given** a project with `bmad_detected = true`
**When** the BA pastes a feature request
**Then** the impact analysis also includes:
- ADR conflicts: "This feature conflicts with ADR-0003" (when applicable)
- Story linkage: "This feature was planned as Epic X" (when applicable)
- Convention violations: "This feature violates project convention: use-zod-validation" (when applicable)
- Duplicate detection: "This feature is 80% implemented" (when applicable)

**Given** a project with `bmad_detected = false`
**When** the BA pastes a feature request
**Then** impact analysis works exactly as originally specified

**FRs:** FR-20, FR-B6
**NFRs:** NFR-5

### Story 4.2: User Story Generation

As a BA,
I want the AI to generate user stories from a feature request with acceptance criteria,
So that I have structured, testable requirements ready for review.

**Acceptance Criteria:**

**Given** a feature request in a chat thread
**When** the BA asks the AI to generate stories
**Then** the AI produces user stories with: title, description (As a... I want... So that...), numbered acceptance criteria, and affected components (modules, APIs, data models)
**And** stories are stored as structured artifacts in the `user_stories` table with status `draft`
**And** each story links to its originating thread via `thread_id`
**And** the `user_stories` table is created with indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_status`

**Given** a project with `bmad_detected = true`
**When** the AI generates user stories
**Then** the generation prompt includes parsed project conventions
**And** generated stories include a "technical context" field with convention references
**And** story dependencies are detected from existing BMAD story data
**And** stories follow BMAD story file format (title, context block, ACs, affected components)

**Given** a project with `bmad_detected = false`
**When** the AI generates user stories
**Then** generation works exactly as originally specified

**FRs:** FR-21, FR-B7

### Story 4.3: Story List & Status Management

As a BA,
I want to view all user stories across all chat threads for a project and manage their status,
So that I can track which stories are ready for development.

**Acceptance Criteria:**

**Given** a project with generated user stories
**When** the BA navigates to `/projects/[id]/stories`
**Then** the page displays all stories filtered by status (draft, approved, exported)
**And** each story card shows: title, acceptance criteria count, affected components, and status
**And** the BA can change story status: draft → approved → exported with timestamps tracked
**And** clicking a story navigates to `/projects/[id]/stories/[storyId]` with full detail

**FRs:** FR-24, FR-25

### Story 4.4: Story Export

As a BA,
I want to export approved user stories as a downloadable Markdown file or copyable text,
So that I can share them with the development team or client.

**Acceptance Criteria:**

**Given** a project with approved stories
**When** the BA selects stories and clicks "Export"
**Then** stories are exported as a structured Markdown file with titles, descriptions, acceptance criteria, and affected components
**And** the BA can also copy individual stories as formatted text to clipboard

**Given** a project with `bmad_detected = true` and approved stories
**When** the BA selects stories and clicks "Export"
**Then** the system also offers BMAD story files
**And** BMAD story files produces one `.md` per story with:
- Context block (why this story exists, from KB)
- As a/I want/So that
- Acceptance criteria (numbered, testable)
- Affected components
- Technical context (conventions, if available)

**FRs:** FR-26, FR-61, FR-B9

## Epic 5: Context-Aware Test Generation

When a project has a Knowledge Base and Baseline RD, test generation automatically includes that context — producing more accurate tests than PRD text alone. Exploration cross-references discovered pages against KB modules. When code is re-synced, the system flags which tests may need regeneration.

### Story 5.1: readKnowledgeBase Agent Tool

As the Test Generation Agent,
I want a `readKnowledgeBase` tool that returns module names, API surface, data models, and user flows,
So that I can generate tests grounded in actual code structure.

**Acceptance Criteria:**

**Given** a project with a ready Knowledge Base
**When** the Test Generation Agent invokes `readKnowledgeBase` with a `project_id`
**Then** the tool executes an internal query returning: module names, descriptions, API endpoints, data model schemas, user flows, and cross-module dependencies
**And** the tool follows the existing Agent tool pattern (same as `readProjectContext`, `readExistingTests`)

**Given** a project without a Knowledge Base
**When** the tool is invoked
**Then** it returns an empty result gracefully — no error thrown

**FRs:** FR-39

### Story 5.2: readBaselineRd Agent Tool

As the Test Generation Agent,
I want a `readBaselineRd` tool that returns the latest Baseline RD sections and confidence scores,
So that I can use accurate requirements context when generating tests.

**Acceptance Criteria:**

**Given** a project with an approved Baseline RD
**When** the Test Generation Agent invokes `readBaselineRd` with a `project_id`
**Then** the tool returns the latest RD version's sections with titles, content, and confidence scores
**And** the tool follows the existing Agent tool pattern

**Given** a project without a Baseline RD
**When** the tool is invoked
**Then** it returns an empty result gracefully

**FRs:** FR-40

### Story 5.3: Context-Enhanced Test Generation Prompts

As a developer,
I want test generation to automatically include Knowledge Base and Baseline RD context when available,
So that generated tests are more accurate and fewer are needed to cover the same ground.

**Acceptance Criteria:**

**Given** a project with a ready KB and approved Baseline RD
**When** the developer triggers PRD-based test generation
**Then** the system prompt includes module names, API surface, and user flows from the KB alongside the PRD text
**And** `buildPrdGenerationPrompt` gains optional KB context injection (additive, no changes when KB absent)

**Given** a project with a ready KB
**When** the developer triggers NL-based test generation
**Then** the system prompt includes KB context for grounded locator and flow suggestions
**And** `buildNlGenerationPrompt` gains optional KB context injection

**Given** a project without a KB or Baseline RD
**When** test generation is triggered
**Then** generation works exactly as before — no regressions

**FRs:** FR-35, FR-38

### Story 5.4: Exploration Cross-References KB Modules

As a developer,
I want exploration to cross-reference discovered pages against Knowledge Base modules,
So that the system flags coverage gaps and proposes more relevant testable flows.

**Acceptance Criteria:**

**Given** a project with a ready KB and a completed exploration
**When** the Exploration Analysis Agent proposes testable scenarios
**Then** each discovered page is cross-referenced against KB modules
**And** scenarios are annotated with which KB module they likely correspond to
**And** coverage gaps are flagged (KB modules with no matching exploration pages)

**Given** a project without a KB
**When** exploration runs
**Then** it works exactly as before — no regressions

**FRs:** FR-41

### Story 5.5: Drift-Aware Test Regeneration Suggestions

As a developer,
I want the system to detect which modules changed after a KB re-sync and flag tests needing regeneration,
So that I can keep tests in sync with code changes.

**Acceptance Criteria:**

**Given** a project with a ready KB and existing test suites
**When** the BA triggers a KB re-sync and it completes
**Then** the system compares previous and current module data to detect changes
**And** tests whose source code references changed modules are flagged as potentially stale
**And** the developer sees a list of flagged tests with a "Regenerate" action per test
**And** turnaround from re-sync to flagging is under 2 minutes

**FRs:** FR-42
**NFRs:** NFR-6

## Epic 6: Foundation Hardening

A debt/hardening epic that closes the 5th-epic carry-forwards and addresses technical debt accumulated across Epics 1–5. No new features — this epic hardens the substrate. Story ordering reflects leverage and dependencies: critical-path items (6.1–6.3) must land before the epic is `done`.

### Story 6.1: Restore TypeScript Build Gate

As an architect,
I want `pnpm build` to enforce TypeScript compilation as a true gate,
So that type errors are caught at build time instead of silently accumulating behind a suppress flag.

**Acceptance Criteria:**

**Given** the frontend `tsconfig.json` currently includes `convex/` in its compilation scope, re-checking the deep `TestConvexForDataModel` instantiation cascade
**When** the configuration is fixed
**Then** `convex/` is excluded from the frontend tsconfig `include` (or `include` is scoped to `src/`)
**And** `pnpm build` no longer re-checks Convex internal type instantiation

**Given** approximately 32 real `src/` type errors masked by `ignoreBuildErrors: true`
**When** those errors are fixed
**Then** `pnpm build` passes with `typescript.ignoreBuildErrors` removed from `next.config.ts`
**And** `pnpm typecheck` line count for `src/` errors drops to near zero

**Given** `skipLibCheck: true` exists in both `tsconfig.json:6` and `convex/tsconfig.json:12` (D4 finding)
**When** the suppress-flag audit re-verifies each
**Then** `skipLibCheck` is kept only if still justified, with a comment documenting the rationale
**And** any unjustified suppress flags are removed

**NFRs:** NFR-8

### Story 6.2: Playwright Smoke Gate for jsdom-Blind Flows

As a test architect,
I want Playwright smoke tests covering flows that jsdom cannot verify,
So that navigation, streaming, clipboard, and download behaviors are regression-protected.

**Acceptance Criteria:**

**Given** the codebase has jsdom-blind flows across Epics 1–5 (chat send/streaming, impact + stories mode toggle + result render, checkbox-select-without-navigating [4.4 CRITICAL], status transitions, export download/clipboard, agent-tool invocation + streaming tool results, KB coverage-gaps banner, stale-tests banner → suite navigation)
**When** the Playwright smoke suite is built
**Then** each flow has at least one smoke test asserting the critical user-visible behavior
**And** the suite reuses the existing `runner/` Playwright infrastructure
**And** the suite runs via `pnpm test:e2e` and is added to the pre-commit verification chain

**Given** a jsdom test that asserts on navigation/streaming/clipboard/download behavior
**When** the D3 `UNVERIFIED-IN-JSDOM` rule is applied
**Then** each such test is either covered by a Playwright smoke test OR marked `UNVERIFIED-IN-JSDOM` in its test file

**NFRs:** NFR-8

### Story 6.3: Fix Multi-Workspace `.first()` IDOR

As an architect,
I want `getOptionalMemberWorkspace` and `getMemberWorkspace` to resolve the correct workspace for multi-workspace users,
So that a user with multiple memberships is not silently blocked from their non-primary workspace's data.

**Acceptance Criteria:**

**Given** `getOptionalMemberWorkspace` / `getMemberWorkspace` resolve via `.first()` on `by_user_id` (returning oldest membership), blocking multi-workspace users from non-primary workspace data
**When** the fix is applied
**Then** both functions accept a `workspace_id` parameter
**And** resolve the membership via the `by_workspace_id_and_user_id` index
**And** all callers across all domains (`knowledge/`, `chat/`, `stories/`, `workspaces/`, `ai/`) are updated to pass the correct `workspace_id`

**Given** a multi-workspace user accessing a project/thread/KB in their non-primary workspace
**When** they trigger any protected operation (chat, RAG, impact analysis, story generation/list/status/export, KB-aware test-gen, exploration cross-referencing, stale-test flagging)
**Then** the operation succeeds — no false "Project not found" / "Thread not found" error

**NFRs:** NFR-3

### Story 6.4: Codebase-Wide Structural-Aware Truncation

As a developer,
I want `truncateContext` applied to all prompt-construction sites,
So that the LLM never receives markdown truncated mid-bullet or mid-bold.

**Acceptance Criteria:**

**Given** `impactPrompts.ts:34,59` and `storyPrompts.ts:36,61` still use raw `slice(0, MAX_CONTEXT_CHARS)` cutting mid-markdown
**When** the rollout is applied
**Then** all four raw slices are replaced with `truncateContext(text, MAX)` calls
**And** the duplicated `TRUNCATION_MARKER` literal is consolidated into a shared export

**Given** a prompt context that exceeds the character budget
**When** it is truncated
**Then** truncation occurs at the last `\n\n` boundary before the limit
**And** no markdown structure (bullets, bold, headers) is cut mid-element

### Story 6.5: Prompt-Injection Hardening

As an architect,
I want untrusted KB/RD/code fields wrapped in delimiters before injection into LLM prompts,
So that prompt-injection / instruction-override payloads in analyzed content cannot manipulate the model.

**Acceptance Criteria:**

**Given** prompt builders across the codebase (`buildKbContextBlock`, `impactPrompts.ts`, `storyPrompts.ts`, test-gen prompts) interpolate untrusted content raw
**When** the hardening is applied
**Then** a shared `sanitizeForPrompt()` helper is created in a shared module
**And** all prompt-construction sites wrap untrusted fields (KB module names/descriptions, RD titles/content, endpoint paths/methods, architecture summaries, code content) via `sanitizeForPrompt()`
**And** the helper uses XML fences or escaping to delimit untrusted content

**Given** a KB/RD field containing a prompt-injection payload (e.g., "Ignore previous instructions and...")
**When** it is passed through `sanitizeForPrompt()`
**Then** the payload is contained within delimiters that the model is instructed to treat as data, not instructions

**NFRs:** NFR-3

### Story 6.6: Split `convex/knowledge/internal.ts`

As a developer,
I want `convex/knowledge/internal.ts` (currently 1,107 lines, 38% over the 800-line cap) split into focused modules,
So that the file is within the project's size limits and KB-lifecycle code is navigable.

**Acceptance Criteria:**

**Given** `internal.ts` exceeds the 800-line cap with mixed concerns (resync functions, ingestion-complete handler, workflow hooks, module CRUD)
**When** the split is applied (gated — triggered when the next change lands in this file)
**Then** `internal.ts` re-exports from `internal/resync.ts` (`_snapshotModulesForResync`, `_storeModuleDiff`, `_deleteModulesByKb`, `_resetKbForResync`)
**And** `internal/ingestion.ts` owns `_handleIngestionComplete` + workflow hooks
**And** all existing imports of `internal.ts` continue to work (re-export preserves API)
**And** no behavior change — pure structural refactor

### Story 6.7: Promote `errorMessage()` to Shared Utility

As a developer,
I want `errorMessage()` promoted to `src/lib/`,
So that the duplicated ConvexError message-scraping logic across components is consolidated.

**Acceptance Criteria:**

**Given** `errorMessage()` has 2+ local copies (`stories/[storyId]/page.tsx`, `CopyStoryButton.tsx`) and the "promote on 3rd caller" rule has fired
**When** the promotion is applied (opportunistic — triggered when next touching a file with a local copy)
**Then** `errorMessage()` is exported from `src/lib/`
**And** all local copies are replaced with imports from the shared module
**And** the ConvexError message-scraping regex (`/^Uncaught ConvexError:\s*/`) lives in one place

### Story 6.8: TOCTOU Race on `getStaleTests`/Re-Sync

As an architect,
I want the race condition between `getStaleTests` and concurrent KB re-sync eliminated,
So that stale-test flagging does not read inconsistent state during a re-sync.

**Acceptance Criteria:**

**Given** `getStaleTests` reads `kb.status` ("ready") and `module_diff` without a lock, and a concurrent re-sync can flip status to "building" and clear/replace `module_diff` between reads
**When** the race is addressed
**Then** the fix uses OCC (optimistic concurrency control) or a snapshot isolation mechanism to ensure read consistency across the join fan-out
**And** `getStaleTests` returns either consistent pre-sync state or consistent post-sync state — never a mix
**And** the same pattern is verified against the `resyncKnowledgeBase` TOCTOU surface

**NFRs:** NFR-3

### Story 6.9: Deferred-Work Triage & Cleanup

As a developer,
I want `deferred-work.md` triaged and stale items closed,
So that the debt backlog is accurate and actionable for future planning.

**Acceptance Criteria:**

**Given** `deferred-work.md` has accumulated items across Epics 1–5 (some resolved, some stale, some blocking)
**When** the triage is complete
**Then** resolved items are marked `✅ RESOLVED` with evidence
**And** stale items that no longer apply are removed with a brief note
**And** blocking items (F3 dead dedup branch, F4 unbounded `.collect()`) are promoted to action or explicitly accepted with rationale
**And** remaining items have clear priority and ownership
