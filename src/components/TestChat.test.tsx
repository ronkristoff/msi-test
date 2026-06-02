import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestChat } from "./TestChat";
import type { Doc, Id } from "@/lib/convex";

Element.prototype.scrollIntoView = vi.fn();

const mockRefineTest = vi.fn();
const mockUpdateTestCode = vi.fn();

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    ai: {
      refineTest: {
        refineTest: "ai/refineTest:refineTest",
      },
    },
    tests: {
      mutations: {
        updateTestCode: "tests/mutations:updateTestCode",
      },
    },
  },
  asId: vi.fn((id) => id),
}));

import { useAction, useMutation } from "convex/react";

const mockTest = {
  _id: "test123",
  _creationTime: Date.now(),
  workspace_id: "ws1",
  suite_id: "suite1",
  name: "Login Test",
  source_type: "natural_language" as const,
  status: "draft" as const,
  playwright_code: 'test("login", async ({ page }) => {});',
} as Doc<"tests">;

describe("TestChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((ref) => {
      const refStr = String(ref);
      if (refStr.includes("refineTest")) return mockRefineTest;
      return vi.fn();
    });
    (useMutation as ReturnType<typeof vi.fn>).mockImplementation((ref) => {
      const refStr = String(ref);
      if (refStr.includes("updateTestCode")) return mockUpdateTestCode;
      return vi.fn();
    });
  });

  it("renders Chat button when closed", () => {
    render(<TestChat test={mockTest} onApply={vi.fn()} />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("opens chat panel on Chat button click", async () => {
    const user = userEvent.setup();
    render(<TestChat test={mockTest} onApply={vi.fn()} />);

    await user.click(screen.getByText("Chat"));
    expect(screen.getAllByText("Refine Test").length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText("Describe your change...").length).toBeGreaterThan(0);
  });

  it("persists open state in localStorage", async () => {
    const user = userEvent.setup();
    render(<TestChat test={mockTest} onApply={vi.fn()} />);

    await user.click(screen.getByText("Chat"));
    expect(localStorage.getItem("testchat_open_test123")).toBe("true");
  });

  it("shows quick action chips", async () => {
    const user = userEvent.setup();
    render(
      <TestChat
        test={mockTest}
        latestFailure={{ error_message: "Timeout waiting for element", step_errors: null, run_id: "r1" as unknown as Id<"runs">, _creationTime: Date.now() }}
        onApply={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Chat"));
    const chips = screen.getAllByText("Fix this failure");
    expect(chips.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add a wait").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stricter assertions").length).toBeGreaterThan(0);
  });

  it("hides Fix this failure when no failure present", async () => {
    const user = userEvent.setup();
    render(<TestChat test={mockTest} onApply={vi.fn()} />);

    await user.click(screen.getByText("Chat"));
    expect(screen.queryAllByText("Fix this failure")).toHaveLength(0);
    expect(screen.getAllByText("Add a wait").length).toBeGreaterThan(0);
  });

  it("sends message on Enter key", async () => {
    const user = userEvent.setup();
    mockRefineTest.mockResolvedValue({
      modified_code: 'test("updated", async ({ page }) => {});',
      modified_steps: null,
      diff_summary: "Updated test name",
      diff: "- old\n+ new",
      thread_id: "thread123",
    });

    render(<TestChat test={mockTest} onApply={vi.fn()} />);

    await user.click(screen.getByText("Chat"));
    const inputs = screen.getAllByPlaceholderText("Describe your change...");
    await user.type(inputs[0], "Add a wait{Enter}");

    expect(mockRefineTest).toHaveBeenCalledWith(
      expect.objectContaining({
        test_id: "test123",
        message: "Add a wait",
      }),
    );
  });

  it("calls updateTestCode directly on apply (no applyRefinement action)", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    mockRefineTest.mockResolvedValue({
      modified_code: "new code",
      modified_steps: null,
      diff_summary: "Changed something",
      diff: "- old\n+ new code",
      thread_id: "thread456",
    });

    render(<TestChat test={mockTest} onApply={onApply} />);

    await user.click(screen.getByText("Chat"));
    const inputs = screen.getAllByPlaceholderText("Describe your change...");
    await user.type(inputs[0], "Change it{Enter}");

    expect(mockRefineTest).toHaveBeenCalled();
    await screen.findAllByText("Apply");

    const applyButtons = screen.getAllByText("Apply");
    await user.click(applyButtons[0]);

    expect(mockUpdateTestCode).toHaveBeenCalledWith(
      expect.objectContaining({
        test_id: "test123",
        playwright_code: "new code",
        status: "draft",
        clear_healed_at: true,
      }),
    );
    expect(onApply).toHaveBeenCalled();
  });

  it("disables send when input is empty", async () => {
    const user = userEvent.setup();
    render(<TestChat test={mockTest} onApply={vi.fn()} />);

    await user.click(screen.getByText("Chat"));
    const buttons = screen.getAllByRole("button");
    const sendBtn = buttons.find((b) => b.querySelector("svg line"));
    expect(sendBtn).toBeDisabled();
  });
});
