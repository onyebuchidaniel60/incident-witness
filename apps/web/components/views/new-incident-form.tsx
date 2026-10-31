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
        <Link href="/hosts" className="iw-link mt-3 inline-block text-[10px]">
          Manage hosts
        </Link>
      </EmptyState>
    );
  }

  return (
    <form onSubmit={submit} className="iw-panel max-w-2xl space-y-5 p-5">
      <div>
        <label htmlFor="hostId" className="iw-label">
          Host
        </label>
        <select
          id="hostId"
          name="hostId"
          required
          value={selectedHostId}
          onChange={(event) => setHostId(event.target.value)}
          disabled={busy}
          className="iw-select mt-1.5"
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
        <p className="iw-help">Agent presence older than 60 seconds will be rejected by the API.</p>
      </div>

      <div>
        <label htmlFor="title" className="iw-label">
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
          className="iw-input mt-1.5"
        />
        <p className="iw-help">
          A private label. Do not include customer data, prompts, model content or credentials.
        </p>
      </div>

      <div>
        <label htmlFor="durationMinutes" className="iw-label">
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
          className="iw-input mt-1.5 max-w-32"
        />
        <p className="iw-help">
          Allowed range 2–240 minutes. Default 30. Monitoring starts immediately.
        </p>
      </div>

      <div>
        <label htmlFor="workloadRef" className="iw-label">
          Workload reference (optional)
        </label>
        <input
          id="workloadRef"
          name="workloadRef"
          maxLength={100}
          value={workloadRef}
          onChange={(event) => setWorkloadRef(event.target.value)}
          disabled={busy}
          className="iw-input mt-1.5"
        />
        <p className="iw-help">
          An opaque reference only. Never a job payload, secret or model input/output.
        </p>
      </div>

      {demoEnabled ? (
        <div className="iw-notice iw-notice-warning">
          <label htmlFor="demoMode" className="flex items-start gap-2 text-[10px] font-medium">
            <input
              id="demoMode"
              name="demoMode"
              type="checkbox"
              checked={demoMode}
              onChange={(event) => setDemoMode(event.target.checked)}
              disabled={busy}
              className="mt-0.5 accent-[#26d18c]"
            />
            <span>
              Demo/simulation session. Synthetic observations are permanently labelled and the
              evidence grade is capped at LOW.
            </span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="iw-notice iw-notice-danger text-[10px] leading-5">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !selectedHostId}
        className="iw-btn iw-btn-primary"
      >
        {busy ? "Starting session…" : "Start evidence session"}
      </button>
    </form>
  );
}
