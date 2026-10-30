# Incident Witness — Documentation Index

This is the source folder for the public `/docs` experience and developer/operator documentation. It is a blueprint at this stage; commands and links that depend on the released software must be added only after implementation is verified.

## Product and user documentation

- [Provider user guide](./USER_GUIDE.md)
- [Host agent operator guide](./HOST_AGENT.md)
- [Renter SDK integration guide](./RENTER_SDK.md)
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

## Documentation maintenance rules

- Update these documents when API, business rules, protocol, installation or deployment behaviour changes.
- Do not publish guessed commands, endpoint URLs, service credentials, repository links or company/legal details.
- The in-app `/docs` route must lead to a real reachable page.
- If the root repository is public and the operator approves disclosure, the website footer may link to the actual GitHub repo. If private or inappropriate, record the reason and ask before omission/alternative.
- Final documentation links must be checked on the deployed Preview and Production before release.

## Source methodology

- [Proper Vibe Coding Workflow reference](./PROPER_VIBE_CODING_WORKFLOW_REFERENCE.md) — the supplied methodology; the project-specific `AGENTS.md` and `IMPLEMENTATION_PLAN.md` adapt it to Incident Witness.
