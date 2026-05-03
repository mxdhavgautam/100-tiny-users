import { promises as fs } from "node:fs";
import path from "node:path";
import { parsePatcherArgs } from "./args";
import { BUG_SWITCHES_PATH, DEMO_SESSION_PATH, LATEST_REPORT_PATH, RUNS_DIR } from "../src/lib/paths";
import type { DemoSession, EvalReport, FailureCluster, PatchLogEntry } from "../src/lib/types";

async function readReport(): Promise<EvalReport> {
  const raw = await fs.readFile(LATEST_REPORT_PATH, "utf8");
  return JSON.parse(raw) as EvalReport;
}

function promptFor(report: EvalReport): string {
  return `# Codex Patch Prompt

Patch the root cause of the top Hundred Tiny Users failure clusters in artifacts/latest-report.json.

## Goal

Improve the browser-only colony score for the product promise: "A hackathon project submission portal".

## Hard constraints

- Do not use any.
- Do not weaken evals or persona expectations.
- Do not bypass the browser eval by changing eval/runner.ts or eval/personas.ts unless the failure is demonstrably in the eval itself. The default assumption is that app code is broken.
- Make the smallest production-safe app-code fix.

## Current summary

\`\`\`json
${JSON.stringify(report.summary, null, 2)}
\`\`\`

## Top clusters

\`\`\`json
${JSON.stringify(report.summary.clusters, null, 2)}
\`\`\`

## Files worth inspecting

- src/components/PortalClient.tsx
- src/demo/bugSwitches.ts
- src/lib/storage.ts
- app/api/submissions/route.ts
- app/portal/page.tsx

## Validation commands

\`\`\`bash
bun run typecheck
bun run build
bun run eval -- --label patched --count 50
\`\`\`

## Required response

Summarize files changed, why the root cause is fixed, validation results, and before/after score.
`;
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
  const args = parsePatcherArgs(argv);
  const report = await readReport();
  const runDir = path.join(RUNS_DIR, report.summary.runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "codex-patch-prompt.md"), promptFor(report), "utf8");
  console.log(`Wrote ${path.join(runDir, "codex-patch-prompt.md")}`);

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
