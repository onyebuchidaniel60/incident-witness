import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Current terms status for the Incident Witness staging deployment. Operator-approved legal terms are pending; this page is not a contract or service-level commitment.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Terms"
        title="Terms of service not yet approved."
        description="This page records the current MVP boundary. It is not a contract, legal notice, acceptable-use policy or service-level commitment."
      />

      <PlaceholderNotice title="Legal review pending">
        <p>
          Operator-approved terms, a legal entity, jurisdiction, contact details and any service
          commitments are still required. Do not treat this page as published terms. No production
          service, paid plan or marketplace integration is offered by this deployment.
        </p>
      </PlaceholderNotice>

      <section className="iw-panel p-5" aria-labelledby="terms-service">
        <h2 id="terms-service" className="text-lg text-iw-ink">
          What this deployment is
        </h2>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          Incident Witness is a portable incident-evidence protocol for decentralized compute. This
          deployment is a staging workspace for provider sign-in, host and evidence-session
          management, signed observation collection, bundle sealing and local verification. It is
          not a GPU marketplace, an outage adjudicator, a reliability-score service, an AI diagnosis
          product or a blockchain application.
        </p>
      </section>

      <section className="iw-panel p-5" aria-labelledby="terms-evidence">
        <h2 id="terms-evidence" className="text-lg text-iw-ink">
          Evidence limitations
        </h2>
        <ul className="mt-3 space-y-2 text-[11px] leading-6 text-iw-muted">
          <li>
            A valid signature establishes integrity and provenance relative to a key. It does not
            prove sensor truth, host integrity or physical root cause.
          </li>
          <li>
            Missing UPS, GPU, renter or probe observations are represented as unavailable or as
            gaps, not as normal readings.
          </li>
          <li>
            Assessments describe an evidence pattern consistent with observations under a named rule
            version. They are not probabilities or definitive causal findings.
          </li>
          <li>
            The platform-operated probe is a separate process operated by the same platform, not an
            independent outside organisation.
          </li>
        </ul>
      </section>

      <section className="iw-panel p-5" aria-labelledby="terms-use">
        <h2 id="terms-use" className="text-lg text-iw-ink">
          Staging use boundary
        </h2>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          Use test data only. Do not submit real customer data, production credentials, production
          evidence, private signing keys or irreversible production actions to this staging
          deployment. No availability, support-response or data-retention guarantee is made.
          Operator-approved terms are required before any production or commercial use.
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-[10px] font-medium">
        <Link href="/docs" className="iw-link">
          Documentation
        </Link>
        <Link href="/privacy" className="iw-link">
          Privacy status
        </Link>
      </div>
    </div>
  );
}
