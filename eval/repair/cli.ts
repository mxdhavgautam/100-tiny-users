import type { RepairCliOptions, RepairHarness, RepairMode } from "./types";

function parseHarness(value: string): RepairHarness[] {
  if (value === "codex") {
    return ["codex"];
  }
  if (value === "cursor") {
    return ["cursor"];
  }
  if (value === "all") {
    return ["codex", "cursor"];
  }
  throw new Error(`Unsupported repair harness: ${value}`);
}

export function parseRepairArgs(argv: string[]): RepairCliOptions {
  let mode: RepairMode = "dry-run";
  let harnesses: RepairHarness[] = ["codex", "cursor"];
  let worktreePath: string | undefined;
  let forceAgent = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if ((token === "--harness" || token === "--agent") && next) {
      harnesses = parseHarness(next);
      index += 1;
    } else if (token === "--execute") {
      mode = "execute";
    } else if (token === "--dry-run" || token === "--prompt" || (token === "--mode" && next === "prompt")) {
      mode = "dry-run";
      if (token === "--mode") {
        index += 1;
      }
    } else if (token === "--mode" && next === "demo") {
      mode = "dry-run";
      index += 1;
    } else if (token === "--worktree" && next) {
      worktreePath = next;
      index += 1;
    } else if (token === "--force-agent") {
      forceAgent = true;
    }
  }

  return { mode, harnesses, worktreePath, forceAgent };
}
