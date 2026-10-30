# Operations Runbook (Planned)

**Status:** Operational design; production services are not deployed.

## Service components

- Next.js frontend (Vercel).
- Fastify API (Render Web Service).
- Probe worker (Render Background Worker).
- Supabase Auth/Postgres.
- Provider Linux host agents (external, provider-managed).

## Health signals

### API

- `/health/live`: process alive; no DB query.
- `/health/ready`: DB connectivity, migration compatibility and required platform signing key loaded. Protect endpoint from public diagnostics if it reveals internal dependency status.
- Monitor request rate, error rate, latency, 401/403/409/422/429/5xx categories, DB transaction errors and bundle seal failures.

### Probe worker

- Worker heartbeat timestamp.
- Age/count of due jobs.
- Number of active/expired leases.
- Probe timeout/TLS/DNS/HTTP result classes.
- Retry/dead job count.
- Platform key availability.

A probe-service outage must not be interpreted as a provider host outage. Mark missing probe observations as service gaps.

### Database

Monitor connection saturation, transaction errors, migration version, RLS permission failures, backup health and restore tests. Do not run application with migration owner credentials.

## Alert conditions

- API or worker not ready beyond deployment grace period.
- Signing key absent/invalid or rotation mismatch.
- Probe backlog exceeds the agreed threshold or jobs repeatedly dead-letter.
- DB connection errors or pool saturation.
- Unusual invalid signature/replay/credential failures suggesting abuse.
- Repeated SSRF policy violations.
- Bundle sealing errors or failed verification fixtures.

Thresholds should be configured only after observing real baseline load; do not invent public reliability stats.

## Incident response

1. Classify whether failure is API, DB, worker, host agent or third-party endpoint.
2. Preserve logs/metrics and deployment SHA; never copy secrets or private evidence into incident tickets.
3. If platform signing key may be compromised, stop sealing and probe signing immediately. Preserve old public-key metadata, rotate only using the key rotation procedure, mark compromised key revoked and notify operator. Existing bundles signed by compromised key become untrusted in verifier.
4. If DB/RLS permission bug is suspected, disable affected write endpoint and preserve evidence; do not patch production data manually.
5. If SSRF is suspected, disable probe execution, preserve safe request metadata and review DNS resolver/connection pinning.
6. If user content/evidence exposure occurred, stop affected access path, determine scope and follow operator/legal notification process.
7. Restore service from verified deployment/backup only after integrity checks. Do not edit or rewrite sealed evidence to “fix” the incident.

## Release and rollback

- Every release records frontend/API/worker commit SHA and DB migration version.
- Rollback app code only where schema remains compatible.
- Destructive DB rollback is not automatic. Use forward migration or tested restore plan; operator approval required.
- Production deploy requires operator authorization.

## Key rotation

1. Generate new Ed25519 key in secure secret manager.
2. Publish new public key/fingerprint to `platform_signing_keys` and the web/CLI pinned trust set in a released verifier update.
3. Verify new verifier build trusts old and new required keys.
4. Only then make new key active for signatures.
5. Retire old key for new signatures while retaining trust for historical bundles unless compromised.
6. For compromise, revoke key and clearly mark bundles signed by that key as untrusted in new verifier versions.

## Backup and restore

Configure Supabase backup/PITR according to selected plan and actual retention. Test restore in staging before production launch and record actual recovery evidence. Do not claim specific RPO/RTO until provider plan and restore test are known. Bundle signatures provide integrity checks, not a database backup.

## Operational privacy

Logs use request IDs and bounded codes. Never log private key, credential, enrollment/invitation token, OTP, authorization header, cookies, event payload, full hostname or full raw endpoint address. Content access by staff is disabled by default.
