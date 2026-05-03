import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { DEMO_SESSION_PATH } from "../src/lib/paths";
import type { DemoSession, EvalSummary, RunProgress } from "../src/lib/types";
import { resetDemo } from "./reset-demo";
import { clusterFailures } from "./cluster";
import { type ColonyProgress, runColony } from "./runner";
import { patch } from "./patcher";

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

function startDevServer(): { stop: () => Promise<void> } {
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

async function writeFinalSession(session: DemoSession): Promise<void> {
  await fs.writeFile(DEMO_SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function progressSummary(progress: ColonyProgress): EvalSummary {
  return {
    runId: progress.runId,
    label: progress.label,
    url: progress.url,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    total: progress.total,
    passed: progress.passed,
    failed: progress.failed,
    scorePercent: Math.round((progress.passed / progress.total) * 100),
    clusters: clusterFailures(progress.results)
  };
}

async function writeProgress(
  phase: RunProgress["phase"],
  progress: ColonyProgress,
  previous: Omit<DemoSession, "updatedAt" | "activeRun">
): Promise<void> {
  const now = new Date().toISOString();
  const partial = progressSummary(progress);
  const activeRun: RunProgress = {
    phase,
    runId: progress.runId,
    label: progress.label,
    total: progress.total,
    completed: progress.completed,
    passed: progress.passed,
    failed: progress.failed,
    scorePercent: partial.scorePercent,
    updatedAt: now
  };
  await writeFinalSession({
    ...previous,
    baselineRunId: phase === "baseline" ? progress.runId : previous.baselineRunId,
    patchedRunId: phase === "patched" ? progress.runId : previous.patchedRunId,
    baseline: phase === "baseline" ? partial : previous.baseline,
    patched: phase === "patched" ? partial : previous.patched,
    activeRun,
    updatedAt: now
  });
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

console.log("=== Resetting demo ===");
await resetDemo();
const server = startDevServer();
let completed = false;

try {
  await waitForServer("http://127.0.0.1:3000/portal");
  await writeFinalSession({ patchLog: [], updatedAt: new Date().toISOString() });
  console.log("=== Baseline colony run ===");
  const baseline = await runColony(
    ["--url", "http://127.0.0.1:3000/portal", "--label", "baseline", "--count", "50"],
    {
      onProgress: (progress) => writeProgress("baseline", progress, { patchLog: [] })
    }
  );
  console.log("=== Applying demo patch loop ===");
  const patchLog = await patch(["--mode", "demo", "--all"]);
  await writeFinalSession({
    baselineRunId: baseline.summary.runId,
    baseline: baseline.summary,
    patchLog,
    updatedAt: new Date().toISOString()
  });
  console.log("=== Patched colony rerun ===");
  const patched = await runColony(
    ["--url", "http://127.0.0.1:3000/portal", "--label", "patched", "--count", "50"],
    {
      onProgress: (progress) =>
        writeProgress("patched", progress, {
          baselineRunId: baseline.summary.runId,
          baseline: baseline.summary,
          patchLog
        })
    }
  );
  await writeFinalSession({
    baselineRunId: baseline.summary.runId,
    patchedRunId: patched.summary.runId,
    baseline: baseline.summary,
    patched: patched.summary,
    patchLog,
    updatedAt: new Date().toISOString()
  });
  console.log("=== Demo scoreboard ===");
  console.log(`Before: ${baseline.summary.passed}/${baseline.summary.total} passed`);
  console.log(`After:  ${patched.summary.passed}/${patched.summary.total} passed`);
  console.log("Dashboard: http://127.0.0.1:3000/");
  completed = true;
  if (shouldKeepAlive(process.argv.slice(2))) {
    await waitUntilInterrupted(server.stop);
  }
} finally {
  if (!completed || !shouldKeepAlive(process.argv.slice(2))) {
    await server.stop();
  }
}
