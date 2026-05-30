import * as fs from "fs/promises";
import * as path from "path";

export async function generatePlaywrightConfig(
  baseURL: string,
  outputDir: string,
  reporterPath: string,
): Promise<string> {
  const fixturePath = path.join(outputDir, "msitest-fixture.ts");
  await fs.writeFile(fixturePath, FIXTURE_CONTENT, "utf-8");

  const configContent = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['${reporterPath}']],
  outputDir: '${outputDir}/test-results',
  use: {
    baseURL: '${baseURL}',
    testIdAttribute: 'data-test',
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
`;

  const configPath = path.join(outputDir, "playwright.config.ts");
  await fs.writeFile(configPath, configContent, "utf-8");
  return configPath;
}

const FIXTURE_CONTENT = `import { test as base, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: number;
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const reporterDir = process.env.MSITEST_REPORTER_DIR || '/tmp/msitest-reporter';
    const consoleFile = path.join(reporterDir, 'console.jsonl');
    const fileIndex = parseInt(testInfo.file.match(/test-(\\d+)\\.spec\\.ts/)?.[1] || '0', 10);
    const logs: ConsoleEntry[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      logs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    await use(page);

    if (logs.length > 0) {
      const line = JSON.stringify({ file_index: fileIndex, logs });
      fs.appendFileSync(consoleFile, line + '\\n', 'utf-8');
    }
  },
});
`;

export async function writeTestFile(
  outputDir: string,
  index: number,
  code: string,
): Promise<string> {
  const fileName = `test-${index}.spec.ts`;
  const filePath = path.join(outputDir, fileName);
  const cleaned = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]@playwright\/test['"];\s*\n?/g,
    (_match, imports: string) => {
      const kept = imports
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s !== "test" && s.length > 0);
      return kept.length > 0 ? `import { ${kept.join(", ")} } from '@playwright/test';\n` : "";
    },
  );
  const wrapped = `import { test } from './msitest-fixture';\n${cleaned}`;
  await fs.writeFile(filePath, wrapped, "utf-8");
  return filePath;
}

export async function createTempRunDir(): Promise<string> {
  const os = await import("os");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "msitest-run-"));
  return dir;
}

export async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
