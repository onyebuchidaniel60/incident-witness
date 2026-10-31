# Phase 6 reference-driven mockups

**Status:** Revision 0.2 presented for operator approval on 2026-10-31. The previous hybrid mockups were rejected. No code or styling has been applied to `apps/web`.

This set translates the operator-supplied references in `docs/design-references/` into Incident Witness screens:

- `incident-reference 1.webp`
- `incident-reference 2.webp`

The references supply the visual language only. No reference imagery, logos, avatars, screenshots or copy are used in the mockups.

## Visual direction

- Dark emerald command center with a soft ambient glow.
- Floating glass application window with a thin luminous edge and deep shadow.
- Narrow icon rail, list pane and wide detail pane.
- Emerald primary actions and selected-record glow.
- Blue live-state chips, red critical states and amber warning/gap states.
- Large display headings, compact uppercase labels and monospace technical metadata.
- Rounded cards, layered translucent surfaces and restrained depth.

## How to view

Open [`index.html`](./index.html) directly in a browser. No build step or server is required.

If local file navigation is restricted:

```sh
python3 -m http.server 8080 --directory docs/mockups
```

Then open `http://localhost:8080/`.

All hostnames, IDs, event counts, timestamps, fingerprints, codes and telemetry are illustrative. No mockup is connected to the API, staging database, Supabase project or any real host.

## Screen inventory

| Screen | Desktop | Mobile |
|---|---|---|
| Public home `/` | [`home-desktop.html`](./home-desktop.html) | [`home-mobile.html`](./home-mobile.html) |
| Authenticated dashboard `/dashboard` | [`dashboard-desktop.html`](./dashboard-desktop.html) | [`dashboard-mobile.html`](./dashboard-mobile.html) |
| Incident timeline `/incidents/[incidentId]` | [`incident-desktop.html`](./incident-desktop.html) | [`incident-mobile.html`](./incident-mobile.html) |
| Local verifier `/verify` | [`verify-desktop.html`](./verify-desktop.html) | [`verify-mobile.html`](./verify-mobile.html) |

## Reference translation

| Reference attribute | Incident Witness adaptation |
|---|---|
| Three-pane app window | Icon rail + session list + incident/dashboard detail |
| Emerald active navigation and selected cards | Selected session uses a green border and soft glow |
| Large display headings | Incident title and workspace title use Inter Display with tight tracking |
| Uppercase metadata rows | Report ID, host ID, platform key, timestamps and sequence labels |
| Blue “In progress” chip | `Collecting` / `Live` source states |
| Red severity bars | Critical evidence and unreachable states |
| Code block and inline snippets | Typed event payloads and manifest metadata |
| Avatar stack | Source identities shown as restrained mono initials |

## Data legibility adaptation

The references are stylized. The mockups raise technical text contrast rather than copying low-contrast muted labels:

- IDs, timestamps, event types, sequence numbers, hashes and platform keys use a high-contrast monospace stack.
- Timeline rows keep source, observed time, event type and sequence visible.
- Evidence gaps and unavailable telemetry are explicit amber/gray states, never healthy green.
- Mobile stacks the three panes and never requires horizontal scrolling.

## Out of scope

- Final CSS, Tailwind tokens or component implementation in `apps/web`.
- Real API calls, authentication, file parsing, verification, downloads or destructive actions.
- A theme toggle. The reference-driven default is dark.
- Final legal copy or support addresses.

## Review focus

1. Does the emerald glass command-center aesthetic match the references?
2. Does the three-pane workspace remain readable with real evidence density?
3. Are the host, renter and platform-probe sources clearly distinct?
4. Are gaps, stale sources and `UNAVAILABLE` telemetry obvious without being alarmist?
5. Does the mobile adaptation preserve the reference mood without losing timeline legibility?

See [`../DESIGN_DECISIONS.md`](../DESIGN_DECISIONS.md) for the reference analysis and approval record.
