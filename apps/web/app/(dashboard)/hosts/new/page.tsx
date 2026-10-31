import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Add host placeholder",
};

export default function NewHostPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Hosts / new"
        title="Host registration is not connected in Phase 1."
        description="The planned flow captures a host alias and public hostname, then issues a DNS TXT challenge and verifies the fixed HTTPS health endpoint."
      />

      <PlaceholderNotice title="No form is active">
        <p>
          This page intentionally has no input form. Submitting a hostname would be misleading
          until endpoint verification, authentication and the API exist.
        </p>
      </PlaceholderNotice>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Planned preconditions</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>An authenticated provider account.</li>
          <li>A Linux x86_64 host under the provider account&apos;s control.</li>
          <li>A public DNS hostname and HTTPS endpoint on port 443.</li>
          <li>The fixed health route serving the exact expected response.</li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/hosts" className="font-medium underline">
          Host list placeholder
        </Link>
        <Link href="/docs" className="font-medium underline">
          Documentation
        </Link>
      </div>
    </div>
  );
}
