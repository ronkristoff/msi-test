import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

interface StepData {
  file_index: number;
  test_name: string;
  step_number: number;
  command: string;
  status: "passed" | "failed" | "skipped";
  error_message?: string;
  duration_ms: number;
}

interface TestData {
  file_index: number;
  test_name: string;
  status: "passed" | "failed" | "skipped";
  duration_ms: number;
  error_message?: string;
}

export default class MsiTestReporter implements Reporter {
  private outputPath: string;
  private stepFile: string;
  private testResults: TestData[] = [];
  private fileIndexMap: Map<string, number> = new Map();
  private stepCounter: Map<string, number> = new Map();

  constructor() {
    this.outputPath = process.env.MSITEST_REPORTER_DIR || "/tmp/msitest-reporter";
    this.stepFile = path.join(this.outputPath, "steps.jsonl");
  }

  onBegin(_config: FullConfig, _suite: Suite) {
    void _config;
    void _suite;
    fs.mkdirSync(this.outputPath, { recursive: true });
    fs.writeFileSync(this.stepFile, "", "utf-8");
  }

  onTestBegin(test: TestCase) {
    const fileIndex = this.extractFileIndex(test);
    this.fileIndexMap.set(test.id, fileIndex);
    this.stepCounter.set(test.id, 0);
  }

  onStepEnd(test: TestCase, step: { title: string; duration: number; error?: { message?: string } }) {
    if (!step.title) return;

    const fileIndex = this.fileIndexMap.get(test.id);
    if (fileIndex === undefined) return;

    const counter = (this.stepCounter.get(test.id) || 0) + 1;
    this.stepCounter.set(test.id, counter);

    const stepData: StepData = {
      file_index: fileIndex,
      test_name: test.title,
      step_number: counter,
      command: step.title,
      status: step.error ? "failed" : "passed",
      duration_ms: step.duration,
      error_message: step.error?.message,
    };

    fs.appendFileSync(this.stepFile, JSON.stringify(stepData) + "\n", "utf-8");
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const fileIndex = this.fileIndexMap.get(test.id);
    if (fileIndex === undefined) return;

    const status: "passed" | "failed" | "skipped" =
      result.status === "passed" ? "passed" :
      result.status === "skipped" ? "skipped" : "failed";

    this.testResults.push({
      file_index: fileIndex,
      test_name: test.title,
      status,
      duration_ms: result.duration,
      error_message: result.error?.message,
    });
  }

  onEnd(_result: FullResult) {
    void _result;
    const summaryFile = path.join(this.outputPath, "summary.json");
    fs.writeFileSync(summaryFile, JSON.stringify(this.testResults, null, 2), "utf-8");
  }

  printsToStdio() {
    return false;
  }

  private extractFileIndex(test: TestCase): number {
    const fileName = test.location.file;
    const match = fileName.match(/test-(\d+)\.spec\.ts/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
