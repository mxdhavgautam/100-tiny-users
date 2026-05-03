import type { Persona, PersonaArchetype } from "../src/lib/types";

const archetypes: PersonaArchetype[] = [
  "impatient-founder",
  "screen-reader-user",
  "non-english-user",
  "malicious-submitter",
  "judge-slow-network",
  "duplicate-teammate",
  "massive-text-paster",
  "keyboard-only-user",
  "normal-founder",
  "mobile-user"
];

function padUser(index: number): string {
  return `U${String(index).padStart(3, "0")}`;
}

export function buildPersonas(count: number): Persona[] {
  const duplicateSeen = { value: false };
  return Array.from({ length: count }, (_, itemIndex) => {
    const number = itemIndex + 1;
    const archetype = archetypes[itemIndex % archetypes.length];
    const id = padUser(number);
    const duplicateTeam = archetype === "duplicate-teammate";
    const expectsDuplicateBlocked = duplicateTeam && duplicateSeen.value;
    if (duplicateTeam) {
      duplicateSeen.value = true;
    }

    return {
      id,
      name: `${id} ${archetype.replaceAll("-", " ")}`,
      archetype,
      goal: "Submit a hackathon project through the browser UI.",
      language: archetype === "non-english-user" ? "Spanish" : "TypeScript",
      locale: archetype === "non-english-user" ? "es-MX" : "en-US",
      patienceMs: archetype === "impatient-founder" ? 2500 : 7000,
      viewport: archetype === "mobile-user" ? { width: 390, height: 760 } : { width: 1280, height: 900 },
      assistiveTech: archetype === "screen-reader-user" ? "screen-reader" : archetype === "keyboard-only-user" ? "keyboard-only" : "none",
      networkProfile: archetype === "judge-slow-network" ? "slow-3g" : "normal",
      malicious: archetype === "malicious-submitter",
      textVolume: archetype === "massive-text-paster" ? "massive" : archetype === "non-english-user" ? "large" : "normal",
      duplicateTeam,
      expectsDuplicateBlocked
    };
  });
}

export function findPersona(count: number, personaId: string): Persona | null {
  return buildPersonas(Math.max(count, 50)).find((persona) => persona.id === personaId) ?? null;
}
