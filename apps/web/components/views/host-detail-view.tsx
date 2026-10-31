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
import { ApiError, apiRequest } from "@/lib/api/client";
import type { ChallengeResponse, EnrollmentCodeResponse, HostDetail } from "@/lib/api/types";
import { useApiResource } from "@/lib/api/use-api-resource";
import { formatTimestamp, hostStatusLabel, hostStatusTone } from "@/lib/format";

const verifyReasonLabels: Record<string, string> = {
  DNS_TXT_MISMATCH: "The DNS TXT value was not found or does not match the current challenge.",
  DNS_LOOKUP_FAILED: "The DNS TXT record could not be checked. Try again after DNS propagation.",
  DNS_RESOLUTION_FAILED: "The hostname could not be resolved to a public address.",
  UNSAFE_TARGET: "The hostname resolves to an address that is not allowed for probing.",
  ENDPOINT_CHECK_FAILED: "The fixed HTTPS health check could not be completed.",
  REDIRECT: "The health endpoint returned a redirect; redirects are not accepted.",
  HTTP_STATUS: "The health endpoint did not return HTTP 200.",
  CONTENT_TYPE: "The health response content type was not text/plain.",
  BODY_MISMATCH: "The health response body did not match the required fixed value.",
  TLS_ERROR: "The endpoint TLS certificate could not be validated.",
  TIMEOUT: "The health endpoint timed out.",
  CONNECTION_ERROR: "The health endpoint could not be reached.",
};

export function HostDetailView({ hostId }: { hostId: string }) {
  const host = useApiResource<HostDetail>(`/v1/hosts/${hostId}`);
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentCodeResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  async function createChallenge() {
    await run("challenge", async () => {
      const result = await apiRequest<ChallengeResponse>(`/v1/hosts/${hostId}/endpoint-challenge`, {
        method: "POST",
      });
      setChallenge(result);
      setMessage("A new one-time DNS challenge was issued. Add it at your DNS provider.");
      host.reload();
    });
  }

  async function verifyChallenge() {
    if (!challenge) {
      setError("Create a DNS challenge in this page before verifying.");
      return;
    }
    await run("verify", async () => {
      const result = await apiRequest<{
        verified: boolean;
        status: string;
        reasonCode?: string;
        checkedAt: string;
      }>(`/v1/hosts/${hostId}/endpoint-verify`, {
        method: "POST",
        body: { challengeId: challenge.challengeId },
      });
      if (!result.verified) {
        setError(
          result.reasonCode
            ? (verifyReasonLabels[result.reasonCode] ?? "The endpoint was not verified.")
            : "The endpoint was not verified.",
        );
        host.reload();
        return;
      }
      setMessage("Endpoint verified. You can now issue a one-time agent enrollment code.");
      host.reload();
    });
  }

  async function issueEnrollmentCode() {
    await run("enrollment", async () => {
      const result = await apiRequest<EnrollmentCodeResponse>(
        `/v1/hosts/${hostId}/enrollment-codes`,
        { method: "POST" },
      );
      setEnrollment(result);
      setMessage("A one-time enrollment code was issued. It is shown only in this panel.");
      host.reload();
    });
  }

  async function revokeKey(keyId: string) {
    await run("revoke", async () => {
      await apiRequest(`/v1/hosts/${hostId}/keys/${keyId}/revoke`, {
        method: "POST",
        body: { reasonCode: "USER_REQUEST" },
      });
      setMessage("The host source key and its ingestion credential were revoked.");
      host.reload();
    });
  }

  async function archiveHost() {
    await run("archive", async () => {
      await apiRequest(`/v1/hosts/${hostId}/archive`, { method: "POST" });
      setMessage("The host was archived. This host record cannot be unarchived in v1.");
      host.reload();
    });
  }

  if (host.loading) return <LoadingState label="Loading host…" />;
  if (host.error) {
    const notFound = host.error instanceof ApiError && host.error.status === 404;
    return (
      <div className="space-y-3">
        <ErrorState
          error={host.error}
          onRetry={notFound ? undefined : host.reload}
          title={notFound ? "Host not found." : "The host could not be loaded."}
        />
        <Link href="/hosts" className="iw-link text-[10px]">
          Back to hosts
        </Link>
      </div>
    );
  }
  if (!host.data) return <EmptyState title="No host record returned." />;

  const data = host.data;
  const archived = data.status === "archived";
  const endpointVerified = Boolean(data.endpointVerifiedAt);
  const currentChallenge = challenge ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={hostStatusLabel(data.status)} tone={hostStatusTone(data.status)} />
        <span className="font-mono text-[9px] text-iw-faint">Host ID: {data.id}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl leading-tight text-iw-ink">{data.alias}</h2>
          <p className="mt-1 break-all font-mono text-[9px] text-iw-faint">{data.hostname}</p>
        </div>
        <Link href="/hosts" className="iw-btn iw-btn-ghost iw-btn-sm">
          <Icon name="arrow-left" size="sm" />
          Back to hosts
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

      <section className="iw-panel" aria-labelledby="host-metadata">
        <div className="iw-panel-header">
          <div>
            <h2 id="host-metadata" className="text-sm font-semibold text-iw-ink">
              Host metadata
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">Endpoint and agent identity</p>
          </div>
          <span className="iw-chip iw-chip-neutral">{data.endpoint.path}</span>
        </div>
        <div className="iw-panel-body">
          <dl className="grid gap-x-6 gap-y-3 text-[10px] sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-iw-faint">Alias</dt>
              <dd className="mt-0.5 text-iw-ink-soft">{data.alias}</dd>
            </div>
            <div>
              <dt className="text-iw-faint">Hostname</dt>
              <dd className="mt-0.5 break-all font-mono text-iw-ink-soft">{data.hostname}</dd>
            </div>
            <div>
              <dt className="text-iw-faint">Health path</dt>
              <dd className="mt-0.5 break-all font-mono text-iw-ink-soft">{data.endpoint.path}</dd>
            </div>
            <div>
              <dt className="text-iw-faint">Endpoint verified</dt>
              <dd className="mt-0.5 font-mono text-iw-ink-soft">
                {formatTimestamp(data.endpointVerifiedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-iw-faint">Last agent presence</dt>
              <dd className="mt-0.5 font-mono text-iw-ink-soft">
                {formatTimestamp(data.lastAgentSeenAt)}
              </dd>
            </div>
            <div>
              <dt className="text-iw-faint">Agent version</dt>
              <dd className="mt-0.5 font-mono text-iw-ink-soft">
                {data.agentVersion ?? "Not reported"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="iw-panel" aria-labelledby="endpoint-proof">
        <div className="iw-panel-header">
          <div>
            <h2 id="endpoint-proof" className="text-sm font-semibold text-iw-ink">
              DNS ownership and endpoint proof
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">
              Prove configuration control before enrollment
            </p>
          </div>
          {endpointVerified ? (
            <span className="iw-chip iw-chip-success">Endpoint verified</span>
          ) : (
            <span className="iw-chip iw-chip-warning">Verification required</span>
          )}
        </div>
        <div className="iw-panel-body">
          {endpointVerified ? (
            <p className="text-[10px] leading-5 text-iw-muted">
              This hostname was verified at {formatTimestamp(data.endpointVerifiedAt)}. The DNS
              challenge proves configuration control, not hardware identity or sensor truth.
            </p>
          ) : (
            <div className="space-y-4 text-[10px] leading-5 text-iw-muted">
              <p>
                Create a challenge, add the TXT record at your DNS provider, then verify. The
                endpoint must serve the fixed health path over HTTPS on port 443 with the exact
                expected body.
              </p>
              {data.endpointChallenge && !challenge ? (
                <p>
                  A previous challenge exists for{" "}
                  <code className="font-mono text-[9px] text-iw-ink-soft">
                    {data.endpointChallenge.dnsRecordName}
                  </code>{" "}
                  until {formatTimestamp(data.endpointChallenge.expiresAt)}. Its secret value is not
                  recoverable; create a new challenge if you no longer have it.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void createChallenge()}
                  disabled={busy !== null || archived}
                  className="iw-btn iw-btn-primary iw-btn-sm"
                >
                  {busy === "challenge" ? "Issuing challenge…" : "Create DNS challenge"}
                </button>
                <button
                  type="button"
                  onClick={() => void verifyChallenge()}
                  disabled={busy !== null || archived || !currentChallenge}
                  className="iw-btn iw-btn-secondary iw-btn-sm"
                >
                  {busy === "verify" ? "Verifying…" : "Verify DNS"}
                </button>
              </div>
              {currentChallenge ? (
                <div className="rounded-[4px] border border-iw-border bg-white/[0.025] p-3">
                  <p className="font-semibold text-iw-ink">DNS TXT record</p>
                  <dl className="mt-2 space-y-2">
                    <div>
                      <dt className="text-iw-faint">Name</dt>
                      <dd
                        data-testid="dns-record-name"
                        className="break-all font-mono text-[9px] text-iw-ink-soft"
                      >
                        {currentChallenge.dnsRecordName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-iw-faint">Value</dt>
                      <dd
                        data-testid="dns-record-value"
                        className="break-all font-mono text-[9px] text-iw-ink-soft"
                      >
                        {currentChallenge.dnsRecordValue}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-iw-faint">Expires</dt>
                      <dd className="font-mono text-[9px] text-iw-ink-soft">
                        {formatTimestamp(currentChallenge.expiresAt)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <CopyButton value={currentChallenge.dnsRecordValue} label="Copy TXT value" />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="iw-panel" aria-labelledby="agent-enrollment">
        <div className="iw-panel-header">
          <div>
            <h2 id="agent-enrollment" className="text-sm font-semibold text-iw-ink">
              Agent enrollment
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">
              One-time code · single use · 10 minutes
            </p>
          </div>
          {data.sourceKey ? (
            <span className={`iw-chip ${data.sourceKey.status === "active" ? "iw-chip-success" : "iw-chip-neutral"}`}>
              {data.sourceKey.status}
            </span>
          ) : (
            <span className="iw-chip iw-chip-warning">Pending enrollment</span>
          )}
        </div>
        <div className="iw-panel-body">
          {data.sourceKey ? (
            <div className="space-y-3 text-[10px] leading-5 text-iw-muted">
              <p>
                Source key{" "}
                <code className="font-mono text-[9px] text-iw-ink-soft">{data.sourceKey.id}</code>{" "}
                is <strong className="text-iw-ink-soft">{data.sourceKey.status}</strong>. Last key
                presence: {formatTimestamp(data.sourceKey.lastSeenAt)}.
              </p>
              {data.sourceKey.status === "active" && !archived ? (
                <ConfirmAction
                  label="Revoke host key"
                  confirmLabel="Revoke key"
                  description="Revocation prevents future signed events from this key. Historic signatures remain verifiable. A new enrollment will be required."
                  onConfirm={() => void revokeKey(data.sourceKey!.id)}
                  busy={busy === "revoke"}
                  disabled={busy !== null}
                  destructive
                />
              ) : null}
            </div>
          ) : data.status === "pending_enrollment" ? (
            <div className="space-y-4 text-[10px] leading-5 text-iw-muted">
              <p>
                Issue a one-time enrollment code, paste it into the host agent on the Linux machine,
                and keep the resulting credential local. The code expires after 10 minutes.
              </p>
              <button
                type="button"
                onClick={() => void issueEnrollmentCode()}
                disabled={busy !== null}
                className="iw-btn iw-btn-primary iw-btn-sm"
              >
                {busy === "enrollment" ? "Issuing code…" : "Issue enrollment code"}
              </button>
              {enrollment ? (
                <div className="iw-notice iw-notice-warning flex-col gap-2">
                  <p className="font-semibold">One-time enrollment code</p>
                  <p
                    data-testid="enrollment-code"
                    className="break-all font-mono text-[10px]"
                  >
                    {enrollment.enrollmentCode}
                  </p>
                  <p>Expires: {formatTimestamp(enrollment.expiresAt)}</p>
                  <p>
                    This value is not stored and cannot be recovered. If it is lost, revoke/replace
                    it.
                  </p>
                  <CopyButton value={enrollment.enrollmentCode} label="Copy enrollment code" />
                  <p>{enrollment.installInstructions}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[10px] leading-5 text-iw-muted">
              {data.status === "pending_endpoint"
                ? "Verify the endpoint before issuing an agent enrollment code."
                : "No agent source key is registered for this host."}
            </p>
          )}
        </div>
      </section>

      <section className="iw-panel" aria-labelledby="host-archive">
        <div className="iw-panel-header">
          <div>
            <h2 id="host-archive" className="text-sm font-semibold text-iw-ink">
              Archive host
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">Terminal lifecycle action</p>
          </div>
        </div>
        <div className="iw-panel-body">
          <p className="max-w-3xl text-[10px] leading-5 text-iw-muted">
            Archiving is terminal for this host record in v1. It prevents new sessions, revokes
            active host credentials and unused enrollment tokens, and preserves existing sealed
            evidence.
          </p>
          {archived ? (
            <p className="mt-3 text-[10px] font-medium text-iw-ink-soft">This host is archived.</p>
          ) : (
            <div className="mt-3">
              <ConfirmAction
                label="Archive host"
                confirmLabel="Archive host"
                description="Archive this host record? This cannot be undone in v1. End any active session first."
                onConfirm={() => void archiveHost()}
                busy={busy === "archive"}
                disabled={busy !== null}
                destructive
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
