import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ImpactAnalysisCard } from "./ImpactAnalysisCard";
import type { ImpactAnalysis } from "../../../convex/chat/impactSchema";

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const baseAnalysis: ImpactAnalysis = {
  summary: "Add OAuth login affecting the auth module and users table.",
  affected_modules: [
    {
      name: "auth",
      reason: "New OAuth provider integration required",
      confidence_score: 0.92,
    },
    {
      name: "users",
      reason: "Add oauth_provider column",
      confidence_score: 0.65,
    },
  ],
  affected_apis: [
    {
      name: "POST /api/auth/login",
      reason: "Endpoint must accept OAuth tokens",
      confidence_score: 0.8,
      bmad_conflicts: [
        {
          type: "adr" as const,
          reference: "ADR-0003",
          note: "Conflicts with session-only auth decision",
        },
      ],
    },
  ],
  affected_data_models: [
    {
      name: "users",
      reason: "Add oauth_provider column",
      confidence_score: 0.75,
    },
  ],
  affected_user_flows: [
    {
      name: "Login flow",
      reason: "Add OAuth redirect step",
      confidence_score: 0.6,
    },
  ],
  hidden_dependencies: [
    {
      name: "rate-limiter",
      reason: "OAuth callback may spike request volume",
      confidence_score: 0.4,
    },
  ],
};

describe("ImpactAnalysisCard", () => {
  it("renders the summary", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    expect(
      screen.getByText("Add OAuth login affecting the auth module and users table."),
    ).toBeInTheDocument();
  });

  it("renders affected modules with name, reason, and confidence percentage", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(
      screen.getByText("New OAuth provider integration required"),
    ).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("renders affected APIs", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    const apiSection = screen.getByRole("region", {
      name: /affected apis/i,
    });
    expect(
      within(apiSection).getByText("POST /api/auth/login"),
    ).toBeInTheDocument();
  });

  it("renders affected data models", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    const dataModelsSection = screen.getByRole("region", {
      name: /affected data models/i,
    });
    expect(within(dataModelsSection).getByText("users")).toBeInTheDocument();
  });

  it("renders affected user flows", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    expect(screen.getByText("Login flow")).toBeInTheDocument();
  });

  it("renders hidden dependencies", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    expect(screen.getByText("rate-limiter")).toBeInTheDocument();
  });

  it("renders BMAD conflicts section when conflicts exist", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    const conflictsSection = screen.getByRole("alert");
    expect(
      within(conflictsSection).getAllByText("ADR-0003").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      within(conflictsSection).getByText(
        /Conflicts with session-only auth decision/,
      ),
    ).toBeInTheDocument();
  });

  it("renders BMAD conflict type badge in aggregated conflicts section", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    const conflictsSection = screen.getByRole("alert");
    expect(within(conflictsSection).getByText("adr")).toBeInTheDocument();
    expect(
      within(conflictsSection).getByText("POST /api/auth/login"),
    ).toBeInTheDocument();
  });

  it("renders grounding unavailable notice when grounded is false", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} grounded={false} />);
    expect(
      screen.getByText(/Codebase grounding unavailable/i),
    ).toBeInTheDocument();
  });

  it("does not render grounding notice when grounded is true", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} grounded={true} />);
    expect(
      screen.queryByText(/Codebase grounding unavailable/i),
    ).not.toBeInTheDocument();
  });

  it("does not render grounding notice by default", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    expect(
      screen.queryByText(/Codebase grounding unavailable/i),
    ).not.toBeInTheDocument();
  });

  it("renders placeholder text for empty arrays", () => {
    const emptyAnalysis: ImpactAnalysis = {
      summary: "Feature touches nothing identifiable.",
      affected_modules: [],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    render(<ImpactAnalysisCard analysis={emptyAnalysis} />);
    expect(screen.getAllByText(/no affected/i).length).toBeGreaterThanOrEqual(1);
  });

  it("does not render BMAD conflicts section when no conflicts exist", () => {
    const noConflicts: ImpactAnalysis = {
      summary: "x",
      affected_modules: [
        { name: "m", reason: "r", confidence_score: 0.5 },
      ],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    render(<ImpactAnalysisCard analysis={noConflicts} />);
    expect(screen.queryByText("BMAD Conflicts")).not.toBeInTheDocument();
  });

  it("renders confidence as percentage with correct value", () => {
    render(<ImpactAnalysisCard analysis={baseAnalysis} />);
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });
});
