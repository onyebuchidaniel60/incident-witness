import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Hosts placeholder",
};

export default function HostsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Hosts"
        title="Host list placeholder"
        description="This route will list the authenticated provider's Linux GPU hosts and their endpoint, enrollment and source-key state."
      />

      <PlaceholderNotice title="No host records">
        <p>
          No hosts are listed because the host data workflow is not connected. No
          sample host, online status or verified endpoint is being presented as real.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/hosts/new"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
        >
          View add-host placeholder
        </Link>
        <Link href="/dashboard" className="font-medium underline">
          Back to dashboard placeholder
        </Link>
      </div>
    </div>
  );
}
