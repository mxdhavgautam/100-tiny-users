import path from "node:path";

export const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const SUBMISSIONS_PATH = path.join(DATA_DIR, "submissions.json");
export const CONFIGS_DIR = path.join(ROOT_DIR, "configs");
export const ARTIFACTS_DIR = path.join(ROOT_DIR, "artifacts");
export const RUNS_DIR = path.join(ARTIFACTS_DIR, "runs");
export const LATEST_REPORT_PATH = path.join(ARTIFACTS_DIR, "latest-report.json");
export const DEMO_SESSION_PATH = path.join(ARTIFACTS_DIR, "demo-session.json");
export const PROTOTYPE_DB_PATH = path.join(ARTIFACTS_DIR, "prototype.sqlite");
export const BUG_SWITCHES_PATH = path.join(ROOT_DIR, "src", "demo", "bugSwitches.ts");
