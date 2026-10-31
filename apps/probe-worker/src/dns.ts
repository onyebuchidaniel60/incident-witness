import { lookup as systemLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { isPublicIp } from "./ip.js";

export type DnsAddress = {
  address: string;
  family: 4 | 6;
};

export type DnsResolver = {
  lookup(hostname: string): Promise<DnsAddress[]>;
};

export class DnsLookupError extends Error {
  readonly kind: "nxdomain" | "dns_error";

  constructor(kind: "nxdomain" | "dns_error") {
    super(kind === "nxdomain" ? "The hostname does not exist" : "DNS resolution failed");
    this.name = "DnsLookupError";
    this.kind = kind;
  }
}

export class UnsafeProbeTargetError extends Error {
  readonly code: "IP_LITERAL" | "UNSAFE_ADDRESS" | "NO_ADDRESS" | "INVALID_HOSTNAME";

  constructor(code: "IP_LITERAL" | "UNSAFE_ADDRESS" | "NO_ADDRESS" | "INVALID_HOSTNAME") {
    super(
      code === "IP_LITERAL"
        ? "The probe target must be a hostname"
        : code === "UNSAFE_ADDRESS"
          ? "The probe target resolves to an unsafe address"
          : code === "NO_ADDRESS"
            ? "The probe target has no usable address"
            : "The probe target hostname is invalid",
    );
    this.name = "UnsafeProbeTargetError";
    this.code = code;
  }
}

export class SystemDnsResolver implements DnsResolver {
  async lookup(hostname: string): Promise<DnsAddress[]> {
    try {
      const results = await systemLookup(hostname, { all: true, verbatim: true });
      return results
        .map((row) => ({ address: row.address, family: row.family }))
        .filter((row): row is DnsAddress => row.family === 4 || row.family === 6);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code === "ENOTFOUND" || code === "ENODATA") {
        throw new DnsLookupError("nxdomain");
      }
      throw new DnsLookupError("dns_error");
    }
  }
}

export function normalizeProbeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, "");
  if (trimmed.length < 1 || trimmed.length > 253 || isIP(trimmed) !== 0) {
    throw new UnsafeProbeTargetError("INVALID_HOSTNAME");
  }
  if (trimmed.includes(":") || trimmed.includes("/") || trimmed.includes("%")) {
    throw new UnsafeProbeTargetError("INVALID_HOSTNAME");
  }

  const ascii = domainToASCII(trimmed);
  if (
    !ascii ||
    ascii.length > 253 ||
    ascii === "localhost" ||
    ascii.endsWith(".localhost") ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ascii)
  ) {
    throw new UnsafeProbeTargetError("INVALID_HOSTNAME");
  }

  return ascii;
}

/**
 * Resolves once and accepts only public addresses. A mixed answer containing
 * any blocked address fails closed. The caller must connect to the returned
 * address without resolving again.
 */
export async function resolvePublicAddress(
  hostnameInput: string,
  resolver: DnsResolver = new SystemDnsResolver(),
): Promise<{ hostname: string; address: string; family: 4 | 6 }> {
  const hostname = normalizeProbeHostname(hostnameInput);
  if (isIP(hostname) !== 0) throw new UnsafeProbeTargetError("IP_LITERAL");

  const addresses = await resolver.lookup(hostname);
  if (addresses.length === 0) throw new UnsafeProbeTargetError("NO_ADDRESS");

  for (const result of addresses) {
    if (!isPublicIp(result.address)) {
      throw new UnsafeProbeTargetError("UNSAFE_ADDRESS");
    }
  }

  const selected = addresses[0];
  if (!selected) throw new UnsafeProbeTargetError("NO_ADDRESS");

  return { hostname, address: selected.address, family: selected.family };
}
