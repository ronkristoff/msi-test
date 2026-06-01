import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeStagehandTests } from "../src/stagehand-executor";
import type { RunnerConvexClient } from "../src/convex-client";
import type { RunWorkItem } from "../src/types";

vi.mock("../src/stagehand", () => {
  return {
    initStagehand: vi.fn().mockImplementation(() => {
      const mockAct = vi.fn().mockResolvedValue({ success: true });
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("png-data"));
      const mockGoto = vi.fn().mockResolvedValue(undefined);
      const mockTitle = vi.fn().mockResolvedValue("Test Page");
      const mockUrl = vi.fn().mockReturnValue("https://example.com");
      const mockEvaluate = vi.fn().mockResolvedValue(undefined);
      const mockPage = {
        goto: mockGoto,
        title: mockTitle,
        url: mockUrl,
        screenshot: mockScreenshot,
        evaluate: mockEvaluate,
      };
      const mockActivePage = vi.fn().mockReturnValue(mockPage);
      const mockNewPage = vi.fn().mockResolvedValue(mockPage);
      const mockAddCookies = vi.fn().mockResolvedValue(undefined);
      const mockContext = {
        activePage: mockActivePage,
        newPage: mockNewPage,
        addCookies: mockAddCookies,
      };

      return Promise.resolve({
        init: vi.fn().mockResolvedValue(undefined),
        close: mockClose,
        act: mockAct,
        context: mockContext,
      });
    }),
  };
});

function createMockClient(overrides: Partial<RunnerConvexClient> = {}): RunnerConvexClient {
  return {
    getWorkspaceAiConfig: vi.fn().mockResolvedValue({
      endpoint_url: "https://api.openai.com/v1",
      api_key: "sk-test",
      model_name: "gpt-4o",
    }),
    writeStepResult: vi.fn().mockResolvedValue(undefined),
    writeRunResult: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue(undefined),
    forceCompleteRun: vi.fn().mockResolvedValue(undefined),
    uploadBuffer: vi.fn().mockResolvedValue("storage-id-123"),
    uploadFile: vi.fn().mockResolvedValue("storage-id-123"),
    generateUploadUrl: vi.fn().mockResolvedValue("https://upload.example.com"),
    ...overrides,
  } as RunnerConvexClient;
}

const BASE_WORK: RunWorkItem = {
  run_id: "run-1",
  workspace_id: "ws-1",
  project_id: "proj-1",
  environment_id: null,
  base_url: "https://example.com",
  trigger_type: "manual",
  tests: [
    {
      _id: "test-1",
      name: "Login and check dashboard",
      execution_type: "stagehand" as const,
      steps: [
        { instruction: "Navigate to the login page" },
        { instruction: "Fill in username and password, then click login", assertion_code: "assert.ok(true, 'page loaded')" },
        { instruction: "Verify the dashboard is visible" },
      ],
      playwright_code: "",
    },
  ],
  run_result_ids: [{ _id: "result-1", test_id: "test-1" }],
  auth_mode: "none",
  test_data: undefined,
};

const log = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeStagehandTests", () => {
  it("throws if no base_url", async () => {
    const client = createMockClient();
    const work = { ...BASE_WORK, base_url: null };

    await executeStagehandTests(client, work, log);

    expect(client.forceCompleteRun).toHaveBeenCalledWith(
      "run-1",
      "failed",
      expect.stringContaining("No base_url"),
    );
  });

  it("returns early if no Stagehand tests", async () => {
    const client = createMockClient();
    const work = {
      ...BASE_WORK,
      tests: [{ ...BASE_WORK.tests[0], execution_type: "playwright", steps: null }],
    };

    await executeStagehandTests(client, work, log);

    expect(client.completeRun).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("no Stagehand tests"),
    );
  });

  it("executes all steps and writes results", async () => {
    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    expect(client.getWorkspaceAiConfig).toHaveBeenCalledWith("ws-1");
    expect(client.writeStepResult).toHaveBeenCalledTimes(3);
    expect(client.writeRunResult).toHaveBeenCalledWith(
      expect.objectContaining({
        run_result_id: "result-1",
        status: "passed",
      }),
    );
    expect(client.completeRun).toHaveBeenCalledWith("run-1");
  });

  it("captures screenshots per step and passes IDs to run result", async () => {
    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    const screenshotCalls = client.writeStepResult.mock.calls;
    for (const call of screenshotCalls) {
      expect(call[0].screenshot_file_id).toBe("storage-id-123");
    }

    expect(client.writeRunResult).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshot_file_ids: expect.arrayContaining(["storage-id-123"]),
      }),
    );
  });

  it("handles form login when auth_mode is form", async () => {
    const client = createMockClient();
    const work = {
      ...BASE_WORK,
      auth_mode: "form",
      test_username: "user@example.com",
      test_password: "secret",
    };

    await executeStagehandTests(client, work, log);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("form login"),
    );
  });

  it("stops on first failed step and marks test as failed", async () => {
    const { initStagehand } = await import("../src/stagehand");

    const mockAct = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("Element not found"));
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("png-data"));
    const mockEvaluate = vi.fn().mockResolvedValue(undefined);
    const mockGoto = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      goto: mockGoto,
      title: vi.fn().mockResolvedValue("Test Page"),
      url: vi.fn().mockReturnValue("https://example.com"),
      screenshot: mockScreenshot,
      evaluate: mockEvaluate,
    };

    vi.mocked(initStagehand).mockResolvedValueOnce({
      init: vi.fn().mockResolvedValue(undefined),
      close: mockClose,
      act: mockAct,
      context: {
        activePage: vi.fn().mockReturnValue(mockPage),
        newPage: vi.fn().mockResolvedValue(mockPage),
        addCookies: vi.fn().mockResolvedValue(undefined),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    expect(client.writeStepResult).toHaveBeenCalledTimes(2);

    const lastStepCall = client.writeStepResult.mock.calls[1][0];
    expect(lastStepCall.status).toBe("failed");
    expect(lastStepCall.error_message).toContain("Element not found");

    expect(client.writeRunResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_message: expect.stringContaining("Element not found"),
      }),
    );
  });

  it("handles assertion code execution", async () => {
    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("passed"),
    );
  });

  it("force completes run on unexpected error", async () => {
    const client = createMockClient({
      getWorkspaceAiConfig: vi.fn().mockRejectedValue(new Error("Config fetch failed")),
    });

    await executeStagehandTests(client, BASE_WORK, log);

    expect(client.forceCompleteRun).toHaveBeenCalledWith(
      "run-1",
      "failed",
      "Config fetch failed",
    );
  });

  it("handles missing run_result_id for a test", async () => {
    const client = createMockClient();
    const work = {
      ...BASE_WORK,
      run_result_ids: [],
    };

    await executeStagehandTests(client, work, log);

    expect(client.writeRunResult).not.toHaveBeenCalled();
    expect(client.completeRun).toHaveBeenCalledWith("run-1");
  });

  it("closes Stagehand instance in finally block", async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockAct = vi.fn().mockRejectedValue(new Error("step failed"));
    const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("png-data"));
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue("Test Page"),
      url: vi.fn().mockReturnValue("https://example.com"),
      screenshot: mockScreenshot,
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    const { initStagehand } = await import("../src/stagehand");
    vi.mocked(initStagehand).mockResolvedValueOnce({
      init: vi.fn().mockResolvedValue(undefined),
      close: mockClose,
      act: mockAct,
      context: {
        activePage: vi.fn().mockReturnValue(mockPage),
        newPage: vi.fn().mockResolvedValue(mockPage),
        addCookies: vi.fn().mockResolvedValue(undefined),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    expect(mockClose).toHaveBeenCalled();
  });

  it("writes step results with correct step numbers", async () => {
    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    const calls = client.writeStepResult.mock.calls;
    expect(calls[0][0].step_number).toBe(1);
    expect(calls[1][0].step_number).toBe(2);
    expect(calls[2][0].step_number).toBe(3);
  });

  it("writes step results with instruction as command", async () => {
    const client = createMockClient();

    await executeStagehandTests(client, BASE_WORK, log);

    expect(client.writeStepResult).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "Navigate to the login page",
      }),
    );
  });
});

describe("auto-heal logic", () => {
  const HEAL_THRESHOLD = 0.8;

  function createHealMockStagehand(config: {
    failOnStep?: number;
    observeResults?: Array<{ selector: string; description: string }>;
    extractResult?: { confidence: number; reasoning: string };
    healActSucceeds?: boolean;
  }) {
    const mockAct = vi.fn();
    const mockObserve = vi.fn();
    const mockExtract = vi.fn();
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("png-data"));
    const mockGoto = vi.fn().mockResolvedValue(undefined);
    const mockEvaluate = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      goto: mockGoto,
      title: vi.fn().mockResolvedValue("Test Page"),
      url: vi.fn().mockReturnValue("https://example.com"),
      screenshot: mockScreenshot,
      evaluate: mockEvaluate,
    };

    let callCount = 0;
    mockAct.mockImplementation(async () => {
      callCount++;
      if (config.failOnStep && callCount === config.failOnStep) {
        throw new Error("Element not found: could not locate button");
      }
      return { success: true };
    });

    if (config.observeResults) {
      mockObserve.mockResolvedValue(config.observeResults);
    } else {
      mockObserve.mockResolvedValue([]);
    }

    if (config.extractResult) {
      mockExtract.mockResolvedValue(config.extractResult);
    } else {
      mockExtract.mockResolvedValue({ confidence: 0, reasoning: "" });
    }

    const stagehand = {
      init: vi.fn().mockResolvedValue(undefined),
      close: mockClose,
      act: mockAct,
      observe: mockObserve,
      extract: mockExtract,
      context: {
        activePage: vi.fn().mockReturnValue(mockPage),
        newPage: vi.fn().mockResolvedValue(mockPage),
        addCookies: vi.fn().mockResolvedValue(undefined),
      },
    };

    return { stagehand, mockAct, mockObserve, mockExtract, mockClose };
  }

  const HEAL_WORK: RunWorkItem = {
    ...BASE_WORK,
    heal_confidence_threshold: HEAL_THRESHOLD,
    tests: [
      {
        _id: "test-heal",
        name: "Heal test",
        execution_type: "stagehand" as const,
        steps: [
          { instruction: "Click the submit button" },
          { instruction: "Verify the confirmation message" },
        ],
        playwright_code: "",
      },
    ],
    run_result_ids: [{ _id: "result-heal", test_id: "test-heal" }],
  };

  it("auto-heals when observe returns high-confidence match above threshold", async () => {
    const { stagehand, mockAct, mockObserve, mockExtract } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "button.submit-v2", description: "Submit form button" },
      ],
      extractResult: { confidence: 0.92, reasoning: "Selector changed from .submit to .submit-v2" },
      healActSucceeds: true,
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    expect(mockObserve).toHaveBeenCalledWith(
      "Click the submit button",
      expect.any(Object),
    );

    expect(mockExtract).toHaveBeenCalled();

    expect(mockAct).toHaveBeenCalledTimes(3);

    const healStepCall = client.writeStepResult.mock.calls[0][0];
    expect(healStepCall.status).toBe("healed");
    expect(healStepCall.heal_reason).toBe("Selector changed from .submit to .submit-v2");
    expect(healStepCall.heal_confidence).toBe(0.92);
    expect(healStepCall.before_screenshot_file_id).toBeTruthy();

    expect(client.writeRunResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "passed",
      }),
    );
  });

  it("fails step when observe returns no candidates", async () => {
    const { stagehand } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [],
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    const healStepCall = client.writeStepResult.mock.calls[0][0];
    expect(healStepCall.status).toBe("failed");
    expect(healStepCall.heal_reason).toBeUndefined();
  });

  it("fails step when confidence is below threshold", async () => {
    const { stagehand, mockObserve, mockExtract } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "div.maybe-btn", description: "Maybe a button" },
      ],
      extractResult: { confidence: 0.45, reasoning: "Low confidence match" },
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    expect(mockObserve).toHaveBeenCalled();
    expect(mockExtract).toHaveBeenCalled();

    const healStepCall = client.writeStepResult.mock.calls[0][0];
    expect(healStepCall.status).toBe("failed");
    expect(healStepCall.heal_confidence).toBeUndefined();
  });

  it("uses default threshold 0.8 when workspace has no threshold configured", async () => {
    const { stagehand } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "button.submit", description: "Submit" },
      ],
      extractResult: { confidence: 0.79, reasoning: "Just below default" },
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const workNoThreshold = { ...HEAL_WORK, heal_confidence_threshold: undefined };
    const client = createMockClient();
    await executeStagehandTests(client, workNoThreshold, log);

    const healStepCall = client.writeStepResult.mock.calls[0][0];
    expect(healStepCall.status).toBe("failed");
  });

  it("heals with custom threshold below default", async () => {
    const { stagehand } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "button.submit", description: "Submit" },
      ],
      extractResult: { confidence: 0.65, reasoning: "Moderate match" },
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const lowThresholdWork = { ...HEAL_WORK, heal_confidence_threshold: 0.6 };
    const client = createMockClient();
    await executeStagehandTests(client, lowThresholdWork, log);

    const healStepCall = client.writeStepResult.mock.calls[0][0];
    expect(healStepCall.status).toBe("healed");
    expect(healStepCall.heal_confidence).toBe(0.65);
  });

  it("captures before-screenshot on failure then after-screenshot on heal", async () => {
    const { stagehand } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "button.go", description: "Go button" },
      ],
      extractResult: { confidence: 0.9, reasoning: "Renamed button" },
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    const healStepCall = client.writeStepResult.mock.calls[0][0];
    expect(healStepCall.before_screenshot_file_id).toBe("storage-id-123");
    expect(healStepCall.screenshot_file_id).toBe("storage-id-123");
  });

  it("continues test execution after healing and runs remaining steps", async () => {
    const { stagehand, mockAct } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "a.next", description: "Next link" },
      ],
      extractResult: { confidence: 0.88, reasoning: "Link text changed" },
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    expect(mockAct).toHaveBeenCalledTimes(3);
    expect(client.writeStepResult).toHaveBeenCalledTimes(2);

    const step1 = client.writeStepResult.mock.calls[0][0];
    expect(step1.status).toBe("healed");

    const step2 = client.writeStepResult.mock.calls[1][0];
    expect(step2.status).toBe("passed");

    expect(client.writeRunResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "passed" }),
    );
  });

  it("fails test if healed step succeeds but later step fails", async () => {
    const { stagehand, mockAct, mockObserve } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [
        { selector: "button.ok", description: "OK" },
      ],
      extractResult: { confidence: 0.85, reasoning: "Match" },
    });

    let actCallCount = 0;
    mockAct.mockImplementation(async () => {
      actCallCount++;
      if (actCallCount === 1) throw new Error("Element not found: button");
      if (actCallCount === 3) throw new Error("Element not found: message");
      return { success: true };
    });

    let observeCallCount = 0;
    mockObserve.mockImplementation(async () => {
      observeCallCount++;
      if (observeCallCount === 1) return [{ selector: "button.ok", description: "OK" }];
      return [];
    });

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    expect(client.writeRunResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("does not attempt heal on non-element-not-found errors", async () => {
    const { stagehand, mockObserve } = createHealMockStagehand({
      failOnStep: 1,
      observeResults: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stagehand as any).act = vi.fn().mockRejectedValueOnce(new Error("Navigation timeout"));

    const { initStagehand } = await import("../src/stagehand");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(initStagehand).mockResolvedValueOnce(stagehand as any);

    const client = createMockClient();
    await executeStagehandTests(client, HEAL_WORK, log);

    expect(mockObserve).not.toHaveBeenCalled();

    const stepCall = client.writeStepResult.mock.calls[0][0];
    expect(stepCall.status).toBe("failed");
    expect(stepCall.error_message).toContain("Navigation timeout");
  });
});
