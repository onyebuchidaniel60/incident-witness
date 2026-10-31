import { createHash, randomUUID } from "node:crypto";

import { withProviderTransaction, type TransactionContext } from "@incident-witness/db";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../domain/audit.js";
import {
  findIdempotencyRecord,
  idempotencyKeyHash,
  insertIdempotencyRecord,
  isUniqueViolation,
  requestHash,
  requireIdempotencyKey,
} from "../domain/idempotency.js";
import { allAddressesPublic, type ResolvedAddress } from "../domain/ip.js";
import { dnsRecordName, HostnameValidationError, normalizeHostname } from "../domain/hostname.js";
import { ensureProfile, requireProviderId } from "../domain/provider.js";
import { constantTimeEqual, generateSecret, hmacSha256 } from "../domain/tokens.js";
import { ApiError, sendError } from "../errors.js";
import type { RouteContext } from "./context.js";

const uuidSchema = z.string().uuid();

const aliasSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Alias contains control characters");

const hostnameSchema = z.string().trim().min(1).max(253);

const hostCreateBodySchema = z
  .object({
    alias: aliasSchema,
    hostname: hostnameSchema,
  })
  .strict();

const hostPatchBodySchema = z
  .object({
    alias: aliasSchema,
  })
  .strict();

const challengeVerifyBodySchema = z
  .object({
    challengeId: uuidSchema,
  })
  .strict();

const hostIdParamsSchema = z.object({
  hostId: uuidSchema,
});

type HostRow = {
  id: string;
  alias: string;
  endpoint_hostname: string;
  endpoint_verified_at: Date | null;
  endpoint_dns_fingerprint: string | null;
  status: string;
  agent_version: string | null;
  last_agent_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ChallengeRow = {
  id: string;
  host_id: string;
  challenge_hash: Buffer;
  dns_record_name: string;
  expires_at: Date;
  verified_at: Date | null;
  attempt_count: number;
};

function hostSummary(row: HostRow) {
  return {
    id: row.id,
    alias: row.alias,
    hostname: row.endpoint_hostname,
    status: row.status,
    endpointVerifiedAt: row.endpoint_verified_at,
    agentVersion: row.agent_version,
    lastAgentSeenAt: row.last_agent_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function installInstructions(config: RouteContext["config"], hostId: string): string {
  return `Install the Incident Witness host agent, then redeem a one-time enrollment code from POST /v1/hosts/${hostId}/enrollment-codes. API base URL: ${config.apiBaseUrl}. Host ID: ${hostId}.`;
}

async function loadOwnedHost(
  client: PoolClient,
  hostId: string,
  lock = false,
): Promise<HostRow> {
  const result = await client.query<HostRow>(
    `select id, alias, endpoint_hostname, endpoint_verified_at, endpoint_dns_fingerprint,
            status, agent_version, last_agent_seen_at, created_at, updated_at
       from hosts
      where id = $1
      ${lock ? "for update" : ""}`,
    [hostId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
  }
  return row;
}

function decodeCursor(value: string | undefined): { createdAt: Date; id: string } | null {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") return null;
    const createdAt = new Date(decoded.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || !uuidSchema.safeParse(decoded.id).success) {
      return null;
    }
    return { createdAt, id: decoded.id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString(
    "base64url",
  );
}

async function readHostById(client: PoolClient, hostId: string): Promise<HostRow | null> {
  const result = await client.query<HostRow>(
    `select id, alias, endpoint_hostname, endpoint_verified_at, endpoint_dns_fingerprint,
            status, agent_version, last_agent_seen_at, created_at, updated_at
       from hosts
      where id = $1`,
    [hostId],
  );
  return result.rows[0] ?? null;
}

async function replayHostCreation(
  context: TransactionContext,
  ownerUserId: string,
  operation: string,
  keyHash: Buffer,
  expectedRequestHash: Buffer,
): Promise<{ hostId: string; status: string }> {
  const existing = await findIdempotencyRecord(
    context.client,
    ownerUserId,
    operation,
    keyHash,
  );

  if (!existing) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key could not be replayed.");
  }

  if (!constantTimeEqual(existing.requestHash, expectedRequestHash)) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for a different request.",
    );
  }

  const host = await readHostById(context.client, existing.resourceId);
  if (!host) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "The idempotent resource is no longer available.");
  }

  return { hostId: host.id, status: host.status };
}

export async function registerHostRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  const { apiPool, config, dnsResolver, endpointChecker } = context;
  const operation = "create_host";

  app.get(
    "/v1/hosts",
    {
      preHandler: app.requireAuth,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", minLength: 1, maxLength: 512 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const query = request.query as { limit?: number; cursor?: string };
      const limit = query.limit ?? 50;
      const cursor = decodeCursor(query.cursor);

      if (query.cursor && !cursor) {
        return sendError(
          reply,
          request.id,
          400,
          "VALIDATION_ERROR",
          "The pagination cursor is invalid.",
        );
      }

      const rows = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        const result = await client.query<HostRow>(
          `select id, alias, endpoint_hostname, endpoint_verified_at, endpoint_dns_fingerprint,
                  status, agent_version, last_agent_seen_at, created_at, updated_at
             from hosts
            where ($1::timestamptz is null or (created_at, id) < ($1::timestamptz, $2::uuid))
            order by created_at desc, id desc
            limit $3`,
          [cursor?.createdAt ?? null, cursor?.id ?? null, limit],
        );
        return result.rows;
      });

      const last = rows.at(-1);
      return {
        data: rows.map(hostSummary),
        page: {
          nextCursor:
            rows.length === limit && last ? encodeCursor(last.created_at, last.id) : null,
        },
      };
    },
  );

  app.post(
    "/v1/hosts",
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["alias", "hostname"],
          properties: {
            alias: { type: "string", minLength: 1, maxLength: 80 },
            hostname: { type: "string", minLength: 1, maxLength: 253 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const idempotencyKey = requireIdempotencyKey(request.headers["idempotency-key"]);
      const parsed = hostCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The host details are invalid.",
        );
      }

      let hostname: string;
      try {
        hostname = normalizeHostname(parsed.data.hostname);
      } catch (error) {
        if (error instanceof HostnameValidationError) {
          return sendError(
            reply,
            request.id,
            422,
            "VALIDATION_ERROR",
            "The endpoint hostname is not an allowed public DNS hostname.",
            { reasonCode: "INVALID_HOSTNAME" },
          );
        }
        throw error;
      }

      const alias = parsed.data.alias;
      const keyHash = idempotencyKeyHash(config.tokenPepper, idempotencyKey);
      const bodyHash = requestHash({ alias, hostname });

      const create = async () =>
        withProviderTransaction(apiPool, userId, async (transaction) => {
          await ensureProfile(transaction.client, userId);

          const existing = await findIdempotencyRecord(
            transaction.client,
            userId,
            operation,
            keyHash,
          );
          if (existing) {
            return replayHostCreation(transaction, userId, operation, keyHash, bodyHash);
          }

          const hostId = randomUUID();
          await transaction.client.query(
            `insert into hosts (id, owner_user_id, alias, endpoint_hostname, status)
             values ($1, $2, $3, $4, 'pending_endpoint')`,
            [hostId, userId, alias, hostname],
          );
          await insertIdempotencyRecord(transaction.client, {
            ownerUserId: userId,
            operation,
            keyHash,
            requestHash: bodyHash,
            responseStatus: 201,
            resourceId: hostId,
          });
          await appendAudit(transaction.client, {
            actorType: "provider",
            actorId: userId,
            ownerUserId: userId,
            resourceType: "host",
            resourceId: hostId,
            action: "host.created",
            requestId: request.id,
            metadata: { status: "pending_endpoint" },
          });

          return { hostId, status: "pending_endpoint" };
        });

      try {
        const result = await create();
        return reply.code(201).send({ data: result });
      } catch (error) {
        if (isUniqueViolation(error, "idempotency_records_key_idx")) {
          const replayed = await withProviderTransaction(apiPool, userId, async (transaction) =>
            replayHostCreation(transaction, userId, operation, keyHash, bodyHash),
          );
          return reply.code(201).send({ data: replayed });
        }

        if (isUniqueViolation(error, "hosts_owner_hostname_active_idx")) {
          return sendError(
            reply,
            request.id,
            409,
            "RESOURCE_CONFLICT",
            "A host with this hostname already exists.",
          );
        }

        throw error;
      }
    },
  );

  app.get(
    "/v1/hosts/:hostId",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId"],
          properties: { hostId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request) => {
      const userId = requireProviderId(request);
      const { hostId } = hostIdParamsSchema.parse(request.params);

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId);
        const keyResult = await client.query<{
          id: string;
          status: string;
          last_seen_at: Date | null;
          created_at: Date;
        }>(
          `select id, status, last_seen_at, created_at
             from witness_keys
            where host_id = $1 and source_type = 'host_agent'
            order by created_at desc
            limit 1`,
          [hostId],
        );
        const challengeResult = await client.query<{
          id: string;
          dns_record_name: string;
          expires_at: Date;
          verified_at: Date | null;
          attempt_count: number;
        }>(
          `select id, dns_record_name, expires_at, verified_at, attempt_count
             from host_endpoint_challenges
            where host_id = $1
            order by created_at desc
            limit 1`,
          [hostId],
        );

        const key = keyResult.rows[0];
        const challenge = challengeResult.rows[0];

        return {
          data: {
            ...hostSummary(host),
            endpoint: {
              hostname: host.endpoint_hostname,
              path: "/.well-known/incident-witness/health",
              verifiedAt: host.endpoint_verified_at,
              dnsFingerprint: host.endpoint_dns_fingerprint,
            },
            sourceKey: key
              ? {
                  id: key.id,
                  status: key.status,
                  lastSeenAt: key.last_seen_at,
                  createdAt: key.created_at,
                }
              : null,
            endpointChallenge: challenge
              ? {
                  id: challenge.id,
                  dnsRecordName: challenge.dns_record_name,
                  expiresAt: challenge.expires_at,
                  verifiedAt: challenge.verified_at,
                  attemptCount: challenge.attempt_count,
                }
              : null,
            installInstructions: installInstructions(config, host.id),
          },
        };
      });
    },
  );

  app.patch(
    "/v1/hosts/:hostId",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId"],
          properties: { hostId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["alias"],
          properties: { alias: { type: "string", minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { hostId } = hostIdParamsSchema.parse(request.params);
      const parsed = hostPatchBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The host alias is invalid.",
        );
      }

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId, true);
        if (host.status === "archived") {
          throw new ApiError(409, "RESOURCE_CONFLICT", "Archived hosts cannot be changed.");
        }

        const result = await client.query<HostRow>(
          `update hosts set alias = $1 where id = $2
           returning id, alias, endpoint_hostname, endpoint_verified_at, endpoint_dns_fingerprint,
                     status, agent_version, last_agent_seen_at, created_at, updated_at`,
          [parsed.data.alias, hostId],
        );

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "host",
          resourceId: hostId,
          action: "host.alias_updated",
          requestId: request.id,
        });

        return { data: hostSummary(result.rows[0]!) };
      });
    },
  );

  app.post(
    "/v1/hosts/:hostId/endpoint-challenge",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId"],
          properties: { hostId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { hostId } = hostIdParamsSchema.parse(request.params);

      const result = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId, true);
        if (host.status === "archived") {
          throw new ApiError(409, "RESOURCE_CONFLICT", "Archived hosts cannot be verified.");
        }

        await client.query(
          `update host_endpoint_challenges
              set expires_at = now()
            where host_id = $1
              and verified_at is null
              and expires_at > now()`,
          [hostId],
        );

        const challengeValue = `iw1=${generateSecret(32)}`;
        const challengeHash = hmacSha256(config.tokenPepper, challengeValue);
        const recordName = dnsRecordName(host.endpoint_hostname);
        const challengeId = randomUUID();

        const inserted = await client.query<{ expires_at: Date }>(
          `insert into host_endpoint_challenges
             (id, host_id, owner_user_id, challenge_hash, dns_record_name, expires_at)
           values ($1, $2, $3, $4, $5, now() + interval '10 minutes')
           returning expires_at`,
          [challengeId, hostId, userId, challengeHash, recordName],
        );

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "host",
          resourceId: hostId,
          action: "host.endpoint_challenge_issued",
          requestId: request.id,
        });

        return {
          data: {
            challengeId,
            dnsRecordName: recordName,
            dnsRecordValue: challengeValue,
            expiresAt: inserted.rows[0]!.expires_at,
          },
        };
      });

      return reply.code(201).send(result);
    },
  );

  app.post(
    "/v1/hosts/:hostId/endpoint-verify",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId"],
          properties: { hostId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["challengeId"],
          properties: { challengeId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { hostId } = hostIdParamsSchema.parse(request.params);
      const parsed = challengeVerifyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The challenge identifier is invalid.",
        );
      }

      const challengeId = parsed.data.challengeId;

      const prepared = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId, true);
        if (host.status === "archived") {
          throw new ApiError(409, "RESOURCE_CONFLICT", "Archived hosts cannot be verified.");
        }

        const result = await client.query<ChallengeRow>(
          `select id, host_id, challenge_hash, dns_record_name, expires_at, verified_at, attempt_count
             from host_endpoint_challenges
            where id = $1 and host_id = $2
            for update`,
          [challengeId, hostId],
        );
        const challenge = result.rows[0];
        if (!challenge) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        if (challenge.verified_at) {
          throw new ApiError(
            409,
            "ENDPOINT_CHALLENGE_CONSUMED",
            "This endpoint challenge has already been verified.",
          );
        }
        if (challenge.expires_at.getTime() <= Date.now()) {
          throw new ApiError(
            409,
            "ENDPOINT_CHALLENGE_EXPIRED",
            "This endpoint challenge has expired.",
          );
        }
        if (challenge.attempt_count >= 10) {
          throw new ApiError(
            409,
            "ENDPOINT_CHALLENGE_ATTEMPTS_EXCEEDED",
            "This endpoint challenge has no verification attempts left.",
          );
        }

        await client.query(
          `update host_endpoint_challenges
              set attempt_count = attempt_count + 1
            where id = $1`,
          [challengeId],
        );

        return {
          hostname: host.endpoint_hostname,
          challenge,
        };
      });

      const checkedAt = new Date();

      let txtRecords: string[][];
      try {
        txtRecords = await dnsResolver.resolveTxt(prepared.challenge.dns_record_name);
      } catch {
        return sendError(
          reply,
          request.id,
          503,
          "DEPENDENCY_UNAVAILABLE",
          "The DNS record could not be checked.",
          { reasonCode: "DNS_LOOKUP_FAILED" },
        );
      }

      const txtMatches = txtRecords.some((record) => {
        const value = record.join("");
        return value.startsWith("iw1=") && constantTimeEqual(
          hmacSha256(config.tokenPepper, value),
          prepared.challenge.challenge_hash,
        );
      });

      if (!txtMatches) {
        return {
          data: {
            verified: false,
            status: "pending",
            reasonCode: "DNS_TXT_MISMATCH",
            checkedAt,
          },
        };
      }

      let addresses: ResolvedAddress[];
      try {
        addresses = await dnsResolver.lookup(prepared.hostname);
      } catch {
        return sendError(
          reply,
          request.id,
          503,
          "DEPENDENCY_UNAVAILABLE",
          "The endpoint hostname could not be resolved.",
          { reasonCode: "DNS_RESOLUTION_FAILED" },
        );
      }

      if (addresses.length === 0) {
        return sendError(
          reply,
          request.id,
          503,
          "DEPENDENCY_UNAVAILABLE",
          "The endpoint hostname could not be resolved.",
          { reasonCode: "DNS_RESOLUTION_FAILED" },
        );
      }

      if (!allAddressesPublic(addresses)) {
        throw new ApiError(
          422,
          "ENDPOINT_UNSAFE_TARGET",
          "The endpoint resolves to a disallowed network address.",
          { reasonCode: "UNSAFE_TARGET" },
        );
      }

      const pinned = addresses.find((entry) => entry.family === 4) ?? addresses[0]!;
      let endpointResult: Awaited<ReturnType<RouteContext["endpointChecker"]["check"]>>;
      try {
        endpointResult = await endpointChecker.check(prepared.hostname, {
          address: pinned.address,
          family: pinned.family,
        });
      } catch {
        return sendError(
          reply,
          request.id,
          503,
          "DEPENDENCY_UNAVAILABLE",
          "The endpoint health check could not be completed.",
          { reasonCode: "ENDPOINT_CHECK_FAILED" },
        );
      }

      if (!endpointResult.ok) {
        return {
          data: {
            verified: false,
            status: "pending",
            reasonCode: endpointResult.reasonCode,
            checkedAt,
          },
        };
      }

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId, true);
        if (host.status === "archived") {
          throw new ApiError(409, "RESOURCE_CONFLICT", "Archived hosts cannot be verified.");
        }

        const result = await client.query<ChallengeRow>(
          `select id, host_id, challenge_hash, dns_record_name, expires_at, verified_at, attempt_count
             from host_endpoint_challenges
            where id = $1 and host_id = $2
            for update`,
          [challengeId, hostId],
        );
        const challenge = result.rows[0];
        if (!challenge) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        if (challenge.verified_at) {
          throw new ApiError(
            409,
            "ENDPOINT_CHALLENGE_CONSUMED",
            "This endpoint challenge has already been verified.",
          );
        }
        if (challenge.expires_at.getTime() <= Date.now()) {
          throw new ApiError(
            409,
            "ENDPOINT_CHALLENGE_EXPIRED",
            "This endpoint challenge has expired.",
          );
        }

        const verifiedAt = new Date();
        const fingerprint = createHash("sha256")
          .update(
            `${host.endpoint_hostname}|${challenge.id}|${challenge.dns_record_name}|${verifiedAt.toISOString()}`,
          )
          .digest("hex");

        await client.query(
          `update host_endpoint_challenges set verified_at = $1 where id = $2`,
          [verifiedAt, challenge.id],
        );
        await client.query(
          `update hosts
              set endpoint_verified_at = $1,
                  endpoint_dns_fingerprint = $2,
                  status = case when status = 'pending_endpoint' then 'pending_enrollment'::host_status else status end
            where id = $3`,
          [verifiedAt, fingerprint, hostId],
        );
        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "host",
          resourceId: hostId,
          action: "host.endpoint_verified",
          requestId: request.id,
          metadata: { reasonCode: "VERIFIED" },
        });

        return {
          data: {
            verified: true,
            status: "verified",
            checkedAt: verifiedAt,
          },
        };
      });
    },
  );

  app.post(
    "/v1/hosts/:hostId/enrollment-codes",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId"],
          properties: { hostId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { hostId } = hostIdParamsSchema.parse(request.params);

      const result = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId, true);
        if (host.status === "archived") {
          throw new ApiError(409, "RESOURCE_CONFLICT", "Archived hosts cannot be enrolled.");
        }
        if (host.status === "active") {
          throw new ApiError(
            409,
            "HOST_ALREADY_ENROLLED",
            "This host already has an active agent key. Revoke it before re-enrolling.",
          );
        }
        if (!host.endpoint_verified_at || host.status !== "pending_enrollment") {
          throw new ApiError(
            409,
            "HOST_NOT_READY",
            "Verify the host endpoint before issuing an enrollment code.",
          );
        }

        await client.query(
          `update enrollment_tokens
              set revoked_at = now()
            where host_id = $1
              and redeemed_at is null
              and revoked_at is null`,
          [hostId],
        );

        const code = generateSecret(32);
        const codeHash = hmacSha256(config.tokenPepper, code);
        const tokenId = randomUUID();
        const inserted = await client.query<{ expires_at: Date }>(
          `insert into enrollment_tokens
             (id, host_id, owner_user_id, token_hash, expires_at)
           values ($1, $2, $3, $4, now() + interval '10 minutes')
           returning expires_at`,
          [tokenId, hostId, userId, codeHash],
        );

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "host",
          resourceId: hostId,
          action: "host.enrollment_code_issued",
          requestId: request.id,
        });

        return {
          data: {
            enrollmentCode: code,
            expiresAt: inserted.rows[0]!.expires_at,
            installInstructions: installInstructions(config, hostId),
          },
        };
      });

      return reply.code(201).send(result);
    },
  );

  app.post(
    "/v1/hosts/:hostId/archive",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId"],
          properties: { hostId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request) => {
      const userId = requireProviderId(request);
      const { hostId } = hostIdParamsSchema.parse(request.params);

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const host = await loadOwnedHost(client, hostId, true);

        if (host.status === "archived") {
          return {
            data: {
              hostId,
              status: "archived",
              revokedCredentials: 0,
              revokedEnrollmentTokens: 0,
              cancelledProbeJobs: 0,
            },
          };
        }

        const active = await client.query<{ count: string }>(
          `select count(*)::text as count
             from incidents
            where host_id = $1 and status in ('collecting', 'awaiting_finalize')`,
          [hostId],
        );
        if (Number(active.rows[0]?.count ?? "0") > 0) {
          throw new ApiError(
            409,
            "HOST_HAS_ACTIVE_INCIDENT",
            "End or finalize active incidents before archiving this host.",
          );
        }

        await client.query(`update hosts set status = 'archived' where id = $1`, [hostId]);

        const credentials = await client.query(
          `update source_credentials sc
              set revoked_at = now()
             from witness_keys k
            where sc.source_key_id = k.id
              and k.host_id = $1
              and k.source_type = 'host_agent'
              and sc.revoked_at is null`,
          [hostId],
        );
        const tokens = await client.query(
          `update enrollment_tokens
              set revoked_at = now()
            where host_id = $1
              and redeemed_at is null
              and revoked_at is null`,
          [hostId],
        );
        const jobs = await client.query(
          `update probe_jobs
              set status = 'cancelled'
            where host_id = $1
              and status in ('pending', 'retry')`,
          [hostId],
        );

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "host",
          resourceId: hostId,
          action: "host.archived",
          requestId: request.id,
          metadata: {
            revokedCredentials: credentials.rowCount ?? 0,
            revokedEnrollmentTokens: tokens.rowCount ?? 0,
            cancelledProbeJobs: jobs.rowCount ?? 0,
          },
        });

        return {
          data: {
            hostId,
            status: "archived",
            revokedCredentials: credentials.rowCount ?? 0,
            revokedEnrollmentTokens: tokens.rowCount ?? 0,
            cancelledProbeJobs: jobs.rowCount ?? 0,
          },
        };
      });
    },
  );
}
