import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockModule: unknown = undefined;
let mockModuleList: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getModules")) return mockModuleList;
    if (key.includes("getModule")) return mockModule;
    return undefined;
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1", moduleId: "mod1" })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getModule: "knowledge.queries.getModule",
        getModules: "knowledge.queries.getModules",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const fullModule = {
  _id: "mod1",
  name: "auth",
  description: "Authentication and session management module",
  file_count: 5,
  files: ["src/auth/login.ts", "src/auth/session.ts", "src/auth/middleware.ts"],
  dependencies: ["users", "database"],
  knowledge_base_id: "kb1",
  workspace_id: "ws1",
  apis: [
    { path: "/api/login", method: "POST", description: "Login endpoint", request_shape: "{email, password}", response_shape: "{token}" },
    { path: "/api/logout", method: "POST", description: "Logout endpoint", request_shape: "{}", response_shape: "{}" },
  ],
  data_models: [
    { name: "Session", type: "table", fields: ["id", "userId", "expiresAt"], relationships: ["User"] },
  ],
  user_flows: [
    { name: "Login Flow", route: "/login", description: "User logs in", components: ["LoginForm", "SessionManager"] },
  ],
};

const emptyModule = {
  _id: "mod1",
  name: "utils",
  description: "Utility functions",
  file_count: 0,
  files: undefined,
  dependencies: [],
  knowledge_base_id: "kb1",
  workspace_id: "ws1",
  apis: undefined,
  data_models: null,
  user_flows: [],
};

const moduleListFixture = [
  { _id: "mod2", name: "users", description: null, file_count: 3, dependencies: [] },
  { _id: "mod3", name: "database", description: null, file_count: 8, dependencies: [] },
];

async function setup() {
  const { default: ModuleDetailPage } = await import("./page");
  return render(<ModuleDetailPage />);
}

describe("ModuleDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModule = undefined;
    mockModuleList = undefined;
  });

  it("renders loading skeleton when module data is undefined", async () => {
    await setup();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders not-found empty state when module is null", async () => {
    mockModule = null;
    await setup();
    expect(screen.getByText("Module not found")).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: /back to knowledge/i });
    expect(backLink).toHaveAttribute("href", "/projects/proj1/knowledge");
  });

  it("renders module name and back navigation button", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("Authentication and session management module")).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: /back to knowledge/i });
    expect(backLink).toHaveAttribute("href", "/projects/proj1/knowledge");
  });

  it("renders description and file count stat", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("Authentication and session management module")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders dependencies as badges", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("database")).toBeInTheDocument();
  });

  it("renders dependency badges as links for matching modules", async () => {
    mockModule = fullModule;
    mockModuleList = moduleListFixture;
    await setup();

    const usersLink = screen.getByRole("link", { name: "users" });
    expect(usersLink).toHaveAttribute("href", "/projects/proj1/knowledge/modules/mod2");

    const dbLink = screen.getByRole("link", { name: "database" });
    expect(dbLink).toHaveAttribute("href", "/projects/proj1/knowledge/modules/mod3");
  });

  it("renders files list with file paths", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("src/auth/login.ts")).toBeInTheDocument();
    expect(screen.getByText("src/auth/session.ts")).toBeInTheDocument();
    expect(screen.getByText("src/auth/middleware.ts")).toBeInTheDocument();
  });

  it("renders API section with count badge and item details", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("APIs")).toBeInTheDocument();
    expect(screen.getAllByText("POST")).toHaveLength(2);
    expect(screen.getByText("/api/login")).toBeInTheDocument();
    expect(screen.getByText("Login endpoint")).toBeInTheDocument();
  });

  it("renders Data Models section with item details", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("Data Models")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("renders User Flows section with item details", async () => {
    mockModule = fullModule;
    await setup();
    expect(screen.getByText("User Flows")).toBeInTheDocument();
    expect(screen.getByText("Login Flow")).toBeInTheDocument();
    expect(screen.getByText("/login")).toBeInTheDocument();
  });

  it("renders empty messages for all sections when data is missing", async () => {
    mockModule = emptyModule;
    await setup();
    expect(screen.getByText("No APIs detected")).toBeInTheDocument();
    expect(screen.getByText("No data models detected")).toBeInTheDocument();
    expect(screen.getByText("No user flows detected")).toBeInTheDocument();
    expect(screen.getByText("No file paths recorded")).toBeInTheDocument();
    expect(screen.getByText("No dependencies")).toBeInTheDocument();
  });

  it("expands and collapses populated sections on click", async () => {
    const user = userEvent.setup();
    mockModule = fullModule;
    await setup();

    const apiHeader = screen.getByText("APIs").closest("button");
    expect(apiHeader).toHaveAttribute("aria-expanded", "true");

    await user.click(apiHeader!);
    expect(apiHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("/api/login")).not.toBeInTheDocument();

    await user.click(apiHeader!);
    expect(apiHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("/api/login")).toBeInTheDocument();
  });

  it("hides populated section content when collapsed", async () => {
    const user = userEvent.setup();
    mockModule = fullModule;
    await setup();

    expect(screen.getByText("/api/login")).toBeInTheDocument();

    const apiHeader = screen.getByText("APIs").closest("button");
    await user.click(apiHeader!);

    expect(screen.queryByText("/api/login")).not.toBeInTheDocument();
    expect(screen.queryByText("Login endpoint")).not.toBeInTheDocument();
  });

  it("has accessible aria-expanded and aria-controls on section buttons", async () => {
    mockModule = fullModule;
    await setup();

    const apiHeader = screen.getByText("APIs").closest("button");
    expect(apiHeader).toHaveAttribute("aria-expanded");
    expect(apiHeader).toHaveAttribute("aria-controls");

    const controlsId = apiHeader!.getAttribute("aria-controls")!;
    expect(document.getElementById(controlsId)).toBeTruthy();
  });
});
