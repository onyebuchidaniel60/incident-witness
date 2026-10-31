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
      <div className="space-y-4">
        <ErrorState
          error={host.error}
          onRetry={notFound ? undefined : host.reload}
          title={notFound ? "Host not found." : "The host could not be loaded."}
        />
        <Link href="/hosts" className="text-sm font-medium underline">
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill label={hostStatusLabel(data.status)} tone={hostStatusTone(data.status)} />
        <span className="text-sm text-slate-600">Host ID: {data.id}</span>
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

      <section
        aria-labelledby="host-metadata"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="host-metadata" className="text-lg font-semibold text-slate-950">
          Host metadata
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-600">Alias</dt>
            <dd className="text-slate-950">{data.alias}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Hostname</dt>
            <dd className="break-all text-slate-950">{data.hostname}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Health path</dt>
            <dd className="break-all font-mono text-xs text-slate-950">{data.endpoint.path}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Endpoint verified</dt>
            <dd className="text-slate-950">{formatTimestamp(data.endpointVerifiedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Last agent presence</dt>
            <dd className="text-slate-950">{formatTimestamp(data.lastAgentSeenAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Agent version</dt>
            <dd className="text-slate-950">{data.agentVersion ?? "Not reported"}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="endpoint-proof"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="endpoint-proof" className="text-lg font-semibold text-slate-950">
          DNS ownership and endpoint proof
        </h2>
        {endpointVerified ? (
          <p className="mt-2 text-sm leading-6 text-slate-700">
            This hostname was verified at {formatTimestamp(data.endpointVerifiedAt)}. The DNS
            challenge proves configuration control, not hardware identity or sensor truth.
          </p>
        ) : (
          <div className="mt-2 space-y-4 text-sm leading-6 text-slate-700">
            <p>
              Create a challenge, add the TXT record at your DNS provider, then verify. The endpoint
              must serve the fixed health path over HTTPS on port 443 with the exact expected body.
            </p>
            {data.endpointChallenge && !challenge ? (
              <p>
                A previous challenge exists for{" "}
                <code className="font-mono">{data.endpointChallenge.dnsRecordName}</code> until{" "}
                {formatTimestamp(data.endpointChallenge.expiresAt)}. Its secret value is not
                recoverable; create a new challenge if you no longer have it.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void createChallenge()}
                disabled={busy !== null || archived}
                className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {busy === "challenge" ? "Issuing challenge…" : "Create DNS challenge"}
              </button>
              <button
                type="button"
                onClick={() => void verifyChallenge()}
                disabled={busy !== null || archived || !currentChallenge}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {busy === "verify" ? "Verifying…" : "Verify DNS"}
              </button>
            </div>
            {currentChallenge ? (
              <div className="rounded-md border border-slate-300 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">DNS TXT record</p>
                <dl className="mt-2 space-y-2">
                  <div>
                    <dt className="font-medium text-slate-600">Name</dt>
                    <dd data-testid="dns-record-name" className="break-all font-mono text-xs">
                      {currentChallenge.dnsRecordName}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-600">Value</dt>
                    <dd data-testid="dns-record-value" className="break-all font-mono text-xs">
                      {currentChallenge.dnsRecordValue}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-600">Expires</dt>
                    <dd>{formatTimestamp(currentChallenge.expiresAt)}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <CopyButton value={currentChallenge.dnsRecordValue} label="Copy TXT value" />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section
        aria-labelledby="agent-enrollment"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="agent-enrollment" className="text-lg font-semibold text-slate-950">
          Agent enrollment
        </h2>
        {data.sourceKey ? (
          <div className="mt-2 space-y-3 text-sm leading-6 text-slate-700">
            <p>
              Source key <code className="font-mono text-xs">{data.sourceKey.id}</code> is{" "}
              <strong>{data.sourceKey.status}</strong>. Last key presence:{" "}
              {formatTimestamp(data.sourceKey.lastSeenAt)}.
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
          <div className="mt-2 space-y-4 text-sm leading-6 text-slate-700">
            <p>
              Issue a one-time enrollment code, paste it into the host agent on the Linux machine,
              and keep the resulting credential local. The code expires after 10 minutes.
            </p>
            <button
              type="button"
              onClick={() => void issueEnrollmentCode()}
              disabled={busy !== null}
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {busy === "enrollment" ? "Issuing code…" : "Issue enrollment code"}
            </button>
            {enrollment ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">One-time enrollment code</p>
                <p data-testid="enrollment-code" className="mt-2 break-all font-mono text-xs">
                  {enrollment.enrollmentCode}
                </p>
                <p className="mt-2">Expires: {formatTimestamp(enrollment.expiresAt)}</p>
                <p className="mt-2">
                  This value is not stored and cannot be recovered. If it is lost, revoke/replace
                  it.
                </p>
                <div className="mt-3">
                  <CopyButton value={enrollment.enrollmentCode} label="Copy enrollment code" />
                </div>
                <p className="mt-3 text-sm">{enrollment.installInstructions}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {data.status === "pending_endpoint"
              ? "Verify the endpoint before issuing an agent enrollment code."
              : "No agent source key is registered for this host."}
          </p>
        )}
      </section>

      <section
        aria-labelledby="host-archive"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="host-archive" className="text-lg font-semibold text-slate-950">
          Archive host
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Archiving is terminal for this host record in v1. It prevents new sessions, revokes active
          host credentials and unused enrollment tokens, and preserves existing sealed evidence.
        </p>
        {archived ? (
          <p className="mt-3 text-sm font-medium text-slate-800">This host is archived.</p>
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
      </section>

      <p className="text-sm">
        <Link href="/hosts" className="font-medium underline">
          Back to hosts
        </Link>
      </p>
    </div>
  );
}
