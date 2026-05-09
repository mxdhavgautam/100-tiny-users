"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Submission, SubmissionResponse } from "@/src/lib/types";

type Props = {
  initialSubmissions: Submission[];
};

type FormState = {
  teamName: string;
  contactEmail: string;
  projectTitle: string;
  primaryLanguage: string;
  projectIdea: string;
};

const emptyForm: FormState = {
  teamName: "",
  contactEmail: "",
  projectTitle: "",
  primaryLanguage: "TypeScript",
  projectIdea: ""
};

export function PortalClient({ initialSubmissions }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions.slice(0, 20));
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");

    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const result: SubmissionResponse = await response.json();
    setIsError(!result.ok);
    setStatus(result.message);

    if (result.ok) {
      setSubmissions((current) => [result.submission, ...current.filter((item) => item.id !== result.submission.id)].slice(0, 20));
      setForm(emptyForm);
    }

    setPending(false);
  }

  return (
    <section className="portalLayout" aria-label="Submission workspace">
      <form className="panel formGrid" onSubmit={onSubmit}>
        <span data-testid="portal-hydrated" data-ready={hydrated ? "true" : "false"} hidden />
        <h1>Submit your hack</h1>
        <label>
          Team name
          <input
            name="teamName"
            value={form.teamName}
            onChange={(event) => setForm({ ...form, teamName: event.target.value })}
            required
          />
        </label>
        <label>
          Contact email
          <input
            name="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
            required
          />
        </label>
        <label>
          Project title
          <input
            name="projectTitle"
            value={form.projectTitle}
            onChange={(event) => setForm({ ...form, projectTitle: event.target.value })}
            required
          />
        </label>
        <label>
          Primary language
          <select
            name="primaryLanguage"
            value={form.primaryLanguage}
            onChange={(event) => setForm({ ...form, primaryLanguage: event.target.value })}
          >
            <option>TypeScript</option>
            <option>Python</option>
            <option>Rust</option>
            <option>Spanish</option>
            <option>Japanese</option>
          </select>
        </label>
        <label>
          Project idea
          <textarea
            name="projectIdea"
            value={form.projectIdea}
            onChange={(event) => setForm({ ...form, projectIdea: event.target.value })}
            required
          />
        </label>
        <button data-testid="submit-project" disabled={pending}>
          Submit project
        </button>
        <div data-testid="submission-status" className={clsx("status", isError && "error")} aria-live="polite">
          {status}
        </div>
      </form>
      <aside className="panel" aria-label="Recent submissions">
        <h2>Recent submissions</h2>
        <div className="submissionList">
          {submissions.length === 0 ? <p className="muted">No projects submitted yet.</p> : null}
          {submissions.map((submission) => (
            <article className="submissionItem" key={submission.id}>
              <h3>{submission.teamName}</h3>
              <p className="muted">
                {submission.primaryLanguage} · {submission.projectTitle}
              </p>
              <p className={clsx("ideaText", "fixed")}>{submission.projectIdea}</p>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}
