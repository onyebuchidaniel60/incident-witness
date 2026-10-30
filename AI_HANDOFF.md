# AI_HANDOFF.md — Incident Witness

**Last updated:** 2026-10-30  
**Project status:** Blueprint complete; implementation not started.  
**Current phase:** Phase 0 — read-only repository/platform inventory.  
**Next task:** Inspect the actual repository/workspace and report a read-only audit in the agent response; no files are to be modified.  

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
- Next.js 16.4.x App Router + Tailwind CSS 4.x frontend; Next 16 `proxy.ts` auth refresh convention.
- Fastify 5 API.
- Supabase Postgres/Auth; Drizzle + `pg`; RLS and restricted DB roles.
- `jose` JWT verification.
- RFC 8785 JCS via pinned `canonicalize@5.1.0` + SHA-256 + Ed25519 protocol; Node signing with `node:crypto`, browser-only public-key verification with `@noble/ed25519` 3.2.x and shared cross-runtime vectors.
- Linux x86_64 host agent with SQLite spool.
- Incident-scoped TypeScript renter SDK.
- Render background probe worker; fixed HTTPS health endpoint; Postgres leases.
- Vercel Preview/Production for frontend; Render API/worker.
- Vitest, Playwright and pgTAP.

No AI, payment, blockchain, Arweave, marketplace, public bundle directory, Redis, Kubernetes or object-storage requirement in MVP.

## Repository state

- **Repository URL:** not supplied/verified.
- **Working directory/repo root:** not yet inspected.
- **Branch:** not yet inspected.
- **Latest commit:** not yet inspected.
- **Existing code/database/CI:** not yet inspected.
- **Existing deploy projects:** not yet inspected.
- **Do not infer or create a replacement repository.** Phase 0 is read-only; report existing state before making changes.

## Preview / deployment checkpoint

- **Preview URL:** NOT DEPLOYED.
- **Preview provider/project:** not yet confirmed.
- **Latest deployed commit:** NONE.
- **Production URL:** NOT DEPLOYED.
- **Safe staging config:** NOT CONFIGURED/VERIFIED.
- **Visible frontend:** none verified in this project context.
- **Blocker:** repository, Vercel project and staging Supabase/Render resources have not been inspected or authorized.

The first frontend must be a navigable skeletal shell, deployed to Preview in Phase 1. The agent must report the exact URL and deployed SHA. Never invent a URL and never use production data/secrets in Preview.

## Completed

- Incident Witness selected by operator and name confirmed.
- Product specification and MVP boundary defined.
- Main flows, roles, state machines, data entities and acceptance criteria specified.
- Architecture, API surface, crypto protocol, security model and technology stack specified.
- Phased implementation plan includes early frontend deployment, functionality gate, reference/mockup phase, explicit approval gate, final UI, docs/footer completion and production release gate.

## Incomplete / not yet verified

- Repository state and compatibility audit.
- Actual Vercel/Supabase/Render project availability and credentials.
- Host public DNS/HTTPS health endpoint and real Linux test machine.
- Real GPU/NVIDIA and UPS/NUT availability.
- User demand, marketplace acceptance, willingness to pay and originality/novelty are not validated.
- Nosana access/credits/API execution are untested; not an MVP dependency.
- Actual public GitHub repository URL is unknown; no footer GitHub link may be invented or shown.
- Legal entity/contact details/approved Privacy and Terms copy are not supplied.

## Tests and evidence

- **Tests run:** NONE — no application exists in this handoff state.
- **Build/lint/typecheck:** NOT RUN.
- **E2E:** NOT RUN.
- **Security tests:** NOT RUN.
- **Deployed Preview tests:** NOT RUN.
- Do not describe planned tests as passed.

## Design reference and approval status

- **Final visual design:** NOT STARTED.
- **Design references:** NOT COLLECTED/APPROVED.
- **Mockups:** NOT CREATED.
- **Operator approval:** NOT GRANTED.
- Use only temporary skeletal UI before the end-to-end functionality gate. Later, collect references and show desktop/mobile mockups for explicit operator approval. No approval means no final design implementation.

## Documentation/footer status

- Blueprint root docs exist as handoff files.
- Repository `README.md` and operational docs are planned; this pack includes initial versions/templates.
- Website `/docs` must become a real, reachable Docs destination.
- GitHub footer link must wait until actual repository URL is verified public and operator approves sharing.
- No invented public URL or private repo disclosure.

## Known risks

1. Signatures do not prove sensor truth; host and renter sources can be compromised.
2. Platform probe is operated by the same platform and is not an independent organisation.
3. Market demand, marketplace evidence acceptance and willingness to pay are unvalidated.
4. External endpoint monitoring has SSRF/DNS-rebinding risk and requires fixed target policy and pinned validated connection.
5. Public hostname + HTTPS endpoint may be difficult for home GPU hosts behind NAT; NAT-only hosts are out of MVP.
6. Host agent requires Linux x86_64 and operator permissions to install; actual user installation willingness is untested.
7. Actual GPU/UPS data availability is conditional; missing signals must remain unavailable, not “normal.”
8. Hackathon Round 2 submission cutoff time/timezone and detailed requirements must be rechecked against current official rules.

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

**Phase 0 only: perform a read-only inventory of the operator's existing repository/workspace and deployment configuration. Do not modify files, install packages, run migrations, create projects, deploy, commit, print secrets or choose a new repository. Report the current structure, stack, entry points, database/auth/deployment status, reusable parts, conflicts with this blueprint, risks and the smallest safe implementation mapping in your agent response. Do not create `REPOSITORY_AUDIT.md` or any other file during Phase 0. STOP and report findings for operator review. After the operator reviews the report, wait for explicit authorization before writing an audit file or starting Phase 1.**
