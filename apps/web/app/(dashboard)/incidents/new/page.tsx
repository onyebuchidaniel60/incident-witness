import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "New evidence session placeholder",
};

export default function NewIncidentPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Evidence sessions / new"
        title="Session creation is not connected in Phase 1."
        description="The planned flow selects an active host, sets a bounded capture duration and optional opaque workload reference, then opens a collecting session and a one-time renter invitation."
      />

      <PlaceholderNotice title="No session form is active">
        <p>
          This page contains no create control. Session limits, host freshness checks and
          transactional lifecycle rules are not implemented yet.
        </p>
      </PlaceholderNotice>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Planned capture constraints</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Duration between 2 and 240 minutes, defaulting to 30.</li>
          <li>One active session per host and at most three per provider account.</li>
          <li>A fresh operational-presence heartbeat before creation.</li>
          <li>A 24-hour ingestion grace period after capture ends.</li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          These are documented design constraints, not active behaviour in this deployment.
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/incidents" className="font-medium underline">
          Session list placeholder
        </Link>
        <Link href="/docs" className="font-medium underline">
          Documentation
        </Link>
      </div>
    </div>
  );
}
