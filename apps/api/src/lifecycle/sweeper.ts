import { randomUUID } from "node:crypto";

import { withApiTransaction } from "@incident-witness/db";
import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";

import { appendAudit } from "../domain/audit.js";

const SWEEP_INTERVAL_MS = 2000;
const SWEEP_BATCH_SIZE = 20;

type OverdueIncident = {
  id: string;
  owner_user_id: string;
  capture_ends_at: Date;
};

/**
 * Transitions collecting incidents whose capture window has elapsed into
 * awaiting_finalize. Multiple API instances are safe: rows are claimed with
 * FOR UPDATE SKIP LOCKED and no process-local timer is authoritative.
 */
export async function runLifecycleSweep(pool: Pool): Promise<number> {
  return withApiTransaction(pool, { mode: "system_lifecycle" }, async ({ client }) => {
    const result = await client.query<OverdueIncident>(
      `select id, owner_user_id, capture_ends_at
         from incidents
        where status = 'collecting'
          and capture_ends_at <= now()
        order by capture_ends_at asc
        limit $1
        for update skip locked`,
      [SWEEP_BATCH_SIZE],
    );

    for (const incident of result.rows) {
      await client.query(
        `update probe_jobs
            set status = 'cancelled'
          where incident_id = $1
            and status in ('pending', 'retry')
            and scheduled_at > $2`,
        [incident.id, incident.capture_ends_at],
      );
      await client.query(
        `update incidents
            set status = 'awaiting_finalize', ended_at = $1
          where id = $2`,
        [incident.capture_ends_at, incident.id],
      );
      await appendAudit(client, {
        actorType: "system",
        ownerUserId: incident.owner_user_id,
        resourceType: "incident",
        resourceId: incident.id,
        action: "incident.capture_window_elapsed",
        requestId: randomUUID(),
        metadata: { reasonCode: "CAPTURE_WINDOW_ELAPSED" },
      });
    }

    return result.rowCount ?? 0;
  });
}

export function startLifecycleSweeper(input: {
  pool: Pool;
  logger: FastifyBaseLogger;
  intervalMs?: number;
}): () => void {
  let running = false;
  let stopped = false;

  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    void runLifecycleSweep(input.pool)
      .catch((error: unknown) => {
        input.logger.error(
          {
            error_name: error instanceof Error ? error.name : "unknown",
            error_code:
              error && typeof error === "object" && "code" in error
                ? String((error as { code?: unknown }).code)
                : undefined,
          },
          "lifecycle_sweep_failed",
        );
      })
      .finally(() => {
        running = false;
      });
  }, input.intervalMs ?? SWEEP_INTERVAL_MS);

  timer.unref();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
