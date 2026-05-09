import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { EvalReport } from "../../src/lib/types";
import type { TargetConfig } from "../../src/lib/config";
import { probeRepairCapabilities } from "./capabilities";
import { validationCommands, writePromptPackets } from "./promptPackets";
import type {
  RepairCapability,
  RepairCliOptions,
  RepairCommandPlan,
  RepairExecution,
  RepairHarness,
  RepairPromptPacket,
  RepairRerunResult,
  RepairRunResult,
  ValidationCommandResult
} from "./types";

const VALIDATION_HOST = "127.0.0.1";
const VALIDATION_BASE_PORT = 3100;
const REPAIR_COMMIT_AUTHOR = "Hundred Tiny Users <repair@local.invalid>";
const TRANSIENT_REPAIR_PATHS = [
  ".next",
  "artifacts",
  "data",
  "node_modules",
  "tsconfig.tsbuildinfo"
] as const;

function repairId(runId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `repair-${runId}-${stamp}`;
}

function defaultWorktreePath(id: string): string {
  return path.join(os.tmpdir(), "hundred-tiny-users-repairs", id);
}

function worktreePathFor(basePath: string, harness: RepairHarness, harnessCount: number): string {
  if (harnessCount === 1) {
    return basePath;
  }
  return `${basePath}-${harness}`;
}

function shellQuote(token: string): string {
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(token)) {
    return token;
  }
  return `'${token.replaceAll("'", "'\\''")}'`;
}

export function commandString(command: string[]): string {
  return command.map(shellQuote).join(" ");
}

function capabilityFor(harness: RepairHarness, capabilities: RepairCapability[]): RepairCapability | undefined {
  return capabilities.find((capability) => capability.harness === harness);
}

function packetFor(plan: RepairCommandPlan, packets: RepairPromptPacket[]): RepairPromptPacket {
  const packet = packets.find((candidate) => candidate.id === plan.packetId && candidate.harness === plan.harness);
  if (!packet) {
    throw new Error(`No prompt packet generated for ${plan.harness} ${plan.clusterFingerprint}`);
  }
  return packet;
}

function repairCommand(harness: RepairHarness, command: string, worktreePath: string, promptPath: string, forceAgent: boolean): string[] {
  if (harness === "codex") {
    return [
      command,
      "exec",
      "--cd",
      worktreePath,
      "--sandbox",
      "workspace-write",
      "-"
    ];
  }

  const args = [
    command,
    "--print",
    "--output-format",
    "stream-json",
    "--model",
    "auto",
    "--trust",
    "--workspace",
    worktreePath
  ];

  if (forceAgent) {
    args.push("--force");
  }

  args.push(`Read ${promptPath} and implement the repair in this disposable worktree.`);
  return args;
}

function buildCommandPlans(
  options: RepairCliOptions,
  baseWorktreePath: string,
  capabilities: RepairCapability[],
  packets: RepairPromptPacket[]
): RepairCommandPlan[] {
  return packets.map((packet, index) => {
    const capability = capabilityFor(packet.harness, capabilities);
    const command = capability?.command ?? packet.harness;
    const available = capability?.installed ?? false;
    const worktreePath = worktreePathFor(`${baseWorktreePath}-${packet.id}`, packet.harness, packets.length);
    return {
      packetId: packet.id,
      harness: packet.harness,
      clusterFingerprint: packet.clusterFingerprint,
      clusterTitle: packet.clusterTitle,
      available,
      worktreePath,
      setupCommand: ["git", "worktree", "add", "--detach", worktreePath, "HEAD"],
      repairCommand: repairCommand(packet.harness, command, worktreePath, packet.path, options.forceAgent),
      promptPath: packet.path,
      dryRun: options.mode === "dry-run",
      notes: available ? (capability?.notes ?? []) : [`${command} is not installed; execution will be skipped.`]
    };
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isTransientRepairPath(filePath: string): boolean {
  return TRANSIENT_REPAIR_PATHS.some((candidate) => filePath === candidate || filePath.startsWith(`${candidate}/`));
}

function diffPathspecArgs(): string[] {
  return [
    "--",
    ".",
    ...TRANSIENT_REPAIR_PATHS.flatMap((candidate) => [`:(exclude)${candidate}`, `:(exclude)${candidate}/**`])
  ];
}

async function runCommand(command: string[], cwd: string, stdin?: string, stdoutPath?: string, stderrPath?: string): Promise<RepairExecution> {
  const [binary, ...args] = command;
  if (!binary) {
    return { harness: "codex", status: "failed", command, message: "No command binary supplied." };
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(binary, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });

  if (stdin) {
    child.stdin.write(stdin);
  }
  child.stdin.end();

  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const outcome = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
    child.on("error", (error) => resolve({ exitCode: null, signal: null, error }));
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });

  if (stdoutPath) {
    await fs.writeFile(stdoutPath, Buffer.concat(stdoutChunks));
  }
  if (stderrPath) {
    await fs.writeFile(stderrPath, Buffer.concat(stderrChunks));
  }

  return {
    harness: "codex",
    status: outcome.exitCode === 0 && !outcome.error ? "succeeded" : "failed",
    command,
    exitCode: outcome.exitCode ?? undefined,
    signal: outcome.signal ?? undefined,
    stdoutPath,
    stderrPath,
    message: outcome.error?.message
  };
}

async function runValidationCommand(command: string[], cwd: string, stdoutPath: string, stderrPath: string): Promise<ValidationCommandResult> {
  const execution = await runCommand(command, cwd, undefined, stdoutPath, stderrPath);
  return {
    command,
    status: execution.status === "succeeded" ? "succeeded" : "failed",
    exitCode: execution.exitCode,
    signal: execution.signal,
    stdoutPath,
    stderrPath,
    message: execution.message
  };
}

function uniquePersonaIds(report: EvalReport, predicate: (result: EvalReport["results"][number]) => boolean, limit: number): string[] {
  const ids = new Set<string>();
  for (const result of report.results) {
    if (!predicate(result)) {
      continue;
    }
    ids.add(result.persona.id);
    if (ids.size >= limit) {
      break;
    }
  }
  return [...ids];
}

async function writeCohortFile(filePath: string, personaIds: string[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ personaIds }, null, 2)}\n`, "utf8");
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Validation server did not become ready at ${url}`);
}

function configForPort(config: TargetConfig, port: number): TargetConfig {
  const origin = `http://${VALIDATION_HOST}:${port}`;
  const reset = config.reset.kind === "http"
    ? {
        ...config.reset,
        url: new URL(new URL(config.reset.url).pathname, origin).toString()
      }
    : config.reset;

  return {
    ...config,
    baseUrl: origin,
    allowedOrigins: [origin],
    reset
  };
}

async function writeValidationConfig(report: EvalReport, worktreePath: string, port: number): Promise<string> {
  const config = report.config;
  if (!config) {
    throw new Error("Repair orchestration requires a config snapshot on the baseline report.");
  }

  const configPath = path.join(worktreePath, "artifacts", "repair-validation-config.json");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(configForPort(config, port), null, 2)}\n`, "utf8");
  return configPath;
}

async function changedFiles(worktreePath: string): Promise<string[]> {
  const stdoutPath = path.join(worktreePath, "artifacts", "repair", "git-status.stdout.log");
  const stderrPath = path.join(worktreePath, "artifacts", "repair", "git-status.stderr.log");
  await fs.mkdir(path.dirname(stdoutPath), { recursive: true });
  const result = await runCommand(["git", "status", "--short"], worktreePath, undefined, stdoutPath, stderrPath);
  if (result.status !== "succeeded" || !stdoutPath) {
    return [];
  }

  const raw = await fs.readFile(stdoutPath, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)?.trim() ?? rawPath : rawPath;
      return renamedPath;
    })
    .filter((filePath) => !isTransientRepairPath(filePath));
}

async function writeDiffArtifact(worktreePath: string, outputPath: string): Promise<string | undefined> {
  const stdoutPath = `${outputPath}.stdout.log`;
  const stderrPath = `${outputPath}.stderr.log`;
  const result = await runCommand(["git", "diff", "--binary", ...diffPathspecArgs()], worktreePath, undefined, stdoutPath, stderrPath);
  if (!stdoutPath || result.status !== "succeeded") {
    return undefined;
  }

  const diff = await fs.readFile(stdoutPath, "utf8");
  if (diff.trim().length === 0) {
    return undefined;
  }

  await fs.writeFile(outputPath, diff, "utf8");
  return outputPath;
}

function validationPortFor(harness: RepairHarness): number {
  return harness === "codex" ? VALIDATION_BASE_PORT : VALIDATION_BASE_PORT + 1;
}

function replayTarget(report: EvalReport): { workflowId?: string; harnessKind?: EvalReport["results"][number]["harnessKind"] } {
  const firstResult = report.results[0];
  return {
    workflowId: firstResult?.workflowId,
    harnessKind: firstResult?.harnessKind
  };
}

async function runEvalRerun(
  worktreePath: string,
  report: EvalReport,
  configPath: string,
  cohortPath: string,
  label: RepairRerunResult["label"],
  artifactPath: string
): Promise<RepairRerunResult> {
  const replay = replayTarget(report);
  const command = [
    "bun",
    "run",
    "eval",
    "--",
    "--config",
    configPath,
    "--label",
    label,
    "--count",
    String(report.summary.total)
  ];
  if (replay.workflowId) {
    command.push("--workflow", replay.workflowId);
  }
  if (replay.harnessKind) {
    command.push("--harness", replay.harnessKind);
  }
  command.push("--cohort", cohortPath);
  const stdoutPath = `${artifactPath}.stdout.log`;
  const stderrPath = `${artifactPath}.stderr.log`;
  const result = await runCommand(command, worktreePath, undefined, stdoutPath, stderrPath);
  if (result.status !== "succeeded") {
    throw new Error(`Validation rerun ${label} failed. See ${stderrPath}`);
  }

  const latestReportPath = path.join(worktreePath, "artifacts", "latest-report.json");
  const latestRaw = await fs.readFile(latestReportPath, "utf8");
  await fs.writeFile(artifactPath, latestRaw, "utf8");
  const latest = JSON.parse(latestRaw) as EvalReport;
  return {
    label,
    cohortPath,
    reportPath: artifactPath,
    runId: latest.summary.runId,
    passed: latest.summary.passed,
    total: latest.summary.total,
    failed: latest.summary.failed,
    blocked: latest.summary.blocked,
    errored: latest.summary.errored
  };
}

async function validatePatchedWorktree(
  plan: RepairCommandPlan,
  worktreePath: string,
  report: EvalReport,
  runDir: string
): Promise<{ validationResults: ValidationCommandResult[]; reruns: RepairRerunResult[] }> {
  if (!report.config) {
    throw new Error("Repair validation requires the baseline report config snapshot.");
  }
  const repairDir = path.join(runDir, "repair");
  const port = validationPortFor(plan.harness);
  const configPath = await writeValidationConfig(report, worktreePath, port);
  const validationResults: ValidationCommandResult[] = [];
  const validationConfig = configForPort(report.config, port);

  const validationCommandsToRun: string[][] = [
    ["bun", "run", "typecheck"],
    ["bun", "run", "build"]
  ];

  for (const [index, command] of validationCommandsToRun.entries()) {
    validationResults.push(
      await runValidationCommand(
        command,
        worktreePath,
        path.join(repairDir, `${plan.harness}-${plan.packetId}-validation-${index}.stdout.log`),
        path.join(repairDir, `${plan.harness}-${plan.packetId}-validation-${index}.stderr.log`)
      )
    );
    if (validationResults.at(-1)?.status !== "succeeded") {
      return { validationResults, reruns: [] };
    }
  }

  const server = spawn("bun", ["x", "next", "start", "--hostname", VALIDATION_HOST, "--port", String(port)], {
    cwd: worktreePath,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const serverStdoutPath = path.join(repairDir, `${plan.harness}-${plan.packetId}-server.stdout.log`);
  const serverStderrPath = path.join(repairDir, `${plan.harness}-${plan.packetId}-server.stderr.log`);
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  server.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  server.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  try {
    await waitForServer(`${validationConfig.baseUrl}${validationConfig.workflows[0]?.route ?? "/portal"}`);
    const failedIds = uniquePersonaIds(report, (result) => result.status !== "passed", 12);
    const controlIds = uniquePersonaIds(report, (result) => result.status === "passed", 8);
    const failedCohortPath = path.join(repairDir, `${plan.harness}-${plan.packetId}-failed-cohort.json`);
    const controlCohortPath = path.join(repairDir, `${plan.harness}-${plan.packetId}-control-cohort.json`);
    await writeCohortFile(failedCohortPath, failedIds);
    await writeCohortFile(controlCohortPath, controlIds);

    const reruns: RepairRerunResult[] = [];
    if (failedIds.length > 0) {
      reruns.push(
        await runEvalRerun(
          worktreePath,
          report,
          configPath,
          failedCohortPath,
          "failed-replay",
          path.join(repairDir, `${plan.harness}-${plan.packetId}-failed-replay-report.json`)
        )
      );
    }
    if (controlIds.length > 0) {
      reruns.push(
        await runEvalRerun(
          worktreePath,
          report,
          configPath,
          controlCohortPath,
          "control",
          path.join(repairDir, `${plan.harness}-${plan.packetId}-control-report.json`)
        )
      );
    }
    return { validationResults, reruns };
  } finally {
    server.kill("SIGTERM");
    await fs.writeFile(serverStdoutPath, Buffer.concat(stdoutChunks));
    await fs.writeFile(serverStderrPath, Buffer.concat(stderrChunks));
  }
}

async function ensureWorktree(plan: RepairCommandPlan, runDir: string): Promise<RepairExecution | null> {
  if (await pathExists(plan.worktreePath)) {
    return null;
  }

  await fs.mkdir(path.dirname(plan.worktreePath), { recursive: true });
  const stdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-worktree.stdout.log`);
  const stderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-worktree.stderr.log`);
  const execution = await runCommand(plan.setupCommand, process.cwd(), undefined, stdoutPath, stderrPath);
  return { ...execution, harness: plan.harness };
}

async function installWorktreeDependencies(plan: RepairCommandPlan, runDir: string): Promise<RepairExecution | null> {
  const nodeModulesPath = path.join(plan.worktreePath, "node_modules");
  if (await pathExists(nodeModulesPath)) {
    return null;
  }

  const stdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-install.stdout.log`);
  const stderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-install.stderr.log`);
  const execution = await runCommand(["bun", "install", "--frozen-lockfile"], plan.worktreePath, undefined, stdoutPath, stderrPath);
  return { ...execution, harness: plan.harness };
}

async function syncWorkspaceIntoWorktree(plan: RepairCommandPlan, runDir: string): Promise<RepairExecution> {
  const stdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-sync.stdout.log`);
  const stderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-sync.stderr.log`);
  const command = [
    "rsync",
    "-a",
    "--delete",
    "--exclude",
    ".git",
    "--exclude",
    "node_modules",
    "--exclude",
    ".next",
    "--exclude",
    "artifacts",
    "--exclude",
    "data",
    "./",
    `${plan.worktreePath}/`
  ];
  const execution = await runCommand(command, process.cwd(), undefined, stdoutPath, stderrPath);
  return { ...execution, harness: plan.harness };
}

async function snapshotSynchronizedBaseline(plan: RepairCommandPlan, runDir: string): Promise<RepairExecution[]> {
  const statusStdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-baseline-status.stdout.log`);
  const statusStderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-baseline-status.stderr.log`);
  const statusResult = await runCommand(["git", "status", "--short"], plan.worktreePath, undefined, statusStdoutPath, statusStderrPath);
  const executions: RepairExecution[] = [{ ...statusResult, harness: plan.harness }];
  if (statusResult.status !== "succeeded" || !statusStdoutPath) {
    return executions;
  }

  const raw = await fs.readFile(statusStdoutPath, "utf8");
  if (raw.trim().length === 0) {
    return executions;
  }

  const addStdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-baseline-add.stdout.log`);
  const addStderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-baseline-add.stderr.log`);
  const addResult = await runCommand(["git", "add", "-A"], plan.worktreePath, undefined, addStdoutPath, addStderrPath);
  executions.push({ ...addResult, harness: plan.harness });
  if (addResult.status !== "succeeded") {
    return executions;
  }

  const commitStdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-baseline-commit.stdout.log`);
  const commitStderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}-baseline-commit.stderr.log`);
  const commitResult = await runCommand(
    [
      "git",
      "-c",
      `user.name=${REPAIR_COMMIT_AUTHOR.split(" <")[0]}`,
      "-c",
      "user.email=repair@local.invalid",
      "commit",
      "-m",
      "Repair baseline snapshot"
    ],
    plan.worktreePath,
    undefined,
    commitStdoutPath,
    commitStderrPath
  );
  executions.push({ ...commitResult, harness: plan.harness });
  return executions;
}

async function executePlan(plan: RepairCommandPlan, packet: RepairPromptPacket, runDir: string): Promise<RepairExecution[]> {
  if (!plan.available) {
    return [{
      harness: plan.harness,
      status: "skipped",
      command: plan.repairCommand,
      message: `${plan.repairCommand[0] ?? plan.harness} is not installed.`
    }];
  }

  const setup = await ensureWorktree(plan, runDir);
  if (setup && setup.status !== "succeeded") {
    return [setup];
  }

  const sync = await syncWorkspaceIntoWorktree(plan, runDir);
  if (sync.status !== "succeeded") {
    return [...(setup ? [setup] : []), sync];
  }

  const install = await installWorktreeDependencies(plan, runDir);
  if (install && install.status !== "succeeded") {
    return [...(setup ? [setup] : []), sync, install];
  }

  const baselineSnapshot = await snapshotSynchronizedBaseline(plan, runDir);
  const failedBaselineExecution = baselineSnapshot.find((execution) => execution.status !== "succeeded");
  if (failedBaselineExecution) {
    return [...(setup ? [setup] : []), sync, ...(install ? [install] : []), ...baselineSnapshot];
  }

  const stdoutPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}.stdout.log`);
  const stderrPath = path.join(runDir, "repair", `${plan.harness}-${plan.packetId}.stderr.log`);
  const repair = await runCommand(plan.repairCommand, plan.worktreePath, packet.prompt, stdoutPath, stderrPath);
  return [...(setup ? [setup] : []), sync, ...(install ? [install] : []), ...baselineSnapshot, { ...repair, harness: plan.harness }];
}

export async function orchestrateRepair(report: EvalReport, runDir: string, options: RepairCliOptions): Promise<RepairRunResult> {
  const id = repairId(report.summary.runId);
  const baseWorktreePath = options.worktreePath ?? defaultWorktreePath(id);
  const capabilities = await probeRepairCapabilities();
  const packets = await writePromptPackets(report, runDir, options.harnesses);
  const commands = buildCommandPlans(options, baseWorktreePath, capabilities, packets);
  const executions: RepairExecution[] = [];
  const validationResults: ValidationCommandResult[] = [];
  const reruns: RepairRerunResult[] = [];
  const changedFileSet = new Set<string>();
  let diffPath: string | undefined;

  if (options.mode === "execute") {
    for (const plan of commands) {
      const planExecutions = await executePlan(plan, packetFor(plan, packets), runDir);
      executions.push(...planExecutions);
      const latestExecution = [...planExecutions].reverse().find((execution) => execution.harness === plan.harness && execution.command.join(" ") === plan.repairCommand.join(" "));
      if (!latestExecution || latestExecution.status !== "succeeded") {
        continue;
      }

      const planChangedFiles = await changedFiles(plan.worktreePath);
      for (const changedFile of planChangedFiles) {
        changedFileSet.add(changedFile);
      }

      const harnessDiffPath = await writeDiffArtifact(plan.worktreePath, path.join(runDir, "repair", `${plan.harness}-${plan.packetId}.diff`));
      if (!diffPath && harnessDiffPath) {
        diffPath = harnessDiffPath;
      }

      if (planChangedFiles.length === 0) {
        continue;
      }

      const validation = await validatePatchedWorktree(plan, plan.worktreePath, report, runDir);
      validationResults.push(...validation.validationResults);
      reruns.push(...validation.reruns);
    }
  } else {
    for (const plan of commands) {
      executions.push({
        harness: plan.harness,
        status: "skipped",
        command: plan.repairCommand,
        message: `Dry run only. Re-run with --execute to create ${plan.worktreePath} and invoke ${plan.harness}.`
      });
    }
  }

  return {
    repairId: id,
    baselineRunId: report.summary.runId,
    mode: options.mode,
    generatedAt: new Date().toISOString(),
    runDir,
    worktreePath: baseWorktreePath,
    selectedHarnesses: options.harnesses,
    capabilities,
    packets,
    commands,
    executions,
    validationCommands: validationCommands(report),
    validationResults,
    reruns,
    changedFiles: [...changedFileSet],
    diffPath
  };
}
