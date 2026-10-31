# Incident Witness

**When infrastructure fails, evidence speaks.**

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed observations from a GPU host, a renter-side workload client and a separately operated platform probe; correlates them into a time-ordered record; and seals a JSON evidence bundle that can be checked locally for integrity and signatures.

> **Important limitation:** a valid signature proves that data has not changed after it was signed by a particular key. It does not prove that a sensor was truthful, a host was uncompromised or an inferred cause is correct. Incident Witness reports evidence patterns and unknowns; it does not adjudicate a marketplace dispute or automatically excuse downtime.

## Project status

Phase 3C API-side signed event ingestion, deterministic correlation and bundle sealing are accepted
and closed. The API accepts canonical Ed25519-signed host and renter events, enforces incident time
windows and atomic evidence budgets, runs the pure `@incident-witness/correlator` rule engine, seals
an immutable bundle in one transaction, and serves the exact bundle to its owner.

Phase 3D adds the accepted Linux x86_64 host agent in `packages/host-agent`: interactive enrollment
with a local Ed25519 key, owner-only key/credential storage, a 50 MiB SQLite spool with durable event
and presence sequences, signed operational-presence heartbeats, evidence heartbeats, fixed-argument
`nvidia-smi`/`upsc` collectors, and bounded retry/backoff.

Phase 3E adds the accepted renter SDK in `packages/renter-sdk` and the separate secure platform probe
worker in `apps/probe-worker`. The SDK redeems a one-use invitation, signs 30-second heartbeats and
60-second/state-change endpoint observations into a bounded 5 MiB queue. The worker leases
`probe_jobs`, resolves and pins the provider IP, enforces SSRF/DNS-rebinding controls, performs the
fixed HTTPS health check, signs `platform_probe_result` events and appends them as the restricted
`iw_worker` role.

Phase 3F adds the offline `iw-verify` CLI in `tools/iw-verify` and the synthetic end-to-end demo
harness in `tools/demo-harness`. The CLI validates schema/version, manifest digest, pinned platform
key/signature, source certificates, event signatures/digests and deterministic ordering without any
network request. The harness runs a fully labelled simulated power-pattern lifecycle against the
staging database, seals/downloads the bundle, verifies it and demonstrates one-byte tamper detection.
Phase 3F is accepted and closed.

Phase 4 connects the provider workspace to the staging API: Supabase-authenticated API calls, host
list/create/detail, DNS challenge and endpoint verification, enrollment-code display, host key
revocation and archival, evidence-session list/create/detail, renter invitations, source health,
timeline, end/seal/download and the local browser bundle verifier. The UI remains structurally plain
because the final visual design is not approved. The API is still not deployed to Render.

Phase 5 hardens the MVP gate: platform-probe source certificates can be read by the seal transaction,
event sequence rollback is rejected, probe observations stop at the effective capture end, stale
source polling is visibly labelled, and UPS/GPU `unavailable` telemetry is shown in the timeline.
`render.yaml` now describes the API Render service using Infrastructure as Code.

Phase 3B host/incident domain APIs are accepted and closed. The API supports owner-scoped host CRUD,
DNS TXT endpoint verification with public-IP/SSRF checks, host enrollment and signed operational
presence, bounded incident creation/end with a lifecycle sweeper, renter invitations and scoped
enrollment, key revocation, host archival, audit events and `Idempotency-Key` handling.

Phase 2 backend/data/auth foundations remain in place: the Fastify API foundation, the Drizzle
schema and SQL migrations for the 14 approved tables, restricted `iw_api`/`iw_worker` roles, RLS
policies, Supabase JWT verification and Supabase email OTP sign-in. Provider routes are protected by
the web auth guard and now use real API data.

Public routes are `/`, `/login`, `/verify`, `/docs`, `/privacy`, `/terms`, and the not-found route.
Protected placeholder routes are `/dashboard`, `/hosts`, `/hosts/new`, `/hosts/[hostId]`,
`/incidents`, `/incidents/new`, `/incidents/[incidentId]` and `/settings`; unauthenticated requests
are redirected to `/login`. The data-backed pages remain explicitly labelled placeholders.

## Source-of-truth documentation

- [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) — product definition, MVP scope, roles, flows, business rules, acceptance criteria and UI structure.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack, database, API, cryptographic protocol, security, deployment and operations.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — one-phase-at-a-time implementation sequence and hard gates.
- [`AGENTS.md`](./AGENTS.md) — mandatory instructions for AI coding agents.
- [`AI_HANDOFF.md`](./AI_HANDOFF.md) — current phase, preview, tests, approval status and exact next task.
- [`docs/`](./docs/) — supporting research, setup, protocol, operational and user documentation.
- [`docs/SOURCE_TRACEABILITY.md`](./docs/SOURCE_TRACEABILITY.md) — maps decisions to supplied source material and engineering judgement.

## Planned MVP

A provider should be able to register a Linux host, prove control of a public HTTPS hostname, enroll a local host agent, create a bounded evidence session, invite a renter-side client, collect signed observations, seal a deterministic evidence bundle and verify that bundle offline. The first supported host target is Linux x86_64. A public HTTPS health endpoint is required; NAT-only hosts are not supported by this initial scope.

## Planned technology

Node.js 26.13.0 LTS (released 2026-10-28), TypeScript, npm workspaces, Next.js 16.4.x App Router (16.4.3 current stable checked 2026-10-30), Tailwind CSS 4.x, Fastify 5, Supabase Postgres/Auth, `@supabase/ssr` (beta; pinned behind an adapter), Drizzle, `pg`, `jose`, RFC 8785 canonical JSON, Ed25519, a SQLite host-agent spool, a renter TypeScript SDK, a Render probe worker, Vercel frontend deployment, Vitest, Playwright and pgTAP. See `ARCHITECTURE.md` for responsibilities and security constraints.

## Development commands

The repository uses Node.js 26.13.0 and npm workspaces. The local interface is:

```bash
npm ci
npm run db:provision-roles
npm run db:migrate
npm run db:provision-platform-key
npm run db:migrate:status
npm run dev:api
npm run dev
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration --workspace @incident-witness/api
npm run test:e2e
```

`npm test` runs the protocol, correlator, ADR-001 database, host-agent, renter SDK, probe worker and
API unit suites. The Phase 3B API integration suite is run explicitly with
`npm run test:integration --workspace @incident-witness/api` because it requires staging
credentials and must never be run against production. The probe-worker database/RLS integration test
runs explicitly with `npm run test:integration --workspace @incident-witness/probe-worker`.
`npm run test:e2e` starts a local test-mode API and Next.js development server, then runs the
Playwright public-route, auth-redirect, navigation, footer, provider lifecycle and local-verifier
checks at desktop and mobile viewport sizes. The E2E servers use test-only authentication and DNS
adapters (`IW_E2E_*`/`NEXT_PUBLIC_IW_E2E_*`) that are unavailable in production mode; they never use
production credentials or production data.

The database migration runner uses `DATABASE_URL_MIGRATOR`. The API and probe worker use the
restricted `DATABASE_URL_IW_API` and `DATABASE_URL_IW_WORKER` roles. See `docs/CONFIGURATION.md`
and the accepted ADR for the role/GUC design.

Local Phase 3C verification on 2026-10-31 passed lint, typecheck, build, 20 protocol tests,
12 correlator tests, 14 ADR-001 database tests, 17 API unit tests, 57 API integration tests and
36 Playwright checks. Phase 3D added 49 host-agent tests. Phase 3E added 14 renter-SDK tests,
20 probe-worker unit tests, one probe-worker database/RLS integration test and one correlator
regression check for probe-service errors. Phase 3F added 11 CLI verifier tests and two staging demo
harness tests. Phase 4 adds four API test-seam guard tests and a full-stack Playwright provider flow
plus local-verifier checks. Phase 5 adds platform-probe sealing, sequence-rollback, readiness, worker
effective-end and telemetry/stale UI coverage. Final results: 164 unit tests, 60 API integration
tests, 2 probe-worker integration tests, 42 Playwright checks (41 passed, one intentional mobile
provider-flow skip) and a clean demo harness. Actual results and remaining blockers are recorded in
`AI_HANDOFF.md`.

### Renter SDK and probe worker

```bash
npm run build --workspace @incident-witness/renter-sdk
npm run build --workspace @incident-witness/probe-worker
npm run test --workspace @incident-witness/renter-sdk
npm run test --workspace @incident-witness/probe-worker
npm run test:integration --workspace @incident-witness/probe-worker
```

See [`docs/RENTER_SDK.md`](./docs/RENTER_SDK.md) and
[`docs/PROBE_WORKER.md`](./docs/PROBE_WORKER.md). The probe key must be provisioned before a live
worker can start.

### Platform probe key provisioning

`npm run db:provision-probe-key` registers the platform-probe public key, fingerprint and
platform-signed `platform_probe` certificate in `witness_keys`. It never writes the private key to the
database or prints it.

To generate a new probe keypair locally (the private key is written only to the requested file with
mode `0600`, and the public half is registered):

```bash
export IW_PLATFORM_PROBE_KEY_ID="<witness_keys UUID>"
npm run db:provision-probe-key -- --generate --out secrets/probe-worker.pk8
```

`secrets/` is git-ignored. Put the generated file's base64 contents into the worker-only
`IW_PLATFORM_PROBE_PRIVATE_KEY` secret; never commit it or expose it to the web/API runtime. To
provision an operator-managed key instead, set `IW_PLATFORM_PROBE_PRIVATE_KEY` (base64 PKCS8 DER
Ed25519) and run `npm run db:provision-probe-key` without `--generate`. A key ID with different
existing key material is rejected rather than replaced.

### Host agent

The Phase 3D Linux host agent is built with:

```bash
npm run build --workspace @incident-witness/host-agent
node packages/host-agent/dist/cli.js version
```

Enrollment prompts for the one-time code on standard input; the code is never accepted as an
argument or environment variable. See [`docs/HOST_AGENT.md`](./docs/HOST_AGENT.md) for enrollment,
configuration permissions, spool/quota behaviour, fixed collectors and limitations.

### Database setup

1. Provision the restricted roles from the configured URLs with `npm run db:provision-roles`.
2. Apply the versioned migrations with `npm run db:migrate`.
3. Register the platform public key with `npm run db:provision-platform-key`.
4. Provision the platform-probe source key with `npm run db:provision-probe-key` before starting the
   probe worker.
5. Confirm migration status with `npm run db:migrate:status`.

Migrations are in `packages/db/migrations/`. The migration ledger is `iw_schema_migrations`.
Supabase's `auth` schema is owned by `supabase_admin`; because the staging migrator cannot grant
schema usage to `iw_api`, the RLS policies use a narrow security-definer `public.iw_uid()` wrapper
that calls `auth.uid()`. No `SET ROLE authenticated` or service-role connection is used. This
environment-specific detail is recorded in `AI_HANDOFF.md`.

### Authentication setup

The web login uses Supabase email OTP through the pinned `@supabase/ssr` adapter. The Supabase
email template must include the one-time token, and the local/Preview origins must be allow-listed
in the Supabase Auth redirect settings. Those dashboard settings are not verifiable from the
repository and remain an operational prerequisite for a live OTP delivery test.

## Configuration

See [Environment and configuration](./docs/CONFIGURATION.md). Secrets belong in local ignored `.env` files or the approved hosting secret manager. `.env.example` must contain placeholders only. Never commit Supabase service-role/secret keys, database URLs, platform signing keys, host credentials, renter credentials, enrollment/invitation tokens or private keys.

## Verification model

The protocol uses RFC 8785 JSON Canonicalization Scheme via pinned `canonicalize@5.1.0`, SHA-256 and Ed25519. The shared protocol package has explicit Node and browser entry points: Node services/agents use built-in `node:crypto` for signing and verification; the browser verifier uses `@noble/ed25519` 3.2.x for public-key verification only. Shared RFC 8785 canonicalization test vectors and RFC 8032 Ed25519 golden vectors must prove cross-runtime parity. Web verification is local to the browser; bundle contents are not uploaded for checking. Trust is anchored to a versioned, pinned platform public-key set. A valid result establishes integrity and signatures relative to those keys—not the truth of underlying readings.

### Offline CLI verifier

The Phase 3F CLI verifies a downloaded bundle without uploading it or making any network request:

```bash
npm run build --workspace @incident-witness/cli-verifier
node tools/iw-verify/dist/cli.js path/to/incident-witness-bundle.json
# or:
npm run verify -- path/to/incident-witness-bundle.json
```

Exit code `0` means the schema, versions, manifest digest, pinned platform key/signature, source
certificates, event signatures/digests and sequence/order checks all pass. Exit code `1` means the
bundle is invalid or was modified. Exit code `2` means the bundle file is missing/unparseable or the
trust set cannot be loaded. The pinned public-key set is
[`tools/iw-verify/trusted-platform-keys.json`](./tools/iw-verify/trusted-platform-keys.json); it
contains public keys only. Use `--trust <path>` for a separately operated trust set.

The public `/verify` page uses the same protocol browser export and a pinned public-key set in
`apps/web/lib/verify/trusted-platform-keys.ts`. It reads the selected file with the browser File API
and performs all checks locally; it does not upload the bundle or call the API. The page reports
schema, manifest digest, pinned platform key/signature, source certificates, event
signatures/digests, ordering and bundle consistency separately, and always shows the limitations.

### Synthetic integration demo

The Phase 3F demo harness runs the full local lifecycle against the configured staging database: a
disposable provider, host, simulated host agent and renter enrollment, a labelled demo session,
signed synthetic power/reachability events, end, seal, bundle download, CLI verification and a
one-byte tamper check.

```bash
npm run demo
npm run test:demo
```

Every generated event carries `simulation_mode: true`, the session is created with `demoMode: true`,
and the sealed manifest has `simulation_present: true` with a grade capped at `LOW`. The harness does
not collect real GPU, UPS or renter workload telemetry. It seeds a disposable staging auth user with
the migrator role and uses an in-process API instance; it does not use production data or deploy
anything.

## Render API deployment

The repository root contains `render.yaml` for the `incident-witness-api` web service. It builds the
protocol, correlator, database and API workspaces, then starts `node apps/api/dist/index.js`.
The API entrypoint imports the existing Fastify server entrypoint so the Render start command and
the package's local `node dist/server.js` command remain compatible.

Before the service can become ready:

1. Link `render.yaml` in the Render dashboard.
2. Set the required server-only environment variables from
   [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md), including the staging/production Supabase
   values, `DATABASE_URL_IW_API`, `IW_TOKEN_PEPPER`, `IW_PLATFORM_SIGNING_PRIVATE_KEY`,
   `IW_PLATFORM_KEY_ID`, `APP_BASE_URL`, `IW_ALLOWED_WEB_ORIGINS` and `IW_HEALTHCHECK_TOKEN`.
3. Apply migrations through `0022` with `npm run db:migrate` using `DATABASE_URL_MIGRATOR`.
4. Set the Vercel `NEXT_PUBLIC_API_BASE_URL` to the deployed API origin and redeploy the web app.

The API readiness endpoint checks the migration ledger and returns 503 until the expected migration
is applied. Do not put server-only secrets in `NEXT_PUBLIC_*` variables.

## Deployment lifecycle

The first implementation milestone was a navigable skeletal frontend deployed to a stable Preview URL. The Preview must use staging/test data only and be updated at each verified checkpoint. Phase 2 authentication uses Supabase Auth; no production database or production secrets are used in Preview. Core functionality must pass end-to-end before final visual design begins. Final design requires operator-approved references and mockups. Production deployment requires separate explicit operator authorization. See `IMPLEMENTATION_PLAN.md`.

## Contributions and AI coding agents

Read `AGENTS.md` before making changes. Implement one assigned phase/task only, test it, inspect the diff, commit, update `AI_HANDOFF.md`, report evidence and stop. Do not change architecture, product behaviour, business rules or security without operator approval.

## Research and validation status

The source research found a plausible infrastructure evidence gap and adjacent tooling, but user demand, marketplace acceptance, willingness to pay and full novelty are unresolved. The project is selected for implementation by the operator; that decision does not convert these open research questions into validated claims. Read [`docs/RESEARCH_AND_ASSUMPTIONS.md`](./docs/RESEARCH_AND_ASSUMPTIONS.md).
