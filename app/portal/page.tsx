import { readSubmissions } from "@/src/lib/storage";
import { BUG_LONG_TEXT_LAYOUT, BUG_SCREEN_READER_SUBMIT } from "@/src/demo/bugSwitches";
import { PortalClient } from "@/src/components/PortalClient";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const submissions = await readSubmissions();

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">Hackathon Project Submission Portal</div>
          <div className="muted">Product promise: get every team submitted cleanly.</div>
        </div>
        <a className="button secondary" href="/">
          Dashboard
        </a>
      </div>
      <PortalClient
        initialSubmissions={submissions}
        screenReaderSubmitBug={BUG_SCREEN_READER_SUBMIT}
        longTextLayoutBug={BUG_LONG_TEXT_LAYOUT}
      />
    </main>
  );
}
