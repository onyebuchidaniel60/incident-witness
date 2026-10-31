import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  canonicalJsonString,
  eventBodySchema,
  type EventEnvelope,
  type EventType,
  type HostHeartbeatPayload,
} from "@incident-witness/protocol";
import { signEvent } from "@incident-witness/protocol/node";

import { createLogger, type LogFields, type Logger } from "../src/log.js";
import type { AgentKeyPair } from "../src/crypto.js";

export function makeTempDir(prefix = "iw-agent-"): string {
  const base = existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir();
  return mkdtempSync(join(base, prefix));
}

export function removeTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logger: createLogger({ level: "debug", sink: (line) => lines.push(line) }),
  };
}

export function hostHeartbeatPayload(
  overrides: Partial<HostHeartbeatPayload> = {},
): HostHeartbeatPayload {
  return {
    agent_version: "0.1.0",
    os_family: "linux",
    os_version: "test-kernel",
    uptime_seconds: 1234,
    agent_health: "ok",
    ...overrides,
  };
}

export function makeHostEvent(options: {
  sequence: number;
  incidentId: string;
  sourceKeyId: string;
  keyPair: AgentKeyPair;
  observedAt?: string;
  eventType?: EventType;
  payload?: unknown;
}): EventEnvelope {
  const eventType = options.eventType ?? "host_heartbeat";
  const payload = options.payload ?? hostHeartbeatPayload();

  const body = eventBodySchema.parse({
    protocol_version: "1.0",
    event_id: randomUUID(),
    incident_id: options.incidentId,
    source_key_id: options.sourceKeyId,
    source_type: "host_agent",
    event_type: eventType,
    sequence: options.sequence,
    observed_at: options.observedAt ?? new Date().toISOString(),
    payload,
    simulation_mode: false,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  });

  return signEvent(body, options.keyPair.privateKey);
}

export function canonicalEnvelope(envelope: EventEnvelope): string {
  return canonicalJsonString(envelope);
}

export function assertNoSensitiveFields(fields: LogFields): void {
  const serialized = JSON.stringify(fields);
  for (const forbidden of ["credential", "token", "secret", "private"]) {
    if (serialized.toLowerCase().includes(forbidden)) {
      throw new Error(`Sensitive value leaked into log fields: ${forbidden}`);
    }
  }
}
