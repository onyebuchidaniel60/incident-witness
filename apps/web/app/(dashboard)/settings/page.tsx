import Link from "next/link";
import { cookies } from "next/headers";

import { PageIntro } from "@/components/page-intro";
import { SignOutButton } from "@/components/sign-out-button";
import { E2E_SESSION_COOKIE, e2eServerAuthEnabled, e2eSessionToken } from "@/lib/e2e-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  let email: string | null = null;
  let testSession = false;

  if (e2eServerAuthEnabled()) {
    const cookieStore = await cookies();
    testSession = cookieStore.get(E2E_SESSION_COOKIE)?.value === e2eSessionToken();
  }

  if (!testSession) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Settings"
        title="Account and session"
        description="Session information and sign-out controls. Host key revocation and host archival are performed on each host detail page."
      />

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Sign-in session</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {testSession
            ? "Local end-to-end test session. This mode is not enabled in production."
            : email
              ? `Signed in as ${email}.`
              : "The authenticated email is not available from this session."}
        </p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Key and host controls</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Revoke a host source key or archive a host from its detail page. Revocation stops future
          events but does not invalidate valid historic signatures. Host archival is terminal for
          that host record in v1.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/hosts" className="font-medium underline">
            Manage hosts
          </Link>
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Account deletion</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Self-service account deletion is not available in v1. The operator must approve a
          retention and deletion policy before this control is offered.
        </p>
      </div>
    </div>
  );
}
