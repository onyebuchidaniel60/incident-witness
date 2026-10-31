import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { PageIntro } from "@/components/page-intro";
import { Icon } from "@/components/ui/icon";
import { repositoryUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Incident Witness documentation: what the protocol records, host-agent installation and enrollment, renter SDK integration, signed bundle verification and evidence limitations.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Incident Witness documentation",
    description:
      "Install the host agent, integrate the renter SDK, understand the signed evidence bundle and read the limitations.",
    url: "/docs",
    images: ["/opengraph-image"],
  },
};

const sections = [
  { id: "overview", label: "Overview and quick start" },
  { id: "host-agent", label: "Host agent" },
  { id: "renter-sdk", label: "Renter SDK" },
  { id: "protocol", label: "Evidence protocol" },
  { id: "limitations", label: "Limitations" },
  { id: "reference", label: "Reference documents" },
];

const referenceDocuments = [
  {
    title: "Provider user guide",
    detail: "The end-to-end provider journey from host creation to bundle verification.",
    path: "docs/USER_GUIDE.md",
  },
  {
    title: "Host agent operator guide",
    detail: "Enrollment, configuration, spool/quota behaviour, collectors and shutdown handling.",
    path: "docs/HOST_AGENT.md",
  },
  {
    title: "Renter SDK integration guide",
    detail: "Invitation redemption, event behaviour, persistence, retry and data exclusions.",
    path: "docs/RENTER_SDK.md",
  },
  {
    title: "Protocol v1",
    detail: "Event envelope, canonicalization, source certificates, bundle format and assessment rules.",
    path: "docs/PROTOCOL.md",
  },
  {
    title: "Architecture",
    detail: "Components, trust boundaries, database, API, cryptography, security and deployment.",
    path: "ARCHITECTURE.md",
  },
  {
    title: "API reference",
    detail: "The implemented domain API routes and their request and response contracts.",
    path: "docs/API_REFERENCE.md",
  },
  {
    title: "Privacy and security model",
    detail: "Data classification, visibility, retention boundaries and cryptographic limitations.",
    path: "docs/PRIVACY_SECURITY.md",
  },
  {
    title: "Troubleshooting",
    detail: "Common setup, authentication, agent, worker and verification failures.",
    path: "docs/TROUBLESHOOTING.md",
  },
];

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-[4px] border border-iw-border bg-black/25">
      <div className="border-b border-iw-border px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-iw-faint">
        {label}
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="w-full max-w-full overflow-x-auto p-3 font-mono text-[10px] leading-5 text-iw-ink-soft"
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

function DocsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="iw-panel min-w-0 scroll-mt-6 p-5 sm:p-6"
    >
      <h2 id={`${id}-heading`} className="text-xl leading-tight text-iw-ink sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[11px] leading-6 text-iw-muted">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Documentation"
        title="Incident Witness documentation"
        description="What the protocol records, how to enroll a host and a renter client, how an evidence bundle is sealed and verified, and what the evidence cannot show. The repository documents remain the detailed source of truth."
      >
        <div className="flex flex-wrap gap-1.5">
          <span className="iw-chip iw-chip-neutral">Protocol v1</span>
          <span className="iw-chip iw-chip-neutral">Phase 8 documentation</span>
          <span className="iw-chip iw-chip-warning">Staging deployment</span>
        </div>
      </PageIntro>

      <section className="iw-notice iw-notice-warning flex-col gap-1.5" aria-labelledby="docs-status">
        <h2 id="docs-status" className="flex items-center gap-2 font-semibold">
          <Icon name="alert" size="sm" />
          Current deployment status
        </h2>
        <p className="text-[11px] leading-6">
          The signed evidence protocol, host agent, renter SDK, platform probe worker, deterministic
          correlator and sealed-bundle lifecycle are implemented. The provider workspace is
          connected to the staging API. No production API, worker, legal policy or support channel
          is live, and no production evidence service is claimed. Use test data only.
        </p>
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label="Documentation sections"
          className="iw-panel min-w-0 p-3 lg:sticky lg:top-4 lg:self-start"
        >
          <p className="px-1 pb-2 font-mono text-[8px] uppercase tracking-[0.12em] text-iw-faint">
            On this page
          </p>
          <ul className="space-y-0.5">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-[3px] px-2 py-1.5 text-[10px] font-medium text-iw-muted hover:bg-white/[0.04] hover:text-iw-ink"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <DocsSection id="overview" title="Overview and quick start">
            <p>
              Incident Witness records bounded, typed observations from three distinct source
              categories during one evidence session:
            </p>
            <ul className="space-y-2">
              <li>
                <strong className="text-iw-ink-soft">Provider host agent.</strong> Runs on the
                provider&apos;s Linux x86_64 machine and signs host heartbeats plus available GPU and
                UPS observations.
              </li>
              <li>
                <strong className="text-iw-ink-soft">Renter client.</strong> An incident-scoped SDK
                in the renter workload records heartbeats and endpoint observations. It does not
                collect workload content.
              </li>
              <li>
                <strong className="text-iw-ink-soft">Platform-operated probe.</strong> A separate
                worker checks the provider&apos;s verified HTTPS health endpoint. It is operated by
                the platform, not by an independent outside organisation.
              </li>
            </ul>
            <p>
              A session ends by being ended or reaching its bounded capture time, then sealed into a
              JSON bundle. The bundle carries source certificates, ordered events, a deterministic
              assessment and a signed manifest. Verification can run offline in a browser or with
              the CLI.
            </p>
            <h3 className="pt-2 text-sm font-semibold text-iw-ink">Provider quick start</h3>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Sign in at <Link href="/login" className="iw-link">/login</Link> with a Supabase
                magic link.
              </li>
              <li>
                Add a host at <Link href="/hosts/new" className="iw-link">/hosts/new</Link>, publish
                the one-time DNS TXT challenge and serve the fixed HTTPS health endpoint.
              </li>
              <li>
                Verify the endpoint, issue a single-use enrollment code (10 minutes) and enroll the
                host agent.
              </li>
              <li>
                Start a bounded session (2–240 minutes) and copy the session ID for the agent.
              </li>
              <li>
                Optionally issue a renter invitation (single use, 15 minutes) and integrate the
                renter SDK.
              </li>
              <li>
                End the session after the operating window. Seal it once the API reports at least
                one accepted event and no active probe lease.
              </li>
              <li>
                Download the sealed bundle and verify it at <Link href="/verify" className="iw-link">/verify</Link>{" "}
                or with the offline CLI.
              </li>
            </ol>
          </DocsSection>

          <DocsSection id="host-agent" title="Host agent installation and enrollment">
            <p>
              The host agent is built from this repository. There is no published binary, installer
              or systemd unit in the MVP. It targets Linux x86_64, Node.js 26.13.0 and an
              unprivileged OS user. Basic operation does not require root or sudo.
            </p>
            <h3 className="text-sm font-semibold text-iw-ink">Build</h3>
            <CodeBlock label="Linux x86_64 · from the repository root">{`npm ci
npm run build --workspace @incident-witness/protocol
npm run build --workspace @incident-witness/host-agent`}</CodeBlock>
            <p>
              The executable is <code className="font-mono text-[10px]">packages/host-agent/dist/cli.js</code>,
              linked as <code className="font-mono text-[10px]">iw-agent</code> in the workspace.
            </p>
            <h3 className="text-sm font-semibold text-iw-ink">Enroll</h3>
            <p>
              Issue an enrollment code in the host detail page, then run the command below. The
              agent prompts for the code with terminal echo disabled; the code is never accepted as
              an argument or environment variable.
            </p>
            <CodeBlock label="Enrollment">{`iw-agent enroll --api-url https://<incident-witness-api>
# Optional Network UPS Tools alias:
iw-agent enroll --api-url https://<incident-witness-api> --ups-device <alias>`}</CodeBlock>
            <h3 className="text-sm font-semibold text-iw-ink">Run a session</h3>
            <CodeBlock label="Evidence collection">{`iw-agent run --incident <incident-uuid>
# With a UPS alias:
iw-agent run --incident <incident-uuid> --ups-device <alias>
# Safe local status:
iw-agent status`}</CodeBlock>
            <p>
              Operational presence runs every 15 seconds even without an incident. Evidence
              heartbeats, GPU observations and UPS state transitions are queued only while an
              incident is supplied. The current API has no agent-side session discovery, so the
              operator must supply the incident ID explicitly.
            </p>
            <p>
              Configuration lives in <code className="font-mono text-[10px]">~/.config/incident-witness/</code>{" "}
              with a <code className="font-mono text-[10px]">0700</code> directory and{" "}
              <code className="font-mono text-[10px]">0600</code> key, credential, configuration and
              SQLite spool files. The private key never leaves the host. GPU collection covers
              device index 0 only; a missing collector is reported as unavailable, never as a normal
              reading.
            </p>
            <p>
              Full details:{" "}
              <a
                href={`${repositoryUrl}/blob/main/docs/HOST_AGENT.md`}
                className="iw-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/HOST_AGENT.md
              </a>
              .
            </p>
          </DocsSection>

          <DocsSection id="renter-sdk" title="Renter SDK integration">
            <p>
              The renter SDK contributes an incident-scoped workload perspective. It signs heartbeats
              and fixed endpoint observations. It intentionally excludes prompts, model inputs or
              outputs, datasets, file content, environment variables, workload stdout/stderr,
              credentials and arbitrary network destinations.
            </p>
            <CodeBlock label="Build">{`npm run build --workspace @incident-witness/renter-sdk`}</CodeBlock>
            <CodeBlock label="TypeScript integration">{`import { RenterClient } from "@incident-witness/renter-sdk";

const client = await RenterClient.enroll({
  apiBaseUrl: "https://<incident-witness-api>",
  invitationToken: invitationFromProvider,
  endpointHostname: providerHostnameFromInvitation,
  workloadRef: "job-123", // optional opaque reference, max 100 chars
  stateDir: "/run/incident-witness-renter", // optional secure persistence
});

client.start();

// ... workload runs ...

await client.stop();`}</CodeBlock>
            <p>
              Invitations are single use and expire after 15 minutes.{" "}
              <code className="font-mono text-[10px]">endpointHostname</code> is required because the
              enrollment response does not return it; the integrator takes it from the provider
              invitation context. Only HTTPS port 443 and the fixed path{" "}
              <code className="font-mono text-[10px]">/.well-known/incident-witness/health</code> are
              checked.
            </p>
            <p>
              Without <code className="font-mono text-[10px]">stateDir</code>, keys and queued events
              live only in process memory. With it, the directory is{" "}
              <code className="font-mono text-[10px]">0700</code> and the state file is{" "}
              <code className="font-mono text-[10px]">0600</code>; treat it as secret material.
              Queued events are bounded to 5 MiB, transient failures retry with backoff and dropped
              events are reported rather than hidden.
            </p>
            <p>
              Full details:{" "}
              <a
                href={`${repositoryUrl}/blob/main/docs/RENTER_SDK.md`}
                className="iw-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/RENTER_SDK.md
              </a>
              .
            </p>
          </DocsSection>

          <DocsSection id="protocol" title="Evidence protocol and offline verification">
            <h3 className="text-sm font-semibold text-iw-ink">Signed event envelope</h3>
            <p>
              Each event is a typed JSON object with a strict schema, protocol version, event and
              incident IDs, source key and source type, monotonic sequence, observation time,
              canonicalization and signature algorithm, payload and Ed25519 signature. Unknown
              fields are rejected.
            </p>
            <p>
              Signing uses RFC 8785 JSON Canonicalization Scheme with the pinned{" "}
              <code className="font-mono text-[10px]">canonicalize@5.1.0</code> implementation,
              SHA-256 and Ed25519. Ingestion requires the complete request body to be exact
              canonical UTF-8 bytes. The API verifies the source key scope and status, the signature,
              the sequence and the capture window before appending.
            </p>
            <p>
              Bounds: payload ≤ 2 KiB, ingestion request ≤ 8 KiB, 4,000 accepted events and 7 MiB of
              aggregate event-entry bytes per incident, and a complete bundle ≤ 10 MiB.
            </p>
            <h3 className="text-sm font-semibold text-iw-ink">Certificate, manifest and signature</h3>
            <p>
              The platform signs a registration certificate for each source key. The sealed bundle
              contains the incident metadata, ordered events with server receipt times, source public
              keys and certificates, event digests, gap notices, simulation markers, a deterministic
              assessment and the platform key ID, manifest digest and platform Ed25519 signature.
            </p>
            <p>
              A verifier trusts only a platform public key pinned in its own release. A key included
              inside a bundle is not trusted merely because the file contains it.
            </p>
            <h3 className="text-sm font-semibold text-iw-ink">Verify locally</h3>
            <p>
              The <Link href="/verify" className="iw-link">/verify</Link> page reads the selected JSON
              file with the browser File API and performs every check locally. It does not upload the
              bundle or call the API. The CLI runs the same protocol package without any network
              request:
            </p>
            <CodeBlock label="Offline CLI verification">{`npm run build --workspace @incident-witness/cli-verifier
node tools/iw-verify/dist/cli.js path/to/incident-witness-bundle.json

# Equivalent workspace command:
npm run verify -- path/to/incident-witness-bundle.json`}</CodeBlock>
            <p>
              Checks cover bundle/protocol schema versions, manifest SHA-256, the pinned platform
              key and signature, source certificates and fingerprints, every event signature and
              digest, sequence uniqueness and deterministic order, capture-window bounds and bundle
              consistency.
            </p>
            <ul className="space-y-1.5">
              <li>
                <strong className="text-iw-ink-soft">Exit 0</strong> — every listed check passed.
              </li>
              <li>
                <strong className="text-iw-ink-soft">Exit 1</strong> — the bundle is invalid or was
                modified.
              </li>
              <li>
                <strong className="text-iw-ink-soft">Exit 2</strong> — the file is missing,
                unreadable or unparseable, or the trust set cannot be loaded.
              </li>
            </ul>
            <h3 className="text-sm font-semibold text-iw-ink">Deterministic assessment</h3>
            <p>
              Rule version <code className="font-mono text-[10px]">iw-rules-v1</code> produces{" "}
              <code className="font-mono text-[10px]">POWER_RELATED</code>,{" "}
              <code className="font-mono text-[10px]">EXTERNAL_REACHABILITY_LOSS</code>,{" "}
              <code className="font-mono text-[10px]">HOST_OR_WORKLOAD_EXIT</code> or{" "}
              <code className="font-mono text-[10px]">UNKNOWN</code>. Evidence grades HIGH, MEDIUM,
              LOW and INSUFFICIENT describe completeness under the named rule, not probability.
              Simulated or demo evidence is labelled and capped at LOW. There is no LLM and no
              probability score.
            </p>
            <p>
              Protocol detail:{" "}
              <a
                href={`${repositoryUrl}/blob/main/docs/PROTOCOL.md`}
                className="iw-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/PROTOCOL.md
              </a>
              .
            </p>
          </DocsSection>

          <DocsSection id="limitations" title="Limitations — what the evidence can and cannot show">
            <ul className="space-y-2">
              <li>
                A valid signature establishes integrity and provenance from a key. It does not prove
                that a sensor reading was true, that a host was uncompromised or that a physical
                cause is proven.
              </li>
              <li>
                The platform-operated probe is a separate process operated by the same platform. It
                is not an independent third party. Renter endpoint observations can be affected by
                the renter&apos;s own network.
              </li>
              <li>
                Missing UPS, GPU, renter or probe observations are represented as unavailable or as
                gaps. They are never treated as normal or healthy.
              </li>
              <li>
                Capture is bounded and starts at session creation. Events before the session are not
                reconstructed. A 24-hour ingestion grace period permits delayed upload of in-window
                observations; it does not extend the capture window.
              </li>
              <li>
                Assessment wording describes an evidence pattern consistent with an observation. It
                is not a root-cause finding, an outage adjudication, a reliability-score change or a
                marketplace decision.
              </li>
              <li>
                The host agent currently collects GPU index 0 only and is not shipped as a signed
                installer. The renter SDK is not published as a signed package. A pinned platform
                certificate key in the agent and SDK is not yet implemented; they rely on the
                configured HTTPS API and TLS.
              </li>
              <li>
                This deployment is a staging workspace. Legal terms, a privacy policy, a support
                channel and a production service are not live.
              </li>
            </ul>
          </DocsSection>

          <DocsSection id="reference" title="Reference documents">
            <p>
              These repository documents contain the full contracts, setup details and operational
              procedures behind this page.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {referenceDocuments.map((document) => (
                <a
                  key={document.path}
                  href={`${repositoryUrl}/blob/main/${document.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[4px] border border-iw-border bg-white/[0.025] p-3 transition-colors hover:border-iw-border-strong hover:bg-white/[0.045]"
                >
                  <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-iw-ink">
                    {document.title}
                    <Icon name="arrow-up-right" size="sm" />
                  </span>
                  <span className="mt-1 block text-[10px] leading-5 text-iw-muted">
                    {document.detail}
                  </span>
                </a>
              ))}
            </div>
            <p className="pt-1">
              Browse the complete{" "}
              <a
                href={`${repositoryUrl}/tree/main/docs`}
                className="iw-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs directory
              </a>
              , or read the{" "}
              <a
                href={`${repositoryUrl}/blob/main/README.md`}
                className="iw-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                repository README
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-4 border-t border-iw-border pt-3 text-[10px] font-medium">
              <Link href="/verify" className="iw-link">
                Verify a bundle
              </Link>
              <Link href="/privacy" className="iw-link">
                Privacy status
              </Link>
              <Link href="/terms" className="iw-link">
                Terms status
              </Link>
            </div>
          </DocsSection>
        </div>
      </div>
    </div>
  );
}
