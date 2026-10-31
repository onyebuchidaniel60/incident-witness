# Environment and Configuration Guide

**Status:** Blueprint. Exact variable values are created only after the operator selects and provisions staging/production services.

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
| `IW_PLATFORM_PROBE_PRIVATE_KEY` | yes | Separate worker-only Ed25519 key for platform-probe observations; never available to API or web |
| `IW_PLATFORM_PROBE_KEY_ID` | yes | Registered platform-probe source key ID |
| `IW_PROBE_INTERVAL_SECONDS` | optional | Default 15; validated range 10–60 |
| `IW_PROBE_TIMEOUT_MS` | optional | Default 3000; hard maximum 5000 |
| `IW_PROBE_CONCURRENCY` | optional | Default 10; hard maximum 20 |
| `IW_LOG_LEVEL` | optional | Structured worker log level |

## Host agent local configuration

| Setting | Secret? | Purpose |
|---|---|---|
| `IW_API_BASE_URL` | no | Approved API origin |
| `IW_HOST_ID` | no | Enrolled host identifier |
| `IW_DEVICE_CREDENTIAL` | yes | Revocable host ingestion credential; store with owner-only file permission |
| `IW_DEVICE_PRIVATE_KEY_PATH` | path to secret | Local Ed25519 private key path; never sync or share |
| `IW_NVIDIA_SMI_PATH` | no | Optional known executable path, not user-supplied shell string |
| `IW_NUT_DEVICE` | no | Optional local configured NUT device alias |

## Migration/CI variables

`DATABASE_URL_MIGRATOR` is migration-only and must not be present in runtime API/worker environment. CI secrets include only required staging/test credentials. Production secrets must never be used in pull request Preview builds.

## Account deletion boundary

Self-service account deletion is not implemented or exposed in v1. Before production, the operator must approve a retention and backup-purge policy, including treatment of evidence bundles and security audit records. Do not add a deletion endpoint or CTA until that separate requirement is approved.

## Secret rotation

Rotate host/renter credentials by revocation and new enrollment/invitation. Rotate platform signing key only through the documented overlapping public-key pin/release process in `ARCHITECTURE.md`. Do not simply replace the key in Render; historical bundle verification would break.
