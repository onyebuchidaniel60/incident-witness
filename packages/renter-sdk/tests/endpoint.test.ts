import { describe, expect, it } from "vitest";

import {
  HEALTH_EXPECTED_BODY,
  HEALTH_PATH,
  HealthTransportError,
  HttpsHealthChecker,
  normalizeEndpointHostname,
  type HealthTransport,
} from "../src/endpoint.js";

describe("renter endpoint health check", () => {
  const hostname = "gpu.example.com";

  function checker(transport: HealthTransport) {
    return new HttpsHealthChecker({ transport, now: () => 1_000 });
  }

  it("accepts only the exact fixed health contract", async () => {
    const observed = await checker(async (options) => {
      expect(options.hostname).toBe(hostname);
      expect(options.timeoutMs).toBe(3_000);
      expect(options.maxBodyBytes).toBe(1_024);
      expect(HEALTH_PATH).toBe("/.well-known/incident-witness/health");
      return {
        statusCode: 200,
        contentType: "text/plain; charset=utf-8",
        body: Buffer.from(HEALTH_EXPECTED_BODY, "utf8"),
      };
    }).check(hostname);

    expect(observed).toEqual({ result: "reachable", latencyMs: 0 });
  });

  it("treats redirects, wrong status, content type and body as HTTP errors", async () => {
    for (const response of [
      { statusCode: 301, contentType: "text/plain", body: Buffer.from("") },
      { statusCode: 404, contentType: "text/plain", body: Buffer.from("") },
      { statusCode: 200, contentType: "text/html", body: Buffer.from(HEALTH_EXPECTED_BODY) },
      { statusCode: 200, contentType: "text/plain", body: Buffer.from("wrong\n") },
    ]) {
      const observed = await checker(async () => response).check(hostname);
      expect(observed.result).toBe("http_error");
      expect(observed.failureCategory).toBe("http");
    }
  });

  it("maps transport failures to bounded categories", async () => {
    const cases = [
      ["PROBE_TIMEOUT", "timeout", "timeout"],
      ["TLS_ERROR", "tls_error", "tls"],
      ["DNS_ERROR", "unreachable", "dns"],
      ["BODY_TOO_LARGE", "http_error", "http"],
      ["NETWORK_ERROR", "unreachable", "network"],
    ] as const;

    for (const [code, result, category] of cases) {
      const observed = await checker(async () => {
        throw new HealthTransportError(code, "test");
      }).check(hostname);
      expect(observed.result).toBe(result);
      expect(observed.failureCategory).toBe(category);
    }
  });

  it("validates the endpoint hostname and rejects IP literals", async () => {
    expect(normalizeEndpointHostname("GPU.Example.com.")).toBe("gpu.example.com");
    for (const invalid of ["", "127.0.0.1", "::1", "localhost", "gpu.example.com:443", "a/b"]) {
      expect(() => normalizeEndpointHostname(invalid)).toThrow();
    }
  });
});
