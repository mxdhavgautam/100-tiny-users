export function normalizeTeamName(teamName: string): string {
  return teamName.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
