# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 0, Phase 1, Phase 2 and Phase 3A are complete/accepted. Phase 3B host/incident domain APIs and transactional lifecycle are implemented and tested; the Phase 3B checkpoint is pending operator acceptance.

**Current phase:** Phase 3B — IMPLEMENTED, PENDING OPERATOR ACCEPTANCE.

**Next task:** Phase 3C only, awaiting explicit operator authorization.

**Phase 2 acceptance:** Operator accepted the Phase 2 checkpoint and approved the `public.iw_uid()` security-definer wrapper on 2026-10-31.

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
- Supabase Postgres/Auth; Drizzle ORM + `pg`; versioned SQL migrations in `packages/db/migrations`.
- `jose` JWT verification against Supabase JWKS; issuer, audience, expiry and UUID subject checks.
- Accepted ADR-001 mechanism: API connects as restricted `iw_api`, sets transaction-local JWT subject and request mode, and never uses `SET ROLE authenticated`.
- Supabase's staging `auth` schema is owned by `supabase_admin`; the migrator cannot grant `auth` USAGE to `iw_api`. Policies therefore call a narrow `SECURITY DEFINER` wrapper `public.iw_uid()` which calls `auth.uid()`. No role switch, service-role connection or auth-schema grant to `iw_api` is used. **Operator approved this wrapper on 2026-10-31.**
- Linux host agent, renter SDK, platform probe worker, evidence ingestion, sealing and bundle verifier are **not implemented** (Phase 3C+).

## Repository state

- **Repository URL:** confirmed public — https://github.com/onyebuchidaniel60/incident-witness
- **Working directory/repo root:** `/root/incident-witness`
- **Branch:** `main`
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
- **Phase 3B deployment:** no frontend files changed, so no new Vercel deployment was made. The Phase 3B API is verified locally against staging; Render deployment remains outstanding.

## Completed in Phase 3B

### Host and endpoint APIs

- `GET /v1/hosts` — owner-scoped cursor list.
- `POST /v1/hosts` — alias/hostname validation, IDNA normalization, public-DNS-only hostname rules, owner-scoped duplicate protection and required `Idempotency-Key`.
- `GET /v1/hosts/:hostId` — safe host metadata, endpoint state, source-key status and install instructions; never returns credentials or key material.
- `PATCH /v1/hosts/:hostId` — alias-only update with audit.
- `POST /v1/hosts/:hostId/endpoint-challenge` — random `iw1=` TXT value, HMAC hash stored, 10-minute expiry, previous challenge invalidated.
- `POST /v1/hosts/:hostId/endpoint-verify` — exact TXT match, 10-attempt cap, DNS resolution, public-address/SSRF rules, fixed HTTPS `GET https://<hostname>/.well-known/incident-witness/health`, TLS validation, no redirects, 3-second timeout, 1 KiB body cap and exact health body.
- `POST /v1/hosts/:hostId/archive` — terminal archive; rejects active incidents; revokes host credentials and unredeemed enrollment tokens; cancels pending/retry probe jobs.
- `POST /v1/hosts/:hostId/keys/:keyId/revoke` — host-key-only revocation; atomically revokes linked credentials.

### Enrollment and operational presence

- `POST /v1/hosts/:hostId/enrollment-codes` — one active code per host, older codes revoked, 10-minute expiry, raw code returned once.
- `POST /v1/agent/enroll` — atomic one-use redemption, public-key validation, platform-signed source certificate, one-time device credential, HMAC-only credential storage.
- `POST /v1/agent/heartbeat` — `application/vnd.incident-witness.presence+json`, exact RFC 8785 canonical bytes, domain-separated Ed25519 signature, independent monotonic presence sequence, exact-retry duplicate handling, 60-second past/30-second future freshness, replay rejection, host/key/credential revocation checks. It does **not** insert into `evidence_events`.

### Incident lifecycle

- `POST /v1/incidents` — owner advisory lock, host row lock, active host and fresh heartbeat check, 2–240 minute duration, one active session per host, maximum three active sessions per owner, demo flag gate, initial probe job, audit and `Idempotency-Key`.
- `GET /v1/incidents` — owner-scoped list with status/host filters and cursor pagination.
- `GET /v1/incidents/:incidentId` — session metadata, source-key status, event counts and bounded timeline summary; assessment only when sealed.
- `POST /v1/incidents/:incidentId/end` — `collecting → awaiting_finalize`, sets `ended_at`, cancels future probe jobs, idempotent while awaiting finalization.
- API lifecycle sweeper — 2-second bounded loop, `FOR UPDATE SKIP LOCKED`, transitions overdue `collecting` incidents to `awaiting_finalize` and audits the transition.

### Renter invitations and key revocation

- `POST /v1/incidents/:incidentId/renter-invitations` — 15-minute one-time invitation, one active invitation per incident, one active renter key per incident, token hash only.
- `POST /v1/renter/enroll` — atomic one-use redemption, incident-scoped key/certificate, credential expiring at the incident ingestion deadline.
- `POST /v1/incidents/:incidentId/keys/:keyId/revoke` — renter-key-only revocation; atomically revokes linked credentials.

### Transactions, idempotency and audit

- All lifecycle state transitions use transactions and row locks (or owner/incident advisory locks).
- Enrollment and invitation issuance/redemption use consistent host-before-token and incident-before-invitation lock ordering to avoid deadlocks.
- `Idempotency-Key` is required for `POST /v1/hosts` and `POST /v1/incidents`; keyed request hash and non-secret resource ID are stored for 24 hours. Same key/different body returns `IDEMPOTENCY_CONFLICT`.
- Audit events are appended for host creation/update, challenge issue/verify, enrollment-code issue, host enrollment, incident creation/end, renter invitation/enrollment, key revocation, host archive and sweeper transitions. Metadata contains no raw tokens, credentials or private keys.
- Raw enrollment codes, invitation tokens, DNS challenge values and device/renter credentials are never stored in plaintext; only HMAC-SHA-256 hashes using `IW_TOKEN_PEPPER`.

### Database access additions (no table/column changes)

- `0009_phase3b_domain_access` — narrow column grants and RLS policies for probe-job lifecycle, credential revocation, machine enrollment, provider key revocation and the bounded lifecycle sweeper.
- `0010_phase3b_credential_provider_select` — provider-scoped credential visibility needed for revocation updates; the API never returns credential hashes.
- `0011_phase3b_system_select_transition` — allows the sweeper to see the post-transition `awaiting_finalize` row; also removes local diagnostic policies.
- `0012_phase3b_enroll_incident_lock` — narrow enrollment-mode incident policy required for `SELECT ... FOR SHARE` during renter enrollment.
- No table or column definitions were changed. Phase 2 schema was sufficient.

### Platform signing key

The staging `.env` did not contain `IW_PLATFORM_SIGNING_PRIVATE_KEY` or `IW_PLATFORM_KEY_ID`, which are required for enrollment certificates. A staging Ed25519 key was generated and stored only in the ignored local `.env` (mode 0600); the public half was registered in `platform_signing_keys`:

- **Key ID:** `iw-platform-staging-1`
- **Public key (base64url):** `U0lXLgkEbyAWigI-_WWJjxAfYnYQQpfTcPtRZEqe4TI`
- **Fingerprint (SHA-256 base64url):** `5xL-KJE2WSs1tQkh1zt7QYVWG3HtrZFwHeErOPqzP4A`

A reproducible provisioning command was added: `npm run db:provision-platform-key`. It writes only public metadata and refuses to overwrite an existing key ID with a different public key. The operator may rotate this staging key through the documented overlapping-key process if a different trust anchor is required.

## Visible behaviour vs placeholders

**Functional locally against staging:**

- All Phase 3B host, endpoint, enrollment, presence, incident, renter-invitation, renter-enrollment, key-revocation and archive routes.
- Owner isolation (404 for non-owned resources).
- DNS challenge expiry/mismatch/private-IP rejection and fixed HTTPS endpoint verification with injected test resolver/checker.
- One-use enrollment and invitation races; one active session per host; maximum three active sessions per owner.
- Presence replay/future/stale rejection and revocation enforcement.
- Idempotent host/incident creation.
- Lifecycle sweeper auto-end.
- Audit rows and HMAC-only secret storage.

**Placeholder or unverified:**

- Signed evidence-event ingestion (`/v1/agent/events`, `/v1/renter/events`) is **not implemented**.
- Sealing, bundle generation/download, grace-expiry auto-seal/auto-cancel and assessment are **not implemented** (Phase 3C).
- Host agent, renter SDK, probe worker and CLI verifier are **not implemented** (Phase 3D–3F).
- API is not deployed to Render; no new Vercel deployment for Phase 3B.
- Web host/incident pages remain Phase 1 placeholders and are not wired to these APIs (Phase 4).
- Real DNS/HTTPS endpoint verification was exercised through injected test resolver/checker in integration tests; the production resolver/checker is implemented but not tested against a live public hostname in this checkpoint.

## Tests and evidence

Run on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm run db:migrate` — **PASS**: applied `0009`–`0012` to staging after the existing `0001`–`0008`.
- `npm run db:migrate:status` — **PASS**: all migrations `0001`–`0012` applied.
- `npm run db:provision-platform-key` — **PASS**: public key/fingerprint registered; private key not printed.
- `npm run lint` — **PASS** across protocol, db, API and web.
- `npm run typecheck` — **PASS** across protocol, db, API and web.
- `npm run build` — **PASS**: protocol ESM/CJS/declarations, DB, Fastify API and Next.js 16.4.3.
- `npm test` — **PASS**: 20/20 protocol tests, 14/14 ADR-001 staging tests, 17/17 API unit tests.
- `npm run test:integration --workspace @incident-witness/api` — **PASS**: 39/39 Phase 3B API integration tests across hosts, enrollment/presence, incidents/lifecycle sweeper and renter invitations.
- `npm run test:e2e` — **PASS**: 36/36 Playwright checks (desktop Chromium + mobile Pixel 7).
- `npm audit --omit=dev` — **PASS**: 0 production vulnerabilities.
- Full dependency audit still reports 20 moderate development-only advisories (ESLint/esbuild tooling); no non-breaking fix is available without a forced breaking downgrade.

### Phase 3B integration coverage

- Owner A/B isolation for hosts, incidents, invitations and key routes (404 for non-owned).
- Hostname validation, duplicate hostnames, idempotency replay/conflict.
- DNS challenge wrong value, expired challenge, private-IP target, exact TXT success and fixed HTTPS checker invocation.
- Enrollment code expiry, older-code revocation, concurrent double redemption (exactly one success), HMAC-only credential/token storage and certificate verification.
- Presence accepted, exact retry duplicate, lower-sequence replay, future/stale timestamps, wrong host and revoked key/credential.
- Incident duration boundaries, stale heartbeat, one active per host, max three per owner, concurrent create race, idempotency replay, owner isolation, end/idempotent end, future probe-job cancellation and sweeper auto-end.
- Renter invitation TTL/hash-only storage, concurrent double redemption (exactly one success), expired invitation, older-invitation revocation, one renter key per incident, scoped key revocation and owner isolation.

## Database and migration status

- **Staging database:** Supabase Postgres 17.11.
- **Migration ledger:** `iw_schema_migrations`.
- **Applied migrations:** `0001_phase2_schema` through `0012_phase3b_enroll_incident_lock`.
- **Roles:** `iw_api` and `iw_worker` are login roles with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`.
- **Schema decision:** `public.iw_uid()` security-definer wrapper remains approved and in use.
- **Platform key:** `iw-platform-staging-1` registered in `platform_signing_keys`; private key only in ignored `.env`.

## Design reference and approval status

- **Final visual design:** NOT STARTED.
- **Design references:** NOT COLLECTED/APPROVED.
- **Mockups:** NOT CREATED.
- **Operator approval:** NOT GRANTED.
- Phase 3B did not change frontend styling or visual behaviour.

## Documentation/footer status

- `docs/API_REFERENCE.md` updated with implemented Phase 3B endpoints, error codes, idempotency and lifecycle notes.
- `docs/CONFIGURATION.md` updated with `IW_API_BASE_URL` and platform-key provisioning.
- `README.md` updated with Phase 3B status, migration/provisioning and test commands.
- `/docs` route and footer Documentation/GitHub links remain unchanged and reachable from Phase 2.
- `/privacy` and `/terms` remain clearly labelled placeholders; no legal copy is approved.

## Known risks and operator actions

1. **Phase 3B pending acceptance:** host/incident APIs are implemented and tested but not operator-accepted. Do not start Phase 3C without explicit authorization.
2. **Staging platform key generated:** `.env` lacked the required platform signing key. A staging key was generated and registered as `iw-platform-staging-1`. The operator should confirm this trust anchor or rotate it through the documented overlap process.
3. **Manual end semantics:** `POST /end` records actual `endedAt` but leaves `captureEndsAt` as the bounded scheduled end because the Phase 2 schema enforces a minimum 2-minute capture window. Phase 3C must use `endedAt` as the effective end when earlier.
4. **Sweeper scope:** only auto-ends at `capture_ends_at`. Grace-expiry auto-seal/auto-cancel is Phase 3C.
5. **API not deployed:** no Render API deployment or new Vercel deployment for Phase 3B. Local staging verification only.
6. **No live endpoint verification:** production DNS/HTTPS checker is implemented but integration tests use injected resolver/checker; a real public hostname test remains outstanding.
7. **Credential provider SELECT policy:** `source_credentials_provider_select` was added so revocation can update linked rows. It is scoped to owned keys; the API never returns hashes. Review during Phase 9 security pass.
8. **Development advisories:** 20 moderate development-only npm advisories remain; `npm audit --omit=dev` is clean.
9. **Fastify deprecation warning:** `requestIdLogLabel` is deprecated in Fastify 5 and will be removed in Fastify 6. Existing Phase 2 configuration; non-blocking.
10. **No Phase 3C+ functionality:** no event ingestion, sealing, bundles, host agent, renter SDK, probe worker or verifier.

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

**Phase 3C only — signed event ingestion, correlation and sealing — awaiting explicit operator authorization.** Do not start Phase 3C from this checkpoint.
