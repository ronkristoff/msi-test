import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDownloadFile = vi.fn();

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

vi.mock("../downloadFile", () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: mockLogError }),
}));

const sampleStory = {
  _id: "s1",
  workspace_id: "ws1",
  project_id: "proj1",
  thread_id: "t1",
  title: "Add OAuth Login!",
  user_story: {
    as_a: "an authenticated user",
    i_want: "to log in with Google",
    so_that: "I don't need a new password",
  },
  acceptance_criteria: ["Given x When y Then z"],
  affected_components: {
    modules: ["auth"],
    apis: ["POST /login"],
    data_models: [],
  },
  technical_context: "Follows zod-validation convention.",
  status: "approved" as const,
  generated_at: 1000,
  updated_at: undefined,
};

const draftStory = { ...sampleStory, status: "draft" as const };
const exportedStory = { ...sampleStory, status: "exported" as const };
const noTechStory = { ...sampleStory, technical_context: undefined };

async function setupExport(props: {
  story: typeof sampleStory;
  bmadDetected?: boolean;
  projectName?: string;
}) {
  const { ExportSingleStory } = await import("./ExportSingleStory");
  return render(
    <ExportSingleStory
      story={props.story as never}
      bmadDetected={props.bmadDetected ?? false}
      projectName={props.projectName ?? "Test Project"}
    />,
  );
}

async function setupCopy(props: { story: typeof sampleStory }) {
  const { CopyStoryButton } = await import("./CopyStoryButton");
  return render(<CopyStoryButton story={props.story as never} />);
}

describe("ExportSingleStory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders Export dropdown for draft status", async () => {
    await setupExport({ story: draftStory });
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });

  it("renders Export dropdown for approved status", async () => {
    await setupExport({ story: sampleStory });
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });

  it("renders Export dropdown for exported status", async () => {
    await setupExport({ story: exportedStory });
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });

  it("Markdown option always present; clicking downloads story-{slug}.md", async () => {
    const user = userEvent.setup();
    await setupExport({ story: sampleStory });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [, filename, mimeType] = mockDownloadFile.mock.calls[0];
    expect(filename).toBe("story-add-oauth-login.md");
    expect(mimeType).toContain("markdown");
  });

  it("BMAD Story File option present when bmadDetected is true", async () => {
    const user = userEvent.setup();
    await setupExport({ story: sampleStory, bmadDetected: true });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(
      screen.getByRole("menuitem", { name: /BMAD Story File/i }),
    ).toBeInTheDocument();
  });

  it("BMAD Story File option also present when story has technical_context (defensive gate)", async () => {
    const user = userEvent.setup();
    await setupExport({ story: sampleStory, bmadDetected: false });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(
      screen.getByRole("menuitem", { name: /BMAD Story File/i }),
    ).toBeInTheDocument();
  });

  it("BMAD Story File option absent when bmadDetected=false AND no technical_context", async () => {
    const user = userEvent.setup();
    await setupExport({ story: noTechStory, bmadDetected: false });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(
      screen.queryByRole("menuitem", { name: /BMAD Story File/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking BMAD Story File calls downloadFile once with story-{slug}.md", async () => {
    const user = userEvent.setup();
    await setupExport({ story: sampleStory, bmadDetected: true });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /BMAD Story File/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [, filename] = mockDownloadFile.mock.calls[0];
    expect(filename).toBe("story-add-oauth-login.md");
  });

  it("menu closes on Escape and returns focus to trigger", async () => {
    const user = userEvent.setup();
    await setupExport({ story: sampleStory });
    const trigger = screen.getByRole("button", { name: /Export/i });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("CopyStoryButton", () => {
  let writeTextSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeTextSpy = vi
      .spyOn(navigator.clipboard!, "writeText")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    writeTextSpy.mockRestore();
  });

  it("renders Copy to Clipboard button", async () => {
    await setupCopy({ story: sampleStory });
    expect(
      screen.getByRole("button", { name: /Copy to Clipboard/i }),
    ).toBeInTheDocument();
  });

  it("clicking calls navigator.clipboard.writeText with buildStoryMarkdown content", async () => {
    const user = userEvent.setup();
    await setupCopy({ story: sampleStory });
    await user.click(screen.getByRole("button", { name: /Copy to Clipboard/i }));
    await screen.findByRole("button", { name: /Copied!/i });
    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    const arg = writeTextSpy.mock.calls[0][0] as string;
    expect(arg).toContain("## Add OAuth Login!");
    expect(arg).toContain("**As a** an authenticated user");
  });

  it("success: button label becomes 'Copied!' for 2s then reverts", async () => {
    const user = userEvent.setup();
    await setupCopy({ story: sampleStory });
    await user.click(screen.getByRole("button", { name: /Copy to Clipboard/i }));
    expect(await screen.findByRole("button", { name: /Copied!/i })).toBeInTheDocument();

    await vi.waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: /Copy to Clipboard/i }),
        ).toBeInTheDocument();
      },
      { timeout: 3000, interval: 100 },
    );
  });

  it("failure: writeText rejects -> Alert renders + logError called", async () => {
    writeTextSpy.mockRejectedValueOnce(new Error("Permission denied"));
    const user = userEvent.setup();
    await setupCopy({ story: sampleStory });
    await user.click(screen.getByRole("button", { name: /Copy to Clipboard/i }));
    await screen.findByRole("alert");
    expect(mockLogError).toHaveBeenCalled();
  });
});
