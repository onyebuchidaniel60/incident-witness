# Incident Witness — Architecture and Technical Contracts

**Status:** Approved blueprint baseline; implementation not started  
**Version:** 1.0  
**Source of truth:** `PROJECT_SPEC.md`  
**Rule:** architecture changes require operator approval and an Architecture Decision Record (ADR).

## 1. Architecture overview

### 1.1 Logical components

```text
                    Provider browser
                           |
                           v
                  Next.js web application
                    |              |
             Supabase Auth     Fastify API
                                  |
          +-----------------------+------------------------+
          |                       |                        |
       Postgres              Protocol package         Bundle store
          |                       |                   (Postgres JSONB)
          |                       |
   +------+-------+               +-------------------------------+
   |              |               |               |               |
Host agent    Renter SDK      Event verifier   Correlator      Bundle signer
   |              |               ^               ^               ^
   +------ signed observations --+---------------+---------------+
                                  ^
                                  |
                         Probe worker (Render)
                                  |
                         Verified fixed HTTPS host endpoint
```

This is a small distributed application, not a microservice platform. Separate deployable processes exist only where operational isolation is important: web, API, probe worker and provider-side agent. Shared TypeScript packages prevent different services from implementing competing cryptographic and event rules.

### 1.2 Trust boundaries

1. **Provider's host:** controlled by provider; host agent and operating system may be compromised or misconfigured. Host evidence is signed but not hardware-attested.
2. **Renter runtime:** controlled by renter; renter observations are signed by a key scoped to one incident. They may be inaccurate or incomplete.
3. **Incident Witness platform:** API, database, platform signing key and probe worker are controlled by product operator. A platform signature proves the platform produced/sealed a record; it is not a neutral third-party endorsement.
4. **Network probe:** separate process from API and host, but operated by the same product. Label it `platform_probe`, never `independent_witness`.
5. **Provider browser/local verifier:** browser verifier parses the bundle locally and does not transmit its content. The browser's built-in trusted public key set is the trust anchor.
6. **External recipient:** has only the bundle the provider elects to share. Recipient can independently check cryptographic integrity but cannot infer sensor truth.

### 1.3 Deployment topology

- `apps/web`: Vercel; public pages and authenticated provider dashboard.
- `apps/api`: Render Web Service; HTTPS REST API.
- `apps/probe-worker`: Render Background Worker; polls due `probe_jobs` rows using Postgres leases; no inbound public HTTP route.
- `packages/*`: shared TypeScript packages bundled into the apps and CLI.
- Supabase hosted Postgres and Auth.
- Host agent runs on provider Linux machine; renter SDK runs inside or alongside renter workload.

No Redis or external queue is required. Postgres is the system of record and the short-duration task queue. The API process includes a small lifecycle sweeper that uses row leases/locks to transition sessions at their scheduled end and auto-seal or auto-cancel at ingestion-grace expiry; it holds the platform root signing key because automatic sealing creates signed bundles. The separate probe worker only performs network observations and never receives the root bundle-signing key. If volume later makes polling insufficient, an explicit ADR is required before introducing a message broker.

---

## 2. Technology details and version policy

| Layer | Locked decision | Implementation constraints |
|---|---|---|
| Runtime | Node.js 26.13.0 LTS (released 2026-10-28) | Pin exact supported 26.x patch in `.node-version` and package `engines`; use same major in CI, agent, API, worker and CLI |
| Package manager | npm workspaces | Commit lockfile; install via `npm ci`; no silent package manager migration |
| Web | Next.js 16.4.x App Router + TypeScript (16.4.3 current stable checked 2026-10-30) | Server Components by default; client components only for interactive UI, file verification and browser-only state; use Next 16 `proxy.ts` for the narrowly scoped auth-cookie refresh adapter |
| Styling | Tailwind CSS 4.x | Temporary style tokens only until approved design phase |
| API | Fastify 5 | Strict route schemas; no arbitrary JSON schema from clients; register plugins in explicit order |
| Validation | Zod domain schemas + Fastify JSON Schema | Shared protocol types; parse again at trust boundary; reject additional properties in protocol v1 |
| Database | Supabase Postgres | Migrations in repo; no dashboard-only schema changes; separate DB roles |
| Auth | Supabase Auth OTP | Use `@supabase/ssr` behind a local auth adapter in Next.js; current official docs label the package beta, so pin it and test cookie/PKCE flows before each upgrade |
| JWT | `jose` | Verify JWT signature, allowed algorithm, issuer, audience, expiry and subject against trusted Supabase project keys |
| ORM | Drizzle + `pg` | Explicit migrations and transactions; parameterized queries; transaction-scoped identity for RLS |
| Canonicalization | RFC 8785 JCS using `canonicalize@5.1.0` | Pin exact version; no custom JCS implementation; strict JSON-safe validation before canonicalization; protocol package owns all canonical bytes; no `JSON.stringify` as a signature format |
| Signatures | Ed25519 | Node runtimes use built-in `node:crypto` for key generation/signing/verification; browser verifier uses `@noble/ed25519` 3.2.x for public-key verification only. Shared RFC 8785 canonical-byte vectors and RFC 8032 Ed25519 golden vectors must prove identical results across runtimes. Include duplicate-key raw-body rejection, non-finite/unsafe integer rejection and browser/CLI parity tests. No browser private-key signing and no client-supplied algorithm negotiation. |
| Agent local spool | SQLite via `better-sqlite3` | WAL mode, 50 MB quota, durable sequence counter, restrict file permissions |
| Logger | Pino | Redact authorization, cookie, OTP, invitation, enrollment, device credential and private key fields |
| Web deploy | Vercel | First deployment is Preview, safe test environment; auto deploy only after verified commit |
| API/worker deploy | Render | Separate service env vars; worker has no public ingress; safe staging database |
| Unit/integration | Vitest + pgTAP | Run against local/test Supabase/Postgres; do not use production DB for tests |
| E2E | Playwright | Execute against deployed Preview for phase gates, using seeded disposable test accounts/data |
| CLI | Node TypeScript (`tsx` in dev, compiled package for release) | Offline bundle verification, deterministic exit codes |

The package lockfile and dependency versions are implementation artifacts; the coding agent may select compatible patch versions within these major-version decisions. A major-version change is not an implementation detail and requires approval. Re-check official release status and Supabase SDK compatibility when the agent installs dependencies; do not upgrade automatically mid-phase.

---

## 3. Monorepo structure and package responsibilities

```text
incident-witness/
├── PROJECT_SPEC.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── AGENTS.md
├── AI_HANDOFF.md
├── README.md
├── package.json
├── package-lock.json
├── .node-version
├── .env.example
├── .gitignore
├── apps/
│   ├── web/                  # Next.js provider UI, public docs and local verifier (Next 16 proxy.ts auth refresh)
│   ├── api/                  # Fastify routes, auth, service/domain orchestration
│   └── probe-worker/         # Due-probe poller and safe HTTPS probe execution
├── packages/
│   ├── protocol/             # Runtime-neutral schemas/JCS/certs + explicit Node and browser crypto entry points
│   ├── correlator/           # Pure deterministic correlation rules and evidence grades
│   ├── db/                   # Drizzle schema, typed repositories and migrations
│   ├── host-agent/           # Linux agent runtime, collectors, spool, enrollment
│   ├── renter-sdk/           # Incident-scoped renter client and bounded event queue
│   └── ui/                   # Shared behavioral UI primitives, not final visual brand
├── tools/
│   └── iw-verify/            # Offline CLI wrapper around protocol verifier
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── seed.sql
├── tests/
│   ├── fixtures/             # Test keys, signed events, bundle fixtures; never production secrets
│   ├── integration/
│   ├── e2e/
│   └── security/
├── docs/
└── .github/workflows/        # CI, secret/dependency scanning, build/test
```

Package boundaries:

- `protocol` contains no DB or network dependency. It is the single source of truth for schemas, signed bytes, key certificates, bundle format and verification. Export explicit `./node` and `./browser` entry points: Node-only code may import `node:crypto`; browser code must not import Node built-ins, private-key signing code, filesystem APIs or server environment. Browser verifier uses `@noble/ed25519` 3.2.x for public-key verification only. Pin the package and run shared RFC 8032/cross-runtime golden vectors. The v3 JavaScript implementation is not described as constant-time or independently audited; browser usage is public-key verification only.
- `correlator` is a pure function package; same normalized event list + rule version = same result.
- `db` knows storage but not product UI.
- `host-agent` uses collector adapters and an injected API client; collector results are typed and bounded.
- `renter-sdk` has no provider-account privileges.
- API owns user/resource authorization and transaction orchestration.
- worker receives only the DB grants and secrets needed to probe endpoints and sign platform observations.
- web does not implement server-side signing or directly access the DB.

No turborepo/Nx in MVP. Plain npm workspaces are sufficient. If the existing repository has a different structure, the coding agent must report it first and propose a minimum-diff mapping; it must not reorganize before operator approval.

---

## 4. Database model

All IDs are UUIDv7 where supported or UUIDv4 generated securely. All persisted timestamps are `timestamptz` UTC. Use `created_at`/`updated_at`; no local-time storage. JSONB is only for versioned, schema-validated payloads and bundles, not as a substitute for relational ownership constraints. V1 does not expose account deletion or hard-delete evidence/ownership rows. Use `ON DELETE RESTRICT` for ownership, host, incident, key, event and bundle relationships; `audit_events.owner_user_id` may use `SET NULL` only for a separately approved future account-closure process. No application role receives parent-row DELETE privileges.

### 4.1 `profiles`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid PK | yes | Equals `auth.users.id`; `ON DELETE RESTRICT` prevents an Auth deletion from silently cascading through retained evidence |
| `display_name` | varchar(80) | no | User-editable; sanitized; not trusted for authorization |
| `created_at` | timestamptz | yes | DB default now |
| `updated_at` | timestamptz | yes | DB trigger |

Do not duplicate/store email unless a later approved feature requires it; Auth remains source of identity email.

### 4.2 `hosts`

- `id uuid PK`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `alias varchar(80) NOT NULL`
- `endpoint_hostname varchar(253) NOT NULL` (ASCII/IDNA-normalized hostname; no scheme/path/port)
- `endpoint_path` fixed constant `/.well-known/incident-witness/health` (not user supplied)
- `endpoint_verified_at timestamptz NULL`
- `endpoint_dns_fingerprint text NULL` (digest of verified challenge/record metadata, no challenge secret)
- `status enum('pending_endpoint','pending_enrollment','active','archived')`
- `agent_version varchar(40) NULL`
- `last_agent_seen_at timestamptz NULL`
- `created_at`, `updated_at timestamptz`

Indexes: `(owner_user_id, created_at DESC)`, unique `(owner_user_id, lower(endpoint_hostname))` for non-archived host (partial index), `(status, last_agent_seen_at)` for operations. RLS enforces owner.

### 4.3 `host_endpoint_challenges`

- `id uuid PK`
- `host_id uuid NOT NULL FK hosts(id) ON DELETE RESTRICT`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `challenge_hash bytea NOT NULL`
- `dns_record_name varchar(300) NOT NULL`
- `expires_at timestamptz NOT NULL`
- `verified_at timestamptz NULL`
- `attempt_count integer NOT NULL DEFAULT 0` (maximum 10 attempts per challenge; then require a new challenge)
- `created_at timestamptz NOT NULL`

Indexes: `(host_id, expires_at DESC)`, `expires_at` for cleanup. Only one latest active challenge per host; issuance invalidates older challenges atomically. Challenge expiry is 10 minutes; at most 10 verification attempts are allowed before issuing a new challenge. Challenge value itself is returned once and never logged/stored in plaintext.

### 4.4 `witness_keys`

- `id uuid PK` (`source_key_id`)
- `owner_user_id uuid NULL FK profiles(id) ON DELETE RESTRICT` (null for platform-owned probe key)
- `host_id uuid NULL FK hosts(id) ON DELETE RESTRICT`
- `incident_id uuid NULL FK incidents(id) ON DELETE RESTRICT` (renter key scope; FK added after incidents table)
- `source_type enum('host_agent','renter_client','platform_probe')`
- `public_key bytea NOT NULL` (raw 32-byte Ed25519 public key)
- `fingerprint text NOT NULL UNIQUE`
- `status enum('active','revoked','retired')`
- `certificate_json jsonb NOT NULL` (versioned, platform-signed registration certificate)
- `certificate_signature bytea NOT NULL`
- `created_at`, `revoked_at`, `last_seen_at`
- `last_presence_sequence bigint NOT NULL DEFAULT 0 CHECK (last_presence_sequence BETWEEN 0 AND 9007199254740991)` (host-agent operational presence only)
- `last_presence_hash bytea NULL` (SHA-256 of the canonical full presence request including signature; supports exact retry detection)

Constraints: host agent requires `host_id`, `owner_user_id`, null `incident_id`; renter key requires `incident_id`, owner may be null if renter is anonymous; platform probe requires null host and incident and is provisioned by operator migration/secret process. Application validates combinations; use DB CHECK constraints wherever feasible. Index `(host_id, status)`, `(incident_id, status)`, `(source_type, status)`.

The registration certificate says the platform registered this public key for the stated scope at a particular time. It does not attest to the physical host, sensor or actual operator identity beyond the account/enrollment workflow.

### 4.5 `source_credentials`

- `id uuid PK`
- `source_key_id uuid NOT NULL FK witness_keys(id) ON DELETE RESTRICT`
- `credential_hash bytea NOT NULL UNIQUE` (HMAC-SHA-256 using server pepper)
- `credential_type enum('host_agent','renter_client') NOT NULL`
- `expires_at timestamptz NULL` (host credential may be long-lived but always revocable; renter credential expires no later than incident ingestion deadline)
- `last_used_at timestamptz NULL`
- `revoked_at timestamptz NULL`
- `created_at timestamptz NOT NULL`

The raw credential is returned once and held by the agent/SDK. The database stores only keyed hash. A credential is always bound to one source key; a valid credential without a valid event signature cannot write evidence. Platform probe worker does not use this table; it is authorized by its dedicated DB role and platform probe signing key. Index `(source_key_id, revoked_at)` and unique credential hash.


### 4.6 `enrollment_tokens`

- `id uuid PK`
- `host_id uuid NOT NULL FK hosts(id) ON DELETE RESTRICT`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `token_hash bytea NOT NULL UNIQUE`
- `expires_at timestamptz NOT NULL`
- `redeemed_at timestamptz NULL`
- `redeemed_key_id uuid NULL FK witness_keys(id)`
- `revoked_at timestamptz NULL`
- `created_at timestamptz NOT NULL`

The raw 32-byte token is shown once. HMAC-SHA-256 with server pepper is used for lookup/hash; use constant-time comparison. One active code per host; issuing a new code revokes older active codes.

### 4.7 `incidents`

- `id uuid PK`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `host_id uuid NOT NULL FK hosts(id) ON DELETE RESTRICT`
- `title varchar(100) NOT NULL`
- `workload_ref varchar(100) NULL` (opaque label only, no customer/job secrets)
- `status enum('collecting','awaiting_finalize','sealed','cancelled')`
- `capture_started_at timestamptz NOT NULL`
- `capture_ends_at timestamptz NOT NULL`
- `ingestion_deadline timestamptz NOT NULL`
- `ended_at timestamptz NULL`
- `sealed_at timestamptz NULL`
- `rule_version varchar(30) NULL`
- `assessment_code varchar(40) NULL`
- `evidence_grade enum('HIGH','MEDIUM','LOW','INSUFFICIENT') NULL`
- `simulation_present boolean NOT NULL DEFAULT false`
- `accepted_event_count integer NOT NULL DEFAULT 0 CHECK (accepted_event_count BETWEEN 0 AND 4000)`
- `accepted_event_bytes bigint NOT NULL DEFAULT 0 CHECK (accepted_event_bytes BETWEEN 0 AND 7340032)` — aggregate byte size of canonical event entries as represented in the bundle; enforce atomically on append.

**4,000 events / 7 MiB / 10 MiB envelope invariant:** the protocol limits each `payload` object to 2 KiB, each ingestion request to 8 KiB, each incident to 4,000 accepted events and the serialized bundle event-entry representations to 7 MiB. The 7 MiB accumulator is incremented under the same incident row lock as event insert/count; a candidate insert that exceeds either cap is rejected with `INCIDENT_EVIDENCE_LIMIT`. The complete canonical bundle must still be measured before persistence and must not exceed 10 MiB. This leaves at least 3 MiB for manifest, certificates, gaps and metadata; sealing fails atomically with a recoverable, explicit size-limit status if the final encoded bundle exceeds the hard cap.
- `demo_mode boolean NOT NULL DEFAULT false` (allowed only when `IW_ENABLE_DEMO_SESSIONS=true`; otherwise creation rejects demo mode)
- `cancel_reason varchar(30) NULL` (allow-list `USER_CANCELLED`, `NO_EVIDENCE`)
- `created_at`, `updated_at`

Constraints: `capture_ends_at > capture_started_at`; duration 2–240 minutes; `ingestion_deadline >= capture_ends_at`; `sealed_at` set only for sealed; unique one active incident per host via partial unique index where status in (`collecting`,`awaiting_finalize`); owner max three active enforced transactionally with a locked owner row or advisory lock. Index `(owner_user_id, created_at DESC)`, `(host_id, status)`, `(status, capture_ends_at, ingestion_deadline)` for worker.

### 4.8 `renter_invitations`

- `id uuid PK`
- `incident_id uuid NOT NULL FK incidents(id) ON DELETE RESTRICT`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `token_hash bytea NOT NULL UNIQUE`
- `expires_at timestamptz NOT NULL`
- `redeemed_at timestamptz NULL`
- `renter_key_id uuid NULL FK witness_keys(id)`
- `revoked_at timestamptz NULL`
- `created_at timestamptz NOT NULL`

Only one unredeemed invitation per incident unless previous invitation expires/revokes. Invitation is single-use and expires after 15 minutes.

### 4.9 `evidence_events`

- `id uuid PK` (equals signed `event_id`)
- `incident_id uuid NOT NULL FK incidents(id) ON DELETE RESTRICT`
- `source_key_id uuid NOT NULL FK witness_keys(id) ON DELETE RESTRICT`
- `source_type enum('host_agent','renter_client','platform_probe') NOT NULL`
- `event_type varchar(50) NOT NULL`
- `sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991)`
- `observed_at timestamptz NOT NULL`
- `received_at timestamptz NOT NULL DEFAULT now()` (server-generated)
- `canonical_event jsonb NOT NULL` (event without `signature` or server metadata)
- `canonical_sha256 bytea NOT NULL`
- `signature bytea NOT NULL`
- `simulation_mode boolean NOT NULL DEFAULT false` (accepted only if the incident has `demo_mode=true`; reject simulated observations in live sessions)
- `validation_status enum('accepted') NOT NULL` (rejected events are not evidence rows; security logs separately)
- `created_at timestamptz NOT NULL`

Constraints: unique `(source_key_id, sequence)`, unique `(incident_id, id)`. Index `(incident_id, observed_at, id)`, `(source_key_id, sequence)`. No UPDATE/DELETE grants to application roles. Ingestion service checks event source matches key scope and incident host. Store no arbitrary log strings or raw endpoint IP.

### 4.10 `probe_jobs`

- `id uuid PK`
- `incident_id uuid NOT NULL FK incidents(id) ON DELETE RESTRICT`
- `host_id uuid NOT NULL FK hosts(id) ON DELETE RESTRICT`
- `scheduled_at timestamptz NOT NULL`
- `lease_owner varchar(80) NULL`
- `lease_expires_at timestamptz NULL`
- `attempt_count integer NOT NULL DEFAULT 0`
- `status enum('pending','leased','completed','retry','dead','cancelled')`
- `last_error_code varchar(50) NULL` (allow-listed, no arbitrary error body)
- `completed_at timestamptz NULL`
- `created_at`, `updated_at`

Indexes: partial `(scheduled_at)` for pending/retry; `(lease_expires_at)` for expired leases; `(incident_id, scheduled_at)`. Claim rows via transaction using `FOR UPDATE SKIP LOCKED`, set lease, commit, perform network call, then append observation and complete task atomically where possible.

### 4.11 `platform_signing_keys`

- `id uuid PK`
- `key_id varchar(80) NOT NULL UNIQUE`
- `public_key bytea NOT NULL`
- `fingerprint text NOT NULL UNIQUE`
- `algorithm varchar(20) NOT NULL CHECK (algorithm='Ed25519')`
- `status enum('active','retired','revoked')`
- `not_before timestamptz NOT NULL`
- `not_after timestamptz NULL`
- `created_at timestamptz NOT NULL`

Only public key metadata is in DB. The platform root private key is secret-managed for the API only. The distinct probe signing private key is secret-managed for the Render worker only. Web and CLI pin trusted root/platform public key fingerprints in a controlled release. Unknown key or revoked key is not trusted. Rotation requires overlap and a software release containing the new public key before active signing switches.

### 4.12 `evidence_bundles`

- `id uuid PK`
- `incident_id uuid NOT NULL UNIQUE FK incidents(id) ON DELETE RESTRICT`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `bundle_version varchar(20) NOT NULL`
- `rule_version varchar(30) NOT NULL`
- `platform_key_id uuid NOT NULL FK platform_signing_keys(id)`
- `manifest jsonb NOT NULL` (canonicalizable signed body)
- `manifest_sha256 bytea NOT NULL`
- `platform_signature bytea NOT NULL`
- `byte_length integer NOT NULL CHECK (byte_length <= 10485760)`
- `created_at timestamptz NOT NULL`

Bundle content is immutable via grants/trigger. `manifest_sha256` is calculated over RFC 8785 canonical body excluding signature. Download endpoint constructs the exact serialized bundle; it does not re-sign/recompute from mutable data. No object store in MVP. Database backups are not public evidence hosting.

### 4.13 `audit_events`

- `id uuid PK`
- `actor_type enum('provider','host_agent','renter_client','platform_worker','system')`
- `actor_id uuid NULL`
- `owner_user_id uuid NULL FK profiles(id) ON DELETE SET NULL`
- `resource_type varchar(40) NOT NULL`
- `resource_id uuid NULL`
- `action varchar(60) NOT NULL`
- `result enum('success','denied','failure') NOT NULL`
- `request_id uuid NOT NULL`
- `metadata jsonb NOT NULL DEFAULT '{}'` (allow-listed fields only; no tokens/payloads)
- `created_at timestamptz NOT NULL`

Append-only. Index `(owner_user_id, created_at DESC)`, `(resource_type, resource_id, created_at DESC)`, `(request_id)`.

### 4.14 `idempotency_records`

- `id uuid PK`
- `owner_user_id uuid NOT NULL FK profiles(id) ON DELETE RESTRICT`
- `operation varchar(80) NOT NULL` (allow-listed endpoint operation)
- `key_hash bytea NOT NULL` (HMAC of client `Idempotency-Key`)
- `request_hash bytea NOT NULL` (digest of validated request body)
- `response_status integer NOT NULL`
- `resource_id uuid NOT NULL` (created resource; no token/secret response body is stored)
- `expires_at timestamptz NOT NULL` (24-hour replay window)
- `created_at timestamptz NOT NULL`

Unique `(owner_user_id, operation, key_hash)`. A repeated key with same request hash returns the original resource metadata; same key with different request hash returns 409. This table is API-only, not directly readable by authenticated clients. It is used for provider host creation and incident creation; invitation/enrollment secrets are never stored in idempotency responses.

### 4.15 Relationship diagram

```text
auth.users 1──1 profiles
profiles 1──* hosts
profiles 1──* idempotency_records
hosts 1──* host_endpoint_challenges
hosts 1──* enrollment_tokens
hosts 1──* witness_keys (host_agent)
witness_keys 1──* source_credentials
hosts 1──* incidents
profiles 1──* incidents
incidents 1──* renter_invitations
incidents 1──* witness_keys (renter_client)
incidents 1──* evidence_events
witness_keys 1──* evidence_events
incidents 1──* probe_jobs
incidents 1──0..1 evidence_bundles
platform_signing_keys 1──* evidence_bundles
profiles 1──* audit_events
```

---

## 5. Database access and RLS design

### 5.1 Required roles

- Supabase Auth owns `auth.users`.
- Supabase `authenticated` and `anon` roles are used for Auth/session only and receive no direct grants on Incident Witness product tables.
- `iw_api` login role is used only by Fastify, must not have `BYPASSRLS` or superuser, and is the role to which provider and machine RLS policies are targeted. It is never exposed to the browser.
- `iw_worker` login role with narrowly scoped grants to `hosts` (only endpoint fields needed), `incidents` (only active capture IDs/state/time), `probe_jobs`, `witness_keys` (platform probe key), `evidence_events` insert, and operational audit. No profile email, account auth or bundle read permission.
- `iw_api` also has a server-only machine-ingestion DB path (without switching to the `authenticated` role) for source credential lookup, key-scope validation, append-only event insert and host heartbeat update. RLS policies and column/table grants for this path must be narrowly scoped and integration-tested; it must not have BYPASSRLS.
- Migration owner role is only used by migrations, never app runtime.

### 5.2 User transaction context

Fastify verifies the Supabase JWT first. Every provider DB request opens a transaction using the `iw_api` login role and sets transaction-local `request.jwt.claim.sub` to the verified JWT subject; it may set `iw.request_mode=provider` as a transaction-local context marker. The subject must come only from the verified JWT, never the request body. RLS uses `auth.uid()` for ownership and policies targeted to `iw_api`. Do not `SET ROLE authenticated`; the Supabase `authenticated` role has no direct table grants. Machine-ingestion transactions set a separate, explicit context (`iw.request_mode=machine_ingest`, source key ID and incident/host scope) only after the API has validated the scoped bearer credential and event signature. Worker requests use the separate `iw_worker` login.

Transaction pooling is not used for this API role because transaction-local identity and mode must remain scoped to the transaction; use direct connection or a verified session-pooler configuration. A request must not run queries after its transaction closes. The exact database role setup and GUC handling must be tested against local Supabase using the real login roles. If the chosen hosting connection mechanism cannot safely maintain transaction-scoped claims, stop and present an ADR instead of silently falling back to service-role bypass.

### 5.3 RLS policies

Provider API policies and grants (the browser never reads product tables directly):

- Revoke all product-table privileges from `PUBLIC`, `anon` and Supabase `authenticated`. The browser uses Supabase Auth for OTP/session only and calls Fastify for all product data.
- Target provider policies to `iw_api` and require `iw.request_mode = 'provider'` plus the appropriate `auth.uid()` ownership predicate. Grant `iw_api` only the table/column-level `SELECT`, `INSERT` and `UPDATE` operations required by the routes below; do not grant general `DELETE`.
- `profiles`: provider `SELECT`, `INSERT` and `UPDATE` only where `id = auth.uid()`; insert check requires `id = auth.uid()`, and update allow-list is `display_name` only. Profile bootstrap is an API transaction.
- `hosts`, `host_endpoint_challenges`, `enrollment_tokens`, `incidents`, `renter_invitations`: provider reads and route-required writes only where `owner_user_id = auth.uid()`; invitations must also match an incident owned by the same user. No hard-delete.
- `evidence_events`: provider `SELECT` only through `EXISTS (SELECT 1 FROM incidents i WHERE i.id = evidence_events.incident_id AND i.owner_user_id = auth.uid())`; the event table has no `owner_user_id` column. Provider API and browser cannot UPDATE/DELETE. Machine ingestion has a distinct INSERT policy.
- `evidence_bundles`: provider `SELECT`; INSERT is restricted to the seal transaction/function after all checks. No UPDATE/DELETE.
- `witness_keys`: provider `SELECT` for host keys owned by `auth.uid()` or keys scoped to an incident owned by the user (`EXISTS` against `incidents`); provider revocation is an API-only, limited UPDATE to status/revoked timestamp and audit metadata. Public key/certificate metadata only; private keys are never stored.
- `source_credentials`: no browser/authenticated-role access. A machine-ingestion RLS policy for `iw_api` requires `iw.request_mode = 'machine_ingest'` and `credential_hash = decode(current_setting('iw.credential_hash_hex', true), 'hex')`; the API sets this transaction-local value to the HMAC of the presented bearer token and may read only fields required for validation. Never return hashes.
- `idempotency_records`: API-only under `iw.request_mode = 'provider'` and `owner_user_id = auth.uid()`; no browser/authenticated-role access.
- `probe_jobs`: worker-only; no browser/provider access.
- `platform_signing_keys`: public metadata only, served through a narrow verifier endpoint or pinned in the verifier release; no private key is stored in this table.
- `audit_events`: provider `SELECT` only where `owner_user_id = auth.uid()`; append through audited API transactions, no update/delete.

Machine ingestion policies are separately targeted to `iw_api` and require `iw.request_mode = 'machine_ingest'`. The API sets transaction-local credential-hash/source/incident/host scope values only after verifying the bearer credential and then verifies the registered key, signature, schema, timestamp and active incident. The event INSERT policy checks these scope values and `source_type`; host last-seen and incident accepted-event counter updates are column-limited. The API lifecycle sweeper uses `iw.request_mode = 'system_lifecycle'` with narrowly granted access only to overdue incident rows, evidence rows/certificates needed for sealing, bundle INSERT, incident state updates and audit append. This context protects against accidental cross-scope queries, not a fully compromised API process.

For every table, explicitly revoke default `PUBLIC`/`anon`/`authenticated` privileges before granting narrow permissions to `iw_api`/`iw_worker`. Do not rely on RLS alone. All API writes must be performed under `iw_api` transactions with explicit owner/resource checks and row locks as specified. RLS is defense in depth; policies and actual grants must be tested using the real login roles. Never expose Supabase service-role/secret key to the browser.

Machine-role policies and grants:

- `iw_api` direct machine-ingestion path may select only the `source_credentials` fields required for credential-hash lookup, the matching `witness_keys` public/scope/status fields, and the incident fields required to verify active state/time window. It may insert `evidence_events` only when `source_type`, `source_key_id`, host/incident scope and event schema have been validated by the API service; it may update only the permitted host last-seen and incident accepted-event counters. No profile/email, bundle, arbitrary host settings or user-session access is granted on this path.
- `iw_worker` may select the bounded endpoint fields for active incidents, select/lease/update only `probe_jobs`, read the single registered `platform_probe` public key/certificate, insert only `platform_probe` events and update only the event counter/worker operational fields required to complete the job. It has no access to `source_credentials`, profiles, account auth, provider JWTs or evidence-bundle contents.
- Policies for these machine operations must be role-targeted (`TO iw_api` / `TO iw_worker`) and checked using the real login roles in integration tests. Column-level grants must be used where a role only needs to update a subset of a table. The API/worker code must still validate each source/event scope; a database policy is not a substitute for signature verification.
- If the required role-specific grants/RLS policies cannot be expressed or tested without `BYPASSRLS`, service-role access, or broad table grants, stop and propose an ADR. Do not silently weaken the model.

### 5.4 DB immutable controls

- Revoke UPDATE/DELETE on `evidence_events` and `evidence_bundles` from `iw_api` and `authenticated`.
- A dedicated transaction-only seal function or API transaction inserts bundle then updates incident exactly once; no later rewrite.
- Audit events are append-only; only migration owner can clean expired non-evidence transient tokens/challenges under retention procedure.
- Evidence events, bundles, source keys and ownership records cannot be hard-deleted by application roles. All v1 foreign keys use `ON DELETE RESTRICT`, except `audit_events.owner_user_id ON DELETE SET NULL` (which is inert while profile deletion is disabled); no evidence or account data is silently removed by cascade. Expired transient token/challenge rows may be purged by a dedicated retention task after the configured audit period. Account deletion is disabled in v1; the Auth-to-profile RESTRICT FK prevents an Auth user deletion from cascading. A separately approved deletion/retention migration is required before any future delete flow.

---

## 6. Cryptographic protocol

### 6.1 Algorithms and encoding

- Event signature algorithm: Ed25519.
- Platform manifest/probe signature: Ed25519.
- Canonicalization: RFC 8785 JSON Canonicalization Scheme (JCS), implemented with the exact pinned `canonicalize@5.1.0` dependency (the RFC lists this JavaScript implementation in Appendix G). Do not write a custom canonicalizer.
- Before canonicalization, validate strict protocol schemas and I-JSON compatibility: reject unknown keys, undefined values, non-finite numbers, unsafe integers, non-plain objects, invalid Unicode and unsupported values. All protocol integer values must be in `[-9007199254740991, 9007199254740991]`; event `sequence` is a positive safe integer. Store DB sequence as `bigint`, but enforce the safe-integer protocol bound before converting to/from JSON.
- Hash: SHA-256.
- Signature encoding: base64url without padding.
- Public key encoding in JSON: base64url raw 32 bytes, key type explicitly `Ed25519`.
- No client choice of digest, canonicalization or signature algorithm in v1.

### 6.2 Source event signing

1. Construct a schema-valid event body without `signature` or server fields. Reject unsafe numeric values; `sequence` is a positive safe integer no greater than `Number.MAX_SAFE_INTEGER`.
2. Canonicalize the signed body using the pinned JCS implementation.
3. SHA-256 the canonical bytes and sign those bytes with the source Ed25519 private key.
4. Add the base64url signature, then canonicalize the complete request envelope for transport. Send the exact resulting UTF-8 bytes with `Content-Type: application/vnd.incident-witness.event+json`.
5. The API route preserves the raw request bytes, parses JSON, validates the full envelope and requires the raw bytes to equal the canonical serialization of the parsed envelope. This rejects whitespace/ordering ambiguity and duplicate property names that a normal JSON parser would otherwise collapse.
6. Remove `signature` from the validated object, canonicalize the exact signed body, and verify Ed25519 against the registered source public key and credential scope.
7. Append server-generated `received_at` and persist the signed body/digest/signature. Do not alter source-signed `observed_at` or payload.
8. The offline verifier applies the same strict parser, JCS implementation and golden vectors.

### 6.3 Platform source-key registration certificate

Certificate body contains `certificate_version`, `source_key_id`, `source_type`, `public_key`, `fingerprint`, `host_id` or incident scope as applicable, `issued_at`, and protocol version. Platform signs canonical body. Renter cert is incident-scoped. Host cert binds to a host record but does not prove that the key is inside a particular physical machine.

### 6.4 Evidence bundle

`bundle_version: "1.0"` contains:

- `manifest`: incident pseudonymous reference, host alias, endpoint hostname (disclosed to provider before share), capture window, seal time, schema/rule versions, ordered source events and their server receipt times, public source certificates, event digests, gap/missing-source records, assessment code and exact explanation, evidence grade, simulation flags, platform key identifier, limitations statement.
- `manifest_sha256`: SHA-256 of JCS canonical `manifest`.
- `platform_signature`: Ed25519 signature over canonical `manifest`.
- `platform_public_key` or platform key metadata reference; trust is still established only if key fingerprint matches verifier's pinned trust set.

No external network resource is fetched by verifier. Web verifier and CLI share exact package and test vectors.

### 6.5 Verification output semantics

Return separate booleans/statuses:

- `schema_valid`
- `manifest_digest_valid`
- `platform_key_trusted`
- `platform_signature_valid`
- `source_certificates_valid`
- `source_event_signatures_valid`
- `event_sequence_consistent`
- `bundle_consistent`
- `simulation_present`
- `evidence_completeness`

Only say “Bundle integrity and listed signatures verified” when all required crypto checks pass. Always show: “Verification confirms integrity and signatures relative to trusted keys. It does not prove that sensors were accurate, keys were uncompromised, or the inferred cause is true.”

---

## 7. Host agent architecture

### 7.1 Supported target

Linux x86_64, Node.js 26. The MVP does not support Windows/macOS or arm64 unless separately approved. The agent runs as an unprivileged OS user, as a user/systemd service where operator has permissions; no remote shell or admin control.

### 7.2 Collectors

- Operational-presence heartbeat: every 15 seconds through `POST /v1/agent/heartbeat`, signed with a separate monotonic presence sequence and not inserted into the incident evidence timeline. It updates only `last_agent_seen_at` after authentication/signature/freshness checks.
- During an active evidence session, emit signed `host_heartbeat` evidence events every 30 seconds on the incident event sequence.
- Session creation requires a valid operational-presence heartbeat received within the preceding 60 seconds; do not confuse it with an incident evidence event.
- GPU summary every 30 seconds if `nvidia-smi` exists. Fixed query fields only: index, name, temperature, utilization, memory used/total, power draw, driver version if available. Use `execFile` fixed binary/args with timeout; no shell; no caller-supplied executable or arguments.
- UPS state every 5 seconds if NUT `upsc` is installed and configured. Parse allow-listed values only (state, charge, runtime). Never assume “online” when data unavailable.
- Agent start/stop/recovery events; a SIGTERM is observed shutdown signal, not proof of a power cause. Sudden physical power loss may produce no local shutdown event.
- Network interface state only if a safe standard read-only source is supported. Do not assert WAN connectivity from local NIC link state.

### 7.3 Local spool

SQLite `events` table persists signed events and `next_sequence`. WAL, integrity check on boot, maximum 50 MB, FIFO resend. Protect directory owner-only, files 0600 where supported. Preserve state transitions and bounded failure events. If quota reached, drop oldest ordinary heartbeat before critical transition events, record a local gap event when possible and surface spool-full state. Do not delete the event queue on API 4xx; stop and report.

### 7.4 Credential storage

- Maintain one monotonically increasing, durable, positive safe-integer event sequence per host source key across all event types. The operational-presence heartbeat has its own independent sequence because it is not an evidence event.
- Private Ed25519 key is generated on host, never transmitted. Store in owner-controlled config directory with strict permissions.
- API credential is random 32 bytes returned once; write 0600. Server stores only keyed hash.
- No credentials in process arguments, shell history, URLs or logs.
- User can revoke from dashboard; next API request rejected.

### 7.5 Untrusted hardware/host warning

The host owner can alter agent code, kernel, telemetry binaries, system clock or key file. Signing preserves a chain from the enrolled key, not the physical truth of the machine. Display this limitation in host details and evidence bundle.

---

## 8. Renter SDK architecture

- Node.js 26.13.0 LTS TypeScript library, designed to run in or alongside a workload container.
- On invitation redemption, generate Ed25519 key in the renter process and register only its public key.
- Keep private key in memory for process lifetime in MVP; SDK can persist only to an explicitly configured secure directory if restart survival is required. Never store private key in source repo or logs.
- Maintain one monotonically increasing event sequence per renter source key across all event types; persist it durably across restarts.
- Emit `renter_heartbeat` every 30 seconds. Emit `renter_endpoint_result` every 60 seconds and on a reachability-state transition; these are separate bounded evidence events. The fixed endpoint details come from signed/authorized invitation metadata; no arbitrary URL from untrusted workload input. Do not collect workload stdout/stderr, prompts, model data, file content, environment variables or credentials.
- Local queue maximum 5 MB; exponential backoff; stop when incident closes or ingestion deadline passes.
- Expose simple typed `start()`, `stop()` and `status()` API; no background workload orchestration.

---

## 9. Probe worker and SSRF controls

### 9.1 Job scheduler

API creates a `probe_jobs` row for each 15-second probe interval while session is active. Worker polls every 1–2 seconds; claim with `FOR UPDATE SKIP LOCKED`; lease e.g. 30 seconds; concurrency max 10; stale lease reclaimed; bounded attempts. For a missed schedule, record a gap; do not backfill unlimited probes.

### 9.2 Probe target policy

- Target comes only from an endpoint verified for a host owned by the active incident.
- DNS ownership challenge record name: `_incident-witness.<normalized-hostname>`; value is a random one-time `iw1=<base64url>` string with a 10-minute expiry. The raw value is displayed once and not stored.
- Fixed response contract: `GET https://<hostname>/.well-known/incident-witness/health`, status `200`, `Content-Type: text/plain`, body exactly `incident-witness-health-v1\n`, no redirect and no user-defined query. The provider's ingress must route this to the intended host service. The hostname/DNS and endpoint check is a configuration assertion, not cryptographic proof that the target is the GPU machine.
- Scheme fixed to HTTPS; port fixed to 443; method fixed GET; path fixed `/.well-known/incident-witness/health`.
- No URL query/body/custom headers from provider.
- Redirects disabled and redirects recorded as invalid target response.
- TLS certificate validation required.
- Three-second timeout; max response body 1 KB; response must match a short fixed expected body/status.
- Disable proxy environment variable usage for probe client.
- Resolve A and AAAA each time. Reject loopback, private, link-local, multicast, unspecified, documentation, reserved and cloud metadata ranges. Include IPv4-mapped IPv6 handling.
- Pin the validated resolved IP for the actual TCP connection; do not resolve a second time after validation. If address set changes, revalidate. DNS rebinding tests required.
- Do not probe arbitrary user ports or paths. Avoid leaking raw target IP into event bundle; store only outcome category and optionally a salted/truncated diagnostic identifier.
- Do not classify an error produced by probe DNS/TLS/network outage as evidence that the host endpoint is down; create `probe_infrastructure_error`/gap and exclude from causal rules.

This feature is high-risk and must receive a dedicated security review before public deployment.

---

## 10. API specification

### 10.1 Common conventions

- Base path `/v1`.
- JSON UTF-8; max general body 32 KiB; event ingestion request max 8 KiB; operational-presence request max 4 KiB; event payload max 2 KiB; canonical event entries max 7 MiB total; complete bundle hard cap 10 MiB. Register Fastify `addContentTypeParser` handlers for `application/vnd.incident-witness.event+json` and `application/vnd.incident-witness.presence+json` with `parseAs: 'buffer'` and their exact body limits. Parse the preserved Buffer exactly once at the trust boundary, validate strict I-JSON/schema, canonicalize the parsed value using pinned RFC 8785 JCS, and require byte-for-byte equality with the original UTF-8 Buffer before signature verification. This also rejects duplicate JSON property names and noncanonical wire representations. Do not route signed protocol bodies through Fastify's default JSON parser first.
- Request ID generated/propagated as UUID; returned in `X-Request-Id` and error body.
- Auth: Supabase bearer JWT for provider routes; host credential + event signature for host ingestion; invitation-derived credential + event signature for renter ingestion; private network/service role for worker internals.
- `Idempotency-Key` required for provider host creation and incident creation; store scoped key hash, request hash and non-secret resource response for 24 hours. Seal is idempotent by unique bundle-per-incident. Do not persist plaintext enrollment, invitation or DNS challenge tokens for idempotency. If a one-time secret response is lost, revoke/replace it.
- Rate limits by IP + account + credential. Event ingestion has per-key rate limits and body size caps.
- Validation rejects unknown properties for protocol v1.

### 10.2 Health

**GET `/health/live`** — public; process responds 200 if event loop/service alive. No DB query.

**GET `/health/ready`** — protected by an `Authorization: Bearer` token using API-only `IW_HEALTHCHECK_TOKEN` (or a private platform network that demonstrably restricts callers). Checks DB connectivity, migration version and required API signing key availability. Return only generic ready/unready status; never expose which dependency failed or any config/secret. Return 503 if not ready.

### 10.3 Provider/host endpoints

**GET `/v1/hosts`**
- Auth: provider.
- Logic: query hosts where `owner_user_id = auth.uid()`; stable page cursor.
- Success: `{data:[{id,alias,hostname,status,lastAgentSeenAt,endpointVerifiedAt}],page:{nextCursor}}`.
- Errors: 401, 429, 500.

**POST `/v1/hosts`**
- Auth: provider.
- Request: `{alias:string, hostname:string}`.
- Validate alias 1–80 chars, normalize hostname using IDNA and lowercase; reject scheme, slash, port, IP literals, localhost and reserved suffixes.
- Logic: insert pending host; unique active owner+hostname. No secret is returned.
- Success 201: `{data:{hostId,status}}`.
- Errors: 400, 409 duplicate, 422 invalid hostname, 429.
- `Idempotency-Key` required; idempotency record stores only non-secret host metadata.

**GET `/v1/hosts/:hostId`**
- Auth provider; owner scope.
- Return safe host metadata, endpoint status, agent version, last heartbeat, key status and current install instructions; never return key/credential material.
- 404 if missing or not owned.

**PATCH `/v1/hosts/:hostId`**
- Auth provider; owner scope.
- Request: `{alias?:string}` only in v1. Endpoint hostname change requires new endpoint challenge flow; cannot patch directly.
- Validate alias; update `updated_at`; audit.
- 404/422/409.

**POST `/v1/hosts/:hostId/endpoint-challenge`**
- Auth provider; owner scope.
- Logic: invalidate previous challenge, create random challenge and HMAC/hash, 10-minute expiry, return TXT record name/value once. Record name is `_incident-witness.<hostname>`; value is `iw1=<base64url random>`. Raw value is not stored.
- Return 201 `{challengeId,dnsRecordName,dnsRecordValue,expiresAt}`.
- Rate limit by owner and host; max 10 verification attempts. If response is lost, issue a new challenge; do not store raw challenge in idempotency data.

**POST `/v1/hosts/:hostId/endpoint-verify`**
- Auth provider; owner scope; body `{challengeId}`.
- Logic: increment bounded attempt count; verify expected TXT exact match; resolve hostname and apply public-IP rules; HTTPS fixed path TLS check. No redirects.
- Return `{verified:boolean,status:'pending'|'verified',reasonCode?,checkedAt}`; do not expose private address.
- 409 expired/consumed challenge; 422 unsafe target; 503 DNS/service failure.

**POST `/v1/hosts/:hostId/enrollment-codes`**
- Auth provider; owner scope; host endpoint verified; host not archived.
- Request `{}`.
- Logic: revoke prior active code; create random 32-byte code hash; 10-minute expiry; return raw code once.
- Return 201 `{enrollmentCode,expiresAt,installInstructions}`; instructions do not embed secret. Do not put token in query param.

**POST `/v1/agent/enroll`**
- Auth: enrollment code; no provider JWT. CLI reads the code interactively from stdin, not args/env/URL.
- Request `{enrollmentCode,publicKey,agentVersion,requestId}`.
- Logic: transaction lock token; verify/consume once; validate Ed25519 public key; create source key + platform registration certificate + random device credential; store only credential HMAC hash; link key; create audit entry.
- Response: `{sourceKeyId,certificate,certificateSignature,deviceCredential,apiBaseUrl,protocolVersion}`. Credential returned once.
- Redemption is strictly one-use. If the response is lost after commit, do not return the raw credential again; provider revokes the enrolled key and issues a new code.
- Errors 401 invalid, 409 used/expired, 422 malformed key/version, 429.

**POST `/v1/agent/heartbeat`**
- Auth: host device bearer credential + Ed25519 signature over the domain-separated operational-presence message.
- Request content type: `application/vnd.incident-witness.presence+json`; preserve the raw body and require the complete envelope to equal its JCS canonical representation before verification.
- Request: `{hostId,observedAt,heartbeatSequence,agentVersion,signature}`. This is not an evidence event and is not inserted into `evidence_events`.
- Logic: authenticate the host credential; verify key is active and bound to host; verify signature over `incident-witness-host-presence-v1\n` + JCS of the request without signature; lock the `witness_keys` row (the presence sequence is scoped to the enrolled key); require a strictly increasing safe-integer operational heartbeat sequence and `observedAt` within 60 seconds of server time (maximum 30 seconds in the future); update `last_presence_sequence`, `last_presence_hash`, key `last_seen_at` and host `last_agent_seen_at`/`agent_version`. An exact retry of the current sequence/body returns `duplicate:true` without refreshing last-seen; lower sequence or same sequence/different bytes is a conflict. A newly enrolled key starts its own presence sequence at zero.
- Success 200 `{data:{accepted:true,serverSeenAt,duplicate:false}}`.
- Rate limit 10/minute per host; max body 4 KB. This route allows an online host to be started into a session; once a session is active, the agent separately submits `host_heartbeat` evidence events to `/v1/agent/events`. Presence messages use a single positive safe-integer operational sequence, separate from the incident event sequence.

**POST `/v1/agent/events`**
- Auth: host device bearer credential + Ed25519 event signature.
- Request: signed event envelope from protocol v1.
- Logic: authenticate device token, load key, verify state/scope/signature, require source `observed_at` within actual capture window and server `received_at` before ingestion deadline, verify host association, enforce 2 KiB payload and 8 KiB request limits, require raw event request bytes to exactly match JCS canonical serialization of the parsed object (rejecting duplicate JSON properties), validate `sequence` as a positive safe integer, lock incident, enforce 4,000-event and 7 MiB aggregate event-entry caps plus unique event/sequence, append only and increment count/byte budget atomically. Record server receipt timestamp. This event route does not update operational presence; only the separate `/v1/agent/heartbeat` route updates `last_agent_seen_at`.
- Success 202 `{data:{eventId,accepted:true,receivedAt,duplicate:false}}`.
- Identical duplicate: 200 with `duplicate:true`; same ID/different bytes or sequence collision 409; revoked token/key 401/403; sealed incident 409; invalid signature 422.
- Rate limit per host/key (host 40/min); event request max 8 KiB; payload max 2 KiB; incident-wide cap 4,000 events and 7 MiB aggregate event-entry budget.

### 10.4 Incident endpoints

**POST `/v1/incidents`**
- Auth provider.
- Request `{hostId,title,durationMinutes,workloadRef?,demoMode?:boolean}`. `demoMode` is allowed only when `IW_ENABLE_DEMO_SESSIONS=true`; default false.
- Logic: transaction locks owner/host, validates ownership/status/heartbeat no older than 60 seconds, checks one active session per host and max three per owner, validates demo-mode feature flag, inserts session with end and grace deadlines, schedules first probe, audit record.
- Success 201 `{data:{incidentId,status,captureStartedAt,captureEndsAt,ingestionDeadline}}`.
- 404 host not owned, 409 active session/limit/host inactive, 422 duration/title, 429.
- Idempotency required.

**GET `/v1/incidents`**
- Auth provider; owner scoped; filters limited to status/host/date; cursor pagination.

**GET `/v1/incidents/:incidentId`**
- Auth provider; owner scope; returns session metadata, source statuses, summarized timeline, evidence gaps, assessment only if sealed. Raw bundle only via download route.

**POST `/v1/incidents/:incidentId/renter-invitations`**
- Auth provider; owner; session collecting; invalidates old unredeemed invite; returns one-time join token, expiration, documented integration snippet. Token must not be logged.
- Rate limit. One renter key per incident. If invitation response is lost, revoke/replace the invitation; never recover a raw token from storage.

**POST `/v1/renter/enroll`**
- Auth invitation token in JSON request body, no user account. Public join page receives it from URL fragment, immediately clears fragment before network calls, then submits body `{invitationToken,publicKey,requestId,sdkVersion}`.
- Logic: atomic invitation consume; confirm incident scope/status; add renter key/certificate; create scoped bearer token hash; return credential and fixed incident endpoint metadata.
- Response `{sourceKeyId,certificate,certificateSignature,ingestionCredential,incidentId,sessionEndsAt,protocolVersion}`.
- Redemption is strictly one-use. If the response is lost after commit, revoke/replace the invitation and register a new renter key; never recover raw credential from storage.

**POST `/v1/renter/events`**
- Auth renter scoped credential + signature.
- Require `Content-Type: application/vnd.incident-witness.event+json`; preserve raw body and require exact JCS canonical serialization of the complete envelope. Apply the same strict I-JSON/safe-integer, event-window, signature, payload, request-size, sequence, incident-count and aggregate-byte validation as host events.
- Must reject event for any other incident, host or source type. `simulation_mode=true` is accepted only for an incident with `demo_mode=true`.
- Rate limited per renter key (10/min); event request max 8 KiB; payload max 2 KiB; one renter key and 4,000 total incident event / 7 MiB aggregate event-entry caps.

**POST `/v1/incidents/:incidentId/end`**
- Auth provider; owner; current status collecting.
- Transaction changes state to awaiting_finalize, sets `ended_at`, cancels future probe jobs and enqueues final due observation if any. Returns grace deadline.
- Idempotent; if already awaiting_finalize return current state. Sealed/cancelled gives 409.

**POST `/v1/incidents/:incidentId/seal`**
- Auth provider; owner; status awaiting_finalize (or collecting only if operator-approved early seal semantics—default requires end first).
- Body `{}`.
- Transaction locks incident row; confirms no active probe lease; rejects zero accepted events; loads verified events and certs in deterministic order; computes gaps/assessment; constructs bundle manifest; signs using active platform key; persists `evidence_bundles`; sets incident sealed; writes audit. All or nothing.
- Success 201 or 200 idempotent `{data:{bundleId,bundleSha256,sealedAt,assessment,evidenceGrade}}`.
- Failure signing key missing/DB failure does not change incident to sealed.
- Idempotency key required.

**GET `/v1/incidents/:incidentId/bundle`**
- Auth provider; owner; incident sealed.
- Response `application/vnd.incident-witness.bundle+json`, attachment filename `incident-witness-<id>.json`, content length limit 10 MiB, no cache shared, `X-Content-Type-Options:nosniff`.
- 404 for non-owned or absent; 409 not sealed.

### 10.5 Key/host/account endpoints

**POST `/v1/hosts/:hostId/keys/:keyId/revoke`** — owner-only; request `{reasonCode}` from fixed enum; atomically set `witness_keys.status=revoked`, set `revoked_at`, revoke every linked `source_credentials` row and append an audit event; prevent future event ingestion but retain historical signature verification.

**POST `/v1/incidents/:incidentId/keys/:keyId/revoke`** — owner-only; key must be a renter key scoped to this incident; same atomic revocation of key and linked credentials; retain historical events and audit the action. A host key cannot be revoked through this route and a renter key cannot be revoked through the host route.

**POST `/v1/hosts/:hostId/archive`** — owner-only; requires no collecting or awaiting-finalize incident; in one transaction set host archived, revoke active host source credentials, revoke unredeemed enrollment tokens, cancel due probe jobs for the host and append an audit event. Existing sealed evidence remains viewable. No unarchive endpoint or UI action exists in v1. Archive is terminal for that host record; a provider who needs to re-enrol must create a new host record and repeat endpoint verification/enrollment.

**Account deletion is not an MVP API or UI feature.** Do not register `/v1/account/delete-request` or display a self-service deletion CTA until the operator has approved an exact live-data deletion procedure, evidence-bundle consequences, backup-retention period and jurisdiction-appropriate legal copy. Production release remains blocked until this policy is decided. A later implementation must define what happens to already-downloaded bundles and legally/operationally retained audit metadata.

### 10.6 Worker-internal operations

Worker does not expose public API endpoints. It reads/leases `probe_jobs` using `DATABASE_URL_IW_WORKER`; obtains only required host endpoint + incident time fields; performs safe probe; signs a `platform_probe_result` event with `IW_PLATFORM_PROBE_PRIVATE_KEY` whose public key/certificate is provisioned in `witness_keys`; appends event using the restricted worker DB path; reschedules if incident is still active. The API-only `IW_PLATFORM_SIGNING_PRIVATE_KEY` signs source registration certificates and sealed bundle manifests and is never available to the worker. The worker never receives user JWTs or a Supabase service-role key.

---

## 11. Transaction and concurrency rules

### 11.1 Create incident

1. Begin transaction.
2. Lock provider profile row (`FOR UPDATE`) or use an advisory lock keyed to owner to serialize max-three count.
3. Lock host row (`FOR UPDATE`) and confirm owner, active status, verified endpoint and agent heartbeat no older than 60 seconds.
4. Check no active session partial unique index.
5. Check owner's active session count < 3.
6. Insert incident.
7. Insert initial probe job.
8. Insert audit event.
9. Commit; only then respond 201.

Partial unique index is the final guard if two requests race. Handle unique violation as 409.

### 11.2 Ingest event

1. Compute credential HMAC; authenticate the exact credential row and linked source key.
2. Validate event body/signature outside DB where safe, then begin transaction and set the transaction-local source/incident/host scope.
3. Lock incident row `FOR SHARE` or `FOR UPDATE` according to chosen DB strategy; verify status and ingestion deadline.
4. Verify key scope/host association and status within transaction to avoid key-revocation race.
5. Insert by ID and unique `(source_key_id,sequence)`.
6. On identical duplicate return prior accepted receipt; on changed content conflict.
7. Update key/host heartbeat only when valid; audit security-relevant rejects.
8. Commit.

### 11.3 Seal incident vs new event

- Both operations lock the incident row.
- Event insertion checks status and time window while lock held.
- Seal changes status in the same transaction that creates immutable bundle.
- Exactly one wins; if event wins, it is included in seal; if seal wins, event rejected as sealed. No post-seal append.

### 11.4 Redeem enrollment/invitation

- Select token row `FOR UPDATE`; verify expiry/revocation/redemption and scope; create key/credential record; mark redeemed; commit.
- Unique constraints and one-use state prevent double redemption under concurrent requests.

### 11.5 Seal idempotency

- Unique `evidence_bundles.incident_id` ensures one bundle.
- Concurrent seal requests lock incident; later request returns existing bundle metadata.
- If signing fails, transaction rolls back entirely.

### 11.6 Worker lease

- Use `SKIP LOCKED` and short transaction to lease due jobs.
- Lease expiry permits recovery after process crash.
- Probe request has deterministic `probe_event_id` derived from job id + attempt or unique job attempt; retries cannot append multiple identical observations.
- Do not keep DB transaction open during network I/O.

### 11.7 API lifecycle sweeper

- API process polls on a bounded 2-second interval. Multiple API instances are safe: claim overdue incident rows with `FOR UPDATE SKIP LOCKED`; no process-local timer is treated as authoritative.
- At `capture_ends_at`, transition `collecting` to `awaiting_finalize`, set actual `ended_at`, cancel future probe jobs and retain the predetermined ingestion deadline. The manual `/end` route uses the same domain function.
- At `ingestion_deadline`, lock the incident and wait/retry while any probe lease remains active. If at least one valid event exists, invoke the same atomic seal function used by the provider endpoint. If none exists, set `cancelled` with `NO_EVIDENCE` and append an audit event.
- Signing-key/DB failure leaves the incident in `awaiting_finalize`; retry with bounded backoff and emit operational alerts. Never mark sealed before the bundle insert and signature commit succeed.
- Token/challenge cleanup is a separate, explicit retention job; do not delete evidence rows in this loop.

---

## 12. Authentication and authorization

### 12.1 Provider

- Supabase email OTP; no custom password table.
- Next.js 16 uses `@supabase/ssr` through a local adapter and `proxy.ts` for cookie refresh; secure, HttpOnly, SameSite=Lax cookies, Secure in HTTPS, PKCE flow. Keep this integration isolated because the official package documentation currently labels `@supabase/ssr` beta.
- API verifies Supabase JWT via JWKS; enforce issuer, audience `authenticated`, expiry, not-before and subject UUID. Reject `none`, unknown algorithms and stale signing keys.
- Do not accept user ID from request body for ownership. Use JWT `sub` exclusively.
- API checks resource owner in DB on every operation. Unknown/unowned object returns 404.

### 12.2 Agent

- Enrollment secret is one-time, 10-minute and host-scoped.
- Agent has own Ed25519 keypair and revocable random API credential.
- Server stores keyed hash only; credential sent via TLS; key signature required for every event.
- Credential is only for event ingestion for a linked host. It cannot call host list, create sessions or access data.

### 12.3 Renter

- Single-use, 15-minute incident invitation.
- Renter SDK generates its own key and receives incident-scoped credential.
- Can append only renter events for one incident; no read access or account.

### 12.4 Platform worker

- Separate Render worker; no public ingress.
- Postgres role restricted to due probes, approved endpoint metadata, source signing key references, event append and operational status. No `service_role` key.
- Platform signing secret available only to API/worker via secret store, not to web client or agent.

### 12.5 Session/account lifecycle

- Expired/revoked provider session returns 401; web refresh follows Supabase SDK.
- Self-service account deletion is intentionally not exposed in v1. Before production, the operator must approve and document the data deletion and backup-retention process; implement it as a separately scoped feature.
- Host agent credentials revocable at any time; historical evidence retained.
- Renter credential invalid once incident ingestion window closes or key revoked.

---

## 13. Security architecture and mitigations

| Threat | Risk | Required mitigation |
|---|---|---|
| IDOR/ownership bypass | High | RLS + explicit owner queries + 404 non-owned + automated cross-account tests |
| JWT forgery/algorithm confusion | High | `jose` JWKS verification; fixed allowed algorithms, issuer/audience/exp/nbf checks; no trust of client claims outside signature |
| OTP brute force/enumeration | Medium | Supabase rate limits, per-IP/account throttles, generic response, resend cooldown, no account-existence disclosure |
| CSRF/session theft | High | Secure HttpOnly SameSite cookies, Origin/CSRF checks on state-changing browser requests, CSP, no token in localStorage |
| XSS | High | React escaping; no `dangerouslySetInnerHTML`; sanitize any Markdown; strict CSP; no untrusted URL in link href |
| SQL injection | High | Drizzle parameterized queries; never concatenate user values; strict schemas; least-privilege role |
| SSRF/DNS rebinding | Critical | DNS TXT ownership, fixed HTTPS 443/path/method, no redirects/proxies, private/reserved IP block, IPv6 filtering, connect to pinned validated IP, bounded time/body, tests |
| Host credential theft | High | local 0600 storage, hashed server copy, revocable credential, scoped capability, no logs/query params, rotation |
| Host key spoofing | High | Ed25519 signatures and registration certificate; clearly state no TPM/TEE/hardware truth; future attestation out of scope |
| Renter invitation leakage | High | hash token, 15-minute TTL, one use, no query param, referer policy, avoid analytics; use URL fragment or manual code so token is not sent in HTTP Referer/logs |
| Replay/duplicate events | High | signed event id + monotonic sequence, unique constraints, idempotent exact duplicate, reject altered duplicates |
| Clock manipulation | Medium | keep source time and server receipt separate, future bound, clock-quality warnings, no timestamp rewriting |
| Race conditions | High | DB row locks, unique/partial indexes, transactional state transitions, concurrency tests |
| Oversized payload/DoS | High | general body 32KiB, event request 8KiB, payload 2KiB, 4,000-event and 7MiB aggregate-entry caps, 10MiB bundle hard cap, agent spool 50MiB, timeouts, concurrency max 10 |
| Log/secret leakage | High | Pino redaction; no payload secrets; secret scanning; error responses safe; restrict log retention |
| Platform signing key compromise | Critical | secret manager, one active key, access limited to API/worker, backups protected, rotation/revocation plan, pinned key fingerprints, alerts; never expose private key |
| Bundle forgery | High | JCS canonicalization, digest, Ed25519 signature, pinned keys, exact offline test vectors |
| Sensor spoofing | High | provenance labels, source-type and simulation labels, multiple observation categories; no claim of sensor truth; future trusted hardware only |
| Malicious local telemetry command | High | fixed binaries and args via `execFile`; no shell; timeout/output cap; unprivileged process; allow-listed fields |
| Dependency/supply-chain attack | Medium | lockfile, npm audit/dependency scanner, pin releases, CI provenance where practical; signed agent release checksums |
| Preview leakage | High | separate Supabase project/schema/test identities, test data only, no production secret, protected preview if needed, no real endpoint probing or live renter credentials |
| Data exposure after export | Medium | owner-only download, explicit sharing warning, short-lived authenticated fetch/no public bundle URLs, privacy docs; exported copy is outside platform control |
| Data deletion/retention | High | No user deletion flow in v1; retention periods and backup purge are not yet approved. Production launch is blocked until legal/operational policy and a tested deletion/retention procedure are approved. |

### 13.1 Threat-model assumptions

- Adversary may control a provider account, host process, renter SDK, DNS record or external network.
- Adversary may send replayed, malformed, duplicate, oversized or cross-account requests.
- Adversary may attempt to use endpoint configuration to scan internal addresses.
- Adversary may modify a bundle after download.
- Platform operator, hosting provider or signing key may be compromised. MVP does not provide protection against a fully compromised platform signing authority.

### 13.2 Security posture labels

Never use “tamper-proof,” “trustless,” “independently verified cause,” “proof of outage cause,” or “hardware-attested” in product copy. Use “tamper-evident,” “signature-verifiable,” “source-attributed observation,” and “evidence pattern consistent with.”

---

## 14. Data retention and privacy

- Exact evidence and bundle retention periods are not yet approved. Until policy and backup purge are documented, use only development/staging/test data; production release is blocked. Do not imply indefinite retention or offer self-service deletion. The future retention job must be explicit, audited and tested; downloaded bundles cannot be recalled.
- Raw agent spool retained locally until accepted by server and user-defined grace; delete acknowledged queue entries only.
- Invitation/enrollment token hashes cleaned after expiry + short audit retention (e.g. 30 days), raw token never stored.
- Probe jobs completed records retained only as long as needed to audit session execution; event record is the evidence history.
- Operational logs avoid hostnames, tokens, key bytes and event payloads; use request IDs and coarse status categories.
- Default bundle visibility is owner-only; export is an intentional user action and includes a sharing/privacy warning.
- No analytics/tracking or cookie consent banner required in MVP because no third-party analytics/cookies are selected. Essential auth cookies remain documented.
- Privacy policy and legal terms must be reviewed/approved by operator; do not publish legal placeholders as authoritative statements.

---

## 15. Third-party integrations and environment configuration

### 15.1 Supabase

Purpose: Auth OTP and Postgres. Auth config includes allowed redirect URLs for localhost, approved Vercel Preview and Production domains; separate staging and production projects. Use `@supabase/ssr` and test cookie/session behavior against current SDK release. Postgres app roles must have no BYPASSRLS. Do not use browser `service_role`/secret key.

### 15.2 Vercel

Purpose: Next.js frontend. Preview environment uses dedicated safe Supabase staging project and test-only API URL. Production environment uses separate URL/keys, only activated after production approval. Do not place private signing keys, DB connection strings or agent credentials in `NEXT_PUBLIC_*` variables.

### 15.3 Render

Purpose: API and worker. API and worker are separate services with separate secret access. Worker does not expose inbound HTTP port. Set health checks, restart policy, instance limits and resource alarms. Probe concurrency must stay bounded.

### 15.4 Host local integrations

- `nvidia-smi`: optional local executable, invoked at known path with fixed arguments.
- `upsc`: optional NUT command, invoked at known path with fixed safe args; no arbitrary remote NUT server selection from API.
- systemd: installation documentation only; agent does not install itself or run privileged shell commands.

### 15.5 Environment variables

| Variable | Required | Where | Client-safe? | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | yes | all Node processes | no | Runtime mode |
| `PORT` | API | API | no | Render listen port |
| `APP_BASE_URL` | yes | API | no | Allowed redirect/origin validation |
| `NEXT_PUBLIC_API_BASE_URL` | web | web | yes | Public Fastify API origin used by browser requests; not a secret |
| `NEXT_PUBLIC_SUPABASE_URL` | web | web | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web | web | yes | Supabase publishable key; RLS required |
| `SUPABASE_URL` | API | API | no | Supabase project URL |
| `SUPABASE_JWKS_URL` | API | API | no | Trusted JWT JWKS endpoint |
| `SUPABASE_JWT_ISSUER` | API | API | no | Expected issuer |
| `DATABASE_URL_IW_API` | API | API | no | Restricted DB role connection |
| `DATABASE_URL_IW_WORKER` | worker | worker | no | Restricted worker role connection |
| `DATABASE_URL_MIGRATOR` | CI/migration only | CI | no | Migration owner connection; never runtime |
| `IW_TOKEN_PEPPER` | API | API | no | HMAC pepper for enrollment/invitation/device credential hashes |
| `IW_PLATFORM_SIGNING_PRIVATE_KEY` | API only | API server secret store | no | Ed25519 platform root key for source registration certificates and sealed bundle manifests; never web/worker |
| `IW_PLATFORM_KEY_ID` | API | API | no | Active platform root public key identifier |
| `IW_PLATFORM_PROBE_KEY_ID` | worker | worker | no | Registered probe source key identifier |
| `IW_PLATFORM_PROBE_PRIVATE_KEY` | worker | worker secret store | no | Separate Ed25519 key for platform-probe observations; public key is registered in `witness_keys`; never web/API |
| `IW_PROBE_INTERVAL_SECONDS` | worker | worker | no | Default 15; bounded 10–60 |
| `IW_PROBE_TIMEOUT_MS` | worker | worker | no | Default 3000; bounded max 5000 |
| `IW_PROBE_CONCURRENCY` | worker | worker | no | Default 10; bounded max 20 |
| `IW_ALLOWED_WEB_ORIGINS` | API | API | no | Comma-separated approved origins |
| `IW_HEALTHCHECK_TOKEN` | API | API secret store | no | Required bearer token for `/health/ready` if no private network restriction is available; compare in constant time |
| `IW_LOG_LEVEL` | optional | API/worker | no | Structured log level |
| `IW_BUNDLE_MAX_BYTES` | optional | API | no | Default 10 MiB (10,485,760 bytes), hard cap 10 MiB; never raise above the protocol cap |
| `IW_ENABLE_DEMO_SESSIONS` | optional | API | no | Default false; permits explicitly labelled synthetic/demo sessions |

Agent local configuration (not platform env) includes `IW_API_BASE_URL`, `IW_HOST_ID`, `IW_DEVICE_CREDENTIAL`, `IW_DEVICE_PRIVATE_KEY_PATH`, optional `IW_NUT_DEVICE`, and optional `IW_NVIDIA_SMI_PATH`. These are local config; credentials never appear in client-side Next variables.

`.env.example` contains blank values and comments only; it must never contain credentials or realistic secrets. Missing mandatory variables must fail startup with a redacted error and nonzero exit.

---

## 16. AI, payments, search, caching and notifications

- AI: not used; no model, prompt or tool calling.
- Payments: not used; no money logic.
- Search: no full-text search in MVP; simple indexed filtering/pagination.
- Caching: no shared cache. Use short-lived browser cache for read-only lists only if stale state is labelled; no cache for auth, bundle or sensitive evidence by default.
- Notifications: no external SMS/push; Supabase email OTP only. In-product status updates via refresh/polling in MVP; no WebSocket requirement.
- Webhooks: none required in MVP.

---

## 17. Observability and operations

- Pino structured logs with `request_id`, service, route template, outcome category and duration.
- Never log raw event payload, secret, host bearer token, enrollment/invitation token, OTP, authorization header, cookie, private key or full endpoint hostname unless explicitly redacted.
- API metrics: request rate/error/latency, auth failure/rate limit, event ingest acceptance/rejection counts, DB transaction error, seal failure.
- Worker metrics: due job count/age, active lease count, probe latency/outcome category, retries/dead tasks, worker heartbeat.
- Agent telemetry: local heartbeat/spool metrics only; no remote control.
- Alerts: API/worker not ready; signing key unavailable; probe backlog above threshold; repeated DB connection issue; high signature failure/rate abuse; worker jobs dead-lettered.
- Operational runbook in `docs/OPERATIONS.md`.

---

## 18. Key rotation, backup and disaster recovery

- Host key rotation: provider triggers new enrollment; old key revoked; new key gets new source key ID/certificate. Historic signatures remain verifiable.
- Renter key: incident-scoped; expires with incident ingestion window; no long-term rotation required.
- Platform signing: maintain trusted key ID/fingerprint registry; rotate by first shipping new public key in web/CLI verifier release, then activate new private key; old key remains trusted for historical bundles unless compromised; on compromise mark revoked and verifier reports affected bundles as untrusted.
- DB backups: use Supabase backup/PITR appropriate to account tier; test restore in staging. Bundle signature is not a backup strategy.
- Recovery objective: do not promise RPO/RTO until hosting plan is known. Record actual provider plan and test restore evidence before production launch.

---

## 19. Architecture decision records required

Initial ADRs to create during Phase 2:

- ADR-001: Supabase DB roles + RLS transaction identity mechanism.
- ADR-002: JCS/Ed25519 v1 signed event and bundle format.
- ADR-003: fixed hostname health endpoint + DNS challenge + SSRF-safe pinned resolver.
- ADR-004: Postgres `SKIP LOCKED` probe queue and worker lease.
- ADR-005: bounded agent local SQLite spool and offline synchronization.
- ADR-006: trust semantics and platform-operated probe disclosure.

Any ADR that materially changes stack, event trust, product scope, privacy or authorization requires explicit operator approval.

---

## 20. External technical references

Use current official docs during implementation and pin the actual dependency versions in the lockfile:

- Next.js App Router: https://nextjs.org/docs/app
- Next.js installation/system requirements: https://nextjs.org/docs/app/getting-started/installation
- Node.js releases: https://nodejs.org/en/about/previous-releases
- Fastify v5: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Supabase SSR auth for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Postgres connection strings: https://supabase.com/docs/guides/database/connecting-to-postgres
- Vercel deployment environments: https://vercel.com/docs/deployments/environments
- Render background workers: https://render.com/docs/background-workers
- RFC 8785 JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785
- JavaScript JCS implementation (pinned `canonicalize@5.1.0`; listed by RFC 8785 Appendix G): https://www.npmjs.com/package/canonicalize
- RFC 8032 Ed25519: https://www.rfc-editor.org/rfc/rfc8032

The implementation agent must re-check current official documentation and compatibility before install; if a material conflict is found, stop and present the evidence and proposed change rather than making the change silently.
