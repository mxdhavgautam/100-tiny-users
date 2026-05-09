import { promises as fs } from "node:fs";
import path from "node:path";
import { ARTIFACTS_DIR, LATEST_REPORT_PATH, RUNS_DIR } from "../src/lib/paths";
import type { ArtifactRef, EvalReport, FailureCluster, PersonaResult } from "../src/lib/types";

export type RunArtifactDirs = {
  runDir: string;
  bugDir: string;
  screenshotDir: string;
  traceDir: string;
  consoleDir: string;
  networkDir: string;
  accessibilityDir: string;
  domDir: string;
  configDir: string;
};

export function replayCommand(input: { url: string; configPath?: string; personaId: string; label: string }): string {
  if (input.configPath) {
    return `bun run eval -- --config ${input.configPath} --persona ${input.personaId} --label replay-${input.label} --no-reset`;
  }
  return `bun run eval -- --url ${input.url} --persona ${input.personaId} --label replay-${input.label} --no-reset`;
}

function clusterMarkdown(cluster: FailureCluster, result: PersonaResult, productPromise: string): string {
  const artifactRefs = result.artifactRefs ?? [];
  const artifactLines = artifactRefs.length === 0
    ? "No structured artifacts captured."
    : artifactRefs.map((artifact) => `- ${artifact.kind}: ${artifact.path} - ${artifact.description}`).join("\n");

  return `# ${cluster.title}

- Severity: ${cluster.severity}
- Oracle: ${cluster.oracleId}
- Confidence: ${cluster.confidence}
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

## Artifacts

${artifactLines}

## Notes

Patch the application root cause. Do not weaken the eval or persona expectations.
`;
}

function summaryMarkdown(report: EvalReport): string {
  const { summary } = report;
  const runArtifactRefs = summary.artifactRefs ?? [];
  return `# Hundred Tiny Users Run Summary

- Run ID: ${summary.runId}
- Product promise: A hackathon project submission portal
- URL: ${summary.url}
- Label: ${summary.label}
- Started: ${summary.startedAt}
- Finished: ${summary.finishedAt}
- Score: ${summary.passed}/${summary.total} passed (${summary.scorePercent}%)
- Unsuccessful: ${summary.failed} failed, ${summary.blocked} blocked, ${summary.errored} errored

## Run Artifacts

${runArtifactRefs.length === 0 ? "No run-level artifacts captured." : runArtifactRefs.map((artifact) => `- ${artifact.kind}: ${artifact.path} - ${artifact.description}`).join("\n")}

## Failure Clusters

${summary.clusters.length === 0 ? "No failures clustered." : summary.clusters.map((cluster) => `- ${cluster.count} x ${cluster.title} (${cluster.severity})`).join("\n")}

## Persona Results

${report.results.map((result) => `- ${result.status.toUpperCase()} ${result.persona.id} ${result.persona.archetype}${result.failure ? ` - ${result.failure.kind}` : ""}`).join("\n")}
`;
}

export function artifactRef(kind: ArtifactRef["kind"], filePath: string, description: string): ArtifactRef {
  return { kind, path: filePath, description };
}

export function runArtifactDirs(runId: string): RunArtifactDirs {
  const runDir = path.join(RUNS_DIR, runId);
  return {
    runDir,
    bugDir: path.join(runDir, "bug-reports"),
    screenshotDir: path.join(runDir, "screenshots"),
    traceDir: path.join(runDir, "traces"),
    consoleDir: path.join(runDir, "console"),
    networkDir: path.join(runDir, "network"),
    accessibilityDir: path.join(runDir, "accessibility"),
    domDir: path.join(runDir, "dom"),
    configDir: path.join(runDir, "config")
  };
}

export async function prepareRunArtifacts(runId: string): Promise<RunArtifactDirs> {
  const dirs = runArtifactDirs(runId);
  await fs.mkdir(dirs.bugDir, { recursive: true });
  await fs.mkdir(dirs.screenshotDir, { recursive: true });
  await fs.mkdir(dirs.traceDir, { recursive: true });
  await fs.mkdir(dirs.consoleDir, { recursive: true });
  await fs.mkdir(dirs.networkDir, { recursive: true });
  await fs.mkdir(dirs.accessibilityDir, { recursive: true });
  await fs.mkdir(dirs.domDir, { recursive: true });
  await fs.mkdir(dirs.configDir, { recursive: true });
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  return dirs;
}

export async function writeConfigSnapshot(configPath: string, dirs: RunArtifactDirs): Promise<ArtifactRef> {
  const snapshotPath = path.join(dirs.configDir, "config-snapshot.json");
  const raw = await fs.readFile(configPath, "utf8");
  await fs.writeFile(snapshotPath, raw, "utf8");
  return artifactRef("config", snapshotPath, `Runner config snapshot from ${configPath}`);
}

export async function writeCohortSnapshot(dirs: RunArtifactDirs, personaIds: string[]): Promise<ArtifactRef> {
  const cohortPath = path.join(dirs.configDir, "cohort.json");
  await fs.writeFile(cohortPath, `${JSON.stringify({ personaIds }, null, 2)}\n`, "utf8");
  return artifactRef("cohort", cohortPath, "Frozen persona cohort for before and after reruns.");
}

export async function writeReport(report: EvalReport): Promise<string> {
  const dirs = await prepareRunArtifacts(report.summary.runId);
  const { runDir, bugDir } = dirs;

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
