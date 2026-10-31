"use client";

import { useState } from "react";

import { e2eClientAuthEnabled, E2E_SESSION_COOKIE } from "@/lib/e2e-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);

    try {
      if (e2eClientAuthEnabled()) {
        document.cookie = `${E2E_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
        window.location.replace("/");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("Sign-out could not be completed. Try again.");
        return;
      }

      // A full navigation clears the client router cache so a protected RSC
      // payload cannot be reused after the session is removed.
      window.location.replace("/");
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
        className="iw-btn iw-btn-secondary"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p role="alert" className="text-[10px] text-iw-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
