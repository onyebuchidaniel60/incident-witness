import { randomUUID } from "node:crypto";

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
import { ensureProfile, requireProviderId } from "../domain/provider.js";
import { constantTimeEqual } from "../domain/tokens.js";
import { ApiError, sendError } from "../errors.js";
import type { RouteContext } from "./context.js";

const uuidSchema = z.string().uuid();

const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Label contains control characters");

const incidentCreateBodySchema = z
  .object({
    hostId: uuidSchema,
    title: labelSchema,
    durationMinutes: z.number().int().min(2).max(240),
    workloadRef: z
      .string()
      .trim()
      .max(100)
      .refine(
        (value) => !/[\u0000-\u001f\u007f]/.test(value),
        "Workload reference contains control characters",
      )
      .optional(),
    demoMode: z.boolean().optional(),
  })
  .strict();

const incidentStatusSchema = z.enum(["collecting", "awaiting_finalize", "sealed", "cancelled"]);

const incidentListQuerySchema = z.object({
  status: incidentStatusSchema.optional(),
  hostId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

const incidentParamsSchema = z.object({
  incidentId: uuidSchema,
});

type IncidentRow = {
  id: string;
  owner_user_id: string;
  host_id: string;
  title: string;
  workload_ref: string | null;
  status: string;
  capture_started_at: Date;
  capture_ends_at: Date;
  ingestion_deadline: Date;
  ended_at: Date | null;
  sealed_at: Date | null;
  rule_version: string | null;
  assessment_code: string | null;
  evidence_grade: string | null;
  simulation_present: boolean;
  accepted_event_count: number;
  accepted_event_bytes: number;
  demo_mode: boolean;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

function incidentSummary(row: IncidentRow) {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    workloadRef: row.workload_ref,
    status: row.status,
    captureStartedAt: row.capture_started_at,
    captureEndsAt: row.capture_ends_at,
    ingestionDeadline: row.ingestion_deadline,
    endedAt: row.ended_at,
    sealedAt: row.sealed_at,
    demoMode: row.demo_mode,
    cancelReason: row.cancel_reason,
    simulationPresent: row.simulation_present,
    acceptedEventCount: row.accepted_event_count,
    acceptedEventBytes: row.accepted_event_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assessment:
      row.status === "sealed"
        ? {
            code: row.assessment_code,
            evidenceGrade: row.evidence_grade,
            ruleVersion: row.rule_version,
          }
        : null,
  };
}

async function loadOwnedIncident(
  client: PoolClient,
  incidentId: string,
  lock = false,
): Promise<IncidentRow> {
  const result = await client.query<IncidentRow>(
    `select id, owner_user_id, host_id, title, workload_ref, status,
            capture_started_at, capture_ends_at, ingestion_deadline, ended_at, sealed_at,
            rule_version, assessment_code, evidence_grade, simulation_present,
            accepted_event_count, accepted_event_bytes, demo_mode, cancel_reason,
            created_at, updated_at
       from incidents
      where id = $1
      ${lock ? "for update" : ""}`,
    [incidentId],
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

async function replayIncidentCreation(
  transaction: TransactionContext,
  ownerUserId: string,
  operation: string,
  keyHash: Buffer,
  expectedRequestHash: Buffer,
): Promise<ReturnType<typeof incidentSummary>> {
  const existing = await findIdempotencyRecord(transaction.client, ownerUserId, operation, keyHash);
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
  const incident = await loadOwnedIncident(transaction.client, existing.resourceId);
  return incidentSummary(incident);
}

async function cancelFutureProbeJobs(
  client: PoolClient,
  incidentId: string,
  after: Date,
): Promise<number> {
  const result = await client.query(
    `update probe_jobs
        set status = 'cancelled'
      where incident_id = $1
        and status in ('pending', 'retry')
        and scheduled_at > $2`,
    [incidentId, after],
  );
  return result.rowCount ?? 0;
}

export async function registerIncidentRoutes(
  app: FastifyInstance,
  context: RouteContext,
): Promise<void> {
  const { apiPool, config } = context;
  const operation = "create_incident";

  app.post(
    "/v1/incidents",
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["hostId", "title", "durationMinutes"],
          properties: {
            hostId: { type: "string", format: "uuid" },
            title: { type: "string", minLength: 1, maxLength: 100 },
            durationMinutes: { type: "integer" },
            workloadRef: { type: "string", maxLength: 100 },
            demoMode: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const idempotencyKey = requireIdempotencyKey(request.headers["idempotency-key"]);
      const parsed = incidentCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "The evidence session details are invalid.",
        );
      }

      if (parsed.data.demoMode && !config.enableDemoSessions) {
        return sendError(
          reply,
          request.id,
          422,
          "VALIDATION_ERROR",
          "Demo sessions are not enabled.",
          { reasonCode: "DEMO_NOT_ENABLED" },
        );
      }

      const keyHash = idempotencyKeyHash(config.tokenPepper, idempotencyKey);
      const bodyHash = requestHash(parsed.data);
      const captureStartedAt = new Date();
      const captureEndsAt = new Date(
        captureStartedAt.getTime() + parsed.data.durationMinutes * 60_000,
      );
      const ingestionDeadline = new Date(captureEndsAt.getTime() + 24 * 60 * 60 * 1000);

      const create = async () =>
        withProviderTransaction(apiPool, userId, async (transaction) => {
          await ensureProfile(transaction.client, userId);

          await transaction.client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
            userId,
          ]);

          const existing = await findIdempotencyRecord(
            transaction.client,
            userId,
            operation,
            keyHash,
          );
          if (existing) {
            return replayIncidentCreation(transaction, userId, operation, keyHash, bodyHash);
          }

          const hostResult = await transaction.client.query<{
            id: string;
            status: string;
            endpoint_verified_at: Date | null;
            heartbeat_fresh: boolean;
          }>(
            `select id, status, endpoint_verified_at,
                    (last_agent_seen_at is not null
                     and last_agent_seen_at >= now() - interval '60 seconds') as heartbeat_fresh
               from hosts
              where id = $1
              for update`,
            [parsed.data.hostId],
          );
          const host = hostResult.rows[0];
          if (!host) {
            throw new ApiError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
          }
          if (host.status !== "active" || !host.endpoint_verified_at) {
            throw new ApiError(
              409,
              "HOST_NOT_READY",
              "The host must be active with a verified endpoint.",
            );
          }
          if (!host.heartbeat_fresh) {
            throw new ApiError(
              409,
              "HOST_NOT_READY",
              "The host has not sent a fresh operational heartbeat.",
            );
          }

          const activeCount = await transaction.client.query<{ count: string }>(
            `select count(*)::text as count
               from incidents
              where owner_user_id = $1
                and status in ('collecting', 'awaiting_finalize')`,
            [userId],
          );
          if (Number(activeCount.rows[0]?.count ?? "0") >= 3) {
            throw new ApiError(
              409,
              "INCIDENT_LIMIT_REACHED",
              "The account already has the maximum number of active evidence sessions.",
            );
          }

          const hostActive = await transaction.client.query<{ count: string }>(
            `select count(*)::text as count
               from incidents
              where host_id = $1
                and status in ('collecting', 'awaiting_finalize')`,
            [host.id],
          );
          if (Number(hostActive.rows[0]?.count ?? "0") > 0) {
            throw new ApiError(
              409,
              "RESOURCE_CONFLICT",
              "This host already has an active evidence session.",
            );
          }

          const incidentId = randomUUID();
          await transaction.client.query(
            `insert into incidents
               (id, owner_user_id, host_id, title, workload_ref, status,
                capture_started_at, capture_ends_at, ingestion_deadline, demo_mode)
             values ($1, $2, $3, $4, $5, 'collecting', $6, $7, $8, $9)`,
            [
              incidentId,
              userId,
              host.id,
              parsed.data.title,
              parsed.data.workloadRef ?? null,
              captureStartedAt,
              captureEndsAt,
              ingestionDeadline,
              parsed.data.demoMode ?? false,
            ],
          );
          await transaction.client.query(
            `insert into probe_jobs (incident_id, host_id, scheduled_at, status)
             values ($1, $2, $3, 'pending')`,
            [incidentId, host.id, captureStartedAt],
          );
          await insertIdempotencyRecord(transaction.client, {
            ownerUserId: userId,
            operation,
            keyHash,
            requestHash: bodyHash,
            responseStatus: 201,
            resourceId: incidentId,
          });
          await appendAudit(transaction.client, {
            actorType: "provider",
            actorId: userId,
            ownerUserId: userId,
            resourceType: "incident",
            resourceId: incidentId,
            action: "incident.created",
            requestId: request.id,
            metadata: {
              durationMinutes: parsed.data.durationMinutes,
              demoMode: parsed.data.demoMode ?? false,
            },
          });

          return {
            id: incidentId,
            hostId: host.id,
            title: parsed.data.title,
            workloadRef: parsed.data.workloadRef ?? null,
            status: "collecting",
            captureStartedAt,
            captureEndsAt,
            ingestionDeadline,
            endedAt: null,
            sealedAt: null,
            demoMode: parsed.data.demoMode ?? false,
            cancelReason: null,
            simulationPresent: false,
            acceptedEventCount: 0,
            acceptedEventBytes: 0,
            createdAt: captureStartedAt,
            updatedAt: captureStartedAt,
            assessment: null,
          };
        });

      try {
        const incident = await create();
        return reply.code(201).send({
          data: {
            incidentId: incident.id,
            status: incident.status,
            captureStartedAt: incident.captureStartedAt,
            captureEndsAt: incident.captureEndsAt,
            ingestionDeadline: incident.ingestionDeadline,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error, "idempotency_records_key_idx")) {
          const replayed = await withProviderTransaction(apiPool, userId, async (transaction) =>
            replayIncidentCreation(transaction, userId, operation, keyHash, bodyHash),
          );
          return reply.code(201).send({
            data: {
              incidentId: replayed.id,
              status: replayed.status,
              captureStartedAt: replayed.captureStartedAt,
              captureEndsAt: replayed.captureEndsAt,
              ingestionDeadline: replayed.ingestionDeadline,
            },
          });
        }
        if (isUniqueViolation(error, "incidents_one_active_per_host_idx")) {
          return sendError(
            reply,
            request.id,
            409,
            "RESOURCE_CONFLICT",
            "This host already has an active evidence session.",
          );
        }
        throw error;
      }
    },
  );

  app.get(
    "/v1/incidents",
    {
      preHandler: app.requireAuth,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: {
              type: "string",
              enum: ["collecting", "awaiting_finalize", "sealed", "cancelled"],
            },
            hostId: { type: "string", format: "uuid" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", minLength: 1, maxLength: 512 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = requireProviderId(request);
      const parsed = incidentListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(
          reply,
          request.id,
          400,
          "VALIDATION_ERROR",
          "The incident filters are invalid.",
        );
      }

      const limit = parsed.data.limit ?? 50;
      const cursor = decodeCursor(parsed.data.cursor);
      if (parsed.data.cursor && !cursor) {
        return sendError(
          reply,
          request.id,
          400,
          "VALIDATION_ERROR",
          "The pagination cursor is invalid.",
        );
      }

      const rows = await withProviderTransaction(apiPool, userId, async ({ client }) => {
        const result = await client.query<IncidentRow>(
          `select id, owner_user_id, host_id, title, workload_ref, status,
                  capture_started_at, capture_ends_at, ingestion_deadline, ended_at, sealed_at,
                  rule_version, assessment_code, evidence_grade, simulation_present,
                  accepted_event_count, accepted_event_bytes, demo_mode, cancel_reason,
                  created_at, updated_at
             from incidents
            where ($1::incident_status is null or status = $1::incident_status)
              and ($2::uuid is null or host_id = $2::uuid)
              and ($3::timestamptz is null or (created_at, id) < ($3::timestamptz, $4::uuid))
            order by created_at desc, id desc
            limit $5`,
          [
            parsed.data.status ?? null,
            parsed.data.hostId ?? null,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
            limit,
          ],
        );
        return result.rows;
      });

      const last = rows.at(-1);
      return {
        data: rows.map(incidentSummary),
        page: {
          nextCursor: rows.length === limit && last ? encodeCursor(last.created_at, last.id) : null,
        },
      };
    },
  );

  app.get(
    "/v1/incidents/:incidentId",
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
    async (request) => {
      const userId = requireProviderId(request);
      const { incidentId } = incidentParamsSchema.parse(request.params);

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const incident = await loadOwnedIncident(client, incidentId);

        const keys = await client.query<{
          id: string;
          source_type: string;
          status: string;
          last_seen_at: Date | null;
          created_at: Date;
        }>(
          `select id, source_type, status, last_seen_at, created_at
             from witness_keys
            where (host_id = $1 and source_type = 'host_agent')
               or (incident_id = $2 and source_type = 'renter_client')
            order by source_type, created_at`,
          [incident.host_id, incidentId],
        );

        const counts = await client.query<{
          source_type: string;
          count: string;
          last_observed_at: Date | null;
        }>(
          `select source_type, count(*)::text as count, max(observed_at) as last_observed_at
             from evidence_events
            where incident_id = $1
            group by source_type`,
          [incidentId],
        );
        const countBySource = new Map(counts.rows.map((row) => [row.source_type, row]));

        const timeline = await client.query<{
          id: string;
          source_key_id: string;
          source_type: string;
          event_type: string;
          sequence: string;
          observed_at: Date;
          received_at: Date;
          canonical_event: unknown;
          simulation_mode: boolean;
        }>(
          `select id, source_key_id, source_type, event_type, sequence, observed_at, received_at,
                  canonical_event, simulation_mode
             from (
               select id, source_key_id, source_type, event_type, sequence, observed_at, received_at,
                      canonical_event, simulation_mode
                 from evidence_events
                where incident_id = $1
                order by observed_at desc, source_type desc, source_key_id desc, sequence desc, id desc
                limit 50
             ) latest
            order by observed_at asc, source_type asc, source_key_id asc, sequence asc, id asc`,
          [incidentId],
        );

        return {
          data: {
            ...incidentSummary(incident),
            sources: keys.rows.map((key) => ({
              id: key.id,
              sourceType: key.source_type,
              status: key.status,
              lastSeenAt: key.last_seen_at,
              createdAt: key.created_at,
              acceptedEventCount: Number(countBySource.get(key.source_type)?.count ?? "0"),
              lastObservedAt: countBySource.get(key.source_type)?.last_observed_at ?? null,
            })),
            timeline: timeline.rows.map((event) => {
              const body =
                typeof event.canonical_event === "object" &&
                event.canonical_event !== null &&
                !Array.isArray(event.canonical_event)
                  ? (event.canonical_event as Record<string, unknown>)
                  : {};
              return {
                eventId: event.id,
                sourceKeyId: event.source_key_id,
                sourceType: event.source_type,
                eventType: event.event_type,
                sequence: Number(event.sequence),
                observedAt: event.observed_at,
                receivedAt: event.received_at,
                payload:
                  typeof body.payload === "object" &&
                  body.payload !== null &&
                  !Array.isArray(body.payload)
                    ? body.payload
                    : {},
                simulationMode: event.simulation_mode,
              };
            }),
          },
        };
      });
    },
  );

  app.post(
    "/v1/incidents/:incidentId/end",
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
    async (request) => {
      const userId = requireProviderId(request);
      const { incidentId } = incidentParamsSchema.parse(request.params);

      return withProviderTransaction(apiPool, userId, async ({ client }) => {
        const incident = await loadOwnedIncident(client, incidentId, true);

        if (incident.status === "awaiting_finalize") {
          return {
            data: {
              incidentId,
              status: incident.status,
              captureEndsAt: incident.capture_ends_at,
              ingestionDeadline: incident.ingestion_deadline,
              endedAt: incident.ended_at,
            },
          };
        }
        if (incident.status !== "collecting") {
          throw new ApiError(
            409,
            "INCIDENT_NOT_COLLECTING",
            "Only a collecting evidence session can be ended.",
          );
        }

        const latestObservation = await client.query<{ latest: Date | null }>(
          `select max(observed_at) as latest
             from evidence_events
            where incident_id = $1`,
          [incidentId],
        );
        const latestObservedAt = latestObservation.rows[0]?.latest?.getTime() ?? 0;
        const endedAt = new Date(Math.max(Date.now(), latestObservedAt));

        await client.query(
          `update incidents set status = 'awaiting_finalize', ended_at = $1 where id = $2`,
          [endedAt, incidentId],
        );
        const cancelledProbeJobs = await cancelFutureProbeJobs(client, incidentId, endedAt);

        await appendAudit(client, {
          actorType: "provider",
          actorId: userId,
          ownerUserId: userId,
          resourceType: "incident",
          resourceId: incidentId,
          action: "incident.ended",
          requestId: request.id,
          metadata: { cancelledProbeJobs },
        });

        return {
          data: {
            incidentId,
            status: "awaiting_finalize",
            captureEndsAt: incident.capture_ends_at,
            ingestionDeadline: incident.ingestion_deadline,
            endedAt,
          },
        };
      });
    },
  );
}
