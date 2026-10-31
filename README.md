# Incident Witness

**When infrastructure fails, evidence speaks.**

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed observations from a GPU host, a renter-side workload client and a separately operated platform probe; correlates them into a time-ordered record; and seals a JSON evidence bundle that can be checked locally for integrity and signatures.

> **Important limitation:** a valid signature proves that data has not changed after it was signed by a particular key. It does not prove that a sensor was truthful, a host was uncompromised or an inferred cause is correct. Incident Witness reports evidence patterns and unknowns; it does not adjudicate a marketplace dispute or automatically excuse downtime.

## Project status

Phase 2 backend/data/auth foundation is implemented and pending operator acceptance. It adds the
Fastify API foundation, the Drizzle schema and SQL migrations for the 14 approved tables, restricted
`iw_api`/`iw_worker` roles, RLS policies, Supabase JWT verification and Supabase email OTP sign-in.
The provider routes are protected by the web auth guard; host, incident, evidence, agent, SDK,
probe-worker and verifier functionality remain later phases.

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

Phase 2 uses Node.js 26.13.0 and npm workspaces. The local interface is:

```bash
npm ci
npm run db:provision-roles
npm run db:migrate
npm run db:migrate:status
npm run dev:api
npm run dev
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

`npm test` runs the staging database integration tests (including ADR-001 T01–T14) followed by the
API Vitest suite. It requires the staging `.env` credentials and must never be run against
production. `npm run test:e2e` runs the Playwright public-route, auth-redirect, navigation and footer
checks at desktop and mobile viewport sizes.

The database migration runner uses `DATABASE_URL_MIGRATOR`. The API and probe worker use the
restricted `DATABASE_URL_IW_API` and `DATABASE_URL_IW_WORKER` roles. See `docs/CONFIGURATION.md`
and the accepted ADR for the role/GUC design.

Local Phase 2 verification on 2026-10-31 passed dependency installation, lint, typecheck, build,
14 ADR-001 database integration tests, 10 API unit tests and 36 Playwright checks. Actual results
and any remaining blockers are recorded in `AI_HANDOFF.md`.

### Database setup

1. Provision the restricted roles from the configured URLs with `npm run db:provision-roles`.
2. Apply the versioned migrations with `npm run db:migrate`.
3. Confirm migration status with `npm run db:migrate:status`.

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

## Deployment lifecycle

The first implementation milestone was a navigable skeletal frontend deployed to a stable Preview URL. The Preview must use staging/test data only and be updated at each verified checkpoint. Phase 2 authentication uses Supabase Auth; no production database or production secrets are used in Preview. Core functionality must pass end-to-end before final visual design begins. Final design requires operator-approved references and mockups. Production deployment requires separate explicit operator authorization. See `IMPLEMENTATION_PLAN.md`.

## Contributions and AI coding agents

Read `AGENTS.md` before making changes. Implement one assigned phase/task only, test it, inspect the diff, commit, update `AI_HANDOFF.md`, report evidence and stop. Do not change architecture, product behaviour, business rules or security without operator approval.

## Research and validation status

The source research found a plausible infrastructure evidence gap and adjacent tooling, but user demand, marketplace acceptance, willingness to pay and full novelty are unresolved. The project is selected for implementation by the operator; that decision does not convert these open research questions into validated claims. Read [`docs/RESEARCH_AND_ASSUMPTIONS.md`](./docs/RESEARCH_AND_ASSUMPTIONS.md).
