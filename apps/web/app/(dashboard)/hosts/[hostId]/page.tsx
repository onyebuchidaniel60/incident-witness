import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Host detail placeholder",
};

export default async function HostDetailPage({
  params,
}: {
  params: Promise<{ hostId: string }>;
}) {
  const { hostId } = await params;

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Hosts / detail"
        title="Host detail placeholder"
        description="This route will show endpoint proof, agent enrollment, source-key status and host lifecycle controls for one owned host."
      />

      <PlaceholderNotice title="No host lookup occurred">
        <p>
          The URL contains the route parameter <code className="font-mono">{hostId}</code>, but no
          host record is queried and no information is inferred from it.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/hosts" className="font-medium underline">
          Back to host list placeholder
        </Link>
        <Link href="/dashboard" className="font-medium underline">
          Dashboard placeholder
        </Link>
      </div>
    </div>
  );
}
