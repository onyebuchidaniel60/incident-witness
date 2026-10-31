"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StatusPill } from "@/components/async-state";
import type { HostSummary, IncidentSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import {
  assessmentText,
  formatTimestamp,
  incidentStatusLabel,
  incidentStatusTone,
} from "@/lib/format";

export function IncidentsView() {
  const incidents = useApiResource<IncidentSummary[]>("/v1/incidents");
  const hosts = useApiResource<HostSummary[]>("/v1/hosts");
  const hostNames = new Map(hosts.data?.map((host) => [host.id, host.alias]) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/incidents/new"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
        >
          Create evidence session
        </Link>
        <button
          type="button"
          onClick={incidents.reload}
          disabled={incidents.refreshing}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {incidents.refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {incidents.loading ? <LoadingState label="Loading evidence sessions…" /> : null}
      {incidents.error ? (
        <ErrorState
          error={incidents.error}
          onRetry={incidents.reload}
          title="Evidence sessions could not be loaded."
        />
      ) : null}
      {incidents.data && incidents.data.length === 0 ? (
        <EmptyState title="No evidence sessions yet">
          <p>
            Create a bounded session before the operating window you want to observe. Events before
            session creation cannot be reconstructed.
          </p>
          <Link href="/incidents/new" className="mt-3 inline-block font-medium underline">
            Create your first session
          </Link>
        </EmptyState>
      ) : null}

      {incidents.data && incidents.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Session
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Host
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Capture window
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Evidence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {incidents.data.map((incident) => (
                <tr key={incident.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/incidents/${incident.id}`} className="font-semibold underline">
                      {incident.title}
                    </Link>
                    {incident.demoMode || incident.simulationPresent ? (
                      <p className="mt-1 text-xs font-semibold text-amber-800">
                        Labelled demo / simulated evidence
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      Created {formatTimestamp(incident.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {hostNames.get(incident.hostId) ?? incident.hostId}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      label={incidentStatusLabel(incident.status)}
                      tone={incidentStatusTone(incident.status)}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatTimestamp(incident.captureStartedAt)}
                    <br />
                    <span className="text-xs">to {formatTimestamp(incident.captureEndsAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {incident.acceptedEventCount} events
                    {incident.status === "sealed" ? (
                      <p className="mt-1 text-xs">
                        {incident.assessment?.code ?? "UNKNOWN"} /{" "}
                        {incident.assessment?.evidenceGrade ?? "INSUFFICIENT"}
                      </p>
                    ) : null}
                    {incident.status === "sealed" ? (
                      <p className="mt-1 text-xs">
                        {assessmentText(incident.assessment?.code ?? null)}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
