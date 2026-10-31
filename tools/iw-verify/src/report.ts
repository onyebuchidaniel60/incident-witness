import { LIMITATIONS, type BundleVerificationReport, type CheckStatus } from "./verify.js";

function marker(status: CheckStatus): string {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  return "SKIP";
}

function booleanLabel(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "yes (labelled synthetic/demo)" : "no";
}

export function formatReport(report: BundleVerificationReport, filePath: string): string {
  const lines: string[] = [];
  lines.push("Incident Witness — offline evidence bundle verification");
  lines.push(`File: ${filePath}`);
  lines.push(
    `Bundle version: ${report.bundleVersion ?? "unknown"} | protocol/schema: ${
      report.protocolVersion ?? "unknown"
    }/${report.schemaVersion ?? "unknown"}`,
  );
  lines.push(`Incident: ${report.incidentId ?? "unknown"}`);
  lines.push(`Platform key: ${report.platformKeyId ?? "unknown"}`);
  if (report.platformKeyFingerprint) {
    lines.push(`Pinned key fingerprint: ${report.platformKeyFingerprint}`);
  }
  lines.push(
    `Events: ${report.eventCount} | Source certificates: ${report.sourceCertificateCount} | Simulation present: ${booleanLabel(
      report.simulationPresent,
    )}`,
  );
  if (report.assessmentCode || report.evidenceGrade) {
    lines.push(
      `Assessment: ${report.assessmentCode ?? "unknown"} / evidence grade ${
        report.evidenceGrade ?? "unknown"
      }`,
    );
  }
  lines.push("");
  lines.push("Checks:");

  for (const check of report.checks) {
    const detail = check.detail ? ` — ${check.detail}` : "";
    lines.push(`[${marker(check.status)}] ${check.label}${detail}`);
  }

  const failures = report.checks.filter((check) => check.status === "fail").length;
  lines.push("");
  if (report.valid) {
    lines.push("Result: VALID — bundle integrity and listed signatures verified.");
  } else {
    lines.push(
      `Result: INVALID — ${failures} check${failures === 1 ? "" : "s"} failed. The bundle was not repaired or uploaded.`,
    );
  }
  lines.push("");
  lines.push(`Limitations: ${LIMITATIONS}`);
  lines.push("No network request was made.");
  return `${lines.join("\n")}\n`;
}
