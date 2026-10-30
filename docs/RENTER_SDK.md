# Renter SDK — Integration Guide (Planned)

**Status:** SDK design; package/API not yet implemented.

## Purpose

The renter SDK lets a workload client contribute a limited, independently controlled perspective to one provider evidence session. It sends signed heartbeats and fixed endpoint observations. It is not a general telemetry/monitoring SDK and does not collect workload contents.

## Integration lifecycle

1. Provider creates a bounded evidence session and issues an invitation.
2. Provider shares the invitation securely with the renter.
3. Renter incorporates the Incident Witness SDK or supported client into the workload runtime.
4. SDK redeems the invitation once (15-minute expiry), creates an Ed25519 key locally and receives a source certificate plus incident-scoped ingestion credential.
5. SDK sends typed heartbeat and endpoint-result observations during the session.
6. SDK stops at session end/ingestion deadline and releases its incident-scoped credential.

## SDK responsibilities

- Keep only the incident-scoped private key and credential required to sign/submit observations.
- Emit a signed `renter_heartbeat` every 30 seconds.
- Check only the approved provider health endpoint provided by the session authorization. Emit a separate `renter_endpoint_result` every 60 seconds and whenever the observed reachability state changes.
- Maintain one monotonically increasing event sequence per renter source key across both event types; persist it durably across restarts. Both event types are separately schema-capped and signed with that same source key.
- Persist a local queue capped at 5 MB; retry network/5xx/429 with exponential backoff and jitter, respecting `Retry-After`.
- Do not retry invalid signature, revoked credential, expired invitation, closed incident or schema errors without operator action.
- Stop when session's ingestion deadline passes.

## Data intentionally excluded

No prompts, chat history, generated output, dataset, model weights, file content, environment variables, GPU workload stdout/stderr, API keys, customer IDs beyond an opaque optional workload reference or arbitrary network destinations.

## Security model

- Invitation token is single use and expires after 15 minutes.
- Renter key is scoped to one incident only.
- SDK credential cannot query provider account data or other incidents.
- Signature proves event bytes came from a key; it does not establish that the renter's software or observation is honest.
- Do not put the invitation token in public source code, telemetry, URL query string or logs. Use a secure secret channel or URL fragment/manual redemption flow that is not sent in HTTP Referer.

## Error handling

| Condition | Behaviour |
|---|---|
| Invitation expired/redeemed | Stop; ask provider for a new invitation |
| Incident ended | Stop creating events; flush only within ingestion deadline |
| API offline | Queue within cap and retry with backoff |
| Credential revoked | Stop; surface fatal auth error |
| Schema/signature rejected | Stop retrying unchanged event; report request ID and safe error code |
| Local queue full | Expose a gap to caller; do not silently drop all events |

## Test requirements

SDK integration tests must prove one-use invitation, incident-only scope, duplicate/idempotent events, sequence persistence, queue recovery, deadline handling, payload limits and no collection of workload content. Cross-incident write attempts must fail.
