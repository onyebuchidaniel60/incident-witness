import { isIP } from "node:net";

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}

function inIpv4Range(value: number, base: string, prefix: number): boolean {
  const baseValue = ipv4ToNumber(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
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

const BLOCKED_IPV6_PREFIXES: Array<{ bytes: number[]; prefix: number }> = [
  { bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 96 }, // ::/96 including ::1
  { bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0], prefix: 96 }, // ::ffff:0:0/96
  { bytes: [0x01, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 64 }, // 100::/64 discard
  { bytes: [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 96 }, // 64:ff9b::/96
  { bytes: [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 48 }, // 64:ff9b:1::/48
  { bytes: [0x20, 0x01, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 32 }, // 2001::/32 Teredo
  { bytes: [0x20, 0x01, 0x00, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 48 }, // 2001:2::/48 benchmark
  { bytes: [0x20, 0x01, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 28 }, // 2001:10::/28 ORCHID
  { bytes: [0x20, 0x01, 0x00, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 28 }, // 2001:20::/28 ORCHIDv2
  { bytes: [0x20, 0x01, 0x00, 0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 28 }, // 2001:30::/28 ORCHIDv2
  { bytes: [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 32 }, // 2001:db8::/32
  { bytes: [0x20, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 16 }, // 2002::/16 6to4
  { bytes: [0x3f, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 20 }, // 3fff::/20 documentation
  { bytes: [0x5f, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 16 }, // 5f00::/16 SRv6
  { bytes: [0xfc, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 7 }, // fc00::/7
  { bytes: [0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 10 }, // fe80::/10
  { bytes: [0xff, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 8 }, // ff00::/8
];

function parseHextets(value: string): number[] | null {
  const parts = value.length === 0 ? [] : value.split(":");
  const output: number[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    if (part.length === 0) return null;

    if (part.includes(".")) {
      if (index !== parts.length - 1) return null;
      const ipv4 = ipv4ToNumber(part);
      if (ipv4 === null) return null;
      output.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    output.push(Number.parseInt(part, 16));
  }

  return output;
}

export function parseIpv6(address: string): Uint8Array | null {
  if (address.includes("%")) return null;

  const zones = address.split("::");
  if (zones.length > 2) return null;

  const left = parseHextets(zones[0] ?? "");
  const right = parseHextets(zones[1] ?? "");
  if (left === null || right === null) return null;

  let groups: number[];
  if (zones.length === 1) {
    if (left.length !== 8) return null;
    groups = left;
  } else {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    const group = groups[index] ?? 0;
    bytes[index * 2] = (group >>> 8) & 0xff;
    bytes[index * 2 + 1] = group & 0xff;
  }
  return bytes;
}

function hasPrefix(bytes: Uint8Array, prefix: number, expected: number[]): boolean {
  let remaining = prefix;
  for (let index = 0; index < expected.length && remaining > 0; index += 1) {
    const bits = Math.min(8, remaining);
    const mask = (0xff << (8 - bits)) & 0xff;
    if (((bytes[index] ?? 0) & mask) !== ((expected[index] ?? 0) & mask)) return false;
    remaining -= bits;
  }
  return true;
}

export function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 0) return true;

  if (version === 4) {
    const value = ipv4ToNumber(address);
    if (value === null) return true;
    return BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Range(value, base, prefix));
  }

  const bytes = parseIpv6(address);
  if (!bytes) return true;

  const firstTenZero = bytes.slice(0, 10).every((byte) => byte === 0);
  if (firstTenZero && bytes[10] === 0xff && bytes[11] === 0xff) return true; // IPv4-mapped
  if (bytes.slice(0, 12).every((byte) => byte === 0)) return true; // ::/96

  return BLOCKED_IPV6_PREFIXES.some(({ bytes: expected, prefix }) =>
    hasPrefix(bytes, prefix, expected),
  );
}

export function isPublicIp(address: string): boolean {
  return isIP(address) !== 0 && !isBlockedIp(address);
}
