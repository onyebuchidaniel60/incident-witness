"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState, StatusPill } from "@/components/async-state";
import { Icon } from "@/components/ui/icon";
import type { HostSummary } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import { formatTimestampShort, hostStatusLabel, hostStatusTone } from "@/lib/format";

export function HostsView() {
  const hosts = useApiResource<HostSummary[]>("/v1/hosts");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link href="/hosts/new" className="iw-btn iw-btn-primary iw-btn-sm">
          <Icon name="plus" size="sm" />
          Add host
        </Link>
        <button
          type="button"
          onClick={hosts.reload}
          disabled={hosts.refreshing}
          className="iw-btn iw-btn-secondary iw-btn-sm"
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
          <Link href="/hosts/new" className="iw-link mt-3 inline-block text-[10px]">
            Add your first host
          </Link>
        </EmptyState>
      ) : null}

      {hosts.data && hosts.data.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-[4px] border border-iw-border md:block">
            <table className="iw-table">
              <thead>
                <tr>
                  <th scope="col">Host</th>
                  <th scope="col">Endpoint</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last agent presence</th>
                </tr>
              </thead>
              <tbody>
                {hosts.data.map((host) => (
                  <tr key={host.id}>
                    <td>
                      <Link
                        href={`/hosts/${host.id}`}
                        className="font-medium text-iw-ink hover:text-iw-green-bright"
                      >
                        {host.alias}
                      </Link>
                      <p className="mt-1 font-mono text-[8px] text-iw-faint">
                        Created {formatTimestampShort(host.createdAt)}
                      </p>
                    </td>
                    <td className="max-w-xs break-all font-mono text-[9px]">{host.hostname}</td>
                    <td>
                      <StatusPill
                        label={hostStatusLabel(host.status)}
                        tone={hostStatusTone(host.status)}
                      />
                    </td>
                    <td className="whitespace-nowrap font-mono text-[9px] text-iw-faint">
                      {formatTimestampShort(host.lastAgentSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {hosts.data.map((host) => (
              <div key={host.id} className="iw-panel p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/hosts/${host.id}`}
                      className="text-[11px] font-medium text-iw-ink hover:text-iw-green-bright"
                    >
                      {host.alias}
                    </Link>
                    <p className="mt-1 break-all font-mono text-[8.5px] text-iw-faint">
                      {host.hostname}
                    </p>
                  </div>
                  <StatusPill
                    label={hostStatusLabel(host.status)}
                    tone={hostStatusTone(host.status)}
                  />
                </div>
                <p className="mt-2 font-mono text-[8px] text-iw-faint">
                  Last presence: {formatTimestampShort(host.lastAgentSeenAt)}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
