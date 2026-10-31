import type { Metadata } from "next";
import Link from "next/link";

import { E2eSignInButton } from "@/components/e2e-sign-in-button";
import { LoginForm } from "@/components/login-form";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Provider Sign-In",
  description:
    "Sign in to the Incident Witness provider workspace with a Supabase magic link. Provider routes are private and are not indexed.",
  robots: { index: false, follow: false },
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <div className="iw-panel p-5">
          <LoginForm initialError={initialError} />
        </div>

        <div className="space-y-4">
          <E2eSignInButton />
          <div className="flex flex-wrap gap-4 text-[10px] font-medium">
            <Link href="/" className="iw-link">
              Return home
            </Link>
            <Link href="/docs" className="iw-link">
              Read the documentation
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
