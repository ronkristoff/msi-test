# UI Component Inventory — Frontend (Next.js)

## Overview

**54 component files** (49 `.tsx` + 5 test files), organized into 7 categories.

---

## 1. UI Primitives — `src/components/ui/` (11 files)

Shared design system primitives.

| Component | File | Type | Description |
|---|---|---|---|
| `Button` | `Button.tsx` | Input | Styled button with variants |
| `Input` | `FormField.tsx` | Input | Text input with label, error, help text |
| `Select` | `FormField.tsx` | Input | Select dropdown with label |
| `Textarea` | `FormField.tsx` | Input | Multi-line text input |
| `Toggle` | `Toggle.tsx` | Input | Boolean toggle switch |
| `Card` | `Card.tsx` | Layout | Container card with padding |
| `StatusPill` | `StatusPill.tsx` | Display | Colored status indicator pill |
| `StatCard` | `StatCard.tsx` | Display | KPI card (label + value + trend) |
| `Skeleton` | `Skeleton.tsx` | Loading | Generic skeleton loader |
| `RunDetailSkeleton` | `Skeleton.tsx` | Loading | Run detail page skeleton |
| `PageSkeleton` | `Skeleton.tsx` | Loading | Full page skeleton |
| `EmptyState` | `EmptyState.tsx` | Display | Empty state with icon + action |
| `Alert` | `Alert.tsx` | Feedback | Alert/warning/error message |
| `Topbar` | `Topbar.tsx` | Layout | Page header with title, subtitle, actions |
| `QueryResult` | `QueryResult.tsx` | Display | Async query result handler (loading/error/data) |
| `index.ts` | `index.ts` | Barrel | Re-exports all UI components |

---

## 2. Layout Components (3 files)

| Component | File | Purpose |
|---|---|---|
| `AppLayout` | `AppLayout.tsx` | Full app shell: 240px sidebar (nav sections + user menu) + topbar + breadcrumbs + content |
| `Breadcrumbs` | `Breadcrumbs.tsx` | Dynamic breadcrumb trail using Convex queries for project/suite/test list names |
| `Topbar` | `ui/Topbar.tsx` | Page header bar (title, subtitle, actions slot, TaskTray) |

---

## 3. Domain Feature Components — `src/components/` (16 files)

Reusable components with business logic.

| Component | File | Purpose |
|---|---|---|
| `AIConfigForm` | `AIConfigForm.tsx` | AI provider config form (endpoint URL, model, API key). Uses `useFormContext`, supports presets, model dropdown, Browser AI advanced section |
| `Logo` | `Logo.tsx` | SVG logo component (28px default) |
| `PRDInput` | `PRDInput.tsx` | PRD text input + file upload form section |
| `RunsList` | `RunsList.tsx` | Full runs table with tabs (All/Passed/Failed/Cancelled), search, sort, branch/env filters. Exports `StatusTab`, `SortField`, `SortOrder` types |
| `TaskTray` | `TaskTray.tsx` | Real-time task status indicator in topbar (active generation tasks + progress) |
| `TestChat` | `TestChat.tsx` | AI chat interface for refining individual tests |
| `TestAccordionItem` | `TestAccordionItem.tsx` | Accordion row for single test (expand for Playwright code, heal, lock/unlock, status change, add to list) |
| `AddToListModal` | `AddToListModal.tsx` | Modal for adding tests to test lists with search |
| `ScheduleModal` | `ScheduleModal.tsx` | Modal for creating/editing scheduled runs (suite, environment, cadence) |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Reusable confirmation dialog (title, message, confirm/cancel) |
| `SuiteStatusBanners` | `SuiteStatusBanners.tsx` | Status/error/progress banners for suite generation workflows |
| `TestDataSection` | `TestDataSection.tsx` | Test data key-value pair editor (add/remove rows) |
| `PhaseIndicator` | `PhaseIndicator.tsx` | Multi-step phase progress indicator (circles + lines + labels) |
| `MembersTab` | `MembersTab.tsx` | Workspace members management tab (list, invite code, remove) |
| `ConvexClientProvider` | `ConvexClientProvider.tsx` | Root provider — ConvexReactClient + Better Auth bridge |

---

## 4. Dashboard Sub-Components — `src/components/dashboard/` (5 files + 2 tests)

| Component | File | Purpose |
|---|---|---|
| `StatsGrid` | `StatsGrid.tsx` | 4 stat cards grid: pass rate, failed tests, flaky tests, total tests |
| `PassRateChart` | `PassRateChart.tsx` | Pass rate trend line chart (via recharts) |
| `RecentFailures` | `RecentFailures.tsx` | Recent failure list with AI insights, error messages, test names |
| `ActiveRuns` | `ActiveRuns.tsx` | Currently running tests list with progress bars |
| `SectionHeader` | `SectionHeader.tsx` | Section title + optional action button |

---

## 5. Run Detail Sub-Components — `src/components/RunDetail/` (8 files + barrel)

| Component | File | Purpose |
|---|---|---|
| `TestList` | `TestList.tsx` | List of test results in a run (expandable rows) |
| `StepTimeline` | `StepTimeline.tsx` | Per-test step timeline with status icons, screenshots, durations |
| `ScreenshotViewer` | `ScreenshotViewer.tsx` | Full-screen screenshot modal |
| `ConsoleOutput` | `ConsoleOutput.tsx` | Console log viewer with syntax highlighting |
| `SameFailureHistory` | `SameFailureHistory.tsx` | Previous failures for the same test |
| `TestMetadata` | `TestMetadata.tsx` | Test metadata panel (duration, retries, status) |
| `ArtifactViewer` | `ArtifactViewer.tsx` | Video/trace/screenshot artifact navigation |
| `HealingHistoryTimeline` | `HealingHistoryTimeline.tsx` | Healing event timeline with original vs healed selectors |

---

## 6. Flakiness Map Sub-Components — `src/components/FlakinessMap/` (6 files + barrel)

| Component | File | Purpose |
|---|---|---|
| `HeatmapGrid` | `HeatmapGrid.tsx` | Test × Run heatmap grid with color-coded status cells |
| `FilterBar` | `FilterBar.tsx` | Filter controls (flakiness level, source type, project) |
| `TestDetailPanel` | `TestDetailPanel.tsx` | Side panel with test details and run history |
| `ClusterAnnotations` | `ClusterAnnotations.tsx` | AI-identified flakiness cluster annotations |
| `SparklineChart` | `SparklineChart.tsx` | Per-test pass/fail sparkline chart |
| `ExportCsv` | `ExportCsv.tsx` | CSV export (exports `buildCsvContent`, `downloadCsv` functions) |

---

## 7. Page Components — `src/app/` (22 page files)

| Route | File | Purpose |
|---|---|---|
| `/` | `page.tsx` | Redirect to `/login` |
| `/login` | `(public)/login/page.tsx` | Login/signup with email/password + Google OAuth |
| `/onboarding` | `(auth)/onboarding/page.tsx` | Sidebarless onboarding flow (name workspace → AI config → done) |
| `/dashboard` | `(auth)/dashboard/page.tsx` | Dashboard: stats grid + pass rate chart + recent failures + active runs |
| `/runs` | `(auth)/runs/page.tsx` | Test execution history table with filtering/sorting |
| `/runs/[id]` | `(auth)/runs/[id]/page.tsx` | Run detail: test list + steps + screenshots + artifacts |
| `/flakiness-map` | `(auth)/flakiness-map/page.tsx` | Heatmap grid + filters + AI clusters + CSV export |
| `/projects` | `(auth)/projects/page.tsx` | Project list (active + archived tabs) |
| `/projects/new` | `(auth)/projects/new/page.tsx` | Create project form |
| `/projects/[id]` | `(auth)/projects/[id]/page.tsx` | Project overview: suites + environments |
| `/projects/[id]/settings` | `(auth)/projects/[id]/settings/page.tsx` | Project settings |
| `/projects/[id]/generate` | `(auth)/projects/[id]/generate/page.tsx` | PRD-based test generation |
| `/projects/[id]/generate-nl` | `(auth)/projects/[id]/generate-nl/page.tsx` | Natural language test generation |
| `/projects/[id]/explore` | `(auth)/projects/[id]/explore/page.tsx` | URL exploration + page discovery |
| `/projects/[id]/environments` | `(auth)/projects/[id]/environments/page.tsx` | Environment management |
| `/projects/[id]/suites/[suiteId]` | `(auth)/projects/[id]/suites/[suiteId]/page.tsx` | Suite detail: tests + regression members |
| `/insights` | `(auth)/insights/page.tsx` | AI root cause analysis + flakiness clusters |
| `/test-lists` | `(auth)/test-lists/page.tsx` | Test list management |
| `/test-lists/[id]` | `(auth)/test-lists/[id]/page.tsx` | Test list detail + add tests |
| `/monitoring` | `(auth)/monitoring/page.tsx` | Scheduled runs management |
| `/monitoring/[id]` | `(auth)/monitoring/[id]/page.tsx` | Schedule detail with run history + diff |
| `/settings` | `(auth)/settings/page.tsx` | Workspace settings (AI provider, profile, workspace, members) |

---

## Component Hierarchy

```
<ConvexClientProvider>
  ├── (public)
  │   └── <LoginPage>
  │
  └── (auth) <AppLayout>
      ├── <Topbar> (title + <TaskTray>)
      ├── <Breadcrumbs>
      └── <PageContent>
          ├── <StatsGrid> / <PassRateChart> / <RecentFailures> (dashboard)
          ├── <RunsList> (runs page)
          ├── <HeatmapGrid> + <FilterBar> + <ClusterAnnotations> (flakiness)
          ├── <AIConfigForm> (settings)
          └── <TestAccordionItem> + <TestChat> (suite detail)
```

---

## Design System

| Token | Value |
|---|---|
| **Framework** | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| **Charts** | recharts 3.8.1 |
| **Notifications** | sonner 2.0.7 |
| **Logo** | `<Logo>` SVG component |
| **Icons** | Inline SVG (no icon library dependency) |
| **Status colors** | `StatusPill` variants: success/danger/warn/neutral/running |
| **Flakiness colors** | `FlakinessLevel` mapping: green → yellow → orange → red |
| **Form validation** | zod + react-hook-form via `@hookform/resolvers` |
