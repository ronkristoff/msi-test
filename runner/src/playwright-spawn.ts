import * as path from "path";
import { spawn } from "child_process";

export interface PlaywrightSpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function spawnPlaywright(
  cwd: string,
  log: (msg: string) => void,
  extraEnv: Record<string, string> = {},
): Promise<PlaywrightSpawnResult> {
  const projectRoot = path.resolve(__dirname, "../..");

  return new Promise((resolve) => {
    const proc = spawn(
      path.join(projectRoot, "node_modules", ".bin", "playwright"),
      ["test", "--config=playwright.config.ts"],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...extraEnv,
          NODE_PATH: path.join(projectRoot, "node_modules"),
        },
      },
    );

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      for (const line of text.split("\n").filter(Boolean)) {
        log(`  [pw stdout] ${line}`);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      for (const line of text.split("\n").filter(Boolean)) {
        log(`  [pw stderr] ${line}`);
      }
    });

    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    proc.on("error", (err) => {
      log(`Playwright process error: ${err}`);
      resolve({ exitCode: 1, stdout, stderr: stderr + `\nProcess error: ${err.message}` });
    });
  });
}
