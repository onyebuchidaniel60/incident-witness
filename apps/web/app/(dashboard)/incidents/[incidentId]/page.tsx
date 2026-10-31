import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Evidence session detail placeholder",
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Evidence sessions / detail"
        title="Session timeline placeholder"
        description="This route will show a deterministic source-attributed timeline, gaps, source health, lifecycle controls, assessment language and sealed bundle download."
      />

      <PlaceholderNotice title="No evidence timeline exists">
        <p>
          The URL contains the route parameter <code className="font-mono">{incidentId}</code>, but
          no session or evidence record is queried. No assessment, status or verified state is
          fabricated.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/incidents" className="font-medium underline">
          Back to session list placeholder
        </Link>
        <Link href="/docs" className="font-medium underline">
          Documentation
        </Link>
      </div>
    </div>
  );
}
