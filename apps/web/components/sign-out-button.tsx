"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { e2eClientAuthEnabled, E2E_SESSION_COOKIE } from "@/lib/e2e-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);

    try {
      if (e2eClientAuthEnabled()) {
        document.cookie = `${E2E_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
        router.replace("/");
        router.refresh();
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("Sign-out could not be completed. Try again.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Authentication is not configured for this deployment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
