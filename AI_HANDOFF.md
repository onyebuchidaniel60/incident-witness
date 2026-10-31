# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 0, Phase 1, Phase 2 and all Phase 3 subphases (3A, 3B, 3C, 3D, 3E, 3F) are complete and accepted. Phase 3 is entirely **COMPLETE**. Phase 4 functional frontend integration is implemented and test-verified. Phase 5 MVP hardening and the E2E verification gate are implemented and tested; the Phase 5 checkpoint is pending operator acceptance.

**Current phase:** Phase 5 — IMPLEMENTED, PENDING OPERATOR ACCEPTANCE.

**Next task:** Phase 6 only — awaiting explicit operator authorization.

**Phase 2 acceptance:** Operator accepted the Phase 2 checkpoint and approved the `public.iw_uid()` security-definer wrapper on 2026-10-31.

**Phase 3B acceptance:** Operator accepted the Phase 3B checkpoint on 2026-10-31 and explicitly approved the recorded deviations: the generated staging platform key, migrations `0009`–`0012` (grants/RLS only, no table/column changes), and the `endedAt` vs `captureEndsAt` manual-end constraint.

**Phase 3C acceptance:** Operator reviewed the Phase 3C checkpoint report and accepted it on 2026-10-31. The correlation engine, canonical signed-event ingestion and transactional sealing meet the Phase 3C requirements. Phase 3C is **COMPLETE AND CLOSED**.

**Phase 3D acceptance:** Operator reviewed the Phase 3D checkpoint report and accepted it on 2026-10-31. The explicit `--incident <uuid>` flag for the host agent was accepted as a valid MVP implementation detail. Phase 3D is **COMPLETE AND CLOSED**.

**Phase 3E acceptance:** Operator reviewed the Phase 3E checkpoint report and accepted it on 2026-10-31. The explicit `endpointHostname` requirement and the missing live probe key setup are accepted and documented. Phase 3E is **COMPLETE AND CLOSED**.

**Phase 3F acceptance:** Operator reviewed the Phase 3F checkpoint report and accepted it on 2026-10-31. The offline CLI verifier and the staging E2E demo-harness proof are accepted. Phase 3F is **COMPLETE AND CLOSED**, and Phase 3 is entirely **COMPLETE**.

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
- Next.js 16.4.3 App Router + Tailwind CSS 4.x frontend; temporary styling only.
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

## Completed in Phase 5 (MVP hardening and E2E gate; pending operator acceptance)

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

## Design reference and approval status

- **Final visual design:** NOT STARTED.
- **Design references:** NOT COLLECTED/APPROVED.
- **Mockups:** NOT CREATED.
- **Operator approval:** NOT GRANTED.
- Phase 3C, Phase 3D, Phase 3E and Phase 3F did not change frontend styling or visual behaviour.
- Phase 4/5 connect functional UI and state handling but retain temporary structural styling; final visual design is still not approved or implemented.
- Phase 4 connects functional UI but keeps temporary structural styling; final visual design is still not approved or implemented.

## Documentation/footer status

- `docs/HOST_AGENT.md` documents the Phase 3D CLI, configuration, permissions, spool/quota, collectors, retry and limitations.
- `docs/RENTER_SDK.md` rewritten with Phase 3E enrollment, endpoint, queue, state, deadline and error behavior.
- `docs/PROBE_WORKER.md` added with Render deployment, key provisioning, SSRF/DNS-rebinding controls, result mapping and database access.
- `docs/CONFIGURATION.md` updated for renter SDK options and probe-worker variables/provisioning.
- `docs/API_REFERENCE.md` updated to show both witnesses consume existing contracts; no new public API route.
- `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` and `docs/PRIVACY_SECURITY.md` updated for the worker.
- `README.md` updated with Phase 3F CLI/demo commands, probe-key generation and test counts.
- `docs/PROTOCOL.md` updated to record the Phase 3F CLI verifier status.
- `docs/PROBE_WORKER.md` updated for generated-key provisioning.
- `README.md` updated for Phase 4 web integration, local browser verification, full-stack Playwright tests, `render.yaml`, Phase 5 hardening and magic-link authentication.
- `docs/DEPLOYMENT.md` updated with the Render `render.yaml` linking and migration prerequisites.
- `docs/PROTOCOL.md` and `docs/API_REFERENCE.md` updated for the Phase 4 browser verifier and connected workspace.
- `.env.example` includes conservative probe-worker defaults and key-provisioning guidance.
- `/docs` route and footer Documentation/GitHub links remain unchanged and reachable from Phase 2.
- `/privacy` and `/terms` remain clearly labelled placeholders; no legal copy is approved.

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

**Phase 6 — Design references and mockups — awaiting explicit operator authorization.**
Do not begin until the Phase 5 checkpoint is accepted and Phase 6 is authorized.
