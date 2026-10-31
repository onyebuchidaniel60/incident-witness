# Changelog

All notable changes to Incident Witness are recorded here. The MVP is a release candidate; production release requires explicit operator authorization.

## [1.0.0] — 2026-10-31

### Added

- **Signed evidence protocol v1** — strict typed event envelopes, RFC 8785 JCS canonicalization via pinned `canonicalize@5.1.0`, SHA-256 digests, Ed25519 signatures, source registration certificates and signed bundle manifests.
- **Fastify 5 API** — Supabase JWT verification with `jose`, restricted `iw_api` database role, RLS, owner-scoped host and incident routes, idempotency keys, signed host/renter event ingestion, deterministic correlation, immutable bundle sealing and owner-only bundle download.
- **Provider host agent** — Linux x86_64 agent with interactive enrollment, local Ed25519 key generation, owner-only configuration and SQLite spool, operational presence, evidence heartbeats, fixed `nvidia-smi`/`upsc` collectors, bounded retry/backoff and graceful shutdown.
- **Renter SDK** — incident-scoped enrollment, one-use invitations, signed heartbeats and fixed endpoint observations, in-memory or owner-only persistent state, bounded queue and explicit dropped-event reporting.
- **Platform probe worker** — separate Render background process using `iw_worker` leases, DNS validation, private/reserved address rejection, pinned-IP HTTPS checks, redirect/proxy suppression, signed probe observations and bounded retries.
- **Deterministic correlator** — rule version `iw-rules-v1` producing `POWER_RELATED`, `EXTERNAL_REACHABILITY_LOSS`, `HOST_OR_WORKLOAD_EXIT` or `UNKNOWN`, with `HIGH`/`MEDIUM`/`LOW`/`INSUFFICIENT` evidence grades and a mandatory simulation cap.
- **Offline CLI verifier** — `iw-verify` checks schema/version support, manifest digest, pinned platform key/signature, source certificates, event signatures/digests, sequence ordering and bundle consistency without network access.
- **Local browser verifier** — `/verify` uses the browser-safe protocol export and pinned public keys. The bundle is read locally and never uploaded.
- **Provider web workspace** — Supabase magic-link sign-in, protected provider routes, host creation, DNS TXT proof, endpoint verification, agent enrollment, key revocation and archival, evidence-session lifecycle, renter invitations, source health, deterministic timeline, assessment display and sealed-bundle download.
- **Public site and documentation** — explanatory home page, `/docs`, `/privacy`, `/terms`, styled 404/error states, real footer links, page metadata, favicon, OpenGraph image, `robots.txt`, public-only sitemap and noindex rules for private routes.
- **Operations and documentation** — architecture, protocol, API, configuration, deployment, host-agent, renter-SDK, probe-worker, security/privacy, operations and troubleshooting guides; AI handoff and design decision records.
- **Testing** — Vitest unit suites, staging API and worker integration suites, Playwright desktop/mobile journeys, CLI verifier fixtures, tamper detection and a labelled synthetic demo harness.

### Changed

- Authentication uses Supabase's default **magic-link email** flow instead of a six-digit OTP. This is an operator-approved deviation that avoids the free-tier custom-SMTP and editable-template requirement.
- Provider routes are guarded by Next.js 16 `proxy.ts` and a server-side user check before any provider API call. Unauthenticated navigation redirects immediately to `/login?next=…` without flashing dashboard content or raw API errors.
- The public header now shows the **Workspace** link only when a valid provider session is present. Logged-out visitors see Home, Docs, Verify and Login; direct `/dashboard` navigation remains protected by `proxy.ts`.
- The login page uses a single-column layout with the form and ancillary links centered underneath it.
- Obsolete defensive status panels were removed from the public home and documentation pages. The detailed limitation text remains in `/docs` and the footer.
- The final visual design applies the operator-approved Satoshi/emerald command-surface direction with desktop/mobile layouts and text-backed status indicators.

### Removed

- Temporary one-click demo sign-in and its seed script. The standard magic-link flow is the only sign-in path.
- The login-page magic-link implementation notice. The form and recovery behaviour remain.

### Security

- Ed25519 signatures over canonical JSON; no browser private signing keys and no client-selected algorithms.
- Restricted database roles and RLS; no runtime superuser or `BYPASSRLS`; no service-role key in the browser.
- Owner-scoped resources return 404 for non-owned identifiers.
- SSRF and DNS-rebinding controls reject private, loopback, link-local, reserved, metadata and IPv4-mapped addresses; the validated IP is pinned for the connection.
- Event/body/bundle size caps, strict schema rejection, sequence rollback protection, duplicate handling and transaction locks for enrollment, invitations, ingestion and sealing.
- Pino redaction for authorization, cookies, OTP, credentials, tokens and private-key fields.
- Simulation and demo evidence is labelled and capped at `LOW`.

### Known limitations

- Production API/worker deployment, production Supabase configuration, domain decisions, legal copy and support contact require operator approval.
- The host agent and probe worker are built from the repository; no signed installer or systemd unit is included.
- Only GPU index 0 is collected. Multi-GPU summarization requires a later approved change.
- The renter SDK is not published as a signed package and requires `endpointHostname` from the invitation context.
- Real hardware, live public probe targets and a real renter integration were not available in the implementation environment.
- Evidence signatures establish integrity and provenance relative to keys. They do not prove sensor truth, host integrity or physical root cause.
