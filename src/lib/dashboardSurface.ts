import path from "node:path";
import { promises as fs } from "node:fs";
import { readLocalPrototypeSnapshot, type AuditEventRecord, type ConfigSnapshotRecord, type RunMetadataRecord } from "@/src/lib/localPrototypeDb";
import { readDemoSession, readLatestPrompt, readLatestReport } from "@/src/lib/reportReader";
import { RUNS_DIR } from "@/src/lib/paths";
import type { DemoSession, EvalReport, FailureCluster } from "@/src/lib/types";

export type DashboardStatusTone = "ready" | "warning";

export type DashboardStatusItem = {
  label: string;
  tone: DashboardStatusTone;
  detail: string;
};

export type DashboardArtifactItem = {
  label: string;
  description: string;
  href?: string;
  path?: string;
};

export type DashboardRunRow = {
  id: string;
  createdAt: string;
  label: string;
  status: RunMetadataRecord["status"];
  configId: string;
};

export type DashboardConfigRow = {
  id: string;
  createdAt: string;
  name: string;
  environment: string;
  baseUrl: string;
  authKind: string;
  resetKind: string;
  workflowCount: number;
  browser: string;
  defaultCount: number;
};

export type DashboardClusterRow = {
  kind: FailureCluster["kind"];
  title: string;
  severity: FailureCluster["severity"];
  count: number;
  personaIds: string[];
  replayCommands: string[];
  expected: string;
  actual: string;
  artifacts: DashboardArtifactItem[];
};

export type DashboardSnapshot = {
  initialSession: DemoSession | null;
  initialReport: EvalReport | null;
  initialPrompt: string;
  statusItems: DashboardStatusItem[];
  artifactItems: DashboardArtifactItem[];
  recentRuns: DashboardRunRow[];
  recentConfigs: DashboardConfigRow[];
  recentEvents: AuditEventRecord[];
  clusterRows: DashboardClusterRow[];
  latestConfig: DashboardConfigRow | null;
  latestRunDir: string | null;
};

function toConfigRow(record: ConfigSnapshotRecord): DashboardConfigRow {
  return {
    id: record.id,
    createdAt: record.createdAt,
    name: record.config.name,
    environment: record.config.environment,
    baseUrl: record.config.baseUrl,
    authKind: record.config.auth.kind,
    resetKind: record.config.reset.kind,
    workflowCount: record.config.workflows.length,
    browser: record.config.runProfile.browser,
    defaultCount: record.config.runProfile.defaultCount
  };
}

function toRunRow(record: RunMetadataRecord): DashboardRunRow {
  return {
    id: record.id,
    createdAt: record.createdAt,
    label: record.label,
    status: record.status,
    configId: record.configId
  };
}

function toRoutePath(filePath: string | null): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const fileName = path.basename(filePath);
  if (fileName === "latest-report.json") {
    return "/artifacts/latest-report.json";
  }
  if (fileName === "codex-repair-prompt.md" || fileName === "codex-patch-prompt.md") {
    return "/artifacts/codex-patch-prompt";
  }
  if (fileName === "demo-session.json") {
    return "/artifacts/demo-session.json";
  }

  return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildArtifactItems(report: EvalReport | null, prompt: string, runId: string | null): Promise<DashboardArtifactItem[]> {
  const items: DashboardArtifactItem[] = [];

  if (report) {
    items.push({
      label: "Latest report JSON",
      description: `${report.summary.label} scored ${report.summary.passed}/${report.summary.total}`,
      href: "/artifacts/latest-report.json"
    });
  }

  if (prompt.trim()) {
    items.push({
      label: "Codex repair prompt",
      description: "Route-backed latest repair packet",
      href: "/artifacts/codex-patch-prompt"
    });
  }

  if (!runId) {
    return items;
  }

  const runDir = path.join(RUNS_DIR, runId);
  const candidateFiles = [
    {
      label: "Run report file",
      description: "Filesystem report snapshot",
      path: path.join(runDir, "report.json")
    },
    {
      label: "Run summary file",
      description: "Markdown run summary",
      path: path.join(runDir, "summary.md")
    },
    {
      label: "Repair result file",
      description: "Latest repair execution result",
      path: path.join(runDir, "repair", "repair-result.json")
    },
    {
      label: "Config snapshot file",
      description: "Resolved target config used for this run",
      path: path.join(runDir, "config", "config-snapshot.json")
    }
  ];

  const existingItems = await Promise.all(
    candidateFiles.map(async (item) => {
      if (!(await fileExists(item.path))) {
        return null;
      }
      const artifact: DashboardArtifactItem = {
        ...item,
        href: toRoutePath(item.path)
      };
      return artifact;
    })
  );

  const filteredItems: DashboardArtifactItem[] = [];
  for (const item of existingItems) {
    if (item) {
      filteredItems.push(item);
    }
  }

  return items.concat(filteredItems);
}

function buildStatusItems(report: EvalReport | null, prompt: string, latestConfig: DashboardConfigRow | null, recentRunCount: number): DashboardStatusItem[] {
  const score = report ? `${report.summary.passed}/${report.summary.total} (${report.summary.scorePercent}%)` : "No report available";

  return [
    {
      label: "Config",
      tone: latestConfig ? "ready" : "warning",
      detail: latestConfig
        ? `${latestConfig.environment} target at ${latestConfig.baseUrl} with ${latestConfig.workflowCount} workflow${latestConfig.workflowCount === 1 ? "" : "s"}`
        : "No config snapshot found in SQLite"
    },
    {
      label: "Storage",
      tone: recentRunCount > 0 ? "ready" : "warning",
      detail: recentRunCount > 0 ? `SQLite ledger has ${recentRunCount} recent run record${recentRunCount === 1 ? "" : "s"}` : "No recent runs found in SQLite"
    },
    {
      label: "Latest eval",
      tone: report ? "ready" : "warning",
      detail: score
    },
    {
      label: "Repair packet",
      tone: prompt.trim() ? "ready" : "warning",
      detail: prompt.trim() ? "Latest Codex repair prompt is available" : "No repair prompt generated yet"
    }
  ];
}

function buildClusterRows(report: EvalReport | null): DashboardClusterRow[] {
  if (!report) {
    return [];
  }

  return report.summary.clusters.map((cluster) => ({
    kind: cluster.kind,
    title: cluster.title,
    severity: cluster.severity,
    count: cluster.count,
    personaIds: cluster.personaIds,
    replayCommands: cluster.replayCommands,
    expected: cluster.representative.expected,
    actual: cluster.representative.actual,
    artifacts: (cluster.representative.artifactRefs ?? []).map((artifact) => ({
      label: artifact.kind,
      description: artifact.description,
      path: artifact.path,
      href: toRoutePath(artifact.path)
    }))
  }));
}

export async function readDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [initialSession, initialReport, initialPrompt, localSnapshot] = await Promise.all([
    readDemoSession(),
    readLatestReport(),
    readLatestPrompt(),
    readLocalPrototypeSnapshot()
  ]);

  const recentConfigs = localSnapshot.recentConfigs.map(toConfigRow);
  const recentRuns = localSnapshot.recentRuns.map(toRunRow);
  const latestConfig = recentConfigs[0] ?? null;
  const latestRunDir = initialReport ? path.join(RUNS_DIR, initialReport.summary.runId) : null;

  return {
    initialSession,
    initialReport,
    initialPrompt: initialPrompt ?? "",
    statusItems: buildStatusItems(initialReport, initialPrompt ?? "", latestConfig, recentRuns.length),
    artifactItems: await buildArtifactItems(initialReport, initialPrompt ?? "", initialReport?.summary.runId ?? initialSession?.baselineRunId ?? null),
    recentRuns,
    recentConfigs,
    recentEvents: localSnapshot.recentEvents,
    clusterRows: buildClusterRows(initialReport),
    latestConfig,
    latestRunDir
  };
}
