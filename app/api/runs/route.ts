import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { ARTIFACTS_DIR } from "@/src/lib/paths";

export const runtime = "nodejs";

type LaunchMode = "suite" | "url";

type LaunchRequest =
  | { mode: "suite" }
  | { mode: "url"; targetUrl: string };

const LOCK_PATH = `${ARTIFACTS_DIR}/launcher.lock`;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLaunchRequest(value: unknown): LaunchRequest {
  if (!isObject(value) || (value.mode !== "suite" && value.mode !== "url")) {
    throw new Error("Choose a valid run mode.");
  }

  if (value.mode === "suite") {
    return { mode: "suite" };
  }

  if (typeof value.targetUrl !== "string") {
    throw new Error("Enter a target URL.");
  }

  const target = new URL(value.targetUrl);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http and https targets are supported.");
  }

  return { mode: "url", targetUrl: target.toString() };
}

async function readActiveLauncherPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(LOCK_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || typeof parsed.pid !== "number") {
      return null;
    }
    process.kill(parsed.pid, 0);
    return parsed.pid;
  } catch {
    return null;
  }
}

async function writeLauncherLock(pid: number, command: string[]): Promise<void> {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  await fs.writeFile(
    LOCK_PATH,
    `${JSON.stringify({ pid, command, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

async function clearLauncherLock(pid: number): Promise<void> {
  try {
    const raw = await fs.readFile(LOCK_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isObject(parsed) && parsed.pid === pid) {
      await fs.unlink(LOCK_PATH);
    }
  } catch {
    // The lock is best-effort; the next launch also validates stale PIDs.
  }
}

function commandFor(request: LaunchRequest): string[] {
  if (request.mode === "suite") {
    return ["bun", "eval/demo-full.ts"];
  }

  return [
    "bun",
    "eval/launched-url-run.ts",
    "--url",
    request.targetUrl,
    "--workflow",
    "submit-project",
    "--harness",
    "deterministic-playwright",
    "--count",
    "10",
    "--label",
    "browser-url-replay"
  ];
}

export async function POST(request: Request) {
  try {
    const activePid = await readActiveLauncherPid();
    if (activePid !== null) {
      return NextResponse.json({ ok: false, message: `A run is already active under PID ${activePid}.` }, { status: 409 });
    }

    const launchRequest = parseLaunchRequest(await request.json());
    const command = commandFor(launchRequest);
    const [binary, ...args] = command;
    if (!binary) {
      throw new Error("No launch command was created.");
    }
    const child = spawn(binary, args, {
      cwd: process.cwd(),
      detached: false,
      stdio: "ignore",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }
    });

    if (child.pid === undefined) {
      throw new Error("Run process did not start.");
    }
    const pid = child.pid;

    child.unref();
    await writeLauncherLock(pid, command);
    child.on("close", () => {
      void clearLauncherLock(pid);
    });

    return NextResponse.json({
      ok: true,
      pid,
      mode: launchRequest.mode,
      message: launchRequest.mode === "suite" ? "Started the bundled eval suite." : `Started a URL replay for ${launchRequest.targetUrl}.`
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to start run." },
      { status: 400 }
    );
  }
}
