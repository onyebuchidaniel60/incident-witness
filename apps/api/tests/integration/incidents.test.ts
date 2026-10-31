import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runLifecycleSweep } from "../../src/lifecycle/sweeper.js";
import { activateHost, createIncident } from "./helpers.js";
import {
  apiPool,
  appConfig,
  idempotencyHeaders,
  inject,
  migrator,
  registerIntegrationHooks,
  seedActiveHost,
  tokenA,
  tokenB,
  userA,
} from "./harness.js";

registerIntegrationHooks();

describe("incident lifecycle APIs", () => {
  it("creates a bounded collecting incident with a probe job and audit row", async () => {
    const host = await activateHost(tokenA, "Incident host", "incident.example.com");
    const response = await createIncident(tokenA, host.hostId, { durationMinutes: 30 });
    expect(response.statusCode).toBe(201);
    const data = response.json().data as {
      incidentId: string;
      status: string;
      captureStartedAt: string;
      captureEndsAt: string;
      ingestionDeadline: string;
    };
    expect(data.status).toBe("collecting");
    const duration =
      (Date.parse(data.captureEndsAt) - Date.parse(data.captureStartedAt)) / 60_000;
    expect(duration).toBe(30);
    const grace =
      (Date.parse(data.ingestionDeadline) - Date.parse(data.captureEndsAt)) / 3_600_000;
    expect(grace).toBe(24);

    const row = await migrator.query<{ status: string; owner_user_id: string }>(
      `select status, owner_user_id from incidents where id = $1`,
      [data.incidentId],
    );
    expect(row.rows[0]).toEqual({ status: "collecting", owner_user_id: userA });

    const jobs = await migrator.query<{ status: string }>(
      `select status from probe_jobs where incident_id = $1`,
      [data.incidentId],
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]!.status).toBe("pending");

    const audit = await migrator.query<{ action: string }>(
      `select action from audit_events where resource_id = $1`,
      [data.incidentId],
    );
    expect(audit.rows.some((entry) => entry.action === "incident.created")).toBe(true);
  });

  it("enforces the 2-240 minute duration boundary", async () => {
    const host = await activateHost(tokenA, "Duration host", "duration.example.com");

    for (const durationMinutes of [1, 241]) {
      const response = await createIncident(tokenA, host.hostId, { durationMinutes });
      expect(response.statusCode).toBe(422);
    }
  });

  it("rejects a host without a fresh operational heartbeat", async () => {
    const hostId = await seedActiveHost({
      ownerUserId: userA,
      alias: "Stale host",
      hostname: "stale.example.com",
      lastSeenAt: new Date(Date.now() - 5 * 60_000),
    });
    const response = await createIncident(tokenA, hostId);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("HOST_NOT_READY");
  });

  it("allows one active session per host", async () => {
    const host = await activateHost(tokenA, "One session host", "one-session.example.com");
    const first = await createIncident(tokenA, host.hostId);
    expect(first.statusCode).toBe(201);
    const second = await createIncident(tokenA, host.hostId);
    expect(second.statusCode).toBe(409);
  });

  it("allows exactly one of two concurrent session creations for the same host", async () => {
    const host = await activateHost(tokenA, "Race session host", "race-session.example.com");
    const responses = await Promise.all([
      createIncident(tokenA, host.hostId),
      createIncident(tokenA, host.hostId),
    ]);

    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
  });

  it("allows at most three active sessions per owner", async () => {
    const hosts = await Promise.all(
      [1, 2, 3, 4].map((index) =>
        seedActiveHost({
          ownerUserId: userA,
          alias: `Limit host ${index}`,
          hostname: `limit-${index}.example.com`,
        }),
      ),
    );

    for (const hostId of hosts.slice(0, 3)) {
      const response = await createIncident(tokenA, hostId);
      expect(response.statusCode).toBe(201);
    }

    const fourth = await createIncident(tokenA, hosts[3]!);
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().error.code).toBe("INCIDENT_LIMIT_REACHED");
  });

  it("replays an identical incident Idempotency-Key", async () => {
    const host = await activateHost(tokenA, "Idempotent incident host", "idem-incident.example.com");
    const key = randomUUID();
    const first = await createIncident(tokenA, host.hostId, { idempotencyKey: key });
    expect(first.statusCode).toBe(201);
    const replay = await createIncident(tokenA, host.hostId, { idempotencyKey: key });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.incidentId).toBe(first.json().data.incidentId);

    const changed = await inject(
      "POST",
      "/v1/incidents",
      tokenA,
      {
        hostId: host.hostId,
        title: "A different title",
        durationMinutes: 30,
      },
      idempotencyHeaders(key),
    );
    expect(changed.statusCode).toBe(409);
  });

  it("isolates incidents by owner", async () => {
    const host = await activateHost(tokenA, "Isolation incident host", "isolation.example.com");
    const created = await createIncident(tokenA, host.hostId);
    const incidentId = created.json().data.incidentId as string;

    const attempts = await Promise.all([
      inject("GET", `/v1/incidents/${incidentId}`, tokenB),
      inject("POST", `/v1/incidents/${incidentId}/end`, tokenB),
      inject("POST", `/v1/incidents/${incidentId}/renter-invitations`, tokenB),
      inject("POST", `/v1/incidents/${incidentId}/keys/${randomUUID()}/revoke`, tokenB, {
        reasonCode: "USER_REQUEST",
      }),
    ]);

    for (const response of attempts) {
      expect(response.statusCode).toBe(404);
    }

    const list = await inject("GET", "/v1/incidents", tokenB);
    expect(list.json().data).toHaveLength(0);
  });

  it("ends a collecting incident idempotently and cancels future probe jobs", async () => {
    const host = await activateHost(tokenA, "End host", "end.example.com");
    const created = await createIncident(tokenA, host.hostId);
    const incidentId = created.json().data.incidentId as string;
    const futureJob = randomUUID();
    await migrator.query(
      `insert into probe_jobs (id, incident_id, host_id, scheduled_at, status)
       values ($1, $2, $3, now() + interval '5 minutes', 'pending')`,
      [futureJob, incidentId, host.hostId],
    );

    const end = await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    expect(end.statusCode).toBe(200);
    expect(end.json().data.status).toBe("awaiting_finalize");
    expect(end.json().data.endedAt).toBeTruthy();

    const job = await migrator.query<{ status: string }>(
      `select status from probe_jobs where id = $1`,
      [futureJob],
    );
    expect(job.rows[0]!.status).toBe("cancelled");

    const replay = await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.status).toBe("awaiting_finalize");

    await migrator.query(
      `update incidents
          set status = 'cancelled', cancel_reason = 'NO_EVIDENCE'
        where id = $1`,
      [incidentId],
    );
    const closed = await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    expect(closed.statusCode).toBe(409);
  });

  it("auto-ends overdue collecting incidents through the lifecycle sweeper", async () => {
    const host = await activateHost(tokenA, "Sweep host", "sweep.example.com");
    const created = await createIncident(tokenA, host.hostId);
    const incidentId = created.json().data.incidentId as string;

    await migrator.query(
      `update incidents
          set capture_started_at = now() - interval '10 minutes',
              capture_ends_at = now() - interval '1 minute'
        where id = $1`,
      [incidentId],
    );
    const futureJob = randomUUID();
    await migrator.query(
      `insert into probe_jobs (id, incident_id, host_id, scheduled_at, status)
       select $1, id, host_id, capture_ends_at + interval '1 minute', 'pending'
         from incidents where id = $2`,
      [futureJob, incidentId],
    );

    const swept = await runLifecycleSweep(apiPool, appConfig);
    expect(swept).toBeGreaterThanOrEqual(1);

    const row = await migrator.query<{ status: string; ended_at: Date | null }>(
      `select status, ended_at from incidents where id = $1`,
      [incidentId],
    );
    expect(row.rows[0]!.status).toBe("awaiting_finalize");
    expect(row.rows[0]!.ended_at).toBeTruthy();

    const job = await migrator.query<{ status: string }>(
      `select status from probe_jobs where id = $1`,
      [futureJob],
    );
    expect(job.rows[0]!.status).toBe("cancelled");

    const audit = await migrator.query<{ action: string }>(
      `select action from audit_events where resource_id = $1`,
      [incidentId],
    );
    expect(
      audit.rows.some((entry) => entry.action === "incident.capture_window_elapsed"),
    ).toBe(true);
  });

  it("lists incidents with status and host filters", async () => {
    const host = await activateHost(tokenA, "Filter host", "filter.example.com");
    const created = await createIncident(tokenA, host.hostId);
    const incidentId = created.json().data.incidentId as string;

    const filtered = await inject(
      "GET",
      `/v1/incidents?status=collecting&hostId=${host.hostId}`,
      tokenA,
    );
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data.map((entry: { id: string }) => entry.id)).toContain(incidentId);
  });
});
