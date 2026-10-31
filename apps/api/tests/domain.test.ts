import { canonicalJsonString } from "@incident-witness/protocol";
import { describe, expect, it } from "vitest";

import { HostnameValidationError, normalizeHostname } from "../src/domain/hostname.js";
import { allAddressesPublic, isPublicAddress } from "../src/domain/ip.js";
import {
  isPresenceFresh,
  parsePresenceRequest,
} from "../src/domain/presence.js";

describe("public address classification", () => {
  it("accepts globally routable IPv4 and IPv6 addresses", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects loopback, private, link-local, metadata and reserved ranges", () => {
    const blocked = [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "192.0.2.10",
      "198.51.100.10",
      "203.0.113.10",
      "::1",
      "::",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "2002::1",
      "::ffff:8.8.8.8",
      "::ffff:127.0.0.1",
      "fe80::1%eth0",
      "not-an-ip",
    ];

    for (const address of blocked) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("rejects an address set containing any unsafe address", () => {
    expect(
      allAddressesPublic([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ]),
    ).toBe(false);
    expect(allAddressesPublic([])).toBe(false);
  });
});

describe("hostname normalization", () => {
  it("normalizes case, trailing dot and IDNA labels", () => {
    expect(normalizeHostname("Example.COM.")).toBe("example.com");
    expect(normalizeHostname("bücher.example.com")).toBe("xn--bcher-kva.example.com");
  });

  it("rejects schemes, ports, IP literals, single labels and reserved suffixes", () => {
    const invalid = [
      "https://example.com",
      "example.com:443",
      "127.0.0.1",
      "::1",
      "localhost",
      "service.local",
      "example.invalid",
      "bad_host.example.com",
      "-bad.example.com",
      "bad-.example.com",
    ];

    for (const hostname of invalid) {
      expect(() => normalizeHostname(hostname), hostname).toThrow(HostnameValidationError);
    }
  });
});

describe("presence request parsing", () => {
  const valid = {
    hostId: "00000000-0000-4000-8000-000000000001",
    observedAt: "2026-10-31T00:00:00.000Z",
    heartbeatSequence: 1,
    agentVersion: "0.1.0",
    signature:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };

  it("accepts canonical JSON and rejects duplicate keys or noncanonical bytes", () => {
    expect(parsePresenceRequest(Buffer.from(canonicalJsonString(valid)))).toEqual(valid);

    expect(() =>
      parsePresenceRequest(
        Buffer.from(`{"hostId":"${valid.hostId}","hostId":"${valid.hostId}"}`),
      ),
    ).toThrow();
    expect(() =>
      parsePresenceRequest(Buffer.from(JSON.stringify(valid, null, 2))),
    ).toThrow();
  });

  it("enforces the 60-second past and 30-second future freshness window", () => {
    const now = Date.parse("2026-10-31T00:01:00.000Z");
    expect(isPresenceFresh("2026-10-31T00:00:30.000Z", now)).toBe(true);
    expect(isPresenceFresh("2026-10-31T00:01:30.000Z", now)).toBe(true);
    expect(isPresenceFresh("2026-10-31T00:00:00.000Z", now)).toBe(true);
    expect(isPresenceFresh("2026-10-30T23:59:59.999Z", now)).toBe(false);
    expect(isPresenceFresh("2026-10-31T00:01:31.000Z", now)).toBe(false);
  });
});
