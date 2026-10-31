import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { sendError } from "../errors.js";
import {
  ingestSignedEvent,
  type ExpectedSourceType,
} from "../services/event-ingestion.js";
import type { RouteContext } from "./context.js";

function rateLimitKey(authorization: string | undefined, fallback: string): string {
  return createHash("sha256").update(authorization ?? fallback).digest("hex");
}

function eventRoute(
  app: FastifyInstance,
  context: RouteContext,
  path: string,
  expectedSourceType: ExpectedSourceType,
  productionLimit: number,
) {
  app.post(
    path,
    {
      config: {
        rateLimit: {
          max: context.config.nodeEnv === "test" ? 10_000 : productionLimit,
          timeWindow: "1 minute",
          keyGenerator: (request) => rateLimitKey(request.headers.authorization, request.ip),
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
          415,
          "VALIDATION_ERROR",
          "Content-Type must be application/vnd.incident-witness.event+json.",
        );
      }

      const result = await ingestSignedEvent({
        apiPool: context.apiPool,
        config: context.config,
        rawBody,
        authorization: request.headers.authorization,
        expectedSourceType,
      });

      return reply.code(result.duplicate ? 200 : 202).send({
        data: {
          eventId: result.eventId,
          accepted: true,
          receivedAt: result.receivedAt,
          duplicate: result.duplicate,
        },
      });
    },
  );
}

export async function registerEvidenceRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  eventRoute(app, context, "/v1/agent/events", "host_agent", 40);
  eventRoute(app, context, "/v1/renter/events", "renter_client", 10);
}
