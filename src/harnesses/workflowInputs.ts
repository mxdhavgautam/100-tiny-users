import type { Persona } from "@/src/lib/types";

export type WorkflowInputValue = string;
export type WorkflowInputMap = Record<string, WorkflowInputValue>;

const massiveToken = "TINYUSER".repeat(900);

export function workflowInputsForPersona(workflowId: string, persona: Persona): WorkflowInputMap {
  if (workflowId === "submit-project") {
    const teamName = persona.duplicateTeam ? "Repeatable Robots" : `${persona.id} ${persona.archetype}`;
    const maliciousIdea = "<script>window.__HTU_XSS=true</script><img src=x onerror='window.__HTU_XSS=true'>";
    const nonEnglishIdea = "Una herramienta para ayudar a equipos pequenos a entregar proyectos con confianza.";
    const massiveIdea = `We pasted a huge payload from a sponsor deck:\n${massiveToken}`;

    return {
      teamName,
      contactEmail: `${persona.id.toLowerCase()}@example.test`,
      projectTitle: persona.malicious ? "XSS Probe" : `Project ${persona.id}`,
      primaryLanguage: persona.language,
      projectIdea: persona.malicious ? maliciousIdea : persona.textVolume === "massive" ? massiveIdea : persona.locale === "es-MX" ? nonEnglishIdea : "A concise tool that helps judges review projects faster."
    };
  }

  if (workflowId === "claim-shipping-escalation") {
    return {
      ownerName: "Avery Kim",
      queueState: "In review"
    };
  }

  if (workflowId === "search-billing-by-duplicate-charge") {
    return {
      queueSearch: "duplicate charge"
    };
  }

  if (workflowId === "request-admin-identity-confirmation") {
    return {
      resolutionAction: "Request customer confirmation",
      requestedField: "Admin email on SSO provider",
      customerMessage: "Please confirm the admin email now attached to the SSO provider so we can finish the access recovery."
    };
  }

  if (workflowId === "issue-credit-with-followup") {
    return {
      resolutionAction: "Issue service credit",
      creditAmount: "240",
      customerMessage: "We are issuing the service credit now and will send the formal credit memo in a separate finance follow-up."
    };
  }

  throw new Error(`Unsupported workflow input generator: ${workflowId}`);
}
