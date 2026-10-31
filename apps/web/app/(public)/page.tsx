import Link from "next/link";

import { PageIntro } from "@/components/page-intro";

const sources = [
  {
    title: "Provider host",
    detail:
      "The Linux x86_64 host agent records bounded, typed observations such as heartbeats and available power or GPU signals. Missing sensors are reported as unavailable.",
  },
  {
    title: "Renter client",
    detail:
      "The incident-scoped SDK records workload-side heartbeats and endpoint observations without collecting workload content, prompts or model data.",
  },
  {
    title: "Platform probe",
    detail:
      "A separate platform-operated worker checks the provider's verified HTTPS health endpoint. It is not an independent third-party organisation.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <PageIntro
          eyebrow="Portable incident evidence"
          title="A common record of what each source observed."
          description="Incident Witness is being built as a provider-neutral protocol for signed, bounded observations from a GPU host, a renter-side client and a platform-operated reachability probe. The intended result is a time-ordered, offline-verifiable evidence bundle — not a claim about the physical root cause."
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Read the documentation
          </Link>
          <Link
            href="/verify"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Verify a bundle
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Open provider dashboard
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h2 className="font-semibold">Current functionality</h2>
        <p className="mt-2">
          The provider workspace, host/endpoint lifecycle, signed evidence ingestion, deterministic
          assessment, bundle sealing and local browser/CLI verification are implemented against the
          staging environment. Provider data is loaded from the authenticated API; there is no
          fabricated host or evidence status. The API is not yet deployed to Render, and this public
          site does not operate a production evidence service.
        </p>
      </section>

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="text-2xl font-semibold tracking-tight text-slate-950">
          Three source categories
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {sources.map((source) => (
            <article key={source.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold text-slate-950">{source.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{source.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="limits-heading" className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 id="limits-heading" className="text-2xl font-semibold tracking-tight text-slate-950">
            What the evidence can and cannot show
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
            <li>
              A signature can show integrity and provenance from a key. It does not prove that a
              sensor was truthful, a host was uncompromised or a cause is certain.
            </li>
            <li>
              Missing UPS, GPU or renter observations are represented as unavailable or gaps, not as
              normal readings.
            </li>
            <li>
              Capture is bounded to an active session. The MVP does not reconstruct incidents that
              began before the session was created.
            </li>
            <li>
              The platform probe is operated by the same platform as the service. It is a separate
              process, not an independent outside organisation.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Verification model
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            An exported JSON bundle carries a signed manifest, source certificates, bounded events,
            gap notices, a rule version and an assessment expressed as an evidence pattern.
            Verification runs locally in the browser or the CLI against pinned trusted public keys.
            It checks integrity and signatures relative to those keys, not sensor truth or
            marketplace acceptance.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            The browser verifier processes the selected file locally; it does not upload the bundle.
            A valid result means the listed cryptographic checks passed, not that a physical cause
            is proven.
          </p>
        </div>
      </section>
    </div>
  );
}
