import { promises as fs } from "node:fs";
import path from "node:path";
import { DEMO_SESSION_PATH, LATEST_REPORT_PATH, RUNS_DIR } from "@/src/lib/paths";
import type { DemoSession, EvalReport } from "@/src/lib/types";

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readLatestReport(): Promise<EvalReport | null> {
  return readJsonFile<EvalReport>(LATEST_REPORT_PATH);
}

export async function readDemoSession(): Promise<DemoSession | null> {
  return readJsonFile<DemoSession>(DEMO_SESSION_PATH);
}

export async function readLatestPrompt(): Promise<string | null> {
  const session = await readDemoSession();
  const runId = session?.baselineRunId;
  if (!runId) {
    return null;
  }

  try {
    return await fs.readFile(path.join(RUNS_DIR, runId, "codex-patch-prompt.md"), "utf8");
  } catch {
    return null;
  }
}
