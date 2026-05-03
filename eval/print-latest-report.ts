import { promises as fs } from "node:fs";
import { LATEST_REPORT_PATH } from "../src/lib/paths";
import type { EvalReport } from "../src/lib/types";

const raw = await fs.readFile(LATEST_REPORT_PATH, "utf8");
const report = JSON.parse(raw) as EvalReport;
console.log(`${report.summary.passed}/${report.summary.total} passed (${report.summary.scorePercent}%)`);
for (const cluster of report.summary.clusters) {
  console.log(`- ${cluster.count} x ${cluster.title} [${cluster.severity}]`);
}
