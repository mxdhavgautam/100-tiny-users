import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { parseRunnerArgs } from "./args";
import { clusterFailures } from "./cluster";
import { buildPersonas, findPersona } from "./personas";
import { replayCommand, writeReport } from "./reporting";
import { submissionForPersona } from "./submissionData";
import type { EvalReport, Failure, Persona, PersonaResult } from "../src/lib/types";

type OverflowResult = {
  documentOverflow: boolean;
  itemOverflow: boolean;
};

export type ColonyProgress = {
  runId: string;
  label: string;
  url: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
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

async function maybeReset(url: string): Promise<void> {
  const resetUrl = new URL("/api/submissions/reset", url).toString();
  await fetch(resetUrl, { method: "POST" });
}

async function applyNetworkProfile(context: BrowserContext, persona: Persona): Promise<void> {
  if (persona.networkProfile === "normal") {
    return;
  }
  await context.route("**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, persona.networkProfile === "slow-3g" ? 180 : 80));
    await route.continue();
  });
}

function makeFailure(kind: Failure["kind"], replay: string, details?: Partial<Failure>): Failure {
  const table: Record<Failure["kind"], Failure> = {
    "duplicate-team-overwrite": {
      kind,
      title: "Duplicate team names overwrite previous submission",
      severity: "critical",
      expected: "Duplicate team submissions should be rejected with a clear message.",
      actual: "The duplicate submission was accepted, allowing a previous team record to be overwritten."
    },
    "screen-reader-submit-not-found": {
      kind,
      title: "Screen-reader users cannot find the submit button",
      severity: "high",
      expected: "The submit button should have an accessible name such as Submit project.",
      actual: "Role-based lookup could not find a named submit button.",
      selector: "role=button[name=/submit project|submit/i]"
    },
    "long-text-layout-overflow": {
      kind,
      title: "Long idea text breaks the recent-submission layout",
      severity: "medium",
      expected: "Massive pasted text should wrap inside the recent submissions panel.",
      actual: "The document or idea text element overflowed horizontally."
    },
    "xss-executed": {
      kind,
      title: "Malicious submission text executed script",
      severity: "critical",
      expected: "Submitted text should render as inert text.",
      actual: "The page exposed window.__HTU_XSS after malicious input."
    },
    "submission-rejected": {
      kind,
      title: "Normal submission was rejected",
      severity: "medium",
      expected: "A valid first submission should be accepted.",
      actual: "The portal rejected a valid browser submission."
    },
    "unexpected-error": {
      kind,
      title: "Unexpected browser run error",
      severity: "medium",
      expected: "The persona should complete the browser goal.",
      actual: "The run raised an unexpected exception."
    }
  };
  return { ...table[kind], ...details, replayCommand: replay };
}

async function submit(page: Page, persona: Persona): Promise<void> {
  if (persona.assistiveTech === "screen-reader") {
    await page.getByRole("button", { name: /submit project|submit/i }).click({ timeout: 1800 });
  } else if (persona.assistiveTech === "keyboard-only") {
    await page.getByTestId("submit-project").focus();
    await page.keyboard.press("Enter");
  } else {
    await page.getByTestId("submit-project").click();
  }
}

async function overflowState(page: Page): Promise<OverflowResult> {
  return page.evaluate(() => {
    const documentOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 12;
    const items = [...document.querySelectorAll<HTMLElement>(".ideaText")];
    const itemOverflow = items.some((item) => item.scrollWidth > item.clientWidth + 12);
    return { documentOverflow, itemOverflow };
  });
}

async function runPersona(browser: Browser, persona: Persona, url: string, currentRunId: string): Promise<PersonaResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const observations: string[] = [];
  const replay = replayCommand(url, persona.id, persona.id);
  const context = await browser.newContext({ viewport: persona.viewport });
  await applyNetworkProfile(context, persona);
  const page = await context.newPage();
  const screenshotPath = path.join("artifacts", "runs", currentRunId, "screenshots", `${persona.id}.png`);

  try {
    const data = submissionForPersona(persona);
    observations.push(`Opened ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: persona.patienceMs });
    await page.getByTestId("portal-hydrated").waitFor({ state: "attached", timeout: persona.patienceMs });
    await page.waitForFunction(
      () => document.querySelector("[data-testid='portal-hydrated']")?.getAttribute("data-ready") === "true",
      null,
      { timeout: persona.patienceMs }
    );
    await page.getByLabel("Team name").fill(data.teamName);
    await page.getByLabel("Contact email").fill(data.contactEmail);
    await page.getByLabel("Project title").fill(data.projectTitle);
    await page.getByLabel("Primary language").selectOption({ label: data.primaryLanguage });
    await page.getByLabel("Project idea").fill(data.projectIdea);
    observations.push(`Filled form as ${data.teamName}`);
    await submit(page, persona);
    observations.push("Submitted through visible or accessible UI");
    await page.waitForFunction(
      () => {
        const node = document.querySelector("[data-testid='submission-status']");
        return Boolean(node?.textContent?.trim());
      },
      null,
      { timeout: persona.patienceMs }
    );
    const status = await page.getByTestId("submission-status").textContent({ timeout: persona.patienceMs });
    const statusText = status ?? "";
    observations.push(`Observed status: ${statusText}`);

    let failure: Failure | undefined;
    if (persona.expectsDuplicateBlocked && !/already has a submission|already exists|duplicate|edit it instead/i.test(statusText)) {
      failure = makeFailure("duplicate-team-overwrite", replay, { actual: `Status was: ${statusText}` });
    } else if (!persona.expectsDuplicateBlocked && !/submission received/i.test(statusText)) {
      failure = makeFailure("submission-rejected", replay, { actual: `Status was: ${statusText}` });
    }

    if (!failure && persona.textVolume === "massive") {
      const overflow = await overflowState(page);
      observations.push(`Overflow check: document=${overflow.documentOverflow}, item=${overflow.itemOverflow}`);
      if (overflow.documentOverflow || overflow.itemOverflow) {
        failure = makeFailure("long-text-layout-overflow", replay);
      }
    }

    if (!failure && persona.malicious) {
      const xss = await page.evaluate(() => Boolean((window as Window & { __HTU_XSS?: boolean }).__HTU_XSS));
      observations.push(`XSS sentinel: ${xss}`);
      if (xss) {
        failure = makeFailure("xss-executed", replay);
      }
    }

    if (failure) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      failure.screenshotPath = screenshotPath;
    }

    const finished = Date.now();
    await context.close();
    return {
      runId: currentRunId,
      persona,
      status: failure ? "failed" : "passed",
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      observations,
      failure
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = persona.assistiveTech === "screen-reader"
      ? makeFailure("screen-reader-submit-not-found", replay, { actual: message })
      : makeFailure("unexpected-error", replay, { actual: message });
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      failure.screenshotPath = screenshotPath;
    } catch {
      observations.push("Screenshot capture failed.");
    }
    const finished = Date.now();
    await context.close();
    return {
      runId: currentRunId,
      persona,
      status: "failed",
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      observations: [...observations, message],
      failure
    };
  }
}

export async function runColony(argv: string[] = process.argv.slice(2), options: RunColonyOptions = {}): Promise<EvalReport> {
  const args = parseRunnerArgs(argv);
  const currentRunId = runId(args.label);
  if (!args.noReset) {
    await maybeReset(args.url);
  }

  const personas = args.personaId ? [findPersona(args.count, args.personaId)].filter((persona): persona is Persona => persona !== null) : buildPersonas(args.count);
  if (personas.length === 0) {
    throw new Error(`No persona found for ${args.personaId ?? "selection"}`);
  }

  const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable() });
  const startedAt = new Date().toISOString();
  const results: PersonaResult[] = [];

  for (const persona of personas) {
    const result = await runPersona(browser, persona, args.url, currentRunId);
    results.push(result);
    const passedSoFar = results.filter((item) => item.status === "passed").length;
    await options.onProgress?.({
      runId: currentRunId,
      label: args.label,
      url: args.url,
      total: personas.length,
      completed: results.length,
      passed: passedSoFar,
      failed: results.length - passedSoFar,
      results: [...results]
    });
    const suffix = result.failure ? ` ${result.failure.kind}` : "";
    console.log(`${result.status.toUpperCase()} ${persona.id} ${persona.archetype}${suffix}`);
  }

  await browser.close();
  const finishedAt = new Date().toISOString();
  const passed = results.filter((result) => result.status === "passed").length;
  const clusters = clusterFailures(results);
  const report: EvalReport = {
    summary: {
      runId: currentRunId,
      label: args.label,
      url: args.url,
      startedAt,
      finishedAt,
      total: results.length,
      passed,
      failed: results.length - passed,
      scorePercent: Math.round((passed / results.length) * 100),
      clusters
    },
    results
  };

  await writeReport(report);
  console.log(`${report.summary.passed}/${report.summary.total} passed. ${report.summary.failed} failed.`);
  for (const cluster of clusters) {
    console.log(`- ${cluster.count} x ${cluster.title}`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runColony();
}
