import { generateKeyPairSync, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  activateHost,
  buildSignedEvent,
  createIncident,
  enrollRenter,
  EVENT_CONTENT_TYPE,
  issueRenterInvitation,
  sendRawEvent,
  sendSignedEvent,
} from "./helpers.js";
import {
  inject,
  migrator,
  registerIntegrationHooks,
  tokenA,
} from "./harness.js";

registerIntegrationHooks();

const HOST_HEARTBEAT_PAYLOAD = {
  agent_version: "0.1.0-test",
  os_family: "linux",
  os_version: "6.8",
  uptime_seconds: 100,
  agent_health: "ok",
};

async function hostAndIncident() {
  const host = await activateHost(
    tokenA,
    "Event host",
    `events-${randomUUID()}.example.com`,
  );
  const incident = await createIncident(tokenA, host.hostId);
  expect(incident.statusCode).toBe(201);
  const data = incident.json().data as {
    incidentId: string;
    captureStartedAt: string;
    captureEndsAt: string;
  };
  return {
    host,
    incidentId: data.incidentId,
    captureStartedAt: Date.parse(data.captureStartedAt),
    captureEndsAt: Date.parse(data.captureEndsAt),
  };
}

function at(base: number, offsetMs: number): string {
  return new Date(base + offsetMs).toISOString();
}

describe("signed event ingestion", () => {
  it("accepts a valid host event and does not update operational presence", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const before = await migrator.query<{ last_agent_seen_at: Date | null }>(
      `select last_agent_seen_at from hosts where id = $1`,
      [host.hostId],
    );

    const { response } = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({
      accepted: true,
      duplicate: false,
    });

    const stored = await migrator.query<{ count: string }>(
      `select count(*)::text as count from evidence_events where incident_id = $1`,
      [incidentId],
    );
    expect(stored.rows[0]!.count).toBe("1");

    const incident = await migrator.query<{ accepted_event_count: number }>(
      `select accepted_event_count from incidents where id = $1`,
      [incidentId],
    );
    expect(incident.rows[0]!.accepted_event_count).toBe(1);

    const after = await migrator.query<{ last_agent_seen_at: Date | null }>(
      `select last_agent_seen_at from hosts where id = $1`,
      [host.hostId],
    );
    expect(after.rows[0]!.last_agent_seen_at?.toISOString()).toBe(
      before.rows[0]!.last_agent_seen_at?.toISOString(),
    );
  });

  it("returns the prior receipt for an exact duplicate and does not append twice", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const event = buildSignedEvent({
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
    });

    const first = await sendRawEvent("/v1/agent/events", host.credential, event.raw);
    expect(first.statusCode).toBe(202);

    const second = await sendRawEvent("/v1/agent/events", host.credential, event.raw);
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toMatchObject({
      eventId: event.envelope.event_id,
      duplicate: true,
    });

    const stored = await migrator.query<{ count: string }>(
      `select count(*)::text as count from evidence_events where incident_id = $1`,
      [incidentId],
    );
    expect(stored.rows[0]!.count).toBe("1");
  });

  it("rejects the same event ID with different bytes and sequence reuse", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const eventId = randomUUID();
    const first = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
      eventId,
    });
    expect(first.response.statusCode).toBe(202);

    const changed = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: { ...HOST_HEARTBEAT_PAYLOAD, uptime_seconds: 200 },
      sequence: 2,
      observedAt: at(captureStartedAt, 200),
      eventId,
    });
    expect(changed.response.statusCode).toBe(409);
    expect(changed.response.json().error.code).toBe("EVENT_CONFLICT");

    const reusedSequence = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 300),
    });
    expect(reusedSequence.response.statusCode).toBe(409);
    expect(reusedSequence.response.json().error.code).toBe("EVENT_CONFLICT");
  });

  it("rejects an invalid Ed25519 signature", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const wrongKey = generateKeyPairSync("ed25519").privateKey;

    const { response } = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: wrongKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
    });

    expect(response.statusCode).toBe(422);
  });

  it("rejects noncanonical raw bytes and duplicate JSON properties", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const event = buildSignedEvent({
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
    });

    const whitespace = await sendRawEvent(
      "/v1/agent/events",
      host.credential,
      Buffer.from(event.raw.toString("utf8").replace('{"', '{ "')),
    );
    expect(whitespace.statusCode).toBe(422);
    expect(whitespace.json().error.code).toBe("VALIDATION_ERROR");

    const duplicateKey = event.raw
      .toString("utf8")
      .replace('"protocol_version":"1.0"', '"protocol_version":"1.0","protocol_version":"1.0"');
    const duplicate = await sendRawEvent(
      "/v1/agent/events",
      host.credential,
      Buffer.from(duplicateKey),
    );
    expect(duplicate.statusCode).toBe(422);
  });

  it("rejects observations outside the capture window", async () => {
    const { host, incidentId, captureStartedAt, captureEndsAt } = await hostAndIncident();

    const before = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, -1000),
    });
    expect(before.response.statusCode).toBe(422);
    expect(before.response.json().error.code).toBe("EVENT_WINDOW_INVALID");

    const after = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 2,
      observedAt: at(captureEndsAt, 1000),
    });
    expect(after.response.statusCode).toBe(422);
  });

  it("uses endedAt for early-ended incidents and rejects excessive future timestamps", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();

    const future = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    expect(future.response.statusCode).toBe(422);
    expect(future.response.json().error.code).toBe("EVENT_WINDOW_INVALID");

    const accepted = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 2,
      observedAt: at(captureStartedAt, 0),
    });
    expect(accepted.response.statusCode).toBe(202);

    const end = await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    expect(end.statusCode).toBe(200);
    const endedAt = Date.parse(end.json().data.endedAt as string);

    const afterEnd = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 3,
      observedAt: new Date(endedAt + 1000).toISOString(),
    });
    expect(afterEnd.response.statusCode).toBe(422);
    expect(afterEnd.response.json().error.code).toBe("EVENT_WINDOW_INVALID");
  });

  it("enforces the 4,000-event budget concurrently", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    await migrator.query(
      `update incidents set accepted_event_count = 3999, accepted_event_bytes = 0 where id = $1`,
      [incidentId],
    );

    const responses = await Promise.all([
      sendSignedEvent("/v1/agent/events", host.credential, {
        incidentId,
        sourceKeyId: host.sourceKeyId,
        sourceType: "host_agent",
        privateKey: host.privateKey,
        eventType: "host_heartbeat",
        payload: HOST_HEARTBEAT_PAYLOAD,
        sequence: 1,
        observedAt: at(captureStartedAt, 100),
      }),
      sendSignedEvent("/v1/agent/events", host.credential, {
        incidentId,
        sourceKeyId: host.sourceKeyId,
        sourceType: "host_agent",
        privateKey: host.privateKey,
        eventType: "host_heartbeat",
        payload: HOST_HEARTBEAT_PAYLOAD,
        sequence: 2,
        observedAt: at(captureStartedAt, 200),
      }),
    ]);

    expect(responses.filter((entry) => entry.response.statusCode === 202)).toHaveLength(1);
    const rejected = responses.filter((entry) => entry.response.statusCode === 409);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.response.json().error.code).toBe("INCIDENT_EVIDENCE_LIMIT");
  });

  it("enforces the 7 MiB aggregate byte budget concurrently", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const measured = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 10,
      observedAt: at(captureStartedAt, 100),
    });
    expect(measured.response.statusCode).toBe(202);

    const counter = await migrator.query<{ accepted_event_bytes: string }>(
      `select accepted_event_bytes from incidents where id = $1`,
      [incidentId],
    );
    const delta = Number(counter.rows[0]!.accepted_event_bytes);
    expect(delta).toBeGreaterThan(0);

    await migrator.query(`delete from evidence_events where incident_id = $1`, [incidentId]);
    await migrator.query(
      `update incidents
          set accepted_event_count = 0,
              accepted_event_bytes = $1
        where id = $2`,
      [7_340_032 - delta, incidentId],
    );

    const responses = await Promise.all([
      sendSignedEvent("/v1/agent/events", host.credential, {
        incidentId,
        sourceKeyId: host.sourceKeyId,
        sourceType: "host_agent",
        privateKey: host.privateKey,
        eventType: "host_heartbeat",
        payload: HOST_HEARTBEAT_PAYLOAD,
        sequence: 11,
        observedAt: at(captureStartedAt, 200),
      }),
      sendSignedEvent("/v1/agent/events", host.credential, {
        incidentId,
        sourceKeyId: host.sourceKeyId,
        sourceType: "host_agent",
        privateKey: host.privateKey,
        eventType: "host_heartbeat",
        payload: HOST_HEARTBEAT_PAYLOAD,
        sequence: 12,
        observedAt: at(captureStartedAt, 300),
      }),
    ]);

    expect(responses.filter((entry) => entry.response.statusCode === 202)).toHaveLength(1);
    const rejected = responses.filter((entry) => entry.response.statusCode === 409);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.response.json().error.code).toBe("INCIDENT_EVIDENCE_LIMIT");
  });

  it("accepts a scoped renter event and rejects cross-incident use", async () => {
    const first = await hostAndIncident();
    const invitation = await issueRenterInvitation(tokenA, first.incidentId);
    expect(invitation.statusCode).toBe(201);
    const renter = await enrollRenter(invitation.json().data.invitationToken as string);
    expect(renter.response.statusCode).toBe(201);
    const renterData = renter.response.json().data as {
      sourceKeyId: string;
      ingestionCredential: string;
    };

    const accepted = await sendSignedEvent(
      "/v1/renter/events",
      renterData.ingestionCredential,
      {
        incidentId: first.incidentId,
        sourceKeyId: renterData.sourceKeyId,
        sourceType: "renter_client",
        privateKey: renter.privateKey,
        eventType: "renter_heartbeat",
        payload: { sdk_version: "0.1.0-test", client_state: "running" },
        sequence: 1,
        observedAt: at(first.captureStartedAt, 100),
      },
    );
    expect(accepted.response.statusCode).toBe(202);

    const second = await hostAndIncident();
    const crossIncident = await sendSignedEvent(
      "/v1/renter/events",
      renterData.ingestionCredential,
      {
        incidentId: second.incidentId,
        sourceKeyId: renterData.sourceKeyId,
        sourceType: "renter_client",
        privateKey: renter.privateKey,
        eventType: "renter_heartbeat",
        payload: { sdk_version: "0.1.0-test", client_state: "running" },
        sequence: 2,
        observedAt: at(second.captureStartedAt, 100),
      },
    );
    expect(crossIncident.response.statusCode).toBe(403);
  });

  it("rejects simulated events in a live incident", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const response = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
      simulationMode: true,
    });
    expect(response.response.statusCode).toBe(422);
    expect(response.response.json().error.code).toBe("EVENT_SIMULATION_NOT_ALLOWED");
  });

  it("rejects the wrong content type and an oversized request", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const event = buildSignedEvent({
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: at(captureStartedAt, 100),
    });

    const wrongType = await inject("POST", "/v1/agent/events", null, event.raw, {
      authorization: `Bearer ${host.credential}`,
      "content-type": "application/json",
    });
    expect(wrongType.statusCode).toBe(415);

    const oversized = await inject(
      "POST",
      "/v1/agent/events",
      null,
      Buffer.concat([event.raw, Buffer.alloc(9000, 0x20)]),
      {
        authorization: `Bearer ${host.credential}`,
        "content-type": EVENT_CONTENT_TYPE,
      },
    );
    expect(oversized.statusCode).toBe(413);
  });
});
