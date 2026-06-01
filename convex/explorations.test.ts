/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedProject, seedExploration } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("explorations queries", () => {
  it("getExploration returns null for other workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "other-user");
    const projectId = await seedProject(t, workspaceId);

    const explorationId = await seedExploration(t, workspaceId, projectId);

    const result = await t.query(api.explorations.queries.getExploration, {
      exploration_id: explorationId,
    });
    expect(result).toBeNull();
  });

  it("getExplorationsByProject returns empty for no explorations", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const result = await t.query(api.explorations.queries.getExplorationsByProject, {
      project_id: projectId,
    });
    expect(result).toHaveLength(0);
  });

  it("getPendingExplorations returns pending explorations", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedExploration(t, workspaceId, projectId, { status: "pending" });

    const pending = await t.query(api.explorations.queries.getPendingExplorations, {});
    expect(pending).toHaveLength(1);
    expect(pending[0].url).toBe("https://example.com");
    expect(pending[0].auth_mode).toBe("none");
    expect(pending[0].workspace_id).toBe(workspaceId);
    expect(pending[0].project_id).toBe(projectId);
    expect(pending[0].interactive).toBe(false);
  });

  it("getPendingExplorations excludes non-pending explorations", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedExploration(t, workspaceId, projectId, { status: "capturing" });
    await seedExploration(t, workspaceId, projectId, { status: "analyzed" });
    await seedExploration(t, workspaceId, projectId, { status: "failed" });

    const pending = await t.query(api.explorations.queries.getPendingExplorations, {});
    expect(pending).toHaveLength(0);
  });
});

describe("explorations internal mutations", () => {
  it("claimExploration sets runner_id and status to capturing", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    await t.mutation(internal.explorations.internal.claimExploration, {
      exploration_id: explorationId,
      runner_id: "runner-1",
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.status).toBe("capturing");
    expect(exploration!.runner_id).toBe("runner-1");
    expect(exploration!.progress_message).toBe("Starting exploration...");
  });

  it("claimExploration rejects already claimed exploration", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId, {
      runner_id: "runner-0",
    });

    await expect(
      t.mutation(internal.explorations.internal.claimExploration, {
        exploration_id: explorationId,
        runner_id: "runner-1",
      }),
    ).rejects.toThrow("already claimed");
  });

  it("claimExploration rejects non-pending exploration", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId, {
      status: "capturing",
    });

    await expect(
      t.mutation(internal.explorations.internal.claimExploration, {
        exploration_id: explorationId,
        runner_id: "runner-1",
      }),
    ).rejects.toThrow("not in pending status");
  });

  it("updateExplorationProgress updates message and count", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    await t.mutation(internal.explorations.internal.updateExplorationProgress, {
      exploration_id: explorationId,
      progress_message: "Capturing page 2: About",
      pages_captured: 2,
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.progress_message).toBe("Capturing page 2: About");
    expect(exploration!.pages_captured).toBe(2);
  });

  it("completeExplorationCapture stores captured pages with optional screenshots", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    const capturedPages = [
      {
        url: "https://example.com",
        title: "Home",
        structure_text: "Headings:\n  h1: Welcome",
      },
      {
        url: "https://example.com/about",
        title: "About",
        structure_text: "Headings:\n  h1: About Us",
      },
    ];

    await t.mutation(internal.explorations.internal.completeExplorationCapture, {
      exploration_id: explorationId,
      captured_pages: capturedPages,
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.status).toBe("captured");
    expect(exploration!.captured_pages).toHaveLength(2);
    expect(exploration!.captured_pages![0].title).toBe("Home");
    expect(exploration!.captured_pages![0].screenshot_storage_id).toBeUndefined();
    expect(exploration!.captured_pages![1].screenshot_storage_id).toBeUndefined();
    expect(exploration!.pages_captured).toBe(2);
  });

  it("storeProposedScenarios stores scenarios and sets analyzed status", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId, {
      status: "captured",
    });

    const scenarios = [
      {
        name: "Login flow",
        description: "Test the login process",
        flow_summary: "Navigate to /login, fill credentials, submit",
        area: "Authentication",
      },
      {
        name: "Navigation",
        description: "Test main navigation links",
        flow_summary: "Click each nav link, verify page loads",
        area: "Navigation",
      },
    ];

    await t.mutation(internal.explorations.internal.storeProposedScenarios, {
      exploration_id: explorationId,
      scenarios,
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.status).toBe("analyzed");
    expect(exploration!.proposed_scenarios).toHaveLength(2);
    expect(exploration!.proposed_scenarios![0].name).toBe("Login flow");
    expect(exploration!.proposed_scenarios![0].flow_summary).toContain("/login");
  });

  it("updateExplorationStatus sets status and error_message", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    await t.mutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: explorationId,
      status: "failed",
      error_message: "Connection timed out",
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.status).toBe("failed");
    expect(exploration!.error_message).toBe("Connection timed out");
  });

  it("getExplorationForAnalysis returns captured pages", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const explorationId = await t.run(async (ctx) => {
      return ctx.db.insert("explorations", {
        workspace_id: workspaceId,
        project_id: projectId,
        url: "https://example.com",
        status: "captured",
        captured_pages: [
          {
            url: "https://example.com",
            title: "Home",
            structure_text: "Headings: h1 Welcome",
          },
        ],
      });
    });

    const result = await t.query(internal.explorations.internal.getExplorationForAnalysis, {
      exploration_id: explorationId,
    });

    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://example.com");
    expect(result!.captured_pages).toHaveLength(1);
    expect(result!.captured_pages[0].title).toBe("Home");
  });

  it("completeExplorationCapture stores pages with structured data", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    const capturedPages = [
      {
        url: "https://example.com",
        title: "Home",
        structure_text: "Headings:\n  h1: Welcome",
        semantic_description: "Home page: Welcome to our application",
        interactive_elements: [
          { selector: "button.submit", description: "Submit button", element_type: "button" },
          { selector: "input.email", description: "Email input", element_type: "input" },
        ],
      },
    ];

    await t.mutation(internal.explorations.internal.completeExplorationCapture, {
      exploration_id: explorationId,
      captured_pages: capturedPages,
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.captured_pages).toHaveLength(1);
    expect(exploration!.captured_pages![0].semantic_description).toBe("Home page: Welcome to our application");
    expect(exploration!.captured_pages![0].interactive_elements).toHaveLength(2);
    expect(exploration!.captured_pages![0].interactive_elements![0].element_type).toBe("button");
  });

  it("completeExplorationCapture stores discovered_flows", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    const capturedPages = [
      { url: "https://example.com", title: "Home", structure_text: "Home" },
      { url: "https://example.com/about", title: "About", structure_text: "About" },
    ];

    const discoveredFlows = [
      {
        name: "Home → About",
        steps: ["Home", "About"],
        pages_involved: [0, 1],
        complexity: "low" as const,
      },
    ];

    await t.mutation(internal.explorations.internal.completeExplorationCapture, {
      exploration_id: explorationId,
      captured_pages: capturedPages,
      discovered_flows: discoveredFlows,
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.discovered_flows).toHaveLength(1);
    expect(exploration!.discovered_flows![0].name).toBe("Home → About");
    expect(exploration!.discovered_flows![0].complexity).toBe("low");
  });

  it("completeExplorationCapture works without discovered_flows (backward compat)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId);

    const capturedPages = [
      { url: "https://example.com", title: "Home", structure_text: "Home" },
    ];

    await t.mutation(internal.explorations.internal.completeExplorationCapture, {
      exploration_id: explorationId,
      captured_pages: capturedPages,
    });

    const exploration = await t.run(async (ctx) => ctx.db.get(explorationId));
    expect(exploration!.discovered_flows).toBeUndefined();
    expect(exploration!.captured_pages![0].semantic_description).toBeUndefined();
  });

  it("getExplorationForAnalysis returns discovered_flows", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const explorationId = await t.run(async (ctx) => {
      return ctx.db.insert("explorations", {
        workspace_id: workspaceId,
        project_id: projectId,
        url: "https://example.com",
        status: "captured",
        captured_pages: [
          { url: "https://example.com", title: "Home", structure_text: "Home" },
        ],
        discovered_flows: [
          {
            name: "Home Flow",
            steps: ["Home"],
            pages_involved: [0],
            complexity: "low",
          },
        ],
      });
    });

    const result = await t.query(internal.explorations.internal.getExplorationForAnalysis, {
      exploration_id: explorationId,
    });

    expect(result).not.toBeNull();
    expect(result!.discovered_flows).toHaveLength(1);
    expect(result!.discovered_flows![0].name).toBe("Home Flow");
  });
});
