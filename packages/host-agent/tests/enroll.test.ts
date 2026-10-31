import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { configPaths, readDeviceCredential } from "../src/config.js";
import { enrollAgent } from "../src/enroll.js";
import type { EnrollmentError } from "../src/enroll.js";
import { makeTempDir, removeTempDir } from "./helpers.js";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";

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
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
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

function enrollmentResponse(publicKey: string, overrides: Record<string, unknown> = {}) {
  return {
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
      deviceCredential: "g".repeat(43),
      apiBaseUrl: "http://127.0.0.1:4000",
      protocolVersion: "1.0",
      ...overrides,
    },
  };
}

describe("enrollAgent", () => {
  const directories: string[] = [];
  const servers: TestServer[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
    for (const directory of directories.splice(0)) removeTempDir(directory);
  });

  function newDirectory(): string {
    const directory = makeTempDir();
    directories.push(directory);
    return join(directory, "config");
  }

  it("sends the public key and writes the credential and key locally", async () => {
    const server = await startServer((body, response) => {
      sendJson(response, 201, enrollmentResponse(body.publicKey as string));
    });
    servers.push(server);
    const directory = newDirectory();

    const summary = await enrollAgent({
      configDir: directory,
      apiBaseUrl: server.url,
      enrollmentCode: "one-time-code",
    });

    expect(summary.hostId).toBe(HOST_ID);
    expect(summary.sourceKeyId).toBe(SOURCE_KEY_ID);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      enrollmentCode: "one-time-code",
      agentVersion: "0.1.0",
    });
    expect(server.requests[0]?.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(server.requests[0]?.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    expect(readDeviceCredential(directory)).toBe("g".repeat(43));
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    for (const file of [
      configPaths(directory).configFile,
      configPaths(directory).privateKeyFile,
      configPaths(directory).credentialFile,
    ]) {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
    expect(summary).not.toHaveProperty("deviceCredential");
    expect(summary).not.toHaveProperty("privateKey");
  });

  it("surfaces a server rejection as a safe enrollment error", async () => {
    const server = await startServer((_body, response) => {
      sendJson(response, 401, {
        error: { code: "ENROLLMENT_INVALID", message: "The enrollment code is invalid." },
      });
    });
    servers.push(server);

    await expect(
      enrollAgent({
        configDir: newDirectory(),
        apiBaseUrl: server.url,
        enrollmentCode: "bad-code",
      }),
    ).rejects.toMatchObject({
      code: "ENROLLMENT_INVALID",
      status: 401,
    } satisfies Partial<EnrollmentError>);
  });

  it("rejects a certificate that does not match the local public key", async () => {
    const otherPublicKey = "A".repeat(43);
    const server = await startServer((_body, response) => {
      sendJson(response, 201, enrollmentResponse(otherPublicKey));
    });
    servers.push(server);

    await expect(
      enrollAgent({
        configDir: newDirectory(),
        apiBaseUrl: server.url,
        enrollmentCode: "one-time-code",
      }),
    ).rejects.toThrow(/different public key/i);
  });

  it("refuses to enroll over an existing configuration", async () => {
    const server = await startServer((body, response) => {
      sendJson(response, 201, enrollmentResponse(body.publicKey as string));
    });
    servers.push(server);
    const directory = newDirectory();

    await enrollAgent({
      configDir: directory,
      apiBaseUrl: server.url,
      enrollmentCode: "first-code",
    });

    await expect(
      enrollAgent({
        configDir: directory,
        apiBaseUrl: server.url,
        enrollmentCode: "second-code",
      }),
    ).rejects.toThrow(/already contains an enrolled agent/i);
  });
});
