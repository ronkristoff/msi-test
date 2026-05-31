import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskTray } from "./TaskTray";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";

const mockUseQuery = useQuery as ReturnType<typeof vi.fn>;
const mockPush = vi.fn();

describe("TaskTray", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
  });

  it("renders nothing when no tasks", () => {
    mockUseQuery.mockReturnValue([]);
    const { container } = render(<TaskTray />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while loading", () => {
    mockUseQuery.mockReturnValue(undefined);
    const { container } = render(<TaskTray />);
    expect(container.innerHTML).toBe("");
  });

  it("shows task count badge", () => {
    mockUseQuery.mockReturnValue([
      { type: "generating", id: "s1", name: "Suite A", triggeredByName: "Alice", projectId: "p1", suiteId: "s1" },
      { type: "running", id: "r1", name: "Run B", triggeredByName: "Bob", projectId: "p1" },
      { type: "exploring", id: "e1", name: "Exploring https://x.com", triggeredByName: "Unknown", projectId: "p1" },
    ]);
    render(<TaskTray />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows dropdown with task details on click", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "generating", id: "s1", name: "Suite A", triggeredByName: "Alice", projectId: "p1", suiteId: "s1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    expect(screen.getByText("Suite A")).toBeInTheDocument();
    expect(screen.getByText(/Generating.*Alice/)).toBeInTheDocument();
  });

  it("navigates to suite page on generating task click", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "generating", id: "s1", name: "Suite A", triggeredByName: "Alice", projectId: "p1", suiteId: "s1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("Suite A"));
    expect(mockPush).toHaveBeenCalledWith("/projects/p1/suites/s1");
  });

  it("navigates to run page on running task click", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "running", id: "r1", name: "Run B", triggeredByName: "Bob", projectId: "p1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("Run B"));
    expect(mockPush).toHaveBeenCalledWith("/runs/r1");
  });

  it("navigates to run page on running task click", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "running", id: "r1", name: "Run B", triggeredByName: "Bob", projectId: "p1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("Run B"));
    expect(mockPush).toHaveBeenCalledWith("/runs/r1");
  });

  it("navigates to explore page on exploring task click", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "exploring", id: "e1", name: "Exploring https://x.com", triggeredByName: "Unknown", projectId: "p1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("Exploring https://x.com"));
    expect(mockPush).toHaveBeenCalledWith("/projects/p1/explore");
  });

  it("shows Exploring label for exploration tasks", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "exploring", id: "e1", name: "Exploring https://x.com", triggeredByName: "Unknown", projectId: "p1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    expect(screen.getByText(/Exploring.*Unknown/)).toBeInTheDocument();
  });

  it("shows Background Tasks header in dropdown", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue([
      { type: "generating", id: "s1", name: "Suite A", triggeredByName: "Alice", projectId: "p1", suiteId: "s1" },
    ]);
    render(<TaskTray />);

    await user.click(screen.getByText("1"));
    expect(screen.getByText("Background Tasks")).toBeInTheDocument();
  });
});
