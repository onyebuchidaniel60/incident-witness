# ADR-001 — Database transaction identity and RLS mechanism

**Title:** Database transaction identity and RLS mechanism for the Fastify API
**Status:** Accepted
**Approval Date:** 2026-10-31
**Date:** 2026-10-31
**Decision owner:** Operator
**Implementation executor:** Coding agent (proposal only)
**Related phase:** Phase 2 — backend/data/auth foundation
**Related documents:** `docs/planning/ARCHITECTURE.md` §§5.1–5.3, §11; `docs/DEPLOYMENT.md`; `AGENTS.md` §§4, 7, 12; `docs/planning/PROJECT_SPEC.md` §§8.4, 14

## 1. Context

The API must run as a restricted PostgreSQL login role, `iw_api`, which has `NOBYPASSRLS` and no superuser privileges. Provider requests must carry a verified Supabase JWT subject into the transaction so RLS can evaluate ownership through `auth.uid()`. Machine-ingestion requests need a different transaction-local context.

Two documents describe the connection/identity mechanism differently. The difference matters because it determines which PostgreSQL role owns each query and which RLS policies apply.

## 2. Exact conflicting text

### `docs/planning/ARCHITECTURE.md` §5.2 — "User transaction context"

> Fastify verifies the Supabase JWT first. Every provider DB request opens a transaction using the `iw_api` login role and sets transaction-local `request.jwt.claim.sub` to the verified JWT subject; it may set `iw.request_mode=provider` as a transaction-local context marker. The subject must come only from the verified JWT, never the request body. RLS uses `auth.uid()` for ownership and policies targeted to `iw_api`. Do not `SET ROLE authenticated`; the Supabase `authenticated` role has no direct table grants. Machine-ingestion transactions set a separate, explicit context (`iw.request_mode=machine_ingest`, source key ID and incident/host scope) only after the API has validated the scoped bearer credential and event signature. Worker requests use the separate `iw_worker` login.

> Transaction pooling is not used for this API role because transaction-local identity and mode must remain scoped to the transaction; use direct connection or a verified session-pooler configuration. A request must not run queries after its transaction closes. The exact database role setup and GUC handling must be tested against local Supabase using the real login roles. If the chosen hosting connection mechanism cannot safely maintain transaction-scoped claims, stop and present an ADR instead of silently falling back to service-role bypass.

### `docs/DEPLOYMENT.md` — "Database connection"

> Use a direct connection or session pooler where transaction-scoped identity/RLS requires it; verify connection behaviour with integration tests. Do not assume a transaction pooler preserves session state. The selected mechanism must safely execute `SET LOCAL ROLE` and transaction-local JWT claim values for each request.

### Additional constraints

`AGENTS.md` §7:

> Never use Supabase `service_role`/secret key in browser. Runtime DB roles must not have superuser or `BYPASSRLS`.

> Test DB grants as well as RLS. RLS policies alone do not prove safe access.

`docs/planning/ARCHITECTURE.md` §5.1:

> `iw_api` login role is used only by Fastify, must not have `BYPASSRLS` or superuser, and is the role to which provider and machine RLS policies are targeted. It is never exposed to the browser.

`docs/planning/PROJECT_SPEC.md` §8.4:

> The web app never receives platform signing secrets, DB credentials or device credentials.

> Sealed data is immutable through user-facing routes and normal DB roles.

> No production secrets/data in preview environment.

`docs/planning/PROJECT_SPEC.md` §14, database failure row:

| Area | Edge/failure | Expected behaviour |
|---|---|---|
| DB | Transaction rollback/connection loss | No success response; client retries idempotently; no partial sealed bundle |

`AGENTS.md` §12 requires the agent to stop and report when specification and code conflict on permissions or security, provide evidence and risk, and propose the smallest resolution rather than deciding the architecture.

## 3. Interpretations and risks

### Interpretation A — `SET LOCAL ROLE authenticated` per request

This reads the `docs/DEPLOYMENT.md` phrase literally as an instruction for the API to switch from `iw_api` to Supabase's `authenticated` role for each request, set JWT claims, execute queries, and let RLS policies evaluate under `authenticated`.

**Security risks**

- `docs/planning/ARCHITECTURE.md` §5.1 and §5.3 state that `authenticated` has no direct grants on product tables. To make A work, those grants would need to be added, creating a broader access surface than the approved model.
- Product-table RLS policies are currently specified as targeted to `iw_api`. Under `authenticated`, those policies would not apply; the implementation would need a duplicate policy set, or broad policies, increasing the chance of policy drift and accidental exposure.
- `iw_api` would need membership in `authenticated` in order to switch to it. That is not `BYPASSRLS`, but it is an unnecessary role-escalation capability and complicates the least-privilege claim.
- Supabase's `authenticated` role is also used by Supabase client/PostgREST pathways. Broadening its grants could expose product tables through a second database access path, contrary to the architecture's statement that the browser calls Fastify for all product data.
- If `SET LOCAL ROLE` is executed outside a transaction, or if a transaction boundary is mismanaged, the role can fail to apply or the connection can return to the pool in an unexpected role state. Transaction pooling is explicitly prohibited, but the risk remains.
- If authentication or role switching fails, there is a temptation to fall back to a service-role connection, which `AGENTS.md` §7 forbids.

**Functional risks**

- Queries may fail closed because `authenticated` has no grants, or behave differently from the specified `iw_api` policies.
- `auth.uid()` still needs the transaction-local JWT claim; switching role does not itself establish identity.
- Every policy, grant and integration test would need to be maintained twice or re-targeted, increasing implementation and regression risk.
- The API's database identity would no longer match the role named in the architecture and in the repository's documented RLS model.

### Interpretation B — stay as `iw_api`, set only transaction-local GUCs

This follows `docs/planning/ARCHITECTURE.md` §5.2: Fastify connects as `iw_api`; each transaction sets transaction-local JWT and mode values; RLS policies are targeted to `iw_api` and use `auth.uid()`.

**Security risks**

- The connection must genuinely authenticate as `iw_api`. If `DATABASE_URL_IW_API` accidentally points at the migration owner, `postgres`, `service_role` or any role with `BYPASSRLS`, setting GUCs would not enforce the intended boundary. Startup assertions and integration tests must verify the real login role.
- The GUCs must be set in the same transaction as the queries. `SET` outside a transaction, or `SET LOCAL` after a transaction ends, can lose the claim or affect the wrong scope.
- `auth.uid()` must be callable by `iw_api` and must read the exact claim format used by the staging Supabase project.
- Direct connection or a verified session pooler is required. A transaction pooler can lose or cross-contaminate transaction-local state and is disallowed by `docs/planning/ARCHITECTURE.md` §5.2.
- RLS policies must default-deny when the subject or mode is missing; tests must prove that an absent GUC cannot read or write product rows.
- Table grants remain essential. The role must not be able to bypass RLS, and `authenticated`, `anon` and `PUBLIC` must have no product-table grants.

**Functional risks**

- The API transaction wrapper must set the GUCs before every query and must not run queries after commit/rollback.
- Machine-ingestion and lifecycle-sweeper contexts need their own explicit mode values and scope checks.
- Connection pooling must be tested for leakage; a session-pooler connection reused by another request must not retain the previous JWT subject.
- If the transaction wrapper or connection setup is wrong, requests fail closed with authorization errors rather than silently returning data.

## 4. Recommendation

**Recommended option: B — stay as `iw_api` and set only transaction-local GUCs.**

This is consistent with the approved architecture, least-privilege requirements and existing RLS design. The recommended execution model is:

1. Fastify connects with the restricted `iw_api` login role, directly or through a verified session pooler. No `service_role`, migration owner or superuser connection is used at runtime.
2. Each provider request begins a transaction.
3. Within that transaction, set transaction-local values using parameterized `set_config(..., true)` or equivalent `SET LOCAL` calls:
   - `request.jwt.claim.sub` = the verified Supabase JWT `sub`, never a client-supplied owner ID.
   - `iw.request_mode` = `provider` for provider requests.
4. Execute all queries for the request in that transaction. RLS policies target `iw_api` and evaluate `auth.uid()` from the verified claim.
5. Machine-ingestion transactions set `iw.request_mode=machine_ingest` plus the approved source-key/incident/host scope GUCs only after credential and signature validation.
6. Lifecycle/system transactions use the narrowest approved `iw.request_mode` context and the same transaction-local identity discipline.
7. Commit or roll back; never run queries after the transaction closes.
8. Do not execute `SET ROLE authenticated`, and do not use `SET ROLE` as a fallback. If the chosen hosting connection cannot connect as `iw_api` directly or preserve transaction-local GUCs, stop and amend this ADR rather than weakening the role model.

The `docs/DEPLOYMENT.md` wording should be corrected on acceptance to remove the ambiguous `SET LOCAL ROLE` instruction and state that:

- The API connects as `iw_api`.
- JWT subject and request mode are set transaction-locally.
- `SET ROLE authenticated` is prohibited.
- Direct connection or a verified session pooler is required.
- Transaction pooling and service-role bypass are prohibited.

This is a documentation clarification, not a new architecture decision. If the operator instead chooses A, the architecture document and the entire RLS/grant model would need a separately approved change.

The operator accepted this recommendation on 2026-10-31. Option B is the accepted decision.

## 5. Integration tests Phase 2 must run

These tests must run against a **real Supabase staging database** with real login roles provisioned. The test run must use a real `iw_api` role with `NOBYPASSRLS`; using a service-role connection, migration owner or test-only superuser would not prove the mechanism. Production must not be used.

| ID | Test | Required assertion |
|---|---|---|
| ADR-001-T01 | Real login-role attributes | Connecting as `iw_api` yields `current_user = iw_api`; `rolsuper = false`, `rolbypassrls = false`, `rolcanlogin = true`. The same check for `iw_worker` passes with only its intended grants. |
| ADR-001-T02 | Grant matrix, not just RLS | For every product table, `has_table_privilege` shows only the exact route-required `iw_api` privileges. `authenticated`, `anon` and `PUBLIC` have no product-table grants. `iw_api` has no general `DELETE`. `evidence_events` and `evidence_bundles` reject `UPDATE`/`DELETE`. |
| ADR-001-T03 | Transaction-local JWT identity | In one `iw_api` transaction, `set_config('request.jwt.claim.sub', userA, true)` and `set_config('iw.request_mode','provider',true)` make `auth.uid()` return `userA`; owner-A rows are visible and owner-B rows are not. |
| ADR-001-T04 | Claim isolation and pool reuse | After commit, a fresh transaction on the same pooled connection has no `request.jwt.claim.sub`, `auth.uid()` returns null, and product queries return zero rows. The test must also acquire and release a session-pooler connection to prove no prior identity leaks. |
| ADR-001-T05 | Rollback and error isolation | A transaction that sets a subject and fails/rolls back leaves no identity or partial write behind. A subsequent transaction with no context is denied or sees zero rows. |
| ADR-001-T06 | Cross-owner IDOR at the DB layer | User A cannot select or update User B's `hosts`, `incidents`, `evidence_events` or `evidence_bundles`. Updates return zero rows and API tests return 404 without disclosure. |
| ADR-001-T07 | RLS policy targeting and default deny | `pg_policies` shows provider and machine policies targeted to `iw_api`, not `authenticated`/`anon`/`PUBLIC`. Missing `iw.request_mode` or missing JWT subject denies access. |
| ADR-001-T08 | Machine-ingestion context | `iw_api` with `iw.request_mode=machine_ingest`, the credential hash and source/incident/host scope can read only the required credential/key/incident fields and insert only a valid scoped event. Wrong scope, wrong source type and wrong mode fail. No profile, bundle or probe-job access is possible. |
| ADR-001-T09 | Worker-role boundary | `iw_worker` can select/lease/update only the approved probe-job fields, read the platform probe key certificate and insert platform-probe events. It cannot read `source_credentials`, `profiles`, provider account data or `evidence_bundles`. |
| ADR-001-T10 | No role escalation or bypass | `SET LOCAL ROLE authenticated` as `iw_api` fails; attempts to disable row security, alter roles, create tables, change ownership or use `BYPASSRLS` fail. No runtime role has superuser or `BYPASSRLS`. |
| ADR-001-T11 | Direct versus session-pooler behaviour | With the approved direct connection and approved session pooler, transaction-local GUCs are visible only inside the transaction and `current_user` is `iw_api` for every query. A transaction-pooler configuration must be rejected or must fail this test; it must never be used silently. |
| ADR-001-T12 | `auth.uid()` compatibility | Against the actual staging Supabase project, `auth.uid()` reads the staged claim format correctly, is executable by `iw_api`, and returns the same subject as the verified JWT. Test both the normal subject claim and any documented full-claims fallback. |
| ADR-001-T13 | Immutable evidence and audit | `iw_api` cannot update/delete `evidence_events`, `evidence_bundles` or `audit_events`. Event append, bundle insert and audit append succeed only through the approved transaction context. |
| ADR-001-T14 | Transaction failure/connection loss | A failure during event insertion or sealing rolls back completely; no success response is returned; retry is idempotent; no partial sealed bundle is persisted. This directly covers the `docs/planning/PROJECT_SPEC.md` §14 DB failure row. |

The Phase 2 checkpoint must report the exact test command(s), actual pass/fail results, staging service category (test-only), and the verified `iw_api`/`iw_worker` roles. Local tests may supplement, but they do not replace the real staging-role test.

## 6. Files that must change when this ADR is accepted

If the operator accepts recommendation B:

- **New file, only after approval:** `docs/adr/ADR-001-database-transaction-identity.md` (or the operator-approved ADR path).
- **`docs/DEPLOYMENT.md`:** replace the ambiguous "Database connection" wording with explicit `iw_api` login, transaction-local JWT/mode GUCs, no `SET ROLE authenticated`, direct/session-pooler requirement and transaction-pooler prohibition.
- **`docs/planning/AI_HANDOFF.md`:** record ADR-001 approval, the selected connection mechanism, and the Phase 2 test gate.
- **`docs/CONFIGURATION.md`:** only if connection-string or role notes need consistency with the clarified mechanism.
- **No application code, migrations, roles or RLS policies are changed as part of accepting this ADR.** Those belong to Phase 2 implementation after approval.
- **`docs/planning/ARCHITECTURE.md`:** no change under B. Under A, §§5.1–5.3 would require an architecture change, new/expanded grants and duplicate or re-targeted policies; that would require separate operator approval and would not be the recommended path.

## 7. Open questions for the operator

1. Is a **direct PostgreSQL connection** or a **Supabase session pooler** approved for `DATABASE_URL_IW_API` in Phase 2? Recommendation: start with a direct connection, or use a session pooler only after proving transaction-local GUC behaviour; never use transaction pooling.
2. Which **staging Supabase project** and test-only credentials will be used? No production credentials or production data may be used for these tests.
3. Who provisions and owns `iw_api`, `iw_worker` and the migration owner role, and what is the exact role-membership policy? `iw_api` should connect directly, not require a per-request `SET ROLE`.
4. What is the exact definition/version of `auth.uid()` in the staging Supabase project, and does it read `request.jwt.claim.sub`, `request.jwt.claims`, or both? This must be verified, not assumed.
5. Which Drizzle/`pg` transaction wrapper will set the transaction-local GUCs, and how will it guarantee that every query uses the same transaction and connection?
6. What is the approved session-pooler mode and connection limit? How will the implementation detect and reject transaction pooling if the connection string is misconfigured?
7. Which staging test users and disposable fixtures will represent owner A, owner B, host keys, renter keys, platform probe events and worker leases?
8. Will Supabase PostgREST/direct product-table access remain disabled for `anon`/`authenticated`, and what test proves that no second data path exists?
9. Are the proposed `machine_ingest` and `system_lifecycle` transaction contexts sufficient for the API lifecycle sweeper and worker, or does the operator want separate review of those grants?
10. Does the operator approve this recommendation B, or require a revised ADR examining A before any documentation is written?

## 8. Approval gate

> **This ADR is accepted. Operator approval was recorded on 2026-10-31. No Phase 2 implementation code, migration, DB role or RLS policy has been created by this documentation change.**

Accepted decision: **Option B** — connect as `iw_api`, set only transaction-local JWT/mode GUCs, keep RLS targeted to `iw_api`, forbid `SET ROLE authenticated`, use only direct or verified session-pooler connections, and prove the mechanism with the integration tests above.
