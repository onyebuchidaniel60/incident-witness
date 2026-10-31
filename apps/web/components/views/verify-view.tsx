"use client";

import { useState, type ChangeEvent } from "react";

import { InlineNotice, LoadingState, StatusPill } from "@/components/async-state";
import { Icon } from "@/components/ui/icon";
import { assessmentText } from "@/lib/format";
import {
  verifyBundleInBrowser,
  type BrowserVerificationReport,
  type BrowserVerificationCheck,
} from "@/lib/verify/browser-verify";

const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;

function marker(status: BrowserVerificationCheck["status"]): string {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  return "SKIP";
}

export function VerifyView() {
  const [filename, setFilename] = useState<string | null>(null);
  const [report, setReport] = useState<BrowserVerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setReport(null);
    setError(null);
    setFilename(file?.name ?? null);
    if (!file) return;

    if (file.size > MAX_BUNDLE_BYTES) {
      setError("The selected file is larger than the 10 MiB bundle limit.");
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError("The selected file is not valid JSON. The bundle was not uploaded or repaired.");
        return;
      }
      setReport(await verifyBundleInBrowser(parsed));
    } catch {
      setError("The bundle could not be verified in this browser.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setFilename(null);
    setReport(null);
    setError(null);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="iw-panel" aria-labelledby="bundle-select">
        <div className="iw-panel-header">
          <div>
            <h2 id="bundle-select" className="text-sm font-semibold text-iw-ink">
              1 · Select a bundle
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">Sealed JSON · maximum 10 MiB</p>
          </div>
          <span className="iw-chip iw-chip-neutral">Local file</span>
        </div>
        <div className="iw-panel-body">
          <div className="rounded-[4px] border border-dashed border-iw-border-strong bg-white/[0.02] p-5 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-[4px] border border-iw-green/35 bg-iw-green/10 text-iw-green-bright">
              <Icon name="file" size="lg" />
            </span>
            <label
              htmlFor="bundle-file"
              className="mt-3 block text-sm font-semibold text-iw-ink"
            >
              Evidence bundle JSON
            </label>
            <p className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-iw-muted">
              The file is processed entirely in this browser tab. It is not uploaded to the API or
              any other server. Maximum size: 10 MiB.
            </p>
            <input
              id="bundle-file"
              name="bundle-file"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void selectFile(event)}
              disabled={busy}
              className="iw-file-input mt-4"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px]">
            {filename ? (
              <span className="iw-chip iw-chip-neutral max-w-full break-all">{filename}</span>
            ) : null}
            {filename ? (
              <button type="button" onClick={clear} disabled={busy} className="iw-btn iw-btn-ghost iw-btn-sm">
                Clear result
              </button>
            ) : null}
          </div>

          <div className="mt-3">
            <InlineNotice tone="neutral" title="Local file privacy" icon="shield">
              <p>
                This verifier uses the shared protocol schemas, canonical JSON and Ed25519
                public-key verification from{" "}
                <code className="font-mono text-[10px]">@incident-witness/protocol</code>. No
                private signing key is present in browser code. No network request is made with the
                bundle.
              </p>
            </InlineNotice>
          </div>
        </div>
      </section>

      <section className="iw-panel" aria-labelledby="verification-result">
        <div className="iw-panel-header">
          <div>
            <h2 id="verification-result" className="text-sm font-semibold text-iw-ink">
              2 · Read the result
            </h2>
            <p className="mt-1 text-[10px] text-iw-faint">Check-by-check integrity report</p>
          </div>
          {report ? (
            <StatusPill label={report.valid ? "VALID" : "INVALID"} tone={report.valid ? "success" : "danger"} />
          ) : (
            <span className="iw-chip iw-chip-neutral">Awaiting file</span>
          )}
        </div>
        <div className="iw-panel-body">
          {busy ? <LoadingState label="Verifying bundle locally…" /> : null}
          {error ? (
            <InlineNotice tone="danger" title="Verification could not complete">
              <p role="alert">{error}</p>
            </InlineNotice>
          ) : null}

          {!report && !busy && !error ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-[4px] border border-dashed border-iw-border bg-white/[0.015] px-5 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-iw-border-strong text-iw-faint">
                <Icon name="shield" />
              </span>
              <p className="mt-3 text-xs font-medium text-iw-ink-soft">No bundle selected</p>
              <p className="mt-1 max-w-xs text-[10px] leading-5 text-iw-faint">
                Verification runs locally. A valid result confirms integrity and signatures against
                pinned keys, not sensor truth or physical cause.
              </p>
            </div>
          ) : null}

          {report ? (
            <div className="space-y-4">
              <div
                className={`iw-notice ${
                  report.valid ? "iw-notice-success" : "iw-notice-danger"
                } flex-col gap-1.5`}
              >
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name={report.valid ? "check" : "x"} size="sm" />
                  {report.valid ? "Bundle integrity and listed signatures verified." : "One or more integrity or signature checks failed. The bundle was not repaired."}
                </p>
                <p className="text-[10px]">
                  {report.valid
                    ? "A valid result means the listed cryptographic checks passed, not that a physical cause is proven."
                    : "Do not rely on this bundle until the failed checks are understood."}
                </p>
              </div>

              {report.simulationPresent ? (
                <StatusPill label="Simulation present" tone="warning" />
              ) : null}

              <dl className="grid gap-2 text-[10px] text-iw-muted sm:grid-cols-2">
                <div className="rounded-[4px] border border-iw-border bg-white/[0.02] p-2.5">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-iw-faint">Bundle version</dt>
                  <dd className="mt-1 font-mono text-iw-ink-soft">{report.bundleVersion ?? "unknown"}</dd>
                </div>
                <div className="rounded-[4px] border border-iw-border bg-white/[0.02] p-2.5">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-iw-faint">Protocol / schema</dt>
                  <dd className="mt-1 font-mono text-iw-ink-soft">
                    {report.protocolVersion ?? "unknown"} / {report.schemaVersion ?? "unknown"}
                  </dd>
                </div>
                <div className="rounded-[4px] border border-iw-border bg-white/[0.02] p-2.5">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-iw-faint">Incident</dt>
                  <dd className="mt-1 break-all font-mono text-iw-ink-soft">{report.incidentId ?? "unknown"}</dd>
                </div>
                <div className="rounded-[4px] border border-iw-border bg-white/[0.02] p-2.5">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-iw-faint">Platform key</dt>
                  <dd className="mt-1 break-all font-mono text-iw-ink-soft">{report.platformKeyId ?? "unknown"}</dd>
                  {report.platformKeyFingerprint ? (
                    <dd className="mt-1 break-all font-mono text-[8px] text-iw-faint">
                      {report.platformKeyFingerprint}
                    </dd>
                  ) : null}
                </div>
                <div className="rounded-[4px] border border-iw-border bg-white/[0.02] p-2.5">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-iw-faint">Events / certificates</dt>
                  <dd className="mt-1 font-mono text-iw-ink-soft">
                    {report.eventCount} / {report.sourceCertificateCount}
                  </dd>
                </div>
                <div className="rounded-[4px] border border-iw-border bg-white/[0.02] p-2.5">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-iw-faint">Assessment</dt>
                  <dd className="mt-1 font-mono text-iw-ink-soft">
                    {report.assessmentCode ?? "UNKNOWN"} · {report.evidenceGrade ?? "INSUFFICIENT"}
                  </dd>
                </div>
              </dl>

              <p className="text-[10px] leading-5 text-iw-muted">
                {assessmentText(report.assessmentCode)}
              </p>

              <div className="overflow-hidden rounded-[4px] border border-iw-border">
                <table className="iw-table">
                  <thead>
                    <tr>
                      <th scope="col">Result</th>
                      <th scope="col">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.checks.map((check) => (
                      <tr key={check.id}>
                        <td className="w-20 font-mono text-[9px] font-semibold">
                          <span
                            className={
                              check.status === "pass"
                                ? "text-iw-green"
                                : check.status === "fail"
                                  ? "text-iw-red"
                                  : "text-iw-yellow"
                            }
                          >
                            {marker(check.status)}
                          </span>
                        </td>
                        <td className="text-[10px]">
                          {check.label}
                          {check.detail ? (
                            <span className="mt-1 block break-words text-[9px] text-iw-faint">
                              {check.detail}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <InlineNotice tone="warning" title="What this result means">
                <p>{report.limitations}</p>
                <p className="mt-2">
                  A signature verifies integrity and provenance from a key. It does not prove that a
                  sensor reading was true, that a key was uncompromised, or that the assessment is a
                  physical root cause.
                </p>
              </InlineNotice>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
