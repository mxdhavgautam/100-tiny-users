import { promises as fs } from "node:fs";
import { ARTIFACTS_DIR, BUG_SWITCHES_PATH, DATA_DIR } from "../src/lib/paths";

const buggySwitches = `export const BUG_DUPLICATE_TEAM_OVERWRITE = true;
export const BUG_SCREEN_READER_SUBMIT = true;
export const BUG_LONG_TEXT_LAYOUT = true;
`;

export async function resetDemo(): Promise<void> {
  await fs.rm(ARTIFACTS_DIR, { recursive: true, force: true });
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile("data/submissions.json", "[]\n", "utf8");
  await fs.writeFile(BUG_SWITCHES_PATH, buggySwitches, "utf8");
  console.log("Reset submissions, artifacts, and intentional bug switches.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await resetDemo();
}
