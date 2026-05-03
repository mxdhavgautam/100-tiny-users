export type PersonaArchetype =
  | "impatient-founder"
  | "screen-reader-user"
  | "non-english-user"
  | "malicious-submitter"
  | "judge-slow-network"
  | "duplicate-teammate"
  | "massive-text-paster"
  | "keyboard-only-user"
  | "normal-founder"
  | "mobile-user";

export type AssistiveTech = "none" | "screen-reader" | "keyboard-only";
export type NetworkProfile = "normal" | "slow-3g" | "flaky";
export type TextVolume = "normal" | "large" | "massive";
export type FailureSeverity = "low" | "medium" | "high" | "critical";
export type PersonaStatus = "passed" | "failed";

export type FailureKind =
  | "duplicate-team-overwrite"
  | "screen-reader-submit-not-found"
  | "long-text-layout-overflow"
  | "xss-executed"
  | "submission-rejected"
  | "unexpected-error";

export type Persona = {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  goal: string;
  language: string;
  locale: string;
  patienceMs: number;
  viewport: { width: number; height: number };
  assistiveTech: AssistiveTech;
  networkProfile: NetworkProfile;
  malicious: boolean;
  textVolume: TextVolume;
  duplicateTeam: boolean;
  expectsDuplicateBlocked: boolean;
};

export type Failure = {
  kind: FailureKind;
  title: string;
  severity: FailureSeverity;
  expected: string;
  actual: string;
  selector?: string;
  screenshotPath?: string;
  replayCommand?: string;
};

export type PersonaResult = {
  runId: string;
  persona: Persona;
  status: PersonaStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  observations: string[];
  failure?: Failure;
};

export type EvalSummary = {
  runId: string;
  label: string;
  url: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  failed: number;
  scorePercent: number;
  clusters: FailureCluster[];
};

export type FailureCluster = {
  kind: FailureKind;
  title: string;
  severity: FailureSeverity;
  count: number;
  personaIds: string[];
  replayCommands: string[];
  representative: Failure;
};

export type EvalReport = {
  summary: EvalSummary;
  results: PersonaResult[];
};

export type SubmissionInput = {
  teamName: string;
  contactEmail: string;
  projectTitle: string;
  primaryLanguage: string;
  projectIdea: string;
};

export type Submission = SubmissionInput & {
  id: string;
  createdAt: string;
  normalizedTeamName: string;
};

export type SubmissionResponse =
  | { ok: true; message: string; submission: Submission }
  | { ok: false; message: string };

export type PatchLogEntry = {
  key: string;
  before: string;
  after: string;
};

export type RunProgress = {
  phase: "baseline" | "patched";
  runId: string;
  label: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  scorePercent: number;
  updatedAt: string;
};

export type DemoSession = {
  baselineRunId?: string;
  patchedRunId?: string;
  baseline?: EvalSummary;
  patched?: EvalSummary;
  activeRun?: RunProgress;
  patchLog: PatchLogEntry[];
  updatedAt: string;
};
