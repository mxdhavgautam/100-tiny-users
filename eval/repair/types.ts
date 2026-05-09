import type { FailureKind, FailureSeverity } from "../../src/lib/types";

export type RepairHarness = "codex" | "cursor";

export type RepairMode = "dry-run" | "execute";

export type RepairCapability = {
  harness: RepairHarness;
  command: string;
  installed: boolean;
  version?: string;
  executablePath?: string;
  notes: string[];
};

export type RepairCluster = {
  fingerprint: string;
  kind: FailureKind;
  title: string;
  severity: FailureSeverity;
  count: number;
  personaIds: string[];
  replayCommands: string[];
  expected: string;
  actual: string;
  screenshotPath?: string;
};

export type RepairPromptPacket = {
  id: string;
  harness: RepairHarness;
  clusterFingerprint: string;
  clusterTitle: string;
  path: string;
  prompt: string;
};

export type ValidationCommandResult = {
  command: string[];
  status: "succeeded" | "failed";
  exitCode?: number;
  signal?: string;
  stdoutPath?: string;
  stderrPath?: string;
  message?: string;
};

export type RepairRerunResult = {
  label: "failed-replay" | "control";
  cohortPath: string;
  reportPath: string;
  runId: string;
  passed: number;
  total: number;
  failed: number;
  blocked: number;
  errored: number;
};

export type RepairCommandPlan = {
  packetId: string;
  harness: RepairHarness;
  clusterFingerprint: string;
  clusterTitle: string;
  available: boolean;
  worktreePath: string;
  setupCommand: string[];
  repairCommand: string[];
  promptPath: string;
  dryRun: boolean;
  notes: string[];
};

export type RepairExecutionStatus = "skipped" | "succeeded" | "failed";

export type RepairExecution = {
  harness: RepairHarness;
  status: RepairExecutionStatus;
  command: string[];
  exitCode?: number;
  signal?: string;
  stdoutPath?: string;
  stderrPath?: string;
  message?: string;
};

export type RepairRunResult = {
  repairId: string;
  baselineRunId: string;
  mode: RepairMode;
  generatedAt: string;
  runDir: string;
  worktreePath: string;
  selectedHarnesses: RepairHarness[];
  capabilities: RepairCapability[];
  packets: RepairPromptPacket[];
  commands: RepairCommandPlan[];
  executions: RepairExecution[];
  validationCommands: string[];
  validationResults: ValidationCommandResult[];
  reruns: RepairRerunResult[];
  changedFiles: string[];
  diffPath?: string;
};

export type RepairCliOptions = {
  mode: RepairMode;
  harnesses: RepairHarness[];
  worktreePath?: string;
  forceAgent: boolean;
};
