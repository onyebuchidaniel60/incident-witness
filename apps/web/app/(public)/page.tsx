import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";

const sources: {
  title: string;
  icon: IconName;
  detail: string;
  footer: string;
}[] = [
  {
    title: "Provider host",
    icon: "server",
    detail:
      "The Linux x86_64 host agent records bounded, typed observations such as heartbeats and available power or GPU signals. Missing sensors are reported as unavailable.",
    footer: "HOST-SIGNED · ED25519",
  },
  {
    title: "Renter client",
    icon: "activity",
    detail:
      "The incident-scoped SDK records workload-side heartbeats and endpoint observations without collecting workload content, prompts or model data.",
    footer: "RENTER-SIGNED · SCOPED KEY",
  },
  {
    title: "Platform probe",
    icon: "shield",
    detail:
      "A separate platform-operated worker checks the provider's verified HTTPS health endpoint. It is not an independent third-party organisation.",
    footer: "PLATFORM-OPERATED · NOT INDEPENDENT",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="grid items-center gap-10 pb-2 pt-4 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pt-10">
        <div>
          <p className="iw-eyebrow">
            <span className="iw-eyebrow-dot" />
            Portable incident evidence
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.02] text-iw-ink sm:text-5xl lg:text-[4.1rem]">
            A common record of what each source observed.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-iw-muted">
            Incident Witness is a provider-neutral protocol for signed, bounded observations from a
            GPU host, a renter-side client and a platform-operated reachability probe. The intended
            result is a time-ordered, offline-verifiable evidence bundle — not a claim about the
            physical root cause.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href="/docs" className="iw-btn iw-btn-primary iw-btn-lg">
              Read the documentation
              <Icon name="arrow-up-right" size="sm" />
            </Link>
            <Link href="/verify" className="iw-btn iw-btn-secondary iw-btn-lg">
              Verify a bundle
            </Link>
            <Link href="/dashboard" className="iw-btn iw-btn-ghost iw-btn-lg">
              Open provider dashboard
            </Link>
          </div>
          <dl className="mt-8 flex flex-wrap gap-5">
            {[
              ["3", "source categories"],
              ["Ed25519", "signed observations"],
              ["Offline", "bundle verification"],
            ].map(([value, label]) => (
              <div key={label} className="border-l border-iw-border-strong pl-3">
                <dt className="font-mono text-[10px] text-iw-ink-soft">{value}</dt>
                <dd className="mt-0.5 text-[8.5px] uppercase tracking-[0.06em] text-iw-faint">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="iw-panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-iw-border bg-black/15 px-4 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-iw-surface-5" />
            <span className="h-1.5 w-1.5 rounded-full bg-iw-surface-5" />
            <span className="h-1.5 w-1.5 rounded-full bg-iw-surface-5" />
            <span className="ml-2 font-mono text-[8px] uppercase tracking-[0.12em] text-iw-faint">
              Incident Witness / Evidence surface
            </span>
          </div>
          <div className="p-4 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {sources.map((source) => (
                <div
                  key={source.title}
                  className="rounded-[4px] border border-iw-border bg-white/[0.025] p-3"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-[4px] border border-iw-green/35 bg-iw-green/10 text-iw-green-bright">
                    <Icon name={source.icon} size="sm" />
                  </span>
                  <p className="mt-3 text-[10px] font-medium text-iw-ink-soft">{source.title}</p>
                  <p className="mt-1 font-mono text-[7.5px] uppercase tracking-[0.06em] text-iw-faint">
                    signed observation
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-[4px] border border-iw-border bg-[#111412] p-3 font-mono text-[8.5px] leading-5 text-iw-faint">
              <p>
                <span className="text-iw-green-bright">correlate</span> observed_at → source →
                key → sequence
              </p>
              <p>
                <span className="text-iw-green-bright">seal</span> manifest · certificates ·
                events
              </p>
              <p>
                <span className="text-iw-green-bright">verify</span> locally · no upload required
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="iw-chip iw-chip-neutral">RFC 8785 JCS</span>
              <span className="iw-chip iw-chip-neutral">SHA-256</span>
              <span className="iw-chip iw-chip-neutral">Ed25519</span>
            </div>
            <p className="mt-3 text-[9px] leading-5 text-iw-faint">
              A signature verifies integrity and provenance from a key. It does not prove sensor
              truth or physical cause.
            </p>
          </div>
        </div>
      </section>

      <section className="iw-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-iw-ink">
          <Icon name="alert" size="sm" className="text-iw-yellow" />
          Current functionality
        </h2>
        <p className="mt-2 max-w-4xl text-[11px] leading-6 text-iw-muted">
          The provider workspace, host/endpoint lifecycle, signed evidence ingestion, deterministic
          assessment, bundle sealing and local browser/CLI verification are implemented against the
          staging environment. Provider data is loaded from the authenticated API; there is no
          fabricated host or evidence status. The API is not yet deployed to Render, and this public
          site does not operate a production evidence service.
        </p>
      </section>

      <section aria-labelledby="sources-heading">
        <div className="max-w-2xl">
          <p className="iw-eyebrow">
            <span className="iw-eyebrow-dot" />
            Three sources
          </p>
          <h2
            id="sources-heading"
            className="mt-3 text-2xl leading-tight text-iw-ink sm:text-3xl"
          >
            Separate observations. One correlatable record.
          </h2>
          <p className="mt-3 text-xs leading-6 text-iw-muted">
            Each source has its own key, scope and view of the incident. None of them is treated as
            a complete account on its own.
          </p>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {sources.map((source) => (
            <article key={source.title} className="iw-panel flex flex-col p-5">
              <span className="grid h-9 w-9 place-items-center rounded-[4px] border border-iw-green/35 bg-iw-green/10 text-iw-green-bright">
                <Icon name={source.icon} size="md" />
              </span>
              <h3 className="mt-4 text-base text-iw-ink">{source.title}</h3>
              <p className="mt-2 text-[11px] leading-6 text-iw-muted">{source.detail}</p>
              <p className="mt-auto pt-5 font-mono text-[8px] uppercase tracking-[0.06em] text-iw-faint">
                {source.footer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="limits-heading" className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <p className="iw-eyebrow">
            <span className="iw-eyebrow-dot" />
            Limits
          </p>
          <h2 id="limits-heading" className="mt-3 text-2xl leading-tight text-iw-ink sm:text-3xl">
            What the evidence can and cannot show.
          </h2>
          <ul className="mt-5 space-y-3 text-[11px] leading-6 text-iw-muted">
            <li className="flex gap-2">
              <Icon name="check" size="sm" className="mt-1 text-iw-green" />
              A signature can show integrity and provenance from a key. It does not prove that a
              sensor was truthful, a host was uncompromised or a cause is certain.
            </li>
            <li className="flex gap-2">
              <Icon name="check" size="sm" className="mt-1 text-iw-green" />
              Missing UPS, GPU or renter observations are represented as unavailable or gaps, not as
              normal readings.
            </li>
            <li className="flex gap-2">
              <Icon name="check" size="sm" className="mt-1 text-iw-green" />
              Capture is bounded to an active session. The MVP does not reconstruct incidents that
              began before the session was created.
            </li>
            <li className="flex gap-2">
              <Icon name="check" size="sm" className="mt-1 text-iw-green" />
              The platform probe is operated by the same platform as the service. It is a separate
              process, not an independent outside organisation.
            </li>
          </ul>
        </div>
        <div className="iw-panel p-5">
          <h2 className="text-lg text-iw-ink">Verification model</h2>
          <p className="mt-3 text-[11px] leading-6 text-iw-muted">
            An exported JSON bundle carries a signed manifest, source certificates, bounded events,
            gap notices, a rule version and an assessment expressed as an evidence pattern.
            Verification runs locally in the browser or the CLI against pinned trusted public keys.
            It checks integrity and signatures relative to those keys, not sensor truth or
            marketplace acceptance.
          </p>
          <p className="mt-3 text-[11px] leading-6 text-iw-muted">
            The browser verifier processes the selected file locally; it does not upload the bundle.
            A valid result means the listed cryptographic checks passed, not that a physical cause
            is proven.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="iw-chip iw-chip-success">Manifest digest</span>
            <span className="iw-chip iw-chip-live">Source certificates</span>
            <span className="iw-chip iw-chip-neutral">Event signatures</span>
          </div>
        </div>
      </section>
    </div>
  );
}
