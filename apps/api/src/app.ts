import { randomUUID, timingSafeEqual } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  assertRuntimeRole,
  checkDatabaseReady,
  createApiPool,
  withProviderTransaction,
} from "@incident-witness/db";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { Pool } from "pg";

import { createRemoteJwtVerifier, type JwtVerifier } from "./auth/jwt.js";
import { config as defaultConfig, type AppConfig } from "./config.js";
import { ApiError, sendError } from "./errors.js";
import { startLifecycleSweeper } from "./lifecycle/sweeper.js";
import { requireAuth } from "./plugins/auth.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerEvidenceRoutes } from "./routes/evidence.js";
import { registerHostRoutes } from "./routes/hosts.js";
import { registerIncidentRoutes } from "./routes/incidents.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerRenterRoutes } from "./routes/renter.js";
import { registerSealingRoutes } from "./routes/sealing.js";
import { NodeDnsResolver, type DnsResolver } from "./services/dns.js";
import {
  HttpsEndpointChecker,
  type EndpointChecker,
} from "./services/endpoint.js";

const expectedMigration = "0019_phase3e_worker_counter_select";

export type BuildAppOptions = {
  config?: AppConfig;
  apiPool?: Pool;
  jwtVerifier?: JwtVerifier;
  dnsResolver?: DnsResolver;
  endpointChecker?: EndpointChecker;
  enableSweeper?: boolean;
  logger?: boolean;
};

function safeTokenEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireHealthToken(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      sendError(reply, request.id, 401, "AUTH_REQUIRED", "Authentication is required.");
      return;
    }

    if (!safeTokenEqual(authorization.slice("Bearer ".length), config.healthcheckToken)) {
      sendError(reply, request.id, 401, "AUTH_INVALID", "The authentication token is invalid.");
    }
  };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? defaultConfig;
  const apiPool = options.apiPool ?? createApiPool();
  const jwtVerifier =
    options.jwtVerifier ??
    createRemoteJwtVerifier(config.supabaseJwksUrl, config.supabaseJwtIssuer);
  const dnsResolver = options.dnsResolver ?? new NodeDnsResolver();
  const endpointChecker = options.endpointChecker ?? new HttpsEndpointChecker();

  const app = Fastify({
    bodyLimit: 32 * 1024,
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers.set-cookie",
                "*.authorization",
                "*.cookie",
                "*.token",
                "*.password",
                "*.secret",
                "*.credential",
                "*.databaseUrl",
                "*.connectionString",
                "*.privateKey",
              ],
              censor: "[REDACTED]",
            },
          },
    genReqId: () => randomUUID(),
    requestIdLogLabel: "request_id",
  });

  app.decorateRequest("authUser", null);
  app.decorate("requireAuth", requireAuth(jwtVerifier));

  app.addContentTypeParser(
    "application/vnd.incident-witness.presence+json",
    { parseAs: "buffer", bodyLimit: 4 * 1024 },
    (_request, body, done) => {
      done(null, body);
    },
  );
  app.addContentTypeParser(
    "application/vnd.incident-witness.event+json",
    { parseAs: "buffer", bodyLimit: 8 * 1024 },
    (_request, body, done) => {
      done(null, body);
    },
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.allowedWebOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-request-id"],
    credentials: false,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.nodeEnv === "test" ? 10_000 : 120,
    timeWindow: "1 minute",
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (reply.sent) return;

    if (error instanceof ApiError) {
      return sendError(
        reply,
        request.id,
        error.statusCode,
        error.code,
        error.message,
        error.details,
      );
    }

    if (error.validation) {
      return sendError(
        reply,
        request.id,
        400,
        "VALIDATION_ERROR",
        "The request did not match the required schema.",
      );
    }

    if (error.statusCode === 413) {
      return sendError(
        reply,
        request.id,
        413,
        "PAYLOAD_TOO_LARGE",
        "The request body is too large.",
      );
    }

    if (error.statusCode === 415) {
      return sendError(
        reply,
        request.id,
        415,
        "VALIDATION_ERROR",
        "The request content type is not supported.",
      );
    }

    if (error.statusCode === 429) {
      return sendError(
        reply,
        request.id,
        429,
        "RATE_LIMITED",
        "Too many requests; retry later.",
      );
    }

    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error(
        { request_id: request.id, error_name: error.name, error_code: error.code },
        "request_failed",
      );
    }

    return sendError(
      reply,
      request.id,
      statusCode,
      statusCode === 404 ? "RESOURCE_NOT_FOUND" : "INTERNAL_ERROR",
      statusCode === 404
        ? "The requested resource was not found."
        : "The request could not be completed.",
    );
  });

  app.setNotFoundHandler((request, reply) => {
    return sendError(
      reply,
      request.id,
      404,
      "RESOURCE_NOT_FOUND",
      "The requested resource was not found.",
    );
  });

  app.get(
    "/health/live",
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: { status: { type: "string", const: "ok" } },
          },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/health/ready",
    { preHandler: requireHealthToken(config) },
    async (request, reply) => {
      try {
        const ready = await checkDatabaseReady(apiPool, expectedMigration);
        if (!ready) {
          return sendError(
            reply,
            request.id,
            503,
            "DEPENDENCY_UNAVAILABLE",
            "The service is not ready.",
          );
        }
        return { status: "ready" };
      } catch {
        return sendError(
          reply,
          request.id,
          503,
          "DEPENDENCY_UNAVAILABLE",
          "The service is not ready.",
        );
      }
    },
  );

  app.get(
    "/v1/me",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) {
        return sendError(reply, request.id, 401, "AUTH_REQUIRED", "Authentication is required.");
      }

      const profile = await withProviderTransaction(apiPool, user.id, async ({ client }) => {
        await client.query(
          `insert into profiles (id) values ($1) on conflict (id) do nothing`,
          [user.id],
        );
        const result = await client.query<{
          id: string;
          display_name: string | null;
          created_at: Date;
          updated_at: Date;
        }>(
          `select id, display_name, created_at, updated_at
             from profiles
            where id = $1`,
          [user.id],
        );
        return result.rows[0] ?? null;
      });

      if (!profile) {
        return sendError(reply, request.id, 404, "RESOURCE_NOT_FOUND", "Profile not found.");
      }

      return {
        data: {
          id: profile.id,
          displayName: profile.display_name,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
      };
    },
  );

  const routeContext = { config, apiPool, dnsResolver, endpointChecker };
  await registerHostRoutes(app, routeContext);
  await registerAgentRoutes(app, routeContext);
  await registerEvidenceRoutes(app, routeContext);
  await registerIncidentRoutes(app, routeContext);
  await registerRenterRoutes(app, routeContext);
  await registerSealingRoutes(app, routeContext);
  await registerKeyRoutes(app, routeContext);

  let stopSweeper: (() => void) | undefined;

  app.addHook("onReady", async () => {
    if (!options.apiPool) {
      await assertRuntimeRole(apiPool, "iw_api");
    }
    if (options.enableSweeper !== false) {
      stopSweeper = startLifecycleSweeper({
        pool: apiPool,
        config,
        logger: app.log,
      });
    }
  });

  app.addHook("onClose", async () => {
    stopSweeper?.();
    if (!options.apiPool) {
      await apiPool.end();
    }
  });

  return app;
}
