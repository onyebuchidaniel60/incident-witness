import {
  canonicalJsonBytes,
  type EventEnvelope,
} from "@incident-witness/protocol";

export const EVENT_REQUEST_MAX_BYTES = 8 * 1024;
export const EVENT_PAYLOAD_MAX_BYTES = 2 * 1024;
export const INCIDENT_EVENT_LIMIT = 4_000;
export const INCIDENT_EVENT_BYTES_LIMIT = 7_340_032;
export const BUNDLE_MAX_BYTES = 10_485_760;

export type IncidentWindow = {
  capture_started_at: Date;
  capture_ends_at: Date;
  ended_at: Date | null;
  ingestion_deadline: Date;
};

export function effectiveCaptureEnd(incident: IncidentWindow): Date {
  if (incident.ended_at && incident.ended_at.getTime() < incident.capture_ends_at.getTime()) {
    return incident.ended_at;
  }
  return incident.capture_ends_at;
}

export function toRfc3339(date: Date): string {
  return date.toISOString();
}

/**
 * Canonical size of one bundle event entry. The extra byte accounts for the
 * array separator so the incident counter is conservative relative to the
 * final serialized manifest.
 */
export function canonicalEventEntryBytes(
  envelope: EventEnvelope,
  receivedAt: Date,
  eventSha256: string,
): number {
  return (
    canonicalJsonBytes({
      event: envelope,
      received_at: toRfc3339(receivedAt),
      event_sha256: eventSha256,
    }).length + 1
  );
}
