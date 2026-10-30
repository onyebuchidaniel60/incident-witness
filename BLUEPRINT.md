# Incident Witness — Complete Project Blueprint

**Product:** Incident Witness  
**Tagline:** When infrastructure fails, evidence speaks.  
**Blueprint status:** Ready for repository audit and phased implementation.  
**Implementation status:** Not started.  
**Visual design status:** Not started; no final aesthetic is approved.  
**Decision authority:** Operator.  
**Implementation role:** AI coding agent executes approved tasks and must stop at checkpoints.

This document is the navigation layer for the complete blueprint. The detailed source of truth is held in `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `AI_HANDOFF.md` and the supporting `docs/` material. Those files form the actual handoff package; this index maps them to the required 30-part output order.

---

## 1. Product definition

**Name:** Incident Witness.  
**One-line:** A portable incident-evidence protocol that collects signed observations from a GPU host, renter workload client and platform-operated external probe, correlates them into a record and exports an offline-verifiable bundle.

The problem is that a marketplace can observe a GPU host becoming unreachable without necessarily knowing why. The product combines host, renter and platform-probe observations into a common timeline. Current alternatives include marketplace reliability records, logs/screenshots, NUT/Grafana, provider monitoring, renter logs, uptime checks and support tickets. The core value is structured evidence with source identity, time, gaps and verifiable integrity.

Target users are GPU providers/operators, renters/developers and (in future) marketplace/support reviewers. The key differentiator is the portable, time-correlated, multi-source record and explicit trust/evidence labels. Primary use case: start a bounded evidence session before a renter workload/job window, let host/renter/probe contribute observations during that window, seal a signed bundle and verify it offline. V1 cannot reconstruct an outage that occurred before a session was active. Secondary use case: internal operational post-incident review.

It does not adjudicate disputes, excuse downtime, change marketplace scores, prove physical root cause, attest hardware truth, operate a GPU marketplace, collect customer workload data, use AI, move money or depend on blockchain. Full detail: `PROJECT_SPEC.md`, §§1–2.

## 2. MVP scope

- **MUST:** OTP auth, provider-owned host, public hostname DNS proof, Linux x86_64 host agent, source keys/credentials, bounded evidence session, one-time renter invitation, renter SDK, platform probe worker, signed event ingestion, deterministic correlation, immutable signed JSON bundle, offline web/CLI verifier, provider dashboard, tests and deployment.
- **SHOULD:** optional real NUT/NVIDIA telemetry, real containerized demo and clearly labelled synthetic-event harness.
- **NICE:** second genuinely separate probe region/provider and expanded schema docs.
- **FUTURE:** third-party witness operators, hardware attestation, marketplace integration, fleet/team support, additional OS/GPU vendors and business model.
- **OUT OF SCOPE:** AI, payment/token, blockchain/Arweave, inference routing, compute marketplace, automated appeal/penalty, public incident directory, arbitrary URL probes, arbitrary logs, Windows/macOS agent.

See `PROJECT_SPEC.md`, §2. Scope cannot be expanded without operator approval.

## 3. User roles

Provider account owner; host agent; renter client; platform probe worker; public local verifier; platform operator with no routine content access. Role rights, credentials and restrictions are specified in `PROJECT_SPEC.md`, §3, and `ARCHITECTURE.md`, §12.

## 4. User flows

The blueprint specifies registration/login, host registration and DNS verification, host agent enrollment, session creation/renter invitation, renter enrollment, observation capture/correlation, end/finalize/seal, offline verification and key/host/account lifecycle. Each includes entry, preconditions, actions, processing, state changes, validation, success/failure, edge cases, permissions and exit. See `PROJECT_SPEC.md`, §4.

Core sequence:

```text
Provider account
  → add host + DNS TXT challenge
  → verify fixed HTTPS health endpoint
  → enroll Linux agent (local keypair)
  → start bounded session while host is available
  → invite renter (one-use token)
  → host/renter/platform probe append signed observations
  → end session + 24-hour sync grace
  → seal immutable evidence bundle
  → verify bundle locally / CLI
```

## 5. Functional requirements

Requirements FR-01 to FR-18 cover OTP auth, host, endpoint ownership, enrollment, host events, session lifecycle, renter invitation/events, probe, append-only event ingestion, deterministic correlation, evidence bundle, verifier, dashboard, key lifecycle, docs, Preview deployment and final visual approval. Every requirement has actor, behaviour and acceptance criteria in `PROJECT_SPEC.md`, §5. Detailed HTTP validation is in `ARCHITECTURE.md`, §10.

## 6. Business logic and state machines

- Host: `pending_endpoint → pending_enrollment → active → archived`.
- Evidence session: `collecting → awaiting_finalize → sealed`; empty-only cancellation path `collecting → cancelled`.
- Host enrollment: issued → redeemed/expired/revoked (10-minute, single-use).
- Renter invitation: issued → redeemed/expired/revoked (15-minute, single-use).
- Session duration 2–240 minutes, default 30; one active per host; max three active per owner; start before the monitored workload (no retroactive capture); 4,000-event/7-MiB event-entry budget and 10-MiB bundle cap; 24-hour ingestion grace; immutable once sealed.
- Events are signed, append-only, scoped, sequence-unique, idempotent on exact duplicates and deterministically sorted.
- Correlation outputs `POWER_RELATED`, `EXTERNAL_REACHABILITY_LOSS`, `HOST_OR_WORKLOAD_EXIT` or `UNKNOWN`. GPU/driver anomaly is intentionally not classified in v1 because the baseline collector does not provide a sufficiently validated fault signal.
- Evidence grade labels completeness, not probability; simulation caps grade at LOW.

Full rules and confirmation/cancellation/expiration/duplicate/concurrency behaviour: `PROJECT_SPEC.md`, §6.

## 7. Data model

Entities: `profiles`, `hosts`, `host_endpoint_challenges`, `witness_keys`, `source_credentials`, `enrollment_tokens`, `incidents`, `renter_invitations`, `evidence_events`, `probe_jobs`, `platform_signing_keys`, `evidence_bundles`, `audit_events` and `idempotency_records`. Schema fields, types, FK, constraints, indexes, lifecycle and ownership are in `ARCHITECTURE.md`, §4.

Sensitive values (account email, host FQDN, raw credentials, private keys, event payloads, bundles and host telemetry) are private by default. The verifier processes exports locally; there is no public bundle directory.

## 8. System architecture

A Next.js web app, Fastify API, Supabase Postgres/Auth, shared TypeScript protocol/correlator packages, Linux host agent with SQLite spool, renter TypeScript SDK, and separate Render background probe worker. Vercel hosts frontend. Postgres acts as short-duration probe-job queue with leases. There is no unnecessary Redis/Kafka/Kubernetes stack. Full diagrams, deploy topology, trust boundaries and package ownership: `ARCHITECTURE.md`, §§1–3.

## 9. Technology stack

Node.js 26.13.0 LTS (released 2026-10-28), TypeScript strict, npm workspaces, Next.js 16.4.x App Router (16.4.3 current stable checked 2026-10-30), Tailwind CSS 4.x, Fastify 5, Supabase Postgres/Auth, `@supabase/ssr` beta isolated behind an adapter, Drizzle + `pg`, `jose`, Zod/shared schemas, RFC 8785 JCS, SHA-256, Ed25519, SQLite, Render worker, Vercel, Vitest, Playwright and pgTAP. No AI, payment, blockchain, Arweave, Redis, object storage or marketplace SDK in MVP. Detailed why/why not and version policy: `ARCHITECTURE.md`, §§2, 15–16.

## 10. API design

The REST API uses `/v1`, Supabase JWT for provider operations, scoped host/renter credentials plus Ed25519 signatures for source ingestion, and a restricted DB worker role for probes. Endpoints cover health, hosts, DNS challenge/verify, host enrollment, event ingestion, incidents, renter invitation/enrollment, end/seal, bundle download, key revocation and host archive. Errors use `{error:{code,message,request_id,details}}`. Request, validation, authz, business processing, response, side effects and rate limits are in `ARCHITECTURE.md`, §10; `docs/API_REFERENCE.md` is the route index.

## 11. Database operations

Provider/host/session creation, source enrollment, event ingestion, renter redemption, event-vs-seal concurrency and worker leases use transactions, row locks, unique constraints, partial indexes and idempotency. Never keep a DB transaction open during network probe. Sealing is a single atomic operation; the unique bundle-per-incident constraint makes duplicate seal requests idempotent. Full sequences: `ARCHITECTURE.md`, §11.

## 12. Authentication and authorization

Supabase email OTP for provider; JWT validation by `jose`; secure cookie/PKCE for web. Host agent uses a revocable credential hashed server-side and signs every event; renter uses one-use invitation + incident-scoped key and credential. Platform probe uses its own key and DB role. Every API operation performs resource ownership check; RLS plus restricted grants provide defense in depth. Full model: `ARCHITECTURE.md`, §§5, 12.

## 13. Security architecture

Controls cover JWT/session, OTP abuse, CSRF/XSS, IDOR, RLS/grants, SQL injection, rate limits, credentials, source key/replay, SSRF/DNS rebinding, signed bundles, sequence/races, spool abuse, secret/log leakage, platform signing key compromise, Preview isolation and exported data. Highest-risk feature is SSRF-safe probing; fixed HTTPS 443/path/GET, DNS TXT challenge, no redirect/proxy and validated destination IP pinning are mandatory. Full threat table: `ARCHITECTURE.md`, §13; privacy model: `docs/PRIVACY_SECURITY.md`.

## 14. UI/UX architecture

Routes: `/`, `/login`, `/dashboard`, `/hosts`, `/hosts/new`, `/hosts/[hostId]`, `/incidents`, `/incidents/new`, `/incidents/[incidentId]`, `/verify`, `/docs`, `/privacy`, `/terms`, `/settings`, and not-found/error states. Layout hierarchy, behavior components, source timeline, loading/empty/error/success/stale/permission states, responsive layout and accessibility requirements are in `PROJECT_SPEC.md`, §10. Final visual look is intentionally unapproved.

## 15. Design references, mockups and approval gate

After core end-to-end functionality passes, collect operator-supplied/approved references; if none, present candidates and wait. Produce reference-informed desktop/mobile mockups for the home page, dashboard, host setup, evidence timeline, sealed result, verifier and key states. Document borrowed attributes/deviations, present/revise, then **STOP for explicit operator approval**. No final visual implementation without approval. Record all decisions in `docs/DESIGN_DECISIONS.md`. This gate is mandatory in `IMPLEMENTATION_PLAN.md`, Phase 6/approval gate, and `AGENTS.md`.

## 16. Third-party integrations

Mandatory: Supabase Auth/Postgres, Vercel, Render, DNS/TLS. Optional local collectors: NUT and `nvidia-smi`. Nosana is a possible later demonstration/integration only after credentials, credits and real execution are tested. Arweave excluded. Failure/retry/security handling: `ARCHITECTURE.md`, §§9, 15; `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`.

## 17. AI architecture

None. No LLM, prompts, agent tool calls or model-generated conclusions. Deterministic rule engine only. All classifications versioned and supported by event patterns. `UNKNOWN` when insufficient. `PROJECT_SPEC.md`, §12.

## 18. Payments/financial logic

None. No fee, balance, payout, escrow, token or payment provider in MVP. This is an explicit product boundary, not an omission.

## 19. Admin/operations

No admin UI. Service health, structured redacted logs, API/worker metrics, queue age, signing-key health, alerts, backup/restore and incident response are specified. No routine staff content access. `ARCHITECTURE.md`, §§17–18; `docs/OPERATIONS.md`.

## 20. Error and edge-case matrix

Covers auth, ownership, DNS, SSRF, TLS/HTTP, enrollment, keys, duplicate/replay, timestamp/sequence gaps, session races, sealing, agent offline/spool, renter expiration, worker retry, DB failure, signing key absence, bundle tampering, stale UI and deployment failure. `PROJECT_SPEC.md`, §14; recovery policy and detailed edge handling in `ARCHITECTURE.md`, §§10–11.

## 21. Test strategy

Unit tests for canonical JSON/signatures, schemas, correlation, state transitions, grades and bundle. Integration tests for JWT/RLS, enrollment, event ingestion, DNS/probes, worker leases and sealing races. E2E tests for full provider→host→renter→probe→bundle→offline verification. Security tests for IDOR, JWT, XSS/CSRF, SSRF/DNS rebinding, replay, key revocation, race, malformed bundle, limits and secret scanning. Final visual work is blocked until critical tests pass on Preview. `PROJECT_SPEC.md`, §15; `IMPLEMENTATION_PLAN.md`, Phase 5.

## 22. Repository structure

Root includes all five handoff files, README and docs. Source directories: `apps/web`, `apps/api`, `apps/probe-worker`; shared packages `protocol`, `correlator`, `db`, `host-agent`, `renter-sdk`, `ui`; CLI `tools/iw-verify`; DB migrations, tests, docs and CI. Full tree and boundaries: `ARCHITECTURE.md`, §3.

## 23. Environment configuration

All required variables and which are client-safe/server-only appear in `ARCHITECTURE.md`, §15 and `docs/CONFIGURATION.md`. Public frontend vars are limited to Supabase URL/publishable key and `NEXT_PUBLIC_API_BASE_URL`. DB connection strings, JWT secret material, token pepper, root signing key and worker probe key are server-only. `.env.example` contains placeholders only.

## 24. Phased implementation plan

Phase 0 read-only repository audit; Phase 1 skeletal frontend and Preview; Phase 2 DB/auth/API foundation; Phase 3 protocol, domain APIs, host agent, renter SDK, probe worker and CLI in small subphases; Phase 4 functional UI; Phase 5 E2E/functionality gate; Phase 6 design references/mockups; explicit operator approval; Phase 7 approved UI; Phase 8 full frontend/docs/footer; Phase 9 security/regression/production approval/release. Every phase defines objective, dependencies, tasks, files, DB/API/UI changes, tests, acceptance, verification and Git checkpoint in `IMPLEMENTATION_PLAN.md`.

## 25. `PROJECT_SPEC.md`

The actual product source-of-truth file is included in this package.

## 26. `ARCHITECTURE.md`

The actual technical architecture, schemas, API contracts, trust/security and deployment decisions are included in this package.

## 27. `IMPLEMENTATION_PLAN.md`

The actual nine-phase execution plan, plus read-only Phase 0, granular Phase 3 subphases, approval gate and checkpoint rules, is included in this package.

## 28. `AGENTS.md`

The actual implementation-focused coding-agent rules are included. They require the early Preview, no production data/secrets in Preview, E2E functionality gate, mockup approval, documentation/footer completeness, one task at a time and stop/report behaviour.

## 29. `AI_HANDOFF.md`

The actual initial handoff state is included. It states current phase 0, no repository URL inspected, no Preview URL deployed, no deployed commit, no tests run, final design not started/not approved, documentation link status and the single next task.

## 30. Final pre-implementation audit

The audit has been performed against the source research, selected workflow and all handoff documents. The following decisions have been resolved:

1. **No AI or blockchain:** removed from MVP because they do not help prove core value and would add trust, privacy and integration complexity.
2. **Platform probe not called independent:** source type and copy explicitly say platform-operated; third-party probe operators are future scope.
3. **Evidence starts before outage:** session begins while host is available; bounded duration plus 24-hour sync grace allows the host's local spool to upload after recovery.
4. **Signature vs truth:** signed bytes establish provenance/integrity only; assessment is qualified and `UNKNOWN` supported.
5. **Missing telemetry:** absent UPS/GPU/renter source is unavailable/gap, never “normal.”
6. **Credential vs signature:** added `source_credentials` bound to `witness_keys`; the bearer credential authorizes ingestion and Ed25519 verifies signed event bytes.
7. **Separate platform keys:** API root signing key signs source certificates and bundles; worker-only probe key signs platform probe events.
8. **Renter invitation secrecy:** token is delivered in URL fragment and cleared before API request, not placed in path/query or Referer.
9. **SSRF:** fixed endpoint scheme/port/path/method; DNS challenge; no redirects/proxy; reject private/reserved target; pin validated IP; test DNS rebinding.
10. **Protocol window/caps:** source `observed_at` must be inside the capture window; delayed `received_at` is allowed only until the 24-hour ingestion deadline; each incident is capped at 4,000 accepted events and 7 MiB of serialized event entries, with a 10 MiB hard limit on the complete canonical bundle.
11. **Demo truthfulness:** synthetic events require both an operator demo flag and `incident.demo_mode=true`; demo evidence is visibly marked and grade-capped. GPU/driver fault is not classified in v1; it remains UNKNOWN.
12. **Marketplace consequence:** no automated score adjustment/appeal or “excused outage” conclusion.
13. **Account deletion:** no v1 delete endpoint or CTA; production is blocked until live-data, exported-bundle and backup-retention/deletion rules are approved.
14. **Preview vs production:** distinct staging project/credentials and test data; no real production action; early route-complete UI mandatory.
15. **Visual design:** no palette/aesthetic decided now; mockups only after E2E gate and final design only after explicit approval.
16. **Footer/docs/repo:** real `/docs` route planned; GitHub link waits for real public repo URL and operator approval; private repo is not exposed.
17. **Test evidence:** no tests claimed passed because implementation is not started.
18. **Repository/deployment unknowns:** no repository, GitHub URL, Vercel project, Supabase project, Render service, host, domain or secrets were supplied. Phase 0 must inspect and report. No URLs invented.

### Remaining external dependencies and justified open points

- **Repository and deploy services:** must be identified in Phase 0; this is an environment fact, not a product/architecture decision for the coding agent.
- **Host domain/public HTTPS route and real GPU host:** must be supplied/tested. Without a public host endpoint, the platform probe cannot test reachability; NAT-only hosts are explicitly excluded from MVP.
- **Probe-to-machine binding:** DNS TXT establishes domain control and fixed health endpoint establishes reachability under provider configuration; this does not cryptographically attest that the endpoint maps to the GPU machine. The bundle must disclose this.
- **Account deletion/backup retention:** no production deletion CTA until provider backup retention and live-data deletion procedure are confirmed and documented. This is a privacy/legal dependency, not an agent choice.
- **User demand and marketplace acceptance:** remain unvalidated; no claim of market fit or commercial traction should be made.
- **Hackathon rule details and cutoff time:** verify current official Round 2 rules before submission.
- **Final design references:** intentionally deferred until late mockup phase.

### Audit verdict

The product, MVP boundaries, trust semantics, core architecture, data entities, API surface, authorization model, security constraints, UI routes, implementation phase order and acceptance criteria are defined sufficiently for a coding agent to begin **Phase 0 repository inspection only**. Phase 0 must report the real repository/environment and stop for operator review. Phase 1 must not start until the operator accepts that audit and authorizes the Preview deployment path.

---

## CODING AGENT START POINT

Give the coding agent this exact first task:

> **Phase 0 — read-only repository/platform inventory only.** Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_SPEC.md`, `ARCHITECTURE.md` and `IMPLEMENTATION_PLAN.md`. Inspect the current working directory, Git root/branch/status/latest commit, repository tree, package manifests, existing frontend routes, backend entry points, database schema/migrations, authentication, tests, CI and deployment configuration. Inspect environment variable names only; do not print `.env` values, tokens, credentials, signing keys or database URLs. Identify existing Vercel, Render and Supabase projects/configuration if present, but do not connect, create, change or deploy anything. Compare the repo with the blueprint and report actual current state, reusable components, gaps, conflicts, risks and the smallest safe implementation mapping in the agent response. Do not create or modify any file in Phase 0. Do not install packages, change files, run migrations, create projects, deploy, commit, delete or refactor. Do not invent repository or preview URLs. **STOP after the audit and report findings for operator review.**

The next phase is not authorized by this initial task. Wait for the operator's explicit instruction after Phase 0 review.
