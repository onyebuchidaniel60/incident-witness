"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StatusPill } from "@/components/async-state";
import type { HostSummary, IncidentSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import {
  assessmentText,
  formatTimestamp,
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
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/hosts/new"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
        >
          Add a host
        </Link>
        <Link
          href="/incidents/new"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100"
        >
          Create an evidence session
        </Link>
      </div>

      <section aria-labelledby="overview-summary" className="space-y-3">
        <h2 id="overview-summary" className="text-lg font-semibold text-slate-950">
          Overview
        </h2>
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
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <dt className="text-sm font-medium text-slate-600">Hosts</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-950">{hosts.data.length}</dd>
              <p className="mt-1 text-sm text-slate-600">{activeHosts.length} active</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <dt className="text-sm font-medium text-slate-600">Active sessions</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-950">
                {activeIncidents.length}
              </dd>
              <p className="mt-1 text-sm text-slate-600">Collecting or awaiting finalization</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <dt className="text-sm font-medium text-slate-600">Sealed records</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-950">
                {incidents.data.filter((incident) => incident.status === "sealed").length}
              </dd>
              <p className="mt-1 text-sm text-slate-600">Immutable evidence bundles</p>
            </div>
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="recent-hosts" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-hosts" className="text-lg font-semibold text-slate-950">
            Hosts
          </h2>
          <Link href="/hosts" className="text-sm font-medium underline">
            View all
          </Link>
        </div>
        {hosts.data && hosts.data.length === 0 ? (
          <EmptyState title="No hosts yet">
            <p>
              Add a host and verify its DNS ownership before enrolling the Linux agent. No host
              status is shown until the API returns a real record.
            </p>
          </EmptyState>
        ) : null}
        {hosts.data && hosts.data.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {hosts.data.slice(0, 4).map((host) => (
              <li key={host.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/hosts/${host.id}`}
                    className="font-semibold text-slate-950 underline"
                  >
                    {host.alias}
                  </Link>
                  <StatusPill
                    label={hostStatusLabel(host.status)}
                    tone={hostStatusTone(host.status)}
                  />
                </div>
                <p className="mt-1 break-all text-sm text-slate-600">{host.hostname}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Last agent presence: {formatTimestamp(host.lastAgentSeenAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="active-sessions" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="active-sessions" className="text-lg font-semibold text-slate-950">
            Active evidence sessions
          </h2>
          <Link href="/incidents" className="text-sm font-medium underline">
            View all
          </Link>
        </div>
        {incidents.data && activeIncidents.length === 0 ? (
          <EmptyState title="No active evidence sessions">
            <p>
              Start a session before the operating window you want to observe. Events before session
              creation cannot be reconstructed.
            </p>
          </EmptyState>
        ) : null}
        {activeIncidents.length > 0 ? (
          <ul className="space-y-3">
            {activeIncidents.map((incident) => (
              <li key={incident.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="font-semibold text-slate-950 underline"
                  >
                    {incident.title}
                  </Link>
                  <StatusPill
                    label={incidentStatusLabel(incident.status)}
                    tone={incidentStatusTone(incident.status)}
                  />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {formatTimestamp(incident.captureStartedAt)} →{" "}
                  {formatTimestamp(incident.captureEndsAt)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {incident.acceptedEventCount} accepted events
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="sealed-records" className="space-y-3">
        <h2 id="sealed-records" className="text-lg font-semibold text-slate-950">
          Recent sealed records
        </h2>
        {incidents.data && sealedIncidents.length === 0 ? (
          <EmptyState title="No sealed evidence yet">
            <p>Sealed bundles will appear after a session ends and is finalized.</p>
          </EmptyState>
        ) : null}
        {sealedIncidents.length > 0 ? (
          <ul className="space-y-3">
            {sealedIncidents.map((incident) => (
              <li key={incident.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <Link
                  href={`/incidents/${incident.id}`}
                  className="font-semibold text-slate-950 underline"
                >
                  {incident.title}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {incident.assessment?.code ?? "UNKNOWN"} · grade{" "}
                  {incident.assessment?.evidenceGrade ?? "INSUFFICIENT"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {assessmentText(incident.assessment?.code ?? null)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Sealed: {formatTimestamp(incident.sealedAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
