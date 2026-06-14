import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDownloadFile = vi.fn();

vi.mock("../downloadFile", () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const driftReport = {
  _id: "dr1",
  _creationTime: 1700000000000,
  workspace_id: "ws1",
  project_id: "proj1",
  knowledge_base_id: "kb1",
  baseline_rd_id: "rd1",
  version: 2,
  status: "draft" as const,
  items: [
    {
      dimension: "old-rd-vs-code" as const,
      category: "added" as const,
      severity: "breaking" as const,
      title: "New auth module",
      description: "Codebase has an Auth module.",
    },
  ],
  bmad_detected: false,
  generated_at: 1700000000000,
};

async function renderExport() {
  const { ExportDriftReport } = await import("./ExportDriftReport");
  return render(<ExportDriftReport report={driftReport} baselineRdVersion={3} />);
}

describe("ExportDriftReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the export button", async () => {
    await renderExport();
    expect(screen.getByRole("button", { name: /Export Drift Report/i })).toBeInTheDocument();
  });

  it("calls downloadFile once with the drift-report-v{version}.md filename on click", async () => {
    const user = userEvent.setup();
    await renderExport();
    await user.click(screen.getByRole("button", { name: /Export Drift Report/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [content, filename, mimeType] = mockDownloadFile.mock.calls[0];
    expect(filename).toBe("drift-report-v2.md");
    expect(mimeType).toContain("markdown");
    expect(content).toContain("# Drift Report");
    expect(content).toContain("Baseline RD v3");
    expect(content).toContain("New auth module");
    expect(content).toContain("Old RD vs Code");
  });
});
