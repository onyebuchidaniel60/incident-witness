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
          Incident Witness is in Phase 7 implementation. No public production service, paid plan,
          marketplace integration, adjudication process or service-level commitment is offered by
          this deployment. Operator-approved terms are required before production.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-4 text-[10px] font-medium">
        <Link href="/docs" className="iw-link">
          Documentation
        </Link>
        <Link href="/privacy" className="iw-link">
          Privacy placeholder
        </Link>
      </div>
    </div>
  );
}
