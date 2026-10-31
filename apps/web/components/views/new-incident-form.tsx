"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { apiRequest, newIdempotencyKey } from "@/lib/api/client";
import type { HostSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import { formatTimestamp } from "@/lib/format";

const demoEnabled = process.env.NEXT_PUBLIC_IW_ENABLE_DEMO_SESSIONS === "true";

export function NewIncidentForm() {
  const router = useRouter();
  const hosts = useApiResource<HostSummary[]>("/v1/hosts");
  const [hostId, setHostId] = useState("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [workloadRef, setWorkloadRef] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeHosts = hosts.data?.filter((host) => host.status === "active") ?? [];
  const selectedHostId = hostId || activeHosts[0]?.id || "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await apiRequest<{ incidentId: string }>("/v1/incidents", {
        method: "POST",
        body: {
          hostId: selectedHostId,
          title: title.trim(),
          durationMinutes,
          ...(workloadRef.trim() ? { workloadRef: workloadRef.trim() } : {}),
          ...(demoMode ? { demoMode: true } : {}),
        },
        idempotencyKey: newIdempotencyKey(),
      });
      router.push(`/incidents/${result.incidentId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be created.");
    } finally {
      setBusy(false);
    }
  }

  if (hosts.loading) return <LoadingState label="Loading hosts…" />;
  if (hosts.error) {
    return (
      <ErrorState error={hosts.error} onRetry={hosts.reload} title="Hosts could not be loaded." />
    );
  }
  if (activeHosts.length === 0) {
    return (
      <EmptyState title="No active hosts are available">
        <p>
          A session requires a host whose agent key is active and whose operational presence was
          received within the last 60 seconds. Enroll or recover a host first.
        </p>
        <Link href="/hosts" className="mt-3 inline-block font-medium underline">
          Manage hosts
        </Link>
      </EmptyState>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-xl space-y-5 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div>
        <label htmlFor="hostId" className="block text-sm font-medium text-slate-800">
          Host
        </label>
        <select
          id="hostId"
          name="hostId"
          required
          value={selectedHostId}
          onChange={(event) => setHostId(event.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
        >
          <option value="" disabled>
            Select an active host
          </option>
          {activeHosts.map((host) => (
            <option key={host.id} value={host.id}>
              {host.alias} — {host.hostname} (presence {formatTimestamp(host.lastAgentSeenAt)})
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-slate-600">
          Agent presence older than 60 seconds will be rejected by the API.
        </p>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-800">
          Session title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={100}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <p className="mt-1 text-sm text-slate-600">
          A private label. Do not include customer data, prompts, model content or credentials.
        </p>
      </div>

      <div>
        <label htmlFor="durationMinutes" className="block text-sm font-medium text-slate-800">
          Capture duration (minutes)
        </label>
        <input
          id="durationMinutes"
          name="durationMinutes"
          type="number"
          min={2}
          max={240}
          required
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value))}
          disabled={busy}
          className="mt-1 block w-32 rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <p className="mt-1 text-sm text-slate-600">
          Allowed range 2–240 minutes. Default 30. Monitoring starts immediately.
        </p>
      </div>

      <div>
        <label htmlFor="workloadRef" className="block text-sm font-medium text-slate-800">
          Workload reference (optional)
        </label>
        <input
          id="workloadRef"
          name="workloadRef"
          maxLength={100}
          value={workloadRef}
          onChange={(event) => setWorkloadRef(event.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <p className="mt-1 text-sm text-slate-600">
          An opaque reference only. Never a job payload, secret or model input/output.
        </p>
      </div>

      {demoEnabled ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <label
            htmlFor="demoMode"
            className="flex items-start gap-2 text-sm font-medium text-amber-950"
          >
            <input
              id="demoMode"
              name="demoMode"
              type="checkbox"
              checked={demoMode}
              onChange={(event) => setDemoMode(event.target.checked)}
              disabled={busy}
              className="mt-1"
            />
            <span>
              Demo/simulation session. Synthetic observations are permanently labelled and the
              evidence grade is capped at LOW.
            </span>
          </label>
        </div>
      ) : null}

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
        disabled={busy || !selectedHostId}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {busy ? "Starting session…" : "Start evidence session"}
      </button>
    </form>
  );
}
