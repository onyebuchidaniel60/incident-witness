import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { NewHostForm } from "@/components/views/new-host-form";

export const metadata = {
  title: "Add host",
};

export default function NewHostPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Hosts / new"
        title="Add a host"
        description="Create the host record first. The next step issues a one-time DNS TXT challenge and verifies the fixed HTTPS health endpoint before an agent enrollment code can be issued."
      />
      <NewHostForm />
      <p className="text-sm">
        <Link href="/hosts" className="font-medium underline">
          Back to hosts
        </Link>
      </p>
    </div>
  );
}
