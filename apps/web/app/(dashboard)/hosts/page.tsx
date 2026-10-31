import { PageIntro } from "@/components/page-intro";
import { HostsView } from "@/components/views/hosts-view";

export const metadata = {
  title: "Hosts",
  description:
    "Owned Incident Witness hosts with endpoint verification status, agent presence and lifecycle controls.",
};

export default function HostsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Hosts"
        title="Your hosts"
        description="Only hosts owned by your provider account are listed. A host is usable for an evidence session only after the agent is enrolled and a recent operational-presence heartbeat has been received."
      />
      <HostsView />
    </div>
  );
}
