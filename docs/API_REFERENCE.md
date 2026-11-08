# API Reference Index

**Status:** Phase 3C API-side event ingestion, deterministic correlation and bundle sealing implemented and tested against staging. Phase 3D Linux host agent accepted. Phase 3E renter SDK and platform probe worker accepted. Phase 3F offline CLI verifier and synthetic demo harness accepted. Phase 4 connects the web workspace and local browser verifier to these existing contracts. Phase 5 adds the owner-visible bounded payload to the incident-detail timeline and hardens sealing/readiness; no public API route was added.

Base path: `/v1`. Common response/error shape and detailed request validation are defined in `docs/planning/ARCHITECTURE.md`, section 10.

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
| GET | `/v1/incidents/:incidentId` | JWT + owner | Read session metadata, sources, timeline summary and sealed assessment |

The incident-detail timeline returns the latest 50 accepted events with `eventId`, `sourceKeyId`, `sourceType`, `eventType`, `sequence`, `observedAt`, `receivedAt`, the owner-visible bounded `payload` and `simulationMode`. Payloads support UI availability states such as UPS/GPU `unavailable` and do not expose any other incident or provider data.
| POST | `/v1/incidents/:incidentId/end` | JWT + owner | `collecting → awaiting_finalize`; cancel future probe jobs |
| POST | `/v1/incidents/:incidentId/seal` | JWT + owner | Seal an immutable evidence bundle |
| GET | `/v1/incidents/:incidentId/bundle` | JWT + owner | Download the exact sealed JSON bundle |
| POST | `/v1/incidents/:incidentId/renter-invitations` | JWT + owner | Issue a 15-minute one-time renter invitation |
| POST | `/v1/incidents/:incidentId/keys/:keyId/revoke` | JWT + incident owner | Revoke an incident-scoped renter key |

## Implemented scoped machine endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/agent/enroll` | Single-use enrollment code | Register host public key, issue certificate and one-time device credential |
| POST | `/v1/agent/heartbeat` | Host bearer credential + Ed25519 presence signature | Update operational presence; **not** an evidence event |
| POST | `/v1/agent/events` | Host credential + Ed25519 event signature | Append a signed host evidence event |
| POST | `/v1/renter/enroll` | Single-use renter invitation | Register an incident-scoped renter key and credential |
| POST | `/v1/renter/events` | Renter credential + Ed25519 event signature | Append a signed incident-scoped renter event |

Event ingestion requires `Content-Type: application/vnd.incident-witness.event+json`. The request body must be exact RFC 8785 canonical JSON of the complete signed envelope; whitespace, reordered keys, duplicate properties and noncanonical numbers are rejected before signature verification. Operational presence uses `application/vnd.incident-witness.presence+json` and the domain-separated presence signature.

## Event ingestion rules

- Maximum request: 8 KiB. Maximum signed payload: 2 KiB canonical bytes.
- Event sequence is a positive safe integer, unique per source key.
- `observed_at` must be within `[capture_started_at, effective capture end]`, where the effective end is `endedAt` when the owner ended early, otherwise `captureEndsAt`.
- `observed_at` more than five minutes in the future is rejected.
- Server receipt must be before `ingestion_deadline`.
- The incident row is locked before insert; seal and ingest serialize so exactly one wins.
- Atomic budget: 4,000 accepted events and 7 MiB aggregate canonical bundle event-entry bytes per incident. Exceeding either returns `INCIDENT_EVIDENCE_LIMIT`.
- Exact duplicate event ID/body/signature returns the original receipt with `duplicate:true` (HTTP 200). Same event ID with different content or reused source sequence returns `EVENT_CONFLICT` (HTTP 409).
- Simulated events are accepted only when the incident has `demo_mode=true`.
- Sealed/cancelled incidents return `INCIDENT_CLOSED` for new events.

## Sealing and bundle rules

- Seal requires incident status `awaiting_finalize`, at least one accepted event and no active probe lease.
- The seal transaction locks the incident, re-verifies stored event signatures/digests, runs the deterministic correlator, constructs the manifest, signs it with the platform Ed25519 key, inserts the immutable bundle and changes the incident to `sealed`.
- The manifest includes ordered events, source certificates, gaps, assessment, evidence grade, simulation flag, platform key ID and limitations.
- `bundleSha256` is the SHA-256 digest of the canonical manifest; the platform signature covers the same canonical manifest.
- The complete canonical bundle must be at most 10 MiB.
- Download returns `application/vnd.incident-witness.bundle+json` with `Content-Disposition: attachment`, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- The lifecycle sweeper auto-seals at `ingestion_deadline` when evidence exists, otherwise cancels with `NO_EVIDENCE`. A signing/DB failure leaves the incident `awaiting_finalize` for retry.

## Deterministic correlator

`@incident-witness/correlator` is a pure package. Rule version `iw-rules-v1` uses a 120-second correlation window, 180-second power chain window and 30-second probe/host adjacency. It returns `POWER_RELATED`, `EXTERNAL_REACHABILITY_LOSS`, `HOST_OR_WORKLOAD_EXIT` or `UNKNOWN`, with evidence grades `HIGH`, `MEDIUM`, `LOW` or `INSUFFICIENT`. Simulated decisive evidence caps the grade at `LOW` and adds `SIMULATED_EVIDENCE_PRESENT` to the explanation/flags. No timestamps or random values are used inside the correlator.

## Not implemented yet

- Production API/worker deployment and production evidence retention.
- Account deletion and the production retention/deletion policy.

The Phase 3D host agent (`packages/host-agent`) and Phase 3E renter SDK (`packages/renter-sdk`)
consume these contracts; see `HOST_AGENT.md` and `RENTER_SDK.md`. The separate platform probe worker
(`apps/probe-worker`) reads/leases `probe_jobs`, signs `platform_probe_result` observations and
appends them directly as `iw_worker`; it adds no public API route. See `PROBE_WORKER.md`.

## Error codes used by Phase 3C

- `AUTH_REQUIRED`, `AUTH_INVALID`, `PERMISSION_DENIED`.
- `RESOURCE_NOT_FOUND` for missing **and non-owned** resources.
- `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `RESOURCE_CONFLICT`, `IDEMPOTENCY_CONFLICT`.
- `HOST_NOT_READY`, `HOST_ALREADY_ENROLLED`, `HOST_HAS_ACTIVE_INCIDENT`.
- `ENDPOINT_CHALLENGE_EXPIRED`, `ENDPOINT_CHALLENGE_CONSUMED`, `ENDPOINT_CHALLENGE_ATTEMPTS_EXCEEDED`.
- `ENDPOINT_UNSAFE_TARGET`, `ENDPOINT_VERIFICATION_FAILED`.
- `ENROLLMENT_INVALID`, `ENROLLMENT_ALREADY_REDEEMED`.
- `INVITATION_INVALID`, `INVITATION_ALREADY_REDEEMED`.
- `INCIDENT_NOT_COLLECTING`, `INCIDENT_LIMIT_REACHED`, `RENTER_ALREADY_ENROLLED`.
- `EVENT_CONFLICT`, `EVENT_WINDOW_INVALID`, `EVENT_SIMULATION_NOT_ALLOWED`, `INCIDENT_EVIDENCE_LIMIT`, `INCIDENT_CLOSED`.
- `NO_EVIDENCE`, `PROBE_LEASE_ACTIVE`, `BUNDLE_NOT_READY`, `BUNDLE_TOO_LARGE`, `PLATFORM_KEY_UNAVAILABLE`.
- `KEY_SCOPE_MISMATCH`, `PRESENCE_REPLAY`, `PRESENCE_STALE`.
- `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`.

## Lifecycle notes

- `POST /v1/hosts` and `POST /v1/incidents` require `Idempotency-Key`. A repeated key with the same validated body returns the original resource; a different body returns `IDEMPOTENCY_CONFLICT`.
- Enrollment codes expire after 10 minutes and are single-use. Issuing a new code revokes older unredeemed codes.
- Renter invitations expire after 15 minutes and are single-use. Only one active renter key is allowed per incident.
- A manual end records the actual `endedAt` (clamped to the latest accepted observation so the capture window remains consistent); `captureEndsAt` remains the bounded scheduled end because the Phase 2 schema enforces a minimum 2-minute capture window.
- Host archive is terminal and is rejected while any incident is `collecting` or `awaiting_finalize`.
- Key revocation prevents new ingestion but does not invalidate historical signatures.

Do not expose stack traces, database error text, key values or whether another account owns an identifier. The API OpenAPI schema must be generated from the exact versioned route schemas and checked into `docs/openapi.json` only after implementation is real and tested.
