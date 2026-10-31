import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { NewIncidentForm } from "@/components/views/new-incident-form";

export const metadata = {
  title: "New evidence session",
};

export default function NewIncidentPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Evidence sessions / new"
        title="Start an evidence session"
        description="Select an active host and a bounded capture window. Monitoring begins immediately; events before session creation cannot be reconstructed."
      />
      <NewIncidentForm />
      <p className="text-sm">
        <Link href="/incidents" className="font-medium underline">
          Back to evidence sessions
        </Link>
      </p>
    </div>
  );
}
