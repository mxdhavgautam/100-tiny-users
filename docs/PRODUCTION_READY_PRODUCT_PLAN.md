# Production-Ready Hundred Tiny Users Plan

Date: 2026-05-07

## Executive Summary

Hundred Tiny Users currently proves one strong idea: run a colony of synthetic browser users against a target, cluster the pain, generate a repair prompt, patch, and rerun. The current implementation is intentionally hardcoded: one demo portal, fixed persona archetypes, deterministic Playwright steps, local JSON storage, static failure kinds, and a demo patcher that flips known bug switches.

The production product should become a harness-neutral user simulation and repair platform. A customer should be able to point it at a website or workflow, define the product promise and user population, choose one or more execution harnesses, run deterministic UI tests and agentic mini-users side by side, collect grounded failures with full browser and agent context, generate targeted repair prompts for Codex CLI, Cursor Agent CLI, or other code agents, then rerun the same cohort to prove whether the fix moved the real product behavior.

The key hard cutover is this: stop thinking of `eval/runner.ts` as the product. It becomes one legacy-compatible deterministic harness inside a broader run orchestration system.

For the current build push, the goal is a production-shaped open-source prototype by end of day, not a monetized SaaS. Ship the full loop locally first: configurable target, deterministic user execution, evidence capture, clustered report, repair packet, OAuth-backed CLI repair through Codex or Cursor, validation, rerun, and before/after report. Billing, hosted tenant administration, private target auth, and polished provider management come later.

## What Exists Today

The codebase is a local Next.js demo with these components:

- Target app: `app/portal/page.tsx`, `src/components/PortalClient.tsx`, `app/api/submissions/route.ts`, and `src/lib/storage.ts` implement a hackathon submission portal backed by local JSON files.
- Intentional faults: `src/demo/bugSwitches.ts` controls demo breakages such as duplicate overwrite, inaccessible submit, and long-text layout overflow.
- Persona generator: `eval/personas.ts` cycles through ten fixed archetypes with deterministic properties.
- Browser runner: `eval/runner.ts` launches Chromium, fills the portal through Playwright, applies fixed assertions, records observations, screenshots, and known failure kinds.
- Clustering/reporting: `eval/cluster.ts` groups failures by `FailureKind`; `eval/reporting.ts` writes `report.json`, `summary.md`, latest-report JSON, and per-cluster markdown.
- Demo patch loop: `eval/patcher.ts` writes `codex-patch-prompt.md` and, in demo mode, flips known bug switches instead of invoking a real repair harness.
- Dashboard: `src/components/DashboardClient.tsx` reads latest local artifacts and displays before/after progress.

This is a solid proof-of-concept because it demonstrates the end-to-end loop. It is not yet a product because target configuration, user modeling, harness execution, failure taxonomy, evidence capture, repair prompting, security isolation, persistence, multi-tenant operation, and integrations are all demo-scoped.

## Current Constraints That Must Be Replaced

- One target shape: the system assumes the target is the bundled hackathon portal and that reset is available at `/api/submissions/reset`.
- One workflow: every persona has the goal `Submit a hackathon project through the browser UI.`
- Hardcoded actions: Playwright fills five known labels and clicks one known submit button.
- Hardcoded expectations: all assertions are coupled to submission status text, overflow checks, XSS sentinel, and duplicate behavior.
- Hardcoded taxonomy: `FailureKind` is a finite list of demo bug names, so real customer failures would collapse into `unexpected-error`.
- Hardcoded repair surface: prompt generation points Codex at the known demo files, and demo patching flips booleans.
- Local-only persistence: artifacts and submitted data are JSON files under `artifacts/` and `data/`.
- Weak execution isolation: the runner launches browser contexts, but there is no tenant sandbox, target allowlist, secret policy, egress control, artifact retention policy, or prompt-injection boundary.
- No product onboarding: there is no way to ingest a site, crawl its routes, define workflows, add auth, import design docs, or let the user choose harnesses.
- Artifact timing footgun: screenshots are attempted during persona execution, while report writing creates artifact directories later; production must create and validate run directories before users run.

## External Reality Check

The production plan should align with current harness capabilities instead of inventing fake ones.

- Codex CLI supports local code-agent workflows with approval modes, including a full-auto mode scoped to a sandboxed current directory, and `codex exec` can run tasks programmatically/non-interactively. For the prototype, prefer the user's existing Codex CLI OAuth session over `OPENAI_API_KEY`; the adapter should capability-probe the installed CLI and treat missing login as a setup failure. Source references: OpenAI Codex CLI help center and the OpenAI Codex GitHub README.
- Cursor Agent CLI supports `agent`/Cursor Agent terminal usage and documented `cursor-agent -p` print mode for non-interactive automation, `--output-format` values such as `text`, `json`, or `stream-json`, and `--force` for direct file changes in scripts. For the prototype, prefer the installed authenticated `agent` command and capability-probe its supported flags instead of assuming the binary is named `cursor-agent`. Source references: Cursor CLI overview, headless mode, and parameters docs.
- OpenAI Agents SDK TypeScript provides agent primitives, function tools, MCP tool calling, sessions, handoffs, guardrails, and tracing. It is a good fit for mini-user orchestration where the product owns the tools and browser/action boundary.
- Playwright's official guidance strongly supports semantic locators, user-visible behavior, isolation, tracing, and retryable locators. The deterministic harness should continue to use this style.
- MCP is useful as a tool integration boundary, but MCP tools are model-controlled and need validation, access control, and human approval for real-world actions.
- Long-running agent loops need durable execution. The product should either implement first-party run checkpoints or adopt a durable workflow runtime; do not rely on one Node process and local JSON files for production runs.
- CLI harness flags are version-sensitive. The product must capability-probe installed harnesses at runtime instead of assuming a specific `codex` or `cursor-agent` version supports every documented option.

Source links are listed at the end of this file.

## Product Vision

Hundred Tiny Users becomes a synthetic user and repair loop platform:

1. Ingest a target website, app, or workflow.
2. Model real user populations as reusable personas with goals, constraints, risk profiles, tools, accessibility needs, locale, device, network, patience, and adversarial boundaries.
3. Run deterministic browser tests, agentic mini-users, or hybrid cohorts against the same product promise.
4. Capture exact context for every failure: user intent, browser trace, DOM snapshot, accessibility snapshot, console/network logs, screenshots/video, tool calls, agent decision/action summaries where available, and the final assertion or oracle result.
5. Cluster failures by root-cause hypothesis, not only by thrown error string.
6. Generate harness-specific patch prompts that include the target repo context, reproduction commands, artifacts, constraints, and acceptance criteria.
7. Invoke the selected repair harness in an isolated workspace.
8. Rerun the same users plus targeted regression cohorts.
9. Publish a before/after report that proves whether customer-relevant behavior improved.

## Core Architecture

### 1. Project And Target Registry

Replace implicit local assumptions with explicit target configuration.

Required entities:

- `Organization`: owner, retention, secret policy. For the open-source prototype this can be a local default workspace, not a billing entity.
- `Project`: product under test, repo connection, default harnesses, product promise.
- `Target`: base URL, environment, route allowlist, auth setup, reset strategy, data seeding strategy, network policy.
- `Workflow`: named customer journey such as sign up, submit project, checkout, invite teammate, run report, approve invoice.
- `Oracle`: success criteria and failure criteria for a workflow.
- `RunProfile`: browser/device matrix, persona selection, harness mix, max spend, max duration, artifact policy.

Minimum target config shape:

```ts
type TargetConfig = {
  name: string;
  baseUrl: string;
  allowedOrigins: string[];
  auth: AuthConfig | { kind: "none" };
  reset: ResetStrategy;
  workflows: WorkflowConfig[];
  secrets: SecretRef[];
  artifactPolicy: ArtifactPolicy;
};
```

Do not let arbitrary agent instructions navigate outside `allowedOrigins` or call arbitrary reset URLs. Reset actions must be first-class, audited operations. For the end-of-day demo, target auth can be skipped by using a local/public target with `auth.kind = "none"`; do not build private-app authentication before the public loop works.

### 2. Persona And Mini-User Model

Current personas are deterministic flags. Production personas need behavior policy, not just labels.

Required fields:

- Identity: stable id, display name, segment, locale, timezone, device profile.
- Goal: natural language intent and structured workflow target.
- Constraints: accessibility mode, keyboard/mouse preference, budget, deadline, patience, privacy sensitivity.
- Knowledge: what this user knows, what they do not know, and any seed data they own.
- Behavior style: careful, impatient, adversarial, novice, expert, distracted, multilingual, compliance-sensitive.
- Data generation policy: realistic fake data, PII ban, malicious payload policy.
- Harness eligibility: deterministic-only, agent-only, or hybrid.
- Oracle weighting: what counts as user harm for this persona.

The plan should keep deterministic personas for reproducibility, then add generative persona expansion. Generated personas must be versioned and frozen per run so before/after comparisons use the same cohort.

### 3. Execution And Repair Adapter Boundaries

Keep user simulation and code repair separate. They are part of one product loop, but they have different inputs, permissions, artifacts, and safety requirements.

User execution adapters answer: "Can this persona complete this workflow against this target?"

```ts
type UserExecutionKind =
  | "deterministic-playwright"
  | "openai-agents-sdk"
  | "external-webhook";

type UserExecutionRequest = {
  runId: string;
  projectId: string;
  target: TargetConfig;
  workflow: WorkflowConfig;
  persona: PersonaConfig;
  oracle: OracleConfig;
  artifactsDir: string;
  limits: RunLimits;
};

type UserExecutionResult = {
  status: "passed" | "failed" | "blocked" | "errored";
  observations: Observation[];
  failure?: FailureFinding;
  artifacts: ArtifactRef[];
  replay: ReplayRecipe;
  usage: HarnessUsage;
};
```

Repair adapters answer: "Can this harness patch the codebase for selected clusters inside an isolated workspace?"

```ts
type RepairKind = "codex-cli" | "cursor-agent-cli" | "openai-agents-sdk" | "external-webhook";

type RepairRequest = {
  repairId: string;
  projectId: string;
  repoRef: RepoRef;
  workspaceRef: string;
  clusters: FailureCluster[];
  promptPacket: RepairPromptPacket;
  artifacts: ArtifactRef[];
  limits: RunLimits;
};

type RepairResult = {
  status: "patched" | "no-change" | "failed" | "needs-human";
  patchRef?: string;
  summary: string;
  validation: ValidationResult[];
  artifacts: ArtifactRef[];
  usage: HarnessUsage;
};
```

User execution responsibilities:

- `deterministic-playwright`: replayable UI flows, semantic locators, accessibility snapshots, trace/video/screenshot, strong typed assertions.
- `openai-agents-sdk`: mini-users that receive browser tools and bounded target context, with guardrails and tracing.
- `external-webhook`: bridge for customer-owned user simulation without giving this product direct code execution access.

Repair responsibilities:

- `codex-cli`: repair harness for code changes, primarily after failures are clustered; optionally analysis-only if pointed at a repo.
- `cursor-agent-cli`: repair or review harness through the installed `agent` command first, falling back to `cursor-agent -p` when present, with explicit output parsing and optional force/direct-edit mode only inside disposable worktrees.
- `openai-agents-sdk`: product-owned repair agent with explicit file/command tools, guardrails, and tracing when the product needs finer-grained orchestration than a CLI agent.
- `external-webhook`: customer-owned repair service that returns a patch, branch, PR, or structured refusal.

Shared primitives such as `ArtifactRef`, `HarnessUsage`, `RunLimits`, and `ValidationResult` can be reused across both adapter families.

### 4. Browser Action Boundary For Agentic Users

Agentic users should not receive raw arbitrary browser control by default. Give them a constrained browser tool API:

- `navigate(pathOrUrl)` rejects disallowed origins.
- `observe()` returns visible text, role tree, focused element, relevant DOM snippets, URL, console/network summary, and screenshot reference.
- `click(locatorPlan)` uses semantic selectors first and returns actionability diagnostics.
- `fill(labelOrRole, value)` validates target and records redacted value metadata.
- `select(labelOrRole, option)` uses user-visible labels.
- `press(key)` for keyboard-only flows.
- `waitFor(condition)` with capped timeout.
- `assert(oracleCheck)` records pass/fail evidence.

The agent can decide what to do, but the tool layer enforces policy, logging, origin restrictions, timeouts, and privacy redaction. This preserves the current "browser users interact through UI" principle while allowing actual mini-agents.

Workflow steps should be represented as semantic locator plans by default: role/name, label, text, placeholder, alt text, then explicitly configured test-id fallback. Test ids are allowed for non-assistive direct clicking or status reads, but they must not become the main production locator strategy.

### 5. Oracles And Failure Detection

Replace demo-specific `FailureKind` with layered oracles:

- Explicit user goal oracle: did the intended outcome happen?
- Accessibility oracle: can the user find and operate controls by role/name/label?
- Visual/layout oracle: overflow, clipped text, modal occlusion, mobile viewport defects, contrast checks.
- Security oracle: XSS sentinel, unsafe HTML, credential leakage, unexpected third-party egress.
- Performance oracle: user-perceived latency, time to interactive, long task budget, failed network dependencies.
- Data integrity oracle: duplicate handling, idempotency, persisted state, cross-user leakage.
- Agent frustration oracle: repeated failed attempts, contradictory UI labels, dead-end navigation, hallucinated controls.

Each failure should store:

- `expected`: product promise and oracle rule.
- `actual`: observed behavior with direct evidence.
- `impact`: which persona segment was hurt and why it matters.
- `replay`: deterministic replay command when possible.
- `artifacts`: trace, screenshot, console logs, network logs, DOM/accessibility snapshots.
- `repairContext`: suspected files, API routes, components, relevant docs, and constraints.
- `confidence`: whether the cluster is a certain bug, likely bug, flaky signal, environment issue, or blocked setup.

### 6. Evidence Capture

Production artifacts must be rich enough for an agent or human to fix without rerunning blindly.

Capture per persona:

- Playwright trace zip retained on failure.
- Screenshot and optional video.
- DOM snapshot of relevant region.
- Accessibility tree excerpt around interacted controls.
- Console errors and warnings.
- Failed requests, status codes, and selected response metadata.
- Timing marks and action durations.
- Agent tool transcript, if agentic.
- Redacted model input/output summary, if permitted by the customer.
- Raw error stack and locator/actionability diagnostics.

Current screenshots and observations are useful but insufficient. The top priority upgrade is Playwright tracing plus structured action logs.

The first evidence fix should happen before tracing: create the per-run artifact directory and screenshot/trace directories before any persona starts. If artifact capture fails, record that as an artifact error without replacing the original oracle failure.

### 7. Clustering And Root-Cause Grouping

Move from grouping by enum to grouping by evidence.

Pipeline:

1. Normalize failures into structured facts: URL, workflow step, selector, role/name, network endpoint, error text, assertion, artifact hashes.
2. Rule-cluster obvious cases: same failed route, same locator miss, same response code, same console error, same oracle id.
3. LLM-cluster ambiguous cases using only redacted evidence and source snippets.
4. Assign root-cause hypotheses and confidence.
5. Select representative failures by impact and reproducibility.
6. Keep cluster ids stable across reruns when evidence matches.

The product should distinguish:

- product bug,
- test/oracle bug,
- flaky environment,
- auth/setup failure,
- harness limitation,
- blocked by policy.

This prevents bad repair prompts that tell code agents to patch the app when the harness failed to authenticate or the target environment was down.

### 8. Repair Prompt Generation

Prompt generation becomes a first-class product feature. It must be targeted per harness.

Common prompt packet:

- Product promise.
- Target workflow and persona intent.
- Before score and failing cluster summary.
- Minimal reproduction command and replay recipe.
- Exact expected vs actual.
- Artifact paths and how to inspect them.
- Relevant source files from repo indexing.
- Non-negotiable constraints from `AGENTS.md`, project rules, and user policy.
- Validation commands and acceptance gates.
- Instruction to fix root cause, not weaken evals or oracles.
- Required response format.

Codex CLI prompt should emphasize:

- Run in a clean disposable worktree.
- Respect approval/sandbox mode.
- Use the already-authenticated Codex CLI OAuth session when available; do not require `OPENAI_API_KEY` for CLI repair.
- Use existing project commands.
- Return changed files, root cause, validation output, and before/after score.

Cursor Agent CLI prompt should include:

- Prefer the installed authenticated `agent` command for the prototype. If the environment exposes `cursor-agent`, support `cursor-agent -p --output-format stream-json` for analysis or `cursor-agent -p --force --output-format stream-json` only inside a disposable repair workspace.
- Explicit rules context and `AGENTS.md` constraints.
- A machine-readable completion summary because stream-json/text output needs parsing.

OpenAI Agents SDK repair agent prompt should include:

- Tool contract.
- Guardrails.
- Trace/group ids.
- Patch boundaries.
- Validation tool calls.

The OpenAI Agents SDK path is optional for the end-of-day prototype because it normally needs application-level model credentials and a product-owned tool boundary. The Codex and Cursor CLI repair adapters can work through the user's authenticated local OAuth sessions, which is the preferred demo path.

Bad prompt smell: "Fix these bugs." Good prompt: "U014 keyboard-only user cannot submit checkout because the visible Continue button is not reachable by role/name after shipping step; trace X shows locator Y timing out; likely files A/B; preserve oracle O; validate with command C."

### 9. Repair Workspace And Execution Safety

Never run repair agents directly against the production branch.

Required flow:

1. Create disposable git worktree or isolated container from the selected commit.
2. Apply project policy and harness credentials with least privilege. For the local prototype, this means reusing authenticated CLI sessions for Codex/Cursor repair instead of storing API keys.
3. Mount only allowed repo paths and test artifacts.
4. Disable unrelated network by default; allow package registries only when configured.
5. Run the selected repair harness.
6. Capture patch, logs, commands, and model/harness output.
7. Run validation gates.
8. Rerun the failing cohort and a small unaffected control cohort.
9. Produce a patch proposal, PR, or branch only after gates pass.

The current `patcher.ts` should be hard-cut away from demo mutation:

- `prompt-builder`: writes repair packets.
- `repair-adapter` contracts: describe how Codex, Cursor, OpenAI Agents SDK, or external services will be called later.
- `repair-orchestrator`: introduced in the next phase to call configured adapters inside isolated workspaces.

There should be no production equivalent of flipping bug booleans.

### 10. Rerun Strategy

Reruns must prove improvement without hiding regressions.

Use three cohorts:

- `failed-replay`: exact users from failed clusters.
- `cluster-neighbors`: similar personas and workflows that exercise the same suspected area.
- `control`: unrelated passing personas to catch regressions.

Score output:

- baseline score,
- patched score,
- fixed clusters,
- persistent clusters,
- new regressions,
- flaky/unclassified deltas,
- cost and runtime.

Acceptance should require "no new critical/high regressions" by default, not merely "more passed than before."

## Data Model Upgrade

Suggested persistent types:

```ts
type Run = {
  id: string;
  projectId: string;
  targetId: string;
  cohortSnapshotId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  profile: RunProfile;
  summary?: RunSummary;
};

type RunCase = {
  id: string;
  runId: string;
  targetId: string;
  workflowVersionId: string;
  oracleVersionId: string;
  personaVersionId: string;
  userExecutionKind: UserExecutionKind;
  status: "queued" | "running" | "passed" | "failed" | "blocked" | "errored";
  replay?: ReplayRecipe;
};

type RunEvent = {
  id: string;
  runId: string;
  at: string;
  type: "queued" | "started" | "persona-started" | "artifact-written" | "finding-created" | "completed" | "failed";
  data: Record<string, unknown>;
};

type Observation = {
  at: string;
  stepId: string;
  channel: "browser" | "network" | "console" | "agent" | "oracle" | "system";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
};

type FailureFinding = {
  id: string;
  oracleId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  expected: string;
  actual: string;
  impact: string;
  confidence: "certain" | "likely" | "possible" | "flaky" | "setup";
  evidenceRefs: string[];
};

type Artifact = {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string;
  runCaseId?: string;
  kind: "trace" | "screenshot" | "video" | "dom" | "accessibility" | "console" | "network" | "prompt" | "patch" | "log";
  uri: string;
  sha256: string;
  redactionState: "raw" | "redacted" | "safe-to-share";
  retentionExpiresAt?: string;
  createdAt: string;
};

type CohortSnapshot = {
  id: string;
  personaVersionIds: string[];
  workflowVersionIds: string[];
  oracleVersionIds: string[];
  seed: string;
  createdAt: string;
};

type HarnessInvocation = {
  id: string;
  runId: string;
  kind: UserExecutionKind | RepairKind;
  commandOrTool: string;
  capabilitySnapshot: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "succeeded" | "failed" | "blocked";
};

type SecretAccessLog = {
  id: string;
  projectId: string;
  secretRef: string;
  purpose: "target-auth" | "reset" | "repair-harness" | "source-control";
  actor: string;
  at: string;
};

type RepairAttempt = {
  id: string;
  runId: string;
  clusterIds: string[];
  harness: RepairKind;
  workspaceRef: string;
  promptRef: string;
  patchRef?: string;
  validation: ValidationResult[];
  status: "queued" | "running" | "passed" | "failed" | "needs-human";
};
```

Use `unknown` and type guards for untrusted harness output. Do not add `any`.

Persistence requirements:

- Store immutable workflow, oracle, persona, and cohort snapshots for each run.
- Represent each persona/workflow/oracle execution as a `RunCase`; one run can cover many workflows and many personas.
- Use append-only `RunEvent` records for orchestration state and artifact writes.
- Use transactional DB writes for run metadata and cluster updates.
- Use idempotency keys for reset, seed, harness invocation, and repair operations.
- Use run-level locks so concurrent workers cannot mutate the same run summary.
- Use uniqueness constraints where the target-side product state requires them, rather than hoping replay order stays serialized.

## UI Product Surfaces

The product needs these screens:

- Project setup: target URL, auth, reset/seeding, repository connection, rules import.
- Workflow builder: record or describe user journeys; attach oracles.
- Persona studio: define cohorts, generate variations, freeze run cohorts.
- Harness selector: deterministic, mini-agent, repair harnesses, mixed strategy, budget limits.
- Run dashboard: live progress, failing users, artifacts, traces, cost, and confidence.
- Failure cluster view: representative evidence, affected users, root-cause hypothesis, replay actions.
- Repair packet view: generated prompt, selected harness, workspace policy, validation gates.
- Before/after report: product score, fixed clusters, new regressions, patch diff, audit log.
- Admin/security: secrets, retention, allowlists, redaction, compliance export.

Do not make this a landing page. The first screen should be the operational dashboard for setting up and running user cohorts.

This is a deliberate migration from the current hero/command dashboard. Phase 0 can keep the demo copy, but Phase 1 should move project setup, run status, artifact links, and cluster drilldown into the first viewport.

## Implementation Roadmap

### Phase 0: Stabilize And Name Demo Boundaries

Goal: make the current proof honest and remove demo fragility without changing the product concept.

- Rename docs to describe current runner as the deterministic demo harness.
- Add a plan-visible boundary around `src/demo/bugSwitches.ts` and `eval/patcher.ts`.
- Create per-run artifact directories before persona execution and record artifact-write errors separately from oracle failures.
- Keep existing commands green: `bun run typecheck`, `bun run build`, `bun run demo:full:once`.

This phase is mandatory today because the artifact directory bug can make failures look worse than they are. It is small enough to fix before the larger prototype work.

### Phase 1: Target, Workflow, Persona Config

Goal: run the existing deterministic Playwright logic from config rather than hardcoded portal assumptions.

- Add `configs/` backed by local SQLite metadata and filesystem artifacts. SQLite is the default development and demo database; hosted database/object storage is a later deployment option, not today's blocker.
- Extend `parseRunnerArgs` with `--config`, validate the config with Zod, and persist the exact config snapshot into the run artifacts before using the new command.
- Replace fixed `submissionForPersona` with workflow input generators.
- Replace fixed labels in `runner.ts` with workflow steps expressed as semantic locator plans.
- Add stable run ids, frozen cohorts, and config snapshots in artifacts.
- Make reset capabilities typed, origin-checked, dry-runnable, audited, and disabled by default for arbitrary URLs. Authenticated/signed reset is not needed for today's public/local demo target unless the chosen target requires it.
- Start replacing the hero-first dashboard with an operational run dashboard: project setup, latest run table, cluster list, artifact links, and setup status above the fold.
- Keep browser-only rule for deterministic harness.
- Keep target auth optional and default to `auth.kind = "none"` for local/public demo targets.

Gate:

```bash
bun run typecheck
bun run build
bun run eval -- --config configs/demo-hackathon.json --label configured-demo --count 50
```

### Phase 2: Evidence And Oracles

Goal: produce production-grade failure context.

- Add Playwright trace capture on failure.
- Add console/network capture.
- Add accessibility tree excerpts.
- Add oracle ids and structured findings.
- Expand clusters from enum grouping to evidence grouping.
- Keep the current demo failures as seed oracle examples.

Gate: the same demo bugs must produce richer evidence and a replay packet without weakening expectations.

### Phase 3: Harness Interface

Goal: run deterministic and agentic users through one orchestrator.

- Create `src/harnesses/` with typed user execution adapter contracts.
- Move current runner into `deterministic-playwright` adapter.
- Add a dry-run external user execution webhook adapter.
- Add an optional mini-user adapter only after deterministic config and evidence work. For the end-of-day prototype, this can be a constrained CLI-backed or dry-run agentic adapter; the OpenAI Agents SDK implementation is deferred unless application-level credentials and tool guardrails are ready.
- Store execution output in a common result schema.

Gate: one run goes through the common harness interface and the dashboard can display deterministic results plus an agentic/dry-run harness result shape. Full mixed autonomous mini-users can follow after the working loop is demoable.

### Phase 4: Repair Packet Builder

Goal: replace demo patch flipping with harness-specific repair prompts.

- Split `patcher.ts` into a prompt-builder and a typed repair adapter contract/stub.
- Create a separate `RepairKind` adapter contract instead of reusing user execution request types.
- Generate prompt packets per cluster and per harness.
- Include artifact refs, replay recipes, source hints, validation gates, and project rules.
- Parse harness output into a typed summary.
- Do not auto-apply patches to the main checkout.

Gate: a cluster can generate Codex and Cursor prompts that are specific enough to run in a disposable worktree.

### Phase 5: Repair Orchestration

Goal: run selected repair harnesses safely.

- Create disposable worktrees/containers.
- Introduce `repair-orchestrator` to call configured repair adapters inside isolated workspaces.
- Add Codex CLI adapter using the existing authenticated Codex OAuth session.
- Add Cursor Agent adapter using the installed authenticated `agent` command, with `cursor-agent` supported only if that binary is present.
- Capture patch diffs and command logs.
- Run validation gates.
- Rerun failed, neighbor, and control cohorts.
- Use the system-wide authenticated GitHub CLI for branch/PR operations when needed; do not extract or persist the token in app storage.

Gate: the system can generate a branch/patch proposal with before/after evidence and no direct mutation of the source branch.

### Phase 6: Productization

Goal: make this usable by real teams.

- Keep SQLite and filesystem artifacts as the default open-source local mode; add optional Postgres and S3-compatible storage adapters only when deployment needs them.
- Add queue workers and resumable runs.
- Add auth, organizations/projects, and secret management for hosted or team deployments.
- Add usage budgets for run/model limits, but do not add monetization or billing in this plan.
- Add artifact retention and redaction.
- Add GitHub PR integration.
- Add hosted runner and self-hosted runner modes.
- Add documented API and CLI.

Gate: a user can onboard a non-demo website, run a mixed cohort, receive a clustered report, send a repair to a selected harness, and verify the patch.

## Technical Decisions

- Keep TypeScript and Bun.
- Keep Playwright for deterministic browser execution and as the browser substrate for agent tools.
- Prefer a first-party harness interface over coupling to one provider.
- Use Zod or equivalent runtime schemas for untrusted config and harness output.
- Use object storage for artifacts and a relational database for run metadata.
- Use durable workers for long-running runs; do not rely on a single process.
- Use disposable worktrees or containers for repair.
- Treat all target websites, model outputs, MCP tools, and harness stdout as untrusted input.
- Never weaken browser evals or persona expectations to make repairs pass.

## Security And Privacy Requirements

- Origin allowlist for every target.
- Explicit auth and reset strategy.
- Secret vault with scoped injection and redaction.
- Network egress policy for browsers and repair agents.
- URL canonicalization before navigation, reset, seed, webhook, or artifact fetches.
- Redirect validation so allowed URLs cannot bounce to disallowed origins.
- DNS rebinding and private-network policy: block link-local/private IPs by default unless a self-hosted runner target explicitly opts in.
- Request and response body limits, download quarantine, and upload allowlists.
- Third-party request logging for every browser run.
- Prompt-injection handling: target page text is evidence, not instruction.
- Artifact redaction before LLM clustering or repair prompting.
- Per-tenant storage isolation.
- Audit logs for every harness call, tool call, reset, repair, and push/PR action.
- Configurable retention for screenshots, traces, model transcripts, and logs.
- Human approval gates before external side effects such as email, PR creation, deployment, or production data mutation.

## Open Questions

- Hosted runner, self-hosted runner, or both? For real customer apps behind VPNs, self-hosted runners are likely required.
- Should repair be a core product capability or an optional integration? It is powerful but expands security scope.
- What is the first non-demo target segment: SaaS onboarding flows, e-commerce checkout, internal admin tools, or developer docs/workflows?
- How much agent autonomy is acceptable by default? A conservative launch should default to observe/act browser tools only, with no code or external API tools for mini-users.
- Should LLM clustering be optional for customers with strict privacy requirements?
- Which source control provider ships first: GitHub only, then GitLab/Bitbucket later?

## Success Metrics

- A new project can be configured without source changes.
- At least three distinct workflows can be run against one target.
- A run can mix deterministic and agentic users.
- Failure reports include enough evidence for a human to reproduce without rerunning.
- Repair prompts include exact failure context, constraints, and validation commands.
- A repair harness can work in an isolated workspace and produce a patch proposal.
- Before/after reruns are cohort-stable and detect regressions.
- The system distinguishes product bugs from setup failures and harness failures.
- No customer secret appears in stored prompts, traces, public artifacts, or final reports.

## First Serious Milestones

### End-Of-Day Prototype Cut

Today's prototype should prove the whole loop locally without requiring private target auth, API keys, billing, hosted storage, or SaaS account management:

1. Run a local or public unauthenticated demo target from `configs/demo-hackathon.json`.
2. Execute deterministic Playwright users through the new harness interface.
3. Persist run metadata in local SQLite and artifacts on the filesystem.
4. Capture screenshots, traces, console/network evidence, accessibility excerpts, config snapshots, and replay commands.
5. Cluster failures into structured findings.
6. Generate Codex and Cursor repair packets.
7. Run one OAuth-backed CLI repair adapter in a disposable worktree.
8. Validate with `bun run typecheck`, `bun run build`, and the configured eval.
9. Rerun failed plus control cohorts.
10. Show a before/after dashboard/report.

Anything outside that loop is explicitly later: billing, hosted auth, private target credentials, polished organization administration, optional Postgres/S3 storage, and fully autonomous OpenAI Agents SDK mini-users.

Milestone 1 should prove configurable deterministic execution before adding agentic users:

> Configure a real external demo site with two workflows, run 30 deterministic Playwright users from frozen config, capture traces/accessibility/network evidence, cluster failures by structured evidence, and publish a replayable report without touching source code.

Milestone 2 should add agentic users without repair:

> Run the same external target with a mixed cohort of deterministic users and OpenAI Agents SDK mini-users behind constrained browser tools, then compare whether agentic users discover materially different failure clusters.

Milestone 3 should prove the repair loop:

> Generate Codex and Cursor repair packets for selected clusters, run one repair harness in a disposable worktree, validate the patch, and rerun failed plus control cohorts.

Together, these milestones prove the product loop without bundling several phases into one overlarge checkpoint.

## Source Links

- OpenAI Codex CLI getting started: https://help.openai.com/en/articles/11096431
- OpenAI Codex CLI README: https://github.com/openai/codex/blob/main/codex-rs/README.md
- Cursor CLI overview: https://docs.cursor.com/en/cli
- Cursor CLI headless mode: https://docs.cursor.com/en/cli/headless
- Cursor CLI parameters: https://docs.cursor.com/en/cli/reference/parameters
- OpenAI Agents SDK TypeScript: https://openai.github.io/openai-agents-js/
- OpenAI Agents SDK tracing: https://openai.github.io/openai-agents-js/guides/tracing/
- Playwright best practices: https://playwright.dev/docs/best-practices
- Playwright locators: https://playwright.dev/docs/locators
- Model Context Protocol tools specification: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- LangGraph durable execution reference: https://docs.langchain.com/oss/javascript/langgraph/durable-execution
