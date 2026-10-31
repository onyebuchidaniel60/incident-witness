import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { VerifyView } from "@/components/views/verify-view";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Verify Evidence",
  description:
    "Verify a sealed Incident Witness evidence bundle locally in your browser. Checks schema, manifest digest, platform signature, source certificates, event signatures and ordering. The bundle is never uploaded.",
  alternates: { canonical: "/verify" },
};

export default function VerifyPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Offline verification"
        title="Verify an evidence bundle"
        description="Select a sealed Incident Witness JSON bundle. Verification runs locally in this browser tab and checks integrity, signatures, source certificates and event ordering. The bundle is never uploaded."
      >
        <span className="iw-chip iw-chip-success">
          <Icon name="shield" size="sm" />
          Local only · no upload
        </span>
      </PageIntro>
      <VerifyView />
      <Link href="/docs" className="iw-link inline-flex items-center gap-1.5 text-[10px]">
        Read the protocol documentation
        <Icon name="arrow-up-right" size="sm" />
      </Link>
    </div>
  );
}
