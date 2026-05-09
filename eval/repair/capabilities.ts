import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepairCapability, RepairHarness } from "./types";

const execFileAsync = promisify(execFile);

async function commandPath(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("command", ["-v", command], { shell: true });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed.split("\n")[0] : undefined;
  } catch {
    return undefined;
  }
}

async function commandVersion(command: string): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(command, ["--version"], { timeout: 3000 });
    const output = `${stdout}${stderr}`.trim();
    return output.length > 0 ? output.split("\n")[0] : undefined;
  } catch {
    return undefined;
  }
}

async function probeCommand(harness: RepairHarness, command: string, notes: string[]): Promise<RepairCapability> {
  const executablePath = await commandPath(command);
  if (!executablePath) {
    return {
      harness,
      command,
      installed: false,
      notes: [`${command} was not found on PATH.`, ...notes]
    };
  }

  return {
    harness,
    command,
    installed: true,
    executablePath,
    version: await commandVersion(command),
    notes
  };
}

export async function probeRepairCapabilities(): Promise<RepairCapability[]> {
  const codex = await probeCommand("codex", "codex", [
    "Uses the authenticated local Codex CLI session when repair execution is explicitly enabled."
  ]);
  const cursorAgent = await probeCommand("cursor", "agent", [
    "Preferred Cursor repair command for this prototype."
  ]);

  if (cursorAgent.installed) {
    return [codex, cursorAgent];
  }

  const cursorAgentFallback = await probeCommand("cursor", "cursor-agent", [
    "Fallback Cursor command. Direct edit flags should only be used inside a disposable worktree."
  ]);
  return [codex, cursorAgentFallback];
}
