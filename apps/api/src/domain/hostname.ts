import { isIP } from "node:net";
import { domainToASCII } from "node:url";

const reservedSuffixes = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "invalid",
  "test",
  "example",
  "onion",
  "home.arpa",
];

const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class HostnameValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostnameValidationError";
  }
}

/**
 * Normalizes a public DNS hostname for endpoint verification.
 *
 * Rejects schemes, paths, ports, credentials, IP literals, single-label names
 * and reserved/special-use suffixes. IDNA conversion is performed with the
 * runtime's UTS #46 implementation; the stored value is lowercase ASCII.
 */
export function normalizeHostname(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new HostnameValidationError("Hostname is required");
  }

  if (/[\s/@\\]/.test(trimmed) || trimmed.includes("://")) {
    throw new HostnameValidationError("Hostname must not contain a scheme, path or credentials");
  }

  if (trimmed.includes(":") || trimmed.includes("[")) {
    throw new HostnameValidationError("Hostname must not contain a port or IP literal");
  }

  const withoutTrailingDot = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  const ascii = domainToASCII(withoutTrailingDot);

  if (!ascii) {
    throw new HostnameValidationError("Hostname is not valid IDNA");
  }

  const hostname = ascii.toLowerCase();

  if (hostname.length > 253) {
    throw new HostnameValidationError("Hostname is longer than 253 characters");
  }

  if (isIP(hostname) !== 0) {
    throw new HostnameValidationError("IP literals are not allowed");
  }

  const labels = hostname.split(".");
  if (labels.length < 2) {
    throw new HostnameValidationError("Hostname must be fully qualified");
  }

  for (const label of labels) {
    if (!labelPattern.test(label)) {
      throw new HostnameValidationError("Hostname contains an invalid label");
    }
  }

  if (reservedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new HostnameValidationError("Hostname uses a reserved or special-use suffix");
  }

  return hostname;
}

export function dnsRecordName(hostname: string): string {
  return `_incident-witness.${hostname}`;
}
