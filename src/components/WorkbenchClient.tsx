"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { CSSProperties, FormEvent } from "react";
import type {
  WorkbenchCase,
  WorkbenchCaseStatus,
  WorkbenchPriority,
  WorkbenchResolutionInput,
  WorkbenchResolutionKind,
  WorkbenchSnapshot
} from "@/src/lib/workbenchData";

type Props = {
  initialSnapshot: WorkbenchSnapshot;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type StatusFilter = "all" | WorkbenchCaseStatus;
type DetailTab = "brief" | "activity" | "playbook";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkbenchSnapshot(value: unknown): value is WorkbenchSnapshot {
  return (
    isObject(value) &&
    Array.isArray(value.cases) &&
    Array.isArray(value.owners) &&
    isObject(value.stats) &&
    typeof value.generatedAt === "string"
  );
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

function statusLabel(status: WorkbenchCaseStatus): string {
  return status.replaceAll("_", " ");
}

function resolutionLabel(kind: WorkbenchResolutionKind): string {
  const labels: Record<WorkbenchResolutionKind, string> = {
    expedite_shipment: "Expedite shipment",
    issue_credit: "Issue service credit",
    request_confirmation: "Request customer confirmation",
    close_case: "Close case"
  };

  return labels[kind];
}

function priorityStyle(priority: WorkbenchPriority): CSSProperties {
  const palette: Record<WorkbenchPriority, { background: string; color: string }> = {
    critical: { background: "rgba(255, 107, 107, 0.12)", color: "var(--red)" },
    high: { background: "rgba(255, 173, 92, 0.12)", color: "var(--orange)" },
    medium: { background: "rgba(117, 228, 255, 0.12)", color: "var(--cyan)" }
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: palette[priority].background,
    color: palette[priority].color,
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase"
  };
}

function statusStyle(status: WorkbenchCaseStatus): CSSProperties {
  const palette: Record<WorkbenchCaseStatus, string> = {
    new: "var(--red)",
    in_review: "var(--orange)",
    waiting_customer: "var(--cyan)",
    ready_to_ship: "var(--green)",
    resolved: "var(--muted)"
  };

  return {
    color: palette[status],
    fontWeight: 800,
    textTransform: "uppercase",
    fontSize: 12
  };
}

function defaultCustomerMessage(item: WorkbenchCase, kind: WorkbenchResolutionKind): string {
  if (kind === "expedite_shipment") {
    return `We confirmed the replacement path and are escalating shipment for ${item.orderNumber}.`;
  }

  if (kind === "issue_credit") {
    return `We audited the duplicate billing path and will issue the documented credit tied to ${item.orderNumber}. The credit memo will follow once finance posts it.`;
  }

  if (kind === "request_confirmation") {
    return `We can finish the fix once you confirm one account detail tied to ${item.orderNumber}.`;
  }

  return `We completed the requested work for ${item.orderNumber} and are closing the case with this summary.`;
}

function defaultRequestedField(item: WorkbenchCase): NonNullable<WorkbenchResolutionInput["requestedField"]> {
  if (item.kind === "billing") {
    return "invoice_contact";
  }
  if (item.kind === "shipping") {
    return "shipping_address";
  }
  return "admin_email_on_sso_provider";
}

function defaultResolutionFor(item: WorkbenchCase): WorkbenchResolutionKind {
  return item.availableResolutions[0] ?? "close_case";
}

function searchableCaseText(item: WorkbenchCase): string {
  const activityText = item.activity.map((entry) => `${entry.title} ${entry.detail}`).join(" ");
  const billingSynonyms = item.kind === "billing"
    ? "duplicate charge duplicate billing double charge charged twice finance credit memo invoice prorated delta"
    : "";
  const accessSynonyms = item.kind === "access" ? "admin access sso identity lockout domain migration" : "";
  const shippingSynonyms = item.kind === "shipping" ? "shipping replacement courier warehouse delivery" : "";

  return [
    item.title,
    item.summary,
    item.company,
    item.customerName,
    item.orderNumber,
    item.requestedOutcome,
    item.lastCustomerMessage,
    item.tags.join(" "),
    item.suggestedActions.join(" "),
    activityText,
    billingSynonyms,
    accessSynonyms,
    shippingSynonyms
  ]
    .join(" ")
    .toLowerCase();
}

async function requestSnapshot(url: string, init?: RequestInit): Promise<WorkbenchSnapshot> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = isObject(payload) && typeof payload.message === "string" ? payload.message : "Request failed.";
    throw new Error(message);
  }

  if (!isWorkbenchSnapshot(payload)) {
    throw new Error("The workbench returned an invalid response.");
  }

  return payload;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="scoreCard" style={{ minHeight: 0 }}>
      <div className="metricLabel">{label}</div>
      <div className="metric" style={{ fontSize: 40, marginBottom: 10 }}>
        {value}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {detail}
      </p>
    </article>
  );
}

function QueueItem({
  item,
  active,
  onSelect
}: {
  item: WorkbenchCase;
  active: boolean;
  onSelect: (caseId: string) => void;
}) {
  return (
    <button
      type="button"
      className={clsx("panel")}
      onClick={() => onSelect(item.id)}
      style={{
        width: "100%",
        textAlign: "left",
        display: "grid",
        gap: 12,
        background: active ? "rgba(216, 255, 95, 0.08)" : "var(--panel)",
        borderColor: active ? "rgba(216, 255, 95, 0.38)" : "var(--line)"
      }}
      aria-pressed={active}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{item.title}</strong>
        <div style={priorityStyle(item.priority)}>{item.priority}</div>
      </div>
      <div className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
        {item.company} · {item.customerName}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={statusStyle(item.status)}>{statusLabel(item.status)}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Updated {formatDate(item.lastUpdatedAt)}
        </div>
      </div>
    </button>
  );
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {detail ? (
        <p className="muted" style={{ margin: 0 }}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function WorkbenchClient({ initialSnapshot }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedCaseId, setSelectedCaseId] = useState(initialSnapshot.cases[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<DetailTab>("brief");
  const [ownerDraft, setOwnerDraft] = useState(initialSnapshot.cases[0]?.owner ?? "Unassigned");
  const [statusDraft, setStatusDraft] = useState<WorkbenchCaseStatus>(initialSnapshot.cases[0]?.status ?? "new");
  const [noteDraft, setNoteDraft] = useState("");
  const [resolutionKind, setResolutionKind] = useState<WorkbenchResolutionKind>(initialSnapshot.cases[0] ? defaultResolutionFor(initialSnapshot.cases[0]) : "close_case");
  const [customerMessageDraft, setCustomerMessageDraft] = useState(
    initialSnapshot.cases[0] ? defaultCustomerMessage(initialSnapshot.cases[0], defaultResolutionFor(initialSnapshot.cases[0])) : ""
  );
  const [shippingWindowDraft, setShippingWindowDraft] = useState<NonNullable<WorkbenchResolutionInput["shippingWindow"]>>("same_day");
  const [creditAmountDraft, setCreditAmountDraft] = useState("150");
  const [requestedFieldDraft, setRequestedFieldDraft] = useState<NonNullable<WorkbenchResolutionInput["requestedField"]>>(
    initialSnapshot.cases[0] ? defaultRequestedField(initialSnapshot.cases[0]) : "serial_number"
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<"refresh" | "save" | "note" | "resolve" | "reset" | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const deferredQuery = useDeferredValue(query);

  const visibleCases = useMemo(() => {
    const loweredQuery = deferredQuery.trim().toLowerCase();
    return snapshot.cases.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!loweredQuery) {
        return true;
      }

      return searchableCaseText(item).includes(loweredQuery);
    });
  }, [deferredQuery, snapshot.cases, statusFilter]);

  useEffect(() => {
    if (visibleCases.length === 0) {
      return;
    }

    if (!visibleCases.some((item) => item.id === selectedCaseId)) {
      startTransition(() => {
        setSelectedCaseId(visibleCases[0].id);
      });
    }
  }, [selectedCaseId, visibleCases]);

  const selectedCase = snapshot.cases.find((item) => item.id === selectedCaseId) ?? visibleCases[0] ?? null;

  useEffect(() => {
    if (!selectedCase) {
      return;
    }

    setOwnerDraft(selectedCase.owner ?? "Unassigned");
    setStatusDraft(selectedCase.status);
    const nextResolution = defaultResolutionFor(selectedCase);
    setResolutionKind(nextResolution);
    setCustomerMessageDraft(defaultCustomerMessage(selectedCase, nextResolution));
    setRequestedFieldDraft(defaultRequestedField(selectedCase));
    setShippingWindowDraft("same_day");
    setCreditAmountDraft(selectedCase.kind === "billing" ? "240" : "150");
    setNoteDraft("");
  }, [selectedCaseId, selectedCase?.id]);

  async function refreshSnapshot() {
    setBusyAction("refresh");
    try {
      const nextSnapshot = await requestSnapshot("/api/workbench");
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
      setNotice({ tone: "success", message: "Workbench data refreshed." });
    } catch (error: unknown) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to refresh workbench." });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCaseSettings() {
    if (!selectedCase) {
      return;
    }

    setBusyAction("save");
    setNotice(null);

    try {
      const nextSnapshot = await requestSnapshot(`/api/workbench/cases/${selectedCase.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          owner: ownerDraft,
          status: statusDraft
        })
      });
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
      setNotice({ tone: "success", message: "Case ownership and queue state updated." });
    } catch (error: unknown) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save case." });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCase) {
      return;
    }

    setBusyAction("note");
    setNotice(null);

    try {
      const nextSnapshot = await requestSnapshot(`/api/workbench/cases/${selectedCase.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteDraft })
      });
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
      setNoteDraft("");
      setNotice({ tone: "success", message: "Internal note saved." });
      setTab("activity");
    } catch (error: unknown) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save note." });
    } finally {
      setBusyAction(null);
    }
  }

  async function applyResolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCase) {
      return;
    }

    const payload: WorkbenchResolutionInput = {
      kind: resolutionKind,
      customerMessage: customerMessageDraft
    };

    if (resolutionKind === "expedite_shipment") {
      payload.shippingWindow = shippingWindowDraft;
    }

    if (resolutionKind === "issue_credit") {
      payload.creditAmount = Number(creditAmountDraft);
    }

    if (resolutionKind === "request_confirmation") {
      payload.requestedField = requestedFieldDraft;
    }

    setBusyAction("resolve");
    setNotice(null);

    try {
      const nextSnapshot = await requestSnapshot(`/api/workbench/cases/${selectedCase.id}/resolution`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
      setNotice({ tone: "success", message: `${resolutionLabel(resolutionKind)} applied.` });
      setTab("activity");
    } catch (error: unknown) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to apply resolution." });
    } finally {
      setBusyAction(null);
    }
  }

  async function resetDemo() {
    setBusyAction("reset");
    setNotice(null);

    try {
      const nextSnapshot = await requestSnapshot("/api/workbench/reset", {
        method: "POST",
        body: JSON.stringify({})
      });
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSelectedCaseId(nextSnapshot.cases[0]?.id ?? "");
      });
      setTab("brief");
      setNotice({ tone: "success", message: "Workbench demo data reset." });
    } catch (error: unknown) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to reset demo data." });
    } finally {
      setBusyAction(null);
    }
  }

  const saveDisabled = !selectedCase || (ownerDraft === (selectedCase.owner ?? "Unassigned") && statusDraft === selectedCase.status);
  const noteDisabled = noteDraft.trim().length < 8 || busyAction === "note";
  const resolutionDisabled =
    busyAction === "resolve" ||
    customerMessageDraft.trim().length < 12 ||
    (resolutionKind === "issue_credit" && (!creditAmountDraft.trim() || Number.isNaN(Number(creditAmountDraft))));

  return (
    <main className="shell" style={{ display: "grid", gap: 22 }}>
      <span data-testid="workbench-hydrated" data-ready={hydrated ? "true" : "false"} hidden />
      <div className="topbar">
        <div style={{ display: "grid", gap: 6 }}>
          <div className="brand">Customer Operations Workbench</div>
          <div className="muted">A realistic second target app with queue triage, notes, and case resolution flows.</div>
        </div>
        <div className="navlinks">
          <a className="button secondary" href="/">
            Dashboard
          </a>
          <a className="button secondary" href="/portal">
            Hackathon portal
          </a>
        </div>
      </div>

      <section className="panel" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "start" }}>
          <SectionHeading
            title="Daily queue"
            detail="Synthetic users can triage the queue, capture internal notes, and complete multiple realistic resolution paths."
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="livePill">
              <span />
              Snapshot {formatDate(snapshot.generatedAt)}
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshSnapshot()} disabled={busyAction === "refresh"}>
              {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button className="button secondary" type="button" onClick={() => void resetDemo()} disabled={busyAction === "reset"}>
              {busyAction === "reset" ? "Resetting..." : "Reset demo"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <StatCard label="Open queue" value={String(snapshot.stats.openCount)} detail="Cases still requiring operator work." />
          <StatCard label="Urgent" value={String(snapshot.stats.urgentCount)} detail="Critical or high-priority work across teams." />
          <StatCard label="Waiting" value={String(snapshot.stats.waitingCount)} detail="Cases blocked on customer confirmation." />
          <StatCard label="Resolved" value={String(snapshot.stats.resolvedToday)} detail="Completed paths in the current demo snapshot." />
        </div>
      </section>

      {notice ? (
        <div
          className="panel"
          role="status"
          aria-live="polite"
          style={{
            borderColor: notice.tone === "success" ? "rgba(123, 255, 177, 0.45)" : "rgba(255, 107, 107, 0.45)",
            background: notice.tone === "success" ? "rgba(123, 255, 177, 0.08)" : "rgba(255, 107, 107, 0.08)"
          }}
        >
          {notice.message}
        </div>
      ) : null}

      <section style={{ display: "flex", gap: 18, alignItems: "start", flexWrap: "wrap" }}>
        <aside style={{ flex: "1 1 340px", minWidth: 0, display: "grid", gap: 16 }}>
          <div className="panel" style={{ display: "grid", gap: 14 }}>
            <SectionHeading title="Queue filters" />
            <label style={{ display: "grid", gap: 8 }}>
              <span className="metricLabel">Search cases</span>
              <input
                name="workbenchSearch"
                placeholder="Title, company, customer, order..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span className="metricLabel">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="in_review">In review</option>
                <option value="waiting_customer">Waiting on customer</option>
                <option value="ready_to_ship">Ready to ship</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          </div>

          <div className="panel" style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <SectionHeading title="Case queue" detail={`${visibleCases.length} visible case${visibleCases.length === 1 ? "" : "s"}`} />
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {visibleCases.length === 0 ? <div className="muted">No cases match this filter state.</div> : null}
              {visibleCases.map((item) => (
                <QueueItem key={item.id} item={item} active={item.id === selectedCase?.id} onSelect={setSelectedCaseId} />
              ))}
            </div>
          </div>
        </aside>

        <section style={{ flex: "2 1 620px", minWidth: 0, display: "grid", gap: 16 }}>
          {!selectedCase ? (
            <div className="panel">
              <SectionHeading title="No case selected" detail="Adjust the filters or reset the demo to restore the default queue." />
            </div>
          ) : (
            <>
              <article className="panel" style={{ display: "grid", gap: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="eyebrow">
                      {selectedCase.kind} · {selectedCase.channel} · {selectedCase.orderNumber}
                    </div>
                    <h1 style={{ fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1, margin: 0 }}>{selectedCase.title}</h1>
                    <p className="muted" style={{ margin: 0, maxWidth: 760, lineHeight: 1.55 }}>
                      {selectedCase.summary}
                    </p>
                  </div>
                  <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                    <div style={priorityStyle(selectedCase.priority)}>{selectedCase.priority}</div>
                    <div data-testid="case-status-badge" style={statusStyle(selectedCase.status)}>{statusLabel(selectedCase.status)}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
                  <div className="card">
                    <div className="metricLabel">Customer</div>
                    <div style={{ marginTop: 8 }}>{selectedCase.customerName}</div>
                    <div className="muted">{selectedCase.company}</div>
                  </div>
                  <div className="card">
                    <div className="metricLabel">Owner</div>
                    <div style={{ marginTop: 8 }}>{selectedCase.owner ?? "Unassigned"}</div>
                    <div className="muted">Due {formatDate(selectedCase.dueAt)}</div>
                  </div>
                  <div className="card">
                    <div className="metricLabel">Requested outcome</div>
                    <div style={{ marginTop: 8 }}>{selectedCase.requestedOutcome}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {selectedCase.tags.map((tag) => (
                    <span
                      key={tag}
                      className="tag"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--line)",
                        background: "rgba(255,255,255,0.03)"
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </article>

              <article className="panel" style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(["brief", "activity", "playbook"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={clsx("button", item !== tab && "secondary")}
                      onClick={() => setTab(item)}
                    >
                      {item === "brief" ? "Case brief" : item === "activity" ? "Activity" : "Action playbook"}
                    </button>
                  ))}
                </div>

                {tab === "brief" ? (
                  <div style={{ display: "grid", gap: 16 }}>
                    <div className="card" style={{ display: "grid", gap: 10 }}>
                      <div className="metricLabel">Latest customer context</div>
                      <div style={{ lineHeight: 1.6 }}>{selectedCase.lastCustomerMessage}</div>
                    </div>
                    <div className="card" style={{ display: "grid", gap: 10 }}>
                      <div className="metricLabel">Playbook checklist</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {selectedCase.checklist.map((item) => (
                          <div key={item.id} style={{ display: "flex", gap: 10, alignItems: "start" }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: 20,
                                height: 20,
                                marginTop: 2,
                                borderRadius: 999,
                                border: "1px solid var(--line)",
                                background: item.done ? "var(--green)" : "transparent",
                                boxShadow: item.done ? "0 0 0 4px rgba(123, 255, 177, 0.12)" : "none"
                              }}
                            />
                            <div>{item.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {tab === "activity" ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {selectedCase.activity.map((entry) => (
                      <article
                        key={entry.id}
                        className="card"
                        style={{
                          display: "grid",
                          gap: 8,
                          borderLeft: entry.type === "resolution" ? "4px solid var(--green)" : "4px solid var(--line)"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong>{entry.title}</strong>
                          <div className="muted">{formatDate(entry.at)}</div>
                        </div>
                        <div className="muted">
                          {entry.actor} · {entry.type}
                        </div>
                        <div style={{ lineHeight: 1.6 }}>{entry.detail}</div>
                      </article>
                    ))}
                  </div>
                ) : null}

                {tab === "playbook" ? (
                  <div className="card" style={{ display: "grid", gap: 10 }}>
                    <div className="metricLabel">Suggested operator path</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {selectedCase.suggestedActions.map((item) => (
                        <div key={item} style={{ display: "flex", gap: 10, alignItems: "start" }}>
                          <span className="tag" style={{ marginTop: 2 }}>
                            step
                          </span>
                          <div>{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>

              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <article className="panel" style={{ display: "grid", gap: 14 }}>
                  <SectionHeading title="Queue ownership" detail="A synthetic user can claim a case, move it across queue states, and verify the resulting activity log." />
                  <label style={{ display: "grid", gap: 8 }}>
                    <span className="metricLabel">Owner</span>
                    <select value={ownerDraft} onChange={(event) => setOwnerDraft(event.target.value)}>
                      {snapshot.owners.map((owner) => (
                        <option key={owner} value={owner}>
                          {owner}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 8 }}>
                    <span className="metricLabel">Queue state</span>
                    <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as WorkbenchCaseStatus)}>
                      <option value="new">New</option>
                      <option value="in_review">In review</option>
                      <option value="waiting_customer">Waiting on customer</option>
                      <option value="ready_to_ship">Ready to ship</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => void saveCaseSettings()} disabled={saveDisabled || busyAction === "save"}>
                    {busyAction === "save" ? "Saving..." : "Save queue settings"}
                  </button>
                </article>

                <article className="panel" style={{ display: "grid", gap: 14 }}>
                  <SectionHeading title="Internal notes" detail="Use a realistic note composer instead of a single-shot public form." />
                  <form style={{ display: "grid", gap: 12 }} onSubmit={(event) => void saveNote(event)}>
                    <label style={{ display: "grid", gap: 8 }}>
                      <span className="metricLabel">Operator note</span>
                      <textarea
                        name="operatorNote"
                        rows={6}
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder="Capture the warehouse reply, account context, or the next thing the customer needs."
                      />
                    </label>
                    <button type="submit" disabled={noteDisabled}>
                      {busyAction === "note" ? "Saving note..." : "Save internal note"}
                    </button>
                  </form>
                </article>
              </section>

              <article className="panel" style={{ display: "grid", gap: 14 }}>
                <SectionHeading
                  title="Resolution workflow"
                  detail="Each case exposes a different set of plausible operator actions, with conditional form fields and state changes."
                />
                <form style={{ display: "grid", gap: 14 }} onSubmit={(event) => void applyResolution(event)}>
                  <label style={{ display: "grid", gap: 8 }}>
                    <span className="metricLabel">Resolution action</span>
                    <select
                      value={resolutionKind}
                      onChange={(event) => {
                        const nextKind = event.target.value as WorkbenchResolutionKind;
                        setResolutionKind(nextKind);
                        setCustomerMessageDraft(selectedCase ? defaultCustomerMessage(selectedCase, nextKind) : "");
                      }}
                    >
                      {selectedCase.availableResolutions.map((item) => (
                        <option key={item} value={item}>
                          {resolutionLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {resolutionKind === "expedite_shipment" ? (
                    <label style={{ display: "grid", gap: 8 }}>
                      <span className="metricLabel">Shipping window</span>
                      <select value={shippingWindowDraft} onChange={(event) => setShippingWindowDraft(event.target.value as NonNullable<WorkbenchResolutionInput["shippingWindow"]>)}>
                        <option value="same_day">Same day courier</option>
                        <option value="next_morning">Next morning delivery</option>
                      </select>
                    </label>
                  ) : null}

                  {resolutionKind === "issue_credit" ? (
                    <label style={{ display: "grid", gap: 8 }}>
                      <span className="metricLabel">Credit amount</span>
                      <input
                        name="creditAmount"
                        inputMode="decimal"
                        value={creditAmountDraft}
                        onChange={(event) => setCreditAmountDraft(event.target.value)}
                        placeholder="240"
                      />
                    </label>
                  ) : null}

                  {resolutionKind === "request_confirmation" ? (
                    <label style={{ display: "grid", gap: 8 }}>
                      <span className="metricLabel">Requested detail</span>
                      <select
                        value={requestedFieldDraft}
                        onChange={(event) => setRequestedFieldDraft(event.target.value as NonNullable<WorkbenchResolutionInput["requestedField"]>)}
                      >
                        <option value="admin_email_on_sso_provider">Admin email on SSO provider</option>
                        <option value="serial_number">Device serial number</option>
                        <option value="shipping_address">Shipping address</option>
                        <option value="invoice_contact">Invoice contact</option>
                      </select>
                    </label>
                  ) : null}

                  <label style={{ display: "grid", gap: 8 }}>
                    <span className="metricLabel">Customer-facing summary</span>
                    <textarea
                      name="customerMessage"
                      rows={5}
                      value={customerMessageDraft}
                      onChange={(event) => setCustomerMessageDraft(event.target.value)}
                    />
                  </label>

                  <button type="submit" disabled={resolutionDisabled}>
                    {busyAction === "resolve" ? "Applying..." : resolutionLabel(resolutionKind)}
                  </button>
                </form>
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
