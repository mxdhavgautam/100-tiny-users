import type { Browser } from "@playwright/test";
import type { RunArtifactDirs } from "@/eval/reporting";
import type { TargetConfig, WorkflowConfig } from "@/src/lib/config";
import type { ArtifactRef, Failure, Persona } from "@/src/lib/types";

export type UserExecutionKind = "deterministic-playwright" | "semantic-mini-user" | "external-webhook";

export type ObservationRecord = {
  at: string;
  type: "navigation" | "action" | "oracle" | "artifact" | "system";
  message: string;
  stepId?: string;
};

export type ReplayRecipe = {
  command: string;
  description: string;
};

export type HarnessUsage = {
  kind: UserExecutionKind;
  durationMs: number;
  steps: number;
};

export type UserExecutionRequest = {
  runId: string;
  target: TargetConfig;
  workflow: WorkflowConfig;
  persona: Persona;
  dirs: RunArtifactDirs;
  configPath?: string;
  browser?: Browser;
};

export type UserExecutionResult = {
  kind: UserExecutionKind;
  status: "passed" | "failed" | "blocked" | "errored";
  observations: ObservationRecord[];
  failure?: Failure;
  artifacts: ArtifactRef[];
  replay: ReplayRecipe;
  usage: HarnessUsage;
};

export type UserExecutionAdapter = {
  kind: UserExecutionKind;
  execute(request: UserExecutionRequest): Promise<UserExecutionResult>;
};

export type HarnessPreview = {
  kind: UserExecutionKind;
  status: "available" | "dry-run" | "disabled";
  summary: string;
};
