import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockTriggerIngestion = vi.fn();
let mockKb: unknown = undefined;
let mockModules: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown, args: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getKnowledgeBase")) return mockKb;
    if (key.includes("getModules")) return mockModules;
    return undefined;
  }),
  useAction: vi.fn(() => mockTriggerIngestion),
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
      },
      triggerIngestion: {
        triggerIngestion: "knowledge.triggerIngestion.triggerIngestion",
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
    mockKb = undefined;
    mockModules = undefined;
    mockTriggerIngestion.mockResolvedValue(undefined);
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
});
