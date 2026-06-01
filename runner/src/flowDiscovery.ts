import type { DiscoveredFlow } from "./types";

interface PageNode {
  index: number;
  url: string;
  linksTo: number[];
}

export function discoverFlows(
  pages: Array<{ url: string; title: string }>,
  linkGraph?: Map<string, string[]>,
): DiscoveredFlow[] {
  if (pages.length === 0) return [];

  const nodes: PageNode[] = pages.map((page, i) => ({
    index: i,
    url: page.url,
    linksTo: [],
  }));

  if (linkGraph) {
    for (const node of nodes) {
      const links = linkGraph.get(node.url) ?? [];
      node.linksTo = links
        .map((href) => nodes.findIndex((n) => n.url === href))
        .filter((i) => i !== -1 && i !== node.index);
    }
  }

  const visited = new Set<number>();
  const flows: DiscoveredFlow[] = [];

  for (const node of nodes) {
    if (visited.has(node.index)) continue;

    const flowPages = traverseFlow(node, nodes, visited);
    if (flowPages.length === 0) continue;

    const name = buildFlowName(pages, flowPages);
    const steps = flowPages.map((i) => pages[i].title || pages[i].url);
    const complexity = classifyComplexity(flowPages.length, nodes, flowPages);

    flows.push({
      name,
      steps,
      pages_involved: flowPages,
      complexity,
    });
  }

  return flows;
}

function traverseFlow(
  start: PageNode,
  nodes: PageNode[],
  globalVisited: Set<number>,
): number[] {
  const localVisited = new Set<number>();
  const result: number[] = [];

  function dfs(nodeIndex: number) {
    if (localVisited.has(nodeIndex)) return;
    localVisited.add(nodeIndex);
    globalVisited.add(nodeIndex);
    result.push(nodeIndex);

    const node = nodes[nodeIndex];
    for (const target of node.linksTo) {
      if (!localVisited.has(target)) {
        dfs(target);
      }
    }
  }

  dfs(start.index);
  return result.sort((a, b) => a - b);
}

function buildFlowName(
  pages: Array<{ url: string; title: string }>,
  flowPages: number[],
): string {
  if (flowPages.length === 1) {
    const page = pages[flowPages[0]];
    return page.title || extractPathName(page.url);
  }

  const first = pages[flowPages[0]];
  const last = pages[flowPages[flowPages.length - 1]];
  const firstName = first.title || extractPathName(first.url);
  const lastName = last.title || extractPathName(last.url);
  return `${firstName} → ${lastName}`;
}

function extractPathName(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path === "/" || path === "") return parsed.host ?? "Home";
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || segments[0] || "Home";
  } catch {
    return "Unknown";
  }
}

function classifyComplexity(
  pageCount: number,
  nodes: PageNode[],
  flowPages: number[],
): "low" | "medium" | "high" {
  if (pageCount <= 2) return "low";
  if (pageCount <= 5) return "medium";

  const branching = flowPages.filter((i) => nodes[i].linksTo.length > 2).length;
  if (branching > 1) return "high";
  return "medium";
}
