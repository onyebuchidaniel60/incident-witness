import { join } from "node:path";

import {
  eventEnvelopeSchema,
  type EventEnvelope,
  type GpuTelemetryPayload,
  type HostPowerStatePayload,
} from "@incident-witness/protocol";
import { verifyEventEnvelope } from "@incident-witness/protocol/node";
import { afterEach, describe, expect, it } from "vitest";

import { HostAgent } from "../src/agent.js";
import type { EventResult, PresenceResult } from "../src/api.js";
import { writeEnrollmentFiles, type AgentConfig } from "../src/config.js";
import { generateAgentKeyPair, type AgentKeyPair, type SignedPresence } from "../src/crypto.js";
import { createLogger } from "../src/log.js";
import { makeTempDir, removeTempDir } from "./helpers.js";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";
const INCIDENT_ID = "33333333-3333-4333-8333-333333333333";
const CREDENTIAL = "h".repeat(43);

class RecordingTransport {
  readonly events: string[] = [];
  readonly presence: SignedPresence[] = [];
  eventResult: EventResult = { kind: "accepted", status: 202 };
  presenceResult: PresenceResult = { kind: "accepted", status: 200 };

  async sendEvent(raw: string): Promise<EventResult> {
    this.events.push(raw);
    return this.eventResult;
  }

  async sendPresence(presence: SignedPresence): Promise<PresenceResult> {
    this.presence.push(presence);
    return this.presenceResult;
  }

  async enroll(): Promise<never> {
    throw new Error("The runtime test transport does not enroll");
  }
}

describe("HostAgent", () => {
  const directories: string[] = [];
  const agents: HostAgent[] = [];
  const keyPair: AgentKeyPair = generateAgentKeyPair();

  afterEach(async () => {
    for (const agent of agents.splice(0)) {
      try {
        await agent.stop();
      } catch {
        // already closed
      }
    }
    for (const directory of directories.splice(0)) removeTempDir(directory);
  });

  function configDir(upsDevice?: string): string {
    const base = makeTempDir();
    directories.push(base);
    const directory = join(base, "config");
    const config: AgentConfig = {
      config_version: 1,
      api_base_url: "http://127.0.0.1:4000",
      host_id: HOST_ID,
      source_key_id: SOURCE_KEY_ID,
      enrolled_at: "2026-10-31T12:00:00.000Z",
      ...(upsDevice === undefined ? {} : { ups_device: upsDevice }),
    };
    writeEnrollmentFiles(directory, {
      config,
      privateKeyPem: keyPair.privateKeyPem,
      deviceCredential: CREDENTIAL,
    });
    return directory;
  }

  function makeAgent(
    directory: string,
    transport: RecordingTransport,
    options: {
      incidentId?: string;
      upsDevice?: string;
      gpuPayload?: GpuTelemetryPayload;
      upsPayload?: HostPowerStatePayload;
      shutdownFlushMs?: number;
    } = {},
  ): HostAgent {
    const agent = new HostAgent({
      configDir: directory,
      transport,
      ...(options.incidentId === undefined ? {} : { incidentId: options.incidentId }),
      ...(options.upsDevice === undefined ? {} : { upsDevice: options.upsDevice }),
      ...(options.gpuPayload === undefined
        ? {}
        : { gpuCollector: { collect: async () => options.gpuPayload as GpuTelemetryPayload } }),
      ...(options.upsPayload === undefined
        ? {}
        : { upsCollector: { collect: async () => options.upsPayload as HostPowerStatePayload } }),
      logger: createLogger({ level: "error", sink: () => undefined }),
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      ...(options.shutdownFlushMs === undefined
        ? {}
        : { shutdownFlushMs: options.shutdownFlushMs }),
    });
    agents.push(agent);
    return agent;
  }

  it("signs and uploads evidence heartbeats, GPU telemetry and UPS state", async () => {
    const transport = new RecordingTransport();
    const agent = makeAgent(configDir("my-ups"), transport, {
      incidentId: INCIDENT_ID,
      upsDevice: "my-ups",
      gpuPayload: {
        device_index: 0,
        vendor: "NVIDIA",
        model: "Test GPU",
        temperature_c: 50,
        collection_status: "available",
      },
      upsPayload: { ups_alias: "my-ups", state: "online", charge_percent: 100 },
    });

    await agent.emitHeartbeatOnce();
    await agent.collectGpuOnce();
    await agent.collectUpsOnce();
    await agent.uploadOnce();
    await agent.uploadOnce();
    await agent.uploadOnce();

    expect(transport.events).toHaveLength(3);
    const envelopes = transport.events.map(
      (raw) => eventEnvelopeSchema.parse(JSON.parse(raw)) as EventEnvelope,
    );

    expect(envelopes.map((envelope) => envelope.event_type)).toEqual([
      "host_heartbeat",
      "gpu_telemetry",
      "host_power_state",
    ]);
    expect(envelopes.map((envelope) => envelope.sequence)).toEqual([1, 2, 3]);
    for (const envelope of envelopes) {
      expect(await verifyEventEnvelope(envelope, keyPair.publicKeyBase64Url)).toBe(true);
      expect(envelope.incident_id).toBe(INCIDENT_ID);
      expect(envelope.source_key_id).toBe(SOURCE_KEY_ID);
      expect(envelope.source_type).toBe("host_agent");
      expect(envelope.simulation_mode).toBe(false);
    }
    expect(agent.status().spool.eventCount).toBe(0);
  });

  it("continues the evidence sequence after a restart", async () => {
    const directory = configDir();
    const firstTransport = new RecordingTransport();
    const first = makeAgent(directory, firstTransport, { incidentId: INCIDENT_ID });

    await first.emitHeartbeatOnce();
    await first.uploadOnce();
    expect(firstTransport.events).toHaveLength(1);
    await first.stop();

    const secondTransport = new RecordingTransport();
    const second = makeAgent(directory, secondTransport, { incidentId: INCIDENT_ID });
    await second.emitHeartbeatOnce();
    await second.uploadOnce();

    const firstSequence = (JSON.parse(firstTransport.events[0] ?? "{}") as { sequence: number })
      .sequence;
    const secondSequence = (JSON.parse(secondTransport.events[0] ?? "{}") as { sequence: number })
      .sequence;

    expect(secondSequence).toBeGreaterThan(firstSequence);
    expect(second.status().nextEventSequence).toBeGreaterThan(secondSequence);
  });

  it("resumes an offline backlog after a restart without reusing a sequence", async () => {
    const directory = configDir();
    const offlineTransport = new RecordingTransport();
    offlineTransport.eventResult = {
      kind: "retryable",
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
    };

    const offline = makeAgent(directory, offlineTransport, {
      incidentId: INCIDENT_ID,
      shutdownFlushMs: 0,
    });
    await offline.emitHeartbeatOnce();
    await offline.uploadOnce();
    expect(offline.status().spool.eventCount).toBe(1);

    await offline.stop();

    const onlineTransport = new RecordingTransport();
    const online = makeAgent(directory, onlineTransport, { shutdownFlushMs: 0 });

    for (let index = 0; index < 10 && online.status().spool.eventCount > 0; index += 1) {
      await online.uploadOnce();
    }

    expect(online.status().spool.eventCount).toBe(0);
    const uploaded = onlineTransport.events.map(
      (raw) => JSON.parse(raw) as { sequence: number; event_type: string },
    );
    const heartbeat = uploaded.find((event) => event.event_type === "host_heartbeat");
    const stopped = uploaded.find((event) => event.event_type === "host_agent_status");
    expect(heartbeat?.sequence).toBe(1);
    expect(stopped?.sequence).toBeGreaterThan(heartbeat?.sequence ?? 0);
  });

  it("does not expose secret material in status output", async () => {
    const transport = new RecordingTransport();
    const agent = makeAgent(configDir(), transport, { incidentId: INCIDENT_ID });
    await agent.emitPresenceOnce();

    const serialized = JSON.stringify(agent.status());
    expect(serialized).not.toContain(CREDENTIAL);
    expect(serialized).not.toContain("PRIVATE KEY");
    expect(agent.status().hostId).toBe(HOST_ID);
    expect(transport.presence).toHaveLength(1);
  });

  it("sends a stopped status event during a graceful shutdown", async () => {
    const transport = new RecordingTransport();
    const agent = makeAgent(configDir(), transport, {
      incidentId: INCIDENT_ID,
      shutdownFlushMs: 1_000,
    });

    await agent.emitHeartbeatOnce();
    await agent.uploadOnce();
    await agent.stop();

    const uploaded = transport.events.map(
      (raw) => JSON.parse(raw) as { event_type: string; payload: { status?: string } },
    );
    expect(uploaded.some((event) => event.payload.status === "stopped")).toBe(true);
  });
});
