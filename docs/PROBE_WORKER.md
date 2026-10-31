# Platform Probe Worker — Operator Guide

**Status:** Phase 3E implementation in `apps/probe-worker`, accepted on 2026-10-31. A separate
Render background worker; no public listener. Not deployed.

The worker is operated by Incident Witness. It is **not** an independent third-party observation
source. It checks the provider's verified public HTTPS health endpoint and signs the result as a
`platform_probe_result` event.

## Responsibilities

- Poll `probe_jobs` every 1–2 seconds using the restricted `iw_worker` database role.
- Claim one job at a time per worker slot with `FOR UPDATE SKIP LOCKED`; lease for 30 seconds;
  recover expired leases left by a crashed worker.
- Perform the fixed HTTPS health check from the worker service.
- Sign the bounded result with the dedicated `IW_PLATFORM_PROBE_PRIVATE_KEY`.
- Append the signed event, update incident evidence counters and complete the job in one transaction.
- Schedule the next 15-second probe while the incident remains collecting and has enough capture time
  left. Missed schedules are not backfilled indefinitely.
- Retry bounded internal failures and dead-letter after `IW_PROBE_MAX_ATTEMPTS`.

The worker never receives user JWTs, the API platform root signing key, bundle contents or provider
credentials.

## Provisioning

A platform-probe public key and signed source certificate must exist in `witness_keys`. The worker
does not have the API root signing key at runtime. Run the one-time operator provisioning step with
the API root key and probe key available in the deployment secret environment:

```bash
npm run db:provision-probe-key
```

This registers only the public key, fingerprint and signed certificate; it prints only public
metadata. It refuses to replace an existing key ID with different material. The corresponding
`IW_PLATFORM_PROBE_KEY_ID` must be the `witness_keys.id` UUID.

To generate a new keypair during provisioning instead of supplying an existing private key, pass
`--generate` and an output path. The private key is written with mode `0600` and is never printed:

```bash
export IW_PLATFORM_PROBE_KEY_ID="<witness_keys UUID>"
npm run db:provision-probe-key -- --generate --out secrets/probe-worker.pk8
```

Use a git-ignored directory such as `secrets/`. Move the file contents into the worker-only
`IW_PLATFORM_PROBE_PRIVATE_KEY` secret. `--generate` refuses to overwrite an existing file and is
rejected if `IW_PLATFORM_PROBE_PRIVATE_KEY` is also set.

Required worker environment:

| Variable | Purpose |
|---|---|
| `DATABASE_URL_IW_WORKER` | Restricted `iw_worker` login role; no `BYPASSRLS` |
| `IW_PLATFORM_PROBE_KEY_ID` | Registered `witness_keys.id` for the platform probe key |
| `IW_PLATFORM_PROBE_PRIVATE_KEY` | Base64 PKCS8 DER Ed25519 private key; worker-only secret |
| `IW_PROBE_POLL_INTERVAL_MS` | 500–5000 ms; default 1000 |
| `IW_PROBE_TIMEOUT_MS` | 500–5000 ms; default 3000 |
| `IW_PROBE_CONCURRENCY` | 1–10; default 5 |
| `IW_PROBE_INTERVAL_SECONDS` | 10–60; default 15 |
| `IW_PROBE_MAX_ATTEMPTS` | 1–10; default 5 |
| `IW_LOG_LEVEL` | Structured log level |

The current staging `.env` does not contain a probe key, and staging has no registered
`platform_probe` row. Provisioning is therefore an operator prerequisite before a live worker can
start. The worker fails closed if the key is missing, revoked or does not match the private key.

## Fixed target policy

- Scheme HTTPS only; port 443; method GET.
- Path exactly `/.well-known/incident-witness/health`; no query or custom headers from the provider.
- Response must be HTTP 200, `Content-Type: text/plain` (parameters allowed) and exactly
  `incident-witness-health-v1\n`.
- Timeout 3 seconds; response body maximum 1 KiB.
- TLS certificate validation is required.
- Redirects are never followed and are recorded as an unexpected target response.
- HTTP(S) proxy environment variables are ignored; the client creates its own non-proxy agent.

## SSRF and DNS-rebinding controls

1. Resolve the hostname once with the system resolver (A/AAAA).
2. Reject any answer containing loopback, private, link-local, multicast, unspecified, documentation,
   benchmark, reserved or cloud-metadata ranges. IPv4-mapped IPv6, NAT64/6to4/Teredo, ULA, IPv6
   link-local and IPv6 multicast are rejected. Mixed public/private answers fail closed.
3. Connect to the **first validated IP literal**, not the hostname. The TLS `servername` and HTTP
   `Host` header carry the authorized hostname. There is no second DNS resolution in the connection
   path, so a DNS change after validation cannot redirect the TCP connection.
4. Reject the attempt before any TCP connection when validation fails. The event records
   `dns_result: rejected_unsafe`, `observed_ip_class: rejected_unsafe`,
   `probe_status: error`, `response_class: error`; the correlator excludes
   `probe_status: error` from causal rules.
5. Do not log raw hostnames, raw IP addresses or private keys. Events carry only the target host ID,
   bounded result categories, latency and an IP **class**, never the address.

## Result mapping

| Condition | `probe_status` | Result fields |
|---|---|---|
| Exact health response | `completed` | DNS resolved, TLS valid, HTTP expected, response expected |
| DNS NXDOMAIN | `failed` | `dns_result: nxdomain`, response unavailable |
| TLS validation failure | `failed` | TLS invalid, response unavailable |
| Timeout | `failed` | HTTP timeout, response unavailable |
| Non-2xx / redirect | `failed` | HTTP unexpected status/redirect, response unexpected |
| Wrong content type/body | `failed` | HTTP invalid body, response unexpected |
| Connection/network error | `failed` | HTTP error, response unavailable |
| Unsafe DNS/policy rejection | `error` | DNS rejected_unsafe, response error |
| Resolver/infrastructure failure | `error` | DNS error, response error |

`probe_status: error` is a probe-service/policy condition, not proof that the provider host is down.
The correlator ignores it for causal assessment. A target DNS, TLS, timeout or HTTP failure is a
`failed` observation and may participate in correlation.

## Database access

Migrations `0018` and `0019` add grants/RLS only:

- worker `INSERT` on the required `probe_jobs` columns and `UPDATE` on `scheduled_at`;
- worker `UPDATE` on incident evidence counters;
- worker `SELECT` on the `(id, source_key_id, sequence)` columns needed for deterministic
  per-key sequence allocation and idempotency;
- RLS policies limiting probe-job insert/update and counter updates to active incidents.

No table or column definitions changed. The worker cannot read `source_credentials`, profiles,
provider account data, bundle contents or arbitrary evidence payloads.

The worker appends the event directly as `iw_worker`; it does not call the public API and has no
inbound HTTP endpoint.

## Tests and evidence

```bash
npm test --workspace @incident-witness/probe-worker
npm run test:integration --workspace @incident-witness/probe-worker
```

Unit tests cover IP classification across IPv4/IPv6 private and special ranges, mixed-answer
rejection, DNS rebinding pinning, no connection before validation, redirects, timeout/body/TLS
classification, lease-expiry recovery, retry/dead-letter, signed worker events and a renter+worker
same-incident signature check. The integration test exercises an actual expired lease claim,
`iw_worker` event insert, incident counter update and next-job scheduling against staging.

## Limitations

- No deployed Render worker or live public probe target yet.
- No staging platform-probe key is provisioned in the current `.env`.
- No metrics/Prometheus endpoint; structured logs and counters are the MVP visibility mechanism.
- No independent probe region or organisation. The worker is platform-operated.
- Missed schedule intervals are not yet emitted as explicit `source_gap` rows; the current result
  vocabulary records probe-service errors as `probe_status: error`.
- A probe signature proves the worker signed a bounded observation; it does not prove the provider's
  endpoint or upstream network was healthy for any other purpose.
