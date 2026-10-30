# Incident Witness — Phased Implementation Plan

**Status:** Blueprint only; no implementation has started.  
**Operating rule:** one assigned task/phase at a time → implement → test → inspect → fix → commit → update handoff → stop.  
**Phase owner:** operator approves progression.  
**Coding agent role:** implementation executor, not product/architecture decision-maker.

## Phase sequencing invariant

```text
Read-only repository inspection
          ↓
Phase 1: route-complete skeletal frontend + stable Preview URL
          ↓
Phase 2: data/auth/backend foundations
          ↓
Phase 3: event protocol + core domain/API + agent/SDK/probe
          ↓
Phase 4: functional UI integration
          ↓
Phase 5: all MUST flows + failure paths + E2E proof
          ↓
Hard functionality acceptance gate
          ↓
Phase 6: collect approved references + mockups/prototypes
          ↓
Hard STOP: wait for explicit operator approval
          ↓
Phase 7: implement approved visual direction only
          ↓
Phase 8: frontend/docs/footer/accessibility completeness
          ↓
Phase 9: security/regression/production authorization/release
```

No phase may be skipped or reordered. Phases may be split into smaller tasks, but an agent may not proceed automatically to the next phase.

## Global checkpoint contract

At the end of every phase, the coding agent must report:

- Current phase and exact assigned task.
- Completed work and files changed.
- Database migrations/schema changes.
- API changes and endpoint contract tests.
- UI routes/states that visibly changed.
- Unit/integration/E2E/security tests run, exact commands and actual results.
- Build/lint/typecheck results.
- Commit SHA and branch.
- Preview URL, deployed SHA and whether it loads; if no preview, exact blocker and local proof.
- What is visibly functional and what remains placeholder/incomplete.
- Safe-preview configuration confirmation (test data, no production DB, no real credentials/irreversible actions).
- Documentation status.
- Design references/mockup status and whether operator approval exists.
- Known defects, security concerns and dependencies.
- The one next task, without starting it.

No completion claim without test evidence. If deployment fails, report the blocker; never invent a URL or claim deployment succeeded.

---

## Phase 0 — Repository and platform inventory (read-only)

**Objective:** determine the actual starting point before changing files or selecting an existing repository.  
**Dependencies:** operator supplies or opens the intended repository/workspace; no assumed repo path or GitHub URL.  
**Scope:** inspect only. No file modifications, installs, migrations, commits or deployments.

### Tasks

1. Print current working directory, Git root, branch, status and latest commit.
2. Inspect repository tree and root documentation, package manifests, lockfiles, `.node-version`, `.gitignore`, CI config and deployment configuration.
3. Identify existing frontend routes, backend entry points, database schema/migrations, auth/session model, shared packages and tests.
4. Inspect environment variable names only. Never display `.env` values, credentials, private keys, tokens or secrets. Confirm which variables are missing without printing values.
5. Identify existing Vercel/Render/Supabase project links/config if already present; do not connect, create, rotate or deploy anything in this phase.
6. Compare existing technology and structure against `PROJECT_SPEC.md` and `ARCHITECTURE.md`.
7. Identify dependency vulnerabilities/build blockers without installing packages or upgrading dependencies.
8. Produce a structured repository audit in the agent response with current state, differences, reusable components, risks and a minimal implementation mapping. Do not create or modify a repository file during this read-only phase.
9. STOP and request operator direction if a repository migration, deletion, new project/account, deployment or major refactor is required.

### Expected files/components

No repository files changed. Report the audit in the agent response. Only create `REPOSITORY_AUDIT.md` after the operator explicitly authorizes a documentation-only write.

### Tests / verification

No tests are run if doing so mutates the repository/environment. Read-only commands such as `git status`, `git log`, package scripts listing and configuration inspection are permitted. Report existing test status from repository configuration only; do not claim tests were run.

### Acceptance criteria

- Current repo and branch known.
- Stack, package manager, app entry points, routes, data layer and auth are inventoried.
- Existing app state accurately documented.
- Secrets have not been printed or copied.
- No files or deployment resources changed.
- Differences and recommended minimal mapping recorded.
- Operator knows whether implementation can proceed without architectural change.

### Git checkpoint

None; read-only. Do not create a commit.

---

## Phase 1 — Repository/platform foundation + skeletal frontend Preview deployment

**Objective:** get a visible, navigable application shell online before backend implementation.  
**Dependencies:** Phase 0 accepted; operator confirms target repo, Vercel project or permission to create one, and safe staging configuration.  
**Hard rule:** no final visual design, no real data, no platform signing key, no real host credentials.

### Tasks

1. Apply only the agreed repository layout using the smallest safe changes. If existing repo has code, reuse it; do not rewrite unrelated modules.
2. Set/pin Node.js 26.13.0 LTS (or later supported 26.x patch available at implementation start) and npm workspaces. Create/verify lockfile and baseline scripts.
3. Scaffold Next.js 16.4.x App Router with TypeScript strict and temporary Tailwind CSS 4.x styling; use the Next 16 `proxy.ts` convention for auth session refresh when auth is introduced.
4. Add the agreed routes and route guards using structural placeholders:
   - Public: `/`, `/login`, `/verify`, `/docs`, `/privacy`, `/terms`.
   - Protected placeholder pages: `/dashboard`, `/hosts`, `/hosts/new`, `/hosts/[hostId]`, `/incidents`, `/incidents/new`, `/incidents/[incidentId]`, `/settings`.
5. Add plain header, primary navigation, mobile navigation, basic footer, not-found route, route error state, loading boundary and clearly marked unfinished placeholders.
6. Ensure buttons/links that appear functional really navigate or execute the stated placeholder action; no false “connected/verified” status.
7. Create safe environment config. Preview uses a dedicated staging Supabase project or an explicit no-auth placeholder mode; do not connect production auth/data.
8. Configure Vercel Preview deployment and domain. Use branch preview and protect it if app/data later become sensitive.
9. Deploy the skeletal shell. Give the operator the exact URL and deployed commit SHA in the phase report.
10. Verify all route URLs load, navigation works, responsive shell has no blocking overflow and Preview has no production data/services.

### Expected files/components

`apps/web` route tree; shared shell/header/footer/nav; temporary style primitives; `README.md` initial; `.node-version`; root npm workspace config; Vercel config only if needed; `.env.example`; CI baseline. No API functionality, agent binaries or final design.

### Database/API changes

None, except no live migration. Any frontend env value must be public-safe and staging-only.

### Tests

- `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Playwright smoke test loads every route, navigation and not-found route.
- Preview manual check at desktop and mobile widths.
- Check response headers and browser console for runtime errors.
- Confirm no `.env` file or secret is in Git history or client bundle.

### Acceptance criteria

- Stable Preview URL is reachable by operator.
- Preview commit SHA equals intended verified commit.
- All agreed routes exist; public/protected distinction is visible even if auth is placeholder.
- No final aesthetic assumed; only temporary structure.
- No fake data or working-looking nonfunctional controls.
- No production credentials or data.
- `AI_HANDOFF.md` updated with exact preview URL, deployed SHA, visible/incomplete UI and test evidence.

### Git checkpoint

`chore: establish app shell and preview deployment` or smaller meaningful commits. Stop after deployment and report.

---

## Phase 2 — Backend/data/auth foundation

**Objective:** build safe backend skeleton, DB access and auth boundaries without implementing all incident logic.  
**Dependencies:** Phase 1 accepted; staging Supabase project approved and credentials supplied securely.  
**UI:** keep Preview alive; connect login only when tests pass; no visual polish.

### Tasks

1. Scaffold Fastify API with readiness/liveness routes, Pino, error handler, request IDs and Zod/JSON-schema validation boundary.
2. Add `packages/db` Drizzle schema and initial versioned migrations for profiles, hosts, endpoint challenges, keys, tokens, incidents, invitations, events, probe jobs, platform keys, bundles and audit.
3. Create least-privilege DB roles (`iw_api`, `iw_worker`, migration owner) with no runtime superuser/BYPASSRLS.
4. Implement RLS policies and test role grants. Confirm transaction-local `auth.uid()` identity works with the actual connection method. If not, STOP for ADR/approval; don't silently use service-role bypass.
5. Integrate Supabase Auth OTP in web and `jose` JWT verification in API; enforce issuer/audience/expiry/signature/subject.
6. Implement minimal account bootstrap/profile idempotency; implement protected API test route.
7. Add rate-limit plugin, CORS allow-list, CSP/security headers where applicable, safe error schema and Pino redaction.
8. Add staging secrets via approved secret managers; `.env.example` contains placeholders only.
9. Add migration/test commands, seed disposable data and CI for lint/typecheck/build/unit/integration.
10. Update Preview login/dashboard with real auth and minimal “no hosts yet” state, while all other functionality remains visibly incomplete.

### Expected files/components

`apps/api` bootstrapping/plugins/auth/health; `packages/db` schema/migrations/repositories; Supabase config/migrations; web auth callback/protected route guard; test fixtures; CI workflow; docs for setup/auth/db role behavior.

### Database changes

Create all tables and RLS described in `ARCHITECTURE.md`. Verify indexes, checks, immutable grants and FK order. Do not apply ad hoc dashboard edits.

### API changes

`GET /health/live`, protected `GET /health/ready`, auth verification middleware and minimal `/v1/me` if required for frontend session state. No event ingestion yet.

### Tests

- Auth OTP happy/error/expired session flow in staging.
- JWT invalid signature, wrong issuer/audience, expired/not-before and missing subject.
- RLS owner A cannot read/update owner B rows; unauthenticated denied.
- `iw_api` cannot bypass RLS/update evidence events/delete bundles.
- `iw_worker` grants constrained to exact tables/columns; cannot access user email/profile secrets.
- API schema/error/rate limit tests.
- Migration from empty DB and reset in disposable test DB.

### Acceptance criteria

- Safe staging auth and DB work with least privilege.
- No production keys or data in Preview.
- RLS and grants are verified by tests, not inferred from dashboard toggles.
- API health endpoints and structured redacted logs work.
- Database migrations are reproducible.
- Preview route/login progress deployed and reported.

### Git checkpoint

`feat: add staging auth and database foundation`. Stop.

---

## Phase 3 — Protocol, core domain, ingestion and observers

**Objective:** implement the signed evidence protocol and all non-UI MVP behavior. Split into independently accepted subphases; do not batch them.

### Phase 3A — Protocol and cryptographic core

Tasks:
1. Implement strict v1 event schemas and payload allow-lists in `packages/protocol`.
2. Use pinned `canonicalize@5.1.0` RFC 8785 implementation; validate I-JSON/safe integers and require event-request raw bytes to equal canonical JSON bytes, rejecting duplicate property names.
3. Implement SHA-256 and Ed25519 helpers plus platform source-key certificate creation/verification and key registry.
4. Implement bundle manifest schema, canonical digest and signature.
5. Add RFC 8785 canonical-byte and Ed25519 golden fixtures/test vectors shared with API, CLI and web verifier.

Database/API: none beyond approved platform key seed. UI: none.  
Tests: canonical bytes cross-runtime, signing/verifying, tampering, unknown/revoked key, additional fields, invalid base64, algorithm confusion, schema size limits.  
Acceptance: no duplicate signature implementation; golden vectors stable; no private key in fixtures; operator accepts protocol format.  
Commit: `feat(protocol): add signed event and bundle primitives`. Stop.

### Phase 3B — Host/incident domain APIs and transactional lifecycle

Tasks:
1. Host CRUD/ownership, DNS challenge and fixed endpoint verification service.
2. Host enrollment token issuance/redemption and key certificate registration.
3. Signed operational-presence heartbeat route with anti-replay sequence and freshness checks.
4. Incident creation, duration/limit enforcement, end/finalize/seal state guards; include API lifecycle sweeper for scheduled end and grace-expiry auto-seal/auto-cancel.
5. Renter invitation issue/redemption and scoped key creation.
6. Host and renter key revocation; archive side effects; audit events and token cleanup.

DB: use tables and indexes defined in Architecture; all state transitions transactional.  
API: host, endpoint challenge/verify, enrollment, incident, invitation routes.  
Tests: owner isolation, DNS challenges, one-time token races, active host/session limits, duration boundaries, double-submit.  
Acceptance: domain APIs satisfy exact state transitions; no event ingest yet.  
Commit: `feat(api): implement host and session lifecycle`. Stop.

### Phase 3C — Signed event ingestion and correlation

Tasks:
1. Implement host/renter/platform source credential authentication.
2. Verify event signatures, protocol version, key scope/status, incident window, timestamp, sequence and idempotency.
3. Append immutable event rows with server receipt timestamp.
4. Implement pure correlator rules and evidence grades; add explanation/gap output.
5. Implement seal transaction, deterministic sort, bundle manifest creation and platform signature.
6. Add owner-only bundle download and immutable state.

DB/API: event ingestion routes, end/seal and bundle endpoints.  
Tests: all event, sequence/replay, race, tampering, unknown, simulated cap, bundle verify.  
Acceptance: full server-side domain sequence works via integration tests; no final UI design.  
Commit: `feat(evidence): ingest and seal signed incident bundles`. Stop.

### Phase 3D — Linux host agent

Tasks:
1. Enrollment CLI and local Ed25519 keypair creation.
2. Config storage with owner-only permissions; device credential file handling.
3. SQLite spool with durable sequence, size cap and FIFO delivery.
4. Operational-presence heartbeat every 15 sec using a separate monotonic sequence and `/v1/agent/heartbeat`; during active evidence sessions, signed `host_heartbeat` evidence events are queued every 30 sec on the incident event sequence. Presence heartbeats are never included in evidence bundles.
5. Fixed `nvidia-smi` collector every 30 sec; safe `execFile` only.
6. Optional NUT `upsc` collector every 5 sec; missing NUT explicitly unavailable.
7. Retry/backoff, key revocation, graceful stop and gap handling.
8. Package local test harness with fake collectors separated from real collectors; synthetic mode always labelled.

Tests: agent unit tests, local filesystem permissions, presence sequence anti-replay/freshness, spool restart/recovery, offline/online evidence upload, command timeout/malformed output, credential redaction, fixed allow-listed process invocation.  
Acceptance: agent enrolls a disposable host, signs actual events and resumes upload after outage without duplicate sequence. No privilege/root required for basic mode.  
Commit: `feat(agent): add Linux host evidence agent`. Stop.

### Phase 3E — Renter SDK and probe worker

Tasks:
1. Renter SDK one-use enrollment, local per-session key, heartbeat and fixed endpoint result.
2. Bounded local queue and scoped ingestion.
3. Probe worker polling/leases; approved endpoint extraction; secure resolver and pinned connect.
4. HTTPS fixed GET health check; TLS validation, no redirects, time/body limits.
5. Platform-signed `platform_probe_result` and probe gap/system failure records.
6. Retry/dead-letter and worker metrics.

Tests: renter scope and token races; probe private/loopback/link-local/metadata IPv4/IPv6 rejection; DNS rebinding; redirect and proxy env; lease races; worker crash/retry; distinguish probe infrastructure error from target unreachable.  
Acceptance: test renter and worker contribute signed observations to same incident; SSRF test suite passes.  
Commit: `feat(witnesses): add renter SDK and secure probe worker`. Stop.

### Phase 3F — CLI verifier and integration demo harness

Tasks:
1. Build `iw-verify` using same protocol package; support file path, clear report and stable exit codes.
2. Build synthetic scenario harness for power-pattern, network-loss and insufficient-evidence cases. Label all generated evidence as simulated.
3. Build optional real Linux test endpoint and demo workload runner; only report GPU as real when actual device collector confirms it.
4. Capture repeatable test evidence and test fixture bundles.

Tests: CLI verifies valid bundle; detects changed manifest/event/signature; rejects unknown platform key; browser verifier and CLI agree on fixtures.  
Acceptance: demonstrable, repeatable verification and honest synthetic/real separation.  
Commit: `feat(verify): add offline bundle verifier and demo harness`. Stop.

---

## Phase 4 — Functional frontend integration

**Objective:** progressively wire existing skeletal routes to real API behavior using temporary consistent styles.  
**Dependencies:** Phase 2 and relevant Phase 3 subphases accepted.  
**Preview:** keep the same Preview deployment updated after each verified subtask.

### Tasks (separate checkpoints)

1. Connect OTP login/logout, protected route guard and session expiry handling.
2. Connect host list/create/detail, DNS challenge and verify status.
3. Connect host enrollment UI and copyable install command; never show credential twice after initial issuance.
4. Connect incident list/create/detail and source health.
5. Connect renter invitation panel and copy control; display expiry and one-use warning.
6. Connect live/refreshing timeline, gaps, stale state and end/finalize/seal confirmations.
7. Connect bundle download and local `/verify` browser workflow via protocol package.
8. Implement settings/key revocation/host archive as specified; account deletion remains disabled until retention procedure approved.
9. Implement all loading/empty/error/permission/not-found and stale states.
10. Run critical user journeys in deployed Preview, not only local environment.

### Expected UI files

Route page components, API client, typed query/mutation hooks, `AppShell`, auth guard, host and incident components, timeline, bundle file workflow, verification checklist and shared behavior primitives.

### Database/API changes

No business rule changes allowed. API changes only to correct mismatches approved in the spec; schema/contract change requires operator approval + ADR.

### Tests

- Playwright registration/login to dashboard.
- Create host and DNS challenge flow against test DNS.
- Enroll test agent and see heartbeat.
- Create session, renter join, source timeline, end/seal/download/verify.
- Wrong owner and expired invite UI handling.
- Keyboard and responsive shell smoke tests (not final design compliance yet).

### Acceptance criteria

- Core pages use real data; there is no fake green or healthy status.
- Main provider journeys work end-to-end; failure states visible.
- Preview updated; deployed commit SHA/test evidence reported.
- No final visual style has been started.

### Git checkpoint

One commit per accepted user journey. Stop at each subtask.

---

## Phase 5 — MVP functionality completion and E2E verification gate

**Objective:** finish all MUST behaviour and prove it before any visual redesign.  
**Dependencies:** Phase 4 accepted.

### Tasks

1. Complete all MUST requirement gaps; do not add Should/Nice features unless operator approves.
2. Verify session concurrency/limits and all lifecycle transitions.
3. Verify signed-event ingestion and bundle seal atomicity under race.
4. Demonstrate the three-source incident timeline using controlled real endpoints and clearly labelled synthetic power/wan signals where physical failure injection is unsafe.
5. Ensure an unavailable UPS/GPU/renter source is shown as unavailable, not normal.
6. Run end-to-end offline verification and deliberate tamper demonstration.
7. Verify permissions, rate limits, all edge cases and critical security checks.
8. Conduct an independent adversarial code review; agent reports findings before changing code.
9. Resolve P0/P1 defects and re-run tests.
10. Operator reviews deployed Preview and accepts core functionality in writing.

### Required E2E acceptance evidence

- Flow: login → create host → DNS proof → enroll agent → heartbeat.
- Flow: create evidence session → renter invitation → renter SDK enroll → observations → external probe → finalization → sealed bundle.
- Scenario: power-related pattern with UPS transition; assessment is phrased as consistency, never root-cause proof.
- Scenario: external reachability loss while UPS remains online; not over-labeled as ISP failure.
- Scenario: insufficient evidence produces UNKNOWN.
- Tamper test changes at least one event and the manifest; verifier detects each.
- Revoked key / expired invite / duplicate sequence rejected.
- Concurrent create/seal/event tests yield one consistent result.
- User A cannot read/write User B's hosts, incidents or bundles.
- Probe SSRF/DNS-rebinding tests pass.

### Hard functionality gate

Final visual design is prohibited until all MUST acceptance criteria pass on deployed Preview, critical flows work, no P0/P1 defect remains, tests provide evidence and operator explicitly accepts the gate. An exception requires explicit, recorded operator acceptance and scope. Agent may not waive this gate.

### Git checkpoint

`test: verify incident evidence MVP end to end`. Stop; request operator acceptance of functionality gate.

---

## Phase 6 — Design references, mockups and operator review

**Objective:** establish a human-approved visual direction for the already-working product.  
**Dependencies:** Phase 5 functionality gate accepted.  
**No final UI implementation is allowed in this phase.**

### Tasks

1. Ask operator for design URLs/screenshots/products/written direction. If none are given, gather a short candidate set and present it for selection; do not silently choose a generic SaaS aesthetic.
2. Record selected references and what attributes each informs (layout, density, hierarchy, color treatment, typography, motion, table/timeline interactions).
3. Prepare reference-informed mockups/prototypes for:
   - public homepage;
   - authenticated dashboard;
   - host setup/enrollment;
   - incident timeline/detail;
   - end/seal/assessment states;
   - verifier valid/tampered/unknown-key states;
   - desktop and mobile key layouts.
4. Include empty/loading/error/permission states and nav/footer, not just hero screens.
5. Identify intentional deviations and explain them (e.g., evidence timeline must prioritize source/time labels over a copied marketing layout).
6. Present mockups to operator; record feedback; revise.
7. Update `docs/DESIGN_DECISIONS.md` with references, assets, mockup revisions and unresolved items.

### Acceptance criteria

- Operator has reviewed all key screens and states at desktop/mobile.
- Approved reference links/assets and decisions stored.
- No final visual CSS/brand implementation has been applied.

### Git checkpoint

`docs: add operator-reviewed UI mockups` after approved mockup file delivery. Do not proceed automatically.

---

## Explicit Approval Gate — wait for operator

The coding agent must stop and request an explicit approval message for the final UI direction. Silence, absence of feedback, “looks okay” from a third party, or approval of a single isolated screen does not count. No final visual styling, brand tokens, component restyling or animation implementation until the operator explicitly approves the complete mockup direction. Record approval date/version and approved assets in `docs/DESIGN_DECISIONS.md` and `AI_HANDOFF.md`.

---

## Phase 7 — Implement approved final UI

**Objective:** apply the approved direction to the existing functional application without changing product behaviour.  
**Dependencies:** explicit operator approval gate.

### Tasks

1. Implement approved tokens: colors, typography, spacing, borders, elevation, radii, states, icon treatment and motion.
2. Apply visual design to all approved routes/components, preserving API contracts, permission behaviour and state machines.
3. Apply responsive patterns to all major screen sizes.
4. Implement visual feedback for loading/error/empty/success/stale/permission-denied/unknown/simulation states.
5. Verify chart/timeline readability and signature/assessment language remain exact.
6. Document any implementation deviation; obtain operator approval if deviation changes design intent.

### Tests

Visual regression/screenshot review; all Phase 5 E2E tests rerun; accessibility audit at key responsive widths; keyboard navigation and focus order; no console errors.

### Acceptance criteria

- UI matches approved mockups/direction.
- Product behaviour, API, rules and security unchanged.
- Deviations recorded and approved.

### Git checkpoint

`feat(ui): implement approved Incident Witness design`. Stop.

---

## Phase 8 — Frontend and documentation completeness

**Objective:** complete the product shell and public-facing/operational docs, not just the principal screens.  
**Dependencies:** Phase 7 accepted.

### Tasks

1. Finish global navigation/footer, all links and all routes.
2. Make `/docs` a useful real documentation destination with host install, renter SDK, bundle format and limitations.
3. Add home footer Documentation link to actual reachable `/docs` (or operator-approved published docs).
4. Add GitHub footer link only after actual repository URL is confirmed public and operator approves disclosure. If repo private, record reason and obtain approval for omission/alternative; never expose it by default.
5. Complete Privacy and Terms pages using operator-approved content. No fabricated company/address/contact/legal statements.
6. Complete title/description metadata, favicon/app icon, social metadata if appropriate, sitemap/robots rules for public docs/marketing routes and noindex for private pages.
7. Check support/contact destination: use only real operator-supplied support channel; otherwise omit and record why.
8. Ensure every button works, every link resolves, all relevant state variants are handled, no placeholders remain unexplained.
9. Complete responsive and accessibility refinement with keyboard/screen reader checks.
10. Update README and docs: setup, configuration, testing, deployment, security, protocol, user/operator, troubleshooting and operations.
11. Check all footer/navigation links on deployed Preview.

### Tests

Crawl routes, check links, test metadata, 404, redirects, privacy/terms navigation, docs install steps, keyboard-only flows, mobile/tablet/desktop layout, console/network errors. Run Playwright and full test suite.

### Acceptance criteria

- Complete frontend inventory from `PROJECT_SPEC.md`.
- Real Documentation footer link resolves on Preview.
- GitHub link resolves only if confirmed public and approved; approved exception documented otherwise.
- No dead links/inert controls/placeholder links or fabricated public claims.
- Docs in repo and Docs page are consistent.
- Preview final SHA and test results recorded.

### Git checkpoint

`docs(ui): complete frontend shell and project documentation`. Stop.

---

## Phase 9 — Final regression, security, production authorization and monitoring

**Objective:** prove production readiness and release only with operator authorization.  
**Dependencies:** Phase 8 accepted; production accounts/secrets/domains and policy copy supplied by operator.

### Tasks

1. Run complete unit/integration/E2E/security/dependency/secret-scan suite from clean install.
2. Conduct dedicated threat review: JWT/auth, RLS/grants, IDOR, SSRF, DNS rebinding, XSS/CSRF, replay, races, key rotation, secret leakage, bundle verification, data deletion.
3. Review deployment variables and access permissions; ensure Preview and Production are separate.
4. Review DB backup/restore plan and execute test restore in staging.
5. Review rate limits, service quotas, health/readiness alerts, logs/redaction, worker recovery, signing-key availability and key-rotation runbook.
6. Produce release candidate commit and changelog; no unapproved scope change.
7. Request explicit production release approval. Do not deploy production before it.
8. After approval, deploy frontend/API/worker and run production smoke test with synthetic/non-sensitive test event only. Do not probe a real host or run real renter job until owner authorizes it.
9. Monitor first deployment and document outcome/known limitations.

### Acceptance criteria

- All critical tests pass; no unresolved P0/P1 vulnerabilities.
- Preview regression passes.
- Production secrets and services verified and separate.
- Operator authorized release explicitly.
- Actual production URLs and deployed SHAs recorded; smoke test evidence provided.
- Monitoring/rollback instructions documented.

### Git checkpoint

`release: incident-witness-mvp-v1` only after production authorization. Stop and report.

---

## Small-task protocol for every phase

Each task prompt must contain:

1. Exact task and explicit non-goals.
2. Files/directories allowed to change.
3. Relevant requirement IDs and acceptance criteria.
4. Tests and commands to run.
5. Deployment/Preview expectation.
6. Stop condition.

After implementing a task: test → inspect diff → security sanity check → fix → commit → update `AI_HANDOFF.md` → report → stop. Do not tell the agent to implement multiple future phases in one prompt.

---

## Initial schedule constraints and unknowns

- No timeline estimate is approved because host hardware, repository state, API/hosting accounts, available credits, DNS control and developer hours are not confirmed.
- Nosana is an optional integration, not a dependency. Do not plan around unclaimed credits or untested API access.
- The demo must separate actual measurements from synthetic signals. It may use a real containerized endpoint and actual signing/verification with synthetic UPS/network events, but all synthetic inputs must remain flagged in the record and UI.
- Hackathon entry is not complete until the required technical story/build documentation has been published according to current official rules. Confirm the current Round 2 deadline/time zone and required evidence with the organizer before planning final submission.
