# Deployment Guide

**Status:** Deployment guide. The Vercel web deployment and staging Supabase project exist; the
Render API and probe worker have not been linked or verified. Never fill placeholders with guessed
URLs.

## Environments

Use separate environments:

- **Local:** local Next.js, Fastify and local Supabase stack/test database; synthetic fixtures only.
- **Preview/Staging:** Vercel Preview + staging Supabase Auth/Postgres + Render staging API/worker. Safe test accounts, test hosts and synthetic or explicitly approved disposable endpoints only.
- **Production:** separate Vercel/Render/Supabase projects/credentials and domain. Enabled only after explicit operator authorization.

## Phase 1 Preview requirements

1. Inspect the current repository and any existing Vercel project first.
2. Do not create a new project or domain unless operator has authorized it.
3. Configure Preview environment only; production env is not imported into Preview.
4. Deploy the skeletal frontend and verify all agreed routes.
5. Report exact URL, branch, commit SHA, build ID where available, visible routes, incomplete areas and test result.
6. Keep the Preview deployment updated at each accepted phase checkpoint.
7. Protect Preview access if any sensitive workflow becomes available.

If no deployment provider access is available, report the exact missing permission/account/env and complete local build/route test. Do not call local URL a deployed Preview URL.

## Vercel frontend

- Connect only the verified repository.
- Enable automatic Preview for branches/PRs only when staging variables are configured.
- Set production variables only in Production scope.
- Keep server-only secrets unprefixed; expose only the Supabase URL/anon key and public API origin.
- Restrict Preview/Production domains in Supabase Auth redirect allow-list and API CORS.
- Verify exact deployment commit before accepting phase.

## Render API and worker

- The repository root [`render.yaml`](../render.yaml) defines the API Web Service, build command and `node apps/api/dist/index.js` start command. Link it in the Render dashboard, then add the server-only environment variables and apply migrations through `0022`.
- API is an HTTPS Web Service, configured to listen on assigned `PORT`. Configure the host liveness check to use public `/health/live` only. `/health/ready` is protected and must be called only through a private/authenticated check mechanism supported by the host; never expose `IW_HEALTHCHECK_TOKEN` as a public health-check URL parameter.
- Worker is a Background Worker with no public inbound listener, started with `npm run start --workspace @incident-witness/probe-worker`.
- API and worker have separate DB roles and environment variables; worker has only required probe/signing access.
- Provision the platform-probe source key once with `npm run db:provision-probe-key` before starting the worker. The worker runtime receives `IW_PLATFORM_PROBE_PRIVATE_KEY` and `DATABASE_URL_IW_WORKER`; it never receives `IW_PLATFORM_SIGNING_PRIVATE_KEY` or provider JWTs.
- Set health/readiness checks, logs, resource bounds, restart behaviour and alerts. The worker has no inbound health endpoint in this phase; use process/restart logs and database job ages.
- Worker maximum probe concurrency remains bounded by configuration validation (1–10).
- Worker environment should not define HTTP(S) proxy variables for outbound probes; the custom client deliberately ignores proxy environment configuration.

## Supabase

- Use a dedicated staging project.
- Apply schema only through version-controlled migrations.
- Test RLS and grants from the actual `iw_api` role and `iw_worker` role.
- Configure OTP templates, allowed redirects and rate limits.
- Never place service-role/secret key in frontend environment.
- Create production project only when approved.

## Database connection

Use a direct connection or session pooler where transaction-scoped identity/RLS requires it; verify connection behaviour with integration tests. Do not assume a transaction pooler preserves session state.

The API connects with the restricted `iw_api` login role, directly or through a verified session pooler. JWT subject and request mode are set transaction-locally using parameterized `set_config` or equivalent `SET LOCAL` calls. **`SET ROLE authenticated` is prohibited.** Transaction pooling and service-role bypass are prohibited.

## Production release gate

Production deploy is forbidden until:

- Phase 5 end-to-end functionality gate accepted.
- Phase 6 mockups approved and Phase 7 implemented.
- Phase 8 docs/frontend/link completeness accepted.
- Phase 9 security and regression tests pass.
- Production secrets, domains, legal copy, backup plan and rollback instructions confirmed.
- Operator explicitly authorizes release.

After deploy, smoke test login, health, host/session reads with disposable/synthetic data only. Do not run a real probe on a provider's server or a real renter workload without that provider's explicit authorization.
