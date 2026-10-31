import { createHash } from "node:crypto";

import { canonicalJsonBytes } from "@incident-witness/protocol";
import type { PoolClient } from "pg";

import { ApiError } from "../errors.js";
import { hmacSha256 } from "./tokens.js";

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyRecord = {
  requestHash: Buffer;
  responseStatus: number;
  resourceId: string;
};

export function requireIdempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "A valid Idempotency-Key header is required.",
    );
  }

  if (!/^[\x21-\x7E]+$/.test(value)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "A valid Idempotency-Key header is required.",
    );
  }

  return value;
}

export function idempotencyKeyHash(pepper: string, key: string): Buffer {
  return hmacSha256(pepper, `idempotency:${key}`);
}

export function requestHash(body: unknown): Buffer {
  return createHash("sha256").update(canonicalJsonBytes(body)).digest();
}

export async function findIdempotencyRecord(
  client: PoolClient,
  ownerUserId: string,
  operation: string,
  keyHash: Buffer,
): Promise<IdempotencyRecord | null> {
  const result = await client.query<{
    request_hash: Buffer;
    response_status: number;
    resource_id: string;
  }>(
    `select request_hash, response_status, resource_id
       from idempotency_records
      where owner_user_id = $1
        and operation = $2
        and key_hash = $3
        and expires_at > now()`,
    [ownerUserId, operation, keyHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    requestHash: row.request_hash,
    responseStatus: row.response_status,
    resourceId: row.resource_id,
  };
}

export async function insertIdempotencyRecord(
  client: PoolClient,
  input: {
    ownerUserId: string;
    operation: string;
    keyHash: Buffer;
    requestHash: Buffer;
    responseStatus: number;
    resourceId: string;
  },
): Promise<void> {
  await client.query(
    `insert into idempotency_records
       (owner_user_id, operation, key_hash, request_hash, response_status, resource_id, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + interval '24 hours')`,
    [
      input.ownerUserId,
      input.operation,
      input.keyHash,
      input.requestHash,
      input.responseStatus,
      input.resourceId,
    ],
  );
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== "23505") return false;
  if (constraint === undefined) return true;
  return candidate.constraint === constraint;
}
