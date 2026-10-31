import { randomUUID } from "node:crypto";
import { uptime, version as osVersion } from "node:os";
import type { KeyObject } from "node:crypto";

import {
  canonicalJsonString,
  eventBodySchema,
  type GpuTelemetryPayload,
  type HostAgentStatusPayload,
  type HostHeartbeatPayload,
  type HostPowerStatePayload,
} from "@incident-witness/protocol";
import { signEvent } from "@incident-witness/protocol/node";

import type { Logger } from "./log.js";
import { PROTOCOL_VERSION } from "./log.js";
import type { EventSpool } from "./spool.js";

export type QueueOutcome =
  | { queued: true; sequence: number; dropped: number }
  | { queued: false; sequence: number; reason: "quota" };

export class EvidenceProducer {
  constructor(
    private readonly options: {
      spool: EventSpool;
      sourceKeyId: string;
      privateKey: KeyObject;
      agentVersion: string;
      logger: Logger;
      now?: () => Date;
    },
  ) {}

  private enqueue(
    incidentId: string,
    eventType: string,
    payload: unknown,
    critical: boolean,
  ): QueueOutcome {
    const sequence = this.options.spool.allocateEventSequence();
    const observedAt = (this.options.now?.() ?? new Date()).toISOString();

    const body = eventBodySchema.parse({
      protocol_version: PROTOCOL_VERSION,
      event_id: randomUUID(),
      incident_id: incidentId,
      source_key_id: this.options.sourceKeyId,
      source_type: "host_agent",
      event_type: eventType,
      sequence,
      observed_at: observedAt,
      payload,
      simulation_mode: false,
      canonicalization: "RFC8785-JCS",
      signature_algorithm: "Ed25519",
    });

    const envelope = signEvent(body, this.options.privateKey);
    const raw = canonicalJsonString(envelope);
    const result = this.options.spool.enqueue(envelope, raw, critical);

    if (!result.inserted) {
      this.options.logger.warn("Evidence spool is full; event was not queued", {
        eventType,
        sequence,
        reason: "quota",
      });
      return { queued: false, sequence, reason: "quota" };
    }

    if (result.dropped > 0) {
      this.options.logger.warn("Evidence spool dropped oldest non-critical observations", {
        eventType,
        sequence,
        dropped: result.dropped,
      });
    }

    return { queued: true, sequence, dropped: result.dropped };
  }

  queueHostHeartbeat(
    incidentId: string,
    health: HostHeartbeatPayload["agent_health"],
  ): QueueOutcome {
    const payload: HostHeartbeatPayload = {
      agent_version: this.options.agentVersion,
      os_family: "linux",
      os_version: osVersion().slice(0, 80),
      uptime_seconds: Math.max(0, Math.floor(uptime())),
      agent_health: health,
    };

    return this.enqueue(incidentId, "host_heartbeat", payload, false);
  }

  queueGpuTelemetry(incidentId: string, payload: GpuTelemetryPayload): QueueOutcome {
    return this.enqueue(incidentId, "gpu_telemetry", payload, false);
  }

  queueHostPowerState(
    incidentId: string,
    payload: HostPowerStatePayload,
    critical: boolean,
  ): QueueOutcome {
    return this.enqueue(incidentId, "host_power_state", payload, critical);
  }

  queueHostAgentStatus(
    incidentId: string,
    status: HostAgentStatusPayload["status"],
  ): QueueOutcome {
    return this.enqueue(
      incidentId,
      "host_agent_status",
      { status, agent_version: this.options.agentVersion },
      true,
    );
  }
}
