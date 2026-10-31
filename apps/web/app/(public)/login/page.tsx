import Link from "next/link";

import { E2eSignInButton } from "@/components/e2e-sign-in-button";
import { LoginForm } from "@/components/login-form";
import { PageIntro } from "@/components/page-intro";
import { Icon } from "@/components/ui/icon";

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <div className="iw-panel p-5">
          <LoginForm initialError={initialError} />
        </div>

        <div className="space-y-4">
          <div className="iw-notice iw-notice-info flex-col gap-1.5">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="shield" size="sm" />
              Magic-link sign-in
            </p>
            <p className="text-[11px] leading-5">
              Supabase sends the default email login link, so no custom SMTP template is required.
              The deployment origin and <code className="font-mono text-[10px]">/auth/callback</code>{" "}
              path must be allow-listed in the Supabase Auth redirect settings. If email delivery is
              unavailable, the sign-in link cannot be issued.
            </p>
          </div>
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
