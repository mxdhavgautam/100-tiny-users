import { promises as fs } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, ConsoleMessage, Locator, Page, Request, Response } from "@playwright/test";
import type { WorkflowStepConfig } from "@/src/lib/config";
import type { ArtifactRef, Failure, Persona } from "@/src/lib/types";
import type { ObservationRecord, UserExecutionAdapter, UserExecutionRequest, UserExecutionResult } from "@/src/harnesses/types";
import { workflowInputsForPersona } from "@/src/harnesses/workflowInputs";
import { artifactRef, replayCommand, type RunArtifactDirs } from "../../eval/reporting";

type BrowserConsoleEvent = {
  timestamp: string;
  type: string;
  text: string;
};

type BrowserNetworkEvent = {
  timestamp: string;
  event: "request" | "response" | "requestfailed";
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  failureText?: string;
};

type WorkflowState = {
  stepId?: string;
};

type OverflowResult = {
  documentOverflow: boolean;
  itemOverflow: boolean;
};

function now(): string {
  return new Date().toISOString();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function observe(observations: ObservationRecord[], type: ObservationRecord["type"], message: string, stepId?: string): void {
  observations.push({ at: now(), type, message, stepId });
}

function consoleEvent(message: ConsoleMessage): BrowserConsoleEvent {
  return {
    timestamp: now(),
    type: message.type(),
    text: message.text()
  };
}

function requestEvent(request: Request): BrowserNetworkEvent {
  return {
    timestamp: now(),
    event: "request",
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType()
  };
}

function responseEvent(response: Response): BrowserNetworkEvent {
  const request = response.request();
  return {
    timestamp: now(),
    event: "response",
    url: response.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    status: response.status(),
    statusText: response.statusText()
  };
}

function requestFailedEvent(request: Request): BrowserNetworkEvent {
  return {
    timestamp: now(),
    event: "requestfailed",
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    failureText: request.failure()?.errorText
  };
}

async function writeJsonArtifact<T>(filePath: string, value: T): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function failureFor(
  kind: Failure["kind"],
  workflowId: string,
  replay: string,
  details?: Partial<Failure>
): Failure {
  const table: Record<Failure["kind"], Failure> = {
    "duplicate-team-overwrite": {
      kind,
      title: "Duplicate team names overwrite previous submission",
      severity: "critical",
      oracleId: "goal.duplicate-team-blocked",
      expected: "Duplicate team submissions should be rejected with a clear message.",
      actual: "The duplicate submission was accepted, allowing a previous team record to be overwritten.",
      impact: "Users can silently corrupt another team's submission state.",
      confidence: "certain-bug",
      category: "product-bug",
      workflowId
    },
    "screen-reader-submit-not-found": {
      kind,
      title: "Screen-reader users cannot find the submit button",
      severity: "high",
      oracleId: "a11y.submit-button-name",
      expected: "The submit button should have an accessible name such as Submit project.",
      actual: "Role-based lookup could not find a named submit button.",
      impact: "Assistive technology users cannot complete the core workflow.",
      confidence: "certain-bug",
      category: "product-bug",
      selector: "role=button[name=/submit project|submit/i]",
      workflowId
    },
    "long-text-layout-overflow": {
      kind,
      title: "Long idea text breaks the recent-submission layout",
      severity: "medium",
      oracleId: "layout.idea-wrap",
      expected: "Massive pasted text should wrap inside the recent submissions panel.",
      actual: "The document or idea text element overflowed horizontally.",
      impact: "Reviewers lose readable context and mobile layouts degrade.",
      confidence: "likely-bug",
      category: "product-bug",
      workflowId
    },
    "xss-executed": {
      kind,
      title: "Malicious submission text executed script",
      severity: "critical",
      oracleId: "security.submission-xss",
      expected: "Submitted text should render as inert text.",
      actual: "The page exposed window.__HTU_XSS after malicious input.",
      impact: "User-provided content can execute script in the browser session.",
      confidence: "certain-bug",
      category: "product-bug",
      workflowId
    },
    "submission-rejected": {
      kind,
      title: "Normal submission was rejected",
      severity: "medium",
      oracleId: "goal.valid-submission",
      expected: "A valid first submission should be accepted.",
      actual: "The portal rejected a valid browser submission.",
      impact: "A valid user cannot complete the primary flow.",
      confidence: "likely-bug",
      category: "product-bug",
      workflowId
    },
    "unexpected-error": {
      kind,
      title: "Unexpected browser run error",
      severity: "medium",
      oracleId: "system.unexpected-browser-error",
      expected: "The persona should complete the browser goal.",
      actual: "The run raised an unexpected exception.",
      impact: "The workflow outcome is no longer trustworthy without inspection.",
      confidence: "environment-issue",
      category: "harness-limitation",
      workflowId
    }
  };

  return { ...table[kind], ...details, replayCommand: replay };
}

function locatorFor(page: Page, step: WorkflowStepConfig): Locator | null {
  if (!step.locator) {
    return null;
  }

  switch (step.locator.kind) {
    case "role":
      return page.getByRole(step.locator.role as never, { name: new RegExp(step.locator.name, "i") });
    case "label":
      return page.getByLabel(step.locator.text);
    case "text":
      return page.getByText(step.locator.text);
    case "placeholder":
      return page.getByPlaceholder(step.locator.text);
    case "testId":
      return page.getByTestId(step.locator.value);
  }
}

function fallbackLocatorFor(page: Page, step: WorkflowStepConfig): Locator | null {
  if (!step.fallbackLocator) {
    return null;
  }

  switch (step.fallbackLocator.kind) {
    case "role":
      return page.getByRole(step.fallbackLocator.role as never, { name: new RegExp(step.fallbackLocator.name, "i") });
    case "label":
      return page.getByLabel(step.fallbackLocator.text);
    case "text":
      return page.getByText(step.fallbackLocator.text);
    case "placeholder":
      return page.getByPlaceholder(step.fallbackLocator.text);
    case "testId":
      return page.getByTestId(step.fallbackLocator.value);
  }
}

async function waitForWorkflowReady(page: Page, stepId: string, observations: ObservationRecord[]): Promise<void> {
  const sentinels = [
    '[data-testid="portal-hydrated"][data-ready="true"]',
    '[data-testid="workbench-hydrated"][data-ready="true"]'
  ];

  for (const sentinel of sentinels) {
    try {
      await page.locator(sentinel).waitFor({ state: "attached", timeout: 2000 });
      observe(observations, "system", `Observed workflow hydration sentinel ${sentinel}`, stepId);
      return;
    } catch {
      // Try the next supported sentinel.
    }
  }
}

async function summarizeSurface(page: Page): Promise<string> {
  const text = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
  return text.replace(/\s+/g, " ").slice(0, 240);
}

async function fillLocator(locator: Locator, value: string): Promise<void> {
  const tagName = await locator.evaluate((node) => node.tagName.toLowerCase());
  if (tagName === "select") {
    await locator.selectOption({ label: value });
    return;
  }

  await locator.fill(value);
}

async function semanticButton(page: Page, step: WorkflowStepConfig): Promise<Locator | null> {
  if (step.id === "submit") {
    return page.getByRole("button", { name: /submit|send|save|create/i }).first();
  }
  return null;
}

async function resolveStepLocator(page: Page, step: WorkflowStepConfig): Promise<Locator> {
  const primary = locatorFor(page, step);
  if (primary) {
    return primary;
  }

  const fallback = fallbackLocatorFor(page, step);
  if (fallback) {
    return fallback;
  }

  const semantic = await semanticButton(page, step);
  if (semantic) {
    return semantic;
  }

  throw new Error(`Mini-user could not resolve locator for step ${step.id}.`);
}

async function executeMiniWorkflow(page: Page, request: UserExecutionRequest, observations: ObservationRecord[], state: WorkflowState): Promise<void> {
  const inputs = workflowInputsForPersona(request.workflow.id, request.persona);

  for (const step of request.workflow.steps) {
    state.stepId = step.id;

    switch (step.action) {
      case "goto": {
        const destination = new URL(step.route ?? request.workflow.route, request.target.baseUrl).toString();
        observe(observations, "navigation", `Navigate to ${destination}`, step.id);
        await page.goto(destination, { waitUntil: "domcontentloaded", timeout: request.persona.patienceMs });
        await waitForWorkflowReady(page, step.id, observations);
        observe(observations, "system", `Surface snapshot: ${await summarizeSurface(page)}`, step.id);
        break;
      }
      case "fill": {
        const valueKey = step.valueKey;
        if (!valueKey) {
          throw new Error(`Workflow step ${step.id} is missing valueKey.`);
        }
        const value = inputs[valueKey];
        if (value === undefined) {
          throw new Error(`Workflow step ${step.id} requested missing input ${valueKey}.`);
        }
        await fillLocator(await resolveStepLocator(page, step), value);
        await page.waitForTimeout(50);
        observe(observations, "action", `Filled ${valueKey}`, step.id);
        break;
      }
      case "click": {
        const locator = await resolveStepLocator(page, step);
        if (request.persona.assistiveTech === "keyboard-only") {
          await locator.focus();
          await page.keyboard.press("Enter");
          observe(observations, "action", "Activated control with keyboard", step.id);
        } else {
          await locator.click({ timeout: request.persona.patienceMs });
          observe(observations, "action", "Activated semantic control", step.id);
        }
        if (step.id.startsWith("open-") && step.locator?.kind === "role" && step.locator.role === "button") {
          await page.getByRole("heading", { level: 1, name: new RegExp(escapeRegex(step.locator.name), "i") }).waitFor({
            state: "visible",
            timeout: request.persona.patienceMs
          });
        }
        await page.waitForTimeout(50);
        break;
      }
      case "expectVisible": {
        await (await resolveStepLocator(page, step)).waitFor({ state: "visible", timeout: request.persona.patienceMs });
        observe(observations, "oracle", "Visibility expectation passed", step.id);
        break;
      }
      case "expectText": {
        if (request.persona.expectsDuplicateBlocked) {
          observe(observations, "oracle", "Skipped success-path text expectation for duplicate-blocked persona", step.id);
          break;
        }
        if (!step.text) {
          throw new Error(`Workflow step ${step.id} is missing text.`);
        }
        if (step.locator) {
          await (await resolveStepLocator(page, step)).filter({ hasText: step.text }).waitFor({ state: "visible", timeout: request.persona.patienceMs });
        } else {
          await page.getByText(step.text, { exact: false }).waitFor({ state: "visible", timeout: request.persona.patienceMs });
        }
        observe(observations, "oracle", `Observed expected text ${step.text}`, step.id);
        break;
      }
    }
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

async function capturePersonaArtifacts(
  context: BrowserContext,
  page: Page,
  persona: Persona,
  dirs: RunArtifactDirs,
  shouldSaveFailureTrace: boolean,
  consoleEvents: BrowserConsoleEvent[],
  networkEvents: BrowserNetworkEvent[],
  observations: ObservationRecord[]
): Promise<ArtifactRef[]> {
  const refs: ArtifactRef[] = [];
  const tracePath = path.join(dirs.traceDir, `${persona.id}.zip`);
  const consolePath = path.join(dirs.consoleDir, `${persona.id}.json`);
  const networkPath = path.join(dirs.networkDir, `${persona.id}.json`);
  const accessibilityPath = path.join(dirs.accessibilityDir, `${persona.id}.txt`);
  const domPath = path.join(dirs.domDir, `${persona.id}.html`);

  try {
    if (shouldSaveFailureTrace) {
      await context.tracing.stop({ path: tracePath });
      refs.push(artifactRef("trace", tracePath, "Playwright trace captured after mini-user failure."));
    } else {
      await context.tracing.stop();
    }
  } catch (error) {
    observe(observations, "artifact", `Trace capture failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await writeJsonArtifact(consolePath, consoleEvents);
    refs.push(artifactRef("console", consolePath, "Browser console events captured during mini-user execution."));
  } catch (error) {
    observe(observations, "artifact", `Console artifact write failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await writeJsonArtifact(networkPath, networkEvents);
    refs.push(artifactRef("network", networkPath, "Browser network events captured during mini-user execution."));
  } catch (error) {
    observe(observations, "artifact", `Network artifact write failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const ariaSnapshot = await page.locator("main").ariaSnapshot();
    await fs.writeFile(accessibilityPath, `${ariaSnapshot}\n`, "utf8");
    refs.push(artifactRef("accessibility", accessibilityPath, "ARIA snapshot of the workflow surface."));
  } catch (error) {
    observe(observations, "artifact", `Accessibility snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await fs.writeFile(domPath, await page.content(), "utf8");
    refs.push(artifactRef("dom", domPath, "DOM snapshot captured after mini-user execution."));
  } catch (error) {
    observe(observations, "artifact", `DOM snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return refs;
}

function errorFailure(persona: Persona, workflowId: string, replay: string, stepId: string | undefined, message: string): Failure {
  if (persona.assistiveTech === "screen-reader" && stepId === "submit") {
    return failureFor("screen-reader-submit-not-found", workflowId, replay, { actual: message, stepId });
  }

  if (persona.assistiveTech === "keyboard-only" && stepId === "submit") {
    return failureFor("unexpected-error", workflowId, replay, {
      actual: message,
      stepId,
      confidence: "likely-bug",
      category: "product-bug",
      impact: "Keyboard-only users cannot complete the core workflow through the visible controls."
    });
  }

  if (workflowId !== "submit-project" && stepId) {
    return failureFor("unexpected-error", workflowId, replay, {
      actual: message,
      stepId,
      confidence: "likely-bug",
      category: "product-bug",
      impact: "The configured product workflow broke before the user could complete the intended task."
    });
  }

  return failureFor("unexpected-error", workflowId, replay, {
    actual: message,
    stepId,
    confidence: "environment-issue",
    category: "harness-limitation"
  });
}

export const semanticMiniUserAdapter: UserExecutionAdapter = {
  kind: "semantic-mini-user",
  async execute(request: UserExecutionRequest): Promise<UserExecutionResult> {
    const browser = request.browser;
    if (!browser) {
      throw new Error("Semantic mini-user adapter requires a browser instance.");
    }

    const started = Date.now();
    const observations: ObservationRecord[] = [];
    const replay = replayCommand({
      url: new URL(request.workflow.route, request.target.baseUrl).toString(),
      configPath: request.configPath,
      personaId: request.persona.id,
      label: `${request.persona.id}-mini-user`
    });
    const context = await browser.newContext({ viewport: request.persona.viewport });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const consoleEvents: BrowserConsoleEvent[] = [];
    const networkEvents: BrowserNetworkEvent[] = [];
    const screenshotPath = path.join(request.dirs.screenshotDir, `${request.persona.id}-mini-user.png`);
    const state: WorkflowState = {};

    page.on("console", (message) => consoleEvents.push(consoleEvent(message)));
    page.on("request", (networkRequest) => networkEvents.push(requestEvent(networkRequest)));
    page.on("response", (networkResponse) => networkEvents.push(responseEvent(networkResponse)));
    page.on("requestfailed", (networkRequest) => networkEvents.push(requestFailedEvent(networkRequest)));

    try {
      await executeMiniWorkflow(page, request, observations, state);
      const statusText = await page.getByTestId("submission-status").textContent().catch(() => "");
      if (statusText) {
        observe(observations, "oracle", `Observed status: ${statusText}`, state.stepId);
      }

      let failure: Failure | undefined;
      if (request.workflow.id === "submit-project") {
        if (request.persona.expectsDuplicateBlocked && !/already has a submission|already exists|duplicate|edit it instead/i.test(statusText ?? "")) {
          failure = failureFor("duplicate-team-overwrite", request.workflow.id, replay, { actual: `Status was: ${statusText ?? ""}`, stepId: state.stepId });
        } else if (!request.persona.expectsDuplicateBlocked && !/submission received/i.test(statusText ?? "")) {
          failure = failureFor("submission-rejected", request.workflow.id, replay, { actual: `Status was: ${statusText ?? ""}`, stepId: state.stepId });
        }

        if (!failure && request.persona.textVolume === "massive") {
          const overflow = await overflowState(page);
          observe(observations, "oracle", `Overflow check: document=${overflow.documentOverflow}, item=${overflow.itemOverflow}`, state.stepId);
          if (overflow.documentOverflow || overflow.itemOverflow) {
            failure = failureFor("long-text-layout-overflow", request.workflow.id, replay, { stepId: state.stepId });
          }
        }

        if (!failure && request.persona.malicious) {
          const xss = await page.evaluate(() => Boolean((window as Window & { __HTU_XSS?: boolean }).__HTU_XSS));
          observe(observations, "oracle", `XSS sentinel: ${xss}`, state.stepId);
          if (xss) {
            failure = failureFor("xss-executed", request.workflow.id, replay, { stepId: state.stepId });
          }
        }
      }

      if (failure) {
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          failure.screenshotPath = screenshotPath;
        } catch (error) {
          observe(observations, "artifact", `Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const artifacts = await capturePersonaArtifacts(context, page, request.persona, request.dirs, Boolean(failure), consoleEvents, networkEvents, observations);
      if (failure?.screenshotPath) {
        artifacts.unshift(artifactRef("screenshot", failure.screenshotPath, "Full-page screenshot captured after mini-user failure."));
        failure.artifactRefs = artifacts;
      }

      await context.close();
      return {
        kind: "semantic-mini-user",
        status: failure ? "failed" : "passed",
        observations,
        failure,
        artifacts,
        replay: {
          command: replay,
          description: "Rerun the same persona through the semantic mini-user harness."
        },
        usage: {
          kind: "semantic-mini-user",
          durationMs: Date.now() - started,
          steps: request.workflow.steps.length
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = errorFailure(request.persona, request.workflow.id, replay, state.stepId, message);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        failure.screenshotPath = screenshotPath;
      } catch (screenshotError) {
        observe(observations, "artifact", `Screenshot capture failed: ${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}`);
      }

      const artifacts = await capturePersonaArtifacts(context, page, request.persona, request.dirs, true, consoleEvents, networkEvents, observations);
      if (failure.screenshotPath) {
        artifacts.unshift(artifactRef("screenshot", failure.screenshotPath, "Full-page screenshot captured after mini-user failure."));
      }
      failure.artifactRefs = artifacts;
      observe(observations, "system", message, state.stepId);
      await context.close();
      return {
        kind: "semantic-mini-user",
        status: "errored",
        observations,
        failure,
        artifacts,
        replay: {
          command: replay,
          description: "Rerun the same persona through the semantic mini-user harness."
        },
        usage: {
          kind: "semantic-mini-user",
          durationMs: Date.now() - started,
          steps: request.workflow.steps.length
        }
      };
    }
  }
};
