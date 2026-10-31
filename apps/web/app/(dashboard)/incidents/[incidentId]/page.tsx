import { PageIntro } from "@/components/page-intro";
import { IncidentDetailView } from "@/components/views/incident-detail-view";

export const metadata = {
  title: "Evidence Session Detail",
  description:
    "Source-attributed observations, lifecycle controls, deterministic assessment and sealed-bundle download for one owned Incident Witness session.",
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
        title="Evidence session"
        description="Source-attributed observations, lifecycle controls and sealed-bundle download for one owned evidence session."
      />
      <IncidentDetailView incidentId={incidentId} />
    </div>
  );
}
