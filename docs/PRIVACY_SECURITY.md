# Privacy and Security Model

**Status:** Design statement for MVP; legal review and operational implementation still required.

## What Incident Witness intends to collect

- Provider account identity handled by Supabase Auth.
- Host alias and a provider-verified hostname.
- Host agent version, heartbeat/uptime and limited typed GPU/UPS status where available.
- Renter SDK version, opaque workload reference and endpoint/heartbeat result.
- Platform probe result categories, timestamps and latency.
- Source public keys/certificates, event sequence, signature and server receipt time.
- Incident lifecycle, gaps, assessment, bundle digest and audit events.

## What it must not collect

No passwords held by Incident Witness, private keys, raw API tokens after one-time display, workload prompts, model inputs/outputs, customer data, datasets, model files, environment variables, full process lists, arbitrary system logs or arbitrary stdout/stderr.

## Visibility

- Provider records are private to the owning provider account.
- Agent and renter credentials are write-scoped only.
- Renter key has access to one incident's ingestion endpoint, not dashboard data.
- Platform operator does not have routine evidence content browsing.
- Public verifier processes a local file without uploading it.
- Bundles become shareable only when provider deliberately downloads/transmits them; external copies cannot be recalled.

## Sensitive bundle warning

A bundle may include hostname, host alias, GPU model/temperature/utilization, power state, timestamps, workload reference, endpoint outcomes and source key metadata. The web UI must warn before sharing. Do not publish bundles in a public index by default.

## Cryptographic limitations

Ed25519/JCS prove that signed bytes verify against a public key. They do not establish sensor accuracy, physical device identity, honesty of the host/renter, absence of key theft, cause certainty or platform independence. MVP does not use TPM/TEE hardware attestation.

## Security controls

- Supabase OTP, secure session cookies and JWT verification.
- RLS plus restricted database grants and explicit owner filters.
- Append-only evidence events and immutable sealed bundles.
- Single-use, expiring enrollment and invitation tokens stored hashed.
- Event signatures, event sequence uniqueness, idempotency and time-window checks.
- Strict bounded schemas, body/queue/bundle caps and rate limits.
- SSRF-safe fixed HTTPS endpoint probes with DNS challenge, no redirects and pinned validated IP.
- Fixed local telemetry commands with no shell invocation.
- Host-agent private key and device credential stored only on the provider host in a `0700` directory with `0600` files; the private key is never transmitted.
- Host-agent evidence spool capped at 50 MiB locally; operational-presence heartbeats are separate and never written to the evidence spool or bundle.
- Pino redaction, secret scanning and limited DB roles.
- Separate Preview and Production services/secrets.

## Retention and deletion

Evidence retention and deletion periods are not yet approved. V1 does not expose self-service account deletion. Exact live-data deletion, evidence-bundle retention and backup purge periods require legal/operational review before public release; production launch is blocked until that policy is approved. All v1 ownership/evidence foreign keys use restrictive deletion semantics; the database must not cascade-delete evidence if an Auth user is removed. Expired transient token hashes may be cleaned by an explicit retention job after the configured audit interval. Existing downloaded bundles are beyond Incident Witness's deletion control.

## Cookies and analytics

MVP selects essential authentication cookies only. No analytics/tracking provider is selected. A third-party cookie consent banner is therefore not required unless future integrations change this decision. The Privacy page must accurately reflect the live implementation.

## Legal content

Do not publish placeholder legal text or invent a company identity, address, jurisdiction, representative or support email. The operator must approve Privacy/Terms wording and provide real contact details before public production launch.
