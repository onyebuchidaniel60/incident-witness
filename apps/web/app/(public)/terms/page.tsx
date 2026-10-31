import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Terms placeholder",
};

export default function TermsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Terms"
        title="Terms of service not yet approved."
        description="This page is a structural placeholder. It is not a contract, legal notice or authoritative statement of service terms."
      />

      <PlaceholderNotice title="No production service terms">
        <p>
          Incident Witness is in Phase 4 implementation. No public production service, paid plan,
          marketplace integration, adjudication process or service-level commitment is offered by
          this deployment. Operator-approved terms are required before production.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/docs" className="font-medium text-slate-800 underline hover:text-slate-950">
          Documentation
        </Link>
        <Link href="/privacy" className="font-medium text-slate-800 underline hover:text-slate-950">
          Privacy placeholder
        </Link>
      </div>
    </div>
  );
}
