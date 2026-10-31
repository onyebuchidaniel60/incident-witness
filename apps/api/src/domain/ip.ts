import { BlockList, isIP } from "node:net";

export type ResolvedAddress = {
  address: string;
  family: number;
};

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();

const ipv4Ranges: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const ipv6Ranges: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 8],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

for (const [network, prefix] of ipv4Ranges) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of ipv6Ranges) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

/**
 * Returns true only for globally routable unicast addresses.
 *
 * IPv4-mapped IPv6 is always rejected, including addresses whose embedded
 * IPv4 value would otherwise be public. Zone identifiers are rejected.
 */
export function isPublicAddress(address: string): boolean {
  if (!address || address.includes("%")) return false;

  const family = isIP(address);
  if (family === 4) {
    return !blockedIpv4.check(address, "ipv4");
  }
  if (family === 6) {
    return !blockedIpv6.check(address, "ipv6");
  }

  return false;
}

export function allAddressesPublic(addresses: ResolvedAddress[]): boolean {
  return addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address));
}
