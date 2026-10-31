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
import { Icon } from "@/components/ui/icon";
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

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

function sourceBadgeClass(sourceType: string): string {
  if (sourceType === "host_agent") return "iw-chip iw-chip-host";
  if (sourceType === "renter_client") return "iw-chip iw-chip-renter";
  if (sourceType === "platform_probe") return "iw-chip iw-chip-probe";
  return "iw-chip iw-chip-neutral";
}

function sourceCard(
  title: string,
  source: IncidentSource | null,
  emptyText: string,
  badgeClass: string,
  extra?: string,
) {
  return (
    <div className="iw-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-iw-ink">{title}</h3>
        <span className={badgeClass}>{source ? source.status : "No source"}</span>
      </div>
      {source ? (
        <dl className="mt-2 space-y-1 text-[10px] leading-5 text-iw-muted">
          <div className="flex justify-between gap-2">
            <dt className="text-iw-faint">Key status</dt>
            <dd className="text-iw-ink-soft">{source.status}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-iw-faint">Last presence</dt>
            <dd className="font-mono text-[9px]">{formatTimestamp(source.lastSeenAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-iw-faint">Accepted events</dt>
            <dd className="font-mono text-[9px]">{source.acceptedEventCount}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-iw-faint">Last observation</dt>
            <dd className="font-mono text-[9px]">{formatTimestamp(source.lastObservedAt)}</dd>
          </div>
          {extra ? <p className="pt-1 text-[9px] leading-4 text-iw-faint">{extra}</p> : null}
        </dl>
      ) : (
        <p className="mt-2 text-[10px] leading-5 text-iw-muted">{emptyText}</p>
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
      <div className="space-y-3">
        <ErrorState
          error={incident.error}
          onRetry={notFound ? undefined : incident.reload}
          title={
            notFound ? "Evidence session not found." : "The evidence session could not be loaded."
          }
        />
        <Link href="/incidents" className="iw-link text-[10px]">
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          label={incidentStatusLabel(data.status)}
          tone={incidentStatusTone(data.status)}
        />
        {data.demoMode || data.simulationPresent ? (
          <StatusPill label="Demo / simulated evidence" tone="warning" />
        ) : null}
        <span className="font-mono text-[9px] text-iw-faint">Session ID: {data.id}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl leading-tight text-iw-ink">{data.title}</h2>
          <p className="mt-1 font-mono text-[9px] text-iw-faint">
            {formatTimestamp(data.captureStartedAt)} → {formatTimestamp(data.captureEndsAt)}
          </p>
        </div>
        <Link href="/incidents" className="iw-btn iw-btn-ghost iw-btn-sm">
          <Icon name="arrow-left" size="sm" />
          Back to evidence sessions
        </Link>
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
            className="iw-btn iw-btn-secondary iw-btn-sm mt-2"
          >
            Retry refresh
          </button>
        </InlineNotice>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)]">
        <div className="space-y-3">
          <section className="iw-panel" aria-labelledby="session-metadata">
            <div className="iw-panel-header">
              <div>
                <h2 id="session-metadata" className="text-sm font-semibold text-iw-ink">
                  Session metadata
                </h2>
                <p className="mt-1 text-[10px] text-iw-faint">Bounded capture window</p>
              </div>
              <span className="iw-chip iw-chip-neutral">{data.acceptedEventCount} events</span>
            </div>
            <div className="iw-panel-body">
              <dl className="grid gap-x-6 gap-y-3 text-[10px] sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-iw-faint">Host</dt>
                  <dd className="mt-0.5">
                    <Link href={`/hosts/${data.hostId}`} className="iw-link break-all font-mono text-[9px]">
                      {data.hostId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-iw-faint">Workload reference</dt>
                  <dd className="mt-0.5 break-all text-iw-ink-soft">{data.workloadRef ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt className="text-iw-faint">Capture started</dt>
                  <dd className="mt-0.5 font-mono text-[9px] text-iw-ink-soft">
                    {formatTimestamp(data.captureStartedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-iw-faint">Capture ends</dt>
                  <dd className="mt-0.5 font-mono text-[9px] text-iw-ink-soft">
                    {formatTimestamp(data.captureEndsAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-iw-faint">Ingestion deadline</dt>
                  <dd className="mt-0.5 font-mono text-[9px] text-iw-ink-soft">
                    {formatTimestamp(data.ingestionDeadline)}
                  </dd>
                </div>
                <div>
                  <dt className="text-iw-faint">Ended / sealed</dt>
                  <dd className="mt-0.5 font-mono text-[9px] text-iw-ink-soft">
                    {formatTimestamp(data.endedAt)} / {formatTimestamp(data.sealedAt)}
                  </dd>
                </div>
              </dl>
              {data.cancelReason ? (
                <p className="mt-3 text-[10px] text-iw-muted">Cancellation reason: {data.cancelReason}</p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="source-health" className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="source-health" className="text-sm font-semibold text-iw-ink">
                Source health
              </h2>
              <p className="text-[9px] text-iw-faint">
                Last refresh: {formatTimestamp(incident.lastUpdatedAt?.toISOString() ?? null)} · 5s
                polling
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {sourceCard(
                "Host agent",
                hostSource,
                "No host agent source key is registered for this host.",
                "iw-chip iw-chip-host",
                hostStale
                  ? "The host presence is stale (older than 60 seconds). Do not treat it as healthy."
                  : "Recent operational presence was received.",
              )}
              {sourceCard(
                "Renter client",
                renterSource,
                "The renter has not joined this session. No renter events are expected.",
                "iw-chip iw-chip-renter",
                renterSource && isStale(renterSource.lastObservedAt, 60)
                  ? "The last renter observation is stale."
                  : undefined,
              )}
              <div className="iw-panel p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[11px] font-semibold text-iw-ink">Platform-operated probe</h3>
                  <span className="iw-chip iw-chip-probe">
                    {probe.count > 0 ? "Observed" : "No source"}
                  </span>
                </div>
                {probe.count > 0 ? (
                  <dl className="mt-2 space-y-1 text-[10px] leading-5 text-iw-muted">
                    <div className="flex justify-between gap-2">
                      <dt className="text-iw-faint">Probe events</dt>
                      <dd className="font-mono text-[9px]">{probe.count}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-iw-faint">Last observation</dt>
                      <dd className="font-mono text-[9px]">{formatTimestamp(probe.last)}</dd>
                    </div>
                    {isStale(probe.last, 60) ? (
                      <p className="pt-1 text-[9px] leading-4 text-iw-faint">
                        The last probe observation is stale; do not infer current reachability.
                      </p>
                    ) : null}
                  </dl>
                ) : (
                  <p className="mt-2 text-[10px] leading-5 text-iw-muted">
                    No platform-probe observation has been received. This is a gap, not a healthy
                    result. The probe is operated by Incident Witness, not an independent third
                    party.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="iw-panel" aria-labelledby="timeline">
            <div className="iw-panel-header">
              <div>
                <h2 id="timeline" className="text-sm font-semibold text-iw-ink">
                  Evidence timeline
                </h2>
                <p className="mt-1 text-[10px] text-iw-faint">
                  Latest 50 accepted events · deterministic order · UTC
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="iw-chip iw-chip-host">Host</span>
                <span className="iw-chip iw-chip-renter">Renter</span>
                <span className="iw-chip iw-chip-probe">Probe</span>
              </div>
            </div>
            <div className="px-4 pb-2">
              {data.timeline.length === 0 ? (
                <div className="py-3">
                  <EmptyState title="No accepted evidence events yet">
                    <p>
                      The host agent, renter client or platform probe has not contributed a signed
                      observation to this session.
                    </p>
                  </EmptyState>
                </div>
              ) : (
                data.timeline.map((event) => {
                  const observation = observationState(event);
                  return (
                    <div key={event.eventId} className="iw-timeline-event">
                      <time dateTime={event.observedAt} title={formatTimestamp(event.observedAt)}>
                        {formatEventTime(event.observedAt)}
                      </time>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={sourceBadgeClass(event.sourceType)}>
                            {sourceTypeLabel(event.sourceType)}
                          </span>
                          <span className="font-mono text-[9.5px] text-iw-ink-soft">
                            {event.eventType}
                          </span>
                          {observation ? (
                            <StatusPill label={observation.label} tone={observation.tone} />
                          ) : null}
                        </div>
                        <p className="mt-1 font-mono text-[8px] text-iw-faint">
                          sequence {event.sequence} · received {formatEventTime(event.receivedAt)} UTC
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-iw-border px-4 py-2 text-[8.5px] text-iw-faint">
              Missing sources are shown as gaps, not as normal observations.
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <section className="iw-panel" aria-labelledby="lifecycle">
            <div className="iw-panel-header">
              <div>
                <h2 id="lifecycle" className="text-sm font-semibold text-iw-ink">
                  Lifecycle
                </h2>
                <p className="mt-1 text-[10px] text-iw-faint">Current state and next actions</p>
              </div>
              <StatusPill
                label={incidentStatusLabel(data.status)}
                tone={incidentStatusTone(data.status)}
              />
            </div>
            <div className="iw-panel-body">
              <div className="flex flex-wrap items-start gap-2">
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
                    className="iw-btn iw-btn-primary iw-btn-sm"
                  >
                    <Icon name="download" size="sm" />
                    {downloading ? "Downloading…" : "Download sealed bundle"}
                  </button>
                ) : null}
                {data.status === "cancelled" ? (
                  <p className="text-[10px] text-iw-muted">
                    This session was cancelled and has no evidence bundle.
                  </p>
                ) : null}
              </div>
              {data.status === "awaiting_finalize" ? (
                <p className="mt-3 text-[9px] leading-5 text-iw-faint">
                  If the API reports an active probe lease or no accepted evidence, wait or resolve
                  the source issue before retrying. The incident stays awaiting finalization; no
                  partial bundle is exposed.
                </p>
              ) : null}
            </div>
          </section>

          <section className="iw-panel" aria-labelledby="assessment">
            <div className="iw-panel-header">
              <div>
                <h2 id="assessment" className="text-sm font-semibold text-iw-ink">
                  Assessment
                </h2>
                <p className="mt-1 text-[10px] text-iw-faint">Deterministic · versioned</p>
              </div>
              <span className="iw-chip iw-chip-neutral">
                {data.status === "sealed" ? "Complete" : "At seal"}
              </span>
            </div>
            <div className="iw-panel-body">
              {data.status !== "sealed" ? (
                <div className="rounded-[4px] border border-iw-yellow/30 bg-iw-yellow/10 p-3">
                  <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-iw-yellow">
                    Current state
                  </p>
                  <p className="mt-1 font-mono text-[16px] text-iw-ink">PENDING</p>
                  <p className="mt-2 text-[9px] leading-5 text-iw-muted">
                    No assessment is shown until the bundle is sealed. This is not a healthy status.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[16px] text-iw-ink">
                      {assessmentCode ?? "UNKNOWN"}
                    </span>
                    <StatusPill
                      label={`Evidence grade ${evidenceGrade ?? "INSUFFICIENT"}`}
                      tone={gradeTone}
                    />
                  </div>
                  <p className="text-[10px] leading-5 text-iw-muted">
                    {assessmentText(assessmentCode)}
                  </p>
                  <p className="text-[9px] leading-5 text-iw-faint">
                    Rule version: {data.assessment?.ruleVersion ?? "not recorded"}. Evidence grades
                    describe completeness under the named rule, not a probability or proof of cause.
                  </p>
                  {data.simulationPresent ? (
                    <p className="text-[9px] font-medium text-iw-yellow">
                      This record contains simulated or demo evidence and is labelled as such.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <section className="iw-panel" aria-labelledby="renter-invitation">
            <div className="iw-panel-header">
              <div>
                <h2 id="renter-invitation" className="text-sm font-semibold text-iw-ink">
                  Renter invitation
                </h2>
                <p className="mt-1 text-[10px] text-iw-faint">Single use · 15 minutes</p>
              </div>
              {renterSource ? <span className="iw-chip iw-chip-renter">Enrolled</span> : null}
            </div>
            <div className="iw-panel-body">
              {data.status !== "collecting" ? (
                <p className="text-[10px] leading-5 text-iw-muted">
                  Invitations can be issued only while the session is collecting.
                </p>
              ) : renterSource ? (
                <p className="text-[10px] leading-5 text-iw-muted">
                  A renter source key is already enrolled. This session can have one renter key.
                </p>
              ) : (
                <div className="space-y-3 text-[10px] leading-5 text-iw-muted">
                  <p>
                    A renter invitation is single-use, expires after 15 minutes, and is bound to
                    this session only. It does not grant access to your provider account or other
                    evidence.
                  </p>
                  <button
                    type="button"
                    onClick={() => void createInvitation()}
                    disabled={busy !== null}
                    className="iw-btn iw-btn-primary iw-btn-sm"
                  >
                    {busy === "invite" ? "Issuing invitation…" : "Create renter invitation"}
                  </button>
                  {invitation ? (
                    <div className="iw-notice iw-notice-warning flex-col gap-2">
                      <p className="font-semibold">One-time invitation</p>
                      <p data-testid="invitation-token" className="break-all font-mono text-[10px]">
                        {invitation.invitationToken}
                      </p>
                      <p>Expires: {formatTimestamp(invitation.expiresAt)}</p>
                      <p className="break-all">{invitation.joinUrl}</p>
                      <p>
                        Copy it now. The raw token cannot be recovered; create a replacement if lost.
                        It is invalidated after one successful redemption.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <CopyButton value={invitation.joinUrl} label="Copy join URL" />
                        <CopyButton value={invitation.invitationToken} label="Copy token" />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
