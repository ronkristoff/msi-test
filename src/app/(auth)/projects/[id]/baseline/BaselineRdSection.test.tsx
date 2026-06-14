import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateBaselineRd = vi.fn(() => Promise.resolve());

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => mockUpdateBaselineRd),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      baselineRdMutations: {
        updateBaselineRd: "knowledge.baselineRdMutations.updateBaselineRd",
      },
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

import { BaselineRdSection } from "./BaselineRdSection";
import type { RdSection } from "./baselineRdHelpers";

const baseSection: RdSection = {
  id: "overview",
  title: "Overview",
  content: "Original content.",
  confidence: 0.85,
};

describe("BaselineRdSection — read mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title, content, and confidence pill", async () => {
    render(
      <BaselineRdSection
        section={baseSection}
        isEditing={false}
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Original content.")).toBeInTheDocument();
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  it("renders Medium confidence pill for 0.5–0.79 confidence", () => {
    render(
      <BaselineRdSection
        section={{ ...baseSection, confidence: 0.6 }}
        isEditing={false}
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("renders Low confidence pill for confidence below 0.5", () => {
    render(
      <BaselineRdSection
        section={{ ...baseSection, confidence: 0.3 }}
        isEditing={false}
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders divergence note as italic muted text when present", () => {
    render(
      <BaselineRdSection
        section={{
          ...baseSection,
          divergence_note: "PRD mentions a different framework.",
        }}
        isEditing={false}
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    expect(screen.getByText(/PRD mentions a different framework./i)).toBeInTheDocument();
  });

  it("renders BMAD alignment badge when present", () => {
    render(
      <BaselineRdSection
        section={{
          ...baseSection,
          bmad_alignment: { prd_section_title: "Overview", agreement: "diverge" },
        }}
        isEditing={false}
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    expect(screen.getByText("Diverge")).toBeInTheDocument();
  });

  it("does not render divergence note or alignment when absent", () => {
    render(
      <BaselineRdSection
        section={baseSection}
        isEditing={false}
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    expect(screen.queryByText(/Diverge|Agree|Partial/)).not.toBeInTheDocument();
  });

  it("calls onEnterEdit when Edit button is clicked", async () => {
    const user = userEvent.setup();
    const onEnterEdit = vi.fn();
    render(
      <BaselineRdSection
        section={baseSection}
        isEditing={false}
        onEnterEdit={onEnterEdit}
        onExitEdit={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Edit/i }));
    expect(onEnterEdit).toHaveBeenCalledTimes(1);
  });
});

describe("BaselineRdSection — edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a textarea pre-populated with current content", () => {
    render(
      <BaselineRdSection
        section={baseSection}
        rdId={"rd1" as never}
        isEditing
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe("Original content.");
  });

  it("Save button is disabled until the textarea content changes", () => {
    render(
      <BaselineRdSection
        section={baseSection}
        rdId={"rd1" as never}
        isEditing
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );
    const saveButton = screen.getByRole("button", { name: /Save/i });
    expect(saveButton).toBeDisabled();
  });

  it("clicking Save calls updateBaselineRd with section_updates and calls onExitEdit on success", async () => {
    const user = userEvent.setup();
    const onExitEdit = vi.fn();
    render(
      <BaselineRdSection
        section={baseSection}
        rdId={"rd1" as never}
        isEditing
        onEnterEdit={() => {}}
        onExitEdit={onExitEdit}
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "Edited content.");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await vi.waitFor(() => {
      expect(mockUpdateBaselineRd).toHaveBeenCalledWith({
        rd_id: "rd1",
        section_updates: [{ id: "overview", content: "Edited content." }],
      });
    });
    await vi.waitFor(() => {
      expect(onExitEdit).toHaveBeenCalledTimes(1);
    });
  });

  it("clicking Discard does not call the mutation and calls onExitEdit", async () => {
    const user = userEvent.setup();
    const onExitEdit = vi.fn();
    render(
      <BaselineRdSection
        section={baseSection}
        rdId={"rd1" as never}
        isEditing
        onEnterEdit={() => {}}
        onExitEdit={onExitEdit}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Discard/i }));
    expect(mockUpdateBaselineRd).not.toHaveBeenCalled();
    expect(onExitEdit).toHaveBeenCalledTimes(1);
  });

  it("shows an inline Alert when the mutation rejects", async () => {
    mockUpdateBaselineRd.mockRejectedValueOnce(new Error("Uncaught ConvexError: Unknown section id: overview"));
    const user = userEvent.setup();
    render(
      <BaselineRdSection
        section={baseSection}
        rdId={"rd1" as never}
        isEditing
        onEnterEdit={() => {}}
        onExitEdit={() => {}}
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "edited");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Unknown section id/i)).toBeInTheDocument();
  });
});
