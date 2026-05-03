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
    const existing = clusters.get(result.failure.kind) ?? [];
    existing.push(result);
    clusters.set(result.failure.kind, existing);
  }

  return [...clusters.values()]
    .map((items) => {
      const first = items[0];
      if (!first.failure) {
        throw new Error("Clustered result is missing failure.");
      }
      return {
        kind: first.failure.kind,
        title: first.failure.title,
        severity: first.failure.severity,
        count: items.length,
        personaIds: items.map((item) => item.persona.id),
        replayCommands: items.map((item) => item.failure?.replayCommand ?? "").filter((command) => command.length > 0),
        representative: first.failure
      };
    })
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.count - a.count);
}
