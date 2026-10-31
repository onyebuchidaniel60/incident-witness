import { PageIntro } from "@/components/page-intro";
import { IncidentsView } from "@/components/views/incidents-view";

export const metadata = {
  title: "Evidence Sessions",
  description:
    "Owned Incident Witness capture sessions with status, host, capture window, event count and sealed assessment.",
};

export default function IncidentsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Evidence sessions"
        title="Evidence sessions"
        description="Bounded capture sessions owned by your provider account. Sealed records are immutable; active sessions continue to accept in-window signed observations until ended."
      />
      <IncidentsView />
    </div>
  );
}
