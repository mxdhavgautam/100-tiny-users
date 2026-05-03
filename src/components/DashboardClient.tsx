"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoSession, EvalReport } from "@/src/lib/types";

type PersonaCard = {
  name: string;
  tag: string;
  mood: string;
  pet: string;
};

type Props = {
  initialSession: DemoSession | null;
  initialReport: EvalReport | null;
  initialPrompt: string;
};

const personas: PersonaCard[] = [
  { name: "Impatient founder", tag: "rush", mood: "taps submit early", pet: "bolt" },
  { name: "Screen-reader user", tag: "a11y", mood: "hunts by role name", pet: "radar" },
  { name: "Non-English user", tag: "locale", mood: "ships in Spanish", pet: "globe" },
  { name: "Malicious submitter", tag: "hostile", mood: "pastes script bait", pet: "spark" },
  { name: "Slow-network judge", tag: "latency", mood: "waits through drag", pet: "timer" },
  { name: "Duplicate teammate", tag: "integrity", mood: "reuses team name", pet: "clone" },
  { name: "Massive text paster", tag: "layout", mood: "drops huge tokens", pet: "brick" },
  { name: "Keyboard-only user", tag: "keyboard", mood: "tabs and enters", pet: "key" }
];

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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  return response.json();
}

export function DashboardClient({ initialSession, initialReport, initialPrompt }: Props) {
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
        // The dashboard should stay readable while artifacts are being rewritten.
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 1000);
    void poll();
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
        // Prompt is optional until the baseline run completes.
      }
    };
    void loadPrompt();
    const interval = window.setInterval(() => {
      void loadPrompt();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const baseline = session?.baseline;
  const patched = session?.patched;
  const active = session?.activeRun;
  const clusters = baseline?.clusters.length ? baseline.clusters : report?.summary.clusters ?? [];
  const beforeText = baseline ? `${baseline.passed}/${baseline.total}` : "No run";
  const afterText = patched ? `${patched.passed}/${patched.total}` : "No run";
  const delta = baseline && patched ? patched.passed - baseline.passed : 0;
  const beforePercent = percent(baseline?.passed, baseline?.total);
  const afterPercent = percent(patched?.passed, patched?.total);
  const activeText = active ? `${active.phase} ${active.completed}/${active.total}` : patched ? "complete" : "idle";

  const promptPreview = useMemo(() => {
    if (!prompt.trim()) {
      return "No Codex patch prompt has been generated yet.";
    }
    return prompt;
  }, [prompt]);

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptPreview);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy prompt"), 1200);
  }

  return (
    <main className="shell">
      <nav className="topbar">
        <div>
          <div className="brand">Hundred Tiny Users</div>
          <div className="muted">Browser-only synthetic colony lab</div>
        </div>
        <div className="livePill">
          <span />
          {activeText}
        </div>
      </nav>
      <section className="hero">
        <div>
          <div className="eyebrow">Empirical eval loop</div>
          <h1>Let fake users suffer first.</h1>
          <p className="lede">
            A local eval lab where deterministic browser personas attack a hackathon submission portal, cluster what breaks,
            generate replayable reports, patch the root cause, and rerun the same colony.
          </p>
          <div className="heroActions">
            <a className="button" href="/portal">
              Open target
            </a>
            <a className="button secondary" href="/artifacts/latest-report.json">
              Inspect report
            </a>
            <button className="button secondary" type="button" onClick={() => setPromptOpen((value) => !value)}>
              {promptOpen ? "Hide prompt" : "View prompt"}
            </button>
            <button className="button secondary" type="button" onClick={() => void copyPrompt()}>
              {copyLabel}
            </button>
          </div>
        </div>
        <div className="commandPanel">
          <h2>Demo command</h2>
          <pre className="code">bun run demo:full</pre>
          <p className="muted">Runs baseline, patches the known faults, reruns the colony, then keeps this server alive.</p>
        </div>
      </section>
      {promptOpen ? (
        <section className="promptPanel">
          <div className="promptHeader">
            <h2>Codex patch prompt</h2>
            <a className="button secondary" href="/artifacts/codex-patch-prompt">
              Open raw
            </a>
          </div>
          <pre className="code promptCode">{promptPreview}</pre>
        </section>
      ) : null}
      <section className="scoreboard" aria-label="Scoreboard">
        <div className="scoreCard before">
          <div className="metricLabel">Before</div>
          <div className="metric">{beforeText}</div>
          <div className="meter" aria-label={`Before score ${beforePercent}%`}>
            <span style={{ width: `${beforePercent}%` }} />
          </div>
          {active?.phase === "baseline" ? <p className="muted">Running {active.completed}/{active.total}</p> : null}
        </div>
        <div className="scoreCard after">
          <div className="metricLabel">After</div>
          <div className="metric">{afterText}</div>
          <div className="meter" aria-label={`After score ${afterPercent}%`}>
            <span style={{ width: `${afterPercent}%` }} />
          </div>
          {active?.phase === "patched" ? <p className="muted">Running {active.completed}/{active.total}</p> : null}
        </div>
        <div className="scoreCard delta">
          <div className="metricLabel">Patch delta</div>
          <div className="metric">{delta >= 0 ? `+${delta}` : delta}</div>
          <p className="muted">Same users. Same expectations. Better app.</p>
        </div>
      </section>
      <section className="labGrid">
        <div>
          <h2>Top failure clusters</h2>
          <div className="clusterList">
            {clusters.length === 0 ? <div className="panel muted">No failures reported yet.</div> : null}
            {clusters.map((cluster) => (
              <article className="clusterCard" key={cluster.kind}>
                <div className={`severity ${cluster.severity}`}>{cluster.severity}</div>
                <div>
                  <strong>
                    {cluster.count} x {cluster.title}
                  </strong>
                  <p className="muted">personas {cluster.personaIds.join(", ")}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div>
          <h2>Patch log</h2>
          <div className="patchList">
            {(session?.patchLog ?? []).length === 0 ? <div className="panel muted">No patch applied yet.</div> : null}
            {(session?.patchLog ?? []).map((entry) => (
              <div className="patchRow" key={entry.key}>
                <strong>{entry.key}</strong>
                <code>false</code>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section>
        <h2>Tiny user sprites</h2>
        <div className="personaGrid">
          {personas.map((persona) => (
            <div className="personaCard" key={persona.name}>
              <div className="spriteShell" aria-hidden="true">
                <div className={`spritePet ${persona.pet}`} />
              </div>
              <div>
                <strong>{persona.name}</strong>
                <p className="muted">{persona.mood}</p>
                <div className="tag">{persona.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
