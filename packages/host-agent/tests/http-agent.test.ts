import { createPublicKey, verify } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

import {
  base64UrlToBytes,
  canonicalJsonBytes,
  eventEnvelopeSchema,
  parseCanonicalJsonBytes,
  type GpuTelemetryPayload,
} from "@incident-witness/protocol";
import { verifyEventEnvelope } from "@incident-witness/protocol/node";
import { afterEach, describe, expect, it } from "vitest";

import { HostAgent } from "../src/agent.js";
import { enrollAgent } from "../src/enroll.js";
import { PRESENCE_SIGNATURE_DOMAIN, type SignedPresence } from "../src/crypto.js";
import { createLogger } from "../src/log.js";
import { makeTempDir, removeTempDir } from "./helpers.js";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";
const INCIDENT_ID = "33333333-3333-4333-8333-333333333333";
const CREDENTIAL = "k".repeat(43);
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

type MockApi = {
  url: string;
  publicKey: string;
  presenceSequences: number[];
  eventSequences: number[];
  eventBodies: string[];
  eventMode: "ok" | "503";
  close: () => Promise<void>;
};

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function verifyPresence(presence: SignedPresence, publicKeyBase64Url: string): boolean {
  const { signature, ...body } = presence;
  const publicKey = createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(base64UrlToBytes(publicKeyBase64Url))]),
    format: "der",
    type: "spki",
  });
  return verify(
    null,
    Buffer.concat([PRESENCE_SIGNATURE_DOMAIN, Buffer.from(canonicalJsonBytes(body))]),
    publicKey,
    Buffer.from(base64UrlToBytes(signature)),
  );
}

async function startMockApi(): Promise<MockApi> {
  let publicKey = "";
  const presenceSequences: number[] = [];
  const eventSequences: number[] = [];
  const eventBodies: string[] = [];
  const eventIds = new Set<string>();
  const state: { eventMode: "ok" | "503" } = { eventMode: "ok" };

  const server = createServer(async (request, response) => {
    const raw = await readBody(request);

    if (request.url === "/v1/agent/enroll" && request.method === "POST") {
      const body = JSON.parse(raw.toString("utf8")) as {
        publicKey?: string;
        enrollmentCode?: string;
        agentVersion?: string;
        requestId?: string;
      };
      if (
        typeof body.publicKey !== "string" ||
        body.enrollmentCode !== "one-time-code" ||
        typeof body.agentVersion !== "string" ||
        typeof body.requestId !== "string"
      ) {
        sendJson(response, 401, { error: { code: "ENROLLMENT_INVALID" } });
        return;
      }

      publicKey = body.publicKey;
      sendJson(response, 201, {
        data: {
          sourceKeyId: SOURCE_KEY_ID,
          certificate: {
            certificate_version: "1.0",
            source_key_id: SOURCE_KEY_ID,
            source_type: "host_agent",
            public_key: publicKey,
            fingerprint: "test-fingerprint",
            host_id: HOST_ID,
            issued_at: "2026-10-31T12:00:00.000Z",
            protocol_version: "1.0",
          },
          certificateSignature: "test-certificate-signature",
          deviceCredential: CREDENTIAL,
          apiBaseUrl: mockUrl,
          protocolVersion: "1.0",
        },
      });
      return;
    }

    if (request.url === "/v1/agent/heartbeat" && request.method === "POST") {
      if (request.headers.authorization !== `Bearer ${CREDENTIAL}`) {
        sendJson(response, 401, { error: { code: "AUTH_INVALID" } });
        return;
      }

      let presence: SignedPresence;
      try {
        presence = parseCanonicalJsonBytes(raw) as SignedPresence;
      } catch {
        sendJson(response, 422, { error: { code: "VALIDATION_ERROR" } });
        return;
      }

      const previous = presenceSequences.at(-1) ?? 0;
      if (presence.heartbeatSequence <= previous || !verifyPresence(presence, publicKey)) {
        sendJson(response, 409, { error: { code: "PRESENCE_REPLAY" } });
        return;
      }
      presenceSequences.push(presence.heartbeatSequence);
      sendJson(response, 200, {
        data: { accepted: true, serverSeenAt: new Date().toISOString(), duplicate: false },
      });
      return;
    }

    if (request.url === "/v1/agent/events" && request.method === "POST") {
      if (request.headers.authorization !== `Bearer ${CREDENTIAL}`) {
        sendJson(response, 401, { error: { code: "AUTH_INVALID" } });
        return;
      }
      if (state.eventMode === "503") {
        sendJson(response, 503, { error: { code: "DEPENDENCY_UNAVAILABLE" } });
        return;
      }

      eventBodies.push(raw.toString("utf8"));
      let envelope;
      try {
        envelope = eventEnvelopeSchema.parse(parseCanonicalJsonBytes(raw));
      } catch {
        sendJson(response, 422, { error: { code: "VALIDATION_ERROR" } });
        return;
      }

      if (
        eventIds.has(envelope.event_id) ||
        (eventSequences.at(-1) ?? 0) >= envelope.sequence ||
        !(await verifyEventEnvelope(envelope, publicKey))
      ) {
        sendJson(response, 409, { error: { code: "EVENT_CONFLICT" } });
        return;
      }
      eventIds.add(envelope.event_id);
      eventSequences.push(envelope.sequence);
      sendJson(response, 202, {
        data: {
          eventId: envelope.event_id,
          accepted: true,
          receivedAt: new Date().toISOString(),
          duplicate: false,
        },
      });
      return;
    }

    sendJson(response, 404, { error: { code: "RESOURCE_NOT_FOUND" } });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock API did not bind");
  const mockUrl = `http://127.0.0.1:${address.port}`;

  return {
    url: mockUrl,
    get publicKey() {
      return publicKey;
    },
    presenceSequences,
    eventSequences,
    eventBodies,
    get eventMode() {
      return state.eventMode;
    },
    set eventMode(value: "ok" | "503") {
      state.eventMode = value;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe("HTTP agent workflow", () => {
  const directories: string[] = [];
  const agents: HostAgent[] = [];
  const servers: MockApi[] = [];

  afterEach(async () => {
    for (const agent of agents.splice(0)) {
      try {
        await agent.stop();
      } catch {
        // already closed
      }
    }
    for (const server of servers.splice(0)) await server.close();
    for (const directory of directories.splice(0)) removeTempDir(directory);
  });

  it("enrolls, sends presence, uploads signed evidence and retries an outage", async () => {
    const server = await startMockApi();
    servers.push(server);
    const base = makeTempDir();
    directories.push(base);
    const configDir = join(base, "config");

    const summary = await enrollAgent({
      configDir,
      apiBaseUrl: server.url,
      enrollmentCode: "one-time-code",
    });
    expect(summary.hostId).toBe(HOST_ID);

    const agent = new HostAgent({
      configDir,
      incidentId: INCIDENT_ID,
      gpuCollector: {
        collect: async (): Promise<GpuTelemetryPayload> => ({
          collection_status: "unavailable",
        }),
      },
      logger: createLogger({ level: "error", sink: () => undefined }),
      now: () => new Date("2026-10-31T12:00:00.000Z"),
      shutdownFlushMs: 1_000,
    });
    agents.push(agent);

    await agent.emitPresenceOnce();
    await agent.emitHeartbeatOnce();
    await agent.uploadOnce();
    await agent.collectGpuOnce();
    await agent.uploadOnce();

    expect(server.presenceSequences).toEqual([1]);
    expect(server.eventSequences).toEqual([1, 2]);

    const heartbeat = eventEnvelopeSchema.parse(JSON.parse(server.eventBodies[0] ?? "{}"));
    expect(heartbeat.event_type).toBe("host_heartbeat");
    expect(await verifyEventEnvelope(heartbeat, server.publicKey)).toBe(true);

    server.eventMode = "503";
    await agent.emitHeartbeatOnce();
    await agent.uploadOnce();
    expect(agent.status().spool.eventCount).toBe(1);

    server.eventMode = "ok";
    await agent.uploadOnce();
    expect(agent.status().spool.eventCount).toBe(0);
    expect(server.eventSequences).toEqual([1, 2, 3]);
    expect(new Set(server.eventSequences).size).toBe(server.eventSequences.length);
  });
});
