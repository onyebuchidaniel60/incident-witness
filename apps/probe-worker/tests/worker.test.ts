import { generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";

import { eventEnvelopeSchema, type EventEnvelope } from "@incident-witness/protocol";
import { exportPublicKeyBase64Url, verifyEventEnvelope } from "@incident-witness/protocol/node";
import { describe, expect, it } from "vitest";

import type { Logger } from "../src/logger.js";
import { probeHostname, type ProbeOutcome } from "../src/probe.js";
import type { ClaimedJob, EventBuilder, ProbeJobStore } from "../src/store.js";
import { ProbeWorker } from "../src/worker.js";

const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";
const HOST_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

type FakeJob = ClaimedJob & { status: string; leaseExpiresAt: Date | null };

class FakeStore implements ProbeJobStore {
  readonly jobs: FakeJob[];
  readonly events: EventEnvelope[] = [];
  readonly retried: Array<{ jobId: string; code: string; delayMs: number }> = [];
  readonly deadJobs: string[] = [];
  readonly cancelled: string[] = [];
  private sequence = 1;
  private clock: Date;

  constructor(jobs: FakeJob[], clock = new Date()) {
    this.jobs = jobs;
    this.clock = clock;
  }

  advance(milliseconds: number): void {
    this.clock = new Date(this.clock.getTime() + milliseconds);
  }

  async claimDue(): Promise<ClaimedJob | null> {
    const job = this.jobs.find(
      (candidate) =>
        candidate.status === "pending" ||
        candidate.status === "retry" ||
        (candidate.status === "leased" &&
          candidate.leaseExpiresAt !== null &&
          candidate.leaseExpiresAt <= this.clock),
    );
    if (!job) return null;

    job.status = "leased";
    job.attemptCount += 1;
    job.leaseExpiresAt = new Date(this.clock.getTime() + 30_000);
    return { ...job };
  }

  async appendObservation(job: ClaimedJob, build: EventBuilder) {
    const event = build(this.sequence, this.clock);
    this.sequence += 1;
    this.events.push(event.envelope);
    const target = this.jobs.find((candidate) => candidate.jobId === job.jobId);
    if (target) target.status = "completed";
    return { kind: "appended" as const, eventId: event.eventId };
  }

  async retry(jobId: string, code: string, delayMs: number): Promise<void> {
    this.retried.push({ jobId, code, delayMs });
    const target = this.jobs.find((candidate) => candidate.jobId === jobId);
    if (target) target.status = "retry";
  }

  async dead(jobId: string): Promise<void> {
    this.deadJobs.push(jobId);
    const target = this.jobs.find((candidate) => candidate.jobId === jobId);
    if (target) target.status = "dead";
  }

  async cancel(jobId: string): Promise<void> {
    this.cancelled.push(jobId);
    const target = this.jobs.find((candidate) => candidate.jobId === jobId);
    if (target) target.status = "cancelled";
  }
}

function makeJob(overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    jobId: JOB_ID,
    incidentId: INCIDENT_ID,
    hostId: HOST_ID,
    hostname: "gpu.example.com",
    scheduledAt: new Date(),
    attemptCount: 0,
    incidentStatus: "collecting",
    captureEndsAt: new Date(Date.now() + 60_000),
    hostStatus: "active",
    status: "pending",
    leaseExpiresAt: null,
    ...overrides,
  };
}

function makeWorker(
  store: FakeStore,
  options: {
    maxAttempts?: number;
    probe?: (job: ClaimedJob) => Promise<ProbeOutcome>;
    privateKey?: KeyObject;
  } = {},
) {
  const { privateKey } = generateKeyPairSync("ed25519");
  return new ProbeWorker({
    store,
    sourceKeyId: SOURCE_KEY_ID,
    privateKey: options.privateKey ?? privateKey,
    intervalSeconds: 15,
    concurrency: 1,
    maxAttempts: options.maxAttempts ?? 5,
    pollIntervalMs: 1_000,
    probeTimeoutMs: 3_000,
    logger: silentLogger,
    probe:
      options.probe ??
      (async (job) => ({
        kind: "result",
        payload: {
          target_host_id: job.hostId,
          probe_status: "completed",
          dns_result: "resolved",
          tls_result: "valid",
          http_result: "expected",
          latency_ms: 10,
          response_class: "expected",
          observed_ip_class: "public",
        },
        observedAt: new Date(),
      })),
  });
}

describe("probe worker orchestration", () => {
  it("records a signed platform_probe_result and completes the job", async () => {
    const store = new FakeStore([makeJob()]);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const worker = makeWorker(store, { privateKey });

    const result = await worker.runOnce();

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(store.events).toHaveLength(1);
    const envelope = eventEnvelopeSchema.parse(store.events[0]);
    expect(envelope.event_type).toBe("platform_probe_result");
    expect(envelope.source_type).toBe("platform_probe");
    expect(envelope.incident_id).toBe(INCIDENT_ID);
    expect(envelope.sequence).toBe(1);
    expect(await verifyEventEnvelope(envelope, exportPublicKeyBase64Url(publicKey))).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain("gpu.example.com");
    expect(JSON.stringify(envelope)).not.toContain("1.1.1.1");
  });

  it("records a probe error category for an unsafe target instead of a causal failure", async () => {
    const store = new FakeStore([makeJob()]);
    const worker = makeWorker(store, {
      probe: async (job) => ({
        kind: "result",
        payload: {
          target_host_id: job.hostId,
          probe_status: "error",
          dns_result: "rejected_unsafe",
          tls_result: "not_attempted",
          http_result: "not_attempted",
          latency_ms: 0,
          response_class: "error",
          observed_ip_class: "rejected_unsafe",
        },
        observedAt: new Date(),
        safeErrorCode: "PROBE_UNSAFE_ADDRESS",
      }),
    });

    await worker.runOnce();

    expect(store.events).toHaveLength(1);
    const envelope = eventEnvelopeSchema.parse(store.events[0]);
    expect(envelope.event_type).toBe("platform_probe_result");
    expect((envelope.payload as { probe_status?: string }).probe_status).toBe("error");
    expect((envelope.payload as { dns_result?: string }).dns_result).toBe("rejected_unsafe");
  });

  it("retries a failed probe and dead-letters after the attempt limit", async () => {
    const store = new FakeStore([makeJob()]);
    const worker = makeWorker(store, {
      maxAttempts: 2,
      probe: async () => {
        throw new Error("internal");
      },
    });

    await worker.runOnce();
    expect(store.retried).toHaveLength(1);
    expect(store.events).toHaveLength(0);

    store.jobs[0]!.status = "pending";
    await worker.runOnce();
    expect(store.deadJobs).toHaveLength(1);
  });

  it("recovers an expired lease after a simulated worker crash", async () => {
    const store = new FakeStore([makeJob()]);
    const first = await store.claimDue();
    expect(first?.attemptCount).toBe(1);
    expect(await store.claimDue()).toBeNull();

    store.advance(30_001);
    const recovered = await store.claimDue();
    expect(recovered?.jobId).toBe(JOB_ID);
    expect(recovered?.attemptCount).toBe(2);
  });

  it("cancels jobs whose incident or host is no longer active", async () => {
    const store = new FakeStore([makeJob({ incidentStatus: "sealed" })]);
    const worker = makeWorker(store);

    const result = await worker.runOnce();

    expect(result.completed).toBe(0);
    expect(store.cancelled).toEqual([JOB_ID]);
    expect(store.events).toHaveLength(0);
  });
});

describe("probe target probe", () => {
  it("does not connect when DNS returns a private address", async () => {
    let connected = false;
    const outcome = await probeHostname(
      { hostId: HOST_ID, hostname: "gpu.example.com" },
      {
        resolver: { lookup: async () => [{ address: "10.0.0.1", family: 4 }] },
        transport: async () => {
          connected = true;
          return {
            statusCode: 200,
            contentType: "text/plain",
            body: Buffer.from("incident-witness-health-v1\n"),
            latencyMs: 1,
          };
        },
      },
    );

    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.payload.probe_status).toBe("error");
      expect(outcome.payload.dns_result).toBe("rejected_unsafe");
    }
    expect(connected).toBe(false);
  });
});
