import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RenterClient } from "../src/client.js";
import { statePath } from "../src/state.js";
import {
  CREDENTIAL,
  FakeEndpointChecker,
  INCIDENT_ID,
  SOURCE_KEY_ID,
  makeTempDir,
  removeTempDir,
} from "./helpers.js";

type TestServer = {
  url: string;
  close: () => Promise<void>;
  requests: Array<Record<string, unknown>>;
};

async function startServer(
  responder: (body: Record<string, unknown>, response: ServerResponse) => void,
): Promise<TestServer> {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    requests.push(body);
    responder(body, response);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function responseFor(publicKey: string) {
  return {
    data: {
      sourceKeyId: SOURCE_KEY_ID,
      certificate: {
        certificate_version: "1.0",
        source_key_id: SOURCE_KEY_ID,
        source_type: "renter_client",
        public_key: publicKey,
        fingerprint: "test-fingerprint",
        incident_id: INCIDENT_ID,
        issued_at: "2026-10-31T12:00:00.000Z",
        protocol_version: "1.0",
      },
      certificateSignature: "test-certificate-signature",
      ingestionCredential: CREDENTIAL,
      incidentId: INCIDENT_ID,
      sessionEndsAt: "2026-10-31T12:30:00.000Z",
      protocolVersion: "1.0",
    },
  };
}

describe("renter invitation redemption", () => {
  const directories: string[] = [];
  const servers: TestServer[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
    for (const directory of directories.splice(0)) removeTempDir(directory);
  });

  function newDir(): string {
    const directory = makeTempDir();
    directories.push(directory);
    return join(directory, "sdk-state");
  }

  it("redeems once and writes owner-only state without the invitation token", async () => {
    const server = await startServer((body, response) => {
      sendJson(response, 201, responseFor(body.publicKey as string));
    });
    servers.push(server);
    const stateDir = newDir();

    const client = await RenterClient.enroll({
      apiBaseUrl: server.url,
      invitationToken: "one-time-invitation",
      endpointHostname: "gpu.example.com",
      stateDir,
      endpointChecker: new FakeEndpointChecker(),
      now: () => new Date("2026-10-31T12:00:00.000Z"),
    });

    expect(client.status().incidentId).toBe(INCIDENT_ID);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      invitationToken: "one-time-invitation",
      sdkVersion: "0.1.0",
    });
    expect(statSync(stateDir).mode & 0o777).toBe(0o700);
    expect(statSync(statePath(stateDir)).mode & 0o777).toBe(0o600);

    const saved = readFileSync(statePath(stateDir), "utf8");
    expect(saved).not.toContain("one-time-invitation");
    expect(saved).toContain(SOURCE_KEY_ID);
    expect(saved).toContain(INCIDENT_ID);

    await expect(
      RenterClient.enroll({
        apiBaseUrl: server.url,
        invitationToken: "second-invitation",
        endpointHostname: "gpu.example.com",
        stateDir,
        endpointChecker: new FakeEndpointChecker(),
      }),
    ).rejects.toThrow(/already contains an enrolled renter/i);
    expect(server.requests).toHaveLength(1);
  });

  it("surfaces a one-use rejection with a safe code", async () => {
    const server = await startServer((_body, response) => {
      sendJson(response, 409, {
        error: { code: "INVITATION_ALREADY_REDEEMED", message: "Already used." },
      });
    });
    servers.push(server);

    await expect(
      RenterClient.enroll({
        apiBaseUrl: server.url,
        invitationToken: "used-invitation",
        endpointHostname: "gpu.example.com",
        endpointChecker: new FakeEndpointChecker(),
      }),
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_REDEEMED", status: 409 });
  });

  it("rejects a certificate for a different key or incident", async () => {
    const server = await startServer((_body, response) => {
      sendJson(response, 201, responseFor("A".repeat(43)));
    });
    servers.push(server);

    await expect(
      RenterClient.enroll({
        apiBaseUrl: server.url,
        invitationToken: "one-time-invitation",
        endpointHostname: "gpu.example.com",
        endpointChecker: new FakeEndpointChecker(),
      }),
    ).rejects.toThrow(/certificate outside this session scope/i);
  });
});
