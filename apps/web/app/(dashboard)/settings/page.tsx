import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = {
  title: "Settings placeholder",
};

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Settings"
        title="Settings are not connected yet."
        description="This route will show session information, display-name editing, source-key status and host lifecycle controls for the authenticated provider."
      />

      <PlaceholderNotice title="Account controls">
        <p>
          Supabase Auth session state is connected. Profile editing, source-key status and host
          lifecycle controls remain later-phase work.
        </p>
      </PlaceholderNotice>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Session</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Signing out clears the Supabase Auth session cookies from this browser.
        </p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard" className="font-medium underline">
          Dashboard placeholder
        </Link>
        <Link href="/docs" className="font-medium underline">
          Documentation
        </Link>
      </div>
    </div>
  );
}
