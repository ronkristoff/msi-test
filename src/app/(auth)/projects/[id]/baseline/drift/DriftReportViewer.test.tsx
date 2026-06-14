import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockTriggerDriftReport = vi.fn();
let mockDriftReport: unknown = undefined;
let mockOldRd: unknown = undefined;
let mockKb: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((queryRef: unknown) => {
    const key = typeof queryRef === "string" ? queryRef : String(queryRef);
    if (key.includes("getDriftReport")) return mockDriftReport;
    if (key.includes("getOldRd")) return mockOldRd;
    if (key.includes("getKnowledgeBase")) return mockKb;
    return undefined;
  }),
  useAction: vi.fn(() => mockTriggerDriftReport),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getDriftReport: "knowledge.queries.getDriftReport",
        getOldRd: "knowledge.queries.getOldRd",
        getKnowledgeBase: "knowledge.queries.getKnowledgeBase",
      },
      triggerIngestion: {
        triggerDriftReport: "knowledge.triggerIngestion.triggerDriftReport",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const readyKb = {
  _id: "kb1",
  status: "ready",
  workspace_id: "ws1",
  project_id: "proj1",
};

const reportWithItems = {
  _id: "dr1",
  project_id: "proj1",
  knowledge_base_id: "kb1",
  baseline_rd_id: "rd1",
  version: 1,
  status: "draft",
  bmad_detected: false,
  generated_at: 1700000000000,
  items: [
    {
      dimension: "old-rd-vs-code",
      category: "added",
      severity: "breaking",
      title: "OAuth login added",
      description: "The code now supports OAuth which the Old RD did not mention.",
      rd_section_id: "user-flows",
    },
    {
      dimension: "old-rd-vs-code",
      category: "removed",
      severity: "significant",
      title: "Legacy export endpoint removed",
      description: "The /export endpoint described in the Old RD is no longer present.",
      rd_section_id: "api-surface",
    },
    {
      dimension: "adr-drift",
      category: "changed",
      severity: "incremental",
      title: "Session storage changed",
      description: "Sessions moved from JWT to cookie-based.",
      rd_section_id: "decision-log",
    },
  ],
};

async function setup() {
  const { default: DriftReportPage } = await import("./page");
  return render(<DriftReportPage />);
}

describe("DriftReportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockDriftReport = undefined;
    mockOldRd = undefined;
    mockKb = readyKb;
    mockTriggerDriftReport.mockResolvedValue({ driftReportId: "dr2", version: 2 });
  });

  it("renders loading skeleton when queries are undefined", async () => {
    await setup();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders no-Old-RD empty state when getOldRd returns null", async () => {
    mockOldRd = null;
    mockDriftReport = null;
    await setup();
    expect(screen.getByText(/No Old Requirements Document/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /project settings/i })).toHaveAttribute(
      "href",
      "/projects/proj1/settings",
    );
  });

  it("renders generating state when Old RD exists but report is null and KB ready", async () => {
    mockOldRd = { has_old_rd: true };
    mockDriftReport = null;
    mockKb = readyKb;
    await setup();
    expect(screen.getByText(/Generating Drift Report/i)).toBeInTheDocument();
  });

  it("renders report with grouped dimensions and severity badges", async () => {
    mockOldRd = { has_old_rd: true };
    mockDriftReport = reportWithItems;
    await setup();

    expect(screen.getByText("OAuth login added")).toBeInTheDocument();
    expect(screen.getByText("Legacy export endpoint removed")).toBeInTheDocument();
    expect(screen.getByText("Breaking")).toBeInTheDocument();
    expect(screen.getByText("Significant")).toBeInTheDocument();
  });

  it("renders ADR drifts in a separate section", async () => {
    mockOldRd = { has_old_rd: true };
    mockDriftReport = reportWithItems;
    await setup();

    expect(screen.getByText("Architecture Decision Drifts")).toBeInTheDocument();
    expect(screen.getByText("Session storage changed")).toBeInTheDocument();
  });

  it("shows RD section reference label for items with rd_section_id", async () => {
    mockOldRd = { has_old_rd: true };
    mockDriftReport = reportWithItems;
    await setup();

    expect(screen.getByText(/RD: User Flows/i)).toBeInTheDocument();
    expect(screen.getByText(/RD: API Surface/i)).toBeInTheDocument();
  });

  it("renders Regenerate button in ready state and calls triggerDriftReport on click", async () => {
    const user = userEvent.setup();
    mockOldRd = { has_old_rd: true };
    mockDriftReport = reportWithItems;
    await setup();

    const regenerateBtn = screen.getByRole("button", { name: /Regenerate/i });
    await user.click(regenerateBtn);

    expect(mockTriggerDriftReport).toHaveBeenCalledWith({
      project_id: "proj1",
    });
  });

  it("shows error alert when regenerate action returns an error", async () => {
    const user = userEvent.setup();
    mockOldRd = { has_old_rd: true };
    mockDriftReport = reportWithItems;
    mockTriggerDriftReport.mockResolvedValue({
      driftReportId: null,
      version: 0,
      error: "AI provider timeout",
    });
    await setup();

    await user.click(screen.getByRole("button", { name: /Regenerate/i }));
    expect(await screen.findByText(/AI provider timeout/i)).toBeInTheDocument();
  });

  it("renders empty-drift message when report has zero items", async () => {
    mockOldRd = { has_old_rd: true };
    mockDriftReport = { ...reportWithItems, items: [] };
    await setup();

    expect(screen.getByText(/No drift detected/i)).toBeInTheDocument();
  });

  it("renders error state with generation_error and Regenerate when report is failed", async () => {
    mockOldRd = { has_old_rd: true };
    mockDriftReport = {
      ...reportWithItems,
      status: "failed",
      generation_error: "AI provider timeout",
      items: [],
    };
    await setup();

    expect(screen.getByText(/Drift Report generation failed/i)).toBeInTheDocument();
    expect(screen.getByText(/AI provider timeout/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeInTheDocument();
  });
});
