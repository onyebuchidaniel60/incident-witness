import { createHash, createPublicKey, verify } from "node:crypto";

import {
  base64UrlToBytes,
  canonicalJsonBytes,
  parseCanonicalJsonBytes,
} from "@incident-witness/protocol";
import { z } from "zod";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PRESENCE_DOMAIN = Buffer.from("incident-witness-host-presence-v1\n", "utf8");

const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, "Expected RFC3339 UTC timestamp")
  .refine((value) => Number.isFinite(Date.parse(value)), "Timestamp is not a valid date");

export const presenceRequestSchema = z
  .object({
    hostId: z.string().uuid(),
    observedAt: timestampSchema,
    heartbeatSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    agentVersion: z.string().min(1).max(40),
    signature: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .refine((value) => {
        try {
          return base64UrlToBytes(value).length === 64;
        } catch {
          return false;
        }
      }),
  })
  .strict();

export type PresenceRequest = z.infer<typeof presenceRequestSchema>;

export function parsePresenceRequest(raw: Buffer): PresenceRequest {
  const parsed = parseCanonicalJsonBytes(raw);
  return presenceRequestSchema.parse(parsed);
}

export function presenceRequestHash(raw: Buffer): Buffer {
  return createHash("sha256").update(raw).digest();
}

export function verifyPresenceSignature(request: PresenceRequest, publicKey: Buffer): boolean {
  try {
    if (publicKey.length !== 32) return false;

    const { signature, ...unsigned } = request;
    const message = Buffer.concat([
      PRESENCE_DOMAIN,
      Buffer.from(canonicalJsonBytes(unsigned)),
    ]);
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: "der",
      type: "spki",
    });

    return verify(null, message, key, Buffer.from(base64UrlToBytes(signature)));
  } catch {
    return false;
  }
}

export function isPresenceFresh(observedAt: string, now = Date.now()): boolean {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return false;
  return observed >= now - 60_000 && observed <= now + 30_000;
}
