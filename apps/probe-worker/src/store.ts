import type { Pool, PoolClient } from "pg";

import { deterministicProbeEventId, type SignedWorkerEvent } from "./events.js";

export const LEASE_SECONDS = 30;
export const INCIDENT_EVENT_LIMIT = 4_000;
export const INCIDENT_EVENT_BYTES_LIMIT = 7_340_032;

export type ClaimedJob = {
  jobId: string;
  incidentId: string;
  hostId: string;
  hostname: string;
  scheduledAt: Date;
  attemptCount: number;
  incidentStatus: string;
  captureEndsAt: Date;
  hostStatus: string;
};

export type EventBuilder = (sequence: number, receivedAt: Date) => SignedWorkerEvent;

export type AppendResult =
  | { kind: "appended"; eventId: string }
  | { kind: "duplicate"; eventId: string }
  | { kind: "closed" }
  | { kind: "budget_exhausted" };

export type ProbeJobStore = {
  claimDue(): Promise<ClaimedJob | null>;
  appendObservation(job: ClaimedJob, build: EventBuilder): Promise<AppendResult>;
  retry(jobId: string, code: string, delayMs: number): Promise<void>;
  dead(jobId: string, code: string): Promise<void>;
  cancel(jobId: string, code: string): Promise<void>;
};

type ClaimRow = {
  id: string;
  incident_id: string;
  host_id: string;
  scheduled_at: Date;
  attempt_count: number;
  incident_status: string;
  capture_ends_at: Date;
  endpoint_hostname: string;
  host_status: string;
};

type IncidentRow = {
  status: string;
  capture_ends_at: Date;
  accepted_event_count: number;
  accepted_event_bytes: string | number;
};

export class PostgresProbeJobStore implements ProbeJobStore {
  constructor(
    private readonly pool: Pool,
    private readonly options: {
      workerId: string;
      sourceKeyId: string;
      intervalSeconds: number;
    },
  ) {}

  private async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDue(): Promise<ClaimedJob | null> {
    return this.transaction(async (client) => {
      const selected = await client.query<ClaimRow>(
        `select j.id,
                j.incident_id,
                j.host_id,
                j.scheduled_at,
                j.attempt_count,
                i.status as incident_status,
                i.capture_ends_at,
                h.endpoint_hostname,
                h.status as host_status
           from probe_jobs j
           join incidents i on i.id = j.incident_id
           join hosts h on h.id = j.host_id
          where (
                  (j.status in ('pending', 'retry') and j.scheduled_at <= now())
                  or (j.status = 'leased' and j.lease_expires_at < now())
                )
          order by j.scheduled_at asc
          for update of j skip locked
          limit 1`,
      );
      const row = selected.rows[0];
      if (!row) return null;

      const updated = await client.query<{ attempt_count: number }>(
        `update probe_jobs
            set status = 'leased',
                lease_owner = $1,
                lease_expires_at = now() + interval '30 seconds',
                attempt_count = attempt_count + 1
          where id = $2
          returning attempt_count`,
        [this.options.workerId.slice(0, 80), row.id],
      );
      const attemptCount = updated.rows[0]?.attempt_count;
      if (attemptCount === undefined) return null;

      return {
        jobId: row.id,
        incidentId: row.incident_id,
        hostId: row.host_id,
        hostname: row.endpoint_hostname,
        scheduledAt: row.scheduled_at,
        attemptCount,
        incidentStatus: row.incident_status,
        captureEndsAt: row.capture_ends_at,
        hostStatus: row.host_status,
      };
    });
  }

  async appendObservation(job: ClaimedJob, build: EventBuilder): Promise<AppendResult> {
    return this.transaction(async (client) => {
      const incidentResult = await client.query<IncidentRow>(
        `select status, capture_ends_at, accepted_event_count, accepted_event_bytes
           from incidents
          where id = $1
          for update`,
        [job.incidentId],
      );
      const incident = incidentResult.rows[0];
      if (
        !incident ||
        !["collecting", "awaiting_finalize"].includes(incident.status) ||
        Date.now() > incident.capture_ends_at.getTime()
      ) {
        await this.markCancelled(client, job.jobId, "INCIDENT_CLOSED");
        return { kind: "closed" };
      }

      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        this.options.sourceKeyId,
      ]);

      const expectedEventId = deterministicProbeEventId(job.jobId, job.attemptCount);
      const existing = await client.query<{ id: string }>(
        `select id from evidence_events where id = $1`,
        [expectedEventId],
      );
      if (existing.rows[0]) {
        await this.markCompleted(client, job.jobId);
        return { kind: "duplicate", eventId: expectedEventId };
      }

      const sequenceResult = await client.query<{ next_sequence: string }>(
        `select (coalesce(max(sequence), 0) + 1)::text as next_sequence
           from evidence_events
          where source_key_id = $1`,
        [this.options.sourceKeyId],
      );
      const sequence = Number(sequenceResult.rows[0]?.next_sequence ?? "0");
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new Error("Could not allocate a safe probe event sequence");
      }

      const receivedAt = new Date();
      const event = build(sequence, receivedAt);
      if (event.eventId !== expectedEventId) {
        throw new Error("Probe event identifier did not match the deterministic schedule");
      }

      const acceptedCount = Number(incident.accepted_event_count);
      const acceptedBytes = Number(incident.accepted_event_bytes);
      if (
        acceptedCount >= INCIDENT_EVENT_LIMIT ||
        acceptedBytes + event.entryBytes > INCIDENT_EVENT_BYTES_LIMIT
      ) {
        await this.markCompleted(client, job.jobId, "INCIDENT_EVIDENCE_LIMIT");
        return { kind: "budget_exhausted" };
      }

      await client.query(
        `insert into evidence_events
           (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at,
            received_at, canonical_event, canonical_sha256, signature, simulation_mode,
            validation_status)
         values ($1, $2, $3, 'platform_probe', $4, $5, $6, $7, $8::jsonb, $9, $10, false,
                 'accepted')`,
        [
          event.eventId,
          job.incidentId,
          this.options.sourceKeyId,
          event.eventType,
          event.sequence,
          new Date(event.envelope.observed_at),
          receivedAt,
          event.bodyJson,
          event.bodyDigest,
          event.signatureBytes,
        ],
      );

      await client.query(
        `update incidents
            set accepted_event_count = accepted_event_count + 1,
                accepted_event_bytes = accepted_event_bytes + $1::bigint
          where id = $2`,
        [event.entryBytes, job.incidentId],
      );

      await this.markCompleted(client, job.jobId);
      await this.scheduleNext(client, job, incident.capture_ends_at);
      return { kind: "appended", eventId: event.eventId };
    });
  }

  private async markCancelled(client: PoolClient, jobId: string, code: string): Promise<void> {
    await client.query(
      `update probe_jobs
          set status = 'cancelled',
              lease_owner = null,
              lease_expires_at = null,
              last_error_code = $2,
              completed_at = now()
        where id = $1`,
      [jobId, code.slice(0, 50)],
    );
  }

  private async markCompleted(
    client: PoolClient,
    jobId: string,
    code: string | null = null,
  ): Promise<void> {
    await client.query(
      `update probe_jobs
          set status = 'completed',
              lease_owner = null,
              lease_expires_at = null,
              last_error_code = $2,
              completed_at = now()
        where id = $1`,
      [jobId, code],
    );
  }

  private async scheduleNext(
    client: PoolClient,
    job: ClaimedJob,
    currentCaptureEnd: Date,
  ): Promise<void> {
    const interval = this.options.intervalSeconds;
    if (currentCaptureEnd.getTime() <= Date.now() + interval * 1_000) return;

    await client.query(
      `insert into probe_jobs (incident_id, host_id, scheduled_at, status)
       select $1, $2,
              greatest(now() + interval '1 second',
                       $3::timestamptz + ($4::int * interval '1 second')),
              'pending'
        where $5::timestamptz > now() + ($4::int * interval '1 second')`,
      [job.incidentId, job.hostId, job.scheduledAt, interval, currentCaptureEnd],
    );
  }

  async retry(jobId: string, code: string, delayMs: number): Promise<void> {
    await this.pool.query(
      `update probe_jobs
          set status = 'retry',
              lease_owner = null,
              lease_expires_at = null,
              last_error_code = $2,
              scheduled_at = now() + ($3::int * interval '1 millisecond')
        where id = $1`,
      [jobId, code.slice(0, 50), Math.max(0, Math.min(300_000, Math.round(delayMs)))],
    );
  }

  async dead(jobId: string, code: string): Promise<void> {
    await this.pool.query(
      `update probe_jobs
          set status = 'dead',
              lease_owner = null,
              lease_expires_at = null,
              last_error_code = $2,
              completed_at = now()
        where id = $1`,
      [jobId, code.slice(0, 50)],
    );
  }

  async cancel(jobId: string, code: string): Promise<void> {
    await this.pool.query(
      `update probe_jobs
          set status = 'cancelled',
              lease_owner = null,
              lease_expires_at = null,
              last_error_code = $2,
              completed_at = now()
        where id = $1`,
      [jobId, code.slice(0, 50)],
    );
  }
}
