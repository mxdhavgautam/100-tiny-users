import { promises as fs } from "node:fs";
import path from "node:path";
import { parsePatcherArgs } from "./args";
import { parseRepairArgs } from "./repair/cli";
import { commandString, orchestrateRepair } from "./repair/orchestrator";
import { BUG_SWITCHES_PATH, DEMO_SESSION_PATH, LATEST_REPORT_PATH, RUNS_DIR } from "../src/lib/paths";
import type { DemoSession, EvalReport, FailureCluster, PatchLogEntry } from "../src/lib/types";
import type { RepairRunResult } from "./repair/types";

async function readReport(): Promise<EvalReport> {
  const raw = await fs.readFile(LATEST_REPORT_PATH, "utf8");
  return JSON.parse(raw) as EvalReport;
}

export async function repair(argv: string[] = process.argv.slice(2)): Promise<RepairRunResult> {
  const args = parseRepairArgs(argv);
  const report = await readReport();
  const runDir = path.join(RUNS_DIR, report.summary.runId);
  await fs.mkdir(runDir, { recursive: true });
  const result = await orchestrateRepair(report, runDir, args);
  const resultPath = path.join(runDir, "repair", "repair-result.json");
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  for (const packet of result.packets) {
    console.log(`Wrote ${packet.harness} repair prompt: ${packet.path}`);
  }
  console.log(`Wrote repair result: ${resultPath}`);
  for (const command of result.commands) {
    console.log(`${command.harness} setup: ${commandString(command.setupCommand)}`);
    console.log(`${command.harness} repair: ${commandString(command.repairCommand)}`);
  }

  return result;
}

function hasCluster(clusters: FailureCluster[], kind: FailureCluster["kind"]): boolean {
  return clusters.some((cluster) => cluster.kind === kind);
}

async function flipSwitches(report: EvalReport): Promise<PatchLogEntry[]> {
  let source = await fs.readFile(BUG_SWITCHES_PATH, "utf8");
  const log: PatchLogEntry[] = [];
  const flips = [
    { kind: "duplicate-team-overwrite", key: "BUG_DUPLICATE_TEAM_OVERWRITE" },
    { kind: "screen-reader-submit-not-found", key: "BUG_SCREEN_READER_SUBMIT" },
    { kind: "long-text-layout-overflow", key: "BUG_LONG_TEXT_LAYOUT" }
  ] as const;

  for (const flip of flips) {
    if (!hasCluster(report.summary.clusters, flip.kind)) {
      continue;
    }
    const before = `export const ${flip.key} = true;`;
    const after = `export const ${flip.key} = false;`;
    if (source.includes(before)) {
      source = source.replace(before, after);
      log.push({ key: flip.key, before, after });
      console.log(`${flip.kind}: ${before} -> ${after}`);
    }
  }

  await fs.writeFile(BUG_SWITCHES_PATH, source, "utf8");
  return log;
}

export async function patch(argv: string[] = process.argv.slice(2)): Promise<PatchLogEntry[]> {
  const repairOnly = argv.includes("--execute") || argv.includes("--harness") || argv.includes("--agent") || argv.includes("--dry-run");
  if (repairOnly) {
    await repair(argv);
    return [];
  }

  const args = parsePatcherArgs(argv);
  const report = await readReport();
  await repair(["--dry-run", "--harness", "all"]);

  if (args.mode === "prompt") {
    return [];
  }

  const patchLog = await flipSwitches(report);
  const session: DemoSession = {
    baselineRunId: report.summary.runId,
    baseline: report.summary,
    patchLog,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(DEMO_SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return patchLog;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await patch();
}
