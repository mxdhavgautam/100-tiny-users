# Hundred Tiny Users Agent Instructions

- Do not use `any`. Use `unknown` plus type guards when needed.
- Do not weaken browser evals, persona expectations, or replay behavior to make patches pass.
- Browser tasks must interact through the UI. Reset endpoints are allowed only before runs.
- Use semantic selectors first: labels and roles. Test IDs are only for non-assistive direct clicking or status reads.
- Validate meaningful changes with `bun run typecheck`, `bun run build`, and relevant eval commands.
- Use a hard cutover approach. Do not add backward compatibility.
