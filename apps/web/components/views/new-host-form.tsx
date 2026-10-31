"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiRequest, newIdempotencyKey } from "@/lib/api/client";

export function NewHostForm() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await apiRequest<{ hostId: string }>("/v1/hosts", {
        method: "POST",
        body: { alias: alias.trim(), hostname: hostname.trim() },
        idempotencyKey: newIdempotencyKey(),
      });
      router.push(`/hosts/${result.hostId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The host could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-xl space-y-5 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div>
        <label htmlFor="alias" className="block text-sm font-medium text-slate-800">
          Host alias
        </label>
        <input
          id="alias"
          name="alias"
          required
          maxLength={80}
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <p className="mt-1 text-sm text-slate-600">A private label, 1–80 characters.</p>
      </div>

      <div>
        <label htmlFor="hostname" className="block text-sm font-medium text-slate-800">
          Public hostname
        </label>
        <input
          id="hostname"
          name="hostname"
          required
          maxLength={253}
          placeholder="gpu-01.example.com"
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <p className="mt-1 text-sm text-slate-600">
          A public DNS name without scheme, port or path. It must serve
          <code className="mx-1 break-all font-mono text-xs">
            https://&lt;hostname&gt;/.well-known/incident-witness/health
          </code>
          with the exact expected response.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {busy ? "Creating host…" : "Create host"}
      </button>
    </form>
  );
}
