import { createHash, type KeyObject } from "node:crypto";

import {
  canonicalJsonBytes,
  canonicalJsonString,
  eventBodySchema,
  type EventEnvelope,
} from "@incident-witness/protocol";
import { sha256Base64Url, signEvent } from "@incident-witness/protocol/node";

export type WorkerEventType = "platform_probe_result" | "source_gap";

export type SignedWorkerEvent = {
  eventId: string;
  sequence: number;
  eventType: WorkerEventType;
  envelope: EventEnvelope;
  raw: string;
  bodyJson: string;
  bodyDigest: Buffer;
  signatureBytes: Buffer;
  eventSha256: string;
  entryBytes: number;
};

export type BuildWorkerEventInput = {
  jobId: string;
  attempt: number;
  incidentId: string;
  sourceKeyId: string;
  privateKey: KeyObject;
  eventType: WorkerEventType;
  payload: unknown;
  sequence: number;
  observedAt: Date;
  receivedAt: Date;
};

export function deterministicProbeEventId(jobId: string, attempt: number): string {
  const digest = createHash("sha256")
    .update(`incident-witness-probe-event-v1\0${jobId}\0${attempt}`, "utf8")
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildWorkerEvent(input: BuildWorkerEventInput): SignedWorkerEvent {
  const body = eventBodySchema.parse({
    protocol_version: "1.0",
    event_id: deterministicProbeEventId(input.jobId, input.attempt),
    incident_id: input.incidentId,
    source_key_id: input.sourceKeyId,
    source_type: "platform_probe",
    event_type: input.eventType,
    sequence: input.sequence,
    observed_at: input.observedAt.toISOString(),
    payload: input.payload,
    simulation_mode: false,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  });

  const envelope = signEvent(body, input.privateKey);
  const { signature, ...unsigned } = envelope;
  const bodyBytes = Buffer.from(canonicalJsonBytes(unsigned));
  const raw = canonicalJsonString(envelope);
  const eventSha256 = sha256Base64Url(bodyBytes);
  const entryBytes =
    canonicalJsonBytes({
      event: envelope,
      received_at: input.receivedAt.toISOString(),
      event_sha256: eventSha256,
    }).length + 1;

  return {
    eventId: envelope.event_id,
    sequence: input.sequence,
    eventType: input.eventType,
    envelope,
    raw,
    bodyJson: JSON.stringify(unsigned),
    bodyDigest: createHash("sha256").update(bodyBytes).digest(),
    signatureBytes: Buffer.from(signature, "base64url"),
    eventSha256,
    entryBytes,
  };
}
