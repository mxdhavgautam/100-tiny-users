import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONFIGS_DIR, ROOT_DIR } from "@/src/lib/paths";

const httpMethodSchema = z.enum(["GET", "POST"]);

const urlSchema = z.string().trim().url();

const originSchema = z
  .string()
  .trim()
  .url()
  .transform((value) => new URL(value).origin);

const artifactPolicySchema = z.object({
  screenshots: z.boolean(),
  traces: z.boolean(),
  consoleLogs: z.boolean(),
  networkLogs: z.boolean(),
  retentionDays: z.number().int().positive().max(30)
});

const authSchema = z.object({
  kind: z.literal("none")
});

const disabledResetSchema = z.object({
  kind: z.literal("disabled")
});

const httpResetSchema = z.object({
  kind: z.literal("http"),
  url: urlSchema,
  method: httpMethodSchema,
  dryRun: z.boolean()
});

const resetStrategySchema = z.discriminatedUnion("kind", [disabledResetSchema, httpResetSchema]);

const semanticLocatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: z.string().trim().min(1), name: z.string().trim().min(1) }),
  z.object({ kind: z.literal("label"), text: z.string().trim().min(1) }),
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1) }),
  z.object({ kind: z.literal("placeholder"), text: z.string().trim().min(1) }),
  z.object({ kind: z.literal("testId"), value: z.string().trim().min(1) })
]);

const workflowStepSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["goto", "fill", "click", "expectVisible", "expectText"]),
  route: z.string().trim().startsWith("/").optional(),
  locator: semanticLocatorSchema.optional(),
  fallbackLocator: semanticLocatorSchema.optional(),
  valueKey: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1).optional()
});

const workflowConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  route: z.string().trim().startsWith("/"),
  successCriteria: z.array(z.string().trim().min(1)).min(1),
  failureCriteria: z.array(z.string().trim().min(1)).min(1),
  steps: z.array(workflowStepSchema).min(1)
});

const runProfileSchema = z.object({
  defaultCount: z.number().int().positive().max(500),
  browser: z.enum(["chromium"]),
  deviceProfiles: z.array(z.enum(["desktop", "mobile"])).min(1),
  maxDurationMs: z.number().int().positive()
});

const externalExecutionSchema = z.object({
  webhookPath: z.string().trim().startsWith("/")
});

export const targetConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    environment: z.enum(["local", "public-demo"]),
    baseUrl: urlSchema,
    allowedOrigins: z.array(originSchema).min(1),
    auth: authSchema,
    reset: resetStrategySchema,
    workflows: z.array(workflowConfigSchema).min(1),
    secrets: z.array(z.never()).default([]),
    artifactPolicy: artifactPolicySchema,
    runProfile: runProfileSchema,
    externalExecution: externalExecutionSchema.optional()
  })
  .superRefine((config, context) => {
    const baseOrigin = new URL(config.baseUrl).origin;
    if (!config.allowedOrigins.includes(baseOrigin)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedOrigins"],
        message: `allowedOrigins must include baseUrl origin ${baseOrigin}`
      });
    }

    if (config.reset.kind === "http") {
      const resetOrigin = new URL(config.reset.url).origin;
      if (!config.allowedOrigins.includes(resetOrigin)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reset", "url"],
          message: `reset url origin ${resetOrigin} must be allowed`
        });
      }
    }
  });

export type TargetConfig = z.infer<typeof targetConfigSchema>;
export type WorkflowConfig = TargetConfig["workflows"][number];
export type WorkflowStepConfig = WorkflowConfig["steps"][number];
export type ResetStrategy = TargetConfig["reset"];

export function parseTargetConfig(input: unknown): TargetConfig {
  return targetConfigSchema.parse(input);
}

export async function loadTargetConfig(configPath: string): Promise<TargetConfig> {
  const resolvedPath = path.isAbsolute(configPath) ? configPath : path.join(ROOT_DIR, configPath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return parseTargetConfig(parsed);
}

export async function loadDemoHackathonConfig(): Promise<TargetConfig> {
  return loadTargetConfig(path.join(CONFIGS_DIR, "demo-hackathon.json"));
}
