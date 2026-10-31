# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 1 skeletal frontend implemented; Phase 2 not started.

**Current phase:** Phase 1 — COMPLETE (pending operator acceptance).

**Next task:** Phase 2 only, awaiting explicit operator authorization.

## Project

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed observations from a provider's Linux host, a renter-side client and a separately operated platform probe; correlates a bounded timeline; and seals a portable JSON evidence bundle for local signature/integrity verification.

It does not prove sensor truth or physical root cause, decide whether downtime should be excused, alter marketplace reliability scores or integrate with a marketplace in MVP.

## Source-of-truth files

- `PROJECT_SPEC.md` — product, MVP, flows, behaviour, acceptance criteria and UI routes.
- `ARCHITECTURE.md` — stack, trust boundaries, schema, API, cryptography, security and integrations.
- `IMPLEMENTATION_PLAN.md` — phase order, task boundaries and acceptance gates.
- `AGENTS.md` — mandatory coding-agent instructions.
- `README.md` — repository introduction and operating instructions.
- `docs/` — research, protocol, operational, user and security docs.

## Current architecture

- Node.js 26.13.0 LTS baseline; use later supported 26.x security patches when available, TypeScript strict, npm workspaces.
- Next.js 16.4.3 App Router + Tailwind CSS 4.x frontend; Next 16 `proxy.ts` placeholder is present.
- Fastify 5 API — **not implemented**.
- Supabase Postgres/Auth; Drizzle + `pg`; RLS and restricted DB roles — **not implemented**.
- `jose` JWT verification — **not implemented**.
- RFC 8785 JCS via pinned `canonicalize@5.1.0` + SHA-256 + Ed25519 protocol — **not implemented**.
- Linux x86_64 host agent with SQLite spool — **not implemented**.
- Incident-scoped TypeScript renter SDK — **not implemented**.
- Render background probe worker — **not implemented**.
- Vercel Preview/Production for frontend; Render API/worker — Vercel project exists; Render not configured.
- Vitest, Playwright and pgTAP — Playwright smoke tests exist; Vitest/pgTAP tests not created.

No AI, payment, blockchain, Arweave, marketplace, public bundle directory, Redis, Kubernetes or object-storage requirement in MVP.

## Repository state

- **Repository URL:** confirmed public — https://github.com/onyebuchidaniel60/incident-witness
- **Working directory/repo root:** `/root/incident-witness`
- **Branch:** `main`
- **Latest implementation commit:** `27651555794a867c1d98c28b93fb0d2837c58280` — `feat(web): add route-complete Phase 1 skeletal shell`
- **Checkpoint commit:** a docs-only follow-up commit containing this handoff update follows the implementation commit.
- **Existing application code:** `apps/web` Phase 1 structural frontend only.
- **Existing deployment project:** Vercel project `incident-witness`, ID `prj_YOmSDUci8FSEsqW16mw0X1MldfJ7`, team `uhhh2`.
- **Node runtime:** confirmed `v26.13.0`; npm `11.20.0`; `.node-version` pins `26.13.0`.

## Preview / deployment checkpoint

- **Preview URL:** https://incident-witness-yru7b9b75-uhhh2.vercel.app
- **Preview deployment ID:** `dpl_FDFnDhhX5jvWHyrNbdQyaLASRpHx`
- **Deployed source commit:** `27651555794a867c1d98c28b93fb0d2837c58280`
- **Deployment target:** Preview (`target: preview`, state `READY`)
- **Git metadata:** Vercel CLI local deployment did not attach Git metadata; `vercel inspect --json` reports no `meta`/`gitSource`. The working tree was clean at commit `2765155` when the Preview was built.
- **Preview protection:** currently **NOT PROTECTED**. Vercel SSO protection was temporarily disabled to run deployed browser checks, and re-enabling failed after the Vercel CLI login became invalid (`forbidden` / `login_required`). This is a no-data, no-secret static shell, but the operator must re-authenticate and restore SSO protection.
- **Production deployment:** Vercel auto-promoted the project's first deployment to Production at https://incident-witness.vercel.app because it was the first deployment. No production secrets, production database or real data were used, and no production release was approved. The operator should decide whether to remove/rename or otherwise clean up that auto-promotion.
- **Production URL approval:** NOT APPROVED as a release; do not treat it as a production launch.
- **Safe staging config:** CONFIRMED for content — explicit no-auth placeholder mode; no Supabase, API, database, analytics, production data or real credentials are connected. SSO protection restoration remains outstanding.

## Completed in Phase 1

- Root npm workspace baseline with private root package, lockfile, Node pin, `.gitignore`, strict shared `tsconfig.base.json`, Prettier and ESLint configuration.
- `apps/web` Next.js 16.4.3 App Router application with TypeScript strict and Tailwind CSS 4.x temporary styling.
- All required routes:
  - Public: `/`, `/login`, `/verify`, `/docs`, `/privacy`, `/terms`
  - Protected placeholders: `/dashboard`, `/hosts`, `/hosts/new`, `/hosts/[hostId]`, `/incidents`, `/incidents/new`, `/incidents/[incidentId]`, `/settings`
  - `not-found.tsx`, `error.tsx`, `loading.tsx`
- Public header with keyboard-accessible mobile menu, dashboard sidebar navigation, responsive layouts and footer.
- Footer links to real `/docs` route and the confirmed public GitHub repository.
- `proxy.ts` Phase 1 pass-through placeholder with explicit comment that no authentication or access control exists.
- `.env.local.example` with placeholder comments only; `.env.example` unchanged because Phase 1 needs no new variables.
- CI workflow running `npm ci`, lint, typecheck and build on push/PR.
- Playwright smoke suite covering every route, not-found handling, navigation, footer links, protected-area labelling, overflow and console errors at desktop and mobile viewports.
- `README.md` Phase 1 status and verified commands.
- Vercel project created and Preview deployed.

## Visible behaviour vs placeholders

**Functional:**

- Static page rendering and client-side navigation.
- Public and dashboard placeholder route structure.
- Responsive header, mobile menu, sidebar, footer, skip link and focus styles.
- 404/not-found handling and route error retry control.
- `/docs` is a real reachable documentation index with repository links.
- Footer Documentation and GitHub links.

**Placeholder only:**

- No login form or authentication; `/login` explicitly states no sign-in exists.
- No file input or verification; `/verify` explicitly states the verifier is not connected.
- No provider data. Dashboard, hosts, incidents and settings pages clearly state that no API, database, auth or session is connected.
- No hosts, incidents, evidence timeline, assessments, bundles or signature verification.
- No Phase 2+ backend, database, auth, agent, SDK, protocol, worker or CLI verifier.

## Tests and evidence

Run on 2026-10-31 with Node `v26.13.0` and npm `11.20.0`:

- `npm ci` — **PASS** (364 packages installed; `npm audit --omit=dev` reports 0 production vulnerabilities).
- `npm run lint` — **PASS**.
- `npm run typecheck` — **PASS**.
- `npm run build` — **PASS** (Next.js 16.4.3; all 14 route entries plus proxy built).
- `npm run test:e2e` — **PASS**: 36 Playwright tests passed across desktop Chromium and mobile Pixel 7 profiles.
- Deployed Preview route check — **PASS**: 34 browser checks across 14 routes plus the not-found route at desktop and mobile viewport; navigation, footer links, overflow, console-error and page-error checks passed.
- Client bundle scan — **PASS**: no `DATABASE_URL`, platform private-key, token-pepper, service-role or private-key markers found in local or deployed client assets/routes.
- `npm audit` — full development tree reports 16 moderate `minimatch` advisories; no non-breaking fix is available (`npm audit fix --force` would downgrade/break ESLint). Production dependency audit reports 0 vulnerabilities.

No tests are claimed beyond those run above. Vitest, pgTAP and API/security integration tests do not exist yet.

## Design reference and approval status

- **Final visual design:** NOT STARTED.
- **Design references:** NOT COLLECTED/APPROVED.
- **Mockups:** NOT CREATED.
- **Operator approval:** NOT GRANTED.
- Phase 1 uses temporary, generic Tailwind styling only. Do not treat it as an approved visual direction. Reference collection and desktop/mobile mockups remain Phase 6 work after the functionality gate.

## Documentation/footer status

- Root documentation and `docs/` remain the source of truth.
- `/docs` route exists and is reachable on the Preview.
- Footer contains the real Documentation link and the approved public GitHub repository link.
- `/privacy` and `/terms` are clearly labelled placeholders; no legal copy is approved.
- No support/contact address is published because none has been supplied.

## Known risks and operator actions

1. **ADR-001 prerequisite for Phase 2:** resolve `docs/DEPLOYMENT.md` wording about `SET LOCAL ROLE` versus `ARCHITECTURE.md` §5.2, which specifies `iw_api` transactions and explicitly forbids `SET ROLE authenticated`. Do not implement Phase 2 DB identity until the role/GUC approach is decided and tested.
2. **Vercel CLI auth expired:** `vercel whoami`, `vercel projects ls` and protection-enable commands now fail with `login_required`/`forbidden`. Do not attempt interactive login without operator direction. Re-authenticate through the operator's approved method.
3. **Preview SSO protection is off:** re-enable it after re-authentication. The current Preview and auto-promoted Production deployment are static with no data or secrets, but they are publicly reachable.
4. **First deployment auto-promoted to Production:** Vercel assigned the first deployment to Production despite the default command. No production release was approved; operator should decide how to handle the production alias.
5. **No Vercel-attested Git SHA:** local CLI deployment metadata lacks a Git commit. Source commit `2765155` is known from the clean tree at build time, but `vercel inspect` cannot independently attest it. Future deployments should use Git-connected deployment metadata.
6. **Development dependency advisories:** 16 moderate `minimatch` advisories in the ESLint toolchain; production dependency audit is clean. Revisit when upstream packages publish compatible fixes; do not use a forced breaking downgrade.
7. **No Phase 2+ functionality:** no API, database, auth, agent, SDK, probe worker, protocol package or working verifier exists. Do not describe those as implemented.

## Things not to change

- Product name and MVP boundaries without operator approval.
- Platform-probe trust label.
- Deterministic assessment and `UNKNOWN` behaviour.
- Ed25519 + JCS signed record model; browser verifier is a browser-safe public-key-only implementation.
- Session and token limits/states.
- Host/renter/platform source authorization model.
- Selected stack or RLS approach.
- Phase sequencing and final UI approval gate.

## Exact next task

**Phase 2 only, awaiting explicit operator authorization.** Resolve ADR-001 first, then implement the backend/data/auth foundation as specified in `IMPLEMENTATION_PLAN.md` Phase 2. Do not start Phase 2 from this checkpoint.
