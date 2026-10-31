# UI Design Decisions and Operator Approval Record

**Status:** Revision 0.3 is **APPROVED** by the operator on 2026-10-31. The approved visual direction is authorized for Phase 7 implementation. No business logic, API contract or database schema change is approved by this visual approval.

## History

| Date | Version | Direction | Result |
|---|---|---|---|
| 2026-10-31 | 0.1 | Hybrid: light public pages + dark workspace | **Rejected by operator** |
| 2026-10-31 | 0.2 | Operator-supplied dark emerald command-center references | Direction approved; typography/geometry refinements requested |
| 2026-10-31 | 0.3 | Satoshi typeface + sharp 4px control/card geometry | **Approved by operator** |

Revision 0.3 supersedes the 0.1 and 0.2 tokens and mockup files. The old hybrid mockups were deleted from `docs/mockups/`.

## Revision 0.3 — operator feedback applied

1. **Typeface.** The exact reference font is not publicly identified. The reference letterforms are a geometric sans with tight display tracking and single-storey details. **Satoshi** (Indian Type Foundry, via Fontshare) is used as the closest freely available match named by the operator, bundled locally as WOFF2 under `docs/mockups/assets/fonts/`. Inter is retained only as a fallback. See the [font attribution/license note](./mockups/assets/fonts/FONT_LICENSE.md).
2. **Sharp geometry.** Buttons, inputs, chips, session cards, stat tiles, evidence panels, source cards and state cards now use **4px** corners; chips use 3px. The outer app window keeps a 16px frame radius, the verifier window 10px and the preview frame 8px so the result reads as a technical floating panel rather than a pill-shaped SaaS UI.
3. **Colour detail.** The primary emerald is tightened to `#26D18C` with an action gradient ending at `#16845E`. The base field keeps subtle green/blue-tinted charcoals rather than pure black.
4. **Icon spacing.** The icon rail gap is widened to give the reference’s more deliberate vertical rhythm.
5. **Technical legibility.** Mono metadata was raised slightly in size and contrast while keeping the reference’s compact hierarchy. It remains subordinate to the display heading but readable for evidence inspection.

## Operator-supplied references

The operator uploaded two references to `docs/design-references/`:

- `incident-reference 1.webp`
- `incident-reference 2.webp`

Only the visual language is used. No reference image, avatar, logo, screenshot, product copy or brand asset is embedded in the mockups.

## Reference analysis

### Reference 1 — emerald ambient command center

- A floating application window sits over a near-black field with a strong green ambient glow in the upper-left and a soft dark vignette.
- The window has a large corner radius and a thin luminous border, with deep shadow and a slight glass/translucency effect.
- Three-pane anatomy: a narrow icon-only rail, a report/list pane and a wide detail pane.
- The icon rail uses a green outlined hash-style mark, muted line icons and a bright green active tile.
- The list pane has a large heading, compact metadata chips, a search field and a vivid emerald primary action.
- List cards are dark charcoal with rounded corners. The selected card has a green outline and a subtle glow.
- The detail pane uses a very large white display heading, uppercase metadata labels, inline chips, avatar stacks and a large code block.
- Status language: blue “In progress” chip, red critical severity bars, yellow intermediate severity, green primary actions.
- Technical content is monospace and visually secondary to the display heading.

### Reference 2 — neutral dark workspace

- Same three-pane anatomy and icon rail, but on a flatter near-black background without the strong green ambient gradient.
- Panel surfaces are neutral charcoal rather than green-tinted.
- The list pane is narrower and the detail pane wider; the selected card remains green-outlined.
- Metadata is organised in icon + uppercase label + value rows.
- Code and attachments use large rounded dark blocks; inline code is highlighted in green.
- Confirms that the core layout is the icon rail + list + detail pattern, with green as the interactive accent.

### Colour palette observed

These are approximate values informed by the references, not sampled brand tokens:

| Role | Approximate value |
|---|---|
| Ambient background | `#0A0C0B` to `#111412` |
| App surface | `#171A18` / `#1E211F` |
| Raised card | `#252927` / `#2D322F` |
| Border | translucent warm white, about 8–15% |
| Primary emerald | `#26D18C` / `#67E9B4` |
| Deep emerald action | `#19966B` / `#16845E` |
| Live blue | `#6F9BFF` / `#A9C1FF` |
| Critical red | `#FF6868` |
| Warning amber | `#E6B955` |
| Primary text | `#F1F7F3` |
| Secondary text | `#9BA69F` |

### Typography and shape

- Geometric/grotesk sans-serif for display and interface text; heavy display weights, sentence case.
- Small uppercase labels with wide letter spacing for metadata categories.
- Monospace for code, IDs, timestamps, signatures and technical values.
- Large radii: approximately 24 px window, 16 px panels, 13 px cards, 9–10 px controls and chips.
- Soft layered shadows, thin translucent borders and a green selected-state glow.
- Dense information, but generous internal card padding and line height.

## Translation into Incident Witness

### Global

- Use a dark emerald command-center theme for all public and authenticated screens, matching the references.
- Keep the green ambient glow on the public landing page and the verifier; use a calmer dark field inside the workspace app window.
- Use Satoshi (with Inter fallback) for interface and display text, with a monospace stack for technical data.
- Use emerald for primary actions and active/selected states, blue for live/collecting states, red for critical failures, amber for warnings and gaps, and gray for unknown/unavailable.
- Preserve the layered glass panels, thin luminous borders and technical 4px inner geometry from revision 0.3.

### Public home

- Dark landing page with a green ambient glow and a framed three-pane product preview.
- The preview shows a selected incident, source health and a compact evidence snippet, directly echoing the reference’s list/detail composition.
- Sections below use dark cards for the three source categories, offline verification and evidence limitations.

### Dashboard

- Three-pane app window: icon rail, session list, workspace detail.
- Selected session card uses the reference’s green outline and glow.
- Detail area contains stat tiles, the active capture, source health, host table and recent sealed records.
- Technical metadata remains monospace at a readable size.

### Incident timeline

- Three-pane app window with a session list and a wide incident detail pane.
- Large incident title and uppercase metadata rows mirror the reference detail screen.
- Host, renter and platform-probe observations use text-labelled source chips.
- Typed payloads use compact code-like blocks; the UPS payload is shown as a three-field technical detail.
- Host gaps are amber dashed treatments; unavailable GPU telemetry is a neutral gray chip, never green.
- Assessment remains pending until sealing, with deterministic rule wording and no probability score.

### Local verifier

- Centered glass verifier window split into “select” and “result” panes.
- Emerald success result, red tampered result and amber unknown-key result.
- Local-only processing notice and the signature-limitation statement remain prominent.

### Mobile

- No mobile reference was supplied. The plan adapts the desktop three-pane layout to a top bar with a menu, then stacked cards.
- The icon rail and list pane collapse; the detail content becomes the primary scroll.
- Timelines stack vertically with source and time labels retained.
- No horizontal scrolling, no hidden technical metadata and no low-contrast mono text.

## Technical legibility adaptation

The references use low-contrast muted labels and small UI text. The mockups deliberately raise contrast and minimum sizes for evidence work:

- IDs, timestamps, event types, sequence numbers, hashes and platform keys use a high-contrast mono style.
- Timeline summaries are 10–11 px on desktop and 9.5–10 px on mobile, with 1.5–1.6 line height.
- Small uppercase labels are used for categories, not essential values.
- Status is always text-labelled. Colour is secondary.
- Missing, stale and unavailable states are not converted into green or “healthy” treatments.

## Intentional deviations from the references

1. **No copied avatars or photos.** Source identities use mono initials in restrained gradient circles.
2. **No report-management copy or sample content.** The product retains its own incident-evidence language.
3. **More legible technical text.** The reference’s very small muted labels are increased in contrast for evidence inspection.
4. **No decorative metric charts.** Stat tiles and evidence cards replace generic dashboard charts.
5. **Mobile is a documented adaptation.** The reference only shows a desktop three-pane window.
6. **Evidence gaps are explicit.** The reference’s severity bars are adapted into source/status chips and gap notices rather than implying a single severity score.

## Operator confirmation requested

The following translations involve judgment because the references do not show these cases:

1. **Mobile navigation:** top bar + menu + stacked cards, with the icon rail and list pane removed. Confirm or request a drawer/bottom-nav alternative.
2. **Public home:** dark landing page with the same emerald glow and a framed app preview. The references show only the app, not a marketing page.
3. **Source colours:** Host = emerald, Renter = blue, Platform probe = cyan. Confirm or request different source colour assignments.
4. **Theme:** all screens are dark-first; no light theme is included in this revision.
5. **Avatars:** mono initials replace photographic avatars. Confirm this is acceptable.

The mockups are otherwise presented as the translation of the references. Any of the above can be revised before approval.

## Mockup register

| Screen | Desktop | Mobile | Revision | Status |
|---|---|---|---|---|
| Public home `/` | [`mockups/home-desktop.html`](./mockups/home-desktop.html) | [`mockups/home-mobile.html`](./mockups/home-mobile.html) | 0.3 | **Approved** |
| Dashboard `/dashboard` | [`mockups/dashboard-desktop.html`](./mockups/dashboard-desktop.html) | [`mockups/dashboard-mobile.html`](./mockups/dashboard-mobile.html) | 0.3 | **Approved** |
| Incident timeline `/incidents/[incidentId]` | [`mockups/incident-desktop.html`](./mockups/incident-desktop.html) | [`mockups/incident-mobile.html`](./mockups/incident-mobile.html) | 0.3 | **Approved** |
| Local verifier `/verify` | [`mockups/verify-desktop.html`](./mockups/verify-desktop.html) | [`mockups/verify-mobile.html`](./mockups/verify-mobile.html) | 0.3 | **Approved** |
| Mockup index | [`mockups/index.html`](./mockups/index.html) | Responsive | 0.3 | **Approved** |

## Explicit approval record

- **Mockup version presented:** 0.3, 2026-10-31.
- **Reference assets:** operator-supplied WebP images in `docs/design-references/`.
- **Design reference approval:** **APPROVED**. The operator confirmed that Satoshi, the sharp 4px geometry and the refined emerald color match the reference.
- **Desktop/mobile review:** **COMPLETED**.
- **Operator approval message/date:** **"I approve these mockups."** — 2026-10-31.
- **Final visual implementation:** **AUTHORIZED** for Phase 7 only.
- **Conditions/comments:** The approved direction includes the five documented translation choices (mobile top bar/stacked cards, dark public landing, host green / renter blue / platform cyan, all-dark theme, mono initials). Phase 7 must preserve business logic, API contracts, database schemas, evidence language and the local-only browser verifier.

**Approval gate passed.** Phase 7 may implement the approved visual system. Any deviation that changes design intent, product behaviour, data exposure, APIs, security or architecture requires separate operator approval.

## Phase 7 implementation record (2026-10-31)

The approved visual system is applied in `apps/web`:

- Satoshi WOFF2 files are served from `apps/web/public/fonts/` and loaded with `@font-face` in `apps/web/app/globals.css`; Inter remains a fallback.
- The emerald `#26D18C` palette, tinted charcoal surfaces, 4px controls/cards and 3px chips are implemented as Tailwind v4 theme tokens and shared component classes.
- Public shell, workspace shell, navigation, footer, status chips, buttons, forms, tables and the verifier use the approved dark glass command-center aesthetic.
- The timeline distinguishes Host agent (emerald), Renter client (blue) and platform-operated probe (cyan), with monospace event types, UTC times and sequence numbers.
- Mobile uses the approved top bar/menu and stacked cards; no horizontal-only evidence tables remain.

### Intentional implementation deviations

1. **Navigation pane instead of a persistent session list.** The authenticated middle pane contains workspace navigation, not a live list of sessions. Session selection remains on `/incidents`; this avoids adding a new data-driven navigation feature in a visual-only phase.
2. **No fabricated preview telemetry.** The public home page uses an honest three-source evidence-surface panel rather than illustrative host status or incident telemetry.
3. **Route heading hierarchy preserved.** The incident route keeps the existing `h1` “Evidence session” for route semantics; the incident title is displayed prominently as an `h2`.
4. **Compact UTC timeline times.** The timeline uses `HH:MM:SS UTC` for scanability, while full timestamps remain in metadata and tooltips.
5. **Verifier results remain inline.** Result states are rendered in the approved two-pane verifier after file selection, not as a separate state gallery.

No business logic, API contract, database schema, assessment wording or verifier behaviour changed.
