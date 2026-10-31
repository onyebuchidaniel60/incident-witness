import { readFile } from "node:fs/promises";

import type { JwtVerifier } from "../auth/jwt.js";
import type { AppConfig } from "../config.js";
import type { ResolvedAddress } from "../domain/ip.js";
import type { DnsResolver } from "../services/dns.js";
import type { EndpointChecker } from "../services/endpoint.js";

export const E2E_TEST_USER_ID =
  process.env.IW_E2E_USER_ID ?? "f4444444-4444-4444-8444-444444444444";

const E2E_TOKEN = process.env.IW_E2E_TOKEN ?? "e2e-provider-token";

type DnsFile = {
  txt?: Record<string, string[]>;
  addresses?: Record<string, ResolvedAddress[]>;
};

/**
 * Test-only DNS adapter. It reads a local JSON file written by the Playwright
 * setup after the UI displays a one-time challenge. It never performs network
 * DNS or accepts values from the browser.
 */
class FileBackedDnsResolver implements DnsResolver {
  constructor(private readonly path: string) {}

  private async read(): Promise<DnsFile> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as DnsFile;
    } catch {
      return {};
    }
  }

  async resolveTxt(name: string): Promise<string[][]> {
    const file = await this.read();
    const values = file.txt?.[name];
    if (!values || values.length === 0) {
      const error = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      throw error;
    }
    return values.map((value) => [value]);
  }

  async lookup(name: string): Promise<ResolvedAddress[]> {
    const file = await this.read();
    const addresses = file.addresses?.[name];
    if (!addresses || addresses.length === 0) {
      const error = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      throw error;
    }
    return addresses;
  }
}

const e2eEndpointChecker: EndpointChecker = {
  async check() {
    return { ok: true };
  },
};

const e2eJwtVerifier: JwtVerifier = async (token) => {
  if (token !== E2E_TOKEN) throw new Error("invalid e2e token");
  return {
    id: E2E_TEST_USER_ID,
    claims: {
      sub: E2E_TEST_USER_ID,
      iss: "https://phase4-e2e.invalid/auth/v1",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  };
};

export type E2eRuntime = {
  jwtVerifier: JwtVerifier;
  dnsResolver: DnsResolver;
  endpointChecker: EndpointChecker;
};

/**
 * Returns test adapters only when the API is explicitly started in test mode.
 * Production/development processes receive null and use the real JWT/JWKS,
 * DNS and HTTPS health-check implementations.
 */
export function createE2eRuntime(config: AppConfig): E2eRuntime | null {
  if (config.nodeEnv !== "test" || process.env.IW_E2E_TEST_AUTH !== "true") {
    return null;
  }

  const dnsFile = process.env.IW_E2E_DNS_FILE;
  if (!dnsFile) {
    throw new Error("IW_E2E_DNS_FILE is required when IW_E2E_TEST_AUTH is enabled");
  }

  return {
    jwtVerifier: e2eJwtVerifier,
    dnsResolver: new FileBackedDnsResolver(dnsFile),
    endpointChecker: e2eEndpointChecker,
  };
}
