import { withProviderTransaction } from "@incident-witness/db";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../domain/audit.js";
import { requireProviderId } from "../domain/provider.js";
import { ApiError, sendError } from "../errors.js";
import type { RouteContext } from "./context.js";

const uuidSchema = z.string().uuid();

const reasonCodeSchema = z.enum(["USER_REQUEST", "KEY_COMPROMISE", "ROTATION", "OTHER"]);

const hostKeyParamsSchema = z.object({
  hostId: uuidSchema,
  keyId: uuidSchema,
});

const incidentKeyParamsSchema = z.object({
  incidentId: uuidSchema,
  keyId: uuidSchema,
});

const revokeBodySchema = z
  .object({
    reasonCode: reasonCodeSchema,
  })
  .strict();

async function revokeCredentials(client: PoolClient, sourceKeyId: string): Promise<number> {
  const result = await client.query(
    `update source_credentials
        set revoked_at = now()
      where source_key_id = $1
        and revoked_at is null`,
    [sourceKeyId],
  );
  return result.rowCount ?? 0;
}

export async function registerKeyRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  const { apiPool } = context;

  app.post(
    "/v1/hosts/:hostId/keys/:keyId/revoke",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["hostId", "keyId"],
          properties: {
            hostId: { type: "string", format: "uuid" },
            keyId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["reasonCode"],
          properties: {
            reasonCode: {
              type: "string",
              enum: ["USER_REQUEST", "KEY_COMPROMISE", "ROTATION", "OTHER"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { hostId, keyId } = hostKeyParamsSchema.parse(request.params);
      const body = revokeBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The revocation reason is invalid.",
        );
      }

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const hostResult = await client.query<{ id: string; status: string }>(
          `select id, status from hosts where id = $1 for update`,
          [hostId],
        );
        const host = hostResult.rows[0];
        if (!host) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        if (host.status === "archived") {
          throw new ApiError(409, "RESOURCE_CONFLICT", "Archived hosts cannot be changed.");
        }

        const keyResult = await client.query<{
          id: string;
          status: string;
          source_type: string;
          host_id: string | null;
        }>(
          `select id, status, source_type, host_id
             from witness_keys
            where id = $1
              and host_id = $2
              and source_type = 'host_agent'
            for update`,
          [keyId, hostId],
        );
        const key = keyResult.rows[0];
        if (!key) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }

        if (key.status === "revoked") {
          return {
            data: {
              keyId,
              status: "revoked",
              revokedCredentials: 0,
              revokedAt: null,
            },
          };
        }

        const revokedAt = new Date();
        await client.query(
          `update witness_keys set status = 'revoked', revoked_at = $1 where id = $2`,
          [revokedAt, keyId],
        );
        const revokedCredentials = await revokeCredentials(client, keyId);

        const otherActive = await client.query<{ count: string }>(
          `select count(*)::text as count
             from witness_keys
            where host_id = $1
              and source_type = 'host_agent'
              and status = 'active'`,
          [hostId],
        );
        if (Number(otherActive.rows[0]?.count ?? "0") === 0 && host.status === "active") {
          await client.query(`update hosts set status = 'pending_enrollment' where id = $1`, [
            hostId,
          ]);
        }

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "host",
          resourceId: hostId,
          action: "host.key_revoked",
          requestId: request.id,
          metadata: {
            keyId,
            reasonCode: body.data.reasonCode,
            revokedCredentials,
          },
        });

        return {
          data: {
            keyId,
            status: "revoked",
            revokedCredentials,
            revokedAt,
          },
        };
      });
    },
  );

  app.post(
    "/v1/incidents/:incidentId/keys/:keyId/revoke",
    {
      preHandler: app.requireAuth,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["incidentId", "keyId"],
          properties: {
            incidentId: { type: "string", format: "uuid" },
            keyId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["reasonCode"],
          properties: {
            reasonCode: {
              type: "string",
              enum: ["USER_REQUEST", "KEY_COMPROMISE", "ROTATION", "OTHER"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const { incidentId, keyId } = incidentKeyParamsSchema.parse(request.params);
      const body = revokeBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The revocation reason is invalid.",
        );
      }

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const incidentResult = await client.query<{ id: string; status: string }>(
          `select id, status from incidents where id = $1 for update`,
          [incidentId],
        );
        const incident = incidentResult.rows[0];
        if (!incident) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }

        const keyResult = await client.query<{
          id: string;
          status: string;
          source_type: string;
          incident_id: string | null;
        }>(
          `select id, status, source_type, incident_id
             from witness_keys
            where id = $1
              and incident_id = $2
              and source_type = 'renter_client'
            for update`,
          [keyId, incidentId],
        );
        const key = keyResult.rows[0];
        if (!key) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }

        if (key.status === "revoked") {
          return {
            data: {
              keyId,
              status: "revoked",
              revokedCredentials: 0,
              revokedAt: null,
            },
          };
        }

        const revokedAt = new Date();
        await client.query(
          `update witness_keys set status = 'revoked', revoked_at = $1 where id = $2`,
          [revokedAt, keyId],
        );
        const revokedCredentials = await revokeCredentials(client, keyId);

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "incident",
          resourceId: incidentId,
          action: "incident.renter_key_revoked",
          requestId: request.id,
          metadata: {
            keyId,
            reasonCode: body.data.reasonCode,
            revokedCredentials,
          },
        });

        return {
          data: {
            keyId,
            status: "revoked",
            revokedCredentials,
            revokedAt,
          },
        };
      });
    },
  );
}
