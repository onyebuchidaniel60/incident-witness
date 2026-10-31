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
          This staging deployment includes Supabase Auth sessions, provider host and
          evidence-session records, signed observations and sealed bundles. The browser verifier
          processes a selected bundle locally and does not upload it. No third-party analytics is
          included. Do not use real customer data, credentials or production evidence in staging.
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
