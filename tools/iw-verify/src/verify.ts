import { createPublicKey, verify as verifySignature } from "node:crypto";

import {
  base64UrlToBytes,
  bundleSchema,
  canonicalJsonBytes,
  type Bundle,
  type BundleManifest,
  type SignedSourceKeyCertificate,
} from "@incident-witness/protocol";
import { sha256Base64Url } from "@incident-witness/protocol/node";

import type { TrustedPlatformKey, TrustSet } from "./trust.js";

export const LIMITATIONS =
  "Verification confirms integrity and signatures relative to trusted keys. It does not prove that sensors were accurate, keys were uncompromised, or the inferred cause is true.";

export type CheckStatus = "pass" | "fail" | "skip";

export type VerificationCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
};

export type BundleVerificationReport = {
  valid: boolean;
  checks: VerificationCheck[];
  bundleVersion: string | null;
  protocolVersion: string | null;
  schemaVersion: string | null;
  incidentId: string | null;
  platformKeyId: string | null;
  platformKeyFingerprint: string | null;
  eventCount: number;
  sourceCertificateCount: number;
  simulationPresent: boolean | null;
  assessmentCode: string | null;
  evidenceGrade: string | null;
  limitations: string;
};

type RawBundle = {
  bundleVersion: string | null;
  protocolVersion: string | null;
  schemaVersion: string | null;
  incidentId: string | null;
  platformKeyId: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(source: Record<string, unknown>, name: string): string | null {
  const value = source[name];
  return typeof value === "string" ? value : null;
}

function rawBundle(value: unknown): RawBundle {
  const root = record(value);
  const manifest = root ? record(root.manifest) : null;
  return {
    bundleVersion: root ? stringField(root, "bundle_version") : null,
    protocolVersion: manifest ? stringField(manifest, "protocol_version") : null,
    schemaVersion: manifest ? stringField(manifest, "schema_version") : null,
    incidentId: manifest ? stringField(manifest, "incident_id") : null,
    platformKeyId: manifest ? stringField(manifest, "platform_key_id") : null,
  };
}

function push(
  checks: VerificationCheck[],
  id: string,
  label: string,
  status: CheckStatus,
  detail?: string,
): void {
  checks.push({ id, label, status, ...(detail ? { detail } : {}) });
}

function failDetails(failures: string[], limit = 8): string {
  const shown = failures.slice(0, limit);
  const remaining = failures.length - shown.length;
  return `${shown.join("; ")}${remaining > 0 ? `; and ${remaining} more` : ""}`;
}

function trustedKeyFor(trust: TrustSet, platformKeyId: string): TrustedPlatformKey | null {
  return trust.keys.get(platformKeyId) ?? null;
}

function publicKeyObject(publicKey: string) {
  const raw = base64UrlToBytes(publicKey);
  if (raw.length !== 32) throw new Error("Ed25519 public key must decode to 32 bytes");
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw)]),
    format: "der",
    type: "spki",
  });
}

function signatureValid(payload: Uint8Array, signature: string, publicKey: string): boolean {
  try {
    return verifySignature(
      null,
      Buffer.from(payload),
      publicKeyObject(publicKey),
      Buffer.from(base64UrlToBytes(signature)),
    );
  } catch {
    return false;
  }
}

function certificateFingerprint(certificate: SignedSourceKeyCertificate): string {
  return sha256Base64Url(base64UrlToBytes(certificate.certificate.public_key));
}

function certificateScopeValid(
  certificate: SignedSourceKeyCertificate,
  manifest: BundleManifest,
  eventSourceTypes: Map<string, Set<string>>,
): string | null {
  const cert = certificate.certificate;
  const expectedTypes = eventSourceTypes.get(cert.source_key_id);
  if (!expectedTypes || expectedTypes.size === 0) {
    return `${cert.source_key_id} has no matching event`;
  }
  if (expectedTypes.size !== 1 || !expectedTypes.has(cert.source_type)) {
    return `${cert.source_key_id} certificate source type does not match its events`;
  }
  if (cert.source_type === "renter_client" && cert.incident_id !== manifest.incident_id) {
    return `${cert.source_key_id} renter certificate is scoped to another incident`;
  }
  return null;
}

export function verifyBundle(bundleValue: unknown, trust: TrustSet): BundleVerificationReport {
  const checks: VerificationCheck[] = [];
  const raw = rawBundle(bundleValue);
  const reportBase = {
    bundleVersion: raw.bundleVersion,
    protocolVersion: raw.protocolVersion,
    schemaVersion: raw.schemaVersion,
    incidentId: raw.incidentId,
    platformKeyId: raw.platformKeyId,
    eventCount: 0,
    sourceCertificateCount: 0,
    simulationPresent: null,
    assessmentCode: null,
    evidenceGrade: null,
    limitations: LIMITATIONS,
  } satisfies Omit<BundleVerificationReport, "valid" | "checks" | "platformKeyFingerprint">;

  if (raw.bundleVersion !== "1.0") {
    push(
      checks,
      "bundle_version",
      "Bundle version is supported",
      "fail",
      raw.bundleVersion
        ? `Unsupported bundle_version "${raw.bundleVersion}"; this verifier supports 1.0 only`
        : "bundle_version is missing",
    );
  } else {
    push(checks, "bundle_version", "Bundle version is supported", "pass", "bundle_version 1.0");
  }

  if (raw.protocolVersion !== "1.0" || raw.schemaVersion !== "1.0") {
    push(
      checks,
      "protocol_version",
      "Protocol and schema versions are supported",
      "fail",
      `protocol_version=${raw.protocolVersion ?? "missing"}, schema_version=${
        raw.schemaVersion ?? "missing"
      }; this verifier supports 1.0 only`,
    );
  } else {
    push(
      checks,
      "protocol_version",
      "Protocol and schema versions are supported",
      "pass",
      "protocol_version 1.0, schema_version 1.0",
    );
  }

  const parsed = bundleSchema.safeParse(bundleValue);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    push(checks, "schema", "Bundle JSON schema and strict field validation", "fail", issues);
    return {
      ...reportBase,
      valid: false,
      checks,
      platformKeyFingerprint: null,
    };
  }

  const bundle: Bundle = parsed.data;
  const manifest = bundle.manifest;
  const trustedKey = trustedKeyFor(trust, manifest.platform_key_id);
  const report: BundleVerificationReport = {
    ...reportBase,
    bundleVersion: bundle.bundle_version,
    protocolVersion: manifest.protocol_version,
    schemaVersion: manifest.schema_version,
    incidentId: manifest.incident_id,
    platformKeyId: manifest.platform_key_id,
    platformKeyFingerprint: trustedKey?.fingerprint ?? null,
    eventCount: manifest.events.length,
    sourceCertificateCount: manifest.source_certificates.length,
    simulationPresent: manifest.simulation_present,
    assessmentCode: manifest.assessment.code,
    evidenceGrade: manifest.assessment.evidence_grade,
    valid: false,
    checks,
  };

  push(checks, "schema", "Bundle JSON schema and strict field validation", "pass");

  if (!trustedKey) {
    push(
      checks,
      "platform_key_trusted",
      "Platform key is pinned and trusted",
      "fail",
      `Platform key "${manifest.platform_key_id}" is not present in the pinned trust set`,
    );
  } else if (trustedKey.status === "revoked") {
    push(
      checks,
      "platform_key_trusted",
      "Platform key is pinned and trusted",
      "fail",
      `Platform key "${manifest.platform_key_id}" is marked revoked in the pinned trust set`,
    );
  } else {
    push(
      checks,
      "platform_key_trusted",
      "Platform key is pinned and trusted",
      "pass",
      `${trustedKey.platformKeyId} (${trustedKey.status}) fingerprint ${trustedKey.fingerprint}`,
    );
  }

  const manifestCanonical = canonicalJsonBytes(manifest);
  const computedManifestDigest = sha256Base64Url(manifestCanonical);
  const manifestDigestValid = computedManifestDigest === bundle.manifest_sha256;
  push(
    checks,
    "manifest_digest",
    "Manifest SHA-256 digest",
    manifestDigestValid ? "pass" : "fail",
    manifestDigestValid
      ? computedManifestDigest
      : `expected ${bundle.manifest_sha256}, computed ${computedManifestDigest}`,
  );

  let platformSignatureValid = false;
  if (trustedKey && trustedKey.status !== "revoked") {
    platformSignatureValid = signatureValid(
      manifestCanonical,
      bundle.platform_signature,
      trustedKey.publicKey,
    );
    push(
      checks,
      "platform_signature",
      "Platform Ed25519 manifest signature",
      platformSignatureValid ? "pass" : "fail",
      platformSignatureValid ? undefined : "Signature does not verify with the pinned platform key",
    );
  } else {
    push(
      checks,
      "platform_signature",
      "Platform Ed25519 manifest signature",
      "skip",
      "No usable pinned platform key",
    );
  }

  const eventSourceTypes = new Map<string, Set<string>>();
  for (const entry of manifest.events) {
    const types = eventSourceTypes.get(entry.event.source_key_id) ?? new Set<string>();
    types.add(entry.event.source_type);
    eventSourceTypes.set(entry.event.source_key_id, types);
  }

  const certificatesById = new Map<string, SignedSourceKeyCertificate>();
  const certificateFailures: string[] = [];
  for (const certificate of manifest.source_certificates) {
    const cert = certificate.certificate;
    if (certificatesById.has(cert.source_key_id)) {
      certificateFailures.push(`${cert.source_key_id}: duplicate certificate`);
      continue;
    }
    certificatesById.set(cert.source_key_id, certificate);

    if (certificateFingerprint(certificate) !== cert.fingerprint) {
      certificateFailures.push(`${cert.source_key_id}: fingerprint does not match public key`);
    }

    if (!trustedKey || trustedKey.status === "revoked") {
      certificateFailures.push(`${cert.source_key_id}: no usable pinned platform key`);
      continue;
    }

    if (!signatureValid(canonicalJsonBytes(cert), certificate.signature, trustedKey.publicKey)) {
      certificateFailures.push(`${cert.source_key_id}: certificate signature is invalid`);
    }

    const scopeError = certificateScopeValid(certificate, manifest, eventSourceTypes);
    if (scopeError) certificateFailures.push(scopeError);
  }
  push(
    checks,
    "source_certificates",
    `Source registration certificates (${manifest.source_certificates.length})`,
    certificateFailures.length === 0 ? "pass" : "fail",
    certificateFailures.length === 0 ? undefined : failDetails(certificateFailures),
  );

  const eventFailures: string[] = [];
  const eventDigestFailures: string[] = [];
  let simulatedEvents = 0;
  const captureStart = Date.parse(manifest.capture_started_at);
  const captureEnd = Date.parse(manifest.capture_ends_at);
  const sealedAt = Date.parse(manifest.sealed_at);

  for (const entry of manifest.events) {
    const event = entry.event;
    const certificate = certificatesById.get(event.source_key_id);
    if (!certificate) {
      eventFailures.push(`${event.event_id}: no source certificate`);
      continue;
    }
    if (certificate.certificate.source_type !== event.source_type) {
      eventFailures.push(`${event.event_id}: certificate source type mismatch`);
    }
    if (event.incident_id !== manifest.incident_id) {
      eventFailures.push(`${event.event_id}: event belongs to another incident`);
    }
    if (event.protocol_version !== manifest.protocol_version) {
      eventFailures.push(`${event.event_id}: event protocol version mismatch`);
    }
    if (event.simulation_mode) simulatedEvents += 1;

    const observedAt = Date.parse(event.observed_at);
    if (!(observedAt >= captureStart && observedAt <= captureEnd)) {
      eventFailures.push(`${event.event_id}: observed_at is outside the capture window`);
    }
    const receivedAt = Date.parse(entry.received_at);
    if (!(receivedAt <= sealedAt)) {
      eventFailures.push(`${event.event_id}: received_at is after sealed_at`);
    }

    const { signature, ...body } = event;
    const bodyCanonical = canonicalJsonBytes(body);
    const bodyDigest = sha256Base64Url(bodyCanonical);
    if (bodyDigest !== entry.event_sha256) {
      eventDigestFailures.push(
        `${event.event_id}: expected ${entry.event_sha256}, computed ${bodyDigest}`,
      );
    }

    if (!signatureValid(bodyCanonical, signature, certificate.certificate.public_key)) {
      eventFailures.push(`${event.event_id}: Ed25519 signature is invalid`);
    }
  }

  push(
    checks,
    "source_event_signatures",
    `Source event signatures (${manifest.events.length})`,
    eventFailures.length === 0 ? "pass" : "fail",
    eventFailures.length === 0 ? undefined : failDetails(eventFailures),
  );
  push(
    checks,
    "event_digests",
    `Event SHA-256 digests (${manifest.events.length})`,
    eventDigestFailures.length === 0 ? "pass" : "fail",
    eventDigestFailures.length === 0 ? undefined : failDetails(eventDigestFailures),
  );

  const sequenceFailures: string[] = [];
  const eventIds = new Set<string>();
  const sequenceKeys = new Set<string>();
  const sourceKeys = new Set<string>();
  for (const entry of manifest.events) {
    const event = entry.event;
    sourceKeys.add(event.source_key_id);
    if (eventIds.has(event.event_id)) {
      sequenceFailures.push(`${event.event_id}: duplicate event_id`);
    }
    eventIds.add(event.event_id);

    const sequenceKey = `${event.source_key_id}:${event.sequence}`;
    if (sequenceKeys.has(sequenceKey)) {
      sequenceFailures.push(`${event.event_id}: duplicate source sequence ${event.sequence}`);
    }
    sequenceKeys.add(sequenceKey);
  }

  const ordered = [...manifest.events].sort((left, right) => {
    const leftTime = Date.parse(left.event.observed_at);
    const rightTime = Date.parse(right.event.observed_at);
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.event.source_type !== right.event.source_type) {
      return left.event.source_type < right.event.source_type ? -1 : 1;
    }
    if (left.event.source_key_id !== right.event.source_key_id) {
      return left.event.source_key_id < right.event.source_key_id ? -1 : 1;
    }
    if (left.event.sequence !== right.event.sequence) {
      return left.event.sequence - right.event.sequence;
    }
    return left.event.event_id < right.event.event_id ? -1 : 1;
  });
  const orderingMatches = manifest.events.every(
    (entry, index) => entry.event.event_id === ordered[index]?.event.event_id,
  );
  if (!orderingMatches) {
    sequenceFailures.push(
      "Events are not in deterministic observed_at/source_type/source_key_id/sequence/event_id order",
    );
  }
  push(
    checks,
    "event_sequence_order",
    "Event sequence uniqueness and deterministic ordering",
    sequenceFailures.length === 0 ? "pass" : "fail",
    sequenceFailures.length === 0
      ? `${manifest.events.length} events, ${sourceKeys.size} source keys`
      : failDetails(sequenceFailures),
  );

  const consistencyFailures: string[] = [];
  if (manifest.events.length === 0) consistencyFailures.push("bundle contains no evidence events");
  if (!(captureStart <= captureEnd)) {
    consistencyFailures.push("capture_started_at is after capture_ends_at");
  }
  if (simulatedEvents > 0 && !manifest.simulation_present) {
    consistencyFailures.push("events are marked simulation_mode but simulation_present is false");
  }

  const gapSourceKeys = new Set<string>();
  for (const gap of manifest.gaps) {
    gapSourceKeys.add(gap.source_key_id);
    if (!(Date.parse(gap.missing_started_at) <= Date.parse(gap.missing_ended_at))) {
      consistencyFailures.push("a gap has missing_started_at after missing_ended_at");
    }
    if (!certificatesById.has(gap.source_key_id)) {
      consistencyFailures.push(`gap references uncertified source ${gap.source_key_id}`);
    }
  }

  for (const [sourceKeyId, certificate] of certificatesById) {
    const hasEvent = manifest.events.some((entry) => entry.event.source_key_id === sourceKeyId);
    if (!hasEvent && !gapSourceKeys.has(sourceKeyId)) {
      consistencyFailures.push(`certificate ${sourceKeyId} has no event or gap`);
    }
    if (certificate.certificate.certificate_version !== "1.0") {
      consistencyFailures.push(`certificate ${sourceKeyId} has an unsupported version`);
    }
  }

  push(
    checks,
    "bundle_consistency",
    "Bundle consistency (scope, capture window, simulation label)",
    consistencyFailures.length === 0 ? "pass" : "fail",
    consistencyFailures.length === 0
      ? `${simulatedEvents} simulated event${simulatedEvents === 1 ? "" : "s"}`
      : failDetails(consistencyFailures),
  );

  report.valid = checks.every((check) => check.status === "pass");
  return report;
}
