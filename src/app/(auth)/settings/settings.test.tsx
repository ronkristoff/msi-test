import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateWorkspace = vi.fn();
const mockUpdateUserName = vi.fn();
const mockUpdateUserPassword = vi.fn();
let mockUser: unknown = undefined;
let mockWorkspace: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getCurrentUser")) return mockUser;
    if (key.includes("getWorkspaceForUser")) return mockWorkspace;
    return undefined;
  }),
  useMutation: vi.fn((mutationRef: unknown) => {
    const key = String(mutationRef);
    if (key.includes("updateWorkspace")) return mockUpdateWorkspace;
    if (key.includes("updateUserName")) return mockUpdateUserName;
    if (key.includes("updateUserPassword")) return mockUpdateUserPassword;
    return vi.fn();
  }),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    workspaces: {
      queries: { getCurrentUser: "workspaces.queries.getCurrentUser", getWorkspaceForUser: "workspaces.queries.getWorkspaceForUser" },
      mutations: { updateWorkspace: "workspaces.mutations.updateWorkspace" },
    },
    users: {
      mutations: { updateUserName: "users.mutations.updateUserName", updateUserPassword: "users.mutations.updateUserPassword" },
    },
  },
}));

const defaultUser = { name: "Jane Doe", email: "jane@example.com" };
const defaultWorkspace = {
  _id: "ws1",
  name: "My Workspace",
  owner_id: "owner1",
  _creationTime: Date.now(),
  ai_config: {
    endpoint_url: "https://api.openai.com/v1",
    api_key_masked: "sk-•••••1234",
    model_name: "gpt-4o",
  },
};

function getTabList() {
  return screen.getByRole("tablist");
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = undefined;
    mockWorkspace = undefined;
  });

  async function setup() {
    const { default: SettingsPage } = await import("./page");
    return render(<SettingsPage />);
  }

  it("renders loading state", async () => {
    await setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders not found when user or workspace missing", async () => {
    mockUser = null;
    mockWorkspace = null;
    await setup();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("renders all three tabs", async () => {
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();
    const tabList = getTabList();
    expect(within(tabList).getByText("AI Provider")).toBeInTheDocument();
    expect(within(tabList).getByText("Profile")).toBeInTheDocument();
    expect(within(tabList).getByText("Workspace")).toBeInTheDocument();
  });

  it("marks AI Provider tab as selected by default", async () => {
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();
    const aiTab = within(getTabList()).getByText("AI Provider");
    expect(aiTab).toHaveAttribute("aria-selected", "true");
  });

  it("shows AI Provider tab content by default", async () => {
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();
    expect(screen.getByRole("button", { name: /save ai config/i })).toBeInTheDocument();
  });

  it("switches to Profile tab", async () => {
    const user = userEvent.setup();
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.click(within(getTabList()).getByText("Profile"));
    expect(screen.getByRole("button", { name: /update profile/i })).toBeInTheDocument();
    expect(screen.getByText("Change Password")).toBeInTheDocument();
  });

  it("switches to Workspace tab", async () => {
    const user = userEvent.setup();
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.click(within(getTabList()).getByText("Workspace"));
    expect(screen.getByRole("button", { name: /update workspace/i })).toBeInTheDocument();
  });

  it("shows danger zone on Workspace tab", async () => {
    const user = userEvent.setup();
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.click(within(getTabList()).getByText("Workspace"));
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
    expect(screen.getByText("Delete workspace")).toBeInTheDocument();
  });

  it("calls updateWorkspace when saving AI config", async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockResolvedValue(undefined);
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.type(screen.getByPlaceholderText("sk-•••••1234"), "test-key-123");
    await user.click(screen.getByRole("button", { name: /save ai config/i }));
    expect(mockUpdateWorkspace).toHaveBeenCalledWith({
      ai_config: {
        endpoint_url: "https://api.openai.com/v1",
        api_key: "test-key-123",
        model_name: "gpt-4o",
      },
    });
  });

  it("calls updateWorkspace when saving workspace name", async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockResolvedValue(undefined);
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.click(within(getTabList()).getByText("Workspace"));
    await user.click(screen.getByRole("button", { name: /update workspace/i }));
    expect(mockUpdateWorkspace).toHaveBeenCalledWith({ name: "My Workspace" });
  });

  it("shows success message after saving", async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockResolvedValue(undefined);
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.type(screen.getByPlaceholderText("sk-•••••1234"), "test-key-123");
    await user.click(screen.getByRole("button", { name: /save ai config/i }));
    expect(await screen.findByText("AI config saved")).toBeInTheDocument();
  });

  it("shows error message on save failure", async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockRejectedValue(new Error("Save failed"));
    mockUser = defaultUser;
    mockWorkspace = defaultWorkspace;
    await setup();

    await user.type(screen.getByPlaceholderText("sk-•••••1234"), "test-key-123");
    await user.click(screen.getByRole("button", { name: /save ai config/i }));
    expect(await screen.findByText("Save failed")).toBeInTheDocument();
  });
});
