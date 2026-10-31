import Link from "next/link";

import { PageIntro } from "@/components/page-intro";

const repositoryUrl = "https://github.com/onyebuchidaniel60/incident-witness";
const docsUrl = `${repositoryUrl}/tree/main/docs`;

export const metadata = {
  title: "Documentation",
};

export default function DocsPage() {
  return (
    <div className="space-y-10">
      <PageIntro
        eyebrow="Documentation"
        title="Incident Witness documentation"
        description="The product, architecture, protocol and operational documents live in the public repository. This page is the stable documentation destination for the application shell."
      />

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h2 className="font-semibold">Current phase</h2>
        <p className="mt-2">
          Phase 3 is complete: the signed evidence protocol, host agent, renter SDK, platform probe
          worker, deterministic correlator and sealed bundle lifecycle are implemented. Phase 4
          connects the provider workspace, host and incident management and the local browser
          verifier to the staging API. The API is not yet deployed to Render, and no production
          evidence service or legal policy is live. The repository documents remain the source of
          truth.
        </p>
      </section>

      <section aria-labelledby="start-heading">
        <h2 id="start-heading" className="text-2xl font-semibold tracking-tight text-slate-950">
          Start with these documents
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">Product and scope</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              The product definition, MVP boundaries, roles, flows, lifecycle rules, assessment
              language and route inventory.
            </p>
            <a
              href={`${repositoryUrl}/blob/main/PROJECT_SPEC.md`}
              className="mt-3 inline-block text-sm font-medium text-slate-800 underline hover:text-slate-950"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PROJECT_SPEC.md
            </a>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">Architecture and security</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              The approved stack, data model, API contracts, cryptography, trust boundaries, SSRF
              controls and deployment model.
            </p>
            <a
              href={`${repositoryUrl}/blob/main/ARCHITECTURE.md`}
              className="mt-3 inline-block text-sm font-medium text-slate-800 underline hover:text-slate-950"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open ARCHITECTURE.md
            </a>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">Protocol and evidence format</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              The planned signed event envelope, canonicalization, source certificates, bundle
              semantics and verification limitations.
            </p>
            <a
              href={`${repositoryUrl}/blob/main/docs/PROTOCOL.md`}
              className="mt-3 inline-block text-sm font-medium text-slate-800 underline hover:text-slate-950"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the protocol document
            </a>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">Operator and user material</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Host-agent prerequisites, renter integration, deployment, operations, privacy and
              security documentation.
            </p>
            <a
              href={docsUrl}
              className="mt-3 inline-block text-sm font-medium text-slate-800 underline hover:text-slate-950"
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse the docs directory
            </a>
          </article>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-950">Documentation status</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          The repository documentation is the current source of truth. This in-app page will be
          expanded as functional screens, API contracts and verified operating procedures are
          implemented. No privacy policy, terms of service or support contact has been approved for
          publication yet.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="font-medium text-slate-800 underline hover:text-slate-950">
            Privacy placeholder
          </Link>
          <Link href="/terms" className="font-medium text-slate-800 underline hover:text-slate-950">
            Terms placeholder
          </Link>
          <a
            href={repositoryUrl}
            className="font-medium text-slate-800 underline hover:text-slate-950"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub repository
          </a>
        </div>
      </section>
    </div>
  );
}
