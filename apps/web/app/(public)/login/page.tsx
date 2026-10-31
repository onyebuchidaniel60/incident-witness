import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata = {
  title: "Login placeholder",
};

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Provider access"
        title="Sign-in is not connected in Phase 1."
        description="Supabase email one-time-password authentication is planned for Phase 2. This page intentionally contains no login form and no account session."
      />

      <PlaceholderNotice title="No authentication is active">
        <p>
          Do not enter credentials, one-time codes or personal information here. This route exists
          only to establish the public login destination and its future navigation context.
        </p>
      </PlaceholderNotice>

      <div className="flex flex-wrap gap-3">
        <Link href="/" className="font-medium text-slate-800 underline hover:text-slate-950">
          Return home
        </Link>
        <Link href="/docs" className="font-medium text-slate-800 underline hover:text-slate-950">
          Read the documentation
        </Link>
      </div>
    </div>
  );
}
