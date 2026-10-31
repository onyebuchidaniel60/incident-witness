# Incident Witness

**When infrastructure fails, evidence speaks.**

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed observations from a GPU host, a renter-side workload client and a separately operated platform probe; correlates them into a bounded, time-ordered record; and seals a JSON evidence bundle that can be checked locally for integrity and signatures.

> **Important limitation:** a valid signature proves that data has not changed after it was signed by a particular key. It does not prove that a sensor was truthful, a host was uncompromised or an inferred cause is correct. Incident Witness reports evidence patterns and unknowns; it does not adjudicate a marketplace dispute, change a reliability score or automatically excuse downtime. The platform probe is operated by Incident Witness, not by an independent third party.

## Project status

Phases 0–7 are complete and accepted. Phase 8 frontend and documentation completeness is implemented and test-verified; operator acceptance is pending.

Phase 8 adds:

- a real in-app documentation destination at `/docs` covering quick start, host-agent installation and enrollment, renter SDK integration, the signed evidence protocol and limitations;
- real `/privacy` and `/terms` routes that state clearly that operator-approved legal review is pending;
- page titles, descriptions, canonical URLs, a favicon, OpenGraph/Twitter metadata, `robots.txt` and `sitemap.xml`;
- `noindex` rules for authenticated provider routes and the sign-in page, with public-only sitemap entries;
- working footer links to Documentation, Privacy, Terms, Verify and the public GitHub repository;
- styled 404 and error states with links back to safety;
- keyboard, accessible-name, focus and status-text checks, plus link-crawl coverage.

Phase 8 does **not** change business logic, API contracts, database schemas, the cryptographic protocol or verifier behaviour.

Current deployment: the Next.js web app is deployed on Vercel against the staging Supabase project. The Fastify API and probe worker are **not deployed to Render** from this repository state. Provider data pages therefore require a locally running or otherwise reachable API origin configured through `NEXT_PUBLIC_API_BASE_URL`.

## Quick start

### Prerequisites

- Node.js 26.13.0 (pinned in `.node-version`) and npm 11.20.0.
- A Supabase staging project with Postgres and Auth enabled.
- Network access to the staging database for migrations and integration tests.
- Optional: NVIDIA `nvidia-smi` and Network UPS Tools `upsc` on a Linux x86_64 host.

### Install and configure

```bash
npm ci
cp .env.example .env
```

Fill `.env` with local/staging values. Never commit `.env`, database URLs, signing keys, service-role keys or credentials. Browser-visible values must be limited to the `NEXT_PUBLIC_*` entries. The web app reads the root `.env`; `apps/web/.env.local.example` lists the relevant public names.

Database and platform-key provisioning:

```bash
npm run db:provision-roles
npm run db:migrate
npm run db:provision-platform-key
npm run db:migrate:status
```

The migration runner uses `DATABASE_URL_MIGRATOR`. The API uses `DATABASE_URL_IW_API`; the probe worker uses `DATABASE_URL_IW_WORKER`. Both runtime roles are non-superuser and do not bypass RLS. See [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) and the accepted ADR in [`docs/adr/`](./docs/adr/).

### Run locally

```bash
# Terminal 1 — Fastify API
npm run dev:api

# Terminal 2 — Next.js web app
npm run dev
```

The web app runs at `http://localhost:3000`; the API defaults to `http://localhost:4000`. Set `IW_ALLOWED_WEB_ORIGINS` and `NEXT_PUBLIC_API_BASE_URL` consistently.

### Authentication

The provider login uses Supabase's default **magic-link email** flow rather than a six-digit OTP. This is an operator-approved deviation from the original OTP wording: it avoids the Supabase free-tier custom-SMTP and editable-template requirement.

- The form calls `signInWithOtp` with `emailRedirectTo=/auth/callback`.
- `/auth/callback` exchanges the code for a session, writes the Supabase cookies onto the redirect response and sends the provider to `/dashboard`.
- A failed callback redirects to `/login?error=invalid_link`.
- Every deployment origin and `/auth/callback` must be allow-listed in Supabase Auth redirect settings.
- Authenticated routes are protected by `proxy.ts` and a server-side user check before any provider API call. Unauthenticated requests redirect to `/login?next=…` without flashing an API error.

The normal provider login uses no custom SMTP, external identity provider or service-role key. The optional judge-demo bypass below uses a server-only service-role key for the fixed demo account only.

### Hackathon judge demo login (opt-in)

The home page can show a clearly labelled **Enter as Judge / Try Demo** button for judges. It POSTs to `/api/demo-login`, which creates a session only for the fixed, pre-seeded demo account `judge@incidentwitness.com`. The route accepts no email address from the browser and cannot sign in any other user.

The route is disabled by default in production. It requires **both**:

- `SUPABASE_SERVICE_ROLE_KEY` set as a server-only Vercel environment variable; and
- `IW_ENABLE_DEMO_LOGIN=true` explicitly set for the deployment.

To enable it for a hackathon:

1. Seed the demo account and a sealed sample incident against staging:

   ```bash
   npm run seed:judge-demo
   ```

   The script creates/updates the confirmed demo user, a verified host, a signed demo session and a sealed bundle. It is safe to re-run; it resets only the demo account's data.

2. In Vercel → Project → Settings → Environment Variables, add `SUPABASE_SERVICE_ROLE_KEY` for the desired environment (Preview and/or Production). Use the Supabase secret/service-role key. **Never** rename it to `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` or place it in browser code.
3. Add `IW_ENABLE_DEMO_LOGIN=true` for the same environment.
4. Redeploy so the server-only variables and the home-page button are available.
5. After the hackathon, set `IW_ENABLE_DEMO_LOGIN=false` (or remove it) and redeploy. Rotating the service-role key is recommended if it was exposed for the event.

The route is same-origin POST-only, returns `no-store` responses, uses the service-role key only on the server to generate a magic link for the fixed demo email, and writes the resulting Supabase session cookies through the existing route-handler client. The normal magic-link flow for real providers remains unchanged.

## Testing

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration --workspace @incident-witness/api
npm run test:integration --workspace @incident-witness/probe-worker
npm run test:e2e
npm run test:integration --workspace @incident-witness/demo-harness
npm run demo        # staging-only synthetic lifecycle
npm run seed:judge-demo
npm run verify -- path/to/bundle.json
```

Recorded results on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm run lint` — PASS across all workspaces.
- `npm run typecheck` — PASS across all workspaces.
- `npm run build` — PASS across the monorepo, including the Next.js 16.4.3 production build and the new `/api/demo-login` route.
- `npm test` — PASS: 164 unit tests (20 protocol, 11 CLI verifier, 15 correlator, 14 ADR-001, 49 host-agent, 14 renter SDK, 20 probe worker, 21 API).
- `npm run test:integration --workspace @incident-witness/api` — PASS: 60/60 against staging (Phase 8 run; no API contract changed for the judge-demo work).
- `npm run test:integration --workspace @incident-witness/probe-worker` — PASS: 2/2 against staging (Phase 8 run; no worker contract changed).
- `npm run test:e2e` — PASS: 90 Playwright checks, 89 passed and one intentional mobile provider-flow skip. Coverage includes public metadata, link crawling, accessibility, the original provider journey, the production demo-login guard, fixed demo email, cross-origin rejection, missing-config failure and POST-only behaviour.
- `npm run test:integration --workspace @incident-witness/demo-harness` — PASS: 2/2.
- `npm run seed:judge-demo` — PASS against staging: judge user, email identity, one verified host, one sealed incident and one verified bundle.
- The demo-login success/cookie path was exercised against a local fake Supabase Auth endpoint (200, session cookie set, `/dashboard` rendered). A real-key login remains operator verification after the Vercel secret is added.

E2E uses test-only `IW_E2E_*`/`NEXT_PUBLIC_IW_E2E_*` seams for a static test session and file-backed DNS resolver. The API seam is disabled unless `NODE_ENV=test` and the explicit flag are both set; the web seam is disabled in production builds. These are test infrastructure, not production authentication or SSRF bypasses.

## Documentation

- In-app documentation: `/docs`
- Repository documentation index: [`docs/README.md`](./docs/README.md)
- [Provider user guide](./docs/USER_GUIDE.md)
- [Host agent operator guide](./docs/HOST_AGENT.md)
- [Renter SDK integration guide](./docs/RENTER_SDK.md)
- [Protocol v1](./docs/PROTOCOL.md)
- [API reference](./docs/API_REFERENCE.md)
- [Configuration](./docs/CONFIGURATION.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Operations](./docs/OPERATIONS.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)
- [Privacy and security model](./docs/PRIVACY_SECURITY.md)

Source-of-truth project files: [`PROJECT_SPEC.md`](./PROJECT_SPEC.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md), [`AGENTS.md`](./AGENTS.md) and [`AI_HANDOFF.md`](./AI_HANDOFF.md).

## Host agent

Build from the repository (there is no published binary or installer in the MVP):

```bash
npm run build --workspace @incident-witness/protocol
npm run build --workspace @incident-witness/host-agent
```

Issue a one-time enrollment code in the provider dashboard, then enroll and run:

```bash
iw-agent enroll --api-url https://<incident-witness-api>
iw-agent run --incident <incident-uuid>
iw-agent status
```

The agent runs as an unprivileged Linux x86_64 user, generates its Ed25519 key locally, stores key/credential/spool files `0600` in a `0700` directory, and never accepts the enrollment code as an argument. It uses fixed `execFile` calls for `nvidia-smi` and `upsc`; GPU collection currently covers device index 0. The operator must supply the incident ID explicitly because there is no agent-side session discovery. See [`docs/HOST_AGENT.md`](./docs/HOST_AGENT.md).

## Renter SDK

```bash
npm run build --workspace @incident-witness/renter-sdk
```

```ts
import { RenterClient } from "@incident-witness/renter-sdk";

const client = await RenterClient.enroll({
  apiBaseUrl: "https://<incident-witness-api>",
  invitationToken: invitationFromProvider,
  endpointHostname: providerHostnameFromInvitation,
  workloadRef: "job-123",
  stateDir: "/run/incident-witness-renter",
});

client.start();
// ... workload runs ...
await client.stop();
```

Invitations are single use and expire after 15 minutes. The SDK records signed heartbeats and fixed endpoint observations only; it does not collect workload content. `endpointHostname` must come from the provider invitation context. See [`docs/RENTER_SDK.md`](./docs/RENTER_SDK.md).

## Probe worker and platform key

The probe worker is a separate Render background process using the restricted `iw_worker` role. It leases probe jobs, resolves and pins a validated public IP, performs the fixed HTTPS health check, signs `platform_probe_result` events and appends them with incident counters.

Before a live worker can start, provision a platform-probe key:

```bash
export IW_PLATFORM_PROBE_KEY_ID="<witness_keys UUID>"
npm run db:provision-probe-key -- --generate --out secrets/probe-worker.pk8
```

The private half is written only to the requested `0600` file and must be stored in the worker-only `IW_PLATFORM_PROBE_PRIVATE_KEY` secret. Never commit it, expose it to the web/API runtime or print it. `secrets/` is git-ignored. The staging environment currently has no live probe key or worker deployment. See [`docs/PROBE_WORKER.md`](./docs/PROBE_WORKER.md).

## Bundle verification

Verification is anchored to pinned platform public keys; a key included inside a bundle is not trusted merely because the file contains it.

Browser: open `/verify` and select a sealed JSON bundle. The File API reads it locally; no bundle content is uploaded and no API request is made.

CLI:

```bash
npm run build --workspace @incident-witness/cli-verifier
node tools/iw-verify/dist/cli.js path/to/incident-witness-bundle.json
# or
npm run verify -- path/to/incident-witness-bundle.json
```

Exit codes: `0` fully valid, `1` invalid/tampered, `2` missing/unreadable/unparseable file or unusable trust set. The CLI trust set is [`tools/iw-verify/trusted-platform-keys.json`](./tools/iw-verify/trusted-platform-keys.json); the browser trust set is `apps/web/lib/verify/trusted-platform-keys.ts`. Both contain public keys only.

The protocol uses RFC 8785 JCS through pinned `canonicalize@5.1.0`, SHA-256 and Ed25519. Node services use `node:crypto`; the browser verifier uses `@noble/ed25519` through the browser-safe package export. No private platform key is present in browser code.

## Deployment

### Frontend (Vercel)

- Framework preset: Next.js. Build from the repository root with the normal workspace install/build.
- Required public variables: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Optional canonical origin: `NEXT_PUBLIC_SITE_URL`. When omitted, metadata falls back to the stable production alias.
- Add every deployment origin and `/auth/callback` to the Supabase Auth redirect allow-list.
- Preview and Production must use staging/sandbox data and separate secrets. Never put server-only secrets in `NEXT_PUBLIC_*` variables.

### API and worker (Render)

`render.yaml` defines the `incident-witness-api` web service and builds `apps/api/dist/index.js`. The service is **not linked or verified** from this repository state. To enable it:

1. Link `render.yaml` in Render.
2. Set the server-only environment variables from [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md), including `DATABASE_URL_IW_API`, `IW_TOKEN_PEPPER`, `IW_PLATFORM_SIGNING_PRIVATE_KEY`, `IW_PLATFORM_KEY_ID`, `APP_BASE_URL`, `IW_ALLOWED_WEB_ORIGINS` and `IW_HEALTHCHECK_TOKEN`.
3. Apply migrations through `0022` with `DATABASE_URL_MIGRATOR`.
4. Set the Vercel `NEXT_PUBLIC_API_BASE_URL` to the deployed API origin and redeploy the web app.

The API readiness endpoint checks the migration ledger and returns 503 until the expected migration is applied. Production release requires separate explicit operator authorization and the Phase 9 gate. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

## Security and evidence boundaries

- Every API operation checks authentication, permission and resource ownership on the server. Non-owned resources return 404.
- Runtime database roles do not have superuser or `BYPASSRLS`; grants and RLS are tested from the actual roles.
- Event payloads are typed and bounded. No free-form logs, prompts, datasets, credentials, arbitrary commands or raw network addresses are accepted.
- The host agent uses fixed binaries and fixed argument arrays with `execFile`; it runs unprivileged.
- The probe worker performs DNS resolution, rejects private/reserved/link-local/metadata and IPv4-mapped addresses, pins the validated IP and does not follow redirects or use proxy environment variables.
- Evidence events are append-only; sealed bundles are immutable. Key revocation prevents new events but does not invalidate valid historic signatures.
- Simulation and demo evidence is permanently labelled and capped at `LOW`.
- Assessments are deterministic, versioned and explainable. There is no LLM, probability score, payment, token, blockchain or marketplace integration.

Report suspected vulnerabilities privately to the repository owner; no public support address or legal contact has been approved for publication.

## Repository layout

```text
apps/web              Next.js 16 App Router frontend
apps/api              Fastify 5 API
apps/probe-worker     Render background probe worker
packages/protocol     Signed event and bundle protocol
packages/correlator   Deterministic rule engine
packages/db           Drizzle schema, SQL migrations, DB scripts
packages/host-agent   Linux x86_64 host agent
packages/renter-sdk   Incident-scoped renter SDK
tools/iw-verify       Offline CLI verifier
tools/demo-harness    Labelled synthetic staging lifecycle
docs/                 Product, protocol, operator and security documentation
```

## Contributions and AI coding agents

Read [`AGENTS.md`](./AGENTS.md) before changing anything. Implement one assigned phase/task only, add or update tests, run focused and broader checks, inspect the diff for secrets and unrelated changes, commit, update [`AI_HANDOFF.md`](./AI_HANDOFF.md) and stop. Architecture, product behaviour, business rules, security and evidence claims require operator approval before change.

## Research and validation status

The source research found a plausible infrastructure-evidence gap and adjacent tooling, but user demand, marketplace acceptance, willingness to pay and full novelty remain unresolved. The project is selected for implementation by the operator; that decision does not convert open research questions into validated claims. See [`docs/RESEARCH_AND_ASSUMPTIONS.md`](./docs/RESEARCH_AND_ASSUMPTIONS.md).
