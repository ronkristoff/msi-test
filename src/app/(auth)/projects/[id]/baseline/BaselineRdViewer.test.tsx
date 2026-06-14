import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateBaselineRd = vi.fn(() => Promise.resolve());
const mockTriggerBaselineRd = vi.fn(() =>
  Promise.resolve({ baselineRdId: "rd1", version: 1 }),
);

let mockBaselineRd: unknown = undefined;
let mockKb: unknown = undefined;
let mockBmadMetadata: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((queryRef: unknown) => {
    const key = typeof queryRef === "string" ? queryRef : String(queryRef);
    if (key.includes("getBaselineRd")) return mockBaselineRd;
    if (key.includes("getKnowledgeBase")) return mockKb;
    if (key.includes("getBmadMetadata")) return mockBmadMetadata;
    return undefined;
  }),
  useAction: vi.fn(() => mockTriggerBaselineRd),
  useMutation: vi.fn(() => mockUpdateBaselineRd),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getBaselineRd: "knowledge.queries.getBaselineRd",
        getKnowledgeBase: "knowledge.queries.getKnowledgeBase",
        getBmadMetadata: "knowledge.queries.getBmadMetadata",
      },
      triggerIngestion: {
        triggerBaselineRd: "knowledge.triggerIngestion.triggerBaselineRd",
      },
      baselineRdMutations: {
        updateBaselineRd: "knowledge.baselineRdMutations.updateBaselineRd",
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

const draftRd = {
  _id: "rd1",
  _creationTime: 1700000000000,
  project_id: "proj1",
  knowledge_base_id: "kb1",
  version: 3,
  status: "draft",
  sections: [
    { id: "overview", title: "Overview", content: "Overview body.", confidence: 0.85 },
    {
      id: "tech-stack",
      title: "Tech Stack",
      content: "Next.js",
      confidence: 0.4,
      divergence_note: "PRD mentions Vue.",
      bmad_alignment: { prd_section_title: "Tech Stack", agreement: "diverge" },
    },
    { id: "modules", title: "Modules", content: "Auth module.", confidence: 0.6 },
  ],
  generated_at: 1700000000000,
};

async function setup() {
  const { default: BaselineRdPage } = await import("./page");
  return render(<BaselineRdPage />);
}

describe("BaselineRdPage — state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaselineRd = undefined;
    mockKb = readyKb;
    mockTriggerBaselineRd.mockResolvedValue({ baselineRdId: "rd1", version: 1 });
  });

  it("renders loading skeleton when queries are undefined", async () => {
    await setup();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders KB-required empty state when KB is not ready", async () => {
    mockKb = { status: "building" };
    mockBaselineRd = null;
    await setup();
    expect(screen.getByText(/Knowledge Base required/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /knowledge/i })).toHaveAttribute(
      "href",
      "/projects/proj1/knowledge",
    );
  });

  it("renders KB-required empty state when KB is null", async () => {
    mockKb = null;
    mockBaselineRd = null;
    await setup();
    expect(screen.getByText(/Knowledge Base required/i)).toBeInTheDocument();
  });

  it("renders no-RD state with Generate button when KB ready but RD is null", async () => {
    mockKb = readyKb;
    mockBaselineRd = null;
    await setup();
    expect(screen.getByRole("button", { name: /Generate Baseline RD/i })).toBeInTheDocument();
  });

  it("clicking Generate calls triggerBaselineRd action", async () => {
    const user = userEvent.setup();
    mockKb = readyKb;
    mockBaselineRd = null;
    await setup();
    await user.click(screen.getByRole("button", { name: /Generate Baseline RD/i }));
    await vi.waitFor(() => {
      expect(mockTriggerBaselineRd).toHaveBeenCalledWith({ project_id: "proj1" });
    });
  });

  it("surfaces generation error from action return in an Alert", async () => {
    const user = userEvent.setup();
    mockKb = readyKb;
    mockBaselineRd = null;
    mockTriggerBaselineRd.mockResolvedValue({
      baselineRdId: null,
      version: 0,
      error: "AI provider timeout",
    });
    await setup();
    await user.click(screen.getByRole("button", { name: /Generate Baseline RD/i }));
    expect(await screen.findByText(/AI provider timeout/i)).toBeInTheDocument();
  });

  it("renders RD with sections, confidence pills, divergence note, and BMAD badge", async () => {
    mockBaselineRd = draftRd;
    await setup();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Tech Stack")).toBeInTheDocument();
    expect(screen.getByText("Modules")).toBeInTheDocument();
    expect(screen.getAllByText("High").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText(/PRD mentions Vue./i)).toBeInTheDocument();
    expect(screen.getByText("Diverge")).toBeInTheDocument();
    expect(screen.getByText(/v3/i)).toBeInTheDocument();
  });
});

describe("BaselineRdPage — approve / mark-as-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKb = readyKb;
    mockBaselineRd = draftRd;
  });

  it("shows Approve button when status is draft and calls mutation on click", async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(screen.getByRole("button", { name: /Approve/i }));
    await vi.waitFor(() => {
      expect(mockUpdateBaselineRd).toHaveBeenCalledWith({
        rd_id: "rd1",
        status: "approved",
      });
    });
  });

  it("shows Mark as Draft button when status is approved", async () => {
    mockBaselineRd = { ...draftRd, status: "approved" };
    const user = userEvent.setup();
    await setup();
    const btn = screen.getByRole("button", { name: /Mark as Draft/i });
    await user.click(btn);
    await vi.waitFor(() => {
      expect(mockUpdateBaselineRd).toHaveBeenCalledWith({
        rd_id: "rd1",
        status: "draft",
      });
    });
  });

  it("does not show Approve when status is approved", async () => {
    mockBaselineRd = { ...draftRd, status: "approved" };
    await setup();
    expect(screen.queryByRole("button", { name: /^Approve$/i })).not.toBeInTheDocument();
  });

  it("does not show Mark as Draft when status is draft", async () => {
    await setup();
    expect(screen.queryByRole("button", { name: /Mark as Draft/i })).not.toBeInTheDocument();
  });
});

describe("BaselineRdPage — export control visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKb = readyKb;
    mockBmadMetadata = null;
  });

  it("does not render an Export button when RD is draft", async () => {
    mockBaselineRd = draftRd;
    await setup();
    expect(screen.queryByRole("button", { name: /^Export$/i })).not.toBeInTheDocument();
  });

  it("shows BMAD PRD export option when bmad_detected is true and RD is approved", async () => {
    const user = userEvent.setup();
    mockBaselineRd = { ...draftRd, status: "approved" };
    mockKb = { ...readyKb, bmad_detected: true };
    mockBmadMetadata = { adrs: [], prd_sections: [], conventions: [], domain_terms: [] };
    await setup();
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    expect(screen.getByRole("menuitem", { name: /BMAD PRD/i })).toBeInTheDocument();
  });

  it("does not show BMAD PRD option when bmad_detected is false", async () => {
    const user = userEvent.setup();
    mockBaselineRd = { ...draftRd, status: "approved" };
    mockKb = { ...readyKb, bmad_detected: false };
    await setup();
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    expect(screen.queryByRole("menuitem", { name: /BMAD PRD/i })).not.toBeInTheDocument();
  });
});

describe("BaselineRdPage — inline edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKb = readyKb;
    mockBaselineRd = draftRd;
  });

  it("clicking Edit opens a textarea pre-populated with content", async () => {
    const user = userEvent.setup();
    await setup();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await user.click(editButtons[0]);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe("Overview body.");
  });

  it("Save calls updateBaselineRd with section_updates and returns to read mode", async () => {
    const user = userEvent.setup();
    await setup();
    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await user.click(editButtons[0]);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "Edited overview.");
    await user.click(screen.getByRole("button", { name: /Save/i }));
    await vi.waitFor(() => {
      expect(mockUpdateBaselineRd).toHaveBeenCalledWith({
        rd_id: "rd1",
        section_updates: [{ id: "overview", content: "Edited overview." }],
      });
    });
  });

  it("Discard closes the textarea and does not call the mutation", async () => {
    const user = userEvent.setup();
    await setup();
    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await user.click(editButtons[0]);
    await user.click(screen.getByRole("button", { name: /Discard/i }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mockUpdateBaselineRd).not.toHaveBeenCalled();
  });
});
