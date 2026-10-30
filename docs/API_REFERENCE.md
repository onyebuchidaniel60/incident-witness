# API Reference Index (MVP — Planned)

**Status:** Contract index; actual OpenAPI document is created from route schemas during Phase 3.

Base path: `/v1`. Common response/error shape and detailed request validation are defined in `ARCHITECTURE.md`, section 10.

## Provider endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health/live` | Public | Liveness |
| GET | `/health/ready` | Internal | Readiness |
| GET/POST | `/v1/hosts` | Supabase JWT | List/create hosts |
| GET/PATCH | `/v1/hosts/:hostId` | Supabase JWT + owner | Read/update alias |
| POST | `/v1/hosts/:hostId/endpoint-challenge` | JWT + owner | Issue DNS challenge |
| POST | `/v1/hosts/:hostId/endpoint-verify` | JWT + owner | Verify DNS/TLS/fixed endpoint |
| POST | `/v1/hosts/:hostId/enrollment-codes` | JWT + owner | Issue host enrollment code |
| POST | `/v1/incidents` | JWT + owner | Create bounded evidence session |
| GET | `/v1/incidents` | JWT + owner | List sessions |
| GET | `/v1/incidents/:incidentId` | JWT + owner | Read session/timeline summary |
| POST | `/v1/incidents/:incidentId/renter-invitations` | JWT + owner | Issue single-use renter invite |
| POST | `/v1/incidents/:incidentId/end` | JWT + owner | End capture |
| POST | `/v1/incidents/:incidentId/seal` | JWT + owner | Seal bundle |
| GET | `/v1/incidents/:incidentId/bundle` | JWT + owner | Download sealed bundle |
| POST | `/v1/hosts/:hostId/keys/:keyId/revoke` | JWT + owner | Revoke host key |
| POST | `/v1/incidents/:incidentId/keys/:keyId/revoke` | JWT + incident owner | Revoke renter key |
| POST | `/v1/hosts/:hostId/archive` | JWT + owner | Archive host |

## Scoped machine endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/agent/enroll` | Single-use enrollment secret | Register host public key and receive scoped credential |
| POST | `/v1/agent/heartbeat` | Host credential + domain-separated Ed25519 signature | Update operational presence; not evidence |
| POST | `/v1/agent/events` | Host credential + Ed25519 signature | Append host event during an incident |
| POST | `/v1/renter/enroll` | Single-use renter invitation | Register incident-scoped renter key |
| POST | `/v1/renter/events` | Renter credential + Ed25519 signature | Append renter event |

Worker uses restricted DB leases and does not expose a public route. It validates/signs platform probe event with its own key.

## Error codes

- `AUTH_REQUIRED`, `AUTH_INVALID`, `PERMISSION_DENIED`.
- `RESOURCE_NOT_FOUND` (also used for resources not owned by requester).
- `VALIDATION_ERROR`, `UNSUPPORTED_PROTOCOL_VERSION`.
- `TOKEN_EXPIRED`, `TOKEN_REDEEMED`, `KEY_REVOKED`, `SIGNATURE_INVALID`.
- `DUPLICATE_EVENT`, `SEQUENCE_CONFLICT`, `STATE_CONFLICT`, `LIMIT_REACHED`.
- `ENDPOINT_UNSAFE`, `ENDPOINT_NOT_VERIFIED`, `PROBE_UNAVAILABLE`.
- `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`.

`POST /v1/hosts` and `POST /v1/incidents` require `Idempotency-Key`; the server stores a 24-hour keyed request hash and non-secret created-resource metadata. Seal is idempotent through unique bundle-per-incident. One-time enrollment, invitation and DNS challenge secrets are never stored in plaintext for replay; if a one-time secret response is lost, revoke/replace it. Self-service account deletion is intentionally absent from the v1 API/UI. Production requires a separately approved live-data deletion and backup-retention procedure.

Do not expose stack traces, database error text, key values or whether another account owns an identifier. The API OpenAPI schema must be generated from the exact versioned route schemas and checked into `docs/openapi.json` only after implementation is real and tested.
