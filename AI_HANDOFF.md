# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-31

**Project status:** Phase 1 skeletal frontend complete and closed; Phase 2 not started.

**Current phase:** Phase 1 — COMPLETE, CLOSED.

**Next task:** ADR-001 draft only, awaiting operator authorization.

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
- **Current Git HEAD / origin/main:** `c0eb9e30c53129a200f1a350ec927792684696ca` — `chore: trigger normal vercel deploy`
- **Git sync:** `main` and `origin/main` were verified in sync at `c0eb9e30c53129a200f1a350ec927792684696ca` before this closeout commit. This docs-only closeout commit is intentionally not pushed.
- **Existing application code:** `apps/web` Phase 1 structural frontend only.
- **Existing deployment project:** Vercel project `incident-witness`, ID `prj_YOmSDUci8FSEsqW16mw0X1MldfJ7`, team `uhhh2`.
- **Node runtime:** confirmed `v26.13.0`; npm `11.20.0`; `.node-version` pins `26.13.0`.

## Phase 1 deployment checkpoint

- **Deployed URL (Git-attested deployment):** https://incident-witness-dxl1vuu1x-uhhh2.vercel.app
- **Stable aliases:** https://incident-witness.vercel.app and https://incident-witness-git-main-uhhh2.vercel.app
- **Deployment ID:** `dpl_DbXXV1n29YDb7KLZttZiiYnqzhWk`
- **Deployed SHA:** `c0eb9e30c53129a200f1a350ec927792684696ca`
- **Deployment branch/message:** `main` — `chore: trigger normal vercel deploy`
- **Deployment status:** `READY`; HTTP 200 verified; target `production`
- **Git attestation:** Confirmed from Vercel deployment metadata (`githubCommitSha`, `githubCommitRef`, `githubCommitOrg`, `githubCommitRepo`); the SHA matches `origin/main`.
- **Vercel protection:** **DISABLED** — `ssoProtection` is `null`; no protection-bypass secret remains (`bypassCount: 0`).
- **Production deployment:** Operator explicitly authorized the `main` branch to deploy to Production for this static shell. The Git-attested Production deployment is the one recorded above.
- **Safe production/staging content:** CONFIRMED — explicit no-auth placeholder mode; no Supabase, API, database, analytics, production data or real credentials are connected. `.env.example` and `apps/web/.env.local.example` contain placeholders only.
- **Design status:** UNCHANGED — no final visual design is approved; temporary styling only.

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
- Vercel project created; Git-attested Production deployment verified for the static shell.

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
- Earlier deployed Preview route check (source commit `2765155`) — **PASS**: 34 browser checks across 14 routes plus the not-found route at desktop and mobile viewport; navigation, footer links, overflow, console-error and page-error checks passed.
- Latest Git-attested Production deployment (`c0eb9e3`) — **READY**, HTTP 200; route checks were not rerun against this deployment.
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
2. **Vercel Authentication is disabled:** `ssoProtection` is `null`. The static shell has no data or secrets, but it is publicly reachable; enable Vercel Authentication if public access is not intended.
3. **Development dependency advisories:** 16 moderate `minimatch` advisories in the ESLint toolchain; production dependency audit is clean. Revisit when upstream packages publish compatible fixes; do not use a forced breaking downgrade.
4. **No Phase 2+ functionality:** no API, database, auth, agent, SDK, probe worker, protocol package or working verifier exists. Do not describe those as implemented.
5. **Closeout commit is unpushed:** the docs-only Phase 1 closeout commit follows the verified `c0eb9e3` sync point and was intentionally not pushed.

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

**ADR-001 draft only, awaiting operator authorization.** Do not draft it yet, and do not start Phase 2.
