import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskTray } from "./TaskTray";

let activeTasksReturn: unknown = undefined;
let outcomesReturn: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef, args) => {
    if (args === "skip") return undefined;
    if (args !== undefined && typeof args === "object" && "tasks" in args)
      return outcomesReturn;
    return activeTasksReturn;
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useRouter } from "next/navigation";

const mockPush = vi.fn();

const SAMPLE_TASKS = [
  {
    type: "generating" as const,
    id: "s1",
    name: "Suite A",
    triggeredByName: "Alice",
    projectId: "p1",
    suiteId: "s1",
  },
  {
    type: "running" as const,
    id: "r1",
    name: "Run B",
    triggeredByName: "Bob",
    projectId: "p1",
  },
  {
    type: "exploring" as const,
    id: "e1",
    name: "Exploring https://x.com",
    triggeredByName: "Unknown",
    projectId: "p1",
  },
];

describe("TaskTray", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
    activeTasksReturn = undefined;
    outcomesReturn = undefined;
  });

  it("renders nothing when no tasks", () => {
    activeTasksReturn = [];
    const { container } = render(<TaskTray />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while loading", () => {
    activeTasksReturn = undefined;
    const { container } = render(<TaskTray />);
    expect(container.innerHTML).toBe("");
  });

  it("shows task label with count", () => {
    activeTasksReturn = SAMPLE_TASKS;
    render(<TaskTray />);
    expect(screen.getByText("3 tasks running")).toBeInTheDocument();
  });

  it("shows type-specific label for single task type", () => {
    activeTasksReturn = [
      {
        type: "generating",
        id: "s1",
        name: "Suite A",
        triggeredByName: "Alice",
        projectId: "p1",
        suiteId: "s1",
      },
    ];
    render(<TaskTray />);
    expect(screen.getByText("Generating")).toBeInTheDocument();
  });

  it("shows type-specific label with count for multiple same-type tasks", () => {
    activeTasksReturn = [
      {
        type: "running",
        id: "r1",
        name: "Run A",
        triggeredByName: "Alice",
        projectId: "p1",
      },
      {
        type: "running",
        id: "r2",
        name: "Run B",
        triggeredByName: "Bob",
        projectId: "p1",
      },
    ];
    render(<TaskTray />);
    expect(screen.getByText("Running (2)")).toBeInTheDocument();
  });

  it("shows dropdown with task details on click", async () => {
    const user = userEvent.setup();
    activeTasksReturn = [
      {
        type: "generating",
        id: "s1",
        name: "Suite A",
        triggeredByName: "Alice",
        projectId: "p1",
        suiteId: "s1",
      },
    ];
    render(<TaskTray />);

    await user.click(screen.getByText("Generating"));
    expect(screen.getByText("Suite A")).toBeInTheDocument();
    expect(screen.getByText(/Generating.*Alice/)).toBeInTheDocument();
  });

  it("shows Background Tasks header in dropdown", async () => {
    const user = userEvent.setup();
    activeTasksReturn = [
      {
        type: "generating",
        id: "s1",
        name: "Suite A",
        triggeredByName: "Alice",
        projectId: "p1",
        suiteId: "s1",
      },
    ];
    render(<TaskTray />);

    await user.click(screen.getByText("Generating"));
    expect(screen.getByText("Background Tasks")).toBeInTheDocument();
  });

  it("navigates to suite page on generating task click", async () => {
    const user = userEvent.setup();
    activeTasksReturn = [
      {
        type: "generating",
        id: "s1",
        name: "Suite A",
        triggeredByName: "Alice",
        projectId: "p1",
        suiteId: "s1",
      },
    ];
    render(<TaskTray />);

    await user.click(screen.getByText("Generating"));
    await user.click(screen.getByText("Suite A"));
    expect(mockPush).toHaveBeenCalledWith("/projects/p1/suites/s1");
  });

  it("navigates to run page on running task click", async () => {
    const user = userEvent.setup();
    activeTasksReturn = [
      {
        type: "running",
        id: "r1",
        name: "Run B",
        triggeredByName: "Bob",
        projectId: "p1",
      },
    ];
    render(<TaskTray />);

    await user.click(screen.getByText("Running"));
    await user.click(screen.getByText("Run B"));
    expect(mockPush).toHaveBeenCalledWith("/runs/r1");
  });

  it("navigates to explore page on exploring task click", async () => {
    const user = userEvent.setup();
    activeTasksReturn = [
      {
        type: "exploring",
        id: "e1",
        name: "Exploring https://x.com",
        triggeredByName: "Unknown",
        projectId: "p1",
      },
    ];
    render(<TaskTray />);

    await user.click(screen.getByText("Exploring"));
    await user.click(screen.getByText("Exploring https://x.com"));
    expect(mockPush).toHaveBeenCalledWith("/projects/p1/explore");
  });

  it("has an accessible aria-label on the indicator button", () => {
    activeTasksReturn = SAMPLE_TASKS;
    render(<TaskTray />);
    expect(
      screen.getByLabelText("3 background tasks"),
    ).toBeInTheDocument();
  });

  it("shows correct aria-label for single task", () => {
    activeTasksReturn = [
      {
        type: "generating",
        id: "s1",
        name: "Suite A",
        triggeredByName: "Alice",
        projectId: "p1",
        suiteId: "s1",
      },
    ];
    render(<TaskTray />);
    expect(
      screen.getByLabelText("1 background task"),
    ).toBeInTheDocument();
  });
});
