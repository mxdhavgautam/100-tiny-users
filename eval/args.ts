import type { UserExecutionKind } from "@/src/harnesses/types";

export type RunnerArgs = {
  url: string;
  urlProvided: boolean;
  count: number;
  label: string;
  configPath?: string;
  personaId?: string;
  cohortPath?: string;
  workflowId?: string;
  harness: UserExecutionKind;
  noReset: boolean;
};

export type PatcherArgs = {
  mode: "demo" | "prompt";
  all: boolean;
};

export function parseRunnerArgs(argv: string[]): RunnerArgs {
  const args: RunnerArgs = {
    url: "http://127.0.0.1:3000/portal",
    urlProvided: false,
    count: 50,
    label: "manual",
    harness: "deterministic-playwright",
    noReset: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--url" && next) {
      args.url = next;
      args.urlProvided = true;
      index += 1;
    } else if (token === "--count" && next) {
      args.count = Number.parseInt(next, 10);
      index += 1;
    } else if (token === "--label" && next) {
      args.label = next;
      index += 1;
    } else if (token === "--config" && next) {
      args.configPath = next;
      index += 1;
    } else if (token === "--persona" && next) {
      args.personaId = next;
      index += 1;
    } else if (token === "--cohort" && next) {
      args.cohortPath = next;
      index += 1;
    } else if (token === "--workflow" && next) {
      args.workflowId = next;
      index += 1;
    } else if (
      token === "--harness" &&
      next &&
      (next === "deterministic-playwright" || next === "semantic-mini-user" || next === "external-webhook")
    ) {
      args.harness = next;
      index += 1;
    } else if (token === "--no-reset") {
      args.noReset = true;
    }
  }

  return args;
}

export function parsePatcherArgs(argv: string[]): PatcherArgs {
  let mode: "demo" | "prompt" = "prompt";
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--mode" && (next === "demo" || next === "prompt")) {
      mode = next;
      index += 1;
    } else if (token === "--all") {
      all = true;
    }
  }

  return { mode, all };
}
