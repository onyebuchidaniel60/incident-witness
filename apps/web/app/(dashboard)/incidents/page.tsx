import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Evidence sessions placeholder",
};

export default function IncidentsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Evidence sessions"
        title="Session list placeholder"
        description="This route will list the authenticated provider's bounded evidence sessions, capture status, source health and sealed results."
      />

      <PlaceholderNotice title="No session records">
        <p>
          No evidence sessions are listed because the evidence data layer is not connected. No sample
          timeline, assessment or sealed record is being presented as real.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/incidents/new"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
        >
          View new-session placeholder
        </Link>
        <Link href="/dashboard" className="font-medium underline">
          Back to dashboard placeholder
        </Link>
      </div>
    </div>
  );
}
