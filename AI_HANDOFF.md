# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-11-01

**Project status:** Phase 0, Phase 1, Phase 2 and all Phase 3 subphases (3A, 3B, 3C, 3D, 3E, 3F) are complete and accepted. Phase 3 is entirely **COMPLETE**. Phase 4 functional frontend integration is implemented and test-verified. Phase 5 MVP hardening and the E2E verification gate are implemented, tested and accepted; the Hard Functionality Gate is **PASSED**. Phase 6 reference-driven mockups (revision 0.3) are **APPROVED**. Phase 7 final UI implementation is implemented, deployed and **COMPLETE AND CLOSED**; the magic-link session bug and the protected-route API-call race are fixed, verified and accepted. Phase 8 frontend and documentation completeness is implemented, test-verified, deployed and **COMPLETE AND CLOSED**. Phase 9 final regression, security audit and release readiness is **COMPLETE AND GREEN**. The MVP is a release candidate awaiting explicit production release authorization.

**Current phase:** Phase 9 — complete. Final operator UI polish corrections applied on 2026-11-01. Awaiting explicit production release authorization.

**Next task:** Obtain explicit production release authorization. Do not deploy Production before it.

**Phase 2 acceptance:** Operator accepted the Phase 2 checkpoint and approved the `public.iw_uid()` security-definer wrapper on 2026-10-31.

**Phase 3B acceptance:** Operator accepted the Phase 3B checkpoint on 2026-10-31 and explicitly approved the recorded deviations: the generated staging platform key, migrations `0009`–`0012` (grants/RLS only, no table/column changes), and the `endedAt` vs `captureEndsAt` manual-end constraint.

**Phase 3C acceptance:** Operator reviewed the Phase 3C checkpoint report and accepted it on 2026-10-31. The correlation engine, canonical signed-event ingestion and transactional sealing meet the Phase 3C requirements. Phase 3C is **COMPLETE AND CLOSED**.

**Phase 3D acceptance:** Operator reviewed the Phase 3D checkpoint report and accepted it on 2026-10-31. The explicit `--incident <uuid>` flag for the host agent was accepted as a valid MVP implementation detail. Phase 3D is **COMPLETE AND CLOSED**.

**Phase 3E acceptance:** Operator reviewed the Phase 3E checkpoint report and accepted it on 2026-10-31. The explicit `endpointHostname` requirement and the missing live probe key setup are accepted and documented. Phase 3E is **COMPLETE AND CLOSED**.

**Phase 3F acceptance:** Operator reviewed the Phase 3F checkpoint report and accepted it on 2026-10-31. The offline CLI verifier and the staging E2E demo-harness proof are accepted. Phase 3F is **COMPLETE AND CLOSED**, and Phase 3 is entirely **COMPLETE**.

**Phase 5 acceptance:** Operator reviewed the Phase 5 checkpoint report and the Magic Link authentication pivot on 2026-10-31. The operator confirmed that the Magic Link successfully logged them in; the current failure is a Supabase free-tier rate limit, not a code issue. The Hard Functionality Gate is officially **PASSED**. Phase 5 is **COMPLETE AND CLOSED**.

**Phase 7 acceptance:** Operator reviewed the Phase 7 visual implementation, the magic-link session fix and the protected-route API-call race fix on 2026-10-31. The operator confirmed that protected routes now redirect to `/login` without flashing API errors and that the approved design implementation looks correct. The diagnosis, fixes and visual design are **APPROVED**. Phase 7 is **COMPLETE AND CLOSED**.

**Phase 8 authorization:** Following Phase 7 acceptance, the operator authorized Phase 8 frontend and documentation completeness on 2026-10-31.

**Phase 8 acceptance:** Operator reviewed the Phase 8 report on 2026-10-31 and **APPROVED** the checkpoint. Documentation, SEO metadata, link audits and accessibility fixes are accepted. The Vercel edge `403` responses were confirmed as bot protection rather than an application failure. Phase 8 is **COMPLETE AND CLOSED**.

**Phase 9 authorization:** The operator authorized Phase 9 final regression, security audit and release readiness on 2026-10-31. Production release still requires separate explicit authorization.

**Authentication deviation (operator-approved 2026-10-31):** The provider login was changed from a six-digit Supabase email OTP to Supabase's default magic-link flow. This bypasses the Supabase free-tier requirement for custom SMTP and an editable email template. The form calls `signInWithOtp` with `emailRedirectTo=/auth/callback`; the callback exchanges the code for a session and redirects to `/dashboard`, or redirects to `/login?error=invalid_link` on failure. The Supabase Auth redirect allow-list must include the deployment origin and `/auth/callback`. No external email service or backend/database change was introduced.

## Project

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed observations from a provider's Linux host, a renter-side client and a separately operated platform probe; correlates a bounded timeline; and seals a portable JSON evidence bundle for local signature/integrity verification.

It does not prove sensor truth or physical root cause, decide whether downtime should be excused, alter marketplace reliability scores or integrate with a marketplace in MVP.

## Source-of-truth files

- `PROJECT_SPEC.md` — product, MVP, flows, behaviour, acceptance criteria and UI routes.
- `ARCHITECTURE.md` — stack, trust boundaries, schema, API, cryptography, security and integrations.
- `IMPLEMENTATION_PLAN.md` — phase order, task boundaries and acceptance gates.
- `AGENTS.md` — mandatory coding-agent instructions.
- `README.md` — repository introduction and operating instructions.
- `docs/` — research, protocol, operational, user and security docs.
- `docs/adr/ADR-001-database-transaction-identity.md` — accepted database identity decision.

## Current architecture

- Node.js 26.13.0 LTS, TypeScript strict, npm workspaces.
- Next.js 16.4.3 App Router + Tailwind CSS 4.x frontend; approved Satoshi/emerald design applied in Phase 7.
- Fastify 5.12.7 API with Pino redaction, request IDs, CORS, rate limiting, Helmet and the documented error envelope.
- `@incident-witness/protocol` pure TypeScript package with strict v1 schemas, RFC 8785 JCS via pinned `canonicalize@5.1.0`, Node Ed25519 signing via `node:crypto`, browser public-key verification via `@noble/ed25519@3.2.0`, source-key certificates and signed bundle manifests. No DB/network/UI imports; no browser private-key code.
- `@incident-witness/correlator` pure TypeScript package implementing rule version `iw-rules-v1`; input-order independent, no timestamps or random values.
- Supabase Postgres/Auth; Drizzle ORM + `pg`; versioned SQL migrations in `packages/db/migrations`.
- `jose` JWT verification against Supabase JWKS; issuer, audience, expiry and UUID subject checks.
- Accepted ADR-001 mechanism: API connects as restricted `iw_api`, sets transaction-local JWT subject and request mode, and never uses `SET ROLE authenticated`.
- Supabase's staging `auth` schema is owned by `supabase_admin`; the migrator cannot grant `auth` USAGE to `iw_api`. Policies therefore call a narrow `SECURITY DEFINER` wrapper `public.iw_uid()` which calls `auth.uid()`. No role switch, service-role connection or auth-schema grant to `iw_api` is used. **Operator approved this wrapper on 2026-10-31.**
- Linux host agent (`packages/host-agent`, executable `iw-agent`) implements interactive enrollment, local Ed25519 key generation, owner-only credential storage, a durable SQLite spool, operational-presence and evidence heartbeats, fixed-argument `nvidia-smi`/`upsc` collectors and bounded retry/backoff.
- `@incident-witness/renter-sdk` implements one-use invitation redemption, an in-memory/optional durable incident-scoped Ed25519 key, 5 MiB bounded queue, `renter_heartbeat` and `renter_endpoint_result` emission, deadline/closed-incident handling and scoped event signing.
- `apps/probe-worker` is a separate `iw_worker` background process: `FOR UPDATE SKIP LOCKED` job leases, 30-second lease recovery, a custom DNS-resolving and IP-pinned HTTPS client with SSRF/DNS-rebinding controls, fixed health-check validation, platform-probe event signing and direct DB append with incident counters.
- `tools/iw-verify` is an offline Node CLI using the shared protocol package. It validates strict schema/versions, manifest digest, a locally pinned platform public key/signature, source certificates, event signatures/digests, sequence/order and bundle consistency with exit codes 0/1/2. It performs no network request.
- `render.yaml` defines the Render API Web Service, build sequence and `node apps/api/dist/index.js` start command; `apps/api/src/index.ts` preserves the existing server entrypoint.
- `tools/demo-harness` runs a labelled synthetic power-pattern incident against the configured staging database through a locally constructed API instance, seals/downloads a bundle, verifies it with the CLI and demonstrates one-byte tamper detection.
- `apps/web` now uses a typed authenticated API client for host/incident data, Supabase bearer sessions and 401/403 refresh-or-login handling. Provider routes load real data, host DNS/enrollment/key/archive controls are connected, incident lifecycle/invitation/timeline/download controls are connected, and `/verify` runs the full browser bundle verifier locally with no bundle upload.

## Repository state

- **Repository URL:** confirmed public — https://github.com/onyebuchidaniel60/incident-witness
- **Working directory/repo root:** `/root/incident-witness`
- **Branch:** `main`
- **Phase 3F commits:**
  - `411ce49` — `feat(cli): add offline bundle verifier`
  - `b8ed540` — `feat(demo): add end-to-end integration harness`
  - `10cac9d` — `feat(worker): support generated probe key provisioning`
  - `8b3adf9` — `style(phase3f): format verifier and harness sources`
  - `929c20e` — `fix(cli): accept out-of-order observed timelines`
- **Phase 4 commits:**
  - `0570b5f` — `docs(handoff): accept phase 3f and close phase 3`
  - `89a587e` — `feat(web): add authenticated API client and host management`
  - `30f2321` — `feat(web): connect dashboard and incident lifecycle`
  - `95ec4c7` — `feat(web): add local browser bundle verifier`
  - `83c8e8d` — `test(web): add full-stack provider and verifier journeys`
  - `3bd6df7` — `feat(web): connect host list, enrollment and lifecycle controls`
  - `18c852c` — `docs(phase4): record functional web integration checkpoint`
  - `f22458d` — `fix(web): build protocol package before next build`
- **Phase 5 commits:**
  - `c7b508e` — `chore: add render.yaml deployment config`
  - `50570e0` — `fix(api): seal probe evidence and reject sequence rollback`
  - `ac38325` — `fix(worker): stop observations after effective capture end`
  - `1393793` — `fix(web): surface stale data and unavailable telemetry`
  - `ebdcd32` — `fix(api): register sequence rollback error code`
  - `77a2c92` — `fix(api): return latest timeline events`
- **Phase 8 commits:**
  - `fb95f54` — `feat(web): add site metadata, icons and safe error states`
  - `8440ce1` — `docs(web): add real documentation and legal status pages`
  - `d2168de` — `docs: update readme for phase 8 completeness`
  - Final `fix(web)` commit removes duplicate document titles on the 404 and error routes.
  - Final `docs(handoff)` commit records the Phase 8 checkpoint and deployment evidence.
- **Phase 3E commits:**
  - `d810d5c` — `feat(db): add phase 3e worker probe access`
  - `0d5a9ea` — `feat(sdk): add renter client`
  - `8546bac` — `feat(worker): add secure SSRF-safe probe worker`
- **Phase 3D commits:**
  - `ab15e73` — `feat(agent): add enrollment and durable local spool`
  - `eb46321` — `feat(agent): add safe collectors and upload loop`
- **Phase 3C commits:**
  - `ebf6ab7974a5ed8f25f725880cb01f35fb2592d8` — `feat(correlator): add deterministic assessment rules`
  - `1c4905c575e029690b878b3f0a6b98ff2066b63a` — `feat(db): add phase 3c evidence access policies`
  - `9d192d826d98ec2eb76896bd46773ce47301b8a7` — `feat(api): add signed ingestion and bundle sealing`
  - `5896c951791f9e18de103fb893fb588163f242d3` — `test(api): cover ingestion sealing and correlation`
- **Phase 3B commits:**
  - `b3cd94b58fc3595f7731bbe7655fe0d69037db3d` — `feat(db): add phase 3b domain access policies`
  - `5d62e12595b12889a1fe768bb9a2abdebdcdce62` — `feat(api): implement host and incident domain lifecycle`
  - `69a7c94093cefd6186f614c7356c9fa855ea4d66` — `test(api): cover isolation concurrency and lifecycle`
  - `b273548181dbc6d8b77563704972c503aad6e8a6` — `fix(api): serialize enrollment and invitation lock ordering`
- **Working tree:** clean after the final docs/handoff commit.
- **Node runtime:** confirmed `v26.13.0`; npm `11.20.0`; `.node-version` pins `26.13.0`.

## Phase 2 deployment checkpoint (unchanged)

- **Deployed URL (Git-attested production deployment):** https://incident-witness-2zb16ifpw-uhhh2.vercel.app
- **Stable aliases:** https://incident-witness.vercel.app and https://incident-witness-git-main-uhhh2.vercel.app
- **Deployment ID:** `dpl_J3PLLpQaSg9nNibqQkQj6q7T2Xnf`
- **Deployed SHA:** `29547c8a86a13c83ad3289636767855bdca1446b`
- **Deployment target/status:** Production; `READY`; Git metadata matched `main`.
- **Vercel Authentication:** **DISABLED** (`ssoProtection: null`; no protection-bypass secret remains).
- **API deployment:** **not deployed to Render**. The deployed web app does not call a deployed API.
- **Preview:** no separate Preview URL was created for this commit; the Git-connected `main` deployment targets Production.
- **Safe staging:** web deployment uses public Supabase URL/publishable-key configuration for the staging project; no server-only secrets, database URLs, platform signing keys or host credentials are available to the browser.
- **Phase 3C deployment:** no frontend files changed, so no new Vercel deployment was made. The Phase 3C API is verified locally against staging; Render deployment remains outstanding.

## Phase 4 deployment checkpoint

- **Vercel deployment URL:** https://incident-witness-fn3z7ifx3-uhhh2.vercel.app
- **Stable aliases:** https://incident-witness.vercel.app, https://incident-witness-uhhh2.vercel.app and https://incident-witness-git-main-uhhh2.vercel.app
- **Deployment ID:** `dpl_7XDDxK3FL3zdxeFKZ87UKuZ3SXor`
- **Deployed code SHA:** `f22458dab3bb10adadc78de44d8722b370bf7d03` (`fix(web): build protocol package before next build`), Git metadata matched `main`.
- **Status:** `READY`; Production, auto-created by the Git-connected Vercel project after the authorized `git push`. HTTP checks: `/` 200, `/login` 200, `/verify` 200.
- **Safe staging:** deployment uses the staging Supabase public URL/publishable key; no server-only secrets or platform private keys are in the browser bundle.
- **Blocker:** the Fastify API is still not deployed to Render. Host/incident pages on the hosted deployment cannot load provider data until a safe API origin exists; the local browser verifier and public pages can run without the API. The production deployment is therefore not a complete functional Preview for provider journeys.
- **Phase 5 Render config:** `render.yaml` now defines the API service and `apps/api/dist/index.js` entrypoint. The service has not been linked or verified in Render from this environment; required secrets and migrations through `0022` remain operator prerequisites.
- **Phase 5 Vercel deployment:** https://incident-witness-772jl2xxk-uhhh2.vercel.app (`dpl_6rucc3QBDKwuzY1mwgPknuhwFfwi`), Git SHA `5d8eec2acb511f09d44722f3db2de13e0273fe22`, status `READY`; `/` and `/verify` return HTTP 200 on the stable alias. The hosted provider workspace still requires a deployed Render API and `NEXT_PUBLIC_API_BASE_URL`.

## Completed in Phase 3B (accepted and closed)

- Owner-scoped host CRUD, DNS TXT endpoint challenge/verification with public-IP/SSRF rules and fixed HTTPS health check.
- Host enrollment codes, atomic agent enrollment, platform-signed source certificates and HMAC-only credential storage.
- Signed operational-presence heartbeat with independent monotonic sequence, freshness and replay handling; not an evidence event.
- Bounded incident creation/end, one active session per host, max three per owner, probe-job cancellation and lifecycle sweeper auto-end.
- Renter invitations, incident-scoped renter enrollment and key revocation.
- Host archive, audit events and `Idempotency-Key` handling.
- Migrations `0009`–`0012` added only grants/RLS policies; no table/column changes.
- 39 Phase 3B integration tests passed.

## Completed in Phase 3C (accepted and closed 2026-10-31)

### Signed event ingestion

- `POST /v1/agent/events` and `POST /v1/renter/events`.
- Requires `Content-Type: application/vnd.incident-witness.event+json`.
- Preserves raw bytes, parses JSON, validates strict protocol schemas, canonicalizes with RFC 8785 JCS and requires exact byte equality with the request. Whitespace, reordered keys, duplicate properties and noncanonical numbers are rejected before signature verification.
- Verifies the Ed25519 signature against the registered source public key and checks credential/key status, source type, host/incident scope and incident state.
- Enforces request ≤ 8 KiB, payload ≤ 2 KiB canonical bytes, `observed_at` inside `[capture_started_at, effective capture end]` (using `endedAt` when earlier) and server receipt before `ingestion_deadline`.
- Enforces the 4,000-event and 7 MiB aggregate canonical event-entry budgets atomically under the incident row lock; returns `INCIDENT_EVIDENCE_LIMIT`.
- Exact duplicate event ID/body/signature returns the prior receipt with `duplicate:true` (HTTP 200). Same event ID with different content or sequence reuse returns `EVENT_CONFLICT` (409).
- Simulated events are accepted only in demo sessions. Event ingestion does **not** update operational presence.
- No raw event payloads or signatures are logged.

### Deterministic correlator

- New pure `packages/correlator` package; no DB, network, clock or random dependency.
- Rule version `iw-rules-v1`: 120-second correlation window, 180-second power chain, 30-second probe/host adjacency.
- Outputs `POWER_RELATED`, `EXTERNAL_REACHABILITY_LOSS`, `HOST_OR_WORKLOAD_EXIT` or `UNKNOWN`, with `HIGH`/`MEDIUM`/`LOW`/`INSUFFICIENT` grades.
- `POWER_RELATED` requires a UPS on-battery/low-battery transition, prior host heartbeat, no host heartbeat in the power window and renter/probe reachability loss near the transition.
- `EXTERNAL_REACHABILITY_LOSS` requires a platform-probe failure plus a host heartbeat/agent-health observation within 30 seconds; renter results may corroborate.
- `HOST_OR_WORKLOAD_EXIT` requires an explicit host-agent/renter stop signal plus supporting probe/client observation.
- Simulated decisive evidence caps grade at `LOW` and adds `SIMULATED_EVIDENCE_PRESENT`; demo sessions are labelled and capped at `LOW`.
- Extracts `source_gap` events into deterministic bundle gap entries.
- Input-order independent; tested with reordered events.

### Sealing transaction

- `POST /v1/incidents/:incidentId/seal`.
- Locks the incident row `FOR UPDATE`, requires `awaiting_finalize`, rejects active probe leases and zero accepted events.
- Loads accepted events in deterministic order (`observed_at`, source type, key ID, sequence, event ID), verifies stored event digests/signatures and source certificates.
- Runs the correlator, constructs the manifest, validates it against the protocol schema, hashes and signs it with the platform Ed25519 key.
- Inserts the immutable `evidence_bundles` row, updates the incident to `sealed` and appends an audit event in one transaction. Any failure rolls back completely.
- Rejects a complete bundle over 10 MiB.
- Idempotent repeated seal returns the existing bundle metadata.
- Seal and event ingestion both lock the incident row; exactly one state transition wins.

### Bundle download

- `GET /v1/incidents/:incidentId/bundle`.
- Owner-scoped; 404 for non-owned/missing, 409 when not sealed.
- Returns the exact canonical JSON bundle with `application/vnd.incident-witness.bundle+json`, attachment filename, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

### Lifecycle sweeper enhancements

- At `capture_ends_at`, transitions overdue `collecting` incidents to `awaiting_finalize`.
- At `ingestion_deadline`, automatically seals incidents with accepted evidence or cancels with `NO_EVIDENCE` when none exists.
- Active probe leases leave the incident in `awaiting_finalize` for retry.
- Signing/DB failures roll back and leave the incident `awaiting_finalize`; the 2-second bounded loop retries and logs a safe error category.

### Consistency and access changes

- Manual end now clamps `endedAt` to the latest accepted observation so accepted events remain inside the effective capture window.
- Migrations `0013`–`0017` add only grants/RLS policies for machine event reads, scoped incident locks, provider/system bundle inserts, platform-key lookup, system finalization visibility and the auto-end transition. No table or column definitions changed.
- The machine incident policy avoids RLS recursion and prevents a host key from locking another host's incident; renter key scope is validated before the incident lock.

## Completed in Phase 3D (accepted and closed 2026-10-31)

### Package and CLI

- New workspace package `@incident-witness/host-agent` with executable `iw-agent`.
- Commands: `enroll`, `run`, `status`, `version` and `help`.
- Enrollment code is read interactively with terminal echo disabled; it is never accepted as a
  command-line argument or environment variable and is not logged.
- Ed25519 keypair generated locally with `node:crypto`. Only the public key is sent to
  `POST /v1/agent/enroll`. The returned source certificate is validated against the local public key,
  source key and host scope.
- Configuration directory defaults to `~/.config/incident-witness/` (XDG-aware) and is forced to
  `0700`. `config.json`, `device-key.pem`, `device-credential` and the SQLite spool are `0600`.
  Secret paths reject symlinks, verify ownership and repair group/other-readable permissions.
- Existing key material is never overwritten. Enrollment files are rolled back if a later local
  write fails, and the operator is told to revoke/reissue if the server succeeded but local storage
  failed.

### Durable local spool

- `better-sqlite3@13.0.3`, WAL mode, `synchronous=FULL`, busy timeout, `integrity_check` on open and
  a bounded journal size. A corrupt spool fails closed; counters are never reset.
- 50 MiB logical quota over exact canonical signed envelopes. Oldest non-critical observations
  (heartbeats/periodic GPU summaries) are dropped first; power transitions and agent status are
  preserved. If a critical record cannot fit, it is not queued and health becomes degraded.
- Event and presence sequences are separate counters in SQLite metadata. The next value is committed
  in an `IMMEDIATE` transaction before signing, so a crash leaves a gap rather than a reused number.
- Closed incidents are recorded in a durable block table. Their local events are retained but not
  uploaded again.

### Presence and evidence

- Operational presence every 15 seconds to `POST /v1/agent/heartbeat` using the domain-separated
  `incident-witness-host-presence-v1\n` signature and its own durable monotonic sequence. It never
  enters the evidence spool or a bundle.
- Evidence `host_heartbeat` every 30 seconds when `run --incident <uuid>` is supplied, using the
  shared durable event sequence.
- `host_agent_status` `started`/`stopped` records queued as critical state transitions during a
  configured incident.
- The current API has no agent-scoped session-discovery route. The operator supplies the active
  incident ID explicitly; this integration gap is documented and must be handled in the Phase 4
  provider UI rather than hidden.

### Collectors

- `nvidia-smi` every 30 seconds with fixed executable and fixed argument array, device index 0 only,
  `execFile` with `shell: false`, 2-second timeout and 64 KiB maximum output. Command failure,
  malformed output and `[N/A]` fields produce `unavailable`/`partial`; no values are fabricated.
- Optional NUT `upsc <validated-alias>` polled every 5 seconds, emitted on state transition and at
  most once per 60 seconds when unchanged. Fixed `execFile` invocation, 2-second timeout and 64 KiB
  output cap. `OL`/`OB`/`LB` map to explicit states; failure or malformed output is `unavailable`.
- No `child_process.exec`, shell interpolation, arbitrary executable/arguments, system logs,
  environment-variable telemetry or free-form payloads.

### Upload and retry

- FIFO upload of exact canonical envelope bytes with the host bearer credential.
- Network errors, `429` and `5xx` retry with jittered exponential backoff (1 second base, 5 minute
  cap) without deleting the event.
- `4xx` validation/credential/key errors halt the uploader, log only a safe code and stop evidence
  collectors; queued evidence is retained.
- `409 INCIDENT_CLOSED` blocks that incident and stops its evidence collectors without deleting local
  events.
- Graceful `SIGINT`/`SIGTERM` queues a stopped status event where the incident is still open, attempts
  a bounded flush and closes the spool.

### Tests added

- 49 host-agent tests covering spool persistence and restart, quota drop order and critical-record
  preservation, durable event/presence sequence recovery, WAL/permissions/integrity failure,
  presence signing and anti-replay, enrollment success/rejection/certificate mismatch and file
  permissions, fixed collector invocation and malformed/timeout output, retry/backoff classification,
  `INCIDENT_CLOSED`, credential rejection, event signature verification, graceful stop, log redaction
  and an end-to-end local HTTP mock of enroll → presence → signed event upload → outage retry.

## Completed in Phase 3E (accepted and closed 2026-10-31)

### Renter SDK (`packages/renter-sdk`)

- `RenterClient.enroll` redeems a one-use invitation through `POST /v1/renter/enroll`, generates an
  Ed25519 key locally, validates the returned renter certificate against the source key, public key
  and incident, and never stores the invitation token.
- In-memory state by default; optional explicit `stateDir` persists the incident-scoped private key,
  credential, sequence and queue with directory `0700` and file `0600`. `RenterClient.resume`
  reloads without reusing the invitation.
- `renter_heartbeat` immediately and every 30 seconds; `renter_endpoint_result` immediately, every
  60 seconds and on reachability-state change.
- Endpoint checks are fixed HTTPS port 443 / `/.well-known/incident-witness/health`, no redirects,
  3-second timeout and 1 KiB body cap. Invalid/absent results are explicit, never fabricated healthy.
- One shared durable sequence across event types; 5 MiB bounded queue with explicit dropped-event
  count; jittered retry for network/429/5xx with `Retry-After`; halt on non-retryable 4xx,
  `INCIDENT_CLOSED`, revocation or the ingestion deadline.
- The SDK only builds events for the enrollment incident/source key. The server remains the final
  scope authority.

### Probe worker (`apps/probe-worker`)

- Separate Node background process using the restricted `iw_worker` DB role; no inbound listener.
- Claims due/expired `probe_jobs` in a short transaction with `FOR UPDATE SKIP LOCKED`; 30-second
  lease, attempt counter and expired-lease recovery.
- Completes each attempt by locking the incident, allocating the next platform-probe sequence under a
  per-key advisory lock, inserting the signed event, updating evidence counters and scheduling the
  next 15-second job in one transaction. Bounded retries and dead-letter state.
- Custom HTTPS client only: manual A/AAAA resolution, blocked-range validation, IPv4-mapped IPv6
  rejection, mixed-answer fail-closed, first validated IP pinned as the TCP host, hostname retained
  for SNI/`Host`, TLS validation, no redirects, no proxy env, 3-second timeout and 1 KiB body cap.
- `platform_probe_result` payloads carry only bounded result categories, latency and IP class; raw
  hostnames/IP addresses are not logged or exported. Policy/infrastructure errors use
  `probe_status: error`, which the correlator excludes from causal rules.
- Correlator `isProbeFailure` corrected so `probe_status: error` is not treated as host-down
  evidence; rule version remains `iw-rules-v1` because no prior probe-error events existed.
- `db:provision-probe-key` operator script registers the public key and platform-signed
  `platform_probe` certificate; the worker runtime never receives the API root key.

### Database access changes

- `0018_phase3e_worker_probe_access.sql`: grants/RLS only for worker probe-job insert/schedule,
  incident evidence-counter updates and deterministic event-sequence reads.
- `0019_phase3e_worker_counter_select.sql`: grants only for worker reads of accepted-event counters.
- No table or column definitions changed; no existing policy was weakened.

## Completed in Phase 3F (accepted and closed 2026-10-31)

### Offline CLI verifier (`tools/iw-verify`)

- Workspace package `@incident-witness/cli-verifier` with executable `iw-verify`.
- Uses `@incident-witness/protocol`/`protocol/node`; imports no DB/network client and performs no
  upload or fetch.
- Strictly validates `bundle_version`/protocol/schema `1.0`; full Zod bundle schema; canonical
  manifest SHA-256; the platform key ID against a locally pinned public-key trust set
  (`tools/iw-verify/trusted-platform-keys.json`, public keys only); platform Ed25519 manifest
  signature; source registration certificates and their fingerprints/signatures/scopes; every
  source event Ed25519 signature and event digest; event ID/sequence uniqueness, deterministic
  timeline order, capture-window/receipt bounds and simulation labelling.
- Reports separate PASS/FAIL checks and the integrity/signature limitation statement.
- Exit codes: `0` fully valid, `1` invalid/tampered, `2` missing/unreadable/unparseable file or
  unusable trust set. `--trust <path>` supports a separately operated pinned key set.
- The CLI and the browser manifest verifier are tested against the same valid and tampered fixtures.

### Integration demo harness (`tools/demo-harness`)

- `npm run demo` runs a labelled synthetic power-pattern lifecycle against the configured staging
  database using a locally constructed `iw_api`-backed Fastify instance and fake DNS/endpoint
  verifiers. It does not deploy, call the production API or use real hardware.
- Creates a disposable staging auth/profile row through the migrator, creates and verifies a host,
  enrolls a simulated host key and a simulated renter key, sends one presence heartbeat, creates an
  explicitly labelled demo session, ingests signed synthetic events, ends, seals and downloads the
  bundle.
- All four events carry `simulation_mode: true`; the session has `demo_mode: true`; the manifest has
  `simulation_present: true`, assessment `POWER_RELATED` and grade `LOW` under the demo cap. The
  harness fails if any label is missing.
- Runs `iw-verify` on the sealed bundle (expects exit 0), changes one byte of `host_alias`, rewrites
  the tampered JSON, and runs `iw-verify` again (expects exit 1 with manifest digest/signature
  failures). The harness prints both reports and the artifact directory.
- Ephemeral Ed25519 keys are generated per run; no private key or credential is committed, and
  temporary staging rows are removed in `finally`. Artifacts stay under the OS temp directory unless
  `keepArtifacts` is disabled.

### Probe key generation

- `npm run db:provision-probe-key -- --generate --out secrets/probe-worker.pk8` generates an Ed25519
  PKCS8 keypair, writes the private half with mode `0600` and `wx` (never overwriting), registers
  only the public key/fingerprint/certificate and prints only public metadata and the file path.
- Existing operator-provided-key provisioning remains supported without `--generate`. Generated key
  files are deleted if registration fails. `--generate` refuses to combine with an environment
  private key.
- Staging still has **no live platform-probe key**; provisioning remains an operator action.

### Phase 3F test evidence

- CLI: 11/11 tests pass (valid, modified manifest, modified event signature, unknown platform key,
  unsupported bundle/protocol version, wrong event order, missing/unparseable file, structured
  invalid report, browser/CLI fixture parity).
- Demo harness: 2/2 staging integration tests pass (sealed bundle passes CLI and is fully labelled;
  one-byte tamper fails as expected).
- Full suite: 158 unit tests pass (20 protocol, 11 CLI verifier, 13 correlator, 14 ADR-001, 49
  host-agent, 14 renter SDK, 20 probe worker, 17 API) plus 57/57 API integration and 1/1 probe
  worker staging integration.
- `npm run lint`, `npm run typecheck` and `npm run build` pass; `npm run demo` produced a valid
  `POWER_RELATED`/`LOW` bundle and the expected tamper failure.

## Completed in Phase 4 (implemented and tested; pending operator acceptance)

### Authenticated API and auth handling

- `apps/web/lib/api/client.ts` is a typed fetch client using `NEXT_PUBLIC_API_BASE_URL` and the
  Supabase browser session access token.
- 401/403 responses trigger one session refresh and retry; a persistent failure clears the local
  session path and redirects to `/login?next=...`.
- `/login` already uses Supabase email OTP. The existing form remains the real path; a clearly
  labelled local-only test button exists only when the explicit E2E flag is enabled.
- A missing API base URL fails with a safe configuration message; no owner IDs are accepted from the
  browser.

### Host management

- `/hosts` lists owner-scoped hosts with status, endpoint, last agent presence and links.
- `/hosts/new` creates a host with a generated idempotency key and redirects to detail.
- `/hosts/[hostId]` displays metadata, DNS challenge creation, TXT record/value/expiry and copy
  controls, "Verify DNS", enrollment-code issuance with one-time/10-minute warning and install
  instructions, source-key status, key revocation and terminal host archival.
- Actions reload real API data; 404/non-owned hosts show a not-found state. No host status is
  fabricated.

### Incident lifecycle and timeline

- `/incidents` lists owner-scoped sessions with status, host, capture window, event count and sealed
  assessment.
- `/incidents/new` selects an active host, validates 2–240 minute duration, title and optional opaque
  workload reference, and creates a session with an idempotency key. Demo mode appears only when the
  demo feature flag is enabled.
- `/incidents/[incidentId]` polls the API every five seconds and displays status, source health,
  renter invitation with one-use/expiry warning and copy controls, host/renter/probe observations,
  lifecycle actions, assessment wording and a deterministic latest-50-event timeline.
- End and seal actions require explicit confirmation; seal errors (active probe lease, no evidence,
  wrong state) are shown safely. Sealed bundles download with the API filename; cancelled sessions
  show no bundle.
- `UNKNOWN` assessment is rendered explicitly as insufficient evidence, not a healthy result. Stale
  source timestamps are labelled stale; missing renter/probe observations remain gaps.

### Local browser verifier (`/verify`)

- Standard `<input type="file">`; maximum 10 MiB; JSON parse and unsupported-version errors are shown.
- Uses `@incident-witness/protocol/browser` and `@noble/ed25519` through the browser export.
- Verifies bundle/protocol schema versions, canonical manifest digest, pinned platform key/signature,
  source certificate fingerprints/signatures/scopes, event signatures/digests, sequence uniqueness,
  deterministic ordering and bundle consistency.
- Reports PASS/FAIL/SKIP checks, assessment code/grade, simulation label and the limitation statement.
- The file is read with the browser File API and never sent to the API or any other server. The
  Playwright test asserts no API request is made while verifying.

### States and accessibility

- Every data-backed page has loading, empty, error/retry, not-found and action-error states as
  applicable.
- Status is always conveyed by text as well as border/colour; forms use labels, buttons expose busy
  states, copy actions announce success/failure, and tables are horizontally scrollable with text
  cells. Temporary structural styling remains; no final visual design was started.

### Phase 4 test evidence

- Full-stack Playwright: 42 checks, 41 passed and one intentional mobile skip (provider lifecycle is
  covered on desktop; mobile route/verifier checks run independently). The flow covers test login →
  create host → mocked DNS verification → enrollment code → active host → demo incident → renter
  invitation/enrollment → synthetic events → end → seal → download → API bundle response.
- Browser verifier: valid bundle passes all checks; one-byte tampered bundle fails manifest digest and
  platform signature; no API request is made during verification.
- Unit suite: 164 tests pass (20 protocol, 11 CLI verifier, 15 correlator, 14 ADR-001, 49 host-agent,
  14 renter SDK, 20 probe-worker, 21 API including four E2E runtime guard tests).
- `npm run lint`, `npm run typecheck` and `npm run build` pass across the monorepo.
- E2E uses test-only `IW_E2E_*`/`NEXT_PUBLIC_IW_E2E_*` seams: a static test JWT, a file-backed DNS
  resolver and an always-OK endpoint checker. The API seam is disabled unless `NODE_ENV=test` and the
  explicit flag are both set; the web seam is disabled in production. These are test infrastructure,
  not production authentication or SSRF bypasses.

## Completed in Phase 5 (MVP hardening and E2E gate; accepted and closed 2026-10-31)

### Render Infrastructure as Code

- Added root `render.yaml` exactly for the `incident-witness-api` Web Service with the requested
  build command, `node apps/api/dist/index.js` start command and `PORT=10000`.
- Added root `tsup` and `typescript` devDependencies so `npm ci --include=dev` installs build tools.
- Added `apps/api/src/index.ts` as a thin deployment entrypoint importing the existing
  `server.js`; the existing `node dist/server.js` path remains valid.
- API readiness now expects migration `0022_phase5_worker_ended_at_grant`.

### Adversarial review findings and fixes

1. **P1 — Render start command targeted a missing file.** `render.yaml` referenced
   `apps/api/dist/index.js`, while the API only built `dist/server.js`. Fixed with the thin
   `index.ts` entrypoint; build verified `apps/api/dist/index.js` exists and starts the server.
2. **P1 — Platform-probe incidents could not be sealed.** Provider/system RLS could not read the
   `platform_probe` key/certificate, so incidents containing probe observations failed with
   “An event has no source key.” Fixed with migration
   `0020_phase5_platform_probe_seal_access.sql` and corrected in
   `0021_phase5_fix_probe_seal_policy.sql` to avoid recursive RLS. Platform probe public keys and
   certificates are public bundle material; no private key is exposed.
3. **P1 — Event sequence rollback was accepted.** The API checked only uniqueness, so a source could
   submit sequence 5 and then a new sequence 4. Fixed by comparing against the maximum accepted
   sequence for the source key under the incident lock; lower sequences now return
   `EVENT_SEQUENCE_ROLLBACK` (409), while exact duplicate retries remain idempotent.
4. **P1 — Probe worker could append after manual end.** The worker checked only scheduled
   `capture_ends_at` and allowed `awaiting_finalize`, so an in-flight observation could be appended
   after the provider manually ended the session. Fixed to require `collecting` and compare against
   the effective end (`min(ended_at, capture_ends_at)`) plus the ingestion deadline. Added worker
   `SELECT (ended_at)` grant in migration `0022`.
5. **P1 — Stale polling looked current.** The incident detail page used render time for “Last
   refreshed” and hid polling errors when data already existed. Fixed by tracking the last successful
   fetch and showing a “Showing stale data” alert with retry.
6. **P1 — UPS/GPU unavailable telemetry was not visible in the UI.** The summarized timeline omitted
   event payloads. Fixed by returning the owner-visible payload in the incident timeline and rendering
   explicit `UNAVAILABLE` / `PARTIAL` labels for UPS/GPU collection status.
7. **P1 — API readiness was pinned to an old migration.** `/health/ready` expected
   `0019_phase3e_worker_counter_select`; after Phase 5 migrations it would return 503 even with a
   correct schema. Fixed to expect `0022` and added an integration readiness test.
8. **P1 — The timeline returned the oldest 50 events.** Source-health probe status and the UI could
   become stale once an incident exceeded 50 events, because the API returned the first page of the
   oldest events. Fixed to return the latest 50 in ascending deterministic order and label the UI
   accordingly.
9. **P2 — Worker retry/dead transitions do not check lease ownership.** A stale worker can mutate job
   bookkeeping after lease expiry; deterministic event IDs still prevent duplicate evidence. Recorded
   as a remaining P2; retry semantics were not changed in this pass.

### Edge-case verification

- Host agent collectors already emit `collection_status: "unavailable"` for GPU failure and
  `state: "unavailable"` for UPS failure; the API timeline now exposes those payload fields and the
  Playwright journey asserts `UNAVAILABLE` is rendered.
- Correlator tests cover no observations (`UNKNOWN`/`INSUFFICIENT`), only a heartbeat (`UNKNOWN`),
  UPS `online` alone, UPS `unavailable`, a later heartbeat contradicting a power transition, probe
  infrastructure errors and unsupported rule versions.
- Incident detail polling failure is covered by Playwright with an aborted detail request; the page
  shows “Showing stale data”, states that source status may be out of date, and clears the alert after
  a successful retry.
- Platform probe sealing and timeline payloads are covered by API integration tests; the bundle
  verifies with the platform public key and source event signature.
- API readiness is covered against migration ledger `0022`.
- Existing IDOR, 4,000-event budget, 7 MiB budget, duplicate/sequence, seal-vs-ingest, SSRF and
  DNS-rebinding regression tests remain green.

### Phase 5 test evidence

- `npm run test:integration --workspace @incident-witness/api` — **PASS**: 60/60.
- `npm run test:integration --workspace @incident-witness/probe-worker` — **PASS**: 2/2.
- `npm test` — **PASS**: 164/164 unit tests.
- `npm run test:e2e` — **PASS**: 44 Playwright checks, 43 passed and one intentional mobile
  provider-flow skip. The desktop journey covers host/DNS/enrollment, demo incident, renter
  invitation, synthetic events including `gpu_telemetry` unavailable, end/seal/download, stale
  polling warning/retry and the local verifier valid/tampered checks.
- `npm run demo` — **PASS**: valid bundle exit 0 and one-byte tampered bundle exit 1; assessment
  `POWER_RELATED`/`LOW`, `simulation_present=true`.
- `npm run lint`, `npm run typecheck` and `npm run build` — **PASS** across the monorepo.
- Migration `0020`–`0022` applied to staging; API readiness expected migration updated to `0022`.

## Visible behaviour vs placeholders

**Functional locally (staging API or local mock):**

- All Phase 3B host/incident/enrollment/renter/key/archive routes.
- Signed host and renter event ingestion with canonical-byte rejection, signature verification, time-window checks and atomic budgets.
- Deterministic correlation and evidence grades.
- Full seal → bundle download → protocol signature/certificate/event verification.
- Seal vs ingest serialization and post-seal rejection.
- Sweeper auto-seal and `NO_EVIDENCE` cancellation.
- Demo-session labelling and grade cap.
- Owner isolation for bundles and incidents.
- Host-agent enrollment, owner-only key/credential storage, signed operational presence, evidence spooling, fixed GPU/UPS collectors and upload/retry against a local mock of the documented API. Signed events verify against the generated public key.
- Renter SDK one-use enrollment, scoped signed heartbeats/endpoint results, 5 MiB queue recovery, deadline/`INCIDENT_CLOSED` handling and endpoint state-change emission against a local mock API.
- Probe worker SSRF/DNS-rebinding unit tests, signed `platform_probe_result` events, lease-expiry recovery/retry/dead-letter, effective-capture-end enforcement and a real staging `iw_worker` integration test for claim, event insert, counter update and next-job scheduling.
- Offline `iw-verify` CLI validation of valid, modified, unknown-key and unsupported-version bundles with stable exit codes, plus CLI/browser manifest-verifier parity fixtures.
- Synthetic end-to-end demo harness against staging: provider/host/agent/renter enrollment, labelled power-pattern events, end, seal, download, CLI pass and one-byte tamper failure.
- Authenticated provider web workspace with real host, session, source, timeline and bundle data; host DNS/enrollment/key/archive controls; incident invitation/end/seal/download controls; local browser bundle verification; stale-polling warning and UPS/GPU unavailable labels.
- Platform-probe source certificates are included in provider and system seal transactions; lower event sequences are rejected; readiness checks migration `0022`; `render.yaml` defines the API service.

**Placeholder or unverified:**

- Real Supabase email OTP delivery and session refresh have not been exercised by the automated provider journey. Playwright uses a clearly gated local test session and static test JWT; production uses the existing Supabase OTP path.
- The browser `/verify` page is functional, but its pinned platform key set currently contains the staging public key only. Production key rotation and a separately operated trust set are not exercised.
- The renter SDK has not submitted to a live staging incident; its end-to-end tests use a local mock API. The provider endpoint hostname is not returned by the enrollment API and must be supplied explicitly by the integration context.
- The demo harness uses a locally constructed API instance and a disposable auth/profile row seeded through the migrator; it does not exercise a deployed Render API.
- The CLI default pinned trust set contains the staging platform public key only. A separately operated production trust set and key-rotation procedure are not yet exercised.
- No platform-probe key is configured in the current `.env` and no `platform_probe` row exists in staging; a live worker cannot start until `npm run db:provision-probe-key` is run with operator-provided secrets.
- The probe worker has not run against a real public provider endpoint and is not deployed to Render. SSRF/DNS-rebinding behavior is proven with injected resolvers/transports; the real network path is unverified.
- The Phase 3D agent has not enrolled a real disposable host or reached a live staging incident. Its end-to-end test uses a local HTTP mock; real `nvidia-smi` and `upsc` execution is not run in CI.
- No real platform-probe observations or worker leases are produced in normal staging operation; probe-lease behavior is tested with disposable seeded rows.
- `render.yaml` exists, but the operator still has to link it and configure server-only environment variables. No API Render deployment has been verified from this environment.
- Source-certificate verification uses the current configured platform key. Platform-key rotation with old source certificates is not yet exercised.

## Tests and evidence

Run on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm run lint` — **PASS** across protocol, CLI verifier, demo harness, host-agent, renter SDK, correlator, db, probe worker, API and web.
- `npm run typecheck` — **PASS** across protocol, CLI verifier, demo harness, host-agent, renter SDK, correlator, db, probe worker, API and web.
- `npm run build` — **PASS**: protocol ESM/CJS/declarations, CLI verifier, host-agent CLI, renter SDK, correlator, DB, probe worker, Fastify API and Next.js 16.4.3.
- `npm test` — **PASS**: 20/20 protocol, 11/11 CLI verifier, 15/15 correlator, 14/14 ADR-001 staging, 49/49 host-agent, 14/14 renter SDK, 20/20 probe worker and 21/21 API unit tests (164 total).
- `npm run test:demo` — **PASS**: 2/2 staging demo-harness integration tests.
- `npm run demo` — **PASS**: sealed a `POWER_RELATED`/`LOW` fully simulated bundle; `iw-verify` exit 0 for the original and exit 1 after a one-byte tamper.
- `npm test --workspace @incident-witness/cli-verifier` — **PASS**: 11/11.
- `npm test --workspace @incident-witness/host-agent` — **PASS**: 49/49.
- `npm test --workspace @incident-witness/renter-sdk` — **PASS**: 14/14.
- `npm test --workspace @incident-witness/probe-worker` — **PASS**: 20/20.
- `npm run test:integration --workspace @incident-witness/api` — **PASS**: 60/60 (Phase 5 re-run).
- `npm run test:integration --workspace @incident-witness/probe-worker` — **PASS**: 2/2 staging `iw_worker` lease/insert/counter/schedule and effective-capture-end tests.
- `npm run test:e2e` — **PASS**: 44 Playwright checks, 43 passed and one intentional mobile provider-flow skip. The desktop journey covers test login → host creation/DNS → enrollment → demo incident → renter invitation/events (including `gpu_telemetry: unavailable`) → end/seal/download → stale-poll warning/retry; verifier tests run on desktop and mobile.
- `npm run db:provision-probe-key -- --generate --out <temp>` — **PASS** against staging with a disposable random key ID: file mode `0600`, `platform_probe` row active, row and file removed afterwards.
- `node tools/iw-verify/dist/cli.js --version` and `node_modules/.bin/iw-verify --version` — **PASS**.
- `npm audit --omit=dev` — **PASS**: 0 production vulnerabilities. 20 moderate development-only advisories remain.
- Real staging/disposable-host enrollment, real `nvidia-smi`/`upsc`, and a live public probe target — **NOT RUN**: no accessible disposable host, probe key, or approved target; CI uses injected collectors/resolvers/transports and a local mock API.

### Phase 3E renter SDK and worker coverage

- One-use invitation redemption, certificate/source/incident mismatch rejection, owner-only state files and no stored invitation token.
- Scoped signed heartbeat/endpoint events; queue cap and dropped-event reporting; persisted queue/sequence recovery across restart; capture-window and ingestion-deadline behavior; `INCIDENT_CLOSED` halt; endpoint state-change and 60-second emission.
- IPv4/IPv6 blocked range classification including loopback, private, CGNAT, link-local/metadata, documentation, benchmark, multicast, reserved, ULA, IPv4-mapped IPv6, NAT64, 6to4 and Teredo.
- Mixed public/private DNS answers fail closed. All private/special answers are rejected before any transport connection.
- DNS rebinding: resolver called once, transport receives the validated IP, hostname retained only for SNI/Host.
- Redirects not followed; timeout/TLS/body-cap mapping; proxy env variables ignored; exact health contract required.
- Worker lease expiry/crash recovery, retry/dead-letter, cancellation for inactive incidents, signed probe events and a real `iw_worker` staging insert with counter and next-job scheduling.
- Correlator regression: `probe_status: error` does not produce `EXTERNAL_REACHABILITY_LOSS`.

### Phase 3F CLI and demo coverage

- Valid signed bundle passes all checks and exits 0.
- Modified manifest fails the manifest digest and platform signature; modified event signature fails
  event-signature verification while the event digest remains valid; unknown platform key ID fails
  the pinned-key check; unsupported bundle/protocol version fails schema/version checks; reversed
  event order fails deterministic ordering.
- Missing file and unparseable JSON exit 2; invalid but parseable bundles exit 1.
- Browser manifest verifier and CLI agree on the same valid and tampered fixtures.
- Demo harness seals exactly four fully simulated events (`simulation_mode: true`) with
  `simulation_present: true`, `POWER_RELATED`/`LOW`, then passes `iw-verify`; a one-byte `host_alias`
  change produces exit 1 and manifest digest/signature failures.

### Phase 4 web integration coverage

- Typed API client uses the Supabase bearer session and handles 401/403 with one refresh/retry then
  login redirect; test-only API auth is gated by `NODE_ENV=test` plus an explicit flag and is covered
  by four guard tests.
- Host list/create/detail, DNS challenge and verification, enrollment code, source-key revocation and
  host archival load real API data and show empty/error/not-found/action states.
- Incident list/create/detail, renter invitation, source health, five-second polling, deterministic
  latest-50-event timeline, end/seal/download and UNKNOWN assessment rendering.
- Local browser verifier uses the protocol browser export, reports check-by-check PASS/FAIL, rejects
  tampered bundles and makes no API request with the bundle.
- Playwright provider flow is full-stack against a local test-mode API and the staging database, with
  a file-backed DNS mock. The mobile provider journey is intentionally skipped; mobile public routes,
  auth redirects, navigation and verifier checks still run.

### Phase 3D host-agent coverage

- Spool persistence across restart; durable event and presence sequence allocation without reuse after a simulated crash.
- 50 MiB quota drop order: oldest non-critical observations dropped first; critical transitions preserved; critical-only overflow rejected.
- WAL mode, `0600` spool file mode, integrity-check failure on corrupt input, blocked-incident skipping.
- Presence signature verification with the domain separator; independent sequences; restart continuity; sequence consumption on network failure; halt on credential rejection.
- Enrollment request shape, local key/credential/config file permissions, certificate mismatch rejection, server rejection mapping and no-overwrite protection.
- Fixed collector invocation with exact `nvidia-smi`/`upsc` arguments, timeout and output caps; malformed and unavailable output; alias injection rejection; static check that `exec.ts` uses `execFile` with `shell: false` and no `exec(`.
- Retry on network/429/5xx with jittered exponential backoff; no retry on 4xx; halt on revoked credentials; `INCIDENT_CLOSED` blocks only that incident.
- Agent signs heartbeats, GPU and UPS events; uploaded envelopes verify with the generated public key; graceful stop emits a stopped status; status output contains no secret material.
- Local HTTP mock workflow: interactive-equivalent enrollment, presence anti-replay, canonical signed event upload, 503 outage retained in spool and resumed without duplicate sequence.

### Phase 3C integration coverage

- Valid host event accepted; incident counters updated; operational presence unchanged.
- Exact duplicate returns prior receipt and does not append twice.
- Same event ID/different bytes and sequence reuse return 409.
- Invalid Ed25519 signature rejected.
- Noncanonical raw bytes and duplicate JSON properties rejected.
- Observation before capture start, after capture end, after early `endedAt`, and more than five minutes in the future rejected.
- 4,000-event budget concurrency: exactly one of two simultaneous events accepted.
- 7 MiB aggregate byte budget concurrency: exactly one of two simultaneous events accepted.
- Renter event accepted; cross-incident renter use rejected.
- Simulated event in a live incident rejected.
- Wrong content type returns 415; oversized request returns 413.
- Full seal with host+renter evidence produces `POWER_RELATED`/`MEDIUM`; downloaded bundle passes `verifyBundleManifest`, source-certificate verification, event-signature verification and event-digest checks.
- Bundle download is owner-only; another owner receives 404.
- Seal rejects active probe lease and zero accepted events.
- Seal vs event ingestion: seal always succeeds; event is either accepted and included or rejected with 409; no event accepted after seal.
- Sweeper auto-seals with evidence and auto-cancels with `NO_EVIDENCE`.
- Demo session is labelled, `simulation_present=true` and capped at `LOW`.
- Correlator unit tests cover `UNKNOWN`/insufficient, power pattern, external reachability, exit pattern, simulation cap, missing sources, gaps, determinism and unsupported rule version.

## Database and migration status

- **Staging database:** Supabase Postgres 17.11.
- **Migration ledger:** `iw_schema_migrations`.
- **Applied migrations:** `0001_phase2_schema` through `0022_phase5_worker_ended_at_grant`.
- **Roles:** `iw_api` and `iw_worker` are login roles with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`.
- **Schema decision:** `public.iw_uid()` security-definer wrapper remains approved and in use.
- **Platform key:** `iw-platform-staging-1` registered in `platform_signing_keys`; private key only in ignored `.env`.
- **Platform probe key:** **not provisioned**: no `IW_PLATFORM_PROBE_KEY_ID`/private key in `.env` and no `platform_probe` row in staging. `npm run db:provision-probe-key` now supports `--generate --out <file>`; provisioning remains the operator prerequisite for a live worker.
- **Phase 3E schema:** no table or column changes; migrations `0018`–`0019` add grants/RLS only.
- **Phase 3F schema:** no migrations or table/column changes.
- **Phase 4 schema:** no migrations, table/column or API contract changes. Only the test-only API runtime seam was added, guarded by `NODE_ENV=test` and `IW_E2E_TEST_AUTH=true`.
- **Phase 5 schema:** migrations `0020`–`0022` add RLS/grants only; no table or column definitions change. The incident-detail timeline response now includes the owner-visible event `payload` and `simulationMode` fields. API readiness expects `0022`.

## Phase 6 revision 0.3 mockups (approved 2026-10-31)

- The operator rejected the 0.1 hybrid mockups and supplied two WebP references in `docs/design-references/`. The reference-driven direction is approved.
- Revision 0.3 uses locally bundled **Satoshi** WOFF2 files, with Inter only as a fallback. Font attribution/license is recorded in `docs/mockups/assets/fonts/FONT_LICENSE.md`.
- Buttons, inputs, chips, session cards, stat tiles, evidence panels and state cards use sharp **4px** corners (chips 3px). The app window keeps a 16px frame radius; the verifier window is 10px and the preview frame 8px.
- The primary emerald is `#26D18C`; the action gradient ends at `#16845E`. Surfaces retain subtle green/blue-tinted charcoal values rather than pure black.
- Requested screens are covered in desktop and mobile: public home, authenticated dashboard, incident timeline and local verifier. The mockup index links the full set.
- Reference analysis, translation, intentional deviations and the five translation choices are recorded in `docs/DESIGN_DECISIONS.md`.
- **Operator approval:** explicit **"I approve these mockups."** on 2026-10-31. Phase 7 is authorized for visual implementation only.

## Completed in Phase 7 (COMPLETE AND CLOSED 2026-10-31)

- Copied the approved Satoshi WOFF2 files to `apps/web/public/fonts/` with attribution/license, and loaded them globally through `@font-face` in `apps/web/app/globals.css`.
- Added Tailwind v4 theme tokens for the emerald palette (`#26D18C`), tinted charcoal surfaces, typography, 4px card/control radii and 3px chips.
- Reworked the public shell, workspace shell, navigation, footer, buttons, chips, notices, forms, tables and verifier into the approved floating glass command-center aesthetic.
- Added the desktop icon rail and workspace navigation pane; mobile uses a top bar with a toggle menu and stacked cards.
- Restyled all existing routes: `/`, `/login`, `/dashboard`, `/hosts`, `/hosts/new`, `/hosts/[hostId]`, `/incidents`, `/incidents/new`, `/incidents/[incidentId]`, `/settings`, `/verify`, `/docs`, `/privacy`, `/terms`, `error`, `loading` and `not-found`.
- Timeline now distinguishes Host agent (emerald), Renter client (blue) and platform-operated probe (cyan), with mono event types, UTC times and sequence numbers.
- No business logic, API contract, database schema, evidence wording or verifier behaviour changed.
- Phase 7 implementation deviations are recorded in `docs/DESIGN_DECISIONS.md`.
- Test evidence: `npm run test:e2e` — **PASS**, 44 checks, 43 passed and one intentional mobile provider-flow skip; `npm run lint` — **PASS** across all workspaces; `npm run typecheck` — **PASS** across all workspaces; `npm run build` — **PASS** across the monorepo.
- Preview/deployment verification: a Vercel Preview deployment is READY at the URL below. One successful browser load of the deployed `/` returned HTTP 200, loaded Satoshi, applied the 4px button geometry and reported no overflow or console errors. Subsequent automated requests to the Preview were met by Vercel's security checkpoint (`HTTP 403`, `x-vercel-mitigated: challenge`), so repeated automated browser checks are blocked at the edge. Local build and E2E verification cover the same code.

## Phase 7 deployment checkpoint

- **Vercel Preview URL:** https://incident-witness-jf4ijpod8-uhhh2.vercel.app
- **Preview deployment ID:** `dpl_ELyy5qehHQ91kaUTxG1rUnKVCGki`
- **Preview target/status:** `preview`; `READY`; built from repository commit `0b99c8d`.
- **Vercel Production deployment (auto-created by the Git-connected project on push):** https://incident-witness-hzg263jb4-uhhh2.vercel.app
- **Production deployment ID:** `dpl_Xd1ZXAnHGX9H5JgCgbHybGVekMvX`
- **Production target/status:** `production`; `READY`; built from repository commit `0b99c8d`.
- **Stable aliases:** https://incident-witness.vercel.app, https://incident-witness-uhhh2.vercel.app and https://incident-witness-git-main-uhhh2.vercel.app.
- **Preview verification result:** one browser load of `/` returned HTTP 200, `document.fonts.check("16px Satoshi")` was true, the first action button computed to a 4px radius, and there was no horizontal overflow or console error. The Preview subsequently returned Vercel's security checkpoint to automated requests; this is an edge challenge, not an application authentication failure.
- **Safe staging:** the Preview uses the existing staging Supabase configuration; no production database, platform private signing key, host credential or renter credential is exposed. The local browser verifier remains local-only.
- **Production note:** no separate `vercel deploy --prod` was run. The Git-connected project auto-created the production deployment from the authorized push. Production release approval remains a separate operator decision under the project rules.

## Critical auth fix — magic-link session loss (2026-10-31)

### Bug

After clicking a Supabase magic link, `/auth/callback` completed but redirected to `/dashboard`, which immediately bounced to `/login`. The session cookie was not present on the redirect.

### Root cause

`apps/web/app/auth/callback/route.ts` created the Supabase client through `createSupabaseServerClient()`, which writes cookies to the `next/headers` store, then returned a **separate** `NextResponse.redirect("/dashboard")`. The `Set-Cookie` headers produced by `exchangeCodeForSession` were not attached to the response actually returned to the browser.

The independent hardening gap was that no Supabase client passed explicit cookie options, so the library defaulted to `path: "/"` and `sameSite: "lax"` but did not set `secure` in production.

### Fix applied

- Added `createSupabaseRouteHandlerClient(response)` in `apps/web/lib/supabase/server.ts`. Its `setAll` writes every Supabase cookie directly to `response.cookies`.
- The callback route now builds the redirect response first, exchanges the code, and returns that same response.
- Added `getSupabaseCookieOptions()` and applied it to the route-handler, server, browser and proxy clients: `path: "/"`, `sameSite: "lax"`, `secure: NODE_ENV === "production"`.
- The callback resolves the redirect origin from `x-forwarded-host` / `Host`, so local development does not set the cookie on one host and redirect to another.
- `apps/web/proxy.ts` already called `supabase.auth.getUser()` for `/dashboard`, `/hosts`, `/incidents` and `/settings` and refreshed cookies onto the response; it now also uses the explicit cookie options. Its matcher remains scoped to protected paths.
- `apps/web/components/auth-guard.tsx` remains a server component using `supabase.auth.getUser()`; there is no client-side session race.
- `@supabase/ssr` remains pinned at `0.12.7`.

### Test coverage

- New `apps/web/tests/e2e/auth-session.spec.ts`:
  - simulates a successful callback through a test-only `code=e2e-magic-link` seam guarded by `IW_E2E_TEST_AUTH` and non-production `NODE_ENV`;
  - asserts the session cookie exists with `path=/` and `SameSite=Lax`;
  - verifies `/dashboard` and `/hosts` do not redirect;
  - reloads `/dashboard` to prove the session survives a refresh;
  - verifies the proxy redirects to `/login?next=/dashboard` without a cookie and returns the dashboard with a test-injected cookie;
  - asserts production cookie options are path-scoped, lax and secure.
- Full E2E: **50 tests, 49 passed, 1 intentional mobile provider-flow skip**.
- API integration: **60/60 passed**.
- Web lint, typecheck and production build: **PASS**.

### Manual verification

- Direct callback request returned `307` with `Set-Cookie: iw_e2e_session=…; Path=/; SameSite=lax` and `Location: http://127.0.0.1:3300/dashboard`.
- `/dashboard` and `/hosts` returned `200` with that cookie, and the rendered HTML contained “Provider dashboard” and “Your hosts”.
- The E2E journey also reloads `/dashboard` and confirms the session persists.
- A real Supabase email magic link still requires an operator-side inbox click; the local automated seam cannot consume the real email. No Supabase project or redirect configuration was changed.

### Auth fix deployment

- **Preview URL:** https://incident-witness-beilbx6an-uhhh2.vercel.app
- **Preview deployment ID:** `dpl_EDohrce3YDTRSyLqyfTWiXAYKEq1`
- **Preview status/target:** `READY`; `preview`
- **Deployed code SHA:** `75dab4e`
- The deployed `/login` returned HTTP 200 with the approved UI, and `/auth/callback` without a code returned the expected `307` to `/login?error=invalid_link`. The test-only callback seam is disabled in the production build.
- A real magic-link inbox click on this Preview remains the operator-side confirmation step.

**Phase 7 visual verification was blocked by this auth bug until the fixes below were verified; Phase 8 was subsequently authorized after Phase 7 acceptance.**

## Protected-route API-call race fix (2026-10-31)

### Bug

When unauthenticated or after the session disappeared, protected routes could briefly render, issue API requests and then redirect to `/login`. The API could return “authentication token is invalid” and that raw message could flash before navigation.

### Diagnosis

- `apps/web/app/(dashboard)/layout.tsx` wrapped `AppShell` in an async server `AuthGuard`, and `AuthGuard` correctly called `supabase.auth.getUser()` and `redirect("/login")`. It was **not** a client component and there was no client-side auth check racing the server.
- `apps/web/proxy.ts` already intercepted `/dashboard`, `/hosts`, `/incidents` and `/settings` and redirected before rendering. Direct unauthenticated requests were already guarded.
- The remaining race occurred when a protected client view was already mounted or reused from the Next client router cache after the session was removed. Those client hooks could still fire while navigation was in progress.
- `apps/web/lib/api/client.ts` pre-fix lines 122–140 handled a 401/403 by calling `redirectToLogin()` and then returning the response. `apiRequest` parsed the API envelope and `useApiResource` rendered the raw message before the hard redirect completed.
- `accessToken()` did not preemptively refresh a session close to expiry, so a stale token could reach the API.
- `sign-out-button.tsx` used client router navigation, which could leave protected RSC entries in the client cache.

### Fix

- Replaced the nested `AuthGuard` render wrapper with `requireAuthenticatedUser()`, awaited directly in `(dashboard)/layout.tsx` before `AppShell` is returned. Added `export const dynamic = "force-dynamic"`.
- The API client now:
  - redirects immediately when there is no session;
  - refreshes tokens within 30 seconds of expiry before sending;
  - treats a final 401/403 as `AUTH_REQUIRED`, redirects and throws a sanitized error instead of returning the raw API response;
  - uses a single `window.location.replace` redirect guard.
- `useApiResource` suppresses `AUTH_REQUIRED` errors while the browser is navigating to login, so the raw API message is never rendered.
- Sign-out now performs a full navigation to `/`, clearing the client router cache.
- `proxy.ts` remains unchanged as the edge guard for direct protected requests.

### Test coverage

- E2E `npm run test:e2e` — **PASS**: 52 checks, 51 passed and one intentional mobile provider-flow skip.
- The proxy test now asserts that `/dashboard` and `/hosts` without a cookie redirect to `/login?next=…`, make **zero** requests to the API base URL, and never show “authentication token is invalid”.
- A new API-401 test forces a 401 response and verifies the browser redirects to `/login?next=%2Fdashboard` without rendering the raw API message.
- Magic-link callback cookie persistence, refresh survival and proxy behavior remain covered.
- `npm run lint --workspace @incident-witness/web` — **PASS**.
- `npm run typecheck --workspace @incident-witness/web` — **PASS**.
- `npm run build --workspace @incident-witness/web` — **PASS**.

### Manual verification

- Built app without a session:
  - `/dashboard` → `307` `location: /login?next=%2Fdashboard`
  - `/hosts` → `307` `location: /login?next=%2Fhosts`
  - `/incidents` → `307` `location: /login?next=%2Fincidents`
  - `/settings` → `307` `location: /login?next=%2Fsettings`
- No client bundle or API request is served for those redirects.
- No `/workspace` route exists in the current app; `/dashboard` is the provider workspace entry.

### Protected-route fix deployment

- **Preview URL:** https://incident-witness-68k5j4fss-uhhh2.vercel.app
- **Preview deployment ID:** `dpl_HZQTzsG1N1d2ypsDBo8c6QCnCx9m`
- **Preview status/target:** `READY`; `preview`
- **Deployed code SHA:** `82c2adc`
- `/dashboard` and `/hosts` without a session returned `307` to `/login?next=…` at the edge; `/login` returned `200`.
- No client API request can be made from these redirect responses because the protected route HTML is never served.

**Phase 8 implementation status (2026-10-31):** Frontend and documentation completeness is implemented, test-verified, deployed and accepted. Phase 8 is **COMPLETE AND CLOSED**. No business logic, API contract, database schema or cryptographic protocol changed.

## Completed in Phase 8 (COMPLETE AND CLOSED 2026-10-31)

### In-app documentation

- Rebuilt `/docs` as a real documentation destination with a section index and substantive sections for:
  - overview and provider quick start;
  - host-agent build, enrollment, run and storage behaviour;
  - renter SDK build, TypeScript integration, invitation and queue rules;
  - signed event envelope, certificates, manifest, offline browser/CLI verification, exit codes and `iw-rules-v1` assessments;
  - limitations of signatures, sources, missing observations, bounded capture and staging status;
  - reference links to the repository documents.
- Commands and limits match `docs/HOST_AGENT.md`, `docs/RENTER_SDK.md` and `docs/PROTOCOL.md`. No fabricated package names, installers, hosted API URLs or production claims were added.
- Updated stale document status lines for the host agent, renter SDK, probe worker, user guide, design decisions, configuration, deployment and operations.
- Replaced the stale `docs/README.md` blueprint note with a maintained documentation index and in-app documentation consistency rules.

### Legal and footer links

- `/privacy` and `/terms` remain real, reachable routes and now carry clearer staging data boundaries. Both state explicitly that legal review is pending and that the pages are not a policy, contract or service-level commitment.
- The footer links to `/docs`, `/privacy`, `/terms`, `/verify` and the confirmed public GitHub repository. The GitHub link has an accessible “opens in a new tab” label.
- The 404 page now links to home, documentation and the verifier. The route error page links to home and documentation and remains actionable through “Try again”.

### Metadata and SEO

- Root metadata now includes `metadataBase`, a title template, description, OpenGraph website metadata, Twitter summary card metadata and an application name.
- Added page-specific titles/descriptions and canonical paths for `/`, `/docs`, `/verify`, `/privacy`, `/terms` and every provider route.
- Added `app/icon.svg` as the favicon and a generated 1200×630 `opengraph-image` using the approved emerald/charcoal design language.
- Added `robots.ts` and `sitemap.ts`. The sitemap contains only public routes. `robots.txt` disallows `/dashboard`, `/hosts`, `/incidents`, `/settings`, `/login` and `/auth/`.
- The authenticated layout and `/login` emit `noindex, nofollow`. The 404 route emits the framework's `noindex` tag only (the conflicting root `index, follow` tag was removed).
- Removed duplicate document `<title>` tags from the 404 and route-error components; both routes use the single root title, and the 404 keeps the framework's automatic `noindex`.

### Accessibility and completeness

- The skip link now focuses the `<main id="main-content" tabIndex={-1}>` landmark; this is covered by a keyboard test that checks the visible focus outline.
- Public pages expose one `h1`; the docs section navigation is labelled; code blocks are keyboard-scrollable with accessible labels.
- Every visible link, button and form control on public routes has an accessible name; status chips and indicators retain text labels rather than relying on colour.
- Added a Playwright crawl that checks every internal link on public routes, every same-page anchor target, and the absence of `href="#"`.
- Verified responsive behaviour at desktop and mobile widths, including removing a mobile horizontal overflow caused by documentation code blocks.

### Phase 8 test evidence

- `npm run lint` — **PASS** across all workspaces.
- `npm run typecheck` — **PASS** across all workspaces.
- `npm run build` — **PASS** across the monorepo, including the Next.js 16.4.3 production build.
- `npm test` — **PASS**: 164 unit tests.
- `npm run test:integration --workspace @incident-witness/api` — **PASS**: 60/60 against staging.
- `npm run test:integration --workspace @incident-witness/probe-worker` — **PASS**: 2/2 against staging.
- `npm run test:e2e` — **PASS**: 76 Playwright checks, 75 passed and one intentional mobile provider-flow skip.
- `npm run demo` / `npm run test:demo` — **NOT RE-RUN** for this frontend/documentation-only phase; the last recorded result remains the Phase 5 pass.

## Phase 8 deployment checkpoint

- **Vercel Preview URL:** https://incident-witness-95smmy2oo-uhhh2.vercel.app
- **Preview deployment ID:** `dpl_Ggii7Uag1Mtaxrvtakw4YyaQvNq7`
- **Preview target/status:** `preview`; `READY`; no Deployment Protection.
- **Source code SHA:** `3122b3fe9d720982faf8f11f059e275203e8cb7c`, which includes Phase 8 commits `fb95f54`, `8440ce1`, `d2168de`, `78d0444` and the duplicate-title cleanup `3e08d2d`. Vercel Git metadata reports this SHA for the Preview.
- **Route checks on the current Preview:** `/`, `/docs`, `/privacy`, `/terms`, `/verify` and `/login` returned HTTP 200 and the deployed `/docs` HTML contains the Phase 8 sections. An earlier Preview built at `d2168de` also returned HTTP 200 for `/robots.txt`, `/sitemap.xml`, `/icon.svg` and `/opengraph-image`, and `307` to `/login?next=…` with `x-robots-tag: noindex` for `/dashboard`, `/hosts`, `/incidents` and `/settings`.
- **Content checks on the Preview:** the deployed `/docs` HTML contains the overview, host-agent, renter-SDK, protocol, limitations and reference sections plus the expected commands; the footer contains `/docs`, `/privacy`, `/terms`, `/verify` and the public GitHub repository link.
- **External link check:** https://github.com/onyebuchidaniel60/incident-witness and https://github.com/onyebuchidaniel60/incident-witness/blob/main/docs/HOST_AGENT.md returned HTTP 200.
- **Edge caveat:** repeated automated requests to unmatched or cached paths occasionally returned Vercel's Security Checkpoint (`HTTP 403`, `x-vercel-mitigated: challenge`) instead of the application response. The 404 title, links and noindex behaviour pass locally in Playwright; this is an edge challenge, not an application failure.
- **Git-connected Production deployment (auto-created by pushing `main`):** https://incident-witness-fqbgv60f1-uhhh2.vercel.app, deployment ID `dpl_9rdMekQvCtpx8bziWUYFFk8XZVWh`, target `production`, status `READY`, Git metadata commit `3122b3fe9d720982faf8f11f059e275203e8cb7c` on `main`. Stable alias https://incident-witness.vercel.app serves the Phase 8 `/docs` page (HTTP 200). No separate `vercel deploy --prod` command was run; the deployment was auto-created by the Git integration. Production release approval remains a separate Phase 9/operator decision.
- Subsequent docs-only handoff commits may auto-deploy without an application-code change.

## Temporary demo bypass removal (2026-10-31)

The temporary one-click demo sign-in bypass was removed before release at the operator's request. The route, home-page button, seed script, tests and environment-variable documentation are deleted. The standard Supabase magic-link flow is the only sign-in path.

## Phase 9 final regression and release readiness (COMPLETE AND GREEN 2026-10-31)

### Clean-install regression

- `npm ci` — **PASS** (549 packages; 20 moderate development-only advisories remain).
- `npm run lint` — **PASS** across all workspaces.
- `npm run typecheck` — **PASS** across all workspaces. An initial run encountered stale generated `.next/types` metadata referencing the deleted demo route; removing the generated `apps/web/.next` directory and re-running produced a clean pass. No source change was required.
- `npm run build` — **PASS** across the monorepo, including the Next.js 16.4.3 production build.
- `npm test` — **PASS**: 165 unit tests (20 protocol, 11 CLI verifier, 15 correlator, 14 ADR-001, 49 host-agent, 14 renter SDK, 20 probe worker, 22 API).
- `npm run test:integration --workspace @incident-witness/api` — **PASS**: 60/60 against staging. An intermediate full run had one transient lifecycle-sweeper assertion failure; the isolated test and the complete rerun both passed with no source change.
- `npm run test:integration --workspace @incident-witness/probe-worker` — **PASS**: 2/2 against staging.
- `npm run test:e2e` — **PASS**: 78 Playwright checks, 77 passed and one intentional mobile provider-flow skip.
- `npm run demo` — **PASS**: sealed `POWER_RELATED`/`LOW` bundle verified with exit 0; one-byte tampered copy failed with exit 1.

### Security and dependency audit

- `npm audit --omit=dev` — **PASS**: 0 production vulnerabilities. 20 moderate development-only advisories remain; no runtime fix is required for release.
- `git ls-files` secret-file scan — **PASS**: no `.env`, `.pem`, `.pk8` or `secrets/` files tracked.
- Tracked-content scan for private-key blocks and JWT/service-role literals — **PASS**: none found.
- Client-bundle scan — **PASS**: five sensitive environment values checked against 28 production static files; zero matches. The service-role variable name is absent from the client bundle.
- Pino API redaction initially covered nested fields and request headers but not root-level `authorization`, `cookie`, `token`, `password` and similar fields. During the Phase 9 audit this was fixed by centralizing the redaction paths in `apps/api/src/logging.ts` and adding root-level, nested and header paths for authorization, cookie, token, password, secret, credential, database URL, connection string, private key, access token, refresh token and API key. Re-test produced six `[REDACTED]` values and zero raw test secrets. A unit test asserts the required paths remain configured.
- Probe-worker logger redacts address/credential/hostname/IP/key/private/secret/token fields; host-agent redaction is covered by its passing test.
- The service-role key is no longer required by any application code or environment documentation.

### UI fixes

- The login-page magic-link implementation notice was removed. The form, callback and error handling remain.
- `proxy.ts` continues to intercept `/dashboard`, `/hosts`, `/incidents` and `/settings` before protected HTML is served. A new Playwright test clicks the public-header Workspace link while unauthenticated and asserts an immediate `/login?next=%2Fdashboard` result, no dashboard heading, no raw API error and zero API requests.

### Documentation and release notes

- Added `CHANGELOG.md` with MVP features, authentication change, removals, security controls and known limitations.
- README updated to the final release-candidate status, magic-link-only authentication and Phase 9 results.
- Temporary one-click demo sign-in route, button, seed script, tests, environment variables and documentation removed. A search for the former demo email, route, seed command and feature flags returns no matches outside ignored build artifacts.

### Phase 9 deployment checkpoint

- **Production web deployment:** https://incident-witness-6vu709fe7-uhhh2.vercel.app
- **Deployment target/status:** `production`; `READY`.
- **Deployed code SHA:** `ce46b4e5f2e2e777d1b9a23c3e09236573d5a56b` (`docs: add changelog and final phase 9 audit`), built from `main` after the code commits `e0566aa` and `ce46b4e`.
- **Stable aliases:** https://incident-witness.vercel.app and https://incident-witness-git-main-uhhh2.vercel.app.
- **Deployed checks:** `/`, `/login`, `/docs` and `/verify` returned HTTP 200. `/dashboard` returned `307` to `/login?next=%2Fdashboard` with `x-robots-tag: noindex`. The removed demo API route returned HTTP 404. The home page contains no demo button and the login page contains no magic-link implementation notice.
- **Deployed browser check:** clicking the public-header Workspace link while unauthenticated landed on `/login?next=%2Fdashboard`, rendered “Provider sign-in”, showed no dashboard heading, showed no magic-link notice and made zero provider API requests.
- **Deployment mechanism:** auto-created by the Git-connected Vercel project after the authorized `git push`. No separate `vercel deploy --prod` command was run. This is a staging-data deployment; production release approval remains a separate operator decision.
- Subsequent docs-only handoff commits may auto-deploy without an application-code change.

## Final operator UI polish (2026-11-01)

- **Login layout:** changed from a two-column form/links layout to a centered single-column card. The “Return home” and “Read the documentation” links now sit directly underneath the form. The obsolete magic-link implementation notice remains removed.
- **Removed public warning panels:** deleted the “Current functionality” panel from `/` and the “Current deployment status” panel from `/docs`. The detailed evidence limitations and staging caveats remain in the documentation body and footer.
- **Auth-aware Workspace link:** `SiteHeader` now checks the server-side session through `createSupabaseServerClient().auth.getUser()` (with the gated E2E session seam). `PrimaryNav` shows Workspace only for authenticated users. Logged-out visitors see Home, Docs, Verify and Login. `proxy.ts` is unchanged and still returns 307 for direct `/dashboard`, `/hosts`, `/incidents` and `/settings` access.
- Public routes are now dynamic because the header reads request cookies. Metadata, sitemap and robots remain unchanged.
- **Final UI deployment:** https://incident-witness-ma2gomqrz-uhhh2.vercel.app, Git SHA `3967ccb92b4fa683baf2b9244790d7d7b03d593a`, target `production`, status `READY`. Deployed checks confirmed: zero Workspace links when logged out; no “Current functionality” or “Current deployment status” panels; documentation limitation text retained; no login implementation notice; login links below the form; direct `/dashboard` still redirects to `/login?next=%2Fdashboard` with no dashboard heading.
- Test evidence: `npm run lint --workspace @incident-witness/web` — **PASS**; `npm run typecheck --workspace @incident-witness/web` — **PASS**; `npm run build --workspace @incident-witness/web` — **PASS**; full Playwright — **PASS**: 80 checks, 79 passed and one intentional mobile provider-flow skip. New coverage asserts the login links sit below the form, the obsolete panels are absent, Workspace is hidden when logged out, visible for an injected authenticated session, and direct protected navigation still redirects.

## Authenticated header fix and automated demo video (2026-11-01)

### Authenticated header Login removal

- `apps/web/components/primary-nav.tsx` no longer includes the `Login` link in the authenticated link set. Logged-in users see Home, Workspace, Docs and Verify; logged-out users see Home, Docs, Verify and Login.
- Regression coverage in `apps/web/tests/e2e/auth-session.spec.ts` asserts one Login link for anonymous visitors, zero Login links for an injected authenticated session, and exactly one Workspace link for the authenticated session. The mobile collapsed menu is checked through the nav DOM so the hidden accessible tree does not create a false negative.
- Commit: `8c0a98499b1c5f4076a96735df5bdec683e7b2fe` — `fix(ui): hide login link when authenticated`, pushed to `main`.
- Git-connected Vercel deployment: https://incident-witness-2td8piewm-uhhh2.vercel.app
  - Deployment ID: `dpl_FZYFnL5v8DxdnEiXQuqQy2o8X5wT`
  - Target/status: `production`; `READY`
  - Git metadata SHA: `8c0a98499b1c5f4076a96735df5bdec683e7b2fe`; branch `main`
  - Stable alias: https://incident-witness.vercel.app
  - Deployed logged-out HTML check: primary navigation contains one `/login` link and zero `/dashboard` links. Authenticated visibility is covered by the local full-stack E2E test; no real Supabase session was created for the deployed check.

### Automated demo video pipeline

- Added `scripts/demo/` with:
  - `seed.ts` — creates a dedicated disposable demo user/host/incident, signed host and renter events, a platform-probe event, ends/seals via the local E2E API, downloads the bundle, and cleans up with `--cleanup`. It refuses production and custom demo user IDs without explicit opt-in.
  - `record.ts` — Playwright 1280×720 recording of homepage → authenticated Workspace → sealed incident timeline → bundle download → `/verify` VALID → one-byte tampered upload → INVALID → public footer/GitHub. It pre-warms Next dev routes, reads each scene's narration duration with `ffprobe`, waits `audioDuration + 1s`, and records each scene's start offset into `timeline.json`. No scene start/duration is hardcoded.
  - `generate-voiceover.sh` — expanded seven-scene explanatory script through Microsoft Edge neural TTS (`edge-tts` 7.3.1, `en-US-GuyNeural`, −2% rate). Each scene is resampled to 48 kHz before highpass/lowpass filtering, non-speech tails are trimmed so the deliberate one-second beat is not doubled, a separate one-second silence is inserted after each scene, and the concatenated voiceover is normalized to −16 LUFS with a two-pass FFmpeg `loudnorm` measurement. It retries transient Edge TTS network failures.
  - `assemble.sh` — starts the local test API/web app, seeds, records, then cuts one video segment per recorded scene boundary, concatenates the segments, and muxes the normalized voiceover only. It does not use `tpad` or `apad`, and there is no background music, ambient bed or `sidechaincompress`/ducking path.
- Root command: `npm run demo:video`; equivalent `bash scripts/demo/assemble.sh`.
- Final artifact (local, not committed): `scripts/demo/incident-witness-demo.mp4`
  - Duration 98.600 s (1:38.6); H.264 1280×720 30 fps + AAC 48 kHz mono.
  - Size `4,013,879` bytes; SHA-256 `e6dcbbdadc4936a72a50cff9e36f3e78eafa72fde3a7579a585f7443d61d9ecc`.
  - Measured final audio: integrated −16.4 LUFS, true peak −1.7 dBTP. Scene narration segments measure −16.0 to −16.7 LUFS.
  - The final one-second tail measures −91 dB; there is no background hum or music track.
- The recorded incident is explicitly labelled: `demoMode: true`, every seeded event uses `simulation_mode: true`, and the UI shows “Demo / simulated evidence”. The video demonstrates the real seal and real browser verification, including the one-byte failure. It does not claim real hardware telemetry, a deployed production API or physical root cause.
- Generated `.wav`, `.mp3`, `.webm`, `.mp4`, bundle, log, state and timeline files are gitignored. Only the scripts and README are committed.
- Environment: `ffmpeg` 6.1.1 is installed from Ubuntu packages; `edge-tts` 7.3.1 is installed system-wide. `espeak-ng` is no longer used. No paid video/TTS API is used; Edge TTS requires an internet connection.
- Operator rejected the initial `espeak-ng` voice as too robotic on 2026-11-01. The pipeline was switched to Microsoft Edge neural TTS.
- Operator then rejected the synthesized ambient background bed as unpleasant humming and reported voice-level fluctuation. The bed, music mixing and `sidechaincompress` path were removed entirely. The final voiceover is normalized to −16 LUFS and is the only audio track in the MP4.
- Operator then reported that the narration was too brief and that hardcoded scene timings left long pauses. The narration script was expanded to explain the problem, workspace, three sources, sealing, browser verification, tamper detection and outro; the fixed 15/20/30-second scene slots were removed. Recording now derives every scene duration from `ffprobe`, and assembly cuts matching video segments at the recorded offsets.
- Two supplied narration phrases were adjusted to comply with the project evidence-language rules: “external Platform Probe” became “platform-operated probe” (the probe is not an independent third party), and “ensuring the data cannot be tampered with” became “so any tampering after the fact is detectable” (signatures make tampering evident; they do not make a file impossible to modify).

### Verification evidence

- `npx playwright test tests/e2e/auth-session.spec.ts` — **PASS**: 10/10 across desktop and mobile.
- `npm run test:e2e` — **PASS**: 80 checks, 79 passed and one intentional mobile provider-flow skip.
- `npm run lint --workspace @incident-witness/web` — **PASS**.
- `npm run typecheck --workspace @incident-witness/web` — **PASS**.
- `npm run build --workspace @incident-witness/web` — **PASS**.
- `bash -n scripts/demo/assemble.sh scripts/demo/generate-voiceover.sh` — **PASS**.
- `edge-tts --version` — **PASS**: 7.3.1; all seven expanded scene narrations synthesized with `en-US-GuyNeural` (10.21–16.94 s each), separated by explicit one-second silences and normalized to −16 LUFS with two-pass `loudnorm`.
- Standalone TypeScript check for `scripts/demo/seed.ts` and `scripts/demo/record.ts` with strict/no-unchecked-indexed-access options — **PASS**.
- `npm run demo:video` — **PASS** end-to-end with audio-derived dynamic pacing; final video rendered at the path above (98.600 s, −16.4 LUFS integrated, −16.0 to −16.7 LUFS scene range, no music); sampled frames confirmed homepage, authenticated dashboard, three-source timeline with the cyan probe event, valid bundle state, invalid tampered state and footer/GitHub outro.
- The pipeline’s disposable staging rows are removed on exit by default; the last run exited successfully after cleanup.

## Sidebar navigation cleanup (2026-11-01)

- `apps/web/components/dashboard-sidebar.tsx`:
  - The circular `OP` avatar is now a Next.js `<Link href="/settings">` with `aria-label="Account settings"`, a title tooltip, pointer cursor, a visible emerald/charcoal hover state and the existing visual geometry.
  - Removed the entire “Staging workspace” yellow-chip block, including the “Data is loaded from the authenticated API. Missing sources remain gaps.” copy.
  - Added a small bordered arrow-left link to `/` beside the desktop “Provider workspace” label with `aria-label="Back to public home"`.
  - Added the same subtle home link to the mobile workspace top bar next to the menu toggle.
- No API, database, authentication, evidence or business-logic changes.
- Commit: `b48c4b2e3b7829cdf8a385dbc0de36bca211a2d1` — `fix(ui): dashboard sidebar and navigation cleanup`, pushed to `main`.
- Formatting follow-up: `08d1cd3ce6f97ed329d1b852b75e137c136811df` — `style(ui): format sidebar cleanup` (Prettier-only line wrapping; no behavior change).
- Vercel production deployment: https://incident-witness-5idbr1ejf-uhhh2.vercel.app
  - Deployment ID: `dpl_5yGbx5WZuQnx3eQQCFzBEm224N8E`
  - Target/status: `production`; `READY`
  - Git metadata SHA: `08d1cd3ce6f97ed329d1b852b75e137c136811df`
  - Stable alias: https://incident-witness.vercel.app
  - The behavior commit `b48c4b2` was also deployed and verified `READY` at https://incident-witness-i6dmwai04-uhhh2.vercel.app before the formatting follow-up.
  - `/` returns HTTP 200; `/dashboard` and `/settings` return the expected 307 to `/login?next=…` without a session.
- Verification:
  - `npx playwright test tests/e2e/auth-session.spec.ts` — **PASS**: 12/12 desktop and mobile, including back-link navigation, OP → `/settings`, staging-copy absence and mobile horizontal-overflow check.
  - `npm run test:e2e` — **PASS**: 82 checks, 81 passed and one intentional mobile provider-flow skip.
  - `npm run lint --workspace @incident-witness/web` — **PASS**.
  - `npm run typecheck --workspace @incident-witness/web` — **PASS**.
  - `npm run build --workspace @incident-witness/web` — **PASS**.
- The production build’s static chunks contain the new “Back to public home” and “Account settings” strings; the removed “Staging workspace” copy is absent from the built static chunks.
- The formatting follow-up `08d1cd3` was Prettier-only; the same focused and full E2E suites were run on the behavior commit before formatting.

## Design reference and approval status

- **Final visual design:** **APPROVED and IMPLEMENTED** (revision 0.3; Phase 7 **COMPLETE AND CLOSED**).
- **Approved design direction:** Reference-driven dark emerald command center with Satoshi, sharp 4px geometry and `#26D18C` emerald.
- **Design references:** OPERATOR-SUPPLIED — `docs/design-references/incident-reference 1.webp` and `incident-reference 2.webp`. No reference imagery, logos, avatars or copy is embedded in the mockups.
- **Mockups:** v0.3 **APPROVED** on 2026-10-31.
- **Operator approval:** **GRANTED** — "I approve these mockups."
- **Implementation authorization:** Phase 7 visual implementation only. Business logic, API contracts, database schemas, security and evidence language must not change.
- Phase 6 scope, reference analysis, translation, deviations and the approval record are in `docs/DESIGN_DECISIONS.md`.
- Phase 3C, Phase 3D, Phase 3E and Phase 3F did not change frontend styling or visual behaviour.
- Phase 4/5 connect functional UI and state handling; Phase 7 applies the approved final visual design. Business logic, API contracts and schemas remain unchanged.
- Phase 4 connects functional UI and state handling; the final visual design is implemented, accepted and closed.
- Operator acceptance of the Phase 7 design and auth fixes was recorded on 2026-10-31.

## Documentation/footer status

- `docs/HOST_AGENT.md` documents the Phase 3D CLI, configuration, permissions, spool/quota, collectors, retry and limitations.
- `docs/RENTER_SDK.md` rewritten with Phase 3E enrollment, endpoint, queue, state, deadline and error behavior.
- `docs/PROBE_WORKER.md` added with Render deployment, key provisioning, SSRF/DNS-rebinding controls, result mapping and database access.
- `docs/CONFIGURATION.md` updated for renter SDK options and probe-worker variables/provisioning.
- `docs/API_REFERENCE.md` updated to show both witnesses consume existing contracts; no new public API route.
- `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` and `docs/PRIVACY_SECURITY.md` updated for the worker.
- `README.md` rewritten for Phase 8 with current setup, magic-link deviation, testing, deployment, protocol, host-agent, renter-SDK and security guidance.
- `docs/README.md` is now a maintained documentation index with in-app `/docs` consistency rules rather than a blueprint note.
- `docs/HOST_AGENT.md`, `docs/RENTER_SDK.md`, `docs/PROBE_WORKER.md`, `docs/USER_GUIDE.md`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` and `docs/DESIGN_DECISIONS.md` have current status lines; no Phase 3 acceptance debt remains.
- `.env.example` includes `NEXT_PUBLIC_SITE_URL` and conservative probe-worker defaults/key-provisioning guidance.
- `/docs` is a real, reachable documentation destination with quick start, host-agent, renter-SDK, protocol, verification and limitation sections.
- Footer Documentation, Privacy, Terms, Verify and GitHub links are present and were checked on the deployed Preview. The GitHub repository and a representative docs file returned HTTP 200.
- `/privacy` and `/terms` are real routes with explicit legal-review-pending status; no fabricated company, jurisdiction, contact or contractual legal copy is published.
- `docs/DESIGN_DECISIONS.md` records the rejected 0.1 hybrid, the operator-supplied references, the reference analysis/translation, Satoshi/4px revision 0.3 refinements, the explicit approval, Phase 7 implementation deviations and the completed Phase 7 acceptance.
- `docs/mockups/README.md` explains how to open and review the reference-driven mockup set; `docs/mockups/index.html` is the local review entry point. Font attribution/license is in `docs/mockups/assets/fonts/FONT_LICENSE.md`.

## Known risks and operator actions

1. **No live probe deployment/key:** the current `.env` has no platform-probe key ID/private key and staging has no `platform_probe` witness row. Run `npm run db:provision-probe-key -- --generate --out secrets/probe-worker.pk8` (or provision an existing key) before starting the Render worker.
2. **No live renter integration:** the SDK has not been used against a live staging invitation. Its end-to-end tests use a local mock API. The enrollment API does not return the provider endpoint hostname, so the integrator must supply `endpointHostname` from the invitation context. The Phase 4 UI displays the invitation token/join URL but does not yet provide an endpoint-hostname field.
3. **No real public probe:** SSRF/DNS-rebinding behavior is proven with injected resolvers/transports and private-address unit tests, not against a live provider endpoint. The worker is not deployed to Render.
4. **Probe key provisioning sensitivity:** `db:provision-probe-key` is an operator-only script that reads the probe private key and the API root signing key to create the certificate. `--generate` writes the generated private key only to the requested `0600` file and prints only public metadata. It runs offline/one-time; the worker runtime never receives the root key. Do not expose it as a service endpoint, and never commit the generated file.
5. **No worker metrics endpoint:** structured logs/counters only; no Prometheus/readiness endpoint. Render restart/log monitoring is required.
6. **No agent session discovery:** the API has no agent-scoped route that lists active incidents. The operator must pass `--incident <uuid>` to `iw-agent run`. Phase 4 did not add agent session discovery; the provider must still pass `--incident <uuid>` to the agent. Do not hide the manual step or claim automatic session detection.
7. **No live host acceptance:** no disposable DNS-verified host with a public HTTPS endpoint was available. Enrollment/upload was verified against a local HTTP mock. Real `nvidia-smi`/`upsc` execution and real staging enrollment remain unverified.
8. **No release packaging:** there is no signed host-agent/worker binary, installer or systemd unit. Both are built and run from the repository under the operator's supervisor.
9. **Single GPU:** `nvidia-smi -i 0` only. Multi-GPU summarisation and per-device events require a later approved change.
10. **Enrollment certificate trust:** the host agent and renter SDK validate certificate shape, source key, public key and scope, but do not verify the platform certificate signature against a locally pinned platform public key. They rely on the configured HTTPS API and TLS. A pinned platform key or certificate bundle should be added before release.
11. **Halted uploader recovery:** non-retryable 4xx responses retain the host spool and stop evidence collection until the operator fixes the cause and restarts. There is no in-process reset command.
12. **Platform-key rotation:** source certificates are verified against the current configured platform key. A future rotation must preserve old certificate verification or re-enroll source keys; this is not yet exercised. The CLI trust set and the web verifier trust set must both be updated with the new public key before verification.
13. **Manual end clamp:** `endedAt` is clamped to the latest accepted observation to keep the capture window consistent. `captureEndsAt` remains the bounded scheduled end due the Phase 2 minimum-2-minute constraint.
14. **Demo cap:** demo sessions are labelled and capped at `LOW` even when their events are real; this is conservative and matches the permanent simulation-label requirement.
15. **Render service not linked:** `render.yaml` exists and the API builds `dist/index.js`, but the operator must link it in Render, provide all required server-only environment variables and apply migrations through `0022`. No API/worker deployment was verified from this environment.
16. **Event rejection auditing:** rejected events are not inserted into `audit_events`; the API returns safe error codes and does not log payloads/signatures. Revisit in Phase 9 if DB-level security audit of rejects is required.
17. **Development advisories:** 20 moderate development-only npm advisories remain; `npm audit --omit=dev` is clean.
18. **Fastify deprecation warning:** `requestIdLogLabel` is deprecated in Fastify 5 and will be removed in Fastify 6. Existing Phase 2 configuration; non-blocking.
19. **E2E test auth seam:** Playwright uses a static test token and a file-backed DNS resolver through `IW_E2E_*` flags. The API seam is disabled unless `NODE_ENV=test` and the explicit flag are set; the web seam is disabled in production. Real Supabase email OTP delivery and session refresh are not exercised by the automated provider journey. No production credential or production data is used.
20. **P2 worker lease bookkeeping:** retry/dead/cancel updates are not conditioned on the current lease owner. Deterministic event IDs prevent duplicate evidence, but a stale worker can still disturb job status after lease expiry. Revisit with a lease-owner-conditioned update.
21. **Magic-link redirect configuration:** live email delivery requires the deployment origin and `/auth/callback` to be allow-listed in Supabase Auth. Automated E2E uses the gated local test session instead of consuming a real email link; no custom SMTP is configured.

## Things not to change

- Product name and MVP boundaries without operator approval.
- Platform-probe trust label.
- Deterministic assessment and `UNKNOWN` behaviour.
- Ed25519 + JCS signed record model; browser verifier is a browser-safe public-key-only implementation.
- Session and token limits/states.
- Host/renter/platform source authorization model.
- Selected stack or RLS approach.
- Phase sequencing and final UI approval gate.

## Exact next task

**Phase 7 — Operator acceptance checkpoint.**
The approved visual system is implemented, tested and deployed. Wait for operator acceptance. Do not begin Phase 8 without explicit authorization.
