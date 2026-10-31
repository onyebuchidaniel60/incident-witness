# UI Design Decisions and Operator Approval Record

**Status:** Revision 0.2 reference-driven mockups are presented for operator approval. The previous hybrid mockups were rejected. No final visual implementation is authorized, and no styling or UI code has been applied to `apps/web`.

## History

| Date | Version | Direction | Result |
|---|---|---|---|
| 2026-10-31 | 0.1 | Hybrid: light public pages + dark workspace | **Rejected by operator** |
| 2026-10-31 | 0.2 | Operator-supplied dark emerald command-center references | Presented; approval pending |

Revision 0.2 supersedes the 0.1 tokens, layouts and mockup files. The old hybrid mockups were deleted from `docs/mockups/`.

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
| Primary emerald | `#2BD58F` / `#67E9B4` |
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
- Use Inter/Inter Display for interface and display text, with a monospace stack for technical data.
- Use emerald for primary actions and active/selected states, blue for live/collecting states, red for critical failures, amber for warnings and gaps, and gray for unknown/unavailable.
- Preserve the reference’s rounded, layered glass panels and thin luminous borders.

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
| Public home `/` | [`mockups/home-desktop.html`](./mockups/home-desktop.html) | [`mockups/home-mobile.html`](./mockups/home-mobile.html) | 0.2 | Presented; approval pending |
| Dashboard `/dashboard` | [`mockups/dashboard-desktop.html`](./mockups/dashboard-desktop.html) | [`mockups/dashboard-mobile.html`](./mockups/dashboard-mobile.html) | 0.2 | Presented; approval pending |
| Incident timeline `/incidents/[incidentId]` | [`mockups/incident-desktop.html`](./mockups/incident-desktop.html) | [`mockups/incident-mobile.html`](./mockups/incident-mobile.html) | 0.2 | Presented; approval pending |
| Local verifier `/verify` | [`mockups/verify-desktop.html`](./mockups/verify-desktop.html) | [`mockups/verify-mobile.html`](./mockups/verify-mobile.html) | 0.2 | Presented; approval pending |
| Mockup index | [`mockups/index.html`](./mockups/index.html) | Responsive | 0.2 | Presented; approval pending |

## Explicit approval record

- **Mockup version presented:** 0.2, 2026-10-31.
- **Reference assets:** operator-supplied WebP images in `docs/design-references/`.
- **Design reference approval:** accepted as the visual direction; the translation above is pending confirmation where noted.
- **Desktop/mobile review:** NOT COMPLETED.
- **Operator approval message/date:** NOT GRANTED.
- **Final visual implementation:** NOT AUTHORIZED.
- **Conditions/comments:** Pending operator review.

**Hard stop:** no final UI styling, brand tokens, component restyling or animation implementation until the operator explicitly approves this reference-driven mockup direction. Approval of a mockup is not approval to change business rules, APIs, data models, security or architecture.
