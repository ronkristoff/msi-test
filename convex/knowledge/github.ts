"use node";

import { ConvexError } from "convex/values";
import {
  GITHUB_DEFAULT_BRANCH,
  INGESTION_INCLUDE_EXTENSIONS,
  INGESTION_EXCLUDE_DIRS,
  MAX_FILE_SIZE_BYTES,
} from "../lib/constraints";

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface FileTreeResult {
  tree: TreeEntry[];
  truncated: boolean;
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: number;
}

export function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    throw new ConvexError(`Invalid repository URL: ${repoUrl}`);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new ConvexError(`Could not parse owner/repo from URL: ${repoUrl}`);
  }

  let repo = parts[1];
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
  return { owner: parts[0], repo };
}

export function filterFiles(
  entries: TreeEntry[],
  includeExts: string[] = INGESTION_INCLUDE_EXTENSIONS,
  excludeDirs: string[] = INGESTION_EXCLUDE_DIRS,
): TreeEntry[] {
  return entries.filter((entry) => {
    if (entry.type !== "blob") return false;

    const path = entry.path;
    const pathSegments = path.split("/");
    const isInExcludedDir = pathSegments.some((segment) =>
      excludeDirs.includes(segment),
    );
    if (isInExcludedDir) return false;

    const lastDot = path.lastIndexOf(".");
    if (lastDot === -1) return false;
    const ext = path.slice(lastDot).toLowerCase();
    return includeExts.includes(ext);
  });
}

export function checkRateLimit(response: Response): RateLimitInfo {
  const remaining = parseInt(
    response.headers.get("x-ratelimit-remaining") ?? "5000",
    10,
  );
  const resetAt = parseInt(
    response.headers.get("x-ratelimit-reset") ?? "0",
    10,
  );
  return { remaining, resetAt };
}

export async function fetchFileTree(
  owner: string,
  repo: string,
  pat: string,
  branch: string = GITHUB_DEFAULT_BRANCH,
): Promise<FileTreeResult> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ConvexError(`Repository not found: ${owner}/${repo}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ConvexError("GitHub authentication failed. Check your PAT.");
    }
    if (response.status === 429) {
      throw new ConvexError("GitHub rate limited. Please wait a few minutes and try again.");
    }
    throw new ConvexError(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }

  let data: { tree?: Array<{ path: string; type: string; size?: number }>; truncated?: boolean };
  try {
    data = await response.json();
  } catch {
    throw new ConvexError("GitHub API returned invalid JSON");
  }
  const tree: TreeEntry[] = (data.tree ?? []).map((entry) => ({
    path: entry.path,
    type: entry.type as "blob" | "tree",
    size: entry.size,
  }));

  return { tree, truncated: Boolean(data.truncated) };
}

const textEncoder = new TextEncoder();

export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  pat: string,
  maxRetries: number = 3,
): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${pat}` },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ConvexError("File fetch timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ConvexError("GitHub authentication failed during file fetch. Check your PAT.");
    }

    if (response.status === 404) return null;

    if (response.status === 429) {
      const rateInfo = checkRateLimit(response);
      if (rateInfo.remaining === 0 && attempt < maxRetries) {
        await waitForRateLimitReset(rateInfo.resetAt);
        continue;
      }
      throw new ConvexError("GitHub rate limited. Please wait and try again.");
    }

    if (!response.ok) return null;

    const content = await response.text();
    const byteSize = textEncoder.encode(content).byteLength;
    if (byteSize > MAX_FILE_SIZE_BYTES) return null;

    return content;
  }

  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRateLimitReset(resetAt: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const waitMs = Math.max(0, (resetAt - now) * 1000);
  const MAX_WAIT_MS = 5 * 60 * 1000;
  if (waitMs > 0 && waitMs <= MAX_WAIT_MS) {
    await sleep(waitMs);
  }
}
