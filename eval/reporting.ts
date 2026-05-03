import { promises as fs } from "node:fs";
import path from "node:path";
import { ARTIFACTS_DIR, LATEST_REPORT_PATH, RUNS_DIR } from "../src/lib/paths";
import type { EvalReport, FailureCluster, PersonaResult } from "../src/lib/types";

export function replayCommand(url: string, personaId: string, label: string): string {
  return `bun run eval -- --url ${url} --persona ${personaId} --label replay-${label} --no-reset`;
}

function clusterMarkdown(cluster: FailureCluster, result: PersonaResult, productPromise: string): string {
  return `# ${cluster.title}

- Severity: ${cluster.severity}
- Affected users: ${cluster.count}
- Product promise: ${productPromise}
- Representative persona: ${result.persona.id} ${result.persona.archetype}

## Expected

${cluster.representative.expected}

## Actual

${cluster.representative.actual}

## Observed Steps

${result.observations.map((observation) => `- ${observation}`).join("\n")}

## Replay

\`\`\`bash
${cluster.representative.replayCommand ?? cluster.replayCommands[0] ?? ""}
\`\`\`

## Screenshot

${cluster.representative.screenshotPath ?? "No screenshot captured."}

## Notes

Patch the application root cause. Do not weaken the eval or persona expectations.
`;
}

function summaryMarkdown(report: EvalReport): string {
  const { summary } = report;
  return `# Hundred Tiny Users Run Summary

- Run ID: ${summary.runId}
- Product promise: A hackathon project submission portal
- URL: ${summary.url}
- Label: ${summary.label}
- Started: ${summary.startedAt}
- Finished: ${summary.finishedAt}
- Score: ${summary.passed}/${summary.total} passed (${summary.scorePercent}%)

## Failure Clusters

${summary.clusters.length === 0 ? "No failures clustered." : summary.clusters.map((cluster) => `- ${cluster.count} x ${cluster.title} (${cluster.severity})`).join("\n")}

## Persona Results

${report.results.map((result) => `- ${result.status.toUpperCase()} ${result.persona.id} ${result.persona.archetype}${result.failure ? ` - ${result.failure.kind}` : ""}`).join("\n")}
`;
}

export async function writeReport(report: EvalReport): Promise<string> {
  const runDir = path.join(RUNS_DIR, report.summary.runId);
  const bugDir = path.join(runDir, "bug-reports");
  const screenshotDir = path.join(runDir, "screenshots");
  await fs.mkdir(bugDir, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  await fs.writeFile(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(runDir, "summary.md"), summaryMarkdown(report), "utf8");
  await fs.writeFile(LATEST_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const cluster of report.summary.clusters) {
    const representative = report.results.find((result) => result.failure?.kind === cluster.kind);
    if (representative) {
      await fs.writeFile(path.join(bugDir, `${cluster.kind}.md`), clusterMarkdown(cluster, representative, "A hackathon project submission portal"), "utf8");
    }
  }

  return runDir;
}
