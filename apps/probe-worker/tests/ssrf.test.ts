import { describe, expect, it } from "vitest";

import {
  DnsLookupError,
  resolvePublicAddress,
  UnsafeProbeTargetError,
  type DnsResolver,
} from "../src/dns.js";
import { isBlockedIp, isPublicIp, parseIpv6 } from "../src/ip.js";
import { probeHostname, type PinnedRequestOptions, type PinnedTransport } from "../src/probe.js";

const BLOCKED = [
  "0.0.0.0",
  "10.0.0.1",
  "100.64.0.1",
  "127.0.0.1",
  "169.254.169.254",
  "172.16.0.1",
  "192.0.0.1",
  "192.0.2.1",
  "192.88.99.1",
  "192.168.0.1",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "240.0.0.1",
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "64:ff9b::7f00:1",
  "100::1",
  "2001:2::1",
  "2001:10::1",
  "2001:20::1",
  "2001:30::1",
  "2001:db8::1",
  "2002:7f00:1::",
  "fc00::1",
  "fd00:ec2::254",
  "fe80::1",
  "ff02::1",
];

const PUBLIC = [
  "1.1.1.1",
  "8.8.8.8",
  "93.184.216.34",
  "2606:4700:4700::1111",
  "2001:4860:4860::8888",
];

describe("probe IP classification", () => {
  it("blocks loopback, private, link-local, metadata, multicast and reserved ranges", () => {
    for (const address of BLOCKED) {
      expect(isBlockedIp(address), address).toBe(true);
      expect(isPublicIp(address), address).toBe(false);
    }
  });

  it("allows public IPv4 and IPv6 addresses", () => {
    for (const address of PUBLIC) {
      expect(isBlockedIp(address), address).toBe(false);
      expect(isPublicIp(address), address).toBe(true);
    }
  });

  it("parses IPv4-embedded IPv6 and rejects mapped forms", () => {
    expect(parseIpv6("::ffff:127.0.0.1")).not.toBeNull();
    expect(parseIpv6("::1")).not.toBeNull();
    expect(parseIpv6("not-an-ip")).toBeNull();
    expect(parseIpv6("2001:db8:::1")).toBeNull();
  });
});

describe("probe DNS validation", () => {
  function resolver(addresses: string[]): DnsResolver {
    return {
      lookup: async () =>
        addresses.map((address) => ({
          address,
          family: address.includes(":") ? 6 : 4,
        })),
    };
  }

  it("fails closed on a mixed public/private answer", async () => {
    await expect(
      resolvePublicAddress("gpu.example.com", resolver(["1.1.1.1", "10.0.0.1"])),
    ).rejects.toMatchObject({ code: "UNSAFE_ADDRESS" });

    await expect(
      resolvePublicAddress("gpu.example.com", resolver(["1.1.1.1", "::ffff:127.0.0.1"])),
    ).rejects.toMatchObject({ code: "UNSAFE_ADDRESS" });
  });

  it("returns the first validated public address without a second resolution", async () => {
    let calls = 0;
    const fake: DnsResolver = {
      lookup: async () => {
        calls += 1;
        return [{ address: "1.1.1.1", family: 4 }];
      },
    };

    await expect(resolvePublicAddress("gpu.example.com", fake)).resolves.toEqual({
      hostname: "gpu.example.com",
      address: "1.1.1.1",
      family: 4,
    });
    expect(calls).toBe(1);
  });

  it("rejects IP literals and never calls a transport before validation", async () => {
    const calls: PinnedRequestOptions[] = [];
    const transport: PinnedTransport = async (options) => {
      calls.push(options);
      return { statusCode: 200, contentType: "text/plain", body: Buffer.from(""), latencyMs: 0 };
    };

    for (const address of BLOCKED) {
      const outcome = await probeHostname(
        { hostId: "33333333-3333-4333-8333-333333333333", hostname: "gpu.example.com" },
        { resolver: resolver([address]), transport },
      );
      expect(outcome.kind).toBe("result");
      if (outcome.kind === "result") {
        expect(outcome.payload.probe_status).toBe("error");
        expect(outcome.payload.dns_result).toBe("rejected_unsafe");
        expect(outcome.safeErrorCode).toBe("PROBE_UNSAFE_ADDRESS");
      }
    }

    await expect(
      probeHostname(
        { hostId: "33333333-3333-4333-8333-333333333333", hostname: "127.0.0.1" },
        { resolver: resolver(["127.0.0.1"]), transport },
      ),
    ).resolves.toMatchObject({
      kind: "result",
      safeErrorCode: "PROBE_INVALID_HOSTNAME",
    });
    expect(calls).toHaveLength(0);
  });

  it("maps a target NXDOMAIN to a probe result and an infrastructure DNS failure to a gap", async () => {
    const target = {
      hostId: "33333333-3333-4333-8333-333333333333",
      hostname: "gpu.example.com",
    };
    const transport: PinnedTransport = async () => {
      throw new Error("should not connect");
    };

    const nxdomain = await probeHostname(target, {
      resolver: {
        lookup: async () => {
          throw new DnsLookupError("nxdomain");
        },
      },
      transport,
    });
    expect(nxdomain.kind).toBe("result");
    if (nxdomain.kind === "result") {
      expect(nxdomain.payload.dns_result).toBe("nxdomain");
      expect(nxdomain.payload.probe_status).toBe("failed");
    }

    const nx = await probeHostname(target, {
      resolver: {
        lookup: async () => {
          throw new DnsLookupError("dns_error");
        },
      },
      transport,
    });
    expect(nx.kind).toBe("result");
    if (nx.kind === "result") {
      expect(nx.payload.probe_status).toBe("error");
      expect(nx.payload.dns_result).toBe("dns_error");
    }
  });

  it("throws (not silently accepts) an unsafe target", async () => {
    await expect(
      resolvePublicAddress("gpu.example.com", resolver(["169.254.169.254"])),
    ).rejects.toBeInstanceOf(UnsafeProbeTargetError);
  });
});
