"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StatusPill } from "@/components/async-state";
import type { HostSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import { formatTimestamp, hostStatusLabel, hostStatusTone } from "@/lib/format";

export function HostsView() {
  const hosts = useApiResource<HostSummary[]>("/v1/hosts");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/hosts/new"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
        >
          Add host
        </Link>
        <button
          type="button"
          onClick={hosts.reload}
          disabled={hosts.refreshing}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {hosts.refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {hosts.loading ? <LoadingState label="Loading hosts…" /> : null}
      {hosts.error ? (
        <ErrorState error={hosts.error} onRetry={hosts.reload} title="Hosts could not be loaded." />
      ) : null}
      {hosts.data && hosts.data.length === 0 ? (
        <EmptyState title="No hosts yet">
          <p>
            Add a host, publish its DNS TXT challenge and verify the fixed HTTPS health endpoint
            before issuing an enrollment code.
          </p>
          <Link href="/hosts/new" className="mt-3 inline-block font-medium underline">
            Add your first host
          </Link>
        </EmptyState>
      ) : null}

      {hosts.data && hosts.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Host
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Endpoint
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Last agent presence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {hosts.data.map((host) => (
                <tr key={host.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/hosts/${host.id}`} className="font-semibold underline">
                      {host.alias}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      Created {formatTimestamp(host.createdAt)}
                    </p>
                  </td>
                  <td className="max-w-xs break-all px-4 py-3 text-slate-700">{host.hostname}</td>
                  <td className="px-4 py-3">
                    <StatusPill
                      label={hostStatusLabel(host.status)}
                      tone={hostStatusTone(host.status)}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatTimestamp(host.lastAgentSeenAt)}
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
