import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { parseRunnerArgs } from "./args";
import { clusterFailures } from "./cluster";
import { buildPersonas, findPersona } from "./personas";
import { artifactRef, prepareRunArtifacts, writeCohortSnapshot, writeConfigSnapshot, writeReport } from "./reporting";
import { loadDemoHackathonConfig, loadTargetConfig, type TargetConfig } from "../src/lib/config";
import { harnessPreviews, userExecutionAdapters } from "../src/harnesses";
import type { UserExecutionResult } from "../src/harnesses/types";
import { persistAuditEvent, persistConfigSnapshot, persistRunMetadata } from "../src/lib/localPrototypeDb";
import type { ArtifactRef, EvalReport, Failure, OracleFinding, Persona, PersonaResult } from "../src/lib/types";

export type ColonyProgress = {
  runId: string;
  label: string;
  url: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  blocked: number;
  errored: number;
  results: PersonaResult[];
};

export type RunColonyOptions = {
  onProgress?: (progress: ColonyProgress) => Promise<void>;
};

function runId(label: string): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safe || "run"}-${stamp}`;
}

function chromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  return existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined;
}

function workflowUrl(config: TargetConfig, workflowRoute: string): string {
  return new URL(workflowRoute, config.baseUrl).toString();
}

async function readCohortPersonaIds(cohortPath: string): Promise<string[]> {
  const raw = await fs.readFile(cohortPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("personaIds" in parsed) ||
    !Array.isArray(parsed.personaIds) ||
    parsed.personaIds.some((value) => typeof value !== "string")
  ) {
    throw new Error(`Invalid cohort snapshot: ${cohortPath}`);
  }
  return parsed.personaIds;
}

function configFromUrl(config: TargetConfig, url: string): TargetConfig {
  const targetUrl = new URL(url);
  const origin = targetUrl.origin;
  const route = `${targetUrl.pathname}${targetUrl.search}`;
  const nextConfig: TargetConfig = {
    ...config,
    id: `${config.id}-url`,
    name: `${config.name} URL replay`,
    baseUrl: origin,
    allowedOrigins: [origin],
    reset: { kind: "disabled" },
    workflows: config.workflows.map((workflow, index) => index === 0
      ? {
          ...workflow,
          route,
          steps: workflow.steps.map((step) => step.action === "goto" ? { ...step, route } : step)
        }
      : workflow)
  };
  return nextConfig;
}

async function maybeResetConfigured(config: TargetConfig): Promise<void> {
  if (config.reset.kind !== "http") {
    return;
  }

  if (config.reset.dryRun) {
    await persistAuditEvent({
      action: "reset-dry-run",
      targetId: config.id,
      message: `Skipped configured reset for ${config.reset.url}.`
    });
    return;
  }

  const resetUrl = new URL(config.reset.url);
  if (!config.allowedOrigins.includes(resetUrl.origin)) {
    throw new Error(`Reset origin ${resetUrl.origin} is not allowed by config.`);
  }

  await fetch(resetUrl, { method: config.reset.method });
  await persistAuditEvent({
    action: "reset",
    targetId: config.id,
    message: `Called ${config.reset.method} ${config.reset.url}.`
  });
}

async function warmTarget(url: string): Promise<void> {
  try {
    await fetch(url);
  } catch {
    // Browser personas report reachability failures with artifacts; warmup is best-effort.
  }
}

function findingsFromFailure(failure: Failure | undefined): OracleFinding[] {
  if (!failure) {
    return [];
  }

  return [{
    id: failure.oracleId,
    title: failure.title,
    expected: failure.expected,
    actual: failure.actual,
    impact: failure.impact,
    confidence: failure.confidence,
    category: failure.category,
    evidence: (failure.artifactRefs ?? []).map((artifact) => artifact.path)
  }];
}

function personaResultFromExecution(runIdValue: string, workflowId: string, persona: Persona, execution: UserExecutionResult): PersonaResult {
  const finishedAt = new Date().toISOString();
  const startedAt = new Date(Date.now() - execution.usage.durationMs).toISOString();
  return {
    runId: runIdValue,
    workflowId,
    harnessKind: execution.kind,
    persona,
    status: execution.status,
    startedAt,
    finishedAt,
    durationMs: execution.usage.durationMs,
    observations: execution.observations.map((item) => `${item.type}${item.stepId ? `:${item.stepId}` : ""} ${item.message}`),
    artifactRefs: execution.artifacts,
    findings: findingsFromFailure(execution.failure),
    failure: execution.failure
  };
}

async function writeEffectiveConfigSnapshot(config: TargetConfig, runIdValue: string): Promise<ArtifactRef> {
  const runDir = path.join("artifacts", "runs", runIdValue, "config");
  await fs.mkdir(runDir, { recursive: true });
  const snapshotPath = path.join(runDir, "effective-config.json");
  await fs.writeFile(snapshotPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return artifactRef("config", snapshotPath, "Effective runner config snapshot.");
}

export async function runColony(argv: string[] = process.argv.slice(2), options: RunColonyOptions = {}): Promise<EvalReport> {
  const args = parseRunnerArgs(argv);
  const currentRunId = runId(args.label);
  const dirs = await prepareRunArtifacts(currentRunId);
  const baseConfig = args.configPath ? await loadTargetConfig(args.configPath) : await loadDemoHackathonConfig();
  const config = args.configPath || !args.urlProvided ? baseConfig : configFromUrl(baseConfig, args.url);
  const workflow = args.workflowId
    ? config.workflows.find((candidate) => candidate.id === args.workflowId)
    : config.workflows[0];
  if (!workflow) {
    throw new Error(args.workflowId ? `Target ${config.id} has no workflow ${args.workflowId}.` : `Target ${config.id} has no configured workflows.`);
  }

  const url = workflowUrl(config, workflow.route);
  const runArtifactRefs: ArtifactRef[] = [];
  runArtifactRefs.push(args.configPath ? await writeConfigSnapshot(args.configPath, dirs) : await writeEffectiveConfigSnapshot(config, currentRunId));
  const configSnapshot = await persistConfigSnapshot(config);
  await persistRunMetadata({
    id: currentRunId,
    configId: configSnapshot.id,
    label: args.label,
    status: "running"
  });

  if (!args.noReset) {
    await maybeResetConfigured(config);
  }
  await warmTarget(url);

  const personas = args.cohortPath
    ? (await readCohortPersonaIds(args.cohortPath))
      .map((personaId) => findPersona(args.count, personaId))
      .filter((persona): persona is Persona => persona !== null)
    : args.personaId
      ? [findPersona(args.count, args.personaId)].filter((persona): persona is Persona => persona !== null)
      : buildPersonas(args.count);
  if (personas.length === 0) {
    throw new Error(`No persona found for ${args.personaId ?? "selection"}`);
  }

  runArtifactRefs.push(await writeCohortSnapshot(dirs, personas.map((persona) => persona.id)));

  const selectedHarness = userExecutionAdapters[args.harness];
  if (!selectedHarness) {
    throw new Error(`User execution harness ${args.harness} is not registered.`);
  }

  const browser = args.harness === "external-webhook"
    ? undefined
    : await chromium.launch({ headless: true, executablePath: chromiumExecutable() });
  const startedAt = new Date().toISOString();
  const results: PersonaResult[] = [];

  for (const persona of personas) {
    const execution = await selectedHarness.execute({
      runId: currentRunId,
      target: config,
      workflow,
      persona,
      dirs,
      configPath: args.configPath,
      browser
    });
    const result = personaResultFromExecution(currentRunId, workflow.id, persona, execution);
    results.push(result);
    const passedSoFar = results.filter((item) => item.status === "passed").length;
    const blockedSoFar = results.filter((item) => item.status === "blocked").length;
    const erroredSoFar = results.filter((item) => item.status === "errored").length;
    const failedSoFar = results.filter((item) => item.status === "failed").length;
    await options.onProgress?.({
      runId: currentRunId,
      label: args.label,
      url,
      total: personas.length,
      completed: results.length,
      passed: passedSoFar,
      failed: failedSoFar,
      blocked: blockedSoFar,
      errored: erroredSoFar,
      results: [...results]
    });
    const suffix = result.failure ? ` ${result.failure.kind}` : "";
    console.log(`${result.status.toUpperCase()} ${persona.id} ${persona.archetype}${suffix}`);
  }

  await browser?.close();
  const finishedAt = new Date().toISOString();
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const blocked = results.filter((result) => result.status === "blocked").length;
  const errored = results.filter((result) => result.status === "errored").length;
  const unsuccessful = failed + blocked + errored;
  const report: EvalReport = {
    summary: {
      runId: currentRunId,
      label: args.label,
      url,
      artifactRefs: runArtifactRefs,
      startedAt,
      finishedAt,
      total: results.length,
      passed,
      failed,
      blocked,
      errored,
      scorePercent: Math.round((passed / results.length) * 100),
      clusters: clusterFailures(results)
    },
    results,
    config,
    harnessPreviews
  };

  await writeReport(report);
  await persistRunMetadata({
    id: currentRunId,
    configId: configSnapshot.id,
    label: args.label,
    status: unsuccessful === 0 ? "passed" : "failed"
  });
  console.log(`${report.summary.passed}/${report.summary.total} passed. ${unsuccessful} unsuccessful (${report.summary.failed} failed, ${report.summary.blocked} blocked, ${report.summary.errored} errored).`);
  for (const cluster of report.summary.clusters) {
    console.log(`- ${cluster.count} x ${cluster.title}`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runColony();
}
