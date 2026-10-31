import type { KeyObject } from "node:crypto";

import type { GpuTelemetryPayload, HostPowerStatePayload } from "@incident-witness/protocol";

import { HttpAgentApi, type EventTransport, type PresenceTransport } from "./api.js";
import { NvidiaSmiCollector } from "./collectors/nvidia.js";
import { UpscCollector } from "./collectors/ups.js";
import {
  readAgentConfig,
  readDeviceCredential,
  readDevicePrivateKeyPem,
  configPaths,
  type AgentConfig,
} from "./config.js";
import { loadAgentPrivateKey } from "./crypto.js";
import { EvidenceProducer } from "./evidence.js";
import { AGENT_VERSION, createLogger, type Logger } from "./log.js";
import { PresenceReporter } from "./presence.js";
import { EventSpool, type SpoolStats } from "./spool.js";
import { EventUploader } from "./uploader.js";

export const PRESENCE_INTERVAL_MS = 15_000;
export const EVIDENCE_HEARTBEAT_INTERVAL_MS = 30_000;
export const GPU_INTERVAL_MS = 30_000;
export const UPS_INTERVAL_MS = 5_000;
export const UPS_SUMMARY_INTERVAL_MS = 60_000;

export type AgentIntervals = {
  presenceMs: number;
  heartbeatMs: number;
  gpuMs: number;
  upsMs: number;
};

export const DEFAULT_AGENT_INTERVALS: AgentIntervals = {
  presenceMs: PRESENCE_INTERVAL_MS,
  heartbeatMs: EVIDENCE_HEARTBEAT_INTERVAL_MS,
  gpuMs: GPU_INTERVAL_MS,
  upsMs: UPS_INTERVAL_MS,
};

type Collector<T> = { collect(): Promise<T> };

type Loop = {
  stop(): void;
};

function createLoop(
  name: string,
  intervalMs: number,
  logger: Logger,
  task: () => Promise<void>,
): Loop {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = false;

  const run = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await task();
    } catch {
      logger.error("Agent loop failed", { loop: name });
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void run(), intervalMs);
  void run();

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type HostAgentOptions = {
  configDir: string;
  incidentId?: string;
  upsDevice?: string;
  logger?: Logger;
  transport?: PresenceTransport & EventTransport;
  gpuCollector?: Collector<GpuTelemetryPayload>;
  upsCollector?: Collector<HostPowerStatePayload>;
  now?: () => Date;
  intervals?: Partial<AgentIntervals>;
  spoolQuotaBytes?: number;
  shutdownFlushMs?: number;
};

export type AgentStatus = {
  hostId: string;
  sourceKeyId: string;
  apiBaseUrl: string;
  incidentId: string | null;
  upsDevice: string | null;
  spool: SpoolStats;
  nextEventSequence: number;
  nextPresenceSequence: number;
  uploadHalted: boolean;
  presenceHalted: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class HostAgent {
  private readonly config: AgentConfig;
  private readonly privateKey: KeyObject;
  private readonly credential: string;
  private readonly logger: Logger;
  private readonly spool: EventSpool;
  private readonly producer: EvidenceProducer;
  private readonly presenceReporter: PresenceReporter;
  private readonly uploader: EventUploader;
  private readonly intervals: AgentIntervals;
  private readonly gpuCollector: Collector<GpuTelemetryPayload>;
  private readonly upsCollector: Collector<HostPowerStatePayload> | null;
  private readonly incidentId: string | null;
  private readonly shutdownFlushMs: number;
  private readonly now: () => Date;

  private presenceLoop: Loop | null = null;
  private evidenceLoops: Loop[] = [];
  private uploadTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private stopped = true;
  private uploadStopped = false;
  private lastUpsState: HostPowerStatePayload["state"] | null = null;
  private lastUpsEmittedAt: number | null = null;
  private evidenceLoopsStopped = false;

  constructor(options: HostAgentOptions) {
    this.logger = options.logger ?? createLogger();
    this.config = readAgentConfig(options.configDir);
    this.privateKey = loadAgentPrivateKey(readDevicePrivateKeyPem(options.configDir));
    this.credential = readDeviceCredential(options.configDir);
    this.now = options.now ?? (() => new Date());
    this.shutdownFlushMs = options.shutdownFlushMs ?? 3_000;
    this.intervals = { ...DEFAULT_AGENT_INTERVALS, ...options.intervals };

    if (options.incidentId !== undefined && !UUID_PATTERN.test(options.incidentId)) {
      throw new Error("The incident ID must be a UUID");
    }
    this.incidentId = options.incidentId ?? null;

    const upsDevice = options.upsDevice ?? this.config.ups_device;
    this.upsCollector = upsDevice
      ? (options.upsCollector ?? new UpscCollector(upsDevice))
      : null;
    this.gpuCollector = options.gpuCollector ?? new NvidiaSmiCollector();

    this.spool = new EventSpool(configPaths(options.configDir).spoolFile, {
      ...(options.spoolQuotaBytes === undefined ? {} : { quotaBytes: options.spoolQuotaBytes }),
    });

    this.producer = new EvidenceProducer({
      spool: this.spool,
      sourceKeyId: this.config.source_key_id,
      privateKey: this.privateKey,
      agentVersion: AGENT_VERSION,
      logger: this.logger,
      now: this.now,
    });

    const transport =
      options.transport ??
      new HttpAgentApi({ baseUrl: this.config.api_base_url, credential: this.credential });

    this.presenceReporter = new PresenceReporter({
      spool: this.spool,
      privateKey: this.privateKey,
      transport,
      hostId: this.config.host_id,
      agentVersion: AGENT_VERSION,
      logger: this.logger,
      now: this.now,
    });

    this.uploader = new EventUploader({
      spool: this.spool,
      transport,
      logger: this.logger,
    });
  }

  start(): void {
    if (this.closed) throw new Error("This host agent has already been closed");
    if (!this.stopped) return;
    this.stopped = false;
    this.uploadStopped = false;

    this.logger.info("Host agent starting", {
      hostId: this.config.host_id,
      sourceKeyId: this.config.source_key_id,
      incidentId: this.incidentId,
      spoolEvents: this.spool.stats().eventCount,
    });

    if (this.incidentId) {
      this.producer.queueHostAgentStatus(this.incidentId, "started");
    }

    this.presenceLoop = createLoop(
      "presence",
      this.intervals.presenceMs,
      this.logger,
      async () => {
        const result = await this.presenceReporter.tick();
        if (result.kind === "halted") {
          this.logger.error("Operational presence stopped", {
            code: result.code ?? "PRESENCE_HALTED",
          });
        }
      },
    );

    this.scheduleUpload(0);

    if (this.incidentId) {
      this.startEvidenceLoops(this.incidentId);
    } else {
      this.logger.warn("No evidence incident supplied; evidence collectors are idle", {
        hint: "Run iw-agent run --incident <uuid> during an active session",
      });
    }
  }

  private startEvidenceLoops(incidentId: string): void {
    this.evidenceLoopsStopped = false;

    this.evidenceLoops.push(
      createLoop("heartbeat", this.intervals.heartbeatMs, this.logger, async () => {
        const health = this.spool.stats().full ? "degraded" : "ok";
        this.producer.queueHostHeartbeat(incidentId, health);
      }),
    );

    this.evidenceLoops.push(
      createLoop("gpu", this.intervals.gpuMs, this.logger, async () => {
        const payload = await this.gpuCollector.collect();
        this.producer.queueGpuTelemetry(incidentId, payload);
      }),
    );

    if (this.upsCollector) {
      this.evidenceLoops.push(
        createLoop("ups", this.intervals.upsMs, this.logger, async () => {
          const payload = await this.upsCollector?.collect();
          if (payload) this.queueUpsSample(incidentId, payload);
        }),
      );
    }
  }

  private queueUpsSample(incidentId: string, payload: HostPowerStatePayload): void {
    const now = this.now().getTime();
    const changed = this.lastUpsState !== null && payload.state !== this.lastUpsState;
    const due =
      this.lastUpsEmittedAt === null || now - this.lastUpsEmittedAt >= UPS_SUMMARY_INTERVAL_MS;

    if (!changed && !due) return;

    const critical = changed && payload.state !== "unavailable";
    this.producer.queueHostPowerState(incidentId, payload, critical);
    this.lastUpsState = payload.state;
    this.lastUpsEmittedAt = now;
  }

  private stopEvidenceLoops(): void {
    if (this.evidenceLoopsStopped) return;
    this.evidenceLoopsStopped = true;

    for (const loop of this.evidenceLoops) loop.stop();
    this.evidenceLoops = [];
  }

  private scheduleUpload(delayMs: number): void {
    if (this.stopped || this.uploadStopped) return;
    this.uploadTimer = setTimeout(() => void this.uploadTick(), delayMs);
  }

  private async uploadTick(): Promise<void> {
    if (this.stopped || this.uploadStopped) return;

    let nextDelay = 2_000;
    try {
      const result = await this.uploader.tick();

      if (result.kind === "uploaded" || result.kind === "incident_closed") {
        nextDelay = 250;
      } else if (result.kind === "retry") {
        nextDelay = result.delayMs;
      } else if (result.kind === "halted") {
        this.logger.error("Evidence upload halted; evidence collectors are stopping", {
          code: result.code,
        });
        this.uploadStopped = true;
        this.stopEvidenceLoops();
        return;
      }

      if (
        result.kind === "incident_closed" &&
        this.incidentId !== null &&
        result.incidentId === this.incidentId
      ) {
        this.logger.warn("Active evidence incident is closed; evidence collectors are stopping", {
          incidentId: this.incidentId,
          code: result.code,
        });
        this.stopEvidenceLoops();
      }
    } catch {
      this.logger.error("Evidence upload loop failed", { code: "UPLOAD_LOOP_ERROR" });
      nextDelay = 5_000;
    }

    this.scheduleUpload(nextDelay);
  }

  async emitPresenceOnce(): Promise<void> {
    await this.presenceReporter.tick();
  }

  async emitHeartbeatOnce(): Promise<void> {
    if (!this.incidentId) throw new Error("No evidence incident is configured");
    const health = this.spool.stats().full ? "degraded" : "ok";
    this.producer.queueHostHeartbeat(this.incidentId, health);
  }

  async collectGpuOnce(): Promise<void> {
    if (!this.incidentId) throw new Error("No evidence incident is configured");
    const payload = await this.gpuCollector.collect();
    this.producer.queueGpuTelemetry(this.incidentId, payload);
  }

  async collectUpsOnce(): Promise<void> {
    if (!this.incidentId || !this.upsCollector) throw new Error("UPS collection is not configured");
    const payload = await this.upsCollector.collect();
    this.queueUpsSample(this.incidentId, payload);
  }

  async uploadOnce(): Promise<void> {
    await this.uploader.tick();
  }

  status(): AgentStatus {
    return {
      hostId: this.config.host_id,
      sourceKeyId: this.config.source_key_id,
      apiBaseUrl: this.config.api_base_url,
      incidentId: this.incidentId,
      upsDevice: this.config.ups_device ?? null,
      spool: this.spool.stats(),
      nextEventSequence: this.spool.peekNextEventSequence(),
      nextPresenceSequence: this.spool.peekNextPresenceSequence(),
      uploadHalted: this.uploader.isHalted(),
      presenceHalted: this.presenceReporter.isHalted(),
    };
  }

  async stop(): Promise<void> {
    if (this.closed) return;

    const wasUploadHalted = this.uploader.isHalted();
    this.stopped = true;
    this.presenceLoop?.stop();
    this.presenceLoop = null;
    for (const loop of this.evidenceLoops) loop.stop();
    this.evidenceLoops = [];

    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }

    if (this.incidentId && !wasUploadHalted) {
      const blocked = this.spool
        .listBlockedIncidents()
        .some((entry) => entry.incidentId === this.incidentId);
      if (!blocked) {
        this.producer.queueHostAgentStatus(this.incidentId, "stopped");
      }
    }

    if (!wasUploadHalted && this.spool.nextPendingEvent() !== null) {
      await this.flushEvidence();
    }

    this.close();
    this.logger.info("Host agent stopped");
  }

  close(): void {
    if (this.closed) return;

    this.stopped = true;
    this.presenceLoop?.stop();
    this.presenceLoop = null;
    for (const loop of this.evidenceLoops) loop.stop();
    this.evidenceLoops = [];

    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }

    this.spool.close();
    this.closed = true;
  }

  private async flushEvidence(): Promise<void> {
    const deadline = Date.now() + this.shutdownFlushMs;

    while (Date.now() < deadline && this.spool.nextPendingEvent() !== null) {
      const result = await withTimeout(this.uploader.tick(), Math.max(250, deadline - Date.now()));
      if (result === null) break;
      if (result.kind === "halted" || result.kind === "retry" || result.kind === "idle") break;
      await delay(50);
    }
  }
}
