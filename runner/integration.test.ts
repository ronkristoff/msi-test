import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

import { generatePlaywrightConfig, writeTestFile, createTempRunDir, cleanupDir } from "./src/config";
import { spawn } from "child_process";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Integration Test</title></head>
<body>
  <h1>Hello MSITest</h1>
  <button id="submit-btn">Submit</button>
  <div id="result"></div>
  <script>
    document.getElementById('submit-btn').addEventListener('click', function() {
      document.getElementById('result').textContent = 'Clicked!';
      console.log('Button clicked');
    });
  </script>
</body>
</html>`;

const TEST_CODE = `import { expect } from '@playwright/test';

test('clicks the submit button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Hello MSITest');
  await page.click('#submit-btn');
  await expect(page.locator('#result')).toHaveText('Clicked!');
});

test('page has correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
`;

let server: http.Server;
let baseUrl: string;
let tempDir: string;

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(FIXTURE_HTML);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function runPlaywright(cwd: string, env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  const projectRoot = path.resolve(__dirname, "..");
  return new Promise((resolve) => {
    const proc = spawn(
      "npx",
      ["playwright", "test", `--config=${path.join(cwd, "playwright.config.ts")}`],
      {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env },
      },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

describe("Runner integration", () => {
  beforeAll(async () => {
    await startServer();
  }, 10000);

  afterAll(async () => {
    await stopServer();
    if (tempDir) {
      try {
        await cleanupDir(tempDir);
      } catch {
        // best effort
      }
    }
  });

  it("executes Playwright tests against fixture and captures steps, console, and screenshots", async () => {
    tempDir = await createTempRunDir();
    const reporterDir = path.join(tempDir, "reporter");
    fs.mkdirSync(reporterDir, { recursive: true });

    const reporterModulePath = path.resolve(__dirname, "src/reporter.ts");
    const reporterDistPath = path.resolve(__dirname, "src/reporter.js");

    const reporterPath = fs.existsSync(reporterDistPath)
      ? reporterDistPath
      : reporterModulePath;

    await generatePlaywrightConfig(baseUrl, tempDir, reporterPath);
    await writeTestFile(tempDir, 0, TEST_CODE);

    const result = await runPlaywright(tempDir, {
      MSITEST_REPORTER_DIR: reporterDir,
      NODE_PATH: path.resolve(__dirname, "../node_modules"),
    });

    if (result.code !== 0) {
      console.log("Playwright stdout:", result.stdout);
      console.log("Playwright stderr:", result.stderr);
    }
    expect(result.code).toBe(0);

    const stepsPath = path.join(reporterDir, "steps.jsonl");
    expect(fs.existsSync(stepsPath)).toBe(true);

    const steps = fs.readFileSync(stepsPath, "utf-8").trim().split("\n").filter(Boolean).map(JSON.parse);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toHaveProperty("file_index", 0);
    expect(steps[0]).toHaveProperty("step_number");
    expect(steps[0]).toHaveProperty("status");
    expect(steps[0]).toHaveProperty("duration_ms");

    const summaryPath = path.join(reporterDir, "summary.json");
    expect(fs.existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
    expect(summary.length).toBe(2);
    expect(summary.every((r: { status: string }) => r.status === "passed")).toBe(true);

    const consolePath = path.join(reporterDir, "console.jsonl");
    expect(fs.existsSync(consolePath)).toBe(true);

    const consoleLines = fs.readFileSync(consolePath, "utf-8").trim().split("\n").filter(Boolean).map(JSON.parse);
    expect(consoleLines.length).toBeGreaterThan(0);
    expect(consoleLines[0]).toHaveProperty("file_index");
    expect(consoleLines[0]).toHaveProperty("logs");

    const logTexts = consoleLines.flatMap((e: { logs: Array<{ text: string }> }) => e.logs.map((l) => l.text));
    expect(logTexts).toContain("Button clicked");

    const testResultsDir = path.join(tempDir, "test-results");
    expect(fs.existsSync(testResultsDir)).toBe(true);

    const screenshots = findFiles(testResultsDir, ".png");
    expect(screenshots.length).toBeGreaterThan(0);

    const videos = findFiles(testResultsDir, ".webm");
    expect(videos.length).toBeGreaterThan(0);
  }, 60000);
});

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { recursive: true }) as string[];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      if (fs.statSync(fullPath).isFile() && entry.endsWith(ext)) {
        results.push(fullPath);
      }
    } catch {
      // skip
    }
  }
  return results;
}
