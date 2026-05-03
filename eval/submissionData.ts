import type { Persona } from "../src/lib/types";

export type PersonaSubmission = {
  teamName: string;
  contactEmail: string;
  projectTitle: string;
  primaryLanguage: string;
  projectIdea: string;
};

const massiveToken = "TINYUSER".repeat(900);

export function submissionForPersona(persona: Persona): PersonaSubmission {
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
