import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { repositoryUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Current privacy and data-boundary status for the Incident Witness staging deployment. Operator-approved legal review is pending; this page is not a published privacy policy.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Privacy"
        title="Privacy policy not yet approved."
        description="This page explains the current staging data boundary. It is not a legal privacy policy, and operator-approved legal review is pending."
      />

      <PlaceholderNotice title="Legal review pending">
        <p>
          No privacy policy, data-processing agreement, retention schedule or jurisdictional
          statement has been approved for publication. Do not treat this page as legal advice or as
          a contractual commitment. The operator must supply approved policy content before a
          production service is offered.
        </p>
      </PlaceholderNotice>

      <section className="iw-panel p-5" aria-labelledby="privacy-data">
        <h2 id="privacy-data" className="text-lg text-iw-ink">
          Data handled by this staging deployment
        </h2>
        <ul className="mt-3 space-y-2 text-[11px] leading-6 text-iw-muted">
          <li>
            Supabase Auth processes the provider email address and session cookies used for
            magic-link sign-in.
          </li>
          <li>
            Provider account records include host alias, verified hostname, host and session
            lifecycle metadata, source-key status and audit events.
          </li>
          <li>
            Evidence sessions contain typed, bounded, signed observations from the host agent,
            renter SDK and platform-operated probe, plus sealed bundle metadata.
          </li>
          <li>
            The browser verifier reads a selected bundle locally with the File API. It does not
            upload the bundle or send its contents to the API.
          </li>
          <li>
            No third-party analytics, advertising tracker, payment service or AI provider is
            included in this application.
          </li>
        </ul>
      </section>

      <section className="iw-panel p-5" aria-labelledby="privacy-exclusions">
        <h2 id="privacy-exclusions" className="text-lg text-iw-ink">
          Data intentionally excluded
        </h2>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          Event payloads are typed and bounded. Incident Witness does not collect free-form system
          logs, prompts, model inputs or outputs, datasets, file contents, workload stdout/stderr,
          environment variables, arbitrary process data or credentials. Missing telemetry is
          recorded as unavailable or as a gap, not fabricated.
        </p>
      </section>

      <section className="iw-panel p-5" aria-labelledby="privacy-retention">
        <h2 id="privacy-retention" className="text-lg text-iw-ink">
          Retention, deletion and sharing
        </h2>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          Retention periods, backup handling, deletion procedures and data-subject request handling
          have not been approved. Self-service account deletion is not part of the MVP. A sealed
          bundle is immutable and may reveal a host alias, hostname, operational telemetry and
          timeline; inspect a bundle before sharing it. Do not use real customer data, production
          credentials or production evidence in this staging deployment.
        </p>
      </section>

      <section className="iw-panel p-5" aria-labelledby="privacy-security">
        <h2 id="privacy-security" className="text-lg text-iw-ink">
          Security and cryptographic limits
        </h2>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          A signature verifies integrity and provenance from a key. It does not prove that a sensor
          was truthful, that a key was uncompromised or that a physical cause is established. The
          platform-operated probe is operated by the platform, not by an independent third party.
          Read the repository privacy and security model for the current controls and threat
          boundaries.
        </p>
        <p className="mt-3 text-[10px]">
          <a
            href={`${repositoryUrl}/blob/main/docs/PRIVACY_SECURITY.md`}
            className="iw-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            docs/PRIVACY_SECURITY.md
          </a>
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-[10px] font-medium">
        <Link href="/docs" className="iw-link">
          Documentation
        </Link>
        <Link href="/terms" className="iw-link">
          Terms status
        </Link>
      </div>
    </div>
  );
}
