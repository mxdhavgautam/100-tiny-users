import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { DEMO_SESSION_PATH, LATEST_REPORT_PATH } from "../src/lib/paths";
import type { DemoSession, DemoSuiteRun, RunProgress } from "../src/lib/types";
import type { EvalReport } from "../src/lib/types";

type SuiteCase = {
  title: string;
  workflowId: string;
  harnessKind: DemoSuiteRun["harnessKind"];
  argv: string[];
};

const SUITE_CASES: SuiteCase[] = [
  {
    title: "Portal happy-path replay",
    workflowId: "submit-project",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/demo-hackathon.json",
      "--workflow", "submit-project",
      "--harness", "deterministic-playwright",
      "--persona", "U009",
      "--count", "50",
      "--label", "suite-portal-happy"
    ]
  },
  {
    title: "Workbench semantic search",
    workflowId: "search-billing-by-duplicate-charge",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/workbench-ops.json",
      "--workflow", "search-billing-by-duplicate-charge",
      "--harness", "deterministic-playwright",
      "--persona", "U009",
      "--count", "9",
      "--label", "suite-workbench-search"
    ]
  },
  {
    title: "Portal screen-reader replay",
    workflowId: "submit-project",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/demo-hackathon.json",
      "--workflow", "submit-project",
      "--harness", "deterministic-playwright",
      "--persona", "U002",
      "--count", "50",
      "--label", "suite-portal-screenreader"
    ]
  },
  {
    title: "Portal long-text replay",
    workflowId: "submit-project",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/demo-hackathon.json",
      "--workflow", "submit-project",
      "--harness", "deterministic-playwright",
      "--persona", "U007",
      "--count", "50",
      "--label", "suite-portal-longtext"
    ]
  },
  {
    title: "Portal duplicate seed",
    workflowId: "submit-project",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/demo-hackathon.json",
      "--workflow", "submit-project",
      "--harness", "deterministic-playwright",
      "--persona", "U006",
      "--count", "50",
      "--label", "suite-portal-duplicate-seed"
    ]
  },
  {
    title: "Portal duplicate rejection replay",
    workflowId: "submit-project",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/demo-hackathon.json",
      "--workflow", "submit-project",
      "--harness", "deterministic-playwright",
      "--persona", "U016",
      "--count", "50",
      "--label", "suite-portal-duplicate-replay",
      "--no-reset"
    ]
  },
  {
    title: "Portal keyboard replay",
    workflowId: "submit-project",
    harnessKind: "deterministic-playwright",
    argv: [
      "--config", "configs/demo-hackathon.json",
      "--workflow", "submit-project",
      "--harness", "deterministic-playwright",
      "--persona", "U008",
      "--count", "50",
      "--label", "suite-portal-keyboard"
    ]
  }
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until Next has compiled the route.
    }
    await wait(500);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

function shouldKeepAlive(argv: string[]): boolean {
  return argv.includes("--keep-alive");
}

async function canReuseServer(): Promise<boolean> {
  try {
    const [portal, workbench] = await Promise.all([
      fetch("http://127.0.0.1:3000/portal"),
      fetch("http://127.0.0.1:3000/workbench")
    ]);
    return portal.ok && workbench.ok;
  } catch {
    return false;
  }
}

async function startDevServer(): Promise<{ stop: () => Promise<void> }> {
  if (await canReuseServer()) {
    console.log("=== Reusing existing dev server on :3000 ===");
    return {
      stop: async () => {
        await Promise.resolve();
      }
    };
  }

  const child = spawn("bun", ["run", "dev"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }
  });

  return {
    stop: async () => {
      child.kill("SIGTERM");
      await wait(800);
    }
  };
}

function currentSummaryFields(runs: DemoSuiteRun[]): Pick<DemoSession, "baselineRunId" | "patchedRunId" | "baseline" | "patched"> {
  const first = runs[0]?.summary;
  const latest = runs.length > 0 ? runs[runs.length - 1]?.summary : undefined;

  return {
    baselineRunId: first?.runId,
    patchedRunId: latest?.runId,
    baseline: first,
    patched: latest
  };
}

async function writeSession(session: DemoSession): Promise<void> {
  await fs.writeFile(DEMO_SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

async function writeSuiteSession(runs: DemoSuiteRun[], activeLabel?: string, activeRun?: RunProgress): Promise<void> {
  await writeSession({
    mode: "full-suite",
    ...currentSummaryFields(runs),
    suiteRuns: runs,
    activeLabel,
    activeRun,
    patchLog: [],
    updatedAt: new Date().toISOString()
  });
}

function pendingSuiteProgress(title: string, runId: string): RunProgress {
  return {
    phase: "suite",
    runId,
    label: title,
    total: 1,
    completed: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    errored: 0,
    scorePercent: 0,
    updatedAt: new Date().toISOString()
  };
}

async function readLatestReport(): Promise<EvalReport> {
  const raw = await fs.readFile(LATEST_REPORT_PATH, "utf8");
  return JSON.parse(raw) as EvalReport;
}

async function runSuiteCase(suiteCase: SuiteCase, completedRuns: DemoSuiteRun[]): Promise<DemoSuiteRun> {
  console.log(`=== ${suiteCase.title} ===`);
  await writeSuiteSession(completedRuns, suiteCase.title, pendingSuiteProgress(suiteCase.title, `${suiteCase.workflowId}-pending`));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "bun",
      ["run", "eval", "--", ...suiteCase.argv],
      { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } }
    );
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`${suiteCase.title} exited with code ${exitCode ?? "null"} signal ${signal ?? "none"}`));
      }
    });
  });
  const report = await readLatestReport();

  return {
    label: suiteCase.title,
    workflowId: suiteCase.workflowId,
    harnessKind: suiteCase.harnessKind,
    summary: report.summary
  };
}

function printSuiteScoreboard(runs: DemoSuiteRun[]): void {
  console.log("=== Full demo suite scoreboard ===");
  for (const run of runs) {
    console.log(`${run.label}: ${run.summary.passed}/${run.summary.total} passed`);
  }
  console.log("Dashboard: http://127.0.0.1:3000/");
  console.log("Portal:    http://127.0.0.1:3000/portal");
  console.log("Workbench: http://127.0.0.1:3000/workbench");
}

async function waitUntilInterrupted(stop: () => Promise<void>): Promise<void> {
  console.log("Dev server is still running. Press Ctrl+C to stop it.");
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      resolve();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
  await stop();
}

const server = await startDevServer();
let completed = false;

try {
  await waitForServer("http://127.0.0.1:3000/portal");
  await waitForServer("http://127.0.0.1:3000/workbench");
  const runs: DemoSuiteRun[] = [];
  await writeSuiteSession(runs);

  for (const suiteCase of SUITE_CASES) {
    const run = await runSuiteCase(suiteCase, runs);
    runs.push(run);
    await writeSuiteSession(runs);
  }

  printSuiteScoreboard(runs);
  completed = true;

  if (shouldKeepAlive(process.argv.slice(2))) {
    await waitUntilInterrupted(server.stop);
  }
} finally {
  if (!completed || !shouldKeepAlive(process.argv.slice(2))) {
    await server.stop();
  }
}
