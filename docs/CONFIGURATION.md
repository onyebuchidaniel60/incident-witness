# Environment and Configuration Guide

**Status:** Implemented configuration reference. Values for local, staging and production environments are supplied by the operator; never commit real secrets.

## General rules

- `.env.example` contains variable names with blank values and explanatory comments only.
- Local `.env` is ignored by Git and must never be pasted into logs/chat.
- Hosting secrets go in the relevant Vercel/Render/Supabase secret manager.
- Preview and Production use separate database/auth projects and credentials.
- Variables prefixed `NEXT_PUBLIC_` are intentionally exposed to browser bundles. Only public endpoint/anon values belong there.
- Missing mandatory configuration must fail fast with a redacted message. Never log secret contents.

## Frontend variables

| Variable | Required | Client-safe | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes for auth-enabled app | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes for auth-enabled app | yes | Supabase publishable key; RLS must be enforced |
| `NEXT_PUBLIC_API_BASE_URL` | yes | yes | Fastify API origin used by browser requests; not a secret |

No private signing key, DB URL, service-role/secret key, host credential or invitation token may be exposed in `NEXT_PUBLIC_*`.

## API variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | Runtime mode |
| `PORT` | yes | HTTP listen port |
| `APP_BASE_URL` | yes | Approved web origin and redirect validation |
| `IW_API_BASE_URL` | optional | Public API origin returned to enrolling agents; defaults to `http://localhost:PORT` |
| `SUPABASE_URL` | yes | Auth project URL |
| `SUPABASE_JWKS_URL` | yes | Trusted JWT verification keys |
| `SUPABASE_JWT_ISSUER` | yes | Expected issuer |
| `DATABASE_URL_IW_API` | yes | Restricted API DB role, NOBYPASSRLS |
| `IW_TOKEN_PEPPER` | yes | HMAC pepper for enrollment/invitation/device token hashes |
| `IW_PLATFORM_SIGNING_PRIVATE_KEY` | yes | API-only Ed25519 root key for source certificates and sealed bundle manifests; base64-encoded PKCS8 DER; never available to web or worker |
| `IW_PLATFORM_KEY_ID` | yes | Active platform signing key identifier; register its public half with `npm run db:provision-platform-key` |
| `IW_ALLOWED_WEB_ORIGINS` | yes | Comma-separated exact allowed origins |
| `IW_HEALTHCHECK_TOKEN` | yes unless a private health-check network is verified | Internal bearer token for `/health/ready`; compare in constant time and never log |
| `IW_LOG_LEVEL` | optional | Structured log verbosity |
| `IW_BUNDLE_MAX_BYTES` | optional | Bundle cap; default and hard maximum 10 MiB (10,485,760 bytes). The 7 MiB aggregate canonical event-entry budget is enforced separately. |

### Platform signing key provisioning

`IW_PLATFORM_SIGNING_PRIVATE_KEY` is a base64-encoded Ed25519 PKCS8 DER key held only by the API. Its public half must be registered once per environment:

```bash
npm run db:provision-platform-key
```

The command reads the private key and key ID from the environment, writes only the public key and SHA-256 fingerprint to `platform_signing_keys`, and prints only public metadata. It refuses to overwrite an existing key ID with a different public key. Do not rotate a platform key by simply replacing the environment value; follow the overlapping public-key pin/release process in `ARCHITECTURE.md`.

## Probe worker variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL_IW_WORKER` | yes | Restricted worker DB role |
| `IW_PLATFORM_PROBE_PRIVATE_KEY` | yes | Separate worker-only Ed25519 PKCS8 DER key for platform-probe observations; never available to API or web |
| `IW_PLATFORM_PROBE_KEY_ID` | yes | Registered platform-probe `witness_keys.id` UUID |
| `IW_PROBE_POLL_INTERVAL_MS` | optional | Default 1000; validated range 500–5000 |
| `IW_PROBE_INTERVAL_SECONDS` | optional | Default 15; validated range 10–60 |
| `IW_PROBE_TIMEOUT_MS` | optional | Default 3000; hard maximum 5000 |
| `IW_PROBE_CONCURRENCY` | optional | Default 5; hard maximum 10 |
| `IW_PROBE_MAX_ATTEMPTS` | optional | Default 5; validated range 1–10 |
| `IW_LOG_LEVEL` | optional | Structured worker log level |

The probe key must be registered before the worker starts:

```bash
npm run db:provision-probe-key
```

This operator-only provisioning step reads the probe private key and the API root signing key to
create the platform-signed source certificate, stores only public key/certificate metadata in
`witness_keys`, and prints only public values. The worker runtime itself receives only the probe
private key and `iw_worker` database URL. See `PROBE_WORKER.md`.

## Host agent local configuration

The host agent does not read credentials, the enrollment code or telemetry from environment
variables. `iw-agent enroll` prompts for the one-time code and writes an owner-only configuration
directory (default `~/.config/incident-witness/`, mode `0700`; files `0600`):

| File | Secret? | Purpose |
|---|---|---|
| `config.json` | no | API origin, enrolled host ID, source key ID and optional UPS alias |
| `device-key.pem` | yes | Local Ed25519 private key; never transmitted |
| `device-credential` | yes | Revocable host ingestion credential |
| `spool.sqlite` | contains signed evidence | Local 50 MiB spool with durable event and presence sequences |

Run with `iw-agent run --incident <uuid>`; operational presence runs without an incident, but
evidence collectors require the active incident ID. See `HOST_AGENT.md`. Do not put any of these
values in the web/API `.env` file.

## Renter SDK configuration

The renter SDK is configured by its typed `RenterClient.enroll` options, not by web/API environment
variables:

| Option | Purpose |
|---|---|
| `apiBaseUrl` | Witness API origin; HTTPS except localhost development |
| `invitationToken` | One-time invitation token; never logged or persisted |
| `endpointHostname` | Provider's verified public hostname from the invitation context |
| `workloadRef` | Optional opaque reference, max 100 characters |
| `stateDir` | Optional explicit secure directory for restart survival |

With `stateDir`, the SDK creates a `0700` directory and `0600` state file containing the
incident-scoped private key, ingestion credential, sequence and 5 MiB queue. Without it, state is
in-memory only. See `RENTER_SDK.md`.

## Migration/CI variables

`DATABASE_URL_MIGRATOR` is migration-only and must not be present in runtime API/worker environment. CI secrets include only required staging/test credentials. Production secrets must never be used in pull request Preview builds.

## Account deletion boundary

Self-service account deletion is not implemented or exposed in v1. Before production, the operator must approve a retention and backup-purge policy, including treatment of evidence bundles and security audit records. Do not add a deletion endpoint or CTA until that separate requirement is approved.

## Secret rotation

Rotate host/renter credentials by revocation and new enrollment/invitation. Rotate platform signing key only through the documented overlapping public-key pin/release process in `ARCHITECTURE.md`. Do not simply replace the key in Render; historical bundle verification would break.
