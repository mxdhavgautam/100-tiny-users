import { DashboardClient } from "@/src/components/DashboardClient";
import { readDashboardSnapshot } from "@/src/lib/dashboardSurface";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const snapshot = await readDashboardSnapshot();

  return <DashboardClient {...snapshot} />;
}
