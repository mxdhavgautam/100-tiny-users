# Hundred Tiny Users

Hundred Tiny Users is a local evaluation lab for testing product flows with synthetic users instead of hand-written test cases.

This version contains two demo products:

- `Portal`: a public hackathon submission flow at `/portal`
- `Workbench`: an internal customer-operations queue at `/workbench`

The system runs realistic personas through those apps, records artifacts, clusters failures, stores run metadata in SQLite, and can generate repair packets for code-fixing agents.

## What This Project Actually Does

At a high level, the repo gives you a repeatable local product-eval loop:

1. Start a real Next.js app locally.
2. Run synthetic users against configured workflows.
3. Capture screenshots, traces, console logs, network logs, DOM snapshots, and structured findings.
4. Store run/config/audit metadata in `artifacts/prototype.sqlite`.
5. Surface the latest run state in the dashboard at `/`.
6. Optionally generate repair packets for agent-driven fix loops.

This is not a generic browser test runner. It is a small, local, product-evaluation system with:

- config-driven workflow definitions
- multiple user-execution harnesses
- persona-based replay
- SQLite-backed run history
- report and artifact generation

## The Apps

### Portal

The portal simulates a public-facing hackathon submission form. The main workflow is:

- submit a valid project
- confirm the success state is visible
- reject duplicate team names
- keep the UI accessible for screen-reader and keyboard users
- survive long pasted text without breaking

### Workbench

The workbench simulates an internal customer-support operations tool. The included workflows cover:

- semantic queue search
- admin identity confirmation handling
- credit issuance with follow-up still required
- queue ownership and state changes

## Harnesses

The current repo supports three execution styles:

- `deterministic-playwright`: browser-driven UI execution with stable selectors and artifact capture
- `semantic-mini-user`: a less rigid browser user that still has to complete the workflow through the UI
- `external-webhook`: simulates an external executor posting workflow results back through the local app webhook

## Quick Start

```bash
bun install
bunx playwright install chromium
bun run dev
```

Open:

- Dashboard: `http://127.0.0.1:3000/`
- Portal: `http://127.0.0.1:3000/portal`
- Workbench: `http://127.0.0.1:3000/workbench`

## Full Demo Command

If you want the full screen-recordable flow for the current version, run this:

```bash
bun run demo:full
```

What it does:

- starts the local Next.js dev server
- runs the full current suite across portal and workbench
- writes progress into `artifacts/demo-session.json`
- writes run reports and artifacts under `artifacts/runs/<runId>/`
- leaves the server alive when the suite finishes so you can keep recording the dashboard and app flows

Use this if you want the same “one command, full flow” experience that the old demo script used to provide, but for the current implementation.

If you want the script to run once and exit instead of staying alive:

```bash
bun run demo:full:once
```

## What `bun run demo:full` Runs

The current full suite covers:

1. A portal happy-path replay
2. A workbench semantic-search workflow with `deterministic-playwright`
3. A targeted screen-reader portal replay
4. A targeted long-text portal replay
5. A duplicate-submission seed run
6. A duplicate-submission replay without reset to verify rejection behavior
7. A targeted keyboard-only portal replay

The full demo command is the stable UI-first recording path. The additional harnesses are still part of the repo, but they are better run as targeted commands instead of being bundled into the camera flow.

## Targeted Commands

Run the stable portal happy-path replay directly:

```bash
bun run eval -- --config configs/demo-hackathon.json --workflow submit-project --harness deterministic-playwright --persona U009 --count 50 --label portal-happy
```

Run the 50-persona portal stress colony directly:

```bash
bun run eval -- --config configs/demo-hackathon.json --workflow submit-project --harness deterministic-playwright --count 50 --label portal-colony
```

Run a single portal persona replay:

```bash
bun run eval -- --config configs/demo-hackathon.json --workflow submit-project --harness deterministic-playwright --persona U002 --count 50 --label replay-screenreader
```

Run a workbench workflow with the semantic mini-user:

```bash
bun run eval -- --config configs/workbench-ops.json --workflow request-admin-identity-confirmation --harness semantic-mini-user --persona U009 --count 9 --label workbench-access
```

Run a workbench workflow with the external webhook harness:

```bash
bun run eval -- --config configs/workbench-ops.json --workflow issue-credit-with-followup --harness external-webhook --persona U009 --count 9 --label workbench-credit
```

## Validation Commands

These are the repo-level checks that matter after code changes:

```bash
bun run typecheck
bun run build
```

## Repair Packets

Generate repair packets without executing a repair agent:

```bash
bun run patch:prompt
```

Run the patcher entrypoint directly:

```bash
bun run repair
```

The repair artifacts are written into the latest run directory under `repair/`.

## Artifacts And Storage

Important paths:

- `artifacts/latest-report.json`: latest structured eval report
- `artifacts/demo-session.json`: current full-demo session state
- `artifacts/runs/<runId>/`: per-run report files and captured artifacts
- `artifacts/prototype.sqlite`: local SQLite ledger for runs, config snapshots, and audit events

## Repo Commands

```bash
bun run dev
bun run build
bun run start
bun run typecheck
bun run reset
bun run eval
bun run demo:full
bun run demo:full:once
bun run patch:prompt
bun run repair
bun run report
```

## Read This Correctly

This repo is now beyond the old “intentional bug and before/after patch story” demo. The main thing to show in the current version is:

- config-driven eval execution
- multiple products under test
- multiple harness types
- structured reports and artifacts
- dashboard visibility
- repair-packet generation as a follow-on capability

If you are demoing this to someone with zero context, the simplest explanation is:

“This is a local system that spins up realistic synthetic users, runs them through real product workflows, records what broke, and produces replayable evidence plus repair-ready outputs.”
