# UI Design Decisions and Operator Approval Record

**Status:** Phase 6 in progress. Design direction candidates are proposed below; operator selection is pending. No final visual design is approved or implemented.

## Phase 6 scope and stop condition

Phase 6 is limited to reference collection, structural mockups and operator review. No final CSS, Tailwind styling or UI implementation may be written until the operator explicitly approves the complete mockup direction. The existing temporary styling in `apps/web` must remain unchanged during this phase.

## Approval state

- Design references: CANDIDATES PROPOSED; SELECTION PENDING.
- Mockups: NOT CREATED (blocked on reference selection).
- Desktop review: NOT COMPLETED.
- Mobile review: NOT COMPLETED.
- Operator feedback: AWAITING DESIGN DIRECTION.
- Final visual implementation: NOT AUTHORIZED.

## Candidate design directions (pending operator selection)

These are candidate references for discussion, not approved references. The operator must select one direction, supply their own reference, or request a documented hybrid.

### Candidate A — Technical / data-dense

- **Candidate reference products:** Datadog dashboards and Vercel deployment/observability views. These are examples of the visual language, not integration or endorsement claims.
- **Character:** dark-first surfaces, high information density, monospace accents for identifiers, timestamps and digests, restrained accent colour, compact status pills, tables and a timeline-led layout.
- **Attributes to borrow:** operational hierarchy, dense evidence tables, consistent status vocabulary, monospace technical metadata, fast scanning of source health.
- **Product-specific deviations required:** `UNKNOWN` and `INSUFFICIENT` must never read as healthy; absence of evidence must be represented as an explicit gap, not a green status; evidence limitations stay visible; contrast, focus visibility and touch targets still meet accessibility requirements; no decorative charts or fabricated telemetry.
- **Likely fit:** provider operators who inspect evidence frequently and prefer density over whitespace.

### Candidate B — Clean / modern SaaS

- **Candidate reference products:** Linear and Stripe Dashboard. These are examples of the visual language, not integration or endorsement claims.
- **Character:** light-first surfaces, crisp sans-serif typography, generous whitespace, soft elevation, restrained colour, strong form and navigation hierarchy.
- **Attributes to borrow:** calm hierarchy, clear navigation, high-quality form/validation treatment, progressive disclosure and readable public-facing pages.
- **Product-specific deviations required:** the evidence timeline must remain denser and more technical than a typical marketing SaaS layout; verification states require explicit `PASS`/`FAIL`/`SKIP` text; technical metadata must not be hidden behind excessive whitespace; the assessment must not be reduced to a single decorative score.
- **Likely fit:** first-time providers and public trust pages, with a more technical treatment inside incident detail.

### Candidate C — Operator-supplied direction

- **Reference input:** operator-supplied URLs, screenshots, images, products or written direction.
- **Required before mockups:** the attributes to borrow (layout, density, hierarchy, colour, typography, motion, table/timeline interaction) and any styles or patterns to avoid.
- **Rule:** do not copy a reference wholesale; record intentional deviations and keep Incident Witness product-specific.

**Hybrid option:** the operator may request a hybrid (for example, Direction B for public pages and Direction A for authenticated evidence screens). A hybrid must be recorded explicitly with the attributes taken from each direction; it is not approved until the complete direction is approved.

## Reference evaluation criteria

The selected direction must support:

- Clear separation of provider, renter-client and platform-operated probe sources.
- Readable signed-event timelines without horizontal-only scrolling on mobile.
- Explicit text labels for host, session, source and verification states; colour is secondary.
- Prominent evidence limitations and simulation labelling.
- Distinguishable `PASS`, `FAIL`, `SKIP`, `UNKNOWN`, unavailable and stale states.
- Keyboard operation, visible focus, meaningful contrast and reduced-motion support.
- Feasible implementation with the approved Next.js 16 and Tailwind CSS 4 stack.

## Questions for the operator

1. Which direction should Phase 6 mockups follow: A, B, C, or a named hybrid?
2. If C, please provide the URLs, screenshots, images, products or written direction, and say what specifically you want borrowed.
3. Should the product be dark-first, light-first, or support both light and dark themes?
4. Are there brand constraints (name/logo treatment, colours, typography, tone) or styles to avoid?
5. Are the proposed mockup screens and states listed in the mockup register sufficient, or should any screen be added before design work begins?

## Reference register

| ID | URL/file | Supplied/selected by | Attributes to study | Prohibited copying / product-specific adaptation |
|---|---|---|---|---|
| REF-01 | TBD | TBD | TBD | TBD |

## Mockup register

| Screen/state | Desktop mockup | Mobile mockup | Revision | Operator feedback/status |
|---|---|---|---|---|
| Homepage | TBD | TBD | 0 | Pending |
| Dashboard | TBD | TBD | 0 | Pending |
| Host setup/enrollment | TBD | TBD | 0 | Pending |
| Evidence session timeline | TBD | TBD | 0 | Pending |
| Sealed bundle assessment | TBD | TBD | 0 | Pending |
| Verifier valid/tampered/unknown key | TBD | TBD | 0 | Pending |
| Empty/loading/error/permission states | TBD | TBD | 0 | Pending |

## Design decisions to record

- Information hierarchy and evidence/source labeling.
- Color semantics for online/offline/unknown/simulated/verified/untrusted.
- Typography and readable technical data density.
- Navigation, tables/cards and timeline interaction.
- Forms and confirmation/dialog behaviour.
- Mobile layout rules.
- Focus, contrast, status announcements and reduced motion.
- Footer, Docs, GitHub and support/contact destinations.
- Intentional deviations from references and reasons.

## Explicit approval record

- Mockup version presented: TBD.
- Operator approval message/date: NOT GRANTED.
- Approved reference IDs/assets: NONE.
- Conditions/comments: TBD.

**Hard stop:** no final UI styling/code until the operator explicitly approves the mockup version above. Update `AI_HANDOFF.md` with the approval state. Approval of a prototype is not approval to change business rules or architecture.
