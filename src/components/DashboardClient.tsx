"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DashboardArtifactItem,
  DashboardClusterRow,
  DashboardConfigRow,
  DashboardRunRow,
  DashboardSnapshot,
  DashboardStatusItem
} from "@/src/lib/dashboardSurface";
import type { AuditEventRecord } from "@/src/lib/localPrototypeDb";
import type { DemoSession, EvalReport, FailureCluster } from "@/src/lib/types";

type Props = DashboardSnapshot;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asDemoSession(value: unknown): DemoSession | null {
  if (!isObject(value) || !Array.isArray(value.patchLog) || typeof value.updatedAt !== "string") {
    return null;
  }
  return value as DemoSession;
}

function asEvalReport(value: unknown): EvalReport | null {
  if (!isObject(value) || !isObject(value.summary) || !Array.isArray(value.results)) {
    return null;
  }
  return value as EvalReport;
}

function percent(passed?: number, total?: number): number {
  if (passed === undefined || !total) {
    return 0;
  }
  return Math.round((passed / total) * 100);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function shorten(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  return response.json();
}

function toneStyle(tone: "ready" | "warning"): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: tone === "ready" ? "rgba(123, 255, 177, 0.14)" : "rgba(255, 173, 92, 0.12)",
    color: tone === "ready" ? "var(--green)" : "var(--orange)",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase"
  };
}

function severityStyle(severity: FailureCluster["severity"]): React.CSSProperties {
  const palette = {
    low: "var(--cyan)",
    medium: "var(--orange)",
    high: "#ffd86b",
    critical: "var(--red)"
  } satisfies Record<FailureCluster["severity"], string>;

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    color: palette[severity],
    background: "rgba(255,255,255,0.03)"
  };
}

function statusCellStyle(status: DashboardRunRow["status"]): React.CSSProperties {
  const palette = {
    queued: "var(--cyan)",
    running: "var(--orange)",
    passed: "var(--green)",
    failed: "var(--red)",
    cancelled: "var(--muted)"
  } satisfies Record<DashboardRunRow["status"], string>;

  return {
    color: palette[status],
    fontWeight: 800,
    textTransform: "uppercase",
    fontSize: 12
  };
}

function buildStatusItems(report: EvalReport | null, prompt: string, latestConfig: DashboardConfigRow | null, recentRuns: DashboardRunRow[]): DashboardStatusItem[] {
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
      tone: recentRuns.length > 0 ? "ready" : "warning",
      detail:
        recentRuns.length > 0
          ? `SQLite ledger has ${recentRuns.length} recent run record${recentRuns.length === 1 ? "" : "s"}`
          : "No recent runs found in SQLite"
    },
    {
      label: "Latest eval",
      tone: report ? "ready" : "warning",
      detail: report ? `${report.summary.passed}/${report.summary.total} passed (${report.summary.scorePercent}%)` : "No report available"
    },
    {
      label: "Repair packet",
      tone: prompt.trim() ? "ready" : "warning",
      detail: prompt.trim() ? "Latest Codex repair prompt is available" : "No repair prompt generated yet"
    }
  ];
}

function clusterRowsFromReport(report: EvalReport | null): DashboardClusterRow[] {
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
      path: artifact.path
    }))
  }));
}

function mergeArtifactItems(items: DashboardArtifactItem[], report: EvalReport | null, prompt: string): DashboardArtifactItem[] {
  const routeItems: DashboardArtifactItem[] = [];
  if (report) {
    routeItems.push({
      label: "Latest report JSON",
      description: `${report.summary.label} scored ${report.summary.passed}/${report.summary.total}`,
      href: "/artifacts/latest-report.json"
    });
  }
  if (prompt.trim()) {
    routeItems.push({
      label: "Codex repair prompt",
      description: "Route-backed latest repair packet",
      href: "/artifacts/codex-patch-prompt"
    });
  }

  const deduped = new Map<string, DashboardArtifactItem>();
  for (const item of [...routeItems, ...items]) {
    const key = `${item.label}:${item.href ?? item.path ?? item.description}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }
  return [...deduped.values()];
}

function keyValue(label: string, value: string) {
  return (
    <div>
      <div className="metricLabel" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: DashboardClusterRow }) {
  return (
    <article className="panel" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <strong>
            {cluster.count} x {cluster.title}
          </strong>
          <div className="muted" style={{ marginTop: 6 }}>
            Personas {cluster.personaIds.join(", ")}
          </div>
        </div>
        <div style={severityStyle(cluster.severity)}>{cluster.severity}</div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div className="metricLabel" style={{ marginBottom: 6 }}>
            Expected
          </div>
          <div>{cluster.expected}</div>
        </div>
        <div>
          <div className="metricLabel" style={{ marginBottom: 6 }}>
            Actual
          </div>
          <div className="muted">{shorten(cluster.actual, 240)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="metricLabel">Replay</div>
        {cluster.replayCommands.map((command) => (
          <code className="code" key={command} style={{ padding: 10 }}>
            {command}
          </code>
        ))}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="metricLabel">Artifacts</div>
        {cluster.artifacts.length === 0 ? <div className="muted">No artifact references attached.</div> : null}
        {cluster.artifacts.map((artifact) => (
          <div
            key={`${cluster.kind}-${artifact.label}-${artifact.path ?? artifact.href ?? artifact.description}`}
            style={{
              display: "grid",
              gap: 4,
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 12,
              background: "rgba(255,255,255,0.02)"
            }}
          >
            <strong style={{ textTransform: "capitalize" }}>{artifact.label}</strong>
            <div className="muted">{artifact.description}</div>
            {artifact.href ? (
              <a href={artifact.href} className="button secondary" style={{ width: "fit-content", minHeight: 36, padding: "8px 12px" }}>
                Open route
              </a>
            ) : null}
            {artifact.path ? <code className="code" style={{ padding: 10 }}>{artifact.path}</code> : null}
          </div>
        ))}
      </div>
    </article>
  );
}

function AuditEventList({ events }: { events: AuditEventRecord[] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {events.length === 0 ? <div className="muted">No SQLite audit events recorded yet.</div> : null}
      {events.map((event) => (
        <div key={event.id} className="panel" style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>{event.action}</strong>
            <span className="muted">{formatDate(event.createdAt)}</span>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {event.targetId}
          </div>
          <div style={{ marginTop: 8 }}>{event.message}</div>
        </div>
      ))}
    </div>
  );
}

export function DashboardClient({
  initialSession,
  initialReport,
  initialPrompt,
  recentRuns,
  recentConfigs,
  recentEvents,
  latestConfig,
  latestRunDir,
  artifactItems,
  clusterRows
}: Props) {
  const [session, setSession] = useState<DemoSession | null>(initialSession);
  const [report, setReport] = useState<EvalReport | null>(initialReport);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy prompt");

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [sessionJson, reportJson] = await Promise.all([
          fetchJson("/artifacts/demo-session.json"),
          fetchJson("/artifacts/latest-report.json")
        ]);
        if (cancelled) {
          return;
        }
        setSession(asDemoSession(sessionJson));
        setReport(asEvalReport(reportJson));
      } catch {
        // Keep the dashboard readable while artifacts are being rewritten.
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPrompt = async () => {
      try {
        const response = await fetch("/artifacts/codex-patch-prompt", { cache: "no-store" });
        const text = await response.text();
        if (!cancelled) {
          setPrompt(text);
        }
      } catch {
        // Prompt is optional until a repair packet exists.
      }
    };

    void loadPrompt();
    const interval = window.setInterval(() => {
      void loadPrompt();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const baseline = session?.baseline;
  const patched = session?.patched;
  const active = session?.activeRun;
  const beforePercent = percent(baseline?.passed, baseline?.total);
  const afterPercent = percent(patched?.passed, patched?.total);
  const delta = baseline && patched ? patched.passed - baseline.passed : 0;
  const activeText = active ? `${active.phase} ${active.completed}/${active.total}` : patched ? "complete" : "idle";
  const promptPreview = prompt.trim() ? prompt : "No Codex repair prompt has been generated yet.";
  const visibleClusters = useMemo(() => (report ? clusterRowsFromReport(report) : clusterRows), [clusterRows, report]);
  const visibleArtifactItems = useMemo(() => mergeArtifactItems(artifactItems, report, prompt), [artifactItems, prompt, report]);
  const statusItems = useMemo(() => buildStatusItems(report, prompt, latestConfig, recentRuns), [latestConfig, prompt, recentRuns, report]);

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptPreview);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy prompt"), 1200);
  }

  return (
    <main className="shell" style={{ display: "grid", gap: 20 }}>
      <nav className="topbar">
        <div>
          <div className="brand">Hundred Tiny Users</div>
          <div className="muted">Operational dashboard for the local eval loop</div>
        </div>
        <div className="livePill">
          <span />
          {activeText}
        </div>
      </nav>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)", gap: 18 }}>
        <div className="panel" style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: 0 }}>Setup status</h1>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Local target, latest eval state, prompt availability, and SQLite ledger health.
              </p>
            </div>
            <div className="heroActions" style={{ marginTop: 0 }}>
              <a className="button secondary" href="/portal">
                Open target
              </a>
              <a className="button secondary" href="/artifacts/latest-report.json">
                Latest report
              </a>
            </div>
          </div>
          <div className="scoreboard" style={{ margin: 0, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {statusItems.map((item) => (
              <div key={item.label} className="scoreCard" style={{ minHeight: 0, display: "grid", gap: 12 }}>
                <div style={toneStyle(item.tone)}>{item.label}</div>
                <div>{item.detail}</div>
              </div>
            ))}
          </div>
          <div className="scoreboard" style={{ margin: 0 }}>
            <div className="scoreCard before">
              <div className="metricLabel">Baseline</div>
              <div className="metric">{baseline ? `${baseline.passed}/${baseline.total}` : "No run"}</div>
              <div className="meter" aria-label={`Baseline score ${beforePercent}%`}>
                <span style={{ width: `${beforePercent}%` }} />
              </div>
            </div>
            <div className="scoreCard after">
              <div className="metricLabel">Patched</div>
              <div className="metric">{patched ? `${patched.passed}/${patched.total}` : "No rerun"}</div>
              <div className="meter" aria-label={`Patched score ${afterPercent}%`}>
                <span style={{ width: `${afterPercent}%` }} />
              </div>
            </div>
            <div className="scoreCard delta">
              <div className="metricLabel">Delta</div>
              <div className="metric">{delta >= 0 ? `+${delta}` : delta}</div>
              <div className="muted">Same cohort, same target, same assertions.</div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Current config</h2>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Latest SQLite config snapshot.
            </p>
          </div>
          {latestConfig ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {keyValue("Name", latestConfig.name)}
                {keyValue("Environment", latestConfig.environment)}
                {keyValue("Auth", latestConfig.authKind)}
                {keyValue("Reset", latestConfig.resetKind)}
                {keyValue("Browser", latestConfig.browser)}
                {keyValue("Default count", String(latestConfig.defaultCount))}
              </div>
              {keyValue("Base URL", latestConfig.baseUrl)}
              {keyValue("Workflows", String(latestConfig.workflowCount))}
              {keyValue("Snapshot time", formatDate(latestConfig.createdAt))}
            </div>
          ) : (
            <div className="muted">No config snapshot available yet.</div>
          )}
          {latestRunDir ? (
            <div>
              <div className="metricLabel" style={{ marginBottom: 8 }}>
                Latest run directory
              </div>
              <code className="code" style={{ display: "block", padding: 10 }}>
                {latestRunDir}
              </code>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 18 }}>
        <div className="panel" style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Run ledger</h2>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Latest run summary plus SQLite-backed recent run metadata.
            </p>
          </div>

          {report ? (
            <div className="card" style={{ display: "grid", gap: 12 }}>
              <strong>{report.summary.label}</strong>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                {keyValue("Run ID", report.summary.runId)}
                {keyValue("Score", `${report.summary.passed}/${report.summary.total}`)}
                {keyValue("Failures", String(report.summary.failed))}
                {keyValue("URL", report.summary.url)}
                {keyValue("Started", formatDate(report.summary.startedAt))}
                {keyValue("Finished", formatDate(report.summary.finishedAt))}
              </div>
            </div>
          ) : (
            <div className="muted">No latest report is available yet.</div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  {["Created", "Label", "Status", "Config", "Record ID"].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        textAlign: "left",
                        padding: "0 0 10px",
                        borderBottom: "1px solid var(--line)",
                        color: "var(--muted)",
                        fontSize: 12,
                        textTransform: "uppercase"
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{formatDate(run.createdAt)}</td>
                    <td style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{run.label}</td>
                    <td style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={statusCellStyle(run.status)}>{run.status}</span>
                    </td>
                    <td style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <code>{run.configId}</code>
                    </td>
                    <td style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <code>{run.id}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div className="panel" style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0 }}>Artifact access</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Route-backed endpoints plus filesystem artifact paths for the latest run.
              </p>
            </div>
            {visibleArtifactItems.length === 0 ? <div className="muted">No artifact references are available yet.</div> : null}
            {visibleArtifactItems.map((item) => (
              <div key={`${item.label}-${item.href ?? item.path ?? item.description}`} className="card" style={{ display: "grid", gap: 8 }}>
                <strong>{item.label}</strong>
                <div className="muted">{item.description}</div>
                {item.href ? (
                  <a className="button secondary" href={item.href} style={{ width: "fit-content", minHeight: 36, padding: "8px 12px" }}>
                    Open route
                  </a>
                ) : null}
                {item.path ? <code className="code" style={{ padding: 10 }}>{item.path}</code> : null}
              </div>
            ))}
          </div>

          <div className="panel" style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0 }}>Recent configs</h2>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                SQLite-backed config snapshots.
              </p>
            </div>
            {recentConfigs.length === 0 ? <div className="muted">No config snapshots found.</div> : null}
            {recentConfigs.map((config) => (
              <div key={config.id} className="card" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <strong>{config.name}</strong>
                  <span className="muted">{formatDate(config.createdAt)}</span>
                </div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  {keyValue("Env", config.environment)}
                  {keyValue("Auth", config.authKind)}
                  {keyValue("Reset", config.resetKind)}
                  {keyValue("Count", String(config.defaultCount))}
                </div>
                <code className="code" style={{ padding: 10 }}>{config.baseUrl}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Failure clusters</h2>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Representative failures from the latest report with replay commands and artifact references.
            </p>
          </div>
          <button className="button secondary" type="button" onClick={() => setPromptOpen((value) => !value)}>
            {promptOpen ? "Hide repair prompt" : "Show repair prompt"}
          </button>
        </div>

        {visibleClusters.length === 0 ? <div className="panel muted">No failure clusters reported yet.</div> : null}
        <div style={{ display: "grid", gap: 16 }}>
          {visibleClusters.map((cluster) => (
            <ClusterCard key={`${cluster.kind}-${cluster.title}`} cluster={cluster} />
          ))}
        </div>
      </section>

      {promptOpen ? (
        <section className="promptPanel">
          <div className="promptHeader">
            <h2>Codex repair prompt</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="button secondary" href="/artifacts/codex-patch-prompt">
                Open raw
              </a>
              <button className="button secondary" type="button" onClick={() => void copyPrompt()}>
                {copyLabel}
              </button>
            </div>
          </div>
          <pre className="code promptCode">{promptPreview}</pre>
        </section>
      ) : null}

      <section className="panel" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>Recent audit events</h2>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Local SQLite audit log entries recorded by the prototype.
          </p>
        </div>
        <AuditEventList events={recentEvents} />
      </section>
    </main>
  );
}
