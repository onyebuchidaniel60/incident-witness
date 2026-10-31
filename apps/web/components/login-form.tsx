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
    <div className="space-y-6">
      <form onSubmit={requestLink} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-800">
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
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 disabled:bg-slate-100"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? "Sending link…" : "Send login link"}
        </button>
      </form>

      {message ? (
        <p role="status" className="text-sm leading-6 text-slate-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm leading-6 text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
