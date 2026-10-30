# Incident Witness

**When infrastructure fails, evidence speaks.**

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed observations from a GPU host, a renter-side workload client and a separately operated platform probe; correlates them into a time-ordered record; and seals a JSON evidence bundle that can be checked locally for integrity and signatures.

> **Important limitation:** a valid signature proves that data has not changed after it was signed by a particular key. It does not prove that a sensor was truthful, a host was uncompromised or an inferred cause is correct. Incident Witness reports evidence patterns and unknowns; it does not adjudicate a marketplace dispute or automatically excuse downtime.

## Project status

Blueprint complete. Application implementation has not started. The product requirements, architecture, security rules and phase plan are in the root documentation.

## Source-of-truth documentation

- [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) — product definition, MVP scope, roles, flows, business rules, acceptance criteria and UI structure.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack, database, API, cryptographic protocol, security, deployment and operations.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — one-phase-at-a-time implementation sequence and hard gates.
- [`AGENTS.md`](./AGENTS.md) — mandatory instructions for AI coding agents.
- [`AI_HANDOFF.md`](./AI_HANDOFF.md) — current phase, preview, tests, approval status and exact next task.
- [`docs/`](./docs/) — supporting research, setup, protocol, operational and user documentation.
- [`docs/SOURCE_TRACEABILITY.md`](./docs/SOURCE_TRACEABILITY.md) — maps decisions to supplied source material and engineering judgement.

## Planned MVP

A provider should be able to register a Linux host, prove control of a public HTTPS hostname, enroll a local host agent, create a bounded evidence session, invite a renter-side client, collect signed observations, seal a deterministic evidence bundle and verify that bundle offline. The first supported host target is Linux x86_64. A public HTTPS health endpoint is required; NAT-only hosts are not supported by this initial scope.

## Planned technology

Node.js 26.13.0 LTS (released 2026-10-28), TypeScript, npm workspaces, Next.js 16.4.x App Router (16.4.3 current stable checked 2026-10-30), Tailwind CSS 4.x, Fastify 5, Supabase Postgres/Auth, `@supabase/ssr` (beta; pinned behind an adapter), Drizzle, `pg`, `jose`, RFC 8785 canonical JSON, Ed25519, a SQLite host-agent spool, a renter TypeScript SDK, a Render probe worker, Vercel frontend deployment, Vitest, Playwright and pgTAP. See `ARCHITECTURE.md` for responsibilities and security constraints.

## Development status and commands

The repository implementation has not yet been initialized. Do not run the example commands below until Phase 0 has inspected the actual repository and Phase 1 has established the agreed package scripts.

Planned command interface:

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm.cmd` from Windows PowerShell where required. The exact workspace scripts must be created and documented during Phase 1; the coding agent must not claim these commands work before verifying them.

## Configuration

See [Environment and configuration](./docs/CONFIGURATION.md). Secrets belong in local ignored `.env` files or the approved hosting secret manager. `.env.example` must contain placeholders only. Never commit Supabase service-role/secret keys, database URLs, platform signing keys, host credentials, renter credentials, enrollment/invitation tokens or private keys.

## Verification model

The protocol uses RFC 8785 JSON Canonicalization Scheme via pinned `canonicalize@5.1.0`, SHA-256 and Ed25519. The shared protocol package has explicit Node and browser entry points: Node services/agents use built-in `node:crypto` for signing and verification; the browser verifier uses `@noble/ed25519` 3.2.x for public-key verification only. Shared RFC 8785 canonicalization test vectors and RFC 8032 Ed25519 golden vectors must prove cross-runtime parity. Web verification is local to the browser; bundle contents are not uploaded for checking. Trust is anchored to a versioned, pinned platform public-key set. A valid result establishes integrity and signatures relative to those keys—not the truth of underlying readings.

## Deployment lifecycle

The first implementation milestone is a navigable skeletal frontend deployed to a stable Preview URL. The Preview must use staging/test data only and be updated at each verified checkpoint. Core functionality must pass end-to-end before final visual design begins. Final design requires operator-approved references and mockups. Production deployment requires separate explicit operator authorization. See `IMPLEMENTATION_PLAN.md`.

## Contributions and AI coding agents

Read `AGENTS.md` before making changes. Implement one assigned phase/task only, test it, inspect the diff, commit, update `AI_HANDOFF.md`, report evidence and stop. Do not change architecture, product behaviour, business rules or security without operator approval.

## Research and validation status

The source research found a plausible infrastructure evidence gap and adjacent tooling, but user demand, marketplace acceptance, willingness to pay and full novelty are unresolved. The project is selected for implementation by the operator; that decision does not convert these open research questions into validated claims. Read [`docs/RESEARCH_AND_ASSUMPTIONS.md`](./docs/RESEARCH_AND_ASSUMPTIONS.md).
