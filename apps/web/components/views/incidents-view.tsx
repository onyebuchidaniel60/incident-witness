"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StatusPill } from "@/components/async-state";
import { Icon } from "@/components/ui/icon";
import type { HostSummary, IncidentSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import {
  assessmentText,
  formatTimestamp,
  formatTimestampShort,
  incidentStatusLabel,
  incidentStatusTone,
} from "@/lib/format";

export function IncidentsView() {
  const incidents = useApiResource<IncidentSummary[]>("/v1/incidents");
  const hosts = useApiResource<HostSummary[]>("/v1/hosts");
  const hostNames = new Map(hosts.data?.map((host) => [host.id, host.alias]) ?? []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link href="/incidents/new" className="iw-btn iw-btn-primary iw-btn-sm">
          <Icon name="plus" size="sm" />
          Create evidence session
        </Link>
        <button
          type="button"
          onClick={incidents.reload}
          disabled={incidents.refreshing}
          className="iw-btn iw-btn-secondary iw-btn-sm"
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
          <Link href="/incidents/new" className="iw-link mt-3 inline-block text-[10px]">
            Create your first session
          </Link>
        </EmptyState>
      ) : null}

      {incidents.data && incidents.data.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-[4px] border border-iw-border md:block">
            <table className="iw-table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Host</th>
                  <th scope="col">Status</th>
                  <th scope="col">Capture window</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {incidents.data.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="font-medium text-iw-ink hover:text-iw-green-bright"
                      >
                        {incident.title}
                      </Link>
                      {incident.demoMode || incident.simulationPresent ? (
                        <p className="mt-1">
                          <span className="iw-chip iw-chip-warning">Labelled demo / simulated evidence</span>
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-[8px] text-iw-faint">
                        Created {formatTimestamp(incident.createdAt)}
                      </p>
                    </td>
                    <td className="font-mono text-[9px]">
                      {hostNames.get(incident.hostId) ?? incident.hostId}
                    </td>
                    <td>
                      <StatusPill
                        label={incidentStatusLabel(incident.status)}
                        tone={incidentStatusTone(incident.status)}
                      />
                    </td>
                    <td className="whitespace-nowrap font-mono text-[9px] text-iw-faint">
                      {formatTimestampShort(incident.captureStartedAt)}
                      <br />
                      <span className="text-[8px]">to {formatTimestampShort(incident.captureEndsAt)}</span>
                    </td>
                    <td>
                      <span className="font-mono text-[9px]">{incident.acceptedEventCount} events</span>
                      {incident.status === "sealed" ? (
                        <>
                          <p className="mt-1 font-mono text-[8px] text-iw-muted">
                            {incident.assessment?.code ?? "UNKNOWN"} /{" "}
                            {incident.assessment?.evidenceGrade ?? "INSUFFICIENT"}
                          </p>
                          <p className="mt-1 text-[8px] leading-4 text-iw-faint">
                            {assessmentText(incident.assessment?.code ?? null)}
                          </p>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {incidents.data.map((incident) => (
              <div key={incident.id} className="iw-panel p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="text-[11px] font-medium text-iw-ink hover:text-iw-green-bright"
                    >
                      {incident.title}
                    </Link>
                    <p className="mt-1 font-mono text-[8px] text-iw-faint">
                      {hostNames.get(incident.hostId) ?? incident.hostId}
                    </p>
                  </div>
                  <StatusPill
                    label={incidentStatusLabel(incident.status)}
                    tone={incidentStatusTone(incident.status)}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {incident.demoMode || incident.simulationPresent ? (
                    <span className="iw-chip iw-chip-warning">Simulated</span>
                  ) : null}
                  <span className="font-mono text-[8px] text-iw-faint">
                    {formatTimestampShort(incident.captureStartedAt)}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[8px] text-iw-muted">
                  {incident.acceptedEventCount} events
                  {incident.status === "sealed"
                    ? ` · ${incident.assessment?.code ?? "UNKNOWN"}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
