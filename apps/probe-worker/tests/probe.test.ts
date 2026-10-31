import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  HEALTH_EXPECTED_BODY,
  HEALTH_PATH,
  PinnedTransportError,
  probeHostname,
  type PinnedRequestOptions,
  type PinnedTransport,
} from "../src/probe.js";

const TARGET = {
  hostId: "33333333-3333-4333-8333-333333333333",
  hostname: "gpu.example.com",
};

function resolverSequence(addresses: string[][]) {
  let index = 0;
  return {
    calls: () => index,
    resolver: {
      lookup: async () => {
        const answer = addresses[Math.min(index, addresses.length - 1)] ?? [];
        index += 1;
        return answer.map((address) => ({
          address,
          family: address.includes(":") ? (6 as const) : (4 as const),
        }));
      },
    },
  };
}

describe("pinned HTTPS probe", () => {
  it("connects to the first validated IP and never resolves again (DNS rebinding)", async () => {
    const sequence = resolverSequence([["1.1.1.1"], ["10.0.0.1"]]);
    const captured: PinnedRequestOptions[] = [];
    const transport: PinnedTransport = async (options) => {
      captured.push(options);
      return {
        statusCode: 200,
        contentType: "text/plain; charset=utf-8",
        body: Buffer.from(HEALTH_EXPECTED_BODY, "utf8"),
        latencyMs: 8,
      };
    };

    const outcome = await probeHostname(TARGET, {
      resolver: sequence.resolver,
      transport,
    });

    expect(outcome.kind).toBe("result");
    expect(sequence.calls()).toBe(1);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      hostname: "gpu.example.com",
      address: "1.1.1.1",
      family: 4,
      path: HEALTH_PATH,
      method: "GET",
    });
    expect(captured[0]?.headers).toMatchObject({
      Host: "gpu.example.com",
      Accept: "text/plain",
    });
  });

  it("does not follow redirects", async () => {
    const sequence = resolverSequence([["1.1.1.1"]]);
    let calls = 0;
    const transport: PinnedTransport = async () => {
      calls += 1;
      return {
        statusCode: 301,
        contentType: "text/plain",
        body: Buffer.from(""),
        latencyMs: 2,
      };
    };

    const outcome = await probeHostname(TARGET, { resolver: sequence.resolver, transport });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.payload.http_result).toBe("redirect");
      expect(outcome.payload.response_class).toBe("unexpected");
    }
    expect(calls).toBe(1);
  });

  it("maps timeout, TLS and oversized-body failures without leaking target details", async () => {
    const cases = [
      ["TIMEOUT", "timeout", "not_attempted"],
      ["TLS_ERROR", "not_attempted", "invalid"],
      ["BODY_TOO_LARGE", "invalid_body", "valid"],
      ["NETWORK_ERROR", "error", "not_attempted"],
    ] as const;

    for (const [code, httpResult, tlsResult] of cases) {
      const sequence = resolverSequence([["1.1.1.1"]]);
      const transport: PinnedTransport = async () => {
        throw new PinnedTransportError(code, "test");
      };
      const outcome = await probeHostname(TARGET, {
        resolver: sequence.resolver,
        transport,
      });
      expect(outcome.kind).toBe("result");
      if (outcome.kind === "result") {
        expect(outcome.payload.http_result).toBe(httpResult);
        expect(outcome.payload.tls_result).toBe(tlsResult);
        expect(JSON.stringify(outcome.payload)).not.toContain("1.1.1.1");
        expect(JSON.stringify(outcome.payload)).not.toContain("gpu.example.com");
      }
    }
  });

  it("ignores proxy environment variables and pins host/servername in the client", () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:9";
    process.env.HTTP_PROXY = "http://127.0.0.1:9";

    const source = readFileSync(new URL("../src/probe.ts", import.meta.url), "utf8");
    expect(source).toContain("host: options.address");
    expect(source).toContain("servername: options.hostname");
    expect(source).toContain("new Agent({ keepAlive: false })");
    expect(source).not.toContain("HTTPS_PROXY");
    expect(source).not.toContain("HTTP_PROXY");
    expect(source).not.toContain("proxy-agent");
  });

  it("accepts only the exact expected health response", async () => {
    for (const response of [
      { statusCode: 200, contentType: "text/plain", body: Buffer.from("wrong\n") },
      { statusCode: 200, contentType: "text/html", body: Buffer.from(HEALTH_EXPECTED_BODY) },
      { statusCode: 204, contentType: "text/plain", body: Buffer.from("") },
    ]) {
      const sequence = resolverSequence([["1.1.1.1"]]);
      const outcome = await probeHostname(TARGET, {
        resolver: sequence.resolver,
        transport: async () => ({ ...response, latencyMs: 1 }),
      });
      expect(outcome.kind).toBe("result");
      if (outcome.kind === "result") {
        expect(outcome.payload.probe_status).toBe("failed");
      }
    }
  });
});
