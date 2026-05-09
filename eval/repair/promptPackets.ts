import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvalReport } from "../../src/lib/types";
import type { RepairCluster, RepairHarness, RepairPromptPacket } from "./types";

function replayTarget(report: EvalReport): { workflowId?: string; harnessKind?: string } {
  const firstResult = report.results[0];
  return {
    workflowId: firstResult?.workflowId,
    harnessKind: firstResult?.harnessKind
  };
}

function validationCommandsFor(report: EvalReport): string[] {
  const configId = report.config?.id ?? "demo-hackathon";
  const count = report.summary.total;
  const replay = replayTarget(report);
  const workflowFlag = replay.workflowId ? ` --workflow ${replay.workflowId}` : "";
  const harnessFlag = replay.harnessKind ? ` --harness ${replay.harnessKind}` : "";
  return [
    "bun run typecheck",
    "bun run build",
    `bun run eval -- --config configs/${configId}.json${workflowFlag}${harnessFlag} --label patched --count ${count}`
  ];
}

function repairableClusters(report: EvalReport): RepairCluster[] {
  return report.summary.clusters
    .filter((cluster) => cluster.category === "product-bug")
    .map((cluster) => ({
    fingerprint: cluster.fingerprint,
    kind: cluster.kind,
    title: cluster.title,
    severity: cluster.severity,
    count: cluster.count,
    personaIds: cluster.personaIds,
    replayCommands: cluster.replayCommands,
    expected: cluster.representative.expected,
    actual: cluster.representative.actual,
    screenshotPath: cluster.representative.screenshotPath
    }));
}

function clusterPacketId(cluster: RepairCluster): string {
  const slug = cluster.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "cluster";
  const hash = createHash("sha1").update(cluster.fingerprint).digest("hex").slice(0, 10);
  return `${slug}-${hash}`;
}

function productPromise(report: EvalReport): string {
  if (report.config?.id === "workbench-ops") {
    return "A customer operations workbench for queue triage, internal notes, and case resolution.";
  }

  return "A hackathon project submission portal.";
}

function filesWorthInspecting(report: EvalReport): string[] {
  if (report.config?.id === "workbench-ops") {
    return [
      "AGENTS.md",
      "src/components/WorkbenchClient.tsx",
      "src/lib/workbenchData.ts",
      "app/workbench/page.tsx",
      "app/api/workbench/route.ts",
      "app/api/workbench/cases/[caseId]/route.ts",
      "app/api/workbench/cases/[caseId]/notes/route.ts",
      "app/api/workbench/cases/[caseId]/resolution/route.ts"
    ];
  }

  return [
    "AGENTS.md",
    "src/components/PortalClient.tsx",
    "src/lib/storage.ts",
    "app/api/submissions/route.ts",
    "app/portal/page.tsx",
    "src/demo/bugSwitches.ts only as demo-state context; do not use bug-switch flips as the real repair."
  ];
}

function harnessInstructions(harness: RepairHarness): string {
  if (harness === "codex") {
    return `## Codex CLI Instructions

- Run from a clean disposable worktree, never the source branch checkout.
- Use the authenticated local Codex CLI session; do not require \`OPENAI_API_KEY\`.
- Respect the project instructions in \`AGENTS.md\`.
- Keep edits minimal and production-shaped.
- Return changed files, root cause, validation output, and before/after score.`;
  }

  return `## Cursor Agent Instructions

- Prefer the authenticated \`agent\` command. Use \`cursor-agent\` only when \`agent\` is not installed.
- Run from a clean disposable worktree, never the source branch checkout.
- Use direct edit or force flags only inside that disposable worktree.
- Respect the project instructions in \`AGENTS.md\`.
- End with a machine-readable completion summary containing changed files, root cause, validation output, and before/after score.`;
}

function promptFor(report: EvalReport, harness: RepairHarness, cluster: RepairCluster): string {
  const validationCommands = validationCommandsFor(report);
  const inspectFiles = filesWorthInspecting(report);

  return `# Hundred Tiny Users Repair Packet: ${harness}

Patch the root cause of this specific Hundred Tiny Users product-bug cluster from \`artifacts/latest-report.json\`.

## Product Promise

${productPromise(report)}

## Non-Negotiable Constraints

- Do not use \`any\`.
- Do not weaken browser evals, persona expectations, replay behavior, selectors, or assertions to make the repair pass.
- Browser tasks must interact through the UI. Reset endpoints are allowed only before runs.
- Use semantic selectors first: labels and roles. Test IDs are only for non-assistive direct clicking or status reads.
- Use a hard cutover approach. Do not add backward compatibility.
- Fix the product root cause, not the harness.
- Do not run destructive git commands.

${harnessInstructions(harness)}

## Current Summary

\`\`\`json
${JSON.stringify(report.summary, null, 2)}
\`\`\`

## Target Cluster

\`\`\`json
${JSON.stringify(cluster, null, 2)}
\`\`\`

Do not broaden this repair into unrelated failures unless the same root cause clearly requires it.

## Files Worth Inspecting

${inspectFiles.map((item) => `- ${item}`).join("\n")}

## Validation Commands

\`\`\`bash
${validationCommands.join("\n")}
\`\`\`

## Required Final Response

Return:

- changed files
- root cause
- repair summary
- validation commands and outputs
- before score and after score
- any remaining risk
`;
}

export function validationCommands(report: EvalReport): string[] {
  return validationCommandsFor(report);
}

export async function writePromptPackets(report: EvalReport, runDir: string, harnesses: RepairHarness[]): Promise<RepairPromptPacket[]> {
  const repairDir = path.join(runDir, "repair");
  await fs.mkdir(repairDir, { recursive: true });
  const clusters = repairableClusters(report);

  const packets: RepairPromptPacket[] = [];
  for (const harness of harnesses) {
    for (const cluster of clusters) {
      const id = clusterPacketId(cluster);
      const packetPath = path.join(repairDir, `${harness}-${id}-repair-prompt.md`);
      const prompt = promptFor(report, harness, cluster);
      await fs.writeFile(packetPath, prompt, "utf8");
      packets.push({
        id,
        harness,
        clusterFingerprint: cluster.fingerprint,
        clusterTitle: cluster.title,
        path: packetPath,
        prompt
      });
    }
  }

  return packets;
}
