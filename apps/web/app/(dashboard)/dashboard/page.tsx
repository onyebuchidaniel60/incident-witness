import { PageIntro } from "@/components/page-intro";
import { DashboardView } from "@/components/views/dashboard-view";

export const metadata = {
  title: "Dashboard",
  description:
    "Provider workspace overview: owned hosts, active evidence sessions and recent sealed records from the authenticated Incident Witness API.",
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Provider workspace"
        title="Provider dashboard"
        description="Hosts, evidence sessions and sealed records are loaded from your authenticated provider account. Missing sources and unavailable observations are shown explicitly, never as healthy defaults."
      />
      <DashboardView />
    </div>
  );
}
