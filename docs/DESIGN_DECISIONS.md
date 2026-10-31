# UI Design Decisions and Operator Approval Record

**Status:** Phase 6 mockups created and presented on 2026-10-31. The design direction is approved; the mockups themselves are **awaiting explicit operator approval**. No final visual implementation is authorized.

## Phase 6 scope and stop condition

Phase 6 covers reference collection, structural mockups and operator review only. No final CSS, Tailwind classes, component restyling or UI implementation may be written in `apps/web` until the operator explicitly approves the complete mockup direction. Phase 7 is not authorized.

## Operator-approved design direction

On 2026-10-31 the operator selected a named hybrid:

| Surface | Direction | Theme | Routes |
|---|---|---|---|
| Public-facing pages | **B — Clean / modern SaaS** | Light-first | `/`, `/login`, `/verify`, `/docs`, `/privacy`, `/terms` |
| Authenticated workspace | **A — Technical / data-dense** | Dark-first | `/dashboard`, `/hosts`, `/incidents`, `/settings` |

**Tone:** objective, technical, sober and precise. Avoid playful, cartoonish and overly futuristic or cyberpunk aesthetics.

**Typography:** clean sans-serif for interface text (Inter); monospace for hashes, UUIDs, timestamps, signatures, IPs, event types, sequence numbers and other technical metadata.

**Wordmark:** text-based `Incident Witness`, with a restrained accent bar. No complex illustration or logo symbol is required for the MVP.

**Theme toggle:** not designed in Phase 6. The approved defaults are light public pages and a dark workspace. A later toggle is permitted but requires a separate decision.

## Reference register

These are visual-language references named in the approved candidate directions. No screenshots, assets, code, logos or brand treatments were copied. Their inclusion is not an integration, partnership or endorsement claim.

| ID | Reference | Selected by | Attributes studied | Product-specific adaptation / not copied |
|---|---|---|---|---|
| REF-01 | Datadog dashboards | Operator-approved Direction A | Dense operational hierarchy, compact status language, source-health scanning | No metric charts, alert colour scheme, product copy or branding copied |
| REF-02 | Vercel deployment / observability views | Operator-approved Direction A | Dark restrained surfaces, compact navigation, monospace identifiers | No Vercel branding, layout or component assets copied |
| REF-03 | Linear | Operator-approved Direction B | Public typographic hierarchy, calm spacing, clear navigation and restrained accents | No marketing composition, illustrations or product copy copied |
| REF-04 | Stripe Dashboard | Operator-approved Direction B | Form clarity, result hierarchy, whitespace and validation treatment | No payment flows, product patterns or brand assets copied |
| REF-05 | Operator written direction, 2026-10-31 | Operator | Hybrid mapping, light/dark defaults, tone, colour semantics, typography and status rules | Direct product direction; no external asset |

## What was borrowed and what was changed

### Borrowed from Direction B for public pages

- Light surfaces, crisp typography and generous whitespace.
- A calm navigation hierarchy with a restrained blue trust accent.
- Strong form, file-selection and verification-result hierarchy.
- Soft elevation and clear separation between explanation and action.
- Public pages prioritise comprehension and trust over raw density.

### Borrowed from Direction A for the workspace

- Dark, near-black surfaces with compact persistent navigation.
- Dense tables, source tiles, timelines and source-health rails.
- Monospace metadata for IDs, timestamps, sequences, digests and signatures.
- Small, scannable status pills with text labels.
- Repeated operational use is prioritised over decorative whitespace.

### Intentional deviations from the references

1. **Evidence before marketing.** The public home page includes an explicit limitations panel and avoids claims of root cause, outage adjudication or automatic marketplace action.
2. **`UNKNOWN` is not a health state.** Unknown, unavailable, stale and insufficient-evidence states use neutral gray or amber treatments, never green.
3. **Assessment grades are informational.** Assessment outcomes use a blue or neutral treatment rather than health green, so a grade is not confused with operational health.
4. **Missing data is visible.** Host, GPU, UPS, renter and probe gaps are shown as explicit `UNAVAILABLE`, `STALE` or `GAP` states. They are never converted into a normal or healthy result.
5. **Platform probe label.** The probe is always described as platform-operated, not an independent third party.
6. **Timeline density.** The incident timeline keeps source label, observed time and event type visible at mobile widths; it stacks vertically rather than becoming a horizontal-only table.
7. **No decorative telemetry.** The mockups do not invent charts, probability scores or AI diagnosis panels.
8. **Text wordmark.** The logo is a text wordmark with a small accent bar, not an illustrated mark.

## Proposed mockup tokens

These are prototype tokens for review, not implemented application tokens.

### Public palette

| Token | Value | Use |
|---|---|---|
| Page background | `#F6F7F9` | Public page canvas |
| Surface | `#FFFFFF` | Cards, header, footer |
| Ink | `#101318` | Primary text |
| Muted | `#5D6573` | Secondary text |
| Border | `#E2E5EB` | Dividers and card borders |
| Accent | `#2457D6` | Primary actions, links, focus |
| Trust violet | `#5A4BCF` | Restrained secondary accent |
| Success | `#16794A` | Verified / complete |
| Warning | `#8D5D00` | Caution / on battery |
| Danger | `#C22A2A` | Failed / tampered |
| Unknown | `#596273` | Unknown / unavailable |

### Workspace palette

| Token | Value | Use |
|---|---|---|
| Page background | `#08090B` | Workspace canvas |
| Surface | `#0F1013` | Cards and panels |
| Surface 2 | `#14161A` | Nested tiles and table headers |
| Ink | `#F1F2F4` | Primary text |
| Muted | `#9BA0AB` | Secondary text |
| Border | `#24262C` | Dividers and card borders |
| Accent | `#8AA4FF` | Links, focus and selected state |
| Healthy / online | `#57D06B` | Text-labelled healthy status only |
| Warning / degraded | `#E0B341` | Text-labelled warning status |
| Critical / offline | `#FF8177` | Text-labelled critical status |
| Unknown / unavailable | `#9BA0AB` | Explicit unknown or gap state |

### Typography

- **Interface:** Inter with system sans-serif fallbacks.
- **Technical metadata:** `ui-monospace`, SFMono-Regular, Cascadia Code, Roboto Mono, Menlo, Consolas, DejaVu Sans Mono.
- **Public display:** approximately 38–58 px, tight tracking, high contrast.
- **Workspace headings:** approximately 24–30 px.
- **Workspace metadata:** approximately 8.5–11 px monospace, used only for secondary technical data.
- **Body:** 12–16 px depending on surface; public copy is larger than workspace metadata.

### Shape and motion

- Radii: 4 px technical chips, 6 px controls, 9–13 px cards, 18 px hero container.
- Spacing: 4 px base unit; public sections use generous 52–76 px rhythm; workspace panels use 10–26 px density.
- Motion: colour and border transitions only, approximately 120 ms. Reduced-motion preference removes animation.
- Focus: visible 2 px accent outline with offset on all interactive controls.

## Mockup register

| Screen / state | Desktop | Mobile | Revision | Review status |
|---|---|---|---|---|
| Public home | [`mockups/home-desktop.html`](./mockups/home-desktop.html) | [`mockups/home-mobile.html`](./mockups/home-mobile.html) | 0.1 | Presented; pending operator feedback |
| Dashboard | [`mockups/dashboard-desktop.html`](./mockups/dashboard-desktop.html) | [`mockups/dashboard-mobile.html`](./mockups/dashboard-mobile.html) | 0.1 | Presented; pending operator feedback |
| Host setup / enrollment | [`mockups/host-setup-desktop.html`](./mockups/host-setup-desktop.html) | [`mockups/host-setup-mobile.html`](./mockups/host-setup-mobile.html) | 0.1 | Presented; pending operator feedback |
| Incident timeline | [`mockups/incident-desktop.html`](./mockups/incident-desktop.html) | [`mockups/incident-mobile.html`](./mockups/incident-mobile.html) | 0.1 | Presented; pending operator feedback |
| Sealed assessment / bundle | [`mockups/incident-sealed-desktop.html`](./mockups/incident-sealed-desktop.html) | [`mockups/incident-sealed-mobile.html`](./mockups/incident-sealed-mobile.html) | 0.1 | Presented; pending operator feedback |
| Local verifier | [`mockups/verify-desktop.html`](./mockups/verify-desktop.html) | [`mockups/verify-mobile.html`](./mockups/verify-mobile.html) | 0.1 | Presented; pending operator feedback |
| State treatments | [`mockups/states.html`](./mockups/states.html) | Responsive single-column view | 0.1 | Presented; pending operator feedback |
| Mockup index | [`mockups/index.html`](./mockups/index.html) | Responsive | 0.1 | Presented; pending operator feedback |

## State coverage in the mockups

- Public verifier: no file, parsing failure, unsupported version, oversized file, valid, tampered and unknown platform key.
- Workspace: loading, empty hosts, API error/retry, stale polling, permission-safe host not found, form validation, blocked seal action, empty timeline.
- Incident: collecting, host gap, GPU telemetry unavailable, renter and probe failure and recovery, pending assessment, sealed assessment and preserved evidence gap.
- Host: DNS verified, enrollment pending, no source keys, readiness checklist and archive danger zone.
- Every status includes a text label. Colour is secondary.
- Empty, error and restricted states provide a retry, a safe next step or a not-found explanation without revealing another account's resource.

## Accessibility and verification notes

- Each page has one `h1`, semantic landmarks, a skip link and a logical heading order.
- File selection uses a labelled input; icon-only mobile navigation uses an accessible summary label.
- Status text is present independently of colour.
- Reduced-motion preference is honoured.
- Static audit across the mockup set: no duplicate IDs, no unnamed buttons, no unlabelled inputs, no dead `href="#"` links, no console errors and no horizontal overflow at 1440 px desktop or 430 px mobile viewports.
- Visual inspection was performed at 1440 px and 430 px widths.

## Operator feedback

No mockup feedback has been received yet. The operator has approved the **direction**, not the mockups.

| Date | Version | Feedback | Resolution |
|---|---|---|---|
| 2026-10-31 | 0.1 | Awaiting review of the complete mockup set | Pending |

## Explicit approval record

- **Mockup version presented:** 0.1, 2026-10-31.
- **Operator approval message/date:** NOT GRANTED.
- **Approved reference IDs/assets:** Hybrid direction B + A; no external assets.
- **Approved desktop/mobile review:** NOT COMPLETED.
- **Final visual implementation:** NOT AUTHORIZED.
- **Conditions/comments:** Pending operator review.

**Hard stop:** no final UI styling, brand tokens, component restyling or animation implementation until the operator explicitly approves the complete mockup direction. Approval of a prototype is not approval to change business rules, APIs, data models, security or architecture.
