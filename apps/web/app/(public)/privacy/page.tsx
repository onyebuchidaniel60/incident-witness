import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Privacy placeholder",
};

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Privacy"
        title="Privacy policy not yet approved."
        description="This page is a structural placeholder. Operator-approved privacy content is required before production; this text is not a legal policy."
      />

      <PlaceholderNotice title="Phase 1 data boundary">
        <p>
          Phase 1 serves static frontend pages only. There is no authentication, user account,
          evidence database, API, analytics integration or application authentication cookie. Do
          not submit personal data, credentials or incident evidence through this shell.
        </p>
      </PlaceholderNotice>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Planned privacy requirements</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Before production, the operator must approve what data is collected, how long it is
          retained, how deletion and backups are handled, and how exported bundles are treated.
          Self-service account deletion is not part of the MVP. The repository privacy and security
          design is available in the documentation.
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/docs" className="font-medium text-slate-800 underline hover:text-slate-950">
          Documentation
        </Link>
        <Link href="/terms" className="font-medium text-slate-800 underline hover:text-slate-950">
          Terms placeholder
        </Link>
      </div>
    </div>
  );
}
