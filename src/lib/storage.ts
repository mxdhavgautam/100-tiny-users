import { promises as fs } from "node:fs";
import { z } from "zod";
import { DATA_DIR, SUBMISSIONS_PATH } from "@/src/lib/paths";
import { normalizeTeamName } from "@/src/lib/normalize";
import type { Submission, SubmissionInput, SubmissionResponse } from "@/src/lib/types";

const submissionInputSchema = z.object({
  teamName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(160),
  projectTitle: z.string().trim().min(1).max(160),
  primaryLanguage: z.string().trim().min(1).max(80),
  projectIdea: z.string().trim().min(1).max(12000)
});

const submissionSchema: z.ZodType<Submission> = submissionInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  normalizedTeamName: z.string()
});

const submissionsSchema = z.array(submissionSchema);

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SUBMISSIONS_PATH);
  } catch {
    await fs.writeFile(SUBMISSIONS_PATH, "[]\n", "utf8");
  }
}

export async function readSubmissions(): Promise<Submission[]> {
  await ensureDataFile();
  const raw = await fs.readFile(SUBMISSIONS_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return submissionsSchema.parse(parsed);
}

async function writeSubmissions(submissions: Submission[]): Promise<void> {
  await ensureDataFile();
  await fs.writeFile(SUBMISSIONS_PATH, `${JSON.stringify(submissions, null, 2)}\n`, "utf8");
}

export async function resetSubmissions(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBMISSIONS_PATH, "[]\n", "utf8");
}

export async function createSubmission(input: unknown): Promise<SubmissionResponse> {
  const parsed = submissionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Submission rejected: check every required field." };
  }

  const normalizedTeamName = normalizeTeamName(parsed.data.teamName);
  const existing = await readSubmissions();
  const duplicateExists = existing.some((item) => item.normalizedTeamName === normalizedTeamName);

  if (duplicateExists) {
    return { ok: false, message: "That team already has a submission. Ask a teammate to edit it instead." };
  }

  const submission: Submission = {
    ...parsed.data,
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    normalizedTeamName
  };

  const next = [submission, ...existing];

  await writeSubmissions(next);
  return { ok: true, message: "Submission received. Judges can now review your project.", submission };
}

export type ValidSubmissionInput = SubmissionInput;
