import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockTriggerIngestion = vi.fn();
const mockResyncKnowledgeBase = vi.fn();
let mockKb: unknown = undefined;
let mockModules: unknown = undefined;
let mockBmadMetadata: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown, args: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getKnowledgeBase")) return mockKb;
    if (key.includes("getModules")) return mockModules;
    if (key.includes("getBmadMetadata")) return mockBmadMetadata;
    return undefined;
  }),
  useAction: vi.fn((_actionRef: unknown) => {
    const key = typeof _actionRef === "string" ? _actionRef : String(_actionRef);
    if (key.includes("resyncKnowledgeBase")) return mockResyncKnowledgeBase;
    return mockTriggerIngestion;
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getKnowledgeBase: "knowledge.queries.getKnowledgeBase",
        getModules: "knowledge.queries.getModules",
        getBmadMetadata: "knowledge.queries.getBmadMetadata",
      },
      triggerIngestion: {
        triggerIngestion: "knowledge.triggerIngestion.triggerIngestion",
        resyncKnowledgeBase: "knowledge.triggerIngestion.resyncKnowledgeBase",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const buildingKb = {
  _id: "kb1",
  status: "building",
  progress_message: "Reading 42 files...",
  workspace_id: "ws1",
  project_id: "proj1",
};

const readyKb = {
  _id: "kb1",
  status: "ready",
  architecture_summary: "A modular monolith with Convex backend.",
  tech_stack: ["Next.js", "Convex", "Tailwind"],
  folder_structure: "src/app/\n  page.tsx",
  architecture_type: "monolith",
  total_files: 247,
  total_size_bytes: 1258291,
  last_synced_at: 1700000000000,
  workspace_id: "ws1",
  project_id: "proj1",
};

const errorKb = {
  _id: "kb1",
  status: "error",
  error_message: "Failed to clone repository: authentication failed",
  workspace_id: "ws1",
  project_id: "proj1",
};

const mockModuleList = [
  {
    _id: "mod1",
    name: "auth",
    description: "Authentication module",
    file_count: 5,
    dependencies: ["users"],
  },
  {
    _id: "mod2",
    name: "billing",
    description: "Billing system",
    file_count: 12,
    dependencies: ["users", "payments"],
  },
];

async function setup() {
  const { default: KnowledgePage } = await import("./page");
  return render(<KnowledgePage />);
}

describe("KnowledgePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockKb = undefined;
    mockModules = undefined;
    mockBmadMetadata = undefined;
    mockTriggerIngestion.mockResolvedValue(undefined);
    mockResyncKnowledgeBase.mockResolvedValue(undefined);
  });

  it("renders loading skeleton when KB is undefined", async () => {
    await setup();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders empty state when KB is null", async () => {
    mockKb = null;
    await setup();
    expect(screen.getByText("Not Analyzed")).toBeInTheDocument();
    expect(screen.getByText(/connect a repository/i)).toBeInTheDocument();
  });

  it("renders empty state with link to project settings", async () => {
    mockKb = null;
    await setup();
    const settingsLink = screen.getByRole("link", { name: /project settings/i });
    expect(settingsLink).toHaveAttribute("href", "/projects/proj1/settings");
  });

  it("renders building progress with spinner and message", async () => {
    mockKb = buildingKb;
    await setup();
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Reading 42 files...")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders ready state with architecture summary and stats", async () => {
    mockKb = readyKb;
    mockModules = mockModuleList;
    await setup();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("A modular monolith with Convex backend.")).toBeInTheDocument();
    expect(screen.getByText("Next.js")).toBeInTheDocument();
    expect(screen.getByText("Convex")).toBeInTheDocument();
    expect(screen.getByText("Tailwind")).toBeInTheDocument();
    expect(screen.getByText("247")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
  });

  it("renders ready state with module list and links", async () => {
    mockKb = readyKb;
    mockModules = mockModuleList;
    await setup();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("billing")).toBeInTheDocument();
    const moduleLink = screen.getByText("auth").closest("a");
    expect(moduleLink).toHaveAttribute(
      "href",
      "/projects/proj1/knowledge/modules/mod1",
    );
  });

  it("renders error state with message and retry button", async () => {
    mockKb = errorKb;
    await setup();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(
      screen.getByText(/failed to clone repository/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls triggerIngestion when retry button clicked", async () => {
    const user = userEvent.setup();
    mockKb = errorKb;
    await setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockTriggerIngestion).toHaveBeenCalledWith({
      project_id: "proj1",
    });
  });

  it("does not show BMAD badge when bmad_detected is falsy", async () => {
    mockKb = readyKb;
    mockModules = mockModuleList;
    await setup();
    expect(screen.queryByText(/bmad detected/i)).not.toBeInTheDocument();
  });

  it("shows BMAD badge when bmad_detected is truthy", async () => {
    mockKb = { ...readyKb, bmad_detected: true };
    mockModules = mockModuleList;
    await setup();
    expect(screen.getByText(/bmad detected/i)).toBeInTheDocument();
  });

  describe("Re-sync button", () => {
    it("renders Re-sync button when kb.status === ready", async () => {
      mockKb = readyKb;
      mockModules = mockModuleList;
      await setup();
      expect(screen.getByRole("button", { name: /re-sync/i })).toBeInTheDocument();
    });

    it("does not render Re-sync button when kb.status === building", async () => {
      mockKb = buildingKb;
      await setup();
      expect(screen.queryByRole("button", { name: /re-sync/i })).not.toBeInTheDocument();
    });

    it("does not render Re-sync button when kb.status === error", async () => {
      mockKb = errorKb;
      await setup();
      expect(screen.queryByRole("button", { name: /re-sync/i })).not.toBeInTheDocument();
    });

    it("calls window.confirm and resyncKnowledgeBase when clicked", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockKb = readyKb;
      mockModules = mockModuleList;
      await setup();
      await user.click(screen.getByRole("button", { name: /re-sync/i }));
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining("Re-syncing will replace"),
      );
      expect(mockResyncKnowledgeBase).toHaveBeenCalledWith({
        project_id: "proj1",
      });
    });

    it("does not call resyncKnowledgeBase when confirm is cancelled", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      mockKb = readyKb;
      mockModules = mockModuleList;
      await setup();
      await user.click(screen.getByRole("button", { name: /re-sync/i }));
      expect(mockResyncKnowledgeBase).not.toHaveBeenCalled();
    });

    it("shows error alert when resync action fails", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockResyncKnowledgeBase.mockRejectedValue(
        new Error("Uncaught ConvexError: Knowledge Base must be in 'ready' state"),
      );
      mockKb = readyKb;
      mockModules = mockModuleList;
      await setup();
      await user.click(screen.getByRole("button", { name: /re-sync/i }));
      expect(screen.getByText(/must be in 'ready' state/i)).toBeInTheDocument();
    });
  });

  describe("Declared Intent section", () => {
    const bmadMetadataMock = {
      prd_sections: [
        { _id: "b1", key: "Overview", content: "Overview content", source_path: "prd.md" },
        { _id: "b2", key: "Goals", content: "Goals content", source_path: "prd.md" },
      ],
      adrs: [
        { _id: "b3", key: "ADR-0001", content: "Decision", source_path: "a.md", metadata: { title: "Test Runner", status: "Accepted" } },
      ],
      conventions: [
        { _id: "b4", key: "Naming", content: "Use PascalCase", source_path: "pc.md" },
        { _id: "b5", key: "Testing", content: "TDD required", source_path: "pc.md" },
        { _id: "b6", key: "Security", content: "No secrets", source_path: "pc.md" },
      ],
      domain_terms: [
        { _id: "b7", key: "Workspace", content: "Container", source_path: "CONTEXT.md" },
      ],
    };

    it("shows Declared Intent section when bmad_detected is true and KB ready", async () => {
      mockKb = { ...readyKb, bmad_detected: true };
      mockModules = mockModuleList;
      mockBmadMetadata = bmadMetadataMock;
      await setup();
      expect(screen.getByText("Declared Intent")).toBeInTheDocument();
    });

    it("hides Declared Intent section when bmad_detected is falsy", async () => {
      mockKb = readyKb;
      mockModules = mockModuleList;
      mockBmadMetadata = bmadMetadataMock;
      await setup();
      expect(screen.queryByText("Declared Intent")).not.toBeInTheDocument();
    });

    it("hides Declared Intent section when bmad_detected is true but metadata is undefined", async () => {
      mockKb = { ...readyKb, bmad_detected: true };
      mockModules = mockModuleList;
      mockBmadMetadata = undefined;
      await setup();
      expect(screen.queryByText("Declared Intent")).not.toBeInTheDocument();
    });

    it("expands on click to show metadata details", async () => {
      const user = userEvent.setup();
      mockKb = { ...readyKb, bmad_detected: true };
      mockModules = mockModuleList;
      mockBmadMetadata = bmadMetadataMock;
      await setup();

      const toggleBtn = screen.getByText("Declared Intent").closest("button")!;
      await user.click(toggleBtn);

      expect(screen.getByText("PRD Outline")).toBeInTheDocument();
      expect(screen.getByText("Architectural Decisions (1)")).toBeInTheDocument();
      expect(screen.getByText("Conventions (3)")).toBeInTheDocument();
      expect(screen.getByText("Domain Terms (1)")).toBeInTheDocument();
    });

    it("shows correct PRD section count in collapsed summary", async () => {
      mockKb = { ...readyKb, bmad_detected: true };
      mockModules = mockModuleList;
      mockBmadMetadata = bmadMetadataMock;
      await setup();
      expect(screen.getByText(/2 PRD sections/)).toBeInTheDocument();
      expect(screen.getByText(/1 ADRs/)).toBeInTheDocument();
      expect(screen.getByText(/3 conventions/)).toBeInTheDocument();
      expect(screen.getByText(/1 domain terms/)).toBeInTheDocument();
    });

    it("collapses back on second click", async () => {
      const user = userEvent.setup();
      mockKb = { ...readyKb, bmad_detected: true };
      mockModules = mockModuleList;
      mockBmadMetadata = bmadMetadataMock;
      await setup();

      const toggleBtn = screen.getByText("Declared Intent").closest("button")!;
      await user.click(toggleBtn);
      expect(screen.getByText("PRD Outline")).toBeInTheDocument();

      await user.click(toggleBtn);
      expect(screen.queryByText("PRD Outline")).not.toBeInTheDocument();
    });
  });
});
