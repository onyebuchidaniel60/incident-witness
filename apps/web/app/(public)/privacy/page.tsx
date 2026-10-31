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

      <PlaceholderNotice title="Current data boundary">
        <p>
          This staging deployment includes Supabase Auth sessions, provider host and evidence-session
          records, signed observations and sealed bundles. The browser verifier processes a selected
          bundle locally and does not upload it. No third-party analytics is included. Do not use
          real customer data, credentials or production evidence in staging.
        </p>
      </PlaceholderNotice>

      <section className="iw-panel p-5">
        <h2 className="text-lg text-iw-ink">Planned privacy requirements</h2>
        <p className="mt-2 max-w-4xl text-[11px] leading-6 text-iw-muted">
          Before production, the operator must approve what data is collected, how long it is
          retained, how deletion and backups are handled, and how exported bundles are treated.
          Self-service account deletion is not part of the MVP. The repository privacy and security
          design is available in the documentation.
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-[10px] font-medium">
        <Link href="/docs" className="iw-link">
          Documentation
        </Link>
        <Link href="/terms" className="iw-link">
          Terms placeholder
        </Link>
      </div>
    </div>
  );
}
