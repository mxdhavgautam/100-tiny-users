import { promises as fs } from "node:fs";
import { DEMO_SESSION_PATH } from "../src/lib/paths";
import type { DemoSession, DemoSuiteRun, RunProgress } from "../src/lib/types";
import { runColony, type ColonyProgress } from "./runner";

function progressFromColony(progress: ColonyProgress): RunProgress {
  return {
    phase: "suite",
    runId: progress.runId,
    label: progress.label,
    total: progress.total,
    completed: progress.completed,
    passed: progress.passed,
    failed: progress.failed,
    blocked: progress.blocked,
    errored: progress.errored,
    scorePercent: progress.completed === 0 ? 0 : Math.round((progress.passed / progress.total) * 100),
    updatedAt: new Date().toISOString()
  };
}

async function writeSession(session: DemoSession): Promise<void> {
  await fs.writeFile(DEMO_SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

const suiteRuns: DemoSuiteRun[] = [];

await writeSession({
  mode: "full-suite",
  suiteRuns,
  activeLabel: "URL replay",
  activeRun: {
    phase: "suite",
    runId: "url-replay-pending",
    label: "URL replay",
    total: 1,
    completed: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    errored: 0,
    scorePercent: 0,
    updatedAt: new Date().toISOString()
  },
  patchLog: [],
  updatedAt: new Date().toISOString()
});

const report = await runColony(process.argv.slice(2), {
  onProgress: async (progress) => {
    await writeSession({
      mode: "full-suite",
      suiteRuns,
      activeLabel: "URL replay",
      activeRun: progressFromColony(progress),
      patchLog: [],
      updatedAt: new Date().toISOString()
    });
  }
});

suiteRuns.push({
  label: "URL replay",
  workflowId: report.results[0]?.workflowId ?? "submit-project",
  harnessKind: report.results[0]?.harnessKind ?? "deterministic-playwright",
  summary: report.summary
});

await writeSession({
  mode: "full-suite",
  baselineRunId: report.summary.runId,
  patchedRunId: report.summary.runId,
  baseline: report.summary,
  patched: report.summary,
  suiteRuns,
  patchLog: [],
  updatedAt: new Date().toISOString()
});
