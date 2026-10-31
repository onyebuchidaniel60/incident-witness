import { randomUUID } from "node:crypto";

import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJsonBytes,
  eventEnvelopeSchema,
  signedSourceKeyCertificateSchema,
  bundleManifestSchema,
  type BundleManifest,
  type EventEnvelope,
  type SignedSourceKeyCertificate,
} from "@incident-witness/protocol";
import {
  createBundleManifest,
  sha256Base64Url,
  verifyEventEnvelope,
  verifySourceKeyCertificate,
} from "@incident-witness/protocol/node";
import { correlate, RULE_VERSION, type CorrelatorEvent } from "@incident-witness/correlator";
import { withApiTransaction } from "@incident-witness/db";
import { createPublicKey } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import type { AppConfig } from "../config.js";
import { appendAudit } from "../domain/audit.js";
import {
  BUNDLE_MAX_BYTES,
  canonicalEventEntryBytes,
  effectiveCaptureEnd,
  INCIDENT_EVENT_BYTES_LIMIT,
  toRfc3339,
} from "../domain/evidence.js";
import { ApiError } from "../errors.js";

const LIMITATIONS =
  "Verification confirms integrity and signatures relative to trusted keys. It does not prove that sensors were accurate, keys were uncompromised, or the inferred cause is true.";

type IncidentRow = {
  id: string;
  owner_user_id: string;
  host_id: string;
  title: string;
  status: string;
  capture_started_at: Date;
  capture_ends_at: Date;
  ended_at: Date | null;
  ingestion_deadline: Date;
  demo_mode: boolean;
  accepted_event_count: number;
  accepted_event_bytes: string | number;
  assessment_code: string | null;
  evidence_grade: string | null;
  rule_version: string | null;
  sealed_at: Date | null;
  simulation_present: boolean;
};

type HostRow = {
  id: string;
  alias: string;
  endpoint_hostname: string;
};

type EventRow = {
  id: string;
  source_key_id: string;
  source_type: string;
  event_type: string;
  sequence: string | number;
  observed_at: Date;
  received_at: Date;
  canonical_event: unknown;
  canonical_sha256: Buffer;
  signature: Buffer;
  simulation_mode: boolean;
};

type KeyRow = {
  id: string;
  source_type: string;
  public_key: Buffer;
  fingerprint: string;
  status: string;
  certificate_json: unknown;
  certificate_signature: Buffer;
  host_id: string | null;
  incident_id: string | null;
};

type BundleRow = {
  id: string;
  manifest: unknown;
  manifest_sha256: Buffer;
  platform_signature: Buffer;
  byte_length: number;
  created_at: Date;
};

export type SealAssessment = {
  code: string;
  explanation: string;
  evidenceGrade: string;
};

export type SealResult =
  | {
      status: "sealed";
      created: true;
      bundleId: string;
      bundleSha256: string;
      sealedAt: Date;
      assessment: SealAssessment;
      eventCount: number;
      byteLength: number;
    }
  | {
      status: "already_sealed";
      created: false;
      bundleId: string;
      bundleSha256: string;
      sealedAt: Date;
      assessment: SealAssessment;
      eventCount: number;
      byteLength: number;
    }
  | { status: "no_evidence" }
  | { status: "probe_lease_active" }
  | { status: "not_ready"; incidentStatus: string };

export type SealMode = "provider" | "system";

type SealInput = {
  incidentId: string;
  requestId: string;
  config: AppConfig;
  mode: SealMode;
};

function signedCertificate(row: KeyRow): SignedSourceKeyCertificate {
  return signedSourceKeyCertificateSchema.parse({
    certificate: row.certificate_json,
    signature: bytesToBase64Url(row.certificate_signature),
    signature_algorithm: "Ed25519",
  });
}

function eventEnvelope(row: EventRow): EventEnvelope {
  const canonical = row.canonical_event;
  if (typeof canonical !== "object" || canonical === null || Array.isArray(canonical)) {
    throw new ApiError(500, "INTERNAL_ERROR", "Stored evidence event is malformed.");
  }

  return eventEnvelopeSchema.parse({
    ...(canonical as Record<string, unknown>),
    signature: bytesToBase64Url(row.signature),
  });
}

function assessmentFromManifest(manifest: BundleManifest): SealAssessment {
  return {
    code: manifest.assessment.code,
    explanation: manifest.assessment.explanation,
    evidenceGrade: manifest.assessment.evidence_grade,
  };
}

async function existingBundle(
  client: PoolClient,
  incident: IncidentRow,
): Promise<SealResult> {
  const result = await client.query<BundleRow>(
    `select id, manifest, manifest_sha256, platform_signature, byte_length, created_at
       from evidence_bundles
      where incident_id = $1`,
    [incident.id],
  );
  const bundle = result.rows[0];
  if (!bundle) {
    throw new ApiError(500, "INTERNAL_ERROR", "Sealed incident has no evidence bundle.");
  }

  const manifest = bundleManifestSchema.parse(bundle.manifest);
  return {
    status: "already_sealed",
    created: false,
    bundleId: bundle.id,
    bundleSha256: bytesToBase64Url(bundle.manifest_sha256),
    sealedAt: incident.sealed_at ?? bundle.created_at,
    assessment: assessmentFromManifest(manifest),
    eventCount: Number(incident.accepted_event_count),
    byteLength: bundle.byte_length,
  };
}

/**
 * Runs inside an existing transaction. The incident row lock serializes this
 * operation against event ingestion and concurrent seal requests.
 */
export async function sealIncidentInTransaction(
  client: PoolClient,
  input: SealInput,
): Promise<SealResult> {
  const incidentResult = await client.query<IncidentRow>(
    `select id, owner_user_id, host_id, title, status, capture_started_at, capture_ends_at,
            ended_at, ingestion_deadline, demo_mode, accepted_event_count, accepted_event_bytes,
            assessment_code, evidence_grade, rule_version, sealed_at, simulation_present
       from incidents
      where id = $1
      for update`,
    [input.incidentId],
  );
  const incident = incidentResult.rows[0];

  if (!incident) {
    if (input.mode === "provider") {
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
    }
    return { status: "not_ready", incidentStatus: "missing" };
  }

  if (incident.status === "sealed") {
    return existingBundle(client, incident);
  }
  if (incident.status !== "awaiting_finalize") {
    return { status: "not_ready", incidentStatus: incident.status };
  }

  const activeLease = await client.query<{ id: string }>(
    `select id
       from probe_jobs
      where incident_id = $1
        and status = 'leased'
        and lease_expires_at > now()
      limit 1`,
    [incident.id],
  );
  if (activeLease.rows[0]) {
    return { status: "probe_lease_active" };
  }

  const eventsResult = await client.query<EventRow>(
    `select id, source_key_id, source_type, event_type, sequence, observed_at, received_at,
            canonical_event, canonical_sha256, signature, simulation_mode
       from evidence_events
      where incident_id = $1
        and validation_status = 'accepted'
      order by observed_at asc, source_type asc, source_key_id asc, sequence asc, id asc`,
    [incident.id],
  );
  if (eventsResult.rows.length === 0) {
    return { status: "no_evidence" };
  }

  const hostResult = await client.query<HostRow>(
    `select id, alias, endpoint_hostname from hosts where id = $1`,
    [incident.host_id],
  );
  const host = hostResult.rows[0];
  if (!host) {
    throw new ApiError(500, "INTERNAL_ERROR", "Incident host metadata is missing.");
  }

  const keyIds = [...new Set(eventsResult.rows.map((event) => event.source_key_id))];
  const keysResult = await client.query<KeyRow>(
    `select id, source_type, public_key, fingerprint, status, certificate_json,
            certificate_signature, host_id, incident_id
       from witness_keys
      where id = any($1::uuid[])`,
    [keyIds],
  );
  const keys = new Map(keysResult.rows.map((key) => [key.id, key]));
  const platformPublicKey = createPublicKey(input.config.platformSigningKey);
  const sourceCertificates: SignedSourceKeyCertificate[] = [];

  for (const key of keysResult.rows) {
    const certificate = signedCertificate(key);
    if (!(await verifySourceKeyCertificate(certificate, platformPublicKey))) {
      throw new ApiError(500, "INTERNAL_ERROR", "A source certificate failed verification.");
    }
    if (
      certificate.certificate.source_key_id !== key.id ||
      certificate.certificate.source_type !== key.source_type ||
      certificate.certificate.public_key !== key.public_key.toString("base64url") ||
      certificate.certificate.fingerprint !== key.fingerprint
    ) {
      throw new ApiError(500, "INTERNAL_ERROR", "A source certificate does not match its key.");
    }
    sourceCertificates.push(certificate);
  }

  sourceCertificates.sort((left, right) => {
    if (left.certificate.source_type !== right.certificate.source_type) {
      return left.certificate.source_type < right.certificate.source_type ? -1 : 1;
    }
    return left.certificate.source_key_id < right.certificate.source_key_id ? -1 : 1;
  });

  const captureEnd = effectiveCaptureEnd(incident);
  const captureStartTime = incident.capture_started_at.getTime();
  const captureEndTime = captureEnd.getTime();

  const bundleEvents: Array<{
    event: EventEnvelope;
    received_at: string;
    event_sha256: string;
  }> = [];
  const correlatorEvents: CorrelatorEvent[] = [];
  let aggregateEventBytes = 0;

  for (const row of eventsResult.rows) {
    const key = keys.get(row.source_key_id);
    if (!key) {
      throw new ApiError(500, "INTERNAL_ERROR", "An evidence event has no source key.");
    }

    const envelope = eventEnvelope(row);
    if (
      envelope.event_id !== row.id ||
      envelope.incident_id !== incident.id ||
      envelope.source_key_id !== row.source_key_id ||
      envelope.source_type !== row.source_type ||
      envelope.event_type !== row.event_type ||
      envelope.sequence !== Number(row.sequence)
    ) {
      throw new ApiError(500, "INTERNAL_ERROR", "Stored evidence event scope is inconsistent.");
    }

    const observedAt = Date.parse(envelope.observed_at);
    if (observedAt < captureStartTime || observedAt > captureEndTime) {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "A stored evidence event is outside the capture window.",
      );
    }

    const { signature, ...signedBody } = envelope;
    void signature;
    const computedBodyDigest = sha256Base64Url(canonicalJsonBytes(signedBody));
    if (computedBodyDigest !== bytesToBase64Url(row.canonical_sha256)) {
      throw new ApiError(500, "INTERNAL_ERROR", "A stored evidence digest is inconsistent.");
    }

    if (!(await verifyEventEnvelope(envelope, key.public_key.toString("base64url")))) {
      throw new ApiError(500, "INTERNAL_ERROR", "A stored evidence signature failed verification.");
    }

    const eventSha256 = bytesToBase64Url(row.canonical_sha256);
    aggregateEventBytes += canonicalEventEntryBytes(envelope, row.received_at, eventSha256);
    if (aggregateEventBytes > INCIDENT_EVENT_BYTES_LIMIT) {
      throw new ApiError(
        409,
        "INCIDENT_EVIDENCE_LIMIT",
        "The incident evidence exceeds the aggregate event-entry budget.",
      );
    }

    bundleEvents.push({
      event: envelope,
      received_at: toRfc3339(row.received_at),
      event_sha256: eventSha256,
    });
    correlatorEvents.push({
      event_id: envelope.event_id,
      source_key_id: envelope.source_key_id,
      source_type: envelope.source_type,
      event_type: envelope.event_type,
      sequence: envelope.sequence,
      observed_at: envelope.observed_at,
      simulation_mode: envelope.simulation_mode,
      payload: envelope.payload,
    });
  }

  const correlation = correlate(correlatorEvents, RULE_VERSION);
  const sealedAt = new Date();
  const simulationPresent =
    incident.demo_mode || eventsResult.rows.some((event) => event.simulation_mode);
  const evidenceGrade =
    incident.demo_mode && correlation.evidenceGrade !== "INSUFFICIENT"
      ? "LOW"
      : correlation.evidenceGrade;

  let explanation = correlation.explanation;
  if (incident.demo_mode) {
    explanation += " This evidence record is from a demo session; the evidence grade is capped at LOW.";
  }

  const manifest: BundleManifest = bundleManifestSchema.parse({
    incident_id: incident.id,
    host_alias: host.alias,
    endpoint_hostname: host.endpoint_hostname,
    capture_started_at: toRfc3339(incident.capture_started_at),
    capture_ends_at: toRfc3339(captureEnd),
    sealed_at: toRfc3339(sealedAt),
    protocol_version: "1.0",
    schema_version: "1.0",
    rule_version: RULE_VERSION,
    events: bundleEvents,
    source_certificates: sourceCertificates,
    gaps: correlation.gaps,
    assessment: {
      code: correlation.assessmentCode,
      explanation,
      evidence_grade: evidenceGrade,
    },
    simulation_present: simulationPresent,
    platform_key_id: input.config.platformKeyId,
    limitations: LIMITATIONS,
  });

  const platformKeyResult = await client.query<{ id: string }>(
    `select id
       from platform_signing_keys
      where key_id = $1
        and status = 'active'`,
    [input.config.platformKeyId],
  );
  const platformKey = platformKeyResult.rows[0];
  if (!platformKey) {
    throw new ApiError(
      500,
      "PLATFORM_KEY_UNAVAILABLE",
      "The active platform signing key is not registered.",
    );
  }

  const bundle = createBundleManifest(manifest, input.config.platformSigningKey);
  const bundleBytes = Buffer.from(canonicalJsonBytes(bundle));
  if (bundleBytes.length > BUNDLE_MAX_BYTES) {
    throw new ApiError(409, "BUNDLE_TOO_LARGE", "The complete evidence bundle exceeds 10 MiB.");
  }

  const bundleId = randomUUID();
  const manifestSha256 = Buffer.from(base64UrlToBytes(bundle.manifest_sha256));
  const platformSignature = Buffer.from(base64UrlToBytes(bundle.platform_signature));

  await client.query(
    `insert into evidence_bundles
       (id, incident_id, owner_user_id, bundle_version, rule_version, platform_key_id,
        manifest, manifest_sha256, platform_signature, byte_length)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
    [
      bundleId,
      incident.id,
      incident.owner_user_id,
      bundle.bundle_version,
      RULE_VERSION,
      platformKey.id,
      JSON.stringify(bundle.manifest),
      manifestSha256,
      platformSignature,
      bundleBytes.length,
    ],
  );

  await client.query(
    `update incidents
        set status = 'sealed',
            sealed_at = $1,
            rule_version = $2,
            assessment_code = $3,
            evidence_grade = $4::evidence_grade,
            simulation_present = $5,
            cancel_reason = null
      where id = $6`,
    [
      sealedAt,
      RULE_VERSION,
      correlation.assessmentCode,
      evidenceGrade,
      simulationPresent,
      incident.id,
    ],
  );

  await appendAudit(client, {
    actorType: input.mode === "provider" ? "provider" : "system",
    actorId: input.mode === "provider" ? incident.owner_user_id : null,
    ownerUserId: incident.owner_user_id,
    resourceType: "incident",
    resourceId: incident.id,
    action: "incident.sealed",
    requestId: input.requestId,
    metadata: {
      bundleId,
      assessmentCode: correlation.assessmentCode,
      evidenceGrade,
      eventCount: bundleEvents.length,
    },
  });

  return {
    status: "sealed",
    created: true,
    bundleId,
    bundleSha256: bundle.manifest_sha256,
    sealedAt,
    assessment: {
      code: correlation.assessmentCode,
      explanation,
      evidenceGrade,
    },
    eventCount: bundleEvents.length,
    byteLength: bundleBytes.length,
  };
}

export async function finalizeIncident(
  pool: Pool,
  incidentId: string,
  requestId: string,
  config: AppConfig,
): Promise<SealResult | { status: "cancelled_no_evidence" }> {
  return withApiTransaction(pool, { mode: "system_lifecycle" }, async ({ client }) => {
    const result = await sealIncidentInTransaction(client, {
      incidentId,
      requestId,
      config,
      mode: "system",
    });

    if (result.status !== "no_evidence") {
      return result;
    }

    const incidentResult = await client.query<{ owner_user_id: string }>(
      `select owner_user_id from incidents where id = $1 for update`,
      [incidentId],
    );
    const incident = incidentResult.rows[0];
    if (!incident) {
      return { status: "not_ready", incidentStatus: "missing" };
    }

    await client.query(
      `update incidents
          set status = 'cancelled',
              cancel_reason = 'NO_EVIDENCE'
        where id = $1`,
      [incidentId],
    );
    await appendAudit(client, {
      actorType: "system",
      ownerUserId: incident.owner_user_id,
      resourceType: "incident",
      resourceId: incidentId,
      action: "incident.cancelled_no_evidence",
      requestId,
      metadata: { reasonCode: "NO_EVIDENCE" },
    });

    return { status: "cancelled_no_evidence" };
  });
}
