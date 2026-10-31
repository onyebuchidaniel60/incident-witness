"use client";

import Link from "next/link";
import { useState } from "react";

import { ConfirmAction } from "@/components/confirm-action";
import { CopyButton } from "@/components/copy-button";
import {
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingState,
  StatusPill,
} from "@/components/async-state";
import { ApiError, apiRequest, downloadIncidentBundle } from "@/lib/api/client";
import type {
  IncidentDetail,
  IncidentSource,
  RenterInvitationResponse,
  TimelineEvent,
} from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import {
  assessmentText,
  formatTimestamp,
  incidentStatusLabel,
  incidentStatusTone,
  sourceTypeLabel,
} from "@/lib/format";

function isStale(value: string | null, seconds: number): boolean {
  if (!value) return true;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > seconds * 1000;
}

function sourceCard(
  title: string,
  source: IncidentSource | null,
  emptyText: string,
  extra?: string,
) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      {source ? (
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p>
            Key status: <strong>{source.status}</strong>
          </p>
          <p>Last key presence: {formatTimestamp(source.lastSeenAt)}</p>
          <p>Accepted events: {source.acceptedEventCount}</p>
          <p>Last observation: {formatTimestamp(source.lastObservedAt)}</p>
          {extra ? <p>{extra}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-700">{emptyText}</p>
      )}
    </div>
  );
}

function probeSummary(events: TimelineEvent[]): { count: number; last: string | null } {
  const probes = events.filter((event) => event.sourceType === "platform_probe");
  return {
    count: probes.length,
    last: probes.at(-1)?.observedAt ?? null,
  };
}

function observationState(
  event: TimelineEvent,
): { label: string; tone: "neutral" | "success" | "warning" | "danger" } | null {
  if (event.eventType === "host_power_state") {
    const state = event.payload.state;
    if (state === "unavailable") return { label: "UNAVAILABLE", tone: "danger" };
    if (state === "unknown") return { label: "UNKNOWN", tone: "warning" };
    if (typeof state === "string") {
      return { label: `UPS ${state.replaceAll("_", " ").toUpperCase()}`, tone: "neutral" };
    }
    return { label: "NOT REPORTED", tone: "warning" };
  }
  if (event.eventType === "gpu_telemetry") {
    const status = event.payload.collection_status;
    if (status === "unavailable") return { label: "UNAVAILABLE", tone: "danger" };
    if (status === "partial") return { label: "PARTIAL", tone: "warning" };
    if (status === "available") return { label: "AVAILABLE", tone: "success" };
    return { label: "NOT REPORTED", tone: "warning" };
  }
  if (event.eventType === "platform_probe_result") {
    const status = event.payload.probe_status;
    if (typeof status === "string") {
      return {
        label: status.toUpperCase(),
        tone: status === "completed" ? "success" : status === "error" ? "warning" : "danger",
      };
    }
  }
  return null;
}

export function IncidentDetailView({ incidentId }: { incidentId: string }) {
  const incident = useApiResource<IncidentDetail>(`/v1/incidents/${incidentId}`, {
    pollMs: 5000,
  });
  const [invitation, setInvitation] = useState<RenterInvitationResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function run(action: string, request: () => Promise<void>): Promise<void> {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await request();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  async function createInvitation() {
    await run("invite", async () => {
      const result = await apiRequest<RenterInvitationResponse>(
        `/v1/incidents/${incidentId}/renter-invitations`,
        { method: "POST" },
      );
      setInvitation(result);
      setMessage("A one-time renter invitation was issued. Copy it now; it is not stored.");
      incident.reload();
    });
  }

  async function endSession() {
    await run("end", async () => {
      await apiRequest(`/v1/incidents/${incidentId}/end`, { method: "POST" });
      setMessage("Capture ended. The session is awaiting finalization.");
      incident.reload();
    });
  }

  async function sealSession() {
    await run("seal", async () => {
      await apiRequest(`/v1/incidents/${incidentId}/seal`, { method: "POST" });
      setMessage("The evidence bundle was sealed. It can now be downloaded.");
      incident.reload();
    });
  }

  async function downloadBundle() {
    setDownloading(true);
    setError(null);
    try {
      const { blob, filename } = await downloadIncidentBundle(incidentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`Downloaded ${filename}. Inspect the bundle before sharing it.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bundle could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  if (incident.loading) return <LoadingState label="Loading evidence session…" />;
  if (incident.error && !incident.data) {
    const notFound = incident.error instanceof ApiError && incident.error.status === 404;
    return (
      <div className="space-y-4">
        <ErrorState
          error={incident.error}
          onRetry={notFound ? undefined : incident.reload}
          title={
            notFound ? "Evidence session not found." : "The evidence session could not be loaded."
          }
        />
        <Link href="/incidents" className="text-sm font-medium underline">
          Back to evidence sessions
        </Link>
      </div>
    );
  }
  if (!incident.data) return <EmptyState title="No evidence session returned." />;

  const data = incident.data;
  const hostSource = data.sources.find((source) => source.sourceType === "host_agent") ?? null;
  const renterSource = data.sources.find((source) => source.sourceType === "renter_client") ?? null;
  const probe = probeSummary(data.timeline);
  const hostStale = isStale(hostSource?.lastSeenAt ?? null, 60);
  const assessmentCode = data.assessment?.code ?? null;
  const evidenceGrade = data.assessment?.evidenceGrade ?? null;
  const gradeTone =
    evidenceGrade === "HIGH"
      ? "success"
      : evidenceGrade === "MEDIUM"
        ? "warning"
        : evidenceGrade === "LOW"
          ? "warning"
          : "neutral";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill
          label={incidentStatusLabel(data.status)}
          tone={incidentStatusTone(data.status)}
        />
        {data.demoMode || data.simulationPresent ? (
          <StatusPill label="Demo / simulated evidence" tone="warning" />
        ) : null}
        <span className="text-sm text-slate-600">Session ID: {data.id}</span>
      </div>

      {message ? (
        <InlineNotice tone="success" title="Updated">
          <p role="status">{message}</p>
        </InlineNotice>
      ) : null}
      {error ? (
        <InlineNotice tone="danger" title="Action failed">
          <p role="alert">{error}</p>
        </InlineNotice>
      ) : null}

      {incident.data && incident.error ? (
        <InlineNotice tone="warning" title="Showing stale data">
          <p role="alert">
            The latest refresh failed: {incident.error.message}. Source status below may be out of
            date and must not be treated as current.
          </p>
          <button
            type="button"
            onClick={incident.reload}
            className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 font-medium text-amber-950 hover:bg-amber-100"
          >
            Retry refresh
          </button>
        </InlineNotice>
      ) : null}

      <section
        aria-labelledby="session-metadata"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="session-metadata" className="text-lg font-semibold text-slate-950">
          Session metadata
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-600">Host</dt>
            <dd>
              <Link href={`/hosts/${data.hostId}`} className="break-all font-medium underline">
                {data.hostId}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Workload reference</dt>
            <dd className="break-all text-slate-950">{data.workloadRef ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Capture started</dt>
            <dd className="text-slate-950">{formatTimestamp(data.captureStartedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Capture ends</dt>
            <dd className="text-slate-950">{formatTimestamp(data.captureEndsAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Ingestion deadline</dt>
            <dd className="text-slate-950">{formatTimestamp(data.ingestionDeadline)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Ended</dt>
            <dd className="text-slate-950">{formatTimestamp(data.endedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Sealed</dt>
            <dd className="text-slate-950">{formatTimestamp(data.sealedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Accepted events</dt>
            <dd className="text-slate-950">{data.acceptedEventCount}</dd>
          </div>
        </dl>
        {data.cancelReason ? (
          <p className="mt-3 text-sm text-slate-700">Cancellation reason: {data.cancelReason}</p>
        ) : null}
      </section>

      <section aria-labelledby="source-health" className="space-y-3">
        <h2 id="source-health" className="text-lg font-semibold text-slate-950">
          Source health
        </h2>
        <p className="text-sm text-slate-600">
          Last successful refresh: {formatTimestamp(incident.lastUpdatedAt?.toISOString() ?? null)}{" "}
          · polling every 5 seconds.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {sourceCard(
            "Host agent",
            hostSource,
            "No host agent source key is registered for this host.",
            hostStale
              ? "The host presence is stale (older than 60 seconds). Do not treat it as healthy."
              : "Recent operational presence was received.",
          )}
          {sourceCard(
            "Renter client",
            renterSource,
            "The renter has not joined this session. No renter events are expected.",
            renterSource && isStale(renterSource.lastObservedAt, 60)
              ? "The last renter observation is stale."
              : undefined,
          )}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-950">Platform-operated probe</h3>
            {probe.count > 0 ? (
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <p>Probe events in the recent timeline: {probe.count}</p>
                <p>Last probe observation: {formatTimestamp(probe.last)}</p>
                {isStale(probe.last, 60) ? (
                  <p>The last probe observation is stale; do not infer current reachability.</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-700">
                No platform-probe observation has been received. This is a gap, not a healthy
                result. The probe is operated by Incident Witness, not an independent third party.
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="renter-invitation"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="renter-invitation" className="text-lg font-semibold text-slate-950">
          Renter invitation
        </h2>
        {data.status !== "collecting" ? (
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Invitations can be issued only while the session is collecting.
          </p>
        ) : renterSource ? (
          <p className="mt-2 text-sm leading-6 text-slate-700">
            A renter source key is already enrolled. This session can have one renter key.
          </p>
        ) : (
          <div className="mt-2 space-y-4 text-sm leading-6 text-slate-700">
            <p>
              A renter invitation is single-use, expires after 15 minutes, and is bound to this
              session only. It does not grant access to your provider account or other evidence.
            </p>
            <button
              type="button"
              onClick={() => void createInvitation()}
              disabled={busy !== null}
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {busy === "invite" ? "Issuing invitation…" : "Create renter invitation"}
            </button>
            {invitation ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">One-time invitation</p>
                <p data-testid="invitation-token" className="mt-2 break-all font-mono text-xs">
                  {invitation.invitationToken}
                </p>
                <p className="mt-2">Expires: {formatTimestamp(invitation.expiresAt)}</p>
                <p className="mt-2 break-all">{invitation.joinUrl}</p>
                <p className="mt-2">
                  Copy it now. The raw token cannot be recovered; create a replacement if lost. It
                  is invalidated after one successful redemption.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={invitation.joinUrl} label="Copy join URL" />
                  <CopyButton value={invitation.invitationToken} label="Copy token" />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section
        aria-labelledby="lifecycle"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="lifecycle" className="text-lg font-semibold text-slate-950">
          Lifecycle
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Current status: <strong>{incidentStatusLabel(data.status)}</strong>
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {data.status === "collecting" ? (
            <ConfirmAction
              label="End capture"
              confirmLabel="Confirm end"
              description="End the capture window and move to awaiting finalization? No new observations inside the window will be accepted after the end time, although delayed uploads may arrive during the grace period."
              onConfirm={() => void endSession()}
              busy={busy === "end"}
              disabled={busy !== null}
            />
          ) : null}
          {data.status === "awaiting_finalize" ? (
            <ConfirmAction
              label="Seal evidence bundle"
              confirmLabel="Seal bundle"
              description="Sealing is irreversible. The API requires at least one accepted event and no active probe lease. The signed bundle becomes immutable."
              onConfirm={() => void sealSession()}
              busy={busy === "seal"}
              disabled={busy !== null}
            />
          ) : null}
          {data.status === "sealed" ? (
            <button
              type="button"
              onClick={() => void downloadBundle()}
              disabled={downloading}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {downloading ? "Downloading…" : "Download sealed bundle"}
            </button>
          ) : null}
          {data.status === "cancelled" ? (
            <p className="text-sm text-slate-700">
              This session was cancelled and has no evidence bundle.
            </p>
          ) : null}
        </div>
        {data.status === "awaiting_finalize" ? (
          <p className="mt-3 text-sm leading-6 text-slate-700">
            If the API reports an active probe lease or no accepted evidence, wait or resolve the
            source issue before retrying. The incident stays awaiting finalization; no partial
            bundle is exposed.
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="assessment"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="assessment" className="text-lg font-semibold text-slate-950">
          Assessment
        </h2>
        {data.status !== "sealed" ? (
          <p className="mt-2 text-sm leading-6 text-slate-700">
            No assessment is shown until the bundle is sealed. This is not a healthy status.
          </p>
        ) : (
          <div className="mt-2 space-y-3 text-sm leading-6 text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-950">{assessmentCode ?? "UNKNOWN"}</span>
              <StatusPill
                label={`Evidence grade ${evidenceGrade ?? "INSUFFICIENT"}`}
                tone={gradeTone}
              />
            </div>
            <p>{assessmentText(assessmentCode)}</p>
            <p>
              Rule version: {data.assessment?.ruleVersion ?? "not recorded"}. Evidence grades
              describe completeness under the named rule, not a probability or proof of cause.
            </p>
            {data.simulationPresent ? (
              <p className="font-medium text-amber-900">
                This record contains simulated or demo evidence and is labelled as such.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="timeline" className="space-y-3">
        <h2 id="timeline" className="text-lg font-semibold text-slate-950">
          Timeline
        </h2>
        <p className="text-sm text-slate-600">
          The API returns the latest 50 accepted events in deterministic order. Missing sources are
          shown as gaps, not as normal observations.
        </p>
        {data.timeline.length === 0 ? (
          <EmptyState title="No accepted evidence events yet">
            <p>
              The host agent, renter client or platform probe has not contributed a signed
              observation to this session.
            </p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Observed at
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Event
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Observation
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Sequence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.timeline.map((event) => (
                  <tr key={event.eventId}>
                    <td className="px-4 py-3 text-slate-700">
                      {formatTimestamp(event.observedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {sourceTypeLabel(event.sourceType)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {event.eventType}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {(() => {
                        const observation = observationState(event);
                        return observation ? (
                          <StatusPill label={observation.label} tone={observation.tone} />
                        ) : (
                          "—"
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{event.sequence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm">
        <Link href="/incidents" className="font-medium underline">
          Back to evidence sessions
        </Link>
      </p>
    </div>
  );
}
