import { randomUUID } from "node:crypto";

import { base64UrlToBytes } from "@incident-witness/protocol";
import { publicKeyFingerprint } from "@incident-witness/protocol/node";
import { setTransactionGuc, withApiTransaction, withProviderTransaction } from "@incident-witness/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { appendAudit } from "../domain/audit.js";
import { createRenterCertificate } from "../domain/certificates.js";
import { requireProviderId } from "../domain/provider.js";
import { generateSecret, hmacSha256, hmacSha256Hex } from "../domain/tokens.js";
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

const renterEnrollBodySchema = z
  .object({
    invitationToken: z.string().min(1).max(200),
    publicKey: publicKeySchema,
    requestId: uuidSchema,
    sdkVersion: z.string().min(1).max(40),
  })
  .strict();

const incidentParamsSchema = z.object({
  incidentId: uuidSchema,
});

export async function registerRenterRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  const { apiPool, config } = context;

  app.post(
    "/v1/incidents/:incidentId/renter-invitations",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["incidentId"],
          properties: { incidentId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { incidentId } = incidentParamsSchema.parse(request.params);

      const result = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [incidentId]);
        const incidentResult = await client.query<{
          id: string;
          status: string;
          ingestion_deadline: Date;
        }>(
          `select id, status, ingestion_deadline
             from incidents
            where id = $1
            for update`,
          [incidentId],
        );
        const incident = incidentResult.rows[0];
        if (!incident) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        if (incident.status !== "collecting") {
          throw new ApiError(
            409,
            "INCIDENT_NOT_COLLECTING",
            "Renter invitations can only be issued for a collecting evidence session.",
          );
        }

        const existingKey = await client.query<{ id: string }>(
          `select id
             from witness_keys
            where incident_id = $1
              and source_type = 'renter_client'
              and status = 'active'
            limit 1`,
          [incidentId],
        );
        if (existingKey.rows[0]) {
          throw new ApiError(
            409,
            "RENTER_ALREADY_ENROLLED",
            "This evidence session already has an active renter key.",
          );
        }

        await client.query(
          `update renter_invitations
              set revoked_at = now()
            where incident_id = $1
              and redeemed_at is null
              and revoked_at is null`,
          [incidentId],
        );

        const invitationToken = generateSecret(32);
        const tokenHash = hmacSha256(config.tokenPepper, invitationToken);
        const invitationId = randomUUID();
        const inserted = await client.query<{ expires_at: Date }>(
          `insert into renter_invitations
             (id, incident_id, owner_user_id, token_hash, expires_at)
           values ($1, $2, $3, $4, now() + interval '15 minutes')
           returning expires_at`,
          [invitationId, incidentId, userId, tokenHash],
        );

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "incident",
          resourceId: incidentId,
          action: "incident.renter_invitation_issued",
          requestId: request.id,
        });

        const joinUrl = `${config.appBaseUrl.replace(/\/$/, "")}/join#${invitationToken}`;
        return {
          data: {
            invitationToken,
            expiresAt: inserted.rows[0]!.expires_at,
            joinUrl,
            oneTime: true,
          },
        };
      });

      return reply.code(201).send(result);
    },
  );

  app.post(
    "/v1/renter/enroll",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["invitationToken", "publicKey", "requestId", "sdkVersion"],
          properties: {
            invitationToken: { type: "string", minLength: 1, maxLength: 200 },
            publicKey: { type: "string", minLength: 43, maxLength: 43 },
            requestId: { type: "string", format: "uuid" },
            sdkVersion: { type: "string", minLength: 1, maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = renterEnrollBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The renter enrollment request is invalid.",
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
          "The renter public key is invalid.",
        );
      }

      const tokenHashHex = hmacSha256Hex(config.tokenPepper, parsed.data.invitationToken);
      const sourceKeyId = randomUUID();

      const result = await withApiTransaction(
        apiPool,
        {
          mode: "machine_enroll",
          gucs: { "iw.invitation_token_hash_hex": tokenHashHex },
        },
        async ({ client }) => {
          const initial = await client.query<{
            id: string;
            incident_id: string;
            owner_user_id: string;
          }>(
            `select id, incident_id, owner_user_id
               from renter_invitations
              where token_hash = decode($1, 'hex')`,
            [tokenHashHex],
          );
          const initialInvitation = initial.rows[0];
          if (!initialInvitation) {
            throw new ApiError(401, "INVITATION_INVALID", "The renter invitation is invalid.");
          }

          await setTransactionGuc(client, "iw.incident_id", initialInvitation.incident_id);
          await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
            initialInvitation.incident_id,
          ]);

          const incidentResult = await client.query<{
            id: string;
            owner_user_id: string;
            status: string;
            capture_ends_at: Date;
            ingestion_deadline: Date;
          }>(
            `select id, owner_user_id, status, capture_ends_at, ingestion_deadline
               from incidents
              where id = $1
              for share`,
            [initialInvitation.incident_id],
          );
          const incident = incidentResult.rows[0];
          if (
            !incident ||
            !["collecting", "awaiting_finalize"].includes(incident.status) ||
            incident.ingestion_deadline.getTime() <= Date.now()
          ) {
            throw new ApiError(
              409,
              "INVITATION_INVALID",
              "The evidence session is no longer accepting renter enrollment.",
            );
          }

          const invitationResult = await client.query<{
            id: string;
            incident_id: string;
            owner_user_id: string;
            expires_at: Date;
            redeemed_at: Date | null;
            revoked_at: Date | null;
          }>(
            `select id, incident_id, owner_user_id, expires_at, redeemed_at, revoked_at
               from renter_invitations
              where token_hash = decode($1, 'hex')
              for update`,
            [tokenHashHex],
          );
          const invitation = invitationResult.rows[0];
          if (!invitation || invitation.revoked_at) {
            throw new ApiError(401, "INVITATION_INVALID", "The renter invitation is invalid.");
          }
          if (invitation.redeemed_at) {
            throw new ApiError(
              409,
              "INVITATION_ALREADY_REDEEMED",
              "This renter invitation has already been used.",
            );
          }
          if (invitation.expires_at.getTime() <= Date.now()) {
            throw new ApiError(409, "INVITATION_INVALID", "This renter invitation has expired.");
          }

          await setTransactionGuc(client, "iw.owner_user_id", invitation.owner_user_id);

          const existingKey = await client.query<{ id: string }>(
            `select id
               from witness_keys
              where incident_id = $1
                and source_type = 'renter_client'
                and status = 'active'
              limit 1`,
            [incident.id],
          );
          if (existingKey.rows[0]) {
            throw new ApiError(
              409,
              "RENTER_ALREADY_ENROLLED",
              "This evidence session already has an active renter key.",
            );
          }

          await setTransactionGuc(client, "iw.source_key_id", sourceKeyId);
          const signedCertificate = createRenterCertificate({
            sourceKeyId,
            incidentId: incident.id,
            publicKey: parsed.data.publicKey,
            platformSigningKey: config.platformSigningKey,
          });

          await client.query(
            `insert into witness_keys
               (id, owner_user_id, host_id, incident_id, source_type, public_key, fingerprint,
                status, certificate_json, certificate_signature)
             values ($1, $2, null, $3, 'renter_client', $4, $5, 'active', $6::jsonb, $7)`,
            [
              sourceKeyId,
              incident.owner_user_id,
              incident.id,
              signedCertificate.publicKeyBytes,
              fingerprint,
              JSON.stringify(signedCertificate.certificate),
              signedCertificate.signatureBytes,
            ],
          );

          const ingestionCredential = generateSecret(32);
          await client.query(
            `insert into source_credentials
               (source_key_id, credential_hash, credential_type, expires_at)
             values ($1, $2, 'renter_client', $3)`,
            [
              sourceKeyId,
              hmacSha256(config.tokenPepper, ingestionCredential),
              incident.ingestion_deadline,
            ],
          );

          await client.query(
            `update renter_invitations
                set redeemed_at = now(), renter_key_id = $1
              where id = $2`,
            [sourceKeyId, invitation.id],
          );

          await appendAudit(client, {
            actorType: "renter_client",
            actorId: sourceKeyId,
            ownerUserId: incident.owner_user_id,
            resourceType: "incident",
            resourceId: incident.id,
            action: "incident.renter_enrolled",
            requestId: request.id,
            metadata: {
              sourceKeyId,
              sdkVersion: parsed.data.sdkVersion,
              fingerprint,
            },
          });

          return {
            data: {
              sourceKeyId,
              certificate: signedCertificate.certificate,
              certificateSignature: signedCertificate.signed.signature,
              ingestionCredential,
              incidentId: incident.id,
              sessionEndsAt: incident.capture_ends_at,
              protocolVersion: "1.0",
            },
          };
        },
      );

      return reply.code(201).send(result);
    },
  );
}
