import type { FailureCluster, FailureSeverity, PersonaResult } from "../src/lib/types";

const severityRank: Record<FailureSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

export function clusterFailures(results: PersonaResult[]): FailureCluster[] {
  const clusters = new Map<string, PersonaResult[]>();

  for (const result of results) {
    if (!result.failure) {
      continue;
    }
    const fingerprint = [
      result.failure.kind,
      result.failure.oracleId,
      result.failure.workflowId ?? result.workflowId,
      result.failure.stepId ?? "",
      result.failure.selector ?? "",
      result.failure.actual.replace(/\s+/g, " ").slice(0, 120)
    ].join("|");
    const existing = clusters.get(fingerprint) ?? [];
    existing.push(result);
    clusters.set(fingerprint, existing);
  }

  return [...clusters.entries()]
    .map(([fingerprint, items]) => {
      const first = items[0];
      if (!first.failure) {
        throw new Error("Clustered result is missing failure.");
      }
      return {
        kind: first.failure.kind,
        title: first.failure.title,
        severity: first.failure.severity,
        oracleId: first.failure.oracleId,
        confidence: first.failure.confidence,
        category: first.failure.category,
        fingerprint,
        count: items.length,
        personaIds: items.map((item) => item.persona.id),
        replayCommands: items.map((item) => item.failure?.replayCommand ?? "").filter((command) => command.length > 0),
        representative: first.failure
      };
    })
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.count - a.count);
}
