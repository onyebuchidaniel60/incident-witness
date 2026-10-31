"use client";

import { useState } from "react";

import { E2E_SESSION_COOKIE, e2eClientAuthEnabled, e2eClientToken } from "@/lib/e2e-auth";

export function E2eSignInButton() {
  const [busy, setBusy] = useState(false);

  if (!e2eClientAuthEnabled()) return null;

  function signIn() {
    setBusy(true);
    document.cookie = `${E2E_SESSION_COOKIE}=${encodeURIComponent(
      e2eClientToken(),
    )}; Path=/; SameSite=Lax`;
    const requested = new URLSearchParams(window.location.search).get("next");
    const destination =
      requested && requested.startsWith("/") && !requested.startsWith("//")
        ? requested
        : "/dashboard";
    window.location.href = destination;
  }

  return (
    <div className="rounded-md border border-dashed border-slate-400 bg-slate-100 p-4 text-sm">
      <p className="font-semibold text-slate-950">Local end-to-end test mode</p>
      <p className="mt-1 text-slate-700">
        This control is available only in the local test environment. It does not use a Supabase
        email code and is not enabled in production.
      </p>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="mt-3 rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
      >
        {busy ? "Signing in…" : "Continue as local test provider"}
      </button>
    </div>
  );
}
