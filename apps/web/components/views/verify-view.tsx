"use client";

import { useState, type ChangeEvent } from "react";

import { InlineNotice, LoadingState, StatusPill } from "@/components/async-state";
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
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <label htmlFor="bundle-file" className="block text-sm font-medium text-slate-800">
          Evidence bundle JSON
        </label>
        <input
          id="bundle-file"
          name="bundle-file"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void selectFile(event)}
          disabled={busy}
          className="mt-2 block w-full text-sm text-slate-800 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
        />
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The file is processed entirely in this browser tab. It is not uploaded to the API or any
          other server. Maximum size: 10 MiB.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {filename ? <span className="text-slate-700">Selected: {filename}</span> : null}
          {filename ? (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-900 hover:bg-slate-100 disabled:bg-slate-100"
            >
              Clear result
            </button>
          ) : null}
        </div>
      </div>

      <InlineNotice tone="neutral" title="Local file privacy">
        <p>
          This verifier uses the shared protocol schemas, canonical JSON and Ed25519 public-key
          verification from <code className="font-mono text-xs">@incident-witness/protocol</code>.
          No private signing key is present in browser code. No network request is made with the
          bundle.
        </p>
      </InlineNotice>

      {busy ? <LoadingState label="Verifying bundle locally…" /> : null}
      {error ? (
        <InlineNotice tone="danger" title="Verification could not complete">
          <p role="alert">{error}</p>
        </InlineNotice>
      ) : null}

      {report ? (
        <section aria-labelledby="verification-result" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="verification-result" className="text-lg font-semibold text-slate-950">
              Verification result
            </h2>
            <StatusPill
              label={report.valid ? "VALID" : "INVALID"}
              tone={report.valid ? "success" : "danger"}
            />
            {report.simulationPresent ? (
              <StatusPill label="Simulation present" tone="warning" />
            ) : null}
          </div>

          <p className="text-sm leading-6 text-slate-700">
            {report.valid
              ? "Bundle integrity and listed signatures verified."
              : "One or more integrity or signature checks failed. The bundle was not repaired."}
          </p>
          <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-600">Bundle version</dt>
              <dd>{report.bundleVersion ?? "unknown"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600">Protocol / schema</dt>
              <dd>
                {report.protocolVersion ?? "unknown"} / {report.schemaVersion ?? "unknown"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600">Incident</dt>
              <dd className="break-all">{report.incidentId ?? "unknown"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600">Platform key</dt>
              <dd className="break-all">{report.platformKeyId ?? "unknown"}</dd>
              {report.platformKeyFingerprint ? (
                <dd className="break-all font-mono text-xs text-slate-600">
                  {report.platformKeyFingerprint}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="font-medium text-slate-600">Events / certificates</dt>
              <dd>
                {report.eventCount} / {report.sourceCertificateCount}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600">Assessment</dt>
              <dd>
                {report.assessmentCode ?? "UNKNOWN"} · grade{" "}
                {report.evidenceGrade ?? "INSUFFICIENT"}
              </dd>
            </div>
          </dl>

          <p className="text-sm leading-6 text-slate-700">
            {assessmentText(report.assessmentCode)}
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Result
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Check
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {report.checks.map((check) => (
                  <tr key={check.id}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      {marker(check.status)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {check.label}
                      {check.detail ? (
                        <span className="mt-1 block break-words text-xs text-slate-600">
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
        </section>
      ) : null}
    </div>
  );
}
