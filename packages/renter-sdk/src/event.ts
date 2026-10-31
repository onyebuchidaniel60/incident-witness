import { randomUUID, type KeyObject } from "node:crypto";

import {
  canonicalJsonString,
  eventBodySchema,
  type EventEnvelope,
  type EventType,
} from "@incident-witness/protocol";
import { signEvent } from "@incident-witness/protocol/node";

export type RenterEventInput = {
  incidentId: string;
  sourceKeyId: string;
  privateKey: KeyObject;
  eventType: Extract<EventType, "renter_heartbeat" | "renter_endpoint_result">;
  payload: unknown;
  sequence: number;
  observedAt: string;
};

export type SignedRenterEvent = {
  envelope: EventEnvelope;
  raw: string;
  sizeBytes: number;
};

export function buildRenterEvent(input: RenterEventInput): SignedRenterEvent {
  const body = eventBodySchema.parse({
    protocol_version: "1.0",
    event_id: randomUUID(),
    incident_id: input.incidentId,
    source_key_id: input.sourceKeyId,
    source_type: "renter_client",
    event_type: input.eventType,
    sequence: input.sequence,
    observed_at: input.observedAt,
    payload: input.payload,
    simulation_mode: false,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  });

  const envelope = signEvent(body, input.privateKey);
  const raw = canonicalJsonString(envelope);

  return {
    envelope,
    raw,
    sizeBytes: Buffer.byteLength(raw, "utf8"),
  };
}
