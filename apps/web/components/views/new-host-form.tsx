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
    <form onSubmit={submit} className="iw-panel max-w-2xl space-y-5 p-5">
      <div>
        <label htmlFor="alias" className="iw-label">
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
          className="iw-input mt-1.5"
        />
        <p className="iw-help">A private label, 1–80 characters.</p>
      </div>

      <div>
        <label htmlFor="hostname" className="iw-label">
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
          className="iw-input mt-1.5"
        />
        <p className="iw-help">
          A public DNS name without scheme, port or path. It must serve
          <code className="mx-1 break-all font-mono text-[9px] text-iw-ink-soft">
            https://&lt;hostname&gt;/.well-known/incident-witness/health
          </code>
          with the exact expected response.
        </p>
      </div>

      {error ? (
        <p role="alert" className="iw-notice iw-notice-danger text-[10px] leading-5">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="iw-btn iw-btn-primary">
        {busy ? "Creating host…" : "Create host"}
      </button>
    </form>
  );
}
