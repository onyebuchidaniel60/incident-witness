import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { createE2eRuntime } from "../src/testing/e2e.js";

const originalAuth = process.env.IW_E2E_TEST_AUTH;
const originalDns = process.env.IW_E2E_DNS_FILE;

afterEach(() => {
  if (originalAuth === undefined) delete process.env.IW_E2E_TEST_AUTH;
  else process.env.IW_E2E_TEST_AUTH = originalAuth;
  if (originalDns === undefined) delete process.env.IW_E2E_DNS_FILE;
  else process.env.IW_E2E_DNS_FILE = originalDns;
});

describe("e2e runtime guard", () => {
  it("never enables test adapters in production, even when the flag is set", () => {
    process.env.IW_E2E_TEST_AUTH = "true";
    process.env.IW_E2E_DNS_FILE = "/tmp/never-used-dns.json";
    expect(createE2eRuntime({ nodeEnv: "production" } as AppConfig)).toBeNull();
  });

  it("requires both test mode and the explicit flag", () => {
    delete process.env.IW_E2E_TEST_AUTH;
    process.env.IW_E2E_DNS_FILE = "/tmp/never-used-dns.json";
    expect(createE2eRuntime({ nodeEnv: "test" } as AppConfig)).toBeNull();
  });

  it("returns local adapters only in test mode with a DNS file", () => {
    process.env.IW_E2E_TEST_AUTH = "true";
    process.env.IW_E2E_DNS_FILE = "/tmp/phase4-e2e-dns.json";
    const runtime = createE2eRuntime({ nodeEnv: "test" } as AppConfig);
    expect(runtime).not.toBeNull();
    expect(runtime?.jwtVerifier).toBeTypeOf("function");
    expect(runtime?.dnsResolver).toBeDefined();
    expect(runtime?.endpointChecker).toBeDefined();
  });

  it("fails closed when test mode is requested without a DNS file", () => {
    process.env.IW_E2E_TEST_AUTH = "true";
    delete process.env.IW_E2E_DNS_FILE;
    expect(() => createE2eRuntime({ nodeEnv: "test" } as AppConfig)).toThrow(
      "IW_E2E_DNS_FILE is required",
    );
  });
});
