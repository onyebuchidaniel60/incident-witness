# AGENTS.md — Incident Witness Coding Agent Rules

These instructions are mandatory for every AI coding agent or human implementer working in this repository. `PROJECT_SPEC.md` defines product behaviour; `ARCHITECTURE.md` defines technical decisions; `IMPLEMENTATION_PLAN.md` defines sequencing and acceptance gates; `AI_HANDOFF.md` defines the current execution state.

## 1. Project purpose

Incident Witness is a portable incident-evidence protocol for decentralized compute. It records signed, bounded observations from a provider's Linux GPU host, a renter-side workload client and a separately operated **platform probe**; correlates the observations deterministically; and seals them into an offline-verifiable evidence bundle.

It is not a GPU marketplace, outage adjudicator, automatic reliability-score changer, AI diagnosis product or blockchain application. It does not prove sensor truth or root cause. Use careful language: “tamper-evident,” “signature-verifiable,” “source-attributed observation,” and “evidence pattern consistent with.” Never claim “tamper-proof,” “trustless,” “independent third-party” for the platform-operated probe, or “proof of cause.”

## 2. Required reading order

Before changing any file, read:

1. `AI_HANDOFF.md`.
2. `PROJECT_SPEC.md`.
3. `ARCHITECTURE.md`.
4. `IMPLEMENTATION_PLAN.md`.
5. `docs/PROPER_VIBE_CODING_WORKFLOW_REFERENCE.md`.
6. Relevant `docs/` material and the current task prompt.

If this file conflicts with `PROJECT_SPEC.md` or `ARCHITECTURE.md`, stop and report the contradiction. Do not decide which source to override. The operator must approve the correction.

## 3. Architecture is fixed

The approved MVP stack is:

- Node.js 26.13.0 LTS baseline; use later supported 26.x security patches when available, TypeScript strict, npm workspaces.
- Next.js 16.4.x App Router + Tailwind CSS 4.x for web; use Next 16 `proxy.ts` rather than legacy `middleware.ts` for its proxy convention.
- Fastify 5 API.
- Supabase Postgres + Supabase Auth email OTP; isolate the currently beta `@supabase/ssr` integration behind an adapter and pin/test its version.
- Drizzle ORM + `pg`, restricted database roles and RLS.
- `jose` JWT verification.
- Shared Zod/domain schemas and Fastify JSON Schema boundaries.
- RFC 8785 JCS canonical JSON using the exact pinned `canonicalize@5.1.0` package, SHA-256 and Ed25519 signatures. No custom canonicalizer; enforce I-JSON and exact canonical raw request bytes as specified in `ARCHITECTURE.md`. Node runtimes use built-in `node:crypto`; the offline browser verifier uses pinned `@noble/ed25519` 3.2.x for public-key verification only through a browser-safe package export. No private signing key is ever present in browser code.
- Linux x86_64 host agent with SQLite local spool.
- Incident-scoped TypeScript renter SDK.
- Separate Render background probe worker using Postgres job leases.
- Vercel Preview/Production for frontend; Render for API and worker.
- Vitest, Playwright and pgTAP.

Do not replace these technologies, introduce a new infrastructure dependency or change a major version without operator approval. Patch/minor dependency choice within the agreed version line is an implementation detail, but pin the lockfile and prove compatibility. Re-check current official documentation; do not blindly copy stale package commands.

No Redis, Kafka, Kubernetes, object storage, AI provider, payment service, blockchain, token, Arweave or marketplace integration in MVP.

## 4. Coding agent role and scope

You are the implementation executor, not the product architect.

- Implement only the exact assigned task/phase.
- Do not expand scope, add “nice” features, rename product concepts, invent UX behaviour or independently alter business logic.
- Do not redesign the data model, API contracts, event schema, state machines, permissions, trust model or architecture.
- Do not reorganize unrelated folders or rewrite working modules without permission.
- Reuse existing code when safe; report inconsistencies first.
- If the repo differs from the blueprint, perform the approved minimum-diff mapping; do not migrate or delete existing functionality on your own.
- Do not proceed to the next phase automatically.
- Stop after assigned acceptance criteria pass and report the checkpoint.

**IMPLEMENTATION DETAIL — AGENT MAY DECIDE:** variable names, internal function decomposition, component composition, private helper names, exact patch versions within approved major versions, and formatting/lint configuration consistent with repo standards—provided observable behaviour, schema, security or architecture do not change.

Everything affecting product behaviour, data exposure, API, state, architecture, evidence trust, privacy, scope or user-visible claims is not an implementation detail.

## 5. Phase sequencing is mandatory

Preserve this order:

1. Read-only repository/platform inventory.
2. **Early skeletal frontend + Preview deployment** in Phase 1.
3. Backend/data/auth foundations.
4. Core signed evidence protocol, domain APIs, agent, renter SDK and platform probe.
5. Progressive functional frontend integration.
6. End-to-end MVP completion and acceptance gate.
7. Design reference collection and mockups.
8. **STOP for explicit operator approval.**
9. Implement approved final visual UI.
10. Complete frontend shell, documentation, footer links, accessibility and responsive behaviour.
11. Security/regression/production readiness.

### Early frontend/Preview rules

- Build the route-complete, navigable skeletal UI near the beginning; do not wait for backend completion.
- Use temporary styling; no final visual identity is approved yet.
- Deploy a stable Preview URL as soon as practical in Phase 1.
- Report the **exact** Preview URL and deployed commit SHA immediately after deployment.
- Keep the same Preview updated after each verified phase checkpoint.
- Confirm Preview uses test data, staging services and sandbox integrations. Never expose production data, production secrets, platform private signing keys, real device credentials or irreversible production actions.
- If Preview deployment is blocked, report the exact blocker and local verification evidence; do not claim deployment or invent a URL.
- Do not make placeholder controls look live. Clearly mark unfinished screens and nonfunctional controls.

### Functionality gate

Do not start final visual design until every MUST HAVE core flow and critical failure path passes end-to-end on the deployed Preview, signature verification and tamper detection work, cross-user authorization tests pass, SSRF controls pass and no unresolved P0/P1 defects remain. Provide test commands/results and deployed SHA. Only operator can accept an exception.

### Design reference and approval gate

- Obtain URLs/screenshots/images/products/written direction from operator.
- If operator has no references, propose candidates and wait for their selection; do not silently choose a generic SaaS style.
- Create reference-informed mockups for all principal screens and key states, desktop and mobile.
- Explain borrowed attributes and intentional deviations.
- Present mockups and revise from operator feedback.
- **Do not implement final visual styling until the operator explicitly approves the mockup direction.** No implicit approval and no skipping this stop.
- Preserve approved references/assets/mockups and decisions in `docs/DESIGN_DECISIONS.md` and `AI_HANDOFF.md`.
- Final visual implementation must not change product behaviour, business logic, data model, APIs, security or architecture. Request separate approval for any such change.

## 6. Product and business invariants

- Product name: Incident Witness.
- MVP is provider-neutral; do not assert integrations with marketplaces.
- Provider, renter client and platform-operated probe are distinct source categories. The platform probe is not an external independent organisation.
- A signature verifies integrity/provenance from a key, not the truth of a sensor reading or cause.
- Return `UNKNOWN` where evidence is insufficient or conflicting.
- Do not treat missing UPS/GPU/renter observations as “normal.” Represent them as unavailable/gap.
- Host agent runs Linux x86_64 unprivileged; no remote shell or arbitrary command execution.
- Event payloads are typed and bounded; no free-form logs, prompts, model inputs/outputs, datasets, credentials or arbitrary process data.
- Capture session starts while host is available; it is bounded (2–240 min; default 30 min) and permits a 24-hour ingestion grace period after end.
- One active session per host; max three active per owner.
- Enrollment token: single use, 10 minutes. Renter invitation: single use, 15 minutes.
- Evidence events append only. Sealed bundles are immutable. Key revocation prevents new events but does not invalidate valid historic signatures.
- Platform assessment is deterministic, versioned and explainable; no probability scores and no LLM.
- Simulation is permanently labelled and caps evidence grade at LOW.
- No payments, financial logic, AI, blockchain, Arweave, token or automatic marketplace penalty/reputation change.

## 7. Security requirements

- Every API operation checks authentication, permission and resource ownership on the server. Never trust client-supplied owner IDs.
- Return 404 for non-owned resource identifiers; do not reveal another account's resource existence.
- Never expose platform signing private key, DB credentials, service-role/secret key, host credential, renter credential, enrollment token, invitation token or private key to client bundle.
- Never print `.env` contents or secret values in logs, responses, terminal summaries or documentation.
- Never use Supabase `service_role`/secret key in browser. Runtime DB roles must not have superuser or `BYPASSRLS`.
- Test DB grants as well as RLS. RLS policies alone do not prove safe access.
- Validate JWT signature, allowed algorithm, issuer, audience, expiry and subject.
- Use parameterized SQL; reject unknown event fields; cap body/payload and bundle sizes.
- Use Ed25519 signatures over RFC 8785 canonical JSON. Do not invent a custom canonicalization or allow client-selected algorithm.
- Events must be scope-checked, signature-verified, sequence/idempotency-checked and within incident time window.
- Probe only DNS-verified public HTTPS hostname, port 443, fixed path and GET; no redirects, proxy env, user paths or arbitrary ports. Reject loopback/private/link-local/reserved/metadata and IPv4-mapped IPv6. Pin the resolved, validated address for the connection. Treat DNS rebinding as a blocking security issue.
- Host agent uses fixed binaries/arguments with `execFile`; never shell interpolation or arbitrary commands. Run unprivileged.
- Do not add arbitrary URL fetch, file upload or raw log ingestion.
- Lock and transaction state transitions for token redemption, incident creation, event ingestion and sealing. Add race tests.
- Redact authorization, cookies, OTP, credentials, tokens, private keys and sensitive event values from logs.
- No unsafe Preview access, production database or real device credentials in staging.

## 8. Testing and verification rules

For each task:

1. Identify requirement IDs and acceptance criteria.
2. Add tests before or with implementation.
3. Run focused tests, then relevant broader suite.
4. Run lint, typecheck and production build for changed app/package.
5. Inspect `git diff` and changed files; look for secret leaks, unrelated files and unapproved behaviour changes.
6. For UI tasks, verify actual deployed Preview when phase requires it.
7. Report exact commands and actual results; never claim a skipped test passed.

Do not disable tests, lint rules, TypeScript strictness, security headers or checks merely to make a build pass. If a check blocks progress, identify root cause and propose a fix.

## 9. Documentation requirements

- Keep `README.md` useful: product summary, setup, configuration, test, dev, deployment and troubleshooting entry points.
- Maintain `docs/` covering setup, environment, architecture, API, event protocol, host agent install, renter SDK, user/operator guide, privacy/data lifecycle, security, deployment, operations and troubleshooting as applicable.
- Update docs in the same phase that changes behaviour/contracts.
- Add ADR for every approved architecture decision.
- Update `AI_HANDOFF.md` at every checkpoint.
- Home footer must link to real, reachable Documentation destination (`/docs` or operator-approved published site).
- Add GitHub link only if actual repository URL is confirmed and public disclosure is approved. If private/inappropriate, record reason and ask operator before omission/alternative.
- Never fabricate docs/repo URLs, company details, metrics, claims, contact information or legal copy.

## 10. Frontend completeness rules

Final frontend must include applicable:

- All approved routes/screens, global navigation and footer.
- Real Documentation and approved GitHub links.
- Responsive desktop/tablet/mobile behaviour.
- Accessibility basics: semantic landmarks/headings, labels, keyboard operation, visible focus, accessible status/error feedback, meaningful contrast and reduced motion.
- Loading, empty, validation, success, stale, error, permission-denied and not-found states.
- Real link destinations, no dead links, no `href="#"`, no inert controls, no unexplained placeholder text.
- Page titles/descriptions, favicon/app icon and appropriate social metadata.
- Privacy/Terms pages only with operator-approved content; support/contact only with real supplied address.
- Preview and production link checks.

## 11. Git and change management

- Check `git status` before starting; never overwrite uncommitted operator work.
- One task/phase per branch or well-defined commit; small meaningful commits.
- No force push, history rewrite, repository deletion or unapproved deployment.
- Do not commit secrets, generated databases, private keys or `.env` files.
- Commit only after tests pass and diff is inspected.
- If a migration is destructive, stop and request approval plus backup/rollback plan.
- Do not deploy Production unless operator explicitly authorizes the release.

## 12. Ambiguity and failure handling

Stop and report before changing anything when:

- Specification and code conflict on business rules, state transitions, schema, API or permissions.
- A change requires new external service, cost, account, billing plan or architecture.
- The current repo cannot support the approved architecture without major migration.
- Supabase RLS/grant design cannot be verified safely.
- DNS/probe design risks SSRF or cannot pin a validated address.
- Evidence source cannot honestly support its label or assessment.
- The requested change would weaken security, remove a test or make a claim stronger than evidence.
- A legal/data-retention decision needs operator input.

Provide the exact conflict, evidence, risk and smallest proposed resolution. Do not ask the agent itself to make product decisions.

## 13. Stop conditions and checkpoint report

After completing the assigned task, STOP. Do not start a future phase. Report:

- phase/task and outcome;
- files changed;
- migration/API/UI changes;
- commands/tests with actual pass/fail/skip results;
- Preview URL and deployed SHA (or exact blocker);
- what is functional and incomplete;
- safe staging confirmation;
- design references/mockups/approval status;
- docs/footer links status;
- known bugs/security issues;
- Git branch and commit SHA;
- one next task only.

A phase is not complete because code was generated. It is complete only when acceptance criteria are verified and operator accepts the checkpoint.
