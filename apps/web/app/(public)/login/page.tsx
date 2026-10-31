import Link from "next/link";

import { E2eSignInButton } from "@/components/e2e-sign-in-button";
import { LoginForm } from "@/components/login-form";
import { PageIntro } from "@/components/page-intro";

export const metadata = {
  title: "Provider sign-in",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError =
    params.error === "invalid_link"
      ? "That login link is invalid or expired. Request a new link."
      : null;

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Provider access"
        title="Provider sign-in"
        description="Enter your email address and we will send a magic sign-in link. There is no password stored by Incident Witness."
      />

      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-5">
        <LoginForm initialError={initialError} />
      </div>

      <div className="max-w-md">
        <E2eSignInButton />
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-semibold">Magic-link sign-in</p>
        <p className="mt-1">
          Supabase sends the default email login link, so no custom SMTP template is required. The
          deployment origin and <code className="font-mono text-xs">/auth/callback</code> path must
          be allow-listed in the Supabase Auth redirect settings. If email delivery is unavailable,
          the sign-in link cannot be issued.
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
