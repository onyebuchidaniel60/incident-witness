import { createHash } from "node:crypto";

import {
  base64UrlToBytes,
  canonicalJsonBytes,
  eventEnvelopeSchema,
  parseCanonicalJsonBytes,
  type EventEnvelope,
} from "@incident-witness/protocol";
import { sha256Base64Url, verifyEventEnvelope } from "@incident-witness/protocol/node";
import { setTransactionGuc, withApiTransaction } from "@incident-witness/db";
import type { Pool } from "pg";

import type { AppConfig } from "../config.js";
import {
  canonicalEventEntryBytes,
  effectiveCaptureEnd,
  EVENT_PAYLOAD_MAX_BYTES,
  EVENT_REQUEST_MAX_BYTES,
  INCIDENT_EVENT_BYTES_LIMIT,
  INCIDENT_EVENT_LIMIT,
  type IncidentWindow,
} from "../domain/evidence.js";
import { isUniqueViolation } from "../domain/idempotency.js";
import { constantTimeEqual, hmacSha256Hex } from "../domain/tokens.js";
import { ApiError } from "../errors.js";

export type ExpectedSourceType = "host_agent" | "renter_client";

export type EventIngestionInput = {
  apiPool: Pool;
  config: AppConfig;
  rawBody: Buffer;
  authorization: string | undefined;
  expectedSourceType: ExpectedSourceType;
};

export type EventIngestionResult = {
  eventId: string;
  receivedAt: Date;
  duplicate: boolean;
};

type CredentialRow = {
  id: string;
  source_key_id: string;
  credential_type: string;
  expires_at: Date | null;
  revoked_at: Date | null;
};

type KeyRow = {
  id: string;
  source_type: string;
  status: string;
  host_id: string | null;
  incident_id: string | null;
  public_key: Buffer;
};

type IncidentRow = IncidentWindow & {
  id: string;
  owner_user_id: string;
  host_id: string;
  status: string;
  demo_mode: boolean;
  accepted_event_count: number;
  accepted_event_bytes: string | number;
};

type ExistingEventRow = {
  id: string;
  incident_id: string;
  source_key_id: string;
  canonical_sha256: Buffer;
  signature: Buffer;
  received_at: Date;
};

function parseEvent(rawBody: Buffer): EventEnvelope {
  if (rawBody.length > EVENT_REQUEST_MAX_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The event request is too large.");
  }

  let parsed: unknown;
  try {
    parsed = parseCanonicalJsonBytes(rawBody);
  } catch {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "The event body is not exact RFC 8785 canonical JSON.",
    );
  }

  let envelope: EventEnvelope;
  try {
    envelope = eventEnvelopeSchema.parse(parsed);
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "The event envelope is invalid.");
  }

  const canonical = Buffer.from(canonicalJsonBytes(envelope));
  if (!canonical.equals(rawBody)) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "The event body is not exact RFC 8785 canonical JSON.",
    );
  }

  const payloadBytes = canonicalJsonBytes(envelope.payload).length;
  if (payloadBytes > EVENT_PAYLOAD_MAX_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The event payload is too large.");
  }

  return envelope;
}

function requireBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const credential = authorization.slice("Bearer ".length);
  if (credential.length < 1 || credential.length > 512) {
    throw new ApiError(401, "AUTH_INVALID", "The credential is invalid.");
  }
  return credential;
}

/**
 * Verifies and appends one source-signed evidence event.
 *
 * The incident row is locked before the key row, matching renter key revocation
 * and sealing. This serializes seal-vs-ingest so exactly one state transition
 * wins.
 */
export async function ingestSignedEvent(input: EventIngestionInput): Promise<EventIngestionResult> {
  const envelope = parseEvent(input.rawBody);
  if (envelope.source_type !== input.expectedSourceType) {
    throw new ApiError(422, "VALIDATION_ERROR", "The event source type is not accepted here.");
  }

  const credential = requireBearerToken(input.authorization);
  const credentialHashHex = hmacSha256Hex(input.config.tokenPepper, credential);
  const { signature, ...body } = envelope;
  const bodyBytes = Buffer.from(canonicalJsonBytes(body));
  const bodyDigest = createHash("sha256").update(bodyBytes).digest();
  const signatureBytes = Buffer.from(base64UrlToBytes(signature));
  const eventSha256 = sha256Base64Url(bodyBytes);

  try {
    return await withApiTransaction(
      input.apiPool,
      {
        mode: "machine_ingest",
        gucs: { "iw.credential_hash_hex": credentialHashHex },
      },
      async ({ client }) => {
        const credentialResult = await client.query<CredentialRow>(
          `select id, source_key_id, credential_type, expires_at, revoked_at
             from source_credentials
            where credential_hash = decode($1, 'hex')`,
          [credentialHashHex],
        );
        const credentialRow = credentialResult.rows[0];
        if (
          !credentialRow ||
          credentialRow.revoked_at ||
          (credentialRow.expires_at && credentialRow.expires_at.getTime() <= Date.now())
        ) {
          throw new ApiError(401, "AUTH_INVALID", "The credential is invalid.");
        }
        if (credentialRow.credential_type !== input.expectedSourceType) {
          throw new ApiError(403, "PERMISSION_DENIED", "This credential has the wrong scope.");
        }
        if (credentialRow.source_key_id !== envelope.source_key_id) {
          throw new ApiError(403, "PERMISSION_DENIED", "This key is not bound to the credential.");
        }

        await setTransactionGuc(client, "iw.source_key_id", credentialRow.source_key_id);

        const initialKeyResult = await client.query<KeyRow>(
          `select id, source_type, status, host_id, incident_id, public_key
             from witness_keys
            where id = $1`,
          [credentialRow.source_key_id],
        );
        const initialKey = initialKeyResult.rows[0];
        if (
          !initialKey ||
          initialKey.source_type !== input.expectedSourceType ||
          initialKey.status !== "active"
        ) {
          throw new ApiError(403, "PERMISSION_DENIED", "This source key is not active.");
        }
        if (initialKey.source_type === "host_agent" && !initialKey.host_id) {
          throw new ApiError(403, "PERMISSION_DENIED", "This host key has no host scope.");
        }
        if (initialKey.source_type === "renter_client" && !initialKey.incident_id) {
          throw new ApiError(403, "PERMISSION_DENIED", "This renter key has no incident scope.");
        }
        if (
          initialKey.source_type === "renter_client" &&
          initialKey.incident_id !== envelope.incident_id
        ) {
          throw new ApiError(
            403,
            "PERMISSION_DENIED",
            "The event incident is outside this source's scope.",
          );
        }

        await setTransactionGuc(client, "iw.source_type", initialKey.source_type);
        await setTransactionGuc(client, "iw.incident_id", envelope.incident_id);
        if (initialKey.host_id) {
          await setTransactionGuc(client, "iw.host_id", initialKey.host_id);
        }

        const incidentResult = await client.query<IncidentRow>(
          `select id, owner_user_id, host_id, status, capture_started_at, capture_ends_at,
                  ended_at, ingestion_deadline, demo_mode, accepted_event_count, accepted_event_bytes
             from incidents
            where id = $1
            for update`,
          [envelope.incident_id],
        );
        const incident = incidentResult.rows[0];
        if (!incident) {
          throw new ApiError(
            403,
            "PERMISSION_DENIED",
            "The event incident is outside this source's scope.",
          );
        }

        if (
          (initialKey.source_type === "host_agent" && incident.host_id !== initialKey.host_id) ||
          (initialKey.source_type === "renter_client" && incident.id !== initialKey.incident_id)
        ) {
          throw new ApiError(
            403,
            "PERMISSION_DENIED",
            "The event incident is outside this source's scope.",
          );
        }

        const keyResult = await client.query<KeyRow>(
          `select id, source_type, status, host_id, incident_id, public_key
             from witness_keys
            where id = $1
            for update`,
          [credentialRow.source_key_id],
        );
        const key = keyResult.rows[0];
        if (!key || key.status !== "active" || key.source_type !== input.expectedSourceType) {
          throw new ApiError(403, "PERMISSION_DENIED", "This source key is not active.");
        }

        if (!(await verifyEventEnvelope(envelope, key.public_key.toString("base64url")))) {
          throw new ApiError(422, "VALIDATION_ERROR", "The event signature is invalid.");
        }

        const existingById = await client.query<ExistingEventRow>(
          `select id, incident_id, source_key_id, canonical_sha256, signature, received_at
             from evidence_events
            where id = $1`,
          [envelope.event_id],
        );
        const existing = existingById.rows[0];
        if (existing) {
          const sameEvent =
            existing.incident_id === incident.id &&
            existing.source_key_id === key.id &&
            constantTimeEqual(existing.canonical_sha256, bodyDigest) &&
            constantTimeEqual(existing.signature, signatureBytes);

          if (sameEvent) {
            return {
              eventId: existing.id,
              receivedAt: existing.received_at,
              duplicate: true,
            };
          }

          throw new ApiError(
            409,
            "EVENT_CONFLICT",
            "This event identifier was already used with different content.",
          );
        }

        const observedAt = Date.parse(envelope.observed_at);
        const captureStart = incident.capture_started_at.getTime();
        const captureEnd = effectiveCaptureEnd(incident).getTime();
        const now = Date.now();

        if (observedAt < captureStart || observedAt > captureEnd) {
          throw new ApiError(
            422,
            "EVENT_WINDOW_INVALID",
            "The observation time is outside the incident capture window.",
          );
        }
        if (observedAt > now + 5 * 60_000) {
          throw new ApiError(
            422,
            "EVENT_WINDOW_INVALID",
            "The observation time is too far in the future.",
          );
        }
        if (!["collecting", "awaiting_finalize"].includes(incident.status)) {
          throw new ApiError(409, "INCIDENT_CLOSED", "The incident is no longer accepting events.");
        }
        if (now > incident.ingestion_deadline.getTime()) {
          throw new ApiError(409, "INCIDENT_CLOSED", "The incident ingestion window has closed.");
        }
        if (envelope.simulation_mode && !incident.demo_mode) {
          throw new ApiError(
            422,
            "EVENT_SIMULATION_NOT_ALLOWED",
            "Simulated events are only accepted in a demo session.",
          );
        }

        const receivedAt = new Date();
        const entryBytes = canonicalEventEntryBytes(envelope, receivedAt, eventSha256);
        const acceptedCount = Number(incident.accepted_event_count);
        const acceptedBytes = Number(incident.accepted_event_bytes);

        if (
          acceptedCount >= INCIDENT_EVENT_LIMIT ||
          acceptedBytes + entryBytes > INCIDENT_EVENT_BYTES_LIMIT
        ) {
          throw new ApiError(
            409,
            "INCIDENT_EVIDENCE_LIMIT",
            "The incident has reached its accepted evidence budget.",
          );
        }

        const sequenceResult = await client.query<{ max_sequence: string | null }>(
          `select max(sequence)::text as max_sequence
             from evidence_events
            where source_key_id = $1`,
          [key.id],
        );
        const maxSequence = Number(sequenceResult.rows[0]?.max_sequence ?? "0");
        if (maxSequence > 0 && envelope.sequence <= maxSequence) {
          throw new ApiError(
            409,
            "EVENT_SEQUENCE_ROLLBACK",
            "This source sequence is behind the last accepted sequence.",
          );
        }

        await client.query(
          `insert into evidence_events
             (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at,
              received_at, canonical_event, canonical_sha256, signature, simulation_mode,
              validation_status)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, 'accepted')`,
          [
            envelope.event_id,
            incident.id,
            key.id,
            envelope.source_type,
            envelope.event_type,
            envelope.sequence,
            new Date(envelope.observed_at),
            receivedAt,
            JSON.stringify(body),
            bodyDigest,
            signatureBytes,
            envelope.simulation_mode,
          ],
        );
        await client.query(
          `update incidents
              set accepted_event_count = accepted_event_count + 1,
                  accepted_event_bytes = accepted_event_bytes + $1::bigint,
                  simulation_present = simulation_present or $2
            where id = $3`,
          [entryBytes, envelope.simulation_mode, incident.id],
        );

        return {
          eventId: envelope.event_id,
          receivedAt,
          duplicate: false,
        };
      },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "EVENT_CONFLICT", "This event or source sequence was already used.");
    }
    throw error;
  }
}
