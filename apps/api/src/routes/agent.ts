import { createHash, randomUUID } from "node:crypto";

import { base64UrlToBytes } from "@incident-witness/protocol";
import { publicKeyFingerprint } from "@incident-witness/protocol/node";
import { setTransactionGuc, withApiTransaction } from "@incident-witness/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { appendAudit } from "../domain/audit.js";
import { createHostCertificate } from "../domain/certificates.js";
import {
  isPresenceFresh,
  parsePresenceRequest,
  presenceRequestHash,
  verifyPresenceSignature,
  type PresenceRequest,
} from "../domain/presence.js";
import {
  constantTimeEqual,
  generateSecret,
  hmacSha256,
  hmacSha256Hex,
} from "../domain/tokens.js";
import { ApiError, sendError } from "../errors.js";
import type { RouteContext } from "./context.js";

const uuidSchema = z.string().uuid();

const publicKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => {
    try {
      return base64UrlToBytes(value).length === 32;
    } catch {
      return false;
    }
  }, "Public key must be a 32-byte unpadded base64url Ed25519 key");

const enrollmentBodySchema = z
  .object({
    enrollmentCode: z.string().min(1).max(200),
    publicKey: publicKeySchema,
    agentVersion: z.string().min(1).max(40),
    requestId: uuidSchema,
  })
  .strict();

export async function registerAgentRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  const { apiPool, config } = context;

  app.post(
    "/v1/agent/enroll",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["enrollmentCode", "publicKey", "agentVersion", "requestId"],
          properties: {
            enrollmentCode: { type: "string", minLength: 1, maxLength: 200 },
            publicKey: { type: "string", minLength: 43, maxLength: 43 },
            agentVersion: { type: "string", minLength: 1, maxLength: 40 },
            requestId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = enrollmentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The enrollment request is invalid.",
        );
      }

      let fingerprint: string;
      try {
        fingerprint = publicKeyFingerprint(parsed.data.publicKey);
      } catch {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The enrollment public key is invalid.",
        );
      }

      const codeHashHex = hmacSha256Hex(config.tokenPepper, parsed.data.enrollmentCode);
      const sourceKeyId = randomUUID();

      const result = await withApiTransaction(
        apiPool,
        {
          mode: "machine_enroll",
          gucs: { "iw.enrollment_token_hash_hex": codeHashHex },
        },
        async ({ client }) => {
          const tokenResult = await client.query<{
            id: string;
            host_id: string;
            owner_user_id: string;
            expires_at: Date;
            redeemed_at: Date | null;
            revoked_at: Date | null;
          }>(
            `select id, host_id, owner_user_id, expires_at, redeemed_at, revoked_at
               from enrollment_tokens
              where token_hash = decode($1, 'hex')
              for update`,
            [codeHashHex],
          );
          const token = tokenResult.rows[0];
          if (!token || token.revoked_at) {
            throw new ApiError(401, "ENROLLMENT_INVALID", "The enrollment code is invalid.");
          }
          if (token.redeemed_at) {
            throw new ApiError(
              409,
              "ENROLLMENT_ALREADY_REDEEMED",
              "This enrollment code has already been used.",
            );
          }
          if (token.expires_at.getTime() <= Date.now()) {
            throw new ApiError(409, "ENROLLMENT_INVALID", "This enrollment code has expired.");
          }

          await setTransactionGuc(client, "iw.host_id", token.host_id);
          await setTransactionGuc(client, "iw.owner_user_id", token.owner_user_id);
          await setTransactionGuc(client, "iw.source_key_id", sourceKeyId);

          const hostResult = await client.query<{
            id: string;
            owner_user_id: string;
            status: string;
          }>(
            `select id, owner_user_id, status from hosts where id = $1 for update`,
            [token.host_id],
          );
          const host = hostResult.rows[0];
          if (!host) {
            throw new ApiError(401, "ENROLLMENT_INVALID", "The enrollment code is invalid.");
          }
          if (host.status === "archived") {
            throw new ApiError(409, "RESOURCE_CONFLICT", "This host is archived.");
          }
          if (host.status === "active") {
            throw new ApiError(
              409,
              "HOST_ALREADY_ENROLLED",
              "This host already has an active agent key.",
            );
          }
          if (host.status !== "pending_enrollment") {
            throw new ApiError(
              409,
              "HOST_NOT_READY",
              "Verify the host endpoint before enrolling an agent.",
            );
          }

          const signedCertificate = createHostCertificate({
            sourceKeyId,
            hostId: host.id,
            publicKey: parsed.data.publicKey,
            platformSigningKey: config.platformSigningKey,
          });

          await client.query(
            `insert into witness_keys
               (id, owner_user_id, host_id, incident_id, source_type, public_key, fingerprint,
                status, certificate_json, certificate_signature)
             values ($1, $2, $3, null, 'host_agent', $4, $5, 'active', $6::jsonb, $7)`,
            [
              sourceKeyId,
              host.owner_user_id,
              host.id,
              signedCertificate.publicKeyBytes,
              fingerprint,
              JSON.stringify(signedCertificate.certificate),
              signedCertificate.signatureBytes,
            ],
          );

          const credential = generateSecret(32);
          const credentialHash = hmacSha256(config.tokenPepper, credential);
          await client.query(
            `insert into source_credentials
               (source_key_id, credential_hash, credential_type, expires_at)
             values ($1, $2, 'host_agent', null)`,
            [sourceKeyId, credentialHash],
          );

          await client.query(
            `update enrollment_tokens
                set redeemed_at = now(), redeemed_key_id = $1
              where id = $2`,
            [sourceKeyId, token.id],
          );
          await client.query(
            `update hosts set status = 'active', agent_version = $1 where id = $2`,
            [parsed.data.agentVersion, host.id],
          );

          await appendAudit(client, {
            actorType: "host_agent",
            actorId: sourceKeyId,
            ownerUserId: host.owner_user_id,
            resourceType: "host",
            resourceId: host.id,
            action: "host.enrolled",
            requestId: request.id,
            metadata: {
              sourceKeyId,
              agentVersion: parsed.data.agentVersion,
              fingerprint,
            },
          });

          return {
            data: {
              sourceKeyId,
              certificate: signedCertificate.certificate,
              certificateSignature: signedCertificate.signed.signature,
              deviceCredential: credential,
              apiBaseUrl: config.apiBaseUrl,
              protocolVersion: "1.0",
            },
          };
        },
      );

      return reply.code(201).send(result);
    },
  );

  app.post(
    "/v1/agent/heartbeat",
    {
      config: {
        rateLimit: {
          max: config.nodeEnv === "test" ? 10_000 : 10,
          timeWindow: "1 minute",
          keyGenerator: (request) =>
            createHash("sha256")
              .update(request.headers.authorization ?? request.ip)
              .digest("hex"),
        },
      },
      schema: {},
    },
    async (request, reply) => {
      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        return sendError(
          reply,
          request.id,
          400,
          "VALIDATION_ERROR",
          "The presence request body is invalid.",
        );
      }

      let presence: PresenceRequest;
      try {
        presence = parsePresenceRequest(rawBody);
      } catch {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The presence request is not canonical valid JSON.",
        );
      }

      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        return sendError(reply, request.id, 401, "AUTH_REQUIRED", "Authentication is required.");
      }

      const credential = authorization.slice("Bearer ".length);
      if (credential.length < 1 || credential.length > 512) {
        return sendError(reply, request.id, 401, "AUTH_INVALID", "The credential is invalid.");
      }

      const credentialHashHex = hmacSha256Hex(config.tokenPepper, credential);
      const bodyHash = presenceRequestHash(rawBody);
      const serverSeenAt = new Date();

      return withApiTransaction(
        apiPool,
        {
          mode: "machine_ingest",
          gucs: { "iw.credential_hash_hex": credentialHashHex },
        },
        async ({ client }) => {
          const credentialResult = await client.query<{
            id: string;
            source_key_id: string;
            expires_at: Date | null;
            revoked_at: Date | null;
          }>(
            `select id, source_key_id, expires_at, revoked_at
               from source_credentials
              where credential_hash = decode($1, 'hex')`,
            [credentialHashHex],
          );
          const credentialRow = credentialResult.rows[0];
          if (
            !credentialRow ||
            credentialRow.revoked_at ||
            (credentialRow.expires_at && credentialRow.expires_at.getTime() <= Date.now())
          ) {
            throw new ApiError(401, "AUTH_INVALID", "The credential is invalid.");
          }

          await setTransactionGuc(client, "iw.source_key_id", credentialRow.source_key_id);

          const keyResult = await client.query<{
            id: string;
            source_type: string;
            status: string;
            host_id: string | null;
            public_key: Buffer;
            last_presence_sequence: number;
            last_presence_hash: Buffer | null;
          }>(
            `select id, source_type, status, host_id, public_key,
                    last_presence_sequence, last_presence_hash
               from witness_keys
              where id = $1
              for update`,
            [credentialRow.source_key_id],
          );
          const key = keyResult.rows[0];
          if (!key || key.source_type !== "host_agent" || !key.host_id) {
            throw new ApiError(403, "PERMISSION_DENIED", "This credential is not a host agent key.");
          }
          if (key.status !== "active") {
            throw new ApiError(403, "PERMISSION_DENIED", "This host key is revoked.");
          }
          if (key.host_id !== presence.hostId) {
            throw new ApiError(403, "PERMISSION_DENIED", "This key is not bound to the host.");
          }

          await setTransactionGuc(client, "iw.host_id", key.host_id);

          const hostResult = await client.query<{
            id: string;
            status: string;
          }>(
            `select id, status from hosts where id = $1 for update`,
            [key.host_id],
          );
          const host = hostResult.rows[0];
          if (!host || host.status === "archived") {
            throw new ApiError(403, "PERMISSION_DENIED", "This host is not active.");
          }

          if (!verifyPresenceSignature(presence, key.public_key)) {
            throw new ApiError(422, "VALIDATION_ERROR", "The presence signature is invalid.");
          }

          const lastSequence = Number(key.last_presence_sequence);
          if (presence.heartbeatSequence === lastSequence) {
            if (key.last_presence_hash && constantTimeEqual(bodyHash, key.last_presence_hash)) {
              return {
                data: {
                  accepted: true,
                  serverSeenAt,
                  duplicate: true,
                },
              };
            }
            throw new ApiError(
              409,
              "PRESENCE_REPLAY",
              "This presence sequence was already used with different content.",
            );
          }
          if (presence.heartbeatSequence < lastSequence) {
            throw new ApiError(409, "PRESENCE_REPLAY", "The presence sequence has gone backwards.");
          }
          if (!isPresenceFresh(presence.observedAt)) {
            throw new ApiError(
              422,
              "PRESENCE_STALE",
              "The presence timestamp is outside the accepted freshness window.",
            );
          }

          await client.query(
            `update witness_keys
                set last_presence_sequence = $1,
                    last_presence_hash = $2,
                    last_seen_at = $3
              where id = $4`,
            [presence.heartbeatSequence, bodyHash, serverSeenAt, key.id],
          );
          await client.query(
            `update hosts
                set last_agent_seen_at = $1, agent_version = $2
              where id = $3`,
            [serverSeenAt, presence.agentVersion, key.host_id],
          );
          await client.query(
            `update source_credentials set last_used_at = $1 where id = $2`,
            [serverSeenAt, credentialRow.id],
          );

          return {
            data: {
              accepted: true,
              serverSeenAt,
              duplicate: false,
            },
          };
        },
      );
    },
  );
}
