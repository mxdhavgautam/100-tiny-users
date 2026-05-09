import { WorkbenchClient } from "@/src/components/WorkbenchClient";
import { readWorkbenchSnapshot } from "@/src/lib/workbenchData";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const snapshot = await readWorkbenchSnapshot();

  return <WorkbenchClient initialSnapshot={snapshot} />;
}
