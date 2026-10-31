"use client";

import { useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        setError("We could not send a login link. Check the email address and try again.");
        return;
      }

      setMessage("Check your email for a login link.");
    } catch {
      setError("Authentication is not configured for this deployment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={requestLink} className="space-y-4">
        <div>
          <label htmlFor="email" className="iw-label">
            Provider email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            className="iw-input mt-1.5"
          />
        </div>
        <button type="submit" disabled={busy} className="iw-btn iw-btn-primary">
          {busy ? "Sending link…" : "Send login link"}
        </button>
      </form>

      {message ? (
        <p role="status" className="iw-notice iw-notice-success text-[11px] leading-5">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="iw-notice iw-notice-danger text-[11px] leading-5">
          {error}
        </p>
      ) : null}
    </div>
  );
}
