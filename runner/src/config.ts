import * as fs from "fs/promises";
import * as path from "path";

export async function generatePlaywrightConfig(
  baseURL: string,
  outputDir: string,
  reporterPath: string,
): Promise<string> {
  const configContent = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['${reporterPath}']],
  use: {
    baseURL: '${baseURL}',
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

export async function writeTestFile(
  outputDir: string,
  index: number,
  code: string,
): Promise<string> {
  const fileName = `test-${index}.spec.ts`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, code, "utf-8");
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
