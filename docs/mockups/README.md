# Phase 6 structural mockups

**Status:** Presented for operator review on 2026-10-31. Mockups are **not approved** and no final visual implementation has been applied to `apps/web`.

These are standalone HTML/CSS prototypes for the approved hybrid design direction:

- **Public pages:** Direction B, light-first, clean and typography-led.
- **Authenticated workspace:** Direction A, dark-first, compact and data-dense.
- **Tone:** Objective, technical, sober and precise. No playful, cyberpunk or decorative-dashboard styling.
- **Typography:** Inter for interface text; a monospace stack for identifiers, timestamps, sequences, digests and signatures.
- **Status:** Always labelled in text. Green, amber, red and gray are secondary cues.

## How to view

Open [`index.html`](./index.html) directly in a browser. The pages use only relative local CSS and require no build step.

If your browser restricts local file navigation, serve the directory with any static file server, for example:

```sh
python3 -m http.server 8080 --directory docs/mockups
```

Then open `http://localhost:8080/`.

All hostnames, IDs, event counts, timestamps, fingerprints, codes and telemetry are illustrative. No mockup is connected to the API, staging database, Supabase project or any real host.

## Screen inventory

| Screen | Desktop | Mobile | States shown |
|---|---|---|---|
| Public home `/` | [`home-desktop.html`](./home-desktop.html) | [`home-mobile.html`](./home-mobile.html) | Hero, three source categories, verification preview, limitations, footer |
| Dashboard `/dashboard` | [`dashboard-desktop.html`](./dashboard-desktop.html) | [`dashboard-mobile.html`](./dashboard-mobile.html) | Active session, stale host source, degraded host, unknown host, recent sealed records |
| Host setup `/hosts/[hostId]` | [`host-setup-desktop.html`](./host-setup-desktop.html) | [`host-setup-mobile.html`](./host-setup-mobile.html) | DNS verified, enrollment pending, empty source keys, readiness, archive danger zone |
| Incident timeline `/incidents/[incidentId]` | [`incident-desktop.html`](./incident-desktop.html) | [`incident-mobile.html`](./incident-mobile.html) | Collecting, host gap, unavailable GPU telemetry, renter/probe failures and recovery, pending assessment |
| Sealed incident | [`incident-sealed-desktop.html`](./incident-sealed-desktop.html) | [`incident-sealed-mobile.html`](./incident-sealed-mobile.html) | Sealed bundle, deterministic assessment, preserved gap, bundle metadata, integrity summary |
| Local verifier `/verify` | [`verify-desktop.html`](./verify-desktop.html) | [`verify-mobile.html`](./verify-mobile.html) | Pass, tampered, unknown platform key, local-only notice, limitation statement |
| State treatments | [`states.html`](./states.html) | Responsive single-column view | Loading, empty, error/retry, stale, validation, action blocked, permission-safe not-found, verifier failures |

## Deliberate design choices

- The public home page uses light surfaces and a restrained blue trust accent. The workspace uses near-black surfaces with a compact sidebar and dense tables.
- The incident timeline separates **Host agent**, **Renter client** and **Platform probe** with source labels and distinct accent colours. The platform probe is always described as platform-operated, not an independent third party.
- Missing host, GPU, UPS, renter or probe observations use gray `UNAVAILABLE`, `GAP` or `STALE` treatments. They are never rendered as green or described as normal.
- Assessment grades use an informational blue or neutral treatment rather than health green, so an evidence grade is not confused with operational health.
- `UNKNOWN` is presented as a valid assessment outcome when evidence is insufficient or conflicting.
- Buttons and links are real controls in the prototype markup, but actions are not wired. File selection on the verifier is a static control and is labelled as such.
- The mockups include skip links, semantic landmarks, labelled inputs, visible focus styles, text-labelled statuses and reduced-motion support.

## Out of scope

- Final CSS, Tailwind tokens or component implementation in `apps/web`.
- A light/dark theme toggle. The approved defaults are light public pages and a dark workspace; theme switching remains a later decision.
- Real data, API calls, authentication, file parsing, verification, downloads or destructive actions.
- Final legal copy, support addresses or production claims.

## Review focus

1. Does the hybrid split feel coherent when moving from the public site into the workspace?
2. Is the incident timeline readable at desktop and mobile widths, especially the three source categories and gap states?
3. Are `UNKNOWN`, `UNAVAILABLE` and `STALE` obvious without being alarmist?
4. Is the host enrollment flow clear about one-time codes, local key generation and the manual incident-ID limitation?
5. Does the verifier make local-only processing and the limits of signature verification clear?
6. Are the dark workspace density and typography appropriate for repeated operational use?

See [`../DESIGN_DECISIONS.md`](../DESIGN_DECISIONS.md) for the approved direction, reference register and approval record.
