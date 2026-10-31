import type { KeyObject } from "node:crypto";

import { buildWorkerEvent, type SignedWorkerEvent } from "./events.js";
import type { Logger } from "./logger.js";
import { probeHostname, type ProbeOptions, type ProbeOutcome } from "./probe.js";
import type { ClaimedJob, ProbeJobStore } from "./store.js";

export type ProbeWorkerOptions = {
  store: ProbeJobStore;
  sourceKeyId: string;
  privateKey: KeyObject;
  intervalSeconds: number;
  concurrency: number;
  maxAttempts: number;
  pollIntervalMs: number;
  probeTimeoutMs: number;
  logger: Logger;
  probe?: (job: ClaimedJob) => Promise<ProbeOutcome>;
  random?: () => number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type RunOnceResult = {
  claimed: number;
  completed: number;
  failed: number;
};

export type WorkerMetrics = {
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  dead: number;
};

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backoffMs(attempt: number, random: () => number): number {
  const cap = Math.min(30_000, 1_000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
  return Math.round(cap / 2 + Math.max(0, Math.min(1, random())) * (cap / 2));
}

export class ProbeWorker {
  private readonly metrics: WorkerMetrics = {
    claimed: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    dead: 0,
  };
  private stopping = false;

  constructor(private readonly options: ProbeWorkerOptions) {}

  getMetrics(): WorkerMetrics {
    return { ...this.metrics };
  }

  async stop(): Promise<void> {
    this.stopping = true;
  }

  async runOnce(): Promise<RunOnceResult> {
    const jobs: ClaimedJob[] = [];

    for (let index = 0; index < this.options.concurrency; index += 1) {
      const job = await this.options.store.claimDue();
      if (!job) break;
      jobs.push(job);
    }

    if (jobs.length === 0) {
      return { claimed: 0, completed: 0, failed: 0 };
    }

    this.metrics.claimed += jobs.length;
    const outcomes = await Promise.allSettled(jobs.map((job) => this.processJob(job)));
    let completed = 0;
    let failed = 0;

    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled" && outcome.value === "completed") {
        completed += 1;
        this.metrics.completed += 1;
      } else {
        failed += 1;
        this.metrics.failed += 1;
      }
    }

    return { claimed: jobs.length, completed, failed };
  }

  async run(): Promise<void> {
    this.stopping = false;
    const sleep = this.options.sleep ?? defaultSleep;

    while (!this.stopping) {
      let result: RunOnceResult;
      try {
        result = await this.runOnce();
      } catch {
        this.options.logger.error("Probe worker poll failed", { code: "PROBE_POLL_ERROR" });
        await sleep(this.options.pollIntervalMs);
        continue;
      }

      if (result.claimed > 0) {
        this.options.logger.info("Probe batch processed", {
          claimed: result.claimed,
          completed: result.completed,
          failed: result.failed,
        });
        await sleep(50);
      } else {
        await sleep(this.options.pollIntervalMs);
      }
    }
  }

  private async processJob(job: ClaimedJob): Promise<"completed" | "failed"> {
    if (
      job.incidentStatus !== "collecting" ||
      job.hostStatus !== "active" ||
      job.captureEndsAt.getTime() <= Date.now()
    ) {
      await this.options.store.cancel(job.jobId, "INCIDENT_NOT_ACTIVE");
      return "failed";
    }

    if (job.attemptCount > this.options.maxAttempts) {
      await this.options.store.dead(job.jobId, "PROBE_ATTEMPTS_EXHAUSTED");
      this.metrics.dead += 1;
      return "failed";
    }

    let outcome: ProbeOutcome;
    try {
      outcome = await (this.options.probe ?? this.defaultProbe)(job);
    } catch {
      await this.handleRetry(job, "PROBE_INTERNAL_ERROR");
      return "failed";
    }

    try {
      const result = await this.options.store.appendObservation(job, (sequence, receivedAt) =>
        this.buildEvent(job, outcome, sequence, receivedAt),
      );

      if (result.kind === "appended" || result.kind === "duplicate") {
        this.options.logger.info("Probe observation recorded", {
          eventType: "platform_probe_result",
          eventId: result.eventId,
          outcome: outcome.payload.probe_status,
          ...(outcome.safeErrorCode === undefined ? {} : { code: outcome.safeErrorCode }),
        });
        return "completed";
      }
      if (result.kind === "budget_exhausted") {
        this.options.logger.warn("Probe observation skipped at evidence budget", {
          code: "INCIDENT_EVIDENCE_LIMIT",
        });
        return "completed";
      }

      this.options.logger.warn("Probe job closed before observation", {
        code: "INCIDENT_CLOSED",
      });
      return "failed";
    } catch {
      await this.handleRetry(job, "PROBE_APPEND_FAILED");
      return "failed";
    }
  }

  private async defaultProbe(job: ClaimedJob): Promise<ProbeOutcome> {
    const probeOptions: ProbeOptions = {
      timeoutMs: this.options.probeTimeoutMs,
      ...(this.options.now === undefined ? {} : { now: this.options.now }),
    };
    return probeHostname({ hostId: job.hostId, hostname: job.hostname }, probeOptions);
  }

  private buildEvent(
    job: ClaimedJob,
    outcome: ProbeOutcome,
    sequence: number,
    receivedAt: Date,
  ): SignedWorkerEvent {
    return buildWorkerEvent({
      jobId: job.jobId,
      attempt: job.attemptCount,
      incidentId: job.incidentId,
      sourceKeyId: this.options.sourceKeyId,
      privateKey: this.options.privateKey,
      eventType: "platform_probe_result",
      payload: outcome.payload,
      sequence,
      observedAt: outcome.observedAt,
      receivedAt,
    });
  }

  private async handleRetry(job: ClaimedJob, code: string): Promise<void> {
    if (job.attemptCount >= this.options.maxAttempts) {
      await this.options.store.dead(job.jobId, code);
      this.metrics.dead += 1;
      this.options.logger.error("Probe job moved to dead letter", {
        jobId: job.jobId,
        code,
      });
      return;
    }

    const delay = backoffMs(job.attemptCount, this.options.random ?? Math.random);
    await this.options.store.retry(job.jobId, code, delay);
    this.metrics.retried += 1;
    this.options.logger.warn("Probe job scheduled for retry", {
      jobId: job.jobId,
      code,
      delayMs: delay,
    });
  }
}
