"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StatusPill } from "@/components/async-state";
import { Icon } from "@/components/ui/icon";
import type { HostSummary, IncidentSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import {
  assessmentText,
  formatTimestampShort,
  hostStatusLabel,
  hostStatusTone,
  incidentStatusLabel,
  incidentStatusTone,
} from "@/lib/format";

export function DashboardView() {
  const hosts = useApiResource<HostSummary[]>("/v1/hosts");
  const incidents = useApiResource<IncidentSummary[]>("/v1/incidents");

  const activeHosts = hosts.data?.filter((host) => host.status === "active") ?? [];
  const activeIncidents =
    incidents.data?.filter(
      (incident) => incident.status === "collecting" || incident.status === "awaiting_finalize",
    ) ?? [];
  const sealedIncidents =
    incidents.data?.filter((incident) => incident.status === "sealed").slice(0, 5) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link href="/hosts/new" className="iw-btn iw-btn-primary iw-btn-sm">
          <Icon name="plus" size="sm" />
          Add a host
        </Link>
        <Link href="/incidents/new" className="iw-btn iw-btn-secondary iw-btn-sm">
          <Icon name="activity" size="sm" />
          Create an evidence session
        </Link>
      </div>

      <section aria-labelledby="overview-summary" className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <h2 id="overview-summary" className="text-sm font-semibold text-iw-ink">
            Overview
          </h2>
          <span className="text-[9px] uppercase tracking-[0.1em] text-iw-faint">Live API data</span>
        </div>
        {hosts.loading || incidents.loading ? (
          <LoadingState label="Loading provider data…" />
        ) : null}
        {hosts.error ? (
          <ErrorState
            error={hosts.error}
            onRetry={hosts.reload}
            title="Hosts could not be loaded."
          />
        ) : null}
        {incidents.error ? (
          <ErrorState
            error={incidents.error}
            onRetry={incidents.reload}
            title="Evidence sessions could not be loaded."
          />
        ) : null}
        {hosts.data && incidents.data ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="iw-kpi">
              <dt className="iw-kpi-label">Hosts</dt>
              <dd className="iw-kpi-value">{hosts.data.length}</dd>
              <p className="iw-kpi-meta">{activeHosts.length} active</p>
            </div>
            <div className="iw-kpi">
              <dt className="iw-kpi-label">Active sessions</dt>
              <dd className="iw-kpi-value">{activeIncidents.length}</dd>
              <p className="iw-kpi-meta">Collecting or awaiting finalization</p>
            </div>
            <div className="iw-kpi col-span-2 sm:col-span-1">
              <dt className="iw-kpi-label">Sealed records</dt>
              <dd className="iw-kpi-value">
                {incidents.data.filter((incident) => incident.status === "sealed").length}
              </dd>
              <p className="iw-kpi-meta">Immutable evidence bundles</p>
            </div>
          </dl>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <section className="iw-panel" aria-labelledby="recent-hosts">
          <div className="iw-panel-header">
            <div>
              <h2 id="recent-hosts" className="text-sm font-semibold text-iw-ink">
                Hosts
              </h2>
              <p className="mt-1 text-[10px] text-iw-faint">Owner-scoped endpoints and presence</p>
            </div>
            <Link href="/hosts" className="text-[10px] text-iw-muted hover:text-iw-ink">
              View all
            </Link>
          </div>
          <div className="iw-panel-body">
            {hosts.data && hosts.data.length === 0 ? (
              <EmptyState title="No hosts yet">
                <p>
                  Add a host and verify its DNS ownership before enrolling the Linux agent. No host
                  status is shown until the API returns a real record.
                </p>
              </EmptyState>
            ) : null}
            {hosts.data && hosts.data.length > 0 ? (
              <ul className="divide-y divide-iw-border">
                {hosts.data.slice(0, 4).map((host) => (
                  <li key={host.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/hosts/${host.id}`} className="text-[11px] font-medium text-iw-ink hover:text-iw-green-bright">
                        {host.alias}
                      </Link>
                      <p className="mt-0.5 break-all font-mono text-[8.5px] text-iw-faint">
                        {host.hostname}
                      </p>
                      <p className="mt-1 text-[9px] text-iw-faint">
                        Presence: {formatTimestampShort(host.lastAgentSeenAt)}
                      </p>
                    </div>
                    <StatusPill label={hostStatusLabel(host.status)} tone={hostStatusTone(host.status)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="iw-panel" aria-labelledby="sealed-records">
          <div className="iw-panel-header">
            <div>
              <h2 id="sealed-records" className="text-sm font-semibold text-iw-ink">
                Recent sealed records
              </h2>
              <p className="mt-1 text-[10px] text-iw-faint">Deterministic · immutable</p>
            </div>
          </div>
          <div className="iw-panel-body">
            {incidents.data && sealedIncidents.length === 0 ? (
              <EmptyState title="No sealed evidence yet">
                <p>Sealed bundles will appear after a session ends and is finalized.</p>
              </EmptyState>
            ) : null}
            {sealedIncidents.length > 0 ? (
              <ul className="divide-y divide-iw-border">
                {sealedIncidents.map((incident) => (
                  <li key={incident.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="text-[11px] font-medium text-iw-ink hover:text-iw-green-bright"
                    >
                      {incident.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[8px] text-iw-muted">
                        {incident.assessment?.code ?? "UNKNOWN"} ·{" "}
                        {incident.assessment?.evidenceGrade ?? "INSUFFICIENT"}
                      </span>
                    </div>
                    <p className="mt-1 text-[9px] leading-4 text-iw-faint">
                      {assessmentText(incident.assessment?.code ?? null)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>

      <section className="iw-panel" aria-labelledby="active-sessions">
        <div className="iw-panel-header">
          <div>
            <h2 id="active-sessions" className="text-sm font-semibold text-iw-ink">
              Active evidence sessions
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">Bounded captures accepting evidence</p>
          </div>
          <Link href="/incidents" className="text-[10px] text-iw-muted hover:text-iw-ink">
            View all
          </Link>
        </div>
        <div className="iw-panel-body">
          {incidents.data && activeIncidents.length === 0 ? (
            <EmptyState title="No active evidence sessions">
              <p>
                Start a session before the operating window you want to observe. Events before
                session creation cannot be reconstructed.
              </p>
            </EmptyState>
          ) : null}
          {activeIncidents.length > 0 ? (
            <ul className="divide-y divide-iw-border">
              {activeIncidents.map((incident) => (
                <li key={incident.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="text-[11px] font-medium text-iw-ink hover:text-iw-green-bright"
                    >
                      {incident.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[8.5px] text-iw-faint">
                      {formatTimestampShort(incident.captureStartedAt)} →{" "}
                      {formatTimestampShort(incident.captureEndsAt)}
                    </p>
                    <p className="mt-1 text-[9px] text-iw-faint">
                      {incident.acceptedEventCount} accepted events
                    </p>
                  </div>
                  <StatusPill
                    label={incidentStatusLabel(incident.status)}
                    tone={incidentStatusTone(incident.status)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}
