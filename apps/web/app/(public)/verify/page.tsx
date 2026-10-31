import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Verify placeholder",
};

export default function VerifyPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Offline verification"
        title="The local bundle verifier is not connected in Phase 2."
        description="The intended verifier processes a selected evidence bundle locally, using shared protocol schemas and pinned platform public keys. It will report integrity, signature, trust and completeness checks separately."
      />

      <PlaceholderNotice title="No file input is active">
        <p>
          This page contains no upload control because there is no verification implementation yet.
          A future verifier must not upload bundle contents or claim that a valid signature proves
          sensor truth or root cause.
        </p>
      </PlaceholderNotice>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Planned checks</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Bundle schema and supported protocol version.</li>
          <li>Canonical manifest digest and platform signature.</li>
          <li>Trusted platform key and source key certificates.</li>
          <li>Source event signatures, sequence consistency and bundle consistency.</li>
          <li>Explicit limitations shown alongside any result.</li>
        </ul>
      </div>

      <Link href="/docs" className="font-medium text-slate-800 underline hover:text-slate-950">
        Read the protocol documentation
      </Link>
    </div>
  );
}
