# PRD: MSI Analyst (Original — Pre-Merge)

**title:** MSI Analyst
**created:** 2026-06-08
**updated:** 2026-06-08
**status:** Merged into MSI Forge (see docs/PRD.md)

This is the original MSI Analyst PRD as provided before merging with MSI Test to create MSI Forge. Kept for historical reference.

---

## 0. Document Purpose

This PRD defines MSI Analyst — an AI-powered project intelligence platform for MSI's business analysts. Features are grouped with functional requirements nested and numbered globally.

## 1. Vision

MSI runs multiple client projects simultaneously. When a BA responsible for a project is unavailable, work stalls — no other BA can step in because they lack project context. Existing Requirements Documents are stale; code is the only reliable source of truth. Feature requests from clients pile up waiting for the "right" BA to return.

MSI Analyst solves this by reverse-engineering a living understanding of every project directly from production code. It builds a Knowledge Base that any BA can query instantly. When a new feature request arrives, the AI analyzes it against the current codebase, identifies what's affected, generates user stories with acceptance criteria, and surfaces insights that would normally require days of code exploration. BAs interact through a ChatGPT-style conversation — asking questions, refining stories, and getting answers grounded in actual code evidence.

The result: any BA can work on any project, on day one.

## 2. Target User

### 2.1 Jobs To Be Done

When a colleague is unavailable, I need to continue their project's BA work so the client doesn't wait.
When I receive a new feature request, I need to understand what it impacts in the codebase so I don't miss dependencies or underestimate scope.
When I'm new to a project, I need to get up to speed fast so I can be productive without relying on the original BA's tribal knowledge.
When I need to write user stories, I want AI to draft them grounded in the actual codebase so they're accurate and complete.
When a client asks a question about their project, I need a quick, accurate answer without spending hours reading code.

### 2.2 Non-Users (v1)

External clients (no client-facing access in v1)
Developers writing code (this is a BA tool, not a development tool)
Automated CI/CD pipelines

### 2.3 Key User Journeys

UJ-1. Ana onboards a new project into MSI Analyst.
UJ-2. Ana analyzes a new feature request for an unfamiliar project.
UJ-3. Ana answers an urgent client question about a project.

## 3. Glossary

Project, Knowledge Base, Baseline RD, Old RD, Drift Report, Code Chunk, Module, Feature Request, Impact Analysis, User Story, Thread.

## 4. Features

### 4.1 Project Onboarding

FR-1: Create Project — BA creates project with name and GitHub repo URL
FR-2: Connect GitHub Repository — System reads repo via PAT token
FR-3: Upload Old Requirements Document — BA uploads existing RD (Word/PDF/Markdown)
FR-4: Trigger Analysis Pipeline — System triggers automated pipeline on "Analyze"

### 4.2 Knowledge Base Construction

FR-5: Read Repository Contents — System reads source files from GitHub
FR-6: Code Chunking — System splits code into meaningful chunks
FR-7: Vector Embedding — System generates vector embeddings for semantic search
FR-8: Architecture Extraction — AI extracts architecture summary
FR-9: Module Mapping — AI identifies major modules
FR-10: API Surface Extraction — AI extracts API endpoints
FR-11: Data Model Extraction — AI extracts database schemas
FR-12: User Flow Reconstruction — AI reconstructs user-facing flows

### 4.3 Baseline RD Generation and Drift Report

FR-13: Generate Baseline RD — AI generates structured RD from Knowledge Base
FR-14: Generate Drift Report — AI compares Old RD vs Knowledge Base
FR-15: View and Edit Baseline RD — BA views and edits Baseline RD sections
FR-16: View Drift Report — BA views Drift Report alongside Baseline RD

### 4.4 AI Chat Interface

FR-17: Create Chat Thread — BA starts new chat thread
FR-18: Send Messages — BA sends messages, AI responds with streaming
FR-19: Knowledge-Grounded Responses — RAG-powered responses citing code evidence
FR-20: Feature Request Analysis — AI generates structured impact analysis
FR-21: User Story Generation — AI generates stories with acceptance criteria
FR-22: Iterative Refinement — BA refines analysis through follow-up questions
FR-23: Project Q&A — BA asks free-form questions, gets grounded answers

### 4.5 Export and Story Management

FR-24: Story List View — BA views all stories for a project
FR-25: Story Status Management — BA manages story status (draft/approved/exported)
FR-26: Export User Stories — BA exports stories as markdown/text
FR-27: Export Baseline RD — BA exports RD as HTML/Markdown/PDF
FR-28: Knowledge Base Refresh — BA triggers re-sync of Knowledge Base

## 5. Non-Goals (Explicit)

Code generation or modification, CI/CD integration, Project management features, Real-time code monitoring, Multi-tenant isolation, Client-facing access, Automated testing integration, Code review features.

## 6. MVP Scope

### 6.1 In Scope

Project creation and GitHub repo connection, Old RD upload, Code ingestion pipeline, KB construction, Baseline RD generation with confidence scores, Drift Report, Baseline RD viewer/editor, ChatGPT-style chat with streaming, RAG-grounded responses, Feature request analysis, User story generation, Iterative refinement, Project Q&A, Story list and status management, Export, KB refresh, Basic auth for 5 users, Multi-project dashboard, Self-hosted via Coolify.

### 6.2 Out of Scope for MVP

Azure DevOps integration, Confluence integration, OAuth-based GitHub auth, Automated scheduled refresh, RBAC, Audit logging, Mobile-responsive optimization, Multi-tenant data isolation.

## 7. Success Metrics

SM-1: BA adoption — 4/5 BAs use weekly within 4 weeks
SM-2: Time-to-impact-analysis — under 5 minutes
SM-3: Story acceptance rate — 70% approved without major rewrites
SM-4: KB accuracy — "mostly/fully accurate" for 4/5 projects
SM-5: Cross-project coverage — 4/5 active projects onboarded within 6 weeks

## 8. Open Questions

- Z.AI API endpoint URL and model name?
- Coolify requirements for Next.js + Convex?
- Multi-repo project support?
- Maximum codebase size?
- Thread limit per project?

## 9. Assumptions Index

- Z.AI provides OpenAI-compatible API
- GitHub PAT tokens grant sufficient access
- Small-to-medium repos within GitHub API rate limits
- Convex vector store sufficient for RAG
- Old RD formats roughly similar across projects
- 5 BAs and 5 projects pilot scope
- Solo developer, ~8 weeks
- LLM code analysis quality sufficient
