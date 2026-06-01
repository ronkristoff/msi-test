import { describe, it, expect } from "vitest";
import { discoverFlows } from "./flowDiscovery";

describe("discoverFlows", () => {
  it("returns empty for no pages", () => {
    expect(discoverFlows([])).toEqual([]);
  });

  it("creates a single flow for one page", () => {
    const pages = [{ url: "https://example.com", title: "Home" }];
    const flows = discoverFlows(pages);
    expect(flows).toHaveLength(1);
    expect(flows[0].name).toBe("Home");
    expect(flows[0].pages_involved).toEqual([0]);
    expect(flows[0].complexity).toBe("low");
  });

  it("creates a linear flow from link graph", () => {
    const pages = [
      { url: "https://example.com", title: "Home" },
      { url: "https://example.com/about", title: "About" },
      { url: "https://example.com/contact", title: "Contact" },
    ];
    const linkGraph = new Map([
      ["https://example.com", ["https://example.com/about"]],
      ["https://example.com/about", ["https://example.com/contact"]],
      ["https://example.com/contact", []],
    ]);

    const flows = discoverFlows(pages, linkGraph);
    expect(flows).toHaveLength(1);
    expect(flows[0].pages_involved).toEqual([0, 1, 2]);
    expect(flows[0].complexity).toBe("medium");
  });

  it("separates disconnected pages into separate flows", () => {
    const pages = [
      { url: "https://example.com", title: "Home" },
      { url: "https://example.com/about", title: "About" },
      { url: "https://other.com", title: "External" },
    ];
    const linkGraph = new Map([
      ["https://example.com", ["https://example.com/about"]],
      ["https://example.com/about", []],
      ["https://other.com", []],
    ]);

    const flows = discoverFlows(pages, linkGraph);
    expect(flows).toHaveLength(2);
  });

  it("classifies low complexity for 1-2 pages", () => {
    const pages = [
      { url: "https://example.com", title: "Home" },
      { url: "https://example.com/about", title: "About" },
    ];
    const linkGraph = new Map([
      ["https://example.com", ["https://example.com/about"]],
      ["https://example.com/about", []],
    ]);

    const flows = discoverFlows(pages, linkGraph);
    expect(flows[0].complexity).toBe("low");
  });

  it("classifies medium complexity for 3-5 pages", () => {
    const pages = [
      { url: "https://example.com", title: "Home" },
      { url: "https://example.com/a", title: "A" },
      { url: "https://example.com/b", title: "B" },
      { url: "https://example.com/c", title: "C" },
    ];
    const linkGraph = new Map([
      ["https://example.com", ["https://example.com/a"]],
      ["https://example.com/a", ["https://example.com/b"]],
      ["https://example.com/b", ["https://example.com/c"]],
      ["https://example.com/c", []],
    ]);

    const flows = discoverFlows(pages, linkGraph);
    expect(flows[0].complexity).toBe("medium");
  });

  it("builds flow name from first and last page titles", () => {
    const pages = [
      { url: "https://example.com/login", title: "Login" },
      { url: "https://example.com/dashboard", title: "Dashboard" },
    ];
    const linkGraph = new Map([
      ["https://example.com/login", ["https://example.com/dashboard"]],
      ["https://example.com/dashboard", []],
    ]);

    const flows = discoverFlows(pages, linkGraph);
    expect(flows[0].name).toBe("Login → Dashboard");
  });

  it("extracts path name as fallback when title is empty", () => {
    const pages = [
      { url: "https://example.com/login", title: "" },
      { url: "https://example.com/dashboard", title: "" },
    ];
    const linkGraph = new Map([
      ["https://example.com/login", ["https://example.com/dashboard"]],
      ["https://example.com/dashboard", []],
    ]);

    const flows = discoverFlows(pages, linkGraph);
    expect(flows[0].name).toBe("login → dashboard");
  });

  it("handles pages without a link graph", () => {
    const pages = [
      { url: "https://example.com", title: "Home" },
      { url: "https://example.com/about", title: "About" },
    ];

    const flows = discoverFlows(pages);
    expect(flows).toHaveLength(2);
    expect(flows[0].complexity).toBe("low");
    expect(flows[1].complexity).toBe("low");
  });
});
