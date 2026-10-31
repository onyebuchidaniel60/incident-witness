import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Settings placeholder",
};

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Settings"
        title="Settings are not connected in Phase 1."
        description="This route will show session information, display-name editing, source-key status and host lifecycle controls for the authenticated provider."
      />

      <PlaceholderNotice title="No account or session">
        <p>
          There is no authenticated account, durable session, profile or source key in Phase 1.
          No sign-out or key-revocation control is shown because those actions are not implemented.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard" className="font-medium underline">
          Dashboard placeholder
        </Link>
        <Link href="/docs" className="font-medium underline">
          Documentation
        </Link>
      </div>
    </div>
  );
}
