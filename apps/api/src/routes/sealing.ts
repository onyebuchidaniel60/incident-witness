import {
  bundleManifestSchema,
  bundleSchema,
  bytesToBase64Url,
  canonicalJsonBytes,
} from "@incident-witness/protocol";
import { withProviderTransaction } from "@incident-witness/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireProviderId } from "../domain/provider.js";
import { ApiError } from "../errors.js";
import { sealIncidentInTransaction, type SealResult } from "../services/seal.js";
import type { RouteContext } from "./context.js";

const incidentParamsSchema = z.object({
  incidentId: z.string().uuid(),
});

type BundleRow = {
  id: string;
  manifest: unknown;
  manifest_sha256: Buffer;
  platform_signature: Buffer;
  byte_length: number;
};

function sealResponse(result: Extract<SealResult, { status: "sealed" | "already_sealed" }>) {
  return {
    bundleId: result.bundleId,
    bundleSha256: result.bundleSha256,
    sealedAt: result.sealedAt,
    assessment: result.assessment,
    eventCount: result.eventCount,
    byteLength: result.byteLength,
  };
}

export async function registerSealingRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  const { apiPool, config } = context;

  app.post(
    "/v1/incidents/:incidentId/seal",
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

      const result = await withProviderTransaction(apiPool, userId, async ({ client }) =>
        sealIncidentInTransaction(client, {
          incidentId,
          requestId: request.id,
          config,
          mode: "provider",
        }),
      );

      if (result.status === "sealed") {
        return reply.code(201).send({ data: sealResponse(result) });
      }
      if (result.status === "already_sealed") {
        return reply.code(200).send({ data: sealResponse(result) });
      }
      if (result.status === "no_evidence") {
        throw new ApiError(409, "NO_EVIDENCE", "The incident has no accepted evidence to seal.");
      }
      if (result.status === "probe_lease_active") {
        throw new ApiError(
          409,
          "PROBE_LEASE_ACTIVE",
          "A probe lease is still active; retry sealing after it completes.",
        );
      }

      throw new ApiError(
        409,
        "BUNDLE_NOT_READY",
        "The incident must be awaiting finalization before sealing.",
      );
    },
  );

  app.get(
    "/v1/incidents/:incidentId/bundle",
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

      const bundle = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        const incidentResult = await client.query<{ id: string; status: string }>(
          `select id, status from incidents where id = $1`,
          [incidentId],
        );
        const incident = incidentResult.rows[0];
        if (!incident) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
        }
        if (incident.status !== "sealed") {
          throw new ApiError(409, "BUNDLE_NOT_READY", "The incident is not sealed.");
        }

        const bundleResult = await client.query<BundleRow>(
          `select id, manifest, manifest_sha256, platform_signature, byte_length
             from evidence_bundles
            where incident_id = $1`,
          [incidentId],
        );
        const row = bundleResult.rows[0];
        if (!row) {
          throw new ApiError(404, "RESOURCE_NOT_FOUND", "The evidence bundle was not found.");
        }

        const parsed = bundleSchema.parse({
          bundle_version: "1.0",
          manifest: bundleManifestSchema.parse(row.manifest),
          manifest_sha256: bytesToBase64Url(row.manifest_sha256),
          platform_signature: bytesToBase64Url(row.platform_signature),
        });

        return Buffer.from(canonicalJsonBytes(parsed));
      });

      reply.header("content-type", "application/vnd.incident-witness.bundle+json");
      reply.header(
        "content-disposition",
        `attachment; filename="incident-witness-${incidentId}.json"`,
      );
      reply.header("content-length", String(bundle.length));
      reply.header("cache-control", "no-store");
      reply.header("x-content-type-options", "nosniff");
      return reply.send(bundle);
    },
  );
}
