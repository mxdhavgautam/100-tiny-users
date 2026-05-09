import type { HarnessPreview, UserExecutionAdapter, UserExecutionRequest, UserExecutionResult } from "@/src/harnesses/types";

export const externalWebhookPreview: HarnessPreview = {
  kind: "external-webhook",
  status: "available",
  summary: "Configured webhook execution can run a customer-owned or local mini-user service through the shared harness interface."
};

export const externalWebhookAdapter: UserExecutionAdapter = {
  kind: "external-webhook",
  async execute(request: UserExecutionRequest): Promise<UserExecutionResult> {
    const webhookPath = request.target.externalExecution?.webhookPath ?? "/api/harness-execute";
    const response = await fetch(new URL(webhookPath, request.target.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        browser: undefined
      })
    });

    if (!response.ok) {
      return {
        kind: "external-webhook",
        status: "blocked",
        observations: [
          {
            at: new Date().toISOString(),
            type: "system",
            message: `External webhook returned ${response.status} for workflow ${request.workflow.id}.`
          }
        ],
        artifacts: [],
        replay: {
          command: `POST ${webhookPath}`,
          description: "Re-run the configured external execution webhook for this workflow."
        },
        usage: {
          kind: "external-webhook",
          durationMs: 0,
          steps: 0
        }
      };
    }

    const result = await response.json() as UserExecutionResult;
    return {
      ...result,
      kind: "external-webhook"
    };
  }
};
