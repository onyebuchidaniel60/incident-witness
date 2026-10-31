import { statSync } from "node:fs";
import { join } from "node:path";

import { eventEnvelopeSchema, type EventEnvelope } from "@incident-witness/protocol";
import { verifyEventEnvelope } from "@incident-witness/protocol/node";
import { afterEach, describe, expect, it } from "vitest";

import { RenterClient, type RenterIntervals } from "../src/client.js";
import { statePath } from "../src/state.js";
import {
  CREDENTIAL,
  FakeEndpointChecker,
  FakeRenterTransport,
  INCIDENT_ID,
  SOURCE_KEY_ID,
  SESSION_ENDS_AT,
  makeTempDir,
  removeTempDir,
} from "./helpers.js";

const START = "2026-10-31T12:00:00.000Z";

describe("RenterClient", () => {
  const directories: string[] = [];
  const clients: RenterClient[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      try {
        await client.stop();
      } catch {
        // already stopped
      }
    }
    for (const directory of directories.splice(0)) removeTempDir(directory);
  });

  function newStateDir(): string {
    const directory = makeTempDir();
    directories.push(directory);
    return join(directory, "sdk-state");
  }

  function fixedClock(initial = START) {
    let current = new Date(initial);
    return {
      now: () => new Date(current),
      set: (value: string) => {
        current = new Date(value);
      },
    };
  }

  async function enroll(
    options: {
      transport?: FakeRenterTransport;
      stateDir?: string;
      now?: () => Date;
      intervals?: Partial<RenterIntervals>;
      queueLimitBytes?: number;
      endpointChecker?: FakeEndpointChecker;
    } = {},
  ) {
    const transport = options.transport ?? new FakeRenterTransport();
    const clock = options.now ? null : fixedClock();
    const client = await RenterClient.enroll({
      apiBaseUrl: "http://127.0.0.1:4000",
      invitationToken: "one-time-invitation",
      endpointHostname: "gpu.example.com",
      ...(options.stateDir === undefined ? {} : { stateDir: options.stateDir }),
      transport,
      endpointChecker: options.endpointChecker ?? new FakeEndpointChecker(),
      now: options.now ?? clock!.now,
      intervals: { heartbeatMs: 30_000, endpointMs: 60_000, ...options.intervals },
      ...(options.queueLimitBytes === undefined
        ? {}
        : { queueLimitBytes: options.queueLimitBytes }),
      shutdownFlushMs: 1_000,
    });
    clients.push(client);
    return { client, transport, clock };
  }

  function parse(raw: string): EventEnvelope {
    return eventEnvelopeSchema.parse(JSON.parse(raw));
  }

  it("emits scoped, signed renter heartbeats and uploads them", async () => {
    const transport = new FakeRenterTransport();
    const { client } = await enroll({ transport });

    expect(client.status()).toMatchObject({
      incidentId: INCIDENT_ID,
      sourceKeyId: SOURCE_KEY_ID,
      queueEvents: 0,
    });
    expect(client.emitHeartbeatOnce()).toBe(true);
    expect(client.status().queueEvents).toBe(1);

    const result = await client.flushOnce();
    expect(result.kind).toBe("uploaded");
    expect(transport.uploaded[0]?.credential).toBe(CREDENTIAL);
    expect(transport.uploaded).toHaveLength(1);
    expect(client.status().queueEvents).toBe(0);

    const envelope = parse(transport.uploaded[0]?.raw ?? "");
    expect(envelope.incident_id).toBe(INCIDENT_ID);
    expect(envelope.source_key_id).toBe(SOURCE_KEY_ID);
    expect(envelope.source_type).toBe("renter_client");
    expect(envelope.event_type).toBe("renter_heartbeat");
    expect(envelope.sequence).toBe(1);

    const publicKey = transport.enrollRequests[0]?.publicKey ?? "";
    expect(await verifyEventEnvelope(envelope, publicKey)).toBe(true);
  });

  it("keeps a bounded queue and reports dropped observations", async () => {
    const transport = new FakeRenterTransport();
    transport.eventResult = { kind: "retryable", status: 503, code: "DEPENDENCY_UNAVAILABLE" };
    const { client } = await enroll({ transport, queueLimitBytes: 2_000 });

    for (let index = 0; index < 8; index += 1) {
      expect(client.emitHeartbeatOnce()).toBe(true);
    }

    const status = client.status();
    expect(status.queueBytes).toBeLessThanOrEqual(2_000);
    expect(status.droppedEvents).toBeGreaterThan(0);
    expect(status.queueEvents).toBeGreaterThan(0);
  });

  it("recovers a persisted queue and sequence after restart", async () => {
    const stateDir = newStateDir();
    const offline = new FakeRenterTransport();
    offline.eventResult = { kind: "retryable", status: 503, code: "DEPENDENCY_UNAVAILABLE" };
    const { client } = await enroll({ transport: offline, stateDir });

    client.emitHeartbeatOnce();
    client.emitHeartbeatOnce();
    expect((await client.flushOnce()).kind).toBe("retry");
    await client.stop();

    expect(statSync(stateDir).mode & 0o777).toBe(0o700);
    expect(statSync(statePath(stateDir)).mode & 0o777).toBe(0o600);

    const online = new FakeRenterTransport();
    const resumed = RenterClient.resume({
      stateDir,
      transport: online,
      endpointChecker: new FakeEndpointChecker(),
      now: () => new Date(START),
      shutdownFlushMs: 1_000,
    });
    clients.push(resumed);

    expect(resumed.status().queueEvents).toBe(2);
    expect(resumed.status().nextSequence).toBe(3);

    await resumed.flushOnce();
    await resumed.flushOnce();

    expect(online.uploaded).toHaveLength(2);
    expect(online.uploaded.map((entry) => parse(entry.raw).sequence)).toEqual([1, 2]);
    expect(resumed.status().queueEvents).toBe(0);
  });

  it("stops creating events after the capture window but flushes during grace", async () => {
    const transport = new FakeRenterTransport();
    transport.eventResult = { kind: "retryable", status: 503, code: "DEPENDENCY_UNAVAILABLE" };
    const clock = fixedClock("2026-10-31T12:29:50.000Z");
    const { client } = await enroll({ transport, now: clock.now });

    expect(client.emitHeartbeatOnce()).toBe(true);
    clock.set(SESSION_ENDS_AT);
    expect(client.emitHeartbeatOnce()).toBe(false);
    expect(client.status().queueEvents).toBe(1);

    transport.eventResult = { kind: "accepted", status: 202 };
    expect((await client.flushOnce()).kind).toBe("uploaded");
  });

  it("halts at the ingestion deadline and after INCIDENT_CLOSED", async () => {
    const deadlineTransport = new FakeRenterTransport();
    const lateClock = fixedClock("2026-11-01T12:30:01.000Z");
    const { client: late } = await enroll({ transport: deadlineTransport, now: lateClock.now });
    late.start();
    expect(late.status().haltedReason).toBe("INGESTION_DEADLINE");

    const closedTransport = new FakeRenterTransport();
    const { client: closed } = await enroll({ transport: closedTransport });
    closed.emitHeartbeatOnce();
    closedTransport.eventResult = {
      kind: "incident_closed",
      status: 409,
      code: "INCIDENT_CLOSED",
    };

    expect((await closed.flushOnce()).kind).toBe("halted");
    expect(closed.status().haltedReason).toBe("INCIDENT_CLOSED");
    expect(closed.status().queueEvents).toBe(1);
    expect((await closed.flushOnce()).kind).toBe("halted");
    expect(closedTransport.uploaded).toHaveLength(1);
  });

  it("emits endpoint results on state change and the 60-second interval", async () => {
    const transport = new FakeRenterTransport();
    const checker = new FakeEndpointChecker();
    const clock = fixedClock();
    const { client } = await enroll({ transport, endpointChecker: checker, now: clock.now });

    expect(await client.checkEndpointOnce()).toBe(true);
    expect(await client.checkEndpointOnce()).toBe(false);

    checker.result = { result: "unreachable", latencyMs: 150, failureCategory: "network" };
    expect(await client.checkEndpointOnce()).toBe(true);
    expect(await client.checkEndpointOnce()).toBe(false);

    clock.set("2026-10-31T12:01:01.000Z");
    expect(await client.checkEndpointOnce()).toBe(true);

    expect(client.status().queueEvents).toBe(3);
    expect(client.status().lastEndpointResult).toBe("unreachable");
  });

  it("rejects an invalid endpoint hostname before redemption", async () => {
    const transport = new FakeRenterTransport();
    await expect(
      RenterClient.enroll({
        apiBaseUrl: "http://127.0.0.1:4000",
        invitationToken: "one-time-invitation",
        endpointHostname: "127.0.0.1",
        transport,
      }),
    ).rejects.toThrow(/hostname/i);
    expect(transport.enrollRequests).toHaveLength(0);
  });
});
