# Hundred Tiny Users

Synthetic browser users attack a tiny hackathon submission portal, cluster failures, write replayable reports, generate a Codex patch prompt, apply deterministic demo fixes, and rerun the same colony.

> I didn’t write test cases. I created users and let them suffer.

## Commands

```bash
bun install
bun run dev
bun run reset
bun run eval -- --config configs/demo-hackathon.json --count 50
bun run demo:full
bun run report
```

`bun run demo:full` keeps the dev server alive after the before/after run so you can open the dashboard from another machine. Use `bun run demo:full:once` for the old one-shot behavior.

Replay one persona:

```bash
bun run eval -- --config configs/demo-hackathon.json --persona U002 --label replay-U002 --no-reset
```

Generate Codex and Cursor repair packets without executing an agent:

```bash
bun run patch:prompt
```

If Playwright needs a browser:

```bash
bunx playwright install chromium
```

The dev and production servers bind to `0.0.0.0:3000`, so the app is reachable from another machine if the network/firewall allows it.

Open locally:

- Dashboard: http://127.0.0.1:3000
- Portal: http://127.0.0.1:3000/portal

Run metadata is stored in `artifacts/prototype.sqlite`. Artifacts are written under `artifacts/runs/<runId>/`.
