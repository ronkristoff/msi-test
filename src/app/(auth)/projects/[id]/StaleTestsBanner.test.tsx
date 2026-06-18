import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Id } from "@/lib/convex";

let mockStaleTests: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    return mockStaleTests;
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getStaleTests: "knowledge.queries.getStaleTests",
      },
    },
  },
}));

import StaleTestsBanner from "./StaleTestsBanner";

const sampleStaleTests = [
  {
    _id: "t1",
    name: "Login Flow",
    suite_id: "s1",
    suite_name: "Auth Suite",
    module_name: "Auth Module",
    reason: "removed" as const,
  },
  {
    _id: "t2",
    name: "Checkout Flow",
    suite_id: "s2",
    suite_name: "Billing Suite",
    module_name: "Billing Module",
    reason: "changed" as const,
  },
];

describe("StaleTestsBanner", () => {
  beforeEach(() => {
    mockStaleTests = undefined;
    vi.clearAllMocks();
  });

  it("renders the banner with specific test names + module names when non-empty", async () => {
    mockStaleTests = sampleStaleTests;
    render(<StaleTestsBanner projectId={"proj1" as Id<"projects">} />);
    expect(screen.getByText(/2 tests may be stale/i)).toBeInTheDocument();
    expect(screen.getByText("Login Flow")).toBeInTheDocument();
    expect(screen.getByText(/Auth Module/)).toBeInTheDocument();
    expect(screen.getByText("Checkout Flow")).toBeInTheDocument();
    expect(screen.getByText(/Billing Module/)).toBeInTheDocument();
  });

  it("renders a Regenerate link per test pointing to the suite detail page", async () => {
    mockStaleTests = sampleStaleTests;
    render(<StaleTestsBanner projectId={"proj1" as Id<"projects">} />);
    const links = screen.getAllByRole("link", { name: /regenerate/i });
    expect(links.length).toBe(2);
    expect(links[0].getAttribute("href")).toContain("/projects/proj1/suites/s1");
    expect(links[1].getAttribute("href")).toContain("/projects/proj1/suites/s2");
  });

  it("does NOT render the banner when getStaleTests returns []", async () => {
    mockStaleTests = [];
    const { container } = render(<StaleTestsBanner projectId={"proj1" as Id<"projects">} />);
    expect(container.firstChild).toBeNull();
  });

  it("does NOT render the banner while getStaleTests is loading (undefined)", async () => {
    mockStaleTests = undefined;
    const { container } = render(<StaleTestsBanner projectId={"proj1" as Id<"projects">} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders each test only once when a test matches multiple changed modules (dedup at query level)", async () => {
    mockStaleTests = [
      {
        _id: "t1",
        name: "Shared Flow",
        suite_id: "s1",
        suite_name: "Suite",
        module_name: "First Module",
        reason: "changed" as const,
      },
    ];
    render(<StaleTestsBanner projectId={"proj1" as Id<"projects">} />);
    expect(screen.getAllByText("Shared Flow").length).toBe(1);
  });
});
