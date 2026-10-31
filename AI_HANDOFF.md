# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 0, Phase 1, Phase 2, Phase 3A and Phase 3B are complete and accepted. Phase 3C API-side signed event ingestion, deterministic correlation and bundle sealing are implemented and tested; the Phase 3C checkpoint is pending operator acceptance.

**Current phase:** Phase 3C — IMPLEMENTED, PENDING OPERATOR ACCEPTANCE.

**Next task:** Phase 3D only — Linux host agent — awaiting explicit operator authorization.

**Phase 2 acceptance:** Operator accepted the Phase 2 checkpoint and approved the `public.iw_uid()` security-definer wrapper on 2026-10-31.

**Phase 3B acceptance:** Operator accepted the Phase 3B checkpoint on 2026-10-31 and explicitly approved the recorded deviations: the generated staging platform key, migrations `0009`–`0012` (grants/RLS only, no table/column changes), and the `endedAt` vs `captureEndsAt` manual-end constraint.

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
- Linux host agent, renter SDK, platform probe worker and CLI verifier are **not implemented** (Phase 3D+).

## Repository state

- **Repository URL:** confirmed public — https://github.com/onyebuchidaniel60/incident-witness
- **Working directory/repo root:** `/root/incident-witness`
- **Branch:** `main`
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

## Completed in Phase 3C

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

## Visible behaviour vs placeholders

**Functional locally against staging:**

- All Phase 3B host/incident/enrollment/renter/key/archive routes.
- Signed host and renter event ingestion with canonical-byte rejection, signature verification, time-window checks and atomic budgets.
- Deterministic correlation and evidence grades.
- Full seal → bundle download → protocol signature/certificate/event verification.
- Seal vs ingest serialization and post-seal rejection.
- Sweeper auto-seal and `NO_EVIDENCE` cancellation.
- Demo-session labelling and grade cap.
- Owner isolation for bundles and incidents.

**Placeholder or unverified:**

- Linux host agent, renter SDK, platform probe worker and CLI verifier are **not implemented** (Phase 3D–3F).
- Event ingestion is tested with generated test keys/events, not an actual agent or SDK.
- No real platform-probe observations or worker leases are produced; probe-lease behavior is tested with seeded rows.
- Web host/incident/timeline/bundle pages remain Phase 1 placeholders and are not wired to these APIs (Phase 4).
- API is not deployed to Render; no new Vercel deployment for Phase 3C.
- Source-certificate verification uses the current configured platform key. Platform-key rotation with old source certificates is not yet exercised.

## Tests and evidence

Run on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm run db:migrate` — **PASS**: applied `0013`–`0017` after `0001`–`0012`.
- `npm run db:migrate:status` — **PASS**: all migrations `0001`–`0017` applied.
- `npm run lint` — **PASS** across protocol, correlator, db, API and web.
- `npm run typecheck` — **PASS** across protocol, correlator, db, API and web.
- `npm run build` — **PASS**: protocol ESM/CJS/declarations, correlator, DB, Fastify API and Next.js 16.4.3.
- `npm test` — **PASS**: 20/20 protocol tests, 12/12 correlator tests, 14/14 ADR-001 staging tests, 17/17 API unit tests.
- `npm run test:integration --workspace @incident-witness/api` — **PASS**: 57/57 API integration tests across Phase 3B and Phase 3C.
- `npm run test:e2e` — **PASS**: 36/36 Playwright checks (desktop Chromium + mobile Pixel 7).
- `npm audit --omit=dev` — **PASS**: 0 production vulnerabilities.
- Full dependency audit still reports 20 moderate development-only advisories (ESLint/esbuild tooling); no non-breaking fix is available without a forced breaking downgrade.

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
- Phase 3C did not change frontend styling or visual behaviour.

## Documentation/footer status

- `docs/API_REFERENCE.md` updated with event ingestion, sealing, bundle download, error codes and correlator rules.
- `docs/PROTOCOL.md` updated with rule version `iw-rules-v1`, correlation windows and digest semantics.
- `README.md` updated with Phase 3C status and test counts.
- `/docs` route and footer Documentation/GitHub links remain unchanged and reachable from Phase 2.
- `/privacy` and `/terms` remain clearly labelled placeholders; no legal copy is approved.

## Known risks and operator actions

1. **Phase 3C pending acceptance:** signed ingestion, correlation, sealing and bundle download are implemented and tested but not operator-accepted. Do not start Phase 3D without explicit authorization.
2. **No agent/SDK/probe/CLI:** events are generated by test code; real host-agent and renter-SDK integration remains Phase 3D/3E. The platform probe worker does not exist, so probe observations and leases are simulated with seeded test rows.
3. **Platform-key rotation:** source certificates are verified against the current configured platform key. A future rotation must preserve old certificate verification or re-enroll source keys; this is not yet exercised.
4. **Manual end clamp:** `endedAt` is clamped to the latest accepted observation to keep the capture window consistent. `captureEndsAt` remains the bounded scheduled end due the Phase 2 minimum-2-minute constraint.
5. **Demo cap:** demo sessions are labelled and capped at `LOW` even when their events are real; this is conservative and matches the permanent simulation-label requirement.
6. **API not deployed:** no Render API deployment or new Vercel deployment for Phase 3C. Local staging verification only.
7. **Event rejection auditing:** rejected events are not inserted into `audit_events`; the API returns safe error codes and does not log payloads/signatures. Revisit in Phase 9 if DB-level security audit of rejects is required.
8. **Development advisories:** 20 moderate development-only npm advisories remain; `npm audit --omit=dev` is clean.
9. **Fastify deprecation warning:** `requestIdLogLabel` is deprecated in Fastify 5 and will be removed in Fastify 6. Existing Phase 2 configuration; non-blocking.
10. **No Phase 4 UI integration:** the web pages do not yet display events, assessments or bundle downloads.

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

**Phase 3D only — Linux host agent — awaiting explicit operator authorization.** Do not start Phase 3D from this checkpoint.
