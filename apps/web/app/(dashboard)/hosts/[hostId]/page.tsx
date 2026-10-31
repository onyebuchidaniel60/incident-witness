import { PageIntro } from "@/components/page-intro";
import { HostDetailView } from "@/components/views/host-detail-view";

export const metadata = {
  title: "Host detail",
};

export default async function HostDetailPage({ params }: { params: Promise<{ hostId: string }> }) {
  const { hostId } = await params;

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Hosts / detail"
        title="Host detail"
        description="Endpoint proof, agent enrollment, source-key status and lifecycle controls for one owned host."
      />
      <HostDetailView hostId={hostId} />
    </div>
  );
}
