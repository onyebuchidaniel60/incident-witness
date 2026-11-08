# Source Traceability

This blueprint was prepared from two user-provided source documents and the operator's explicit selection of Incident Witness.

## Product/idea research source

**Document:** `Pasted text(20261030-202757).txt` — “Decentralize AI Hackathon — Ideation and Concept Validation”, research initiated 30 October 2026.

The supplied workflow source is also packaged verbatim at `docs/PROPER_VIBE_CODING_WORKFLOW_REFERENCE.md` so a coding agent can consult it alongside the project-specific instructions.

Carried into the blueprint:

- A GPU host can disappear during an active rental and marketplace-level disconnect evidence may not explain why.
- Provider, renter and external reachability observations can contribute distinct evidence.
- Chronological correlation, evidence-quality labels and verifiable portable records are the proposed mechanism.
- A signature preserves bytes/provenance from a key but does not make the underlying sensor truthful.
- Adjacent tools/products already exist; the intended contribution is their coordinated multi-source workflow, not the individual sensors/algorithms.
- Market demand, willingness to pay, marketplace acceptance, full novelty search and user interviews were unverified in the research snapshot.
- The original research cautioned against advancing before validation. The operator later explicitly selected Incident Witness; this blueprint honours that choice while preserving the research caveats.

## Workflow methodology source

**Document:** `PROPER_VIBE_CODING_WORKFLOW_REVISED(3).md` — “Proper Vibe Coding Workflow”.

Carried into the blueprint:

- Problem and scope before code; specification and architecture before implementation.
- Read-only repo inspection before change.
- Early skeletal frontend and stable Preview URL.
- Small independently testable tasks and one phase at a time.
- Evidence from tests over an agent's “it works” assertion.
- Git commits/checkpoints and `AGENTS.md` / `docs/planning/AI_HANDOFF.md` continuity.
- Core functionality and end-to-end verification before final visual design.
- Reference-led mockups and explicit operator approval before final UI implementation.
- Complete frontend shell, responsive/accessibility states, docs and real home-footer Documentation/GitHub links where appropriate.
- No invented URLs, dead links or public disclosure of private repository without approval.

## Additional verification and engineering judgement

Technology selections, API security details, database role patterns, SSRF controls, token limits and evidence protocol refinements are design decisions derived from the product requirements and engineering reasoning. They are labelled as decisions/assumptions where not already proven by the original idea research. Re-check official vendor docs and current service limits when provisioning the actual project. No external integration is represented as implemented or tested by this blueprint.

## Current technology-version checks (30 October 2026)

- Node.js 26.13.0 was released as LTS on 28 October 2026; it is the selected baseline as of 30 October 2026. Its release notes warn that Linux binaries are linked against `libatomic`, which may need to be installed on some distributions.
- Next.js 16 is Active LTS; the latest stable patch observed during blueprint preparation is 16.4.3. Next.js 16 uses `proxy.ts` for the proxy/session-refresh convention.
- Fastify 5's published support schedule includes Node.js 26; the latest stable 5.x patch observed was 5.12.7.
- Supabase JS latest stable observed was 2.118.0; `@supabase/ssr` 0.12.7 is still documented as beta and must be isolated behind an adapter.
- Supabase-managed Postgres should use the currently offered supported major (17.x in the platform documentation reviewed), not automatically assume upstream PostgreSQL 18 availability.
- Supabase's current SSR documentation recommends `@supabase/ssr` but labels the package beta. The blueprint therefore isolates it behind an adapter and requires pinned-version tests.

RFC 8785 is the normative canonicalization specification; its Appendix G lists the JavaScript `canonicalize` implementation. The selected package is `canonicalize@5.1.0` as observed on 30 October 2026. Sources: https://www.rfc-editor.org/rfc/rfc8785.html ; https://www.npmjs.com/package/canonicalize .

Sources checked: https://nodejs.org/en/blog/release/v26.13.0 ; https://nodejs.org/en/about/previous-releases ; https://github.com/nodejs/Release/blob/main/README.md ; https://github.com/nodejs/nodejs.org/blob/main/apps/site/pages/en/blog/vulnerability/october-2026-security-releases.md ; https://nextjs.org/support-policy ; https://nextjs-changelog.vercel.app/ ; https://github.com/fastify/fastify/releases ; https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md ; https://github.com/supabase/supabase-js/releases ; https://www.npmjs.com/package/@supabase/ssr ; https://supabase.com/docs/guides/auth/server-side ; https://supabase.com/changelog?tags=database . Re-check at dependency installation and lock the exact versions actually installed.
