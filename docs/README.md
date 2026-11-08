# Incident Witness — Documentation Index

The in-app `/docs` page (`apps/web/app/(public)/docs/page.tsx`) is the public documentation
destination. It summarizes the implemented protocol, host-agent installation, renter SDK
integration, bundle verification and limitations. These repository documents are the detailed source
of truth behind it.

## Product and user documentation

- [Provider user guide](./USER_GUIDE.md)
- [Host agent operator guide](./HOST_AGENT.md)
- [Renter SDK integration guide](./RENTER_SDK.md)
- [Platform probe worker guide](./PROBE_WORKER.md)
- [Protocol v1 design](./PROTOCOL.md)
- [API reference index](./API_REFERENCE.md)

## Developer/operator documentation

- [Environment and configuration](./CONFIGURATION.md)
- [Deployment guide](./DEPLOYMENT.md)
- [Operations runbook](./OPERATIONS.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Privacy and security model](./PRIVACY_SECURITY.md)
- [Design decisions and operator approval](./DESIGN_DECISIONS.md)
- [Research findings and assumptions](./RESEARCH_AND_ASSUMPTIONS.md)
- [Hackathon submission workstream](./HACKATHON_SUBMISSION.md)
- [Source traceability](./SOURCE_TRACEABILITY.md)

## Planning and architecture

- [Project specification](./planning/PROJECT_SPEC.md)
- [Architecture and technical contracts](./planning/ARCHITECTURE.md)
- [Implementation plan](./planning/IMPLEMENTATION_PLAN.md)
- [Blueprint index](./planning/BLUEPRINT.md)
- [Package manifest](./planning/PACKAGE_MANIFEST.md)
- [Package checksums](./planning/SHA256SUMS.txt)
- [AI handoff / current execution state](./planning/AI_HANDOFF.md)
- [Changelog](./CHANGELOG.md)

The root `AGENTS.md` remains at the repository root because the coding-agent harness requires it there. All other internal planning and source-of-truth documents live in this `docs/planning/` directory.

## Documentation maintenance rules

- Update these documents when API, business rules, protocol, installation or deployment behaviour changes.
- Keep the in-app `/docs` route consistent with `HOST_AGENT.md`, `RENTER_SDK.md` and `PROTOCOL.md`.
- Do not publish guessed commands, endpoint URLs, service credentials, repository links or company/legal details.
- Legal pages must state clearly that operator-approved legal review is pending; do not present placeholder text as a policy or contract.
- The website footer links to the actual public repository. Re-check the destination before any public release.
- Final documentation links must be checked on the deployed Preview and Production before release.

## Source methodology

- [Proper Vibe Coding Workflow reference](./PROPER_VIBE_CODING_WORKFLOW_REFERENCE.md) — the supplied methodology; the repository `AGENTS.md` and [`planning/IMPLEMENTATION_PLAN.md`](./planning/IMPLEMENTATION_PLAN.md) adapt it to Incident Witness.
