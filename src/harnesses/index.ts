import type { HarnessPreview, UserExecutionAdapter } from "@/src/harnesses/types";
import { deterministicPlaywrightAdapter } from "@/src/harnesses/deterministicPlaywright";
import { semanticMiniUserAdapter } from "@/src/harnesses/semanticMiniUser";
import { externalWebhookAdapter, externalWebhookPreview } from "@/src/harnesses/externalWebhook";

export const userExecutionAdapters: Record<string, UserExecutionAdapter> = {
  [deterministicPlaywrightAdapter.kind]: deterministicPlaywrightAdapter,
  [semanticMiniUserAdapter.kind]: semanticMiniUserAdapter,
  [externalWebhookAdapter.kind]: externalWebhookAdapter
};

export const harnessPreviews: HarnessPreview[] = [
  {
    kind: "deterministic-playwright",
    status: "available",
    summary: "Configured deterministic browser users execute through the shared harness interface."
  },
  {
    kind: "semantic-mini-user",
    status: "available",
    summary: "A browser-driven semantic mini-user executes the same workflow through a looser observe/act loop."
  },
  externalWebhookPreview
];
