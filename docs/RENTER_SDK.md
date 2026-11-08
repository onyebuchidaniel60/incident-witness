# Renter SDK — Integration Guide

**Status:** Phase 3E implementation in `packages/renter-sdk`, accepted on 2026-10-31. Not published
as a signed package yet.

## Purpose

The renter SDK lets a workload client contribute a limited, independently controlled perspective to
one provider evidence session. It sends signed heartbeats and fixed endpoint observations. It is not
a general telemetry/monitoring SDK and does not collect workload contents.

A signature proves the event bytes came from the enrolled renter key. It does not prove that the
renter's software, clock or observations are honest.

## Install and build

From the repository:

```bash
npm run build --workspace @incident-witness/renter-sdk
```

The package exports `RenterClient`, event/endpoint helpers and state utilities. Node.js 26.13.0 is
required.

## Enroll and run

```ts
import { RenterClient } from "@incident-witness/renter-sdk";

const client = await RenterClient.enroll({
  apiBaseUrl: "https://api.example.test",
  invitationToken: invitationFromProvider,
  endpointHostname: providerHostnameFromInvitation,
  workloadRef: "job-123", // optional opaque reference, max 100 chars
  stateDir: "/run/incident-witness-renter", // optional secure persistence
});

client.start();

// ... workload runs ...

await client.stop();
```

`endpointHostname` is required. The current `/v1/renter/enroll` response does not return the
provider's verified hostname, so the integrator must obtain it from the provider's invitation
context. Only the fixed path `/.well-known/incident-witness/health` on HTTPS port 443 is checked;
the SDK does not accept a URL, port, path or query from workload input. This integration gap is
reported in `docs/planning/AI_HANDOFF.md` and must be handled by the Phase 4 provider UI.

The invitation token is sent only in the enrollment request body. It is not stored in SDK state,
logs, URLs or command-line arguments. Invitations are single-use and expire after 15 minutes.

## Event behaviour

- `renter_heartbeat` is queued immediately on `start()` and every 30 seconds.
- `renter_endpoint_result` is checked immediately and every 60 seconds, plus whenever the
  reachability state changes.
- Both event types use one monotonically increasing sequence per renter key, persisted atomically
  with the queued event when `stateDir` is configured.
- The SDK only builds events for the incident and source key returned by enrollment. There is no API
  to target another incident; the server also enforces key/incident scope.
- Events stop being created at `sessionEndsAt`. Already queued events may flush during the server's
  24-hour ingestion grace period.
- `409 INCIDENT_CLOSED` stops the SDK gracefully and retains local queued events for inspection.
- The SDK stops at `sessionEndsAt + 24 hours` and does not retry forever.

## Queue and retry

- Queue cap: 5 MiB of serialised signed envelopes.
- If the queue is full, the oldest queued observation is dropped and `droppedEvents` (and
  `status().droppedEvents`) exposes the loss. New observations are not silently treated as captured.
- Network errors, `429` and `5xx` retry with jittered exponential backoff (1 second base, 60 second
  cap). `Retry-After` is respected up to 60 seconds.
- Signature/schema/scope errors, revoked credentials, expired invitations, closed incidents and
  other non-retryable `4xx` responses halt the SDK rather than retrying unchanged bytes.
- Exact duplicate uploads are treated as delivered. Local sequence numbers are never reused.

## Persistence

Without `stateDir`, the private key, credential and queue live in process memory. A workload restart
would require a new invitation because the original invitation is single-use; use `stateDir` if
restart survival is required.

With `stateDir`:

- the directory is created `0700` and the state file is `0600`;
- the state file contains the incident-scoped private key, ingestion credential, sequence counter and
  bounded queue;
- symlinked or non-owner secret paths are rejected;
- `RenterClient.resume({ stateDir })` reloads the session without reusing the invitation.

Treat the state directory as sensitive secret material. Do not copy it into an image, log it or
share it.

## Status

```ts
client.status();
```

Returns the incident ID, source key ID, API origin, session/ingestion deadlines, next sequence,
queue size/count, dropped count, last endpoint result and safe halt reason. It never returns the
private key or ingestion credential.

## Data intentionally excluded

No prompts, chat history, generated output, dataset, model weights, file content, environment
variables, GPU workload stdout/stderr, API keys, customer IDs beyond an optional opaque workload
reference, arbitrary hostnames/ports/paths or arbitrary network destinations.

## Error handling

| Condition | Behaviour |
|---|---|
| Invitation expired/redeemed | Enrollment fails with a safe code; ask the provider for a new invitation |
| Incident ended | Stop creating events; flush queued events within the grace period |
| API offline | Queue within 5 MiB and retry with backoff |
| Credential revoked | Halt; surface the safe auth code |
| Schema/signature/scope rejected | Halt; do not retry unchanged bytes |
| Queue full | Drop oldest periodic observation, expose `droppedEvents` |
| Endpoint check fails | Emit an explicit `unreachable`/`timeout`/`tls_error`/`http_error` result; never report healthy |

## Limitations

- No published package, installer or browser client.
- No automatic endpoint metadata: the integrator supplies `endpointHostname` from the invitation.
- The endpoint check is a renter-side observation, not a platform probe; it can be affected by the
  renter's own network.
- Private-key persistence requires an explicitly configured secure directory; the default is
  in-memory only.
