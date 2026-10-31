# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 0, Phase 1, Phase 2, Phase 3A, Phase 3B, Phase 3C and Phase 3D are complete and accepted. Phase 3E renter SDK and platform probe worker implementation is in progress under explicit operator authorization.

**Current phase:** Phase 3E — Renter SDK and platform probe worker — IN PROGRESS.

**Next task:** Complete Phase 3E only; do not start Phase 3F.

**Phase 2 acceptance:** Operator accepted the Phase 2 checkpoint and approved the `public.iw_uid()` security-definer wrapper on 2026-10-31.

**Phase 3B acceptance:** Operator accepted the Phase 3B checkpoint on 2026-10-31 and explicitly approved the recorded deviations: the generated staging platform key, migrations `0009`–`0012` (grants/RLS only, no table/column changes), and the `endedAt` vs `captureEndsAt` manual-end constraint.

**Phase 3C acceptance:** Operator reviewed the Phase 3C checkpoint report and accepted it on 2026-10-31. The correlation engine, canonical signed-event ingestion and transactional sealing meet the Phase 3C requirements. Phase 3C is **COMPLETE AND CLOSED**.

**Phase 3D acceptance:** Operator reviewed the Phase 3D checkpoint report and accepted it on 2026-10-31. The explicit `--incident <uuid>` flag for the host agent was accepted as a valid MVP implementation detail. Phase 3D is **COMPLETE AND CLOSED**.

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
- Linux host agent (`packages/host-agent`, executable `iw-agent`) implements interactive enrollment, local Ed25519 key generation, owner-only credential storage, a durable SQLite spool, operational-presence and evidence heartbeats, fixed-argument `nvidia-smi`/`upsc` collectors and bounded retry/backoff. Renter SDK, platform probe worker and CLI verifier are **not implemented** (Phase 3E+).

## Repository state

- **Repository URL:** confirmed public — https://github.com/onyebuchidaniel60/incident-witness
- **Working directory/repo root:** `/root/incident-witness`
- **Branch:** `main`
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

**Placeholder or unverified:**

- Renter SDK, platform probe worker and CLI verifier are **not implemented** (Phase 3E–3F).
- The Phase 3D agent has not enrolled a real disposable host or reached a live staging incident. Its end-to-end test uses a local HTTP mock; real `nvidia-smi` and `upsc` execution is not run in CI.
- Event ingestion against staging remains tested with generated test keys/events; an actual agent/SDK has not submitted to a live incident.
- No real platform-probe observations or worker leases are produced; probe-lease behavior is tested with seeded rows.
- Web host/incident/timeline/bundle pages remain Phase 1 placeholders and are not wired to these APIs (Phase 4).
- API is not deployed to Render; no new Vercel deployment for Phase 3C/3D.
- Source-certificate verification uses the current configured platform key. Platform-key rotation with old source certificates is not yet exercised.

## Tests and evidence

Run on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm run lint` — **PASS** across protocol, host-agent, correlator, db, API and web.
- `npm run typecheck` — **PASS** across protocol, host-agent, correlator, db, API and web.
- `npm run build` — **PASS**: protocol ESM/CJS/declarations, host-agent CLI, correlator, DB, Fastify API and Next.js 16.4.3.
- `npm test` — **PASS**: 20/20 protocol tests, 12/12 correlator tests, 14/14 ADR-001 staging tests, 49/49 host-agent tests, 17/17 API unit tests (112 total).
- `npm test --workspace @incident-witness/host-agent` — **PASS**: 49/49 host-agent tests across 9 files.
- `node packages/host-agent/dist/cli.js version` — **PASS**: `iw-agent 0.1.0`; help output renders.
- `setpriv --reuid=nobody --regid=nogroup --clear-groups node .../cli.js version|status` — **PASS**: the built CLI opened an enrolled test configuration and SQLite spool as an unprivileged user; config directory `0700`, all files `0600`. This proves basic operation does not require root in this test environment.
- `npm audit --omit=dev` — **PASS**: 0 production vulnerabilities.
- Full dependency audit still reports 20 moderate development-only advisories (ESLint/esbuild tooling); no non-breaking fix is available without a forced breaking downgrade.
- `npm run test:integration --workspace @incident-witness/api` — **NOT RE-RUN in Phase 3D**: no API, DB, protocol or web files changed. The Phase 3C run remains 57/57 PASS.
- `npm run test:e2e` — **NOT RE-RUN in Phase 3D**: no frontend files changed. The Phase 3C run remains 36/36 PASS.
- Real staging/disposable-host enrollment and real `nvidia-smi`/`upsc` execution — **NOT RUN**: no accessible DNS-verified disposable host; CI deliberately uses injected collectors and a local HTTP mock.

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
- **Applied migrations:** `0001_phase2_schema` through `0017_phase3c_system_transition_visibility`.
- **Roles:** `iw_api` and `iw_worker` are login roles with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`.
- **Schema decision:** `public.iw_uid()` security-definer wrapper remains approved and in use.
- **Platform key:** `iw-platform-staging-1` registered in `platform_signing_keys`; private key only in ignored `.env`.
- **Phase 3C schema:** no table or column changes; only grants/RLS policies.

## Design reference and approval status

- **Final visual design:** NOT STARTED.
- **Design references:** NOT COLLECTED/APPROVED.
- **Mockups:** NOT CREATED.
- **Operator approval:** NOT GRANTED.
- Phase 3C and Phase 3D did not change frontend styling or visual behaviour.

## Documentation/footer status

- `docs/HOST_AGENT.md` rewritten with Phase 3D CLI, configuration, permissions, spool/quota, collectors, retry and limitations.
- `docs/CONFIGURATION.md` updated: host-agent configuration is file/CLI-based, not web/API environment variables.
- `docs/TROUBLESHOOTING.md` updated with host-agent status, spool, 4xx and presence-replay guidance.
- `docs/API_REFERENCE.md` updated to show the host agent consumes the existing contracts without adding API routes.
- `README.md` updated with Phase 3D status, host-agent build/run entry points and test counts.
- `.env.example` no longer suggests host credentials/private keys belong in the web/API environment file.
- `/docs` route and footer Documentation/GitHub links remain unchanged and reachable from Phase 2.
- `/privacy` and `/terms` remain clearly labelled placeholders; no legal copy is approved.

## Known risks and operator actions

1. **Phase 3D accepted:** host-agent enrollment, spool, presence/evidence loops, collectors and upload were accepted by the operator on 2026-10-31. The explicit `--incident <uuid>` flag is accepted as an MVP implementation detail.
2. **No agent session discovery:** the API has no agent-scoped route that lists active incidents. The operator must pass `--incident <uuid>` to `iw-agent run`. Phase 4 must integrate this value into the provider UI; do not hide the manual step or claim automatic session detection.
3. **No live host acceptance:** no disposable DNS-verified host with a public HTTPS endpoint was available. Enrollment/upload was verified against a local HTTP mock of the documented contracts. Real `nvidia-smi`/`upsc` execution and real staging enrollment remain unverified.
4. **No release packaging:** there is no signed binary, installer or systemd unit. The agent is built from the repository and run as a foreground process under the operator's supervisor.
5. **Single GPU:** `nvidia-smi -i 0` only. Multi-GPU summarisation and per-device events require a later approved change.
6. **Enrollment certificate trust:** the agent validates certificate shape, source key, public key and host scope, but does not verify the platform certificate signature against a locally pinned platform public key. It relies on the configured HTTPS API and TLS. A pinned platform key or certificate bundle should be added before release.
7. **Halted uploader recovery:** non-retryable 4xx responses retain the spool and stop evidence collection until the operator fixes the cause and restarts. There is no in-process reset command.
8. **Platform-key rotation:** source certificates are verified against the current configured platform key. A future rotation must preserve old certificate verification or re-enroll source keys; this is not yet exercised.
9. **Manual end clamp:** `endedAt` is clamped to the latest accepted observation to keep the capture window consistent. `captureEndsAt` remains the bounded scheduled end due the Phase 2 minimum-2-minute constraint.
10. **Demo cap:** demo sessions are labelled and capped at `LOW` even when their events are real; this is conservative and matches the permanent simulation-label requirement.
11. **API not deployed:** no Render API deployment or new Vercel deployment for Phase 3C/3D. Local staging verification only.
12. **Event rejection auditing:** rejected events are not inserted into `audit_events`; the API returns safe error codes and does not log payloads/signatures. Revisit in Phase 9 if DB-level security audit of rejects is required.
13. **Development advisories:** 20 moderate development-only npm advisories remain; `npm audit --omit=dev` is clean.
14. **Fastify deprecation warning:** `requestIdLogLabel` is deprecated in Fastify 5 and will be removed in Fastify 6. Existing Phase 2 configuration; non-blocking.
15. **No Phase 4 UI integration:** the web pages do not yet display events, assessments or bundle downloads, and cannot yet launch an agent with the active incident ID.

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

**Phase 3E only — renter SDK and platform probe worker — in progress under explicit operator
authorization.** Do not start Phase 3F.
