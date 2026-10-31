import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmacSha256(pepper: string, value: string): Buffer {
  return createHmac("sha256", pepper).update(value, "utf8").digest();
}

export function hmacSha256Hex(pepper: string, value: string): string {
  return hmacSha256(pepper, value).toString("hex");
}

export function constantTimeEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashMatches(pepper: string, value: string, expected: Buffer): boolean {
  return constantTimeEqual(hmacSha256(pepper, value), expected);
}
