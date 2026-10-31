# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 2 backend/data/auth foundation accepted and closed. Phase 3A protocol and cryptographic core implemented; Phase 3A checkpoint pending operator acceptance. Phase 3B has not started.

**Current phase:** Phase 3A — IMPLEMENTED, PENDING OPERATOR ACCEPTANCE.

**Next task:** Phase 3B only, awaiting explicit operator authorization.

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
- Supabase's staging `auth` schema is owned by `supabase_admin`; the migrator cannot grant `auth` USAGE to `iw_api`. Policies therefore call a narrow `SECURITY DEFINER` wrapper `public.iw_uid()` which calls `auth.uid()`. No role switch, service-role connection or auth-schema grant to `iw_api` is used. **Operator approved this wrapper on 2026-10-31;** it preserves the ADR-001 transaction-local identity model without exposing the `auth` schema.
- Linux host agent, renter SDK, platform probe worker, evidence ingestion, sealing and bundle verifier are **not implemented** (Phase 3+).

## Repository state

- **Repository URL:** confirmed public — https://github.com/onyebuchidaniel60/incident-witness
- **Working directory/repo root:** `/root/incident-witness`
- **Branch:** `main`
- **Phase 2 commits:**
  - `f6e5632c220f1f91fadc15de93e8ace302332623` — `feat(db): add schema roles and RLS foundation`
  - `6c6597a95b5091748bdb8a6d17c7afd889bb4075` — `feat(api): add Fastify foundation and JWT auth`
  - `6b02c1a4081833879fe892ef9831f387d52b402c` — `feat(web): connect Supabase OTP auth guard`
  - `29547c8a86a13c83ad3289636767855bdca1446b` — `docs: document Phase 2 setup and CI coverage`
- **Deployed implementation SHA:** `29547c8a86a13c83ad3289636767855bdca1446b`
- **Node runtime:** confirmed `v26.13.0`; npm `11.20.0`; `.node-version` pins `26.13.0`.

## Phase 2 deployment checkpoint

- **Deployed URL (Git-attested production deployment):** https://incident-witness-2zb16ifpw-uhhh2.vercel.app
- **Stable aliases:** https://incident-witness.vercel.app and https://incident-witness-git-main-uhhh2.vercel.app
- **Deployment ID:** `dpl_J3PLLpQaSg9nNibqQkQj6q7T2Xnf`
- **Deployed SHA:** `29547c8a86a13c83ad3289636767855bdca1446b`
- **Deployment target/status:** Production; `READY`; Git metadata matched `main`.
- **Git attestation:** Confirmed from Vercel deployment metadata (`githubCommitSha`, `githubCommitRef`, `githubCommitOrg`, `githubCommitRepo`).
- **Vercel Authentication:** **DISABLED** (`ssoProtection: null`; no protection-bypass secret remains).
- **Production authorization:** Operator previously authorized the `main` branch to deploy the static shell to Production. This Phase 2 deployment is the same static/auth shell with no provider data.
- **Preview:** no separate Preview URL was created for this commit; the Git-connected `main` deployment targets Production.
- **API deployment:** **not deployed to Render**. The deployed web app uses Supabase Auth directly; it does not call a deployed API. The Fastify health endpoints and `/v1/me` were verified locally against staging.
- **Safe staging:** web deployment uses public Supabase URL/publishable-key configuration for the staging project; no server-only secrets, database URLs, platform signing keys or host credentials are available to the browser. No production database or production secrets are used.
- **Deployment checks:** `/`, `/login`, `/docs`, `/verify` return 200; protected `/dashboard` and `/settings` return redirects to `/login?next=...`; login form renders at mobile viewport; no deployed client-bundle sensitive markers found.

## Completed in Phase 2

- `packages/db` Drizzle schema for all 14 approved tables, enums, constraints, indexes and ownership relationships.
- Versioned SQL migrations `0001`–`0008`, applied to the staging Supabase database; dedicated `iw_schema_migrations` ledger.
- Restricted `iw_api` and `iw_worker` login roles with `NOSUPERUSER` and `NOBYPASSRLS`.
- RLS enabled on all 14 product tables, with 42 policies covering provider ownership, machine-ingest scope and worker operations.
- Column/table grants for `iw_api`, `iw_worker`; no product-table grants for `anon`, `authenticated` or `PUBLIC`.
- Provider transaction wrapper sets `request.jwt.claim.sub` and `iw.request_mode` transaction-locally; no `SET ROLE`.
- Fastify API foundation with:
  - `GET /health/live` (no DB).
  - `GET /health/ready` (protected health token + DB/migration readiness).
  - `GET /v1/me` (JWT-protected, idempotent profile bootstrap).
  - Pino redaction, request IDs, safe error envelope, CORS allow-list, rate limiting and Helmet.
  - `jose` JWT verification with ES256/RS256 allow-list, issuer/audience/expiry checks and UUID subject validation.
- Web Supabase Auth foundation:
  - `@supabase/ssr` browser/server adapters.
  - `proxy.ts` session refresh and protected-route redirect.
  - Server-side `AuthGuard` on dashboard routes.
  - Functional `/login` email OTP request and verification form.
  - Functional sign-out control on `/settings`.
- Playwright tests updated for public routes and unauthenticated protected redirects.
- CI updated to run lint, typecheck, API unit tests and build; database integration tests remain explicit staging commands because they require staging credentials.
- README Phase 2 setup, migration, auth and test instructions.

## Completed in Phase 3A

- `packages/protocol` created as a pure TypeScript package with no database, network or UI dependency.
- Strict `Zod` v1 schemas for the event envelope and all eight event types:
  `host_heartbeat`, `host_power_state`, `gpu_telemetry`, `host_agent_status`,
  `renter_heartbeat`, `renter_endpoint_result`, `platform_probe_result`, `source_gap`.
- Unknown fields are rejected at every object boundary; unsafe/non-finite numbers, invalid Unicode,
  malformed signatures and invalid base64url are rejected.
- RFC 8785 JCS canonicalization uses the exact pinned `canonicalize@5.1.0` dependency.
- Canonical raw-body parsing rejects duplicate keys at any depth and requires exact canonical bytes.
- SHA-256 and Ed25519 helpers; Node uses `node:crypto`; browser public-key verification uses
  `@noble/ed25519@3.2.0`.
- Source-key certificate creation/verification and bundle-manifest digest/signature creation/verification.
- ESM/CommonJS builds with declarations; explicit `./node` and `./browser` exports.
- Cross-runtime tests include RFC 8032 vector 1, RFC 8785 vectors, duplicate-key/I-JSON vectors,
  Node/noble identical signatures, Node/browser verification, source-certificate and bundle
  verification, unknown key, invalid signature, algorithm change and single-byte tamper detection.
- Browser bundle inspection confirms no Node built-in imports and no private signing exports.

## Visible behaviour vs placeholders

**Functional locally and/or in the deployed shell:**

- Public pages render and navigate.
- `/login` requests and verifies Supabase OTP codes; protected routes redirect when no session exists.
- Supabase session refresh is wired through `proxy.ts`; `AuthGuard` checks the server session.
- `/docs`, footer Documentation link and approved GitHub link work.
- API liveness and readiness work; readiness checks DB connectivity and migration version.
- API JWT rejection paths return the documented error shape.
- Database migration, role and RLS behavior is evidenced by automated staging tests.

**Placeholder or unverified:**

- Hosts, incidents, source health, timeline, evidence events, sealing, bundles and verifier remain placeholder/absent.
- `/v1/me` is implemented but has not been exercised with a real Supabase-issued user token from the deployed web app.
- Actual OTP email delivery has not been tested because Supabase email-template and redirect allow-list configuration is external to the repository.
- API is not deployed to Render; the deployed web shell does not use an API origin.
- No Phase 3 event ingestion, host agent, renter SDK, platform probe or bundle sealing exists.

## Tests and evidence

Run on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm ci` — **PASS** (529 packages; clean install from lockfile; development advisories reported separately).
- `npm run lint` — **PASS** across protocol, web, API and DB packages.
- `npm run typecheck` — **PASS** across protocol, web, API and DB packages.
- `npm run build` — **PASS**; protocol ESM/CJS/declarations, Next.js 16.4.3, Fastify/TS and DB packages built.
- `npm test` — **PASS**: 20/20 protocol tests, 14/14 ADR-001 staging integration tests and 10/10 API unit tests.
- `npm run test:e2e` — **PASS**: 36/36 Playwright checks across desktop Chromium and mobile Pixel 7 profiles.
- Browser bundle check — **PASS**: `dist/browser.js`/`browser.cjs` contain no Node built-in imports or private signing exports.
- ESM/CJS package check — **PASS**: both runtime entry points load and export the expected API.
- `npm run db:migrate:status` — **PASS**: migrations `0001`–`0008` applied.
- Database shape: 14 product tables; 42 RLS policies.
- `npm audit --omit=dev` — **PASS**: 0 production vulnerabilities.
- Full dependency audit reports 20 moderate development-only advisories (ESLint/esbuild tooling); no non-breaking fix is available without a forced breaking downgrade.
- API local staging checks:
  - `GET /health/live` → 200 `{status:"ok"}`
  - `GET /health/ready` without token → 401
  - `GET /health/ready` with health token → 200 `{status:"ready"}`
  - `GET /v1/me` without token → 401 documented envelope
  - `GET /v1/me` with invalid token → 401 `AUTH_INVALID`
  - CORS preflight from the approved local origin → 204 with allowed origin
  - Authorization sentinel absent from Pino logs
- Deployed checks:
  - `GET /`, `/login`, `/docs`, `/verify` → 200
  - `GET /dashboard`, `/settings` without session → 307 redirect to `/login?next=...`
  - Login form rendered and protected redirect checked with mobile Playwright viewport
  - No sensitive server-only markers found in deployed HTML or referenced client JS

### ADR-001 test coverage

All 14 ADR-001 §5 tests ran against the real staging Supabase database using the real `iw_api`/`iw_worker` roles:

- T01 role attributes: PASS
- T02 grant matrix: PASS
- T03 transaction-local JWT identity: PASS
- T04 pool-reuse isolation: PASS
- T05 rollback isolation: PASS
- T06 cross-owner database isolation: PASS
- T07 policy targeting/default deny: PASS
- T08 scoped machine-ingest context: PASS
- T09 worker boundaries: PASS
- T10 role-escalation/bypass attempts: PASS
- T11 session-pooler identity/scoping: PASS
- T12 auth.uid/wrapper alignment: PASS
- T13 immutable evidence/audit: PASS
- T14 transaction-failure rollback: PASS

The test suite seeds disposable auth users/profiles and removes them in `afterAll`; no production data is used.

## Database and migration status

- **Staging database:** Supabase Postgres 17.11.
- **Migration ledger:** `iw_schema_migrations`.
- **Applied migrations:** `0001_phase2_schema`, `0002_roles_and_grants`, `0003_rls`, `0004_health_grants`, `0005_uid_wrapper`, `0006_ledger_grants`, `0007_ledger_rls`, `0008_ledger_revoke_defaults`.
- **Roles:** `iw_api` and `iw_worker` are login roles with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`.
- **Schema decision:** `public.iw_uid()` security-definer wrapper is approved for the staging project because `auth` schema usage cannot be granted to `iw_api`; it calls `auth.uid()` and preserves transaction-local claim semantics.
- **Role passwords:** supplied only through the ignored local `.env`; no credential is committed or printed.

## Design reference and approval status

- **Final visual design:** NOT STARTED.
- **Design references:** NOT COLLECTED/APPROVED.
- **Mockups:** NOT CREATED.
- **Operator approval:** NOT GRANTED.
- Phase 2 uses temporary, generic styling only. No final visual direction has been implemented.

## Documentation/footer status

- Root documentation and `docs/` remain the source of truth.
- `/docs` route exists and is reachable on the deployed shell.
- Footer Documentation and approved public GitHub links are present.
- `/privacy` and `/terms` remain clearly labelled placeholders; no legal copy is approved.
- README contains Phase 2 database/auth setup, migration and test instructions.

## Known risks and operator actions

1. **ADR-001 implementation decision:** the staging Supabase project does not permit the migrator to grant `auth` schema usage to `iw_api`; policies use `public.iw_uid()` as a security-definer wrapper around `auth.uid()`. The operator approved this wrapper on 2026-10-31; it preserves the no-role-switch intent without exposing the `auth` schema.
2. **OTP delivery unverified:** Supabase email template must include `{{ .Token }}` and the local/Vercel origins must be allow-listed in Supabase Auth. No real one-time email was requested or verified in this task.
3. **API not deployed:** Fastify runs locally and its health/error/JWT behavior was verified there; Render API/worker services are not configured. The deployed web shell does not call an API.
4. **Vercel Authentication disabled:** `ssoProtection` is `null`; the deployed shell is publicly reachable. It contains no provider data or server secrets, but enable protection if public access is not intended.
5. **Deployment uses staging auth configuration:** Vercel Preview/Production public Supabase settings point at the staging project for this checkpoint. No production database or secret is used; this is not a production-ready environment.
6. **CI scope:** CI runs lint, typecheck, API unit tests and build. ADR-001 integration tests require staging credentials and are run locally/explicitly with `npm test`; repository-wide CI must not receive production credentials.
7. **Development advisories:** 20 moderate development-only npm advisories remain; `npm audit --omit=dev` is clean. Do not run a forced dependency downgrade.
8. **Phase 3A is pending operator acceptance:** the protocol schemas and bundle/certificate shapes are implemented and tested, but the final protocol interface has not yet been formally accepted. Phase 3B must not start until this checkpoint is accepted.
9. **No Phase 3B+ functionality:** no event ingestion, host agent, renter SDK, probe worker or evidence sealing exists yet.

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

**Phase 3B only — host/incident domain APIs and transactional lifecycle — awaiting explicit operator authorization.** Do not start Phase 3B from this checkpoint.
