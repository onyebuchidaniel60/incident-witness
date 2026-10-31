import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Dashboard placeholder",
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Provider workspace"
        title="Dashboard placeholder"
        description="This route will become the authenticated provider overview for host health, evidence sessions and sealed records. No account, host or incident data is connected in Phase 1."
      />

      <PlaceholderNotice title="No provider data">
        <p>
          There are no hosts, sessions, assessments or bundles to show. The cards below describe
          the intended destinations; they do not display fabricated operational status.
        </p>
      </PlaceholderNotice>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Hosts</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Host registration, endpoint ownership verification, agent enrollment and revocation
            will be connected in later phases.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/hosts" className="font-medium underline">
              Host list placeholder
            </Link>
            <Link href="/hosts/new" className="font-medium underline">
              Add-host placeholder
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Evidence sessions</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Bounded capture, source health, deterministic assessment and sealed bundle download are
            not implemented in Phase 1.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/incidents" className="font-medium underline">
              Session list placeholder
            </Link>
            <Link href="/incidents/new" className="font-medium underline">
              New-session placeholder
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
