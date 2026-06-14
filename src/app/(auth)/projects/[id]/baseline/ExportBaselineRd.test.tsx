import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDownloadFile = vi.fn();

vi.mock("./downloadFile", () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => null),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getBmadMetadata: "knowledge.queries.getBmadMetadata",
      },
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const approvedRd = {
  _id: "rd1",
  _creationTime: 1700000000000,
  workspace_id: "ws1",
  project_id: "proj1",
  knowledge_base_id: "kb1",
  version: 3,
  status: "approved" as const,
  sections: [
    { id: "overview", title: "Overview", content: "Overview body.", confidence: 0.9 },
    { id: "tech-stack", title: "Tech Stack", content: "- Next.js", confidence: 0.7 },
  ],
  generated_at: 1700000000000,
};

const draftRd = { ...approvedRd, status: "draft" as const };

async function renderExport(props: { rd: typeof approvedRd; bmadDetected?: boolean }) {
  const { ExportBaselineRd } = await import("./ExportBaselineRd");
  return render(<ExportBaselineRd rd={props.rd} bmadDetected={props.bmadDetected ?? false} />);
}

describe("ExportBaselineRd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when rd status is draft", async () => {
    await renderExport({ rd: draftRd });
    expect(screen.queryByRole("button", { name: /Export/i })).not.toBeInTheDocument();
  });

  it("renders the Export button when rd status is approved", async () => {
    await renderExport({ rd: approvedRd });
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });

  it("opens the menu on click showing Markdown and HTML options", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(screen.getByRole("menuitem", { name: /Markdown/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /HTML/i })).toBeInTheDocument();
  });

  it("does not show BMAD PRD option when bmadDetected is false", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd, bmadDetected: false });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(screen.queryByRole("menuitem", { name: /BMAD PRD/i })).not.toBeInTheDocument();
  });

  it("shows BMAD PRD option when bmadDetected is true", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd, bmadDetected: true });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(screen.getByRole("menuitem", { name: /BMAD PRD/i })).toBeInTheDocument();
  });

  it("clicking Markdown calls downloadFile with .md filename", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [, filename, mimeType] = mockDownloadFile.mock.calls[0];
    expect(filename).toBe("baseline-rd-v3.md");
    expect(mimeType).toContain("markdown");
  });

  it("clicking HTML calls downloadFile with .html filename", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /HTML/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [, filename, mimeType] = mockDownloadFile.mock.calls[0];
    expect(filename).toBe("baseline-rd-v3.html");
    expect(mimeType).toContain("html");
  });

  it("clicking BMAD PRD calls downloadFile three times with exact filenames", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd, bmadDetected: true });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /BMAD PRD/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(3);
    const filenames = mockDownloadFile.mock.calls.map((call) => call[1]);
    expect(filenames).toEqual(["prd.md", "addendum.md", "decision-log.md"]);
  });

  it("closes the menu after selecting an option", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    expect(screen.queryByRole("menuitem", { name: /Markdown/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /HTML/i })).not.toBeInTheDocument();
  });

  it("closes the menu on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    await renderExport({ rd: approvedRd });
    const trigger = screen.getByRole("button", { name: /Export/i });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
