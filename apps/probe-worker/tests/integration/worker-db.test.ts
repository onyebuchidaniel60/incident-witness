import { randomUUID, createPrivateKey } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";

import { loadEnvironment } from "@incident-witness/db";
import { createSourceKeyCertificate, publicKeyFingerprint } from "@incident-witness/protocol/node";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildWorkerEvent } from "../../src/events.js";
import { PostgresProbeJobStore, type ClaimedJob } from "../../src/store.js";

loadEnvironment();

const OWNER_ID = randomUUID();
const HOST_ID = randomUUID();
const INCIDENT_ID = randomUUID();
const KEY_ID = randomUUID();
const JOB_ID = randomUUID();
const EXPIRED_JOB_ID = randomUUID();

const migrator = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATOR, max: 1 });
const worker = new Pool({ connectionString: process.env.DATABASE_URL_IW_WORKER, max: 2 });

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
const publicKeyBase64Url = jwk.x!;
const publicKeyBytes = Buffer.from(publicKeyBase64Url, "base64url");
const fingerprint = publicKeyFingerprint(publicKeyBase64Url);

const platformRoot = (() => {
  const key = process.env.IW_PLATFORM_SIGNING_PRIVATE_KEY;
  if (!key) throw new Error("IW_PLATFORM_SIGNING_PRIVATE_KEY is required for this test");
  return createSourceKeyCertificate(
    {
      certificate_version: "1.0",
      source_key_id: KEY_ID,
      source_type: "platform_probe",
      public_key: publicKeyBase64Url,
      fingerprint,
      issued_at: new Date().toISOString(),
      protocol_version: "1.0",
    },
    createPrivateKey({ key: Buffer.from(key, "base64"), format: "der", type: "pkcs8" }),
  );
})();

async function cleanup(): Promise<void> {
  await migrator.query("delete from evidence_events where incident_id = $1", [INCIDENT_ID]);
  await migrator.query("delete from probe_jobs where incident_id = $1", [INCIDENT_ID]);
  await migrator.query("delete from witness_keys where id = $1", [KEY_ID]);
  await migrator.query("delete from incidents where id = $1", [INCIDENT_ID]);
  await migrator.query("delete from hosts where id = $1", [HOST_ID]);
  await migrator.query("delete from profiles where id = $1", [OWNER_ID]);
  await migrator.query("delete from auth.users where id = $1", [OWNER_ID]);
}

describe("iw_worker probe access", () => {
  beforeAll(async () => {
    await cleanup();

    await migrator.query(
      `insert into auth.users
         (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', 'iw-phase3e-worker@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [OWNER_ID],
    );
    await migrator.query(`insert into profiles (id, display_name) values ($1, 'Phase 3E Worker')`, [
      OWNER_ID,
    ]);
    await migrator.query(
      `insert into hosts
         (id, owner_user_id, alias, endpoint_hostname, endpoint_verified_at, status)
       values ($1, $2, 'phase3e-worker', 'gpu.example.com', now(), 'active')`,
      [HOST_ID, OWNER_ID],
    );
    await migrator.query(
      `insert into incidents
         (id, owner_user_id, host_id, title, status, capture_started_at, capture_ends_at,
          ingestion_deadline, demo_mode)
       values ($1, $2, $3, 'phase3e-worker', 'collecting', now() - interval '1 minute',
               now() + interval '10 minutes', now() + interval '24 hours', false)`,
      [INCIDENT_ID, OWNER_ID, HOST_ID],
    );
    await migrator.query(
      `insert into witness_keys
         (id, owner_user_id, host_id, incident_id, source_type, public_key, fingerprint,
          status, certificate_json, certificate_signature)
       values ($1, null, null, null, 'platform_probe', $2, $3, 'active', $4::jsonb, $5)`,
      [
        KEY_ID,
        publicKeyBytes,
        fingerprint,
        JSON.stringify(platformRoot.certificate),
        Buffer.from(platformRoot.signature, "base64url"),
      ],
    );
    await migrator.query(
      `insert into probe_jobs (id, incident_id, host_id, scheduled_at, status)
       values ($1, $2, $3, now() - interval '1 second', 'pending')`,
      [JOB_ID, INCIDENT_ID, HOST_ID],
    );
    await migrator.query(
      `insert into probe_jobs
         (id, incident_id, host_id, scheduled_at, status, lease_owner, lease_expires_at, attempt_count)
       values ($1, $2, $3, now() - interval '1 minute', 'leased', 'crashed-worker',
               now() - interval '10 seconds', 1)`,
      [EXPIRED_JOB_ID, INCIDENT_ID, HOST_ID],
    );
  });

  afterAll(async () => {
    await cleanup();
    await migrator.end();
    await worker.end();
  });

  it("refuses a new observation after the provider ends the capture window", async () => {
    const endedJobId = randomUUID();
    await migrator.query(
      `insert into probe_jobs (id, incident_id, host_id, scheduled_at, status)
       values ($1, $2, $3, now() - interval '1 second', 'pending')`,
      [endedJobId, INCIDENT_ID, HOST_ID],
    );
    await migrator.query(
      `update incidents
          set status = 'awaiting_finalize', ended_at = now() - interval '1 second'
        where id = $1`,
      [INCIDENT_ID],
    );

    const store = new PostgresProbeJobStore(worker, {
      workerId: "phase5-ended-worker",
      sourceKeyId: KEY_ID,
      intervalSeconds: 15,
    });

    const result = await store.appendObservation(
      {
        jobId: endedJobId,
        incidentId: INCIDENT_ID,
        hostId: HOST_ID,
        hostname: "gpu.example.com",
        scheduledAt: new Date(),
        attemptCount: 1,
        incidentStatus: "awaiting_finalize",
        captureEndsAt: new Date(Date.now() + 10 * 60_000),
        hostStatus: "active",
      },
      (sequence, receivedAt) =>
        buildWorkerEvent({
          jobId: endedJobId,
          attempt: 1,
          incidentId: INCIDENT_ID,
          sourceKeyId: KEY_ID,
          privateKey,
          eventType: "platform_probe_result",
          payload: {
            target_host_id: HOST_ID,
            probe_status: "completed",
            dns_result: "resolved",
            tls_result: "valid",
            http_result: "expected",
            latency_ms: 10,
            response_class: "expected",
            observed_ip_class: "public",
          },
          sequence,
          observedAt: receivedAt,
          receivedAt,
        }),
    );
    expect(result.kind).toBe("closed");

    const jobs = await migrator.query<{ status: string }>(
      `select status from probe_jobs where id = $1`,
      [endedJobId],
    );
    expect(jobs.rows[0]?.status).toBe("cancelled");

    await migrator.query(
      `update incidents set status = 'collecting', ended_at = null where id = $1`,
      [INCIDENT_ID],
    );
  });

  it("claims an expired lease and appends a signed platform event with counters", async () => {
    const store = new PostgresProbeJobStore(worker, {
      workerId: "phase3e-test-worker",
      sourceKeyId: KEY_ID,
      intervalSeconds: 15,
    });

    const expired = await store.claimDue();
    expect(expired?.jobId).toBe(EXPIRED_JOB_ID);
    expect(expired?.attemptCount).toBe(2);

    const job = await store.claimDue();
    expect(job?.jobId).toBe(JOB_ID);
    expect(job?.hostname).toBe("gpu.example.com");

    const result = await store.appendObservation(job as ClaimedJob, (sequence, receivedAt) =>
      buildWorkerEvent({
        jobId: job!.jobId,
        attempt: job!.attemptCount,
        incidentId: INCIDENT_ID,
        sourceKeyId: KEY_ID,
        privateKey,
        eventType: "platform_probe_result",
        payload: {
          target_host_id: HOST_ID,
          probe_status: "completed",
          dns_result: "resolved",
          tls_result: "valid",
          http_result: "expected",
          latency_ms: 10,
          response_class: "expected",
          observed_ip_class: "public",
        },
        sequence,
        observedAt: receivedAt,
        receivedAt,
      }),
    );

    expect(result.kind).toBe("appended");

    const event = await migrator.query<{
      source_type: string;
      accepted_event_count: number;
      accepted_event_bytes: string;
    }>(
      `select e.source_type, i.accepted_event_count, i.accepted_event_bytes
         from evidence_events e
         join incidents i on i.id = e.incident_id
        where e.incident_id = $1`,
      [INCIDENT_ID],
    );
    expect(event.rows[0]).toMatchObject({
      source_type: "platform_probe",
      accepted_event_count: 1,
    });
    expect(Number(event.rows[0]?.accepted_event_bytes)).toBeGreaterThan(0);

    const completed = await migrator.query<{ status: string }>(
      `select status from probe_jobs where id = $1`,
      [JOB_ID],
    );
    expect(completed.rows[0]?.status).toBe("completed");

    const next = await migrator.query<{ status: string }>(
      `select status from probe_jobs
        where incident_id = $1 and status = 'pending'
        order by scheduled_at desc limit 1`,
      [INCIDENT_ID],
    );
    expect(next.rows[0]?.status).toBe("pending");
  });
});
