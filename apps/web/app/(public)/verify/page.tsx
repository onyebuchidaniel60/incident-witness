import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { VerifyView } from "@/components/views/verify-view";

export const metadata = {
  title: "Verify evidence bundle",
};

export default function VerifyPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Offline verification"
        title="Verify an evidence bundle"
        description="Select a sealed Incident Witness JSON bundle. Verification runs locally in this browser tab and checks integrity, signatures, source certificates and event ordering. The bundle is never uploaded."
      />
      <VerifyView />
      <Link href="/docs" className="font-medium text-slate-800 underline hover:text-slate-950">
        Read the protocol documentation
      </Link>
    </div>
  );
}
