# API Reference Index

**Status:** Phase 3B host/incident domain APIs implemented and tested against staging. Event ingestion, sealing, bundle download and the probe worker remain Phase 3C–3E.

Base path: `/v1`. Common response/error shape and detailed request validation are defined in `ARCHITECTURE.md`, section 10.

## Implemented provider endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health/live` | Public | Liveness |
| GET | `/health/ready` | Health bearer token | Readiness and migration check |
| GET | `/v1/me` | Supabase JWT | Idempotent profile bootstrap |
| GET | `/v1/hosts` | Supabase JWT | List owned hosts (cursor pagination) |
| POST | `/v1/hosts` | Supabase JWT + `Idempotency-Key` | Create a pending host |
| GET | `/v1/hosts/:hostId` | JWT + owner | Read host, key status and endpoint state |
| PATCH | `/v1/hosts/:hostId` | JWT + owner | Update alias only |
| POST | `/v1/hosts/:hostId/endpoint-challenge` | JWT + owner | Issue a 10-minute DNS TXT challenge |
| POST | `/v1/hosts/:hostId/endpoint-verify` | JWT + owner | Verify exact TXT, public addresses and fixed HTTPS health response |
| POST | `/v1/hosts/:hostId/enrollment-codes` | JWT + owner | Issue a 10-minute one-time host enrollment code |
| POST | `/v1/hosts/:hostId/archive` | JWT + owner | Archive host, revoke credentials/tokens and cancel probe jobs |
| POST | `/v1/hosts/:hostId/keys/:keyId/revoke` | JWT + owner | Revoke a host key and linked credentials |
| POST | `/v1/incidents` | JWT + owner + `Idempotency-Key` | Create a 2–240 minute collecting session |
| GET | `/v1/incidents` | JWT + owner | List owned sessions with status/host filters |
| GET | `/v1/incidents/:incidentId` | JWT + owner | Read session metadata, sources and timeline summary |
| POST | `/v1/incidents/:incidentId/end` | JWT + owner | `collecting → awaiting_finalize`; cancel future probe jobs |
| POST | `/v1/incidents/:incidentId/renter-invitations` | JWT + owner | Issue a 15-minute one-time renter invitation |
| POST | `/v1/incidents/:incidentId/keys/:keyId/revoke` | JWT + incident owner | Revoke an incident-scoped renter key |

## Implemented scoped machine endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/agent/enroll` | Single-use enrollment code | Register host public key, issue certificate and one-time device credential |
| POST | `/v1/agent/heartbeat` | Host bearer credential + Ed25519 presence signature | Update operational presence; **not** an evidence event |
| POST | `/v1/renter/enroll` | Single-use renter invitation | Register an incident-scoped renter key and credential |

`POST /v1/agent/heartbeat` requires `Content-Type: application/vnd.incident-witness.presence+json` and exact RFC 8785 canonical bytes. The signature covers `incident-witness-host-presence-v1\n` plus the canonical request without `signature`.

## Not implemented yet

The following remain Phase 3C+ and must not be treated as live:

- `POST /v1/agent/events`
- `POST /v1/renter/events`
- `POST /v1/incidents/:incidentId/seal`
- `GET /v1/incidents/:incidentId/bundle`
- Probe worker and platform-probe observations
- Host agent, renter SDK and CLI verifier
- Automatic grace-expiry sealing/cancellation (the Phase 3B sweeper only auto-ends at `capture_ends_at`)

## Error codes used by Phase 3B

- `AUTH_REQUIRED`, `AUTH_INVALID`, `PERMISSION_DENIED`.
- `RESOURCE_NOT_FOUND` for missing **and non-owned** resources.
- `VALIDATION_ERROR`, `RESOURCE_CONFLICT`, `IDEMPOTENCY_CONFLICT`.
- `HOST_NOT_READY`, `HOST_ALREADY_ENROLLED`, `HOST_HAS_ACTIVE_INCIDENT`.
- `ENDPOINT_CHALLENGE_EXPIRED`, `ENDPOINT_CHALLENGE_CONSUMED`, `ENDPOINT_CHALLENGE_ATTEMPTS_EXCEEDED`.
- `ENDPOINT_UNSAFE_TARGET`, `ENDPOINT_VERIFICATION_FAILED`.
- `ENROLLMENT_INVALID`, `ENROLLMENT_ALREADY_REDEEMED`.
- `INVITATION_INVALID`, `INVITATION_ALREADY_REDEEMED`.
- `INCIDENT_NOT_COLLECTING`, `INCIDENT_LIMIT_REACHED`, `RENTER_ALREADY_ENROLLED`.
- `KEY_SCOPE_MISMATCH`, `PRESENCE_REPLAY`, `PRESENCE_STALE`.
- `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`.

## Lifecycle notes

- `POST /v1/hosts` and `POST /v1/incidents` require `Idempotency-Key`. A repeated key with the same validated body returns the original resource; a different body returns `IDEMPOTENCY_CONFLICT`. One-time secrets are never stored in idempotency records.
- Enrollment codes expire after 10 minutes and are single-use. Issuing a new code revokes older unredeemed codes. A lost enrollment response cannot recover the device credential; revoke the key and issue a new code.
- Renter invitations expire after 15 minutes and are single-use. Issuing a new invitation revokes older unredeemed invitations. Only one active renter key is allowed per incident.
- A manual end records the actual `endedAt`; `captureEndsAt` remains the bounded scheduled end because the Phase 2 schema enforces a minimum 2-minute capture window. Phase 3C must use `endedAt` as the effective end when it is earlier.
- Host archive is terminal and is rejected while any incident is `collecting` or `awaiting_finalize`. Sealing/cancellation is Phase 3C.
- Key revocation prevents new ingestion but does not invalidate historical signatures.

Do not expose stack traces, database error text, key values or whether another account owns an identifier. The API OpenAPI schema must be generated from the exact versioned route schemas and checked into `docs/openapi.json` only after implementation is real and tested.
