import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { base64UrlToBytes } from "@incident-witness/protocol";
import { sha256Base64Url } from "@incident-witness/protocol/node";

export const DEFAULT_TRUST_SET_PATH = fileURLToPath(
  new URL("../trusted-platform-keys.json", import.meta.url),
);

export type TrustedPlatformKey = {
  platformKeyId: string;
  publicKey: string;
  fingerprint: string;
  status: "active" | "retired" | "revoked";
  note?: string;
};

export type TrustSet = {
  version: 1;
  keys: Map<string, TrustedPlatformKey>;
  path: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(source: Record<string, unknown>, name: string): string | null {
  const value = source[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Loads the verifier's pinned platform-key trust set. A public key is trusted
 * only when it appears in this local file; keys embedded in a bundle are never
 * trusted merely because the bundle contains them.
 */
export async function loadTrustSet(path = DEFAULT_TRUST_SET_PATH): Promise<TrustSet> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`Cannot read trusted platform key set: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Trusted platform key set is not valid JSON: ${path}`);
  }

  const root = record(parsed);
  if (!root || root.trust_set_version !== 1) {
    throw new Error("Trusted platform key set must use trust_set_version 1");
  }

  const keysValue = root.keys;
  if (!Array.isArray(keysValue) || keysValue.length === 0) {
    throw new Error("Trusted platform key set must contain at least one key");
  }

  const keys = new Map<string, TrustedPlatformKey>();
  for (const entry of keysValue) {
    const key = record(entry);
    if (!key) throw new Error("Trusted platform key entry must be an object");

    const platformKeyId = stringField(key, "platform_key_id");
    const publicKey = stringField(key, "public_key");
    const fingerprint = stringField(key, "fingerprint");
    const status = stringField(key, "status");
    const noteValue = key.note;
    const note = typeof noteValue === "string" ? noteValue : undefined;

    if (!platformKeyId || platformKeyId.length > 80) {
      throw new Error("Trusted platform key entry has an invalid platform_key_id");
    }
    if (!publicKey) throw new Error(`Trusted key ${platformKeyId} has no public_key`);
    if (base64UrlToBytes(publicKey).length !== 32) {
      throw new Error(`Trusted key ${platformKeyId} public_key must decode to 32 bytes`);
    }
    if (status !== "active" && status !== "retired" && status !== "revoked") {
      throw new Error(`Trusted key ${platformKeyId} has an unsupported status`);
    }

    const computedFingerprint = sha256Base64Url(base64UrlToBytes(publicKey));
    if (fingerprint && fingerprint !== computedFingerprint) {
      throw new Error(`Trusted key ${platformKeyId} fingerprint does not match its public key`);
    }
    if (keys.has(platformKeyId)) {
      throw new Error(`Trusted platform key set contains duplicate key ${platformKeyId}`);
    }

    keys.set(platformKeyId, {
      platformKeyId,
      publicKey,
      fingerprint: computedFingerprint,
      status,
      ...(note === undefined ? {} : { note }),
    });
  }

  return { version: 1, keys, path };
}
