import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { Icon } from "@/components/ui/icon";

const repositoryUrl = "https://github.com/onyebuchidaniel60/incident-witness";
const docsUrl = `${repositoryUrl}/tree/main/docs`;

export const metadata = {
  title: "Documentation",
};

const documents = [
  {
    title: "Product and scope",
    detail:
      "The product definition, MVP boundaries, roles, flows, lifecycle rules, assessment language and route inventory.",
    href: `${repositoryUrl}/blob/main/PROJECT_SPEC.md`,
    label: "Open PROJECT_SPEC.md",
  },
  {
    title: "Architecture and security",
    detail:
      "The approved stack, data model, API contracts, cryptography, trust boundaries, SSRF controls and deployment model.",
    href: `${repositoryUrl}/blob/main/ARCHITECTURE.md`,
    label: "Open ARCHITECTURE.md",
  },
  {
    title: "Protocol and evidence format",
    detail:
      "The signed event envelope, canonicalization, source certificates, bundle semantics and verification limitations.",
    href: `${repositoryUrl}/blob/main/docs/PROTOCOL.md`,
    label: "Open the protocol document",
  },
  {
    title: "Operator and user material",
    detail:
      "Host-agent prerequisites, renter integration, deployment, operations, privacy and security documentation.",
    href: docsUrl,
    label: "Browse the docs directory",
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-10">
      <PageIntro
        eyebrow="Documentation"
        title="Incident Witness documentation"
        description="The product, architecture, protocol and operational documents live in the public repository. This page is the stable documentation destination for the application shell."
      />

      <section className="iw-notice iw-notice-warning flex-col gap-1.5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon name="alert" size="sm" />
          Implementation status
        </h2>
        <p className="text-[11px] leading-6">
          The signed evidence protocol, host agent, renter SDK, platform probe worker, deterministic
          correlator and sealed bundle lifecycle are implemented. The provider workspace, host and
          incident management and local browser verifier are connected to the staging API. Phase 7
          applies the approved visual direction. The API is not yet deployed to Render, and no
          production evidence service or legal policy is live. The repository documents remain the
          source of truth.
        </p>
      </section>

      <section aria-labelledby="start-heading">
        <p className="iw-eyebrow">
          <span className="iw-eyebrow-dot" />
          Start here
        </p>
        <h2 id="start-heading" className="mt-3 text-2xl leading-tight text-iw-ink sm:text-3xl">
          Start with these documents
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {documents.map((document) => (
            <article key={document.title} className="iw-panel flex flex-col p-5">
              <h3 className="text-base text-iw-ink">{document.title}</h3>
              <p className="mt-2 text-[11px] leading-6 text-iw-muted">{document.detail}</p>
              <a
                href={document.href}
                className="iw-link mt-4 inline-flex items-center gap-1.5 text-[10px]"
                target="_blank"
                rel="noopener noreferrer"
              >
                {document.label}
                <Icon name="arrow-up-right" size="sm" />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="iw-panel p-5">
        <h2 className="text-lg text-iw-ink">Documentation status</h2>
        <p className="mt-2 max-w-4xl text-[11px] leading-6 text-iw-muted">
          The repository documentation is the current source of truth. This in-app page will be
          expanded as functional screens, API contracts and verified operating procedures are
          implemented. No privacy policy, terms of service or support contact has been approved for
          publication yet.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-medium">
          <Link href="/privacy" className="iw-link">
            Privacy placeholder
          </Link>
          <Link href="/terms" className="iw-link">
            Terms placeholder
          </Link>
          <a
            href={repositoryUrl}
            className="iw-link inline-flex items-center gap-1.5"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub repository
            <Icon name="arrow-up-right" size="sm" />
          </a>
        </div>
      </section>
    </div>
  );
}
