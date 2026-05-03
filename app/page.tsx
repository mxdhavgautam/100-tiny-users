import { DashboardClient } from "@/src/components/DashboardClient";
import { readDemoSession, readLatestPrompt, readLatestReport } from "@/src/lib/reportReader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [session, latest, prompt] = await Promise.all([readDemoSession(), readLatestReport(), readLatestPrompt()]);

  return <DashboardClient initialSession={session} initialReport={latest} initialPrompt={prompt ?? ""} />;
}
