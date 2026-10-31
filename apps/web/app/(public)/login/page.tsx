import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { PageIntro } from "@/components/page-intro";

export const metadata = {
  title: "Provider sign-in",
};

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Provider access"
        title="Provider sign-in"
        description="Use a one-time email code to access the provider workspace. There is no password stored by Incident Witness."
      />

      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-5">
        <LoginForm />
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-semibold">Phase 2 authentication foundation</p>
        <p className="mt-1">
          The login form is connected to Supabase Auth. The Supabase email template must include
          the one-time code for this flow, and the deployment origin must be allow-listed in
          Supabase Auth settings. Until those dashboard settings are confirmed, email delivery may
          fail even though the application is configured.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
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
