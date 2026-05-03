# Hundred Tiny Users Build Plan

The MVP is a deterministic local eval lab:

1. Next.js portal at `/portal` with three intentional bug switches.
2. Playwright colony runner creates browser-only user behavior.
3. Failures are clustered by empirical observations.
4. Reports, screenshots, bug markdown, and a Codex prompt are written locally.
5. Demo patcher flips known bug switches and reruns the same colony.
6. Dashboard reads latest artifacts and shows before/after results.
