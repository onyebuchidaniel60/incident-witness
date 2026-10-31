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
    <div className="rounded-[4px] border border-dashed border-iw-border-strong bg-white/[0.02] p-4 text-[11px]">
      <p className="font-semibold text-iw-ink">Local end-to-end test mode</p>
      <p className="mt-1 leading-5 text-iw-muted">
        This control is available only in the local test environment. It does not use a Supabase
        email code and is not enabled in production.
      </p>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="iw-btn iw-btn-secondary iw-btn-sm mt-3"
      >
        {busy ? "Signing in…" : "Continue as local test provider"}
      </button>
    </div>
  );
}
