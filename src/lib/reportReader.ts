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
  const latest = await readJsonFile<EvalReport>(LATEST_REPORT_PATH);
  if (latest) {
    return latest;
  }

  const fallbackPath = await readLatestRunReportPath();
  if (!fallbackPath) {
    return null;
  }

  return readJsonFile<EvalReport>(fallbackPath);
}

export async function readDemoSession(): Promise<DemoSession | null> {
  return readJsonFile<DemoSession>(DEMO_SESSION_PATH);
}

export async function readLatestPrompt(): Promise<string | null> {
  const latest = await readLatestReport();
  const session = await readDemoSession();
  const runIds = [
    latest?.summary.runId,
    session?.patchedRunId,
    session?.baselineRunId
  ].filter((value): value is string => Boolean(value));

  for (const runId of runIds) {
    const repairDir = path.join(RUNS_DIR, runId, "repair");
    const promptPaths: string[] = [];

    try {
      const entries = await fs.readdir(repairDir, { withFileTypes: true });
      const codexPrompts = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && /^codex(?:-.+)?-repair-prompt\.md$/.test(entry.name))
          .map(async (entry) => {
            const promptPath = path.join(repairDir, entry.name);
            const stats = await fs.stat(promptPath);
            return { promptPath, modifiedAt: stats.mtimeMs };
          })
      );

      promptPaths.push(
        ...codexPrompts
          .sort((left, right) => right.modifiedAt - left.modifiedAt)
          .map((item) => item.promptPath)
      );
    } catch {
      // Fall back to legacy prompt locations when repair artifacts are absent.
    }

    promptPaths.push(
      path.join(repairDir, "codex-repair-prompt.md"),
      path.join(RUNS_DIR, runId, "codex-patch-prompt.md")
    );

    for (const promptPath of promptPaths) {
      try {
        return await fs.readFile(promptPath, "utf8");
      } catch {
        // Try the next supported prompt location.
      }
    }
  }

  return null;
}

export async function readLatestRunReportPath(): Promise<string | null> {
  try {
    const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
    const reports = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const reportPath = path.join(RUNS_DIR, entry.name, "report.json");
          try {
            const stats = await fs.stat(reportPath);
            return { reportPath, modifiedAt: stats.mtimeMs };
          } catch {
            return null;
          }
        })
    );

    const latestReport = reports
      .filter((report): report is { reportPath: string; modifiedAt: number } => report !== null)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];

    return latestReport?.reportPath ?? null;
  } catch {
    return null;
  }
}
