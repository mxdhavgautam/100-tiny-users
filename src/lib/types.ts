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
export type FailureConfidence = "certain-bug" | "likely-bug" | "flaky-signal" | "environment-issue" | "blocked-setup" | "harness-limitation";
export type FailureCategory = "product-bug" | "test-bug" | "flaky-environment" | "auth-setup" | "harness-limitation" | "blocked-policy";
export type PersonaStatus = "passed" | "failed" | "blocked" | "errored";
export type ArtifactKind =
  | "trace"
  | "screenshot"
  | "console"
  | "network"
  | "config"
  | "prompt"
  | "repair"
  | "report"
  | "accessibility"
  | "dom"
  | "cohort"
  | "diff"
  | "validation"
  | "log";

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

export type ArtifactRef = {
  kind: ArtifactKind;
  path: string;
  description: string;
};

export type OracleFinding = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  impact: string;
  confidence: FailureConfidence;
  category: FailureCategory;
  evidence: string[];
};

export type Failure = {
  kind: FailureKind;
  title: string;
  severity: FailureSeverity;
  oracleId: string;
  expected: string;
  actual: string;
  impact: string;
  confidence: FailureConfidence;
  category: FailureCategory;
  selector?: string;
  workflowId?: string;
  stepId?: string;
  screenshotPath?: string;
  replayCommand?: string;
  artifactRefs?: ArtifactRef[];
};

export type PersonaResult = {
  runId: string;
  workflowId: string;
  harnessKind: "deterministic-playwright" | "semantic-mini-user" | "external-webhook";
  persona: Persona;
  status: PersonaStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  observations: string[];
  artifactRefs: ArtifactRef[];
  findings: OracleFinding[];
  failure?: Failure;
};

export type EvalSummary = {
  runId: string;
  label: string;
  url: string;
  artifactRefs?: ArtifactRef[];
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  errored: number;
  scorePercent: number;
  clusters: FailureCluster[];
};

export type FailureCluster = {
  kind: FailureKind;
  title: string;
  severity: FailureSeverity;
  oracleId: string;
  confidence: FailureConfidence;
  category: FailureCategory;
  fingerprint: string;
  count: number;
  personaIds: string[];
  replayCommands: string[];
  representative: Failure;
};

export type EvalReport = {
  summary: EvalSummary;
  results: PersonaResult[];
  config?: import("@/src/lib/config").TargetConfig;
  harnessPreviews?: {
    kind: "deterministic-playwright" | "semantic-mini-user" | "external-webhook";
    status: "available" | "dry-run" | "disabled";
    summary: string;
  }[];
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
  phase: "baseline" | "patched" | "suite";
  runId: string;
  label: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  blocked: number;
  errored: number;
  scorePercent: number;
  updatedAt: string;
};

export type DemoSuiteRun = {
  label: string;
  workflowId: string;
  harnessKind: "deterministic-playwright" | "semantic-mini-user" | "external-webhook";
  summary: EvalSummary;
};

export type DemoSession = {
  mode?: "legacy-before-after" | "full-suite";
  baselineRunId?: string;
  patchedRunId?: string;
  baseline?: EvalSummary;
  patched?: EvalSummary;
  suiteRuns?: DemoSuiteRun[];
  activeLabel?: string;
  activeRun?: RunProgress;
  patchLog: PatchLogEntry[];
  updatedAt: string;
};
