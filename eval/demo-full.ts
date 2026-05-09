import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { DEMO_SESSION_PATH, LATEST_REPORT_PATH } from "../src/lib/paths";
import type { DemoSession, EvalReport, EvalSummary, RunProgress } from "../src/lib/types";
import { resetDemo } from "./reset-demo";
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

async function readLatestReport(): Promise<EvalReport> {
  const raw = await fs.readFile(LATEST_REPORT_PATH, "utf8");
  return JSON.parse(raw) as EvalReport;
}

async function writePhaseStart(phase: RunProgress["phase"], label: string, total: number, previous: Omit<DemoSession, "updatedAt" | "activeRun">): Promise<void> {
  const now = new Date().toISOString();
  const activeRun: RunProgress = {
    phase,
    runId: `${label}-pending`,
    label,
    total,
    completed: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    errored: 0,
    scorePercent: 0,
    updatedAt: now
  };
  await writeFinalSession({
    ...previous,
    activeRun,
    updatedAt: now
  });
}

async function runEvalPhase(label: "baseline" | "patched", previous: Omit<DemoSession, "updatedAt" | "activeRun">): Promise<EvalSummary> {
  await writePhaseStart(label, label, 50, previous);
  const cohortArg = label === "patched" && previous.baselineRunId
    ? ["--cohort", `artifacts/runs/${previous.baselineRunId}/config/cohort.json`]
    : [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "bun",
      ["run", "eval", "--", "--config", "configs/demo-hackathon.json", "--label", label, "--count", "50", ...cohortArg],
      { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } }
    );
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`Eval phase ${label} exited with code ${exitCode ?? "null"} signal ${signal ?? "none"}`));
      }
    });
  });
  const report = await readLatestReport();
  return report.summary;
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
  const baseline = await runEvalPhase("baseline", { patchLog: [] });
  console.log("=== Applying demo patch loop ===");
  const patchLog = await patch(["--mode", "demo", "--all"]);
  await writeFinalSession({
    baselineRunId: baseline.runId,
    baseline,
    patchLog,
    updatedAt: new Date().toISOString()
  });
  console.log("=== Patched colony rerun ===");
  const patched = await runEvalPhase("patched", {
    baselineRunId: baseline.runId,
    baseline,
    patchLog
  });
  await writeFinalSession({
    baselineRunId: baseline.runId,
    patchedRunId: patched.runId,
    baseline,
    patched,
    patchLog,
    updatedAt: new Date().toISOString()
  });
  console.log("=== Demo scoreboard ===");
  console.log(`Before: ${baseline.passed}/${baseline.total} passed`);
  console.log(`After:  ${patched.passed}/${patched.total} passed`);
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
