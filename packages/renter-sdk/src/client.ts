import { randomUUID, type KeyObject } from "node:crypto";

import {
  sourceKeyCertificateSchema,
  type RenterEndpointResultPayload,
  type RenterHeartbeatPayload,
} from "@incident-witness/protocol";

import {
  HttpRenterApi,
  validateApiBaseUrl,
  type RenterApiTransport,
  type RenterEnrollmentResponse,
} from "./api.js";
import {
  HttpsHealthChecker,
  normalizeEndpointHostname,
  type EndpointChecker,
  type EndpointObservation,
} from "./endpoint.js";
import { buildRenterEvent } from "./event.js";
import { generateRenterKeyPair, loadRenterPrivateKey } from "./keys.js";
import {
  hasRenterState,
  loadRenterState,
  saveRenterState,
  type PersistedQueueEntry,
  type PersistedRenterState,
} from "./state.js";

export const SDK_VERSION = "0.1.0";
export const DEFAULT_QUEUE_LIMIT_BYTES = 5 * 1024 * 1024;
export const INGESTION_GRACE_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_ENDPOINT_INTERVAL_MS = 60_000;
export const DEFAULT_UPLOAD_BASE_DELAY_MS = 1_000;
export const DEFAULT_UPLOAD_MAX_DELAY_MS = 60_000;

export type RenterClientState = RenterHeartbeatPayload["client_state"];

export type RenterIntervals = {
  heartbeatMs: number;
  endpointMs: number;
  uploadBaseDelayMs: number;
  uploadMaxDelayMs: number;
};

export const DEFAULT_RENTER_INTERVALS: RenterIntervals = {
  heartbeatMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  endpointMs: DEFAULT_ENDPOINT_INTERVAL_MS,
  uploadBaseDelayMs: DEFAULT_UPLOAD_BASE_DELAY_MS,
  uploadMaxDelayMs: DEFAULT_UPLOAD_MAX_DELAY_MS,
};

export type RenterEnrollOptions = {
  apiBaseUrl: string;
  invitationToken: string;
  endpointHostname: string;
  sdkVersion?: string;
  workloadRef?: string;
  stateDir?: string;
  transport?: RenterApiTransport;
  endpointChecker?: EndpointChecker;
  now?: () => Date;
  intervals?: Partial<RenterIntervals>;
  queueLimitBytes?: number;
  shutdownFlushMs?: number;
};

export type RenterResumeOptions = {
  stateDir: string;
  transport?: RenterApiTransport;
  endpointChecker?: EndpointChecker;
  now?: () => Date;
  intervals?: Partial<RenterIntervals>;
  queueLimitBytes?: number;
  shutdownFlushMs?: number;
};

export type RenterStatus = {
  incidentId: string;
  sourceKeyId: string;
  apiBaseUrl: string;
  endpointHostname: string;
  sessionEndsAt: string;
  ingestionDeadline: string;
  started: boolean;
  haltedReason: string | null;
  nextSequence: number;
  queueEvents: number;
  queueBytes: number;
  queueLimitBytes: number;
  droppedEvents: number;
  lastEndpointResult: string | null;
};

export class RenterEnrollmentError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = "RenterEnrollmentError";
    this.code = code;
    this.status = status;
  }
}

function computeBackoffDelay(
  attempt: number,
  random: () => number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponent = Math.min(20, Math.max(1, Math.floor(attempt)));
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** (exponent - 1));
  return Math.round(cap / 2 + Math.max(0, Math.min(1, random())) * (cap / 2));
}

function parseTimestamp(value: string, label: string): Date {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} is not a valid timestamp`);
  return new Date(time);
}

function validateWorkloadRef(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > 100) throw new Error("The workload reference is too long");
  return value;
}

type Loop = { stop(): void };

function createLoop(intervalMs: number, task: () => Promise<void>, onError: () => void): Loop {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = false;

  const run = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await task();
    } catch {
      onError();
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

export class RenterClient {
  private readonly state: PersistedRenterState;
  private readonly privateKey: KeyObject;
  private readonly stateDir: string | null;
  private readonly transport: RenterApiTransport;
  private readonly endpointChecker: EndpointChecker;
  private readonly intervals: RenterIntervals;
  private readonly queueLimitBytes: number;
  private readonly shutdownFlushMs: number;
  private readonly now: () => Date;

  private clientState: RenterClientState = "running";
  private loops: Loop[] = [];
  private uploadTimer: NodeJS.Timeout | null = null;
  private started = false;
  private stopped = true;
  private uploadAttempt = 0;

  private constructor(
    state: PersistedRenterState,
    privateKey: KeyObject,
    options: {
      stateDir?: string;
      transport: RenterApiTransport;
      endpointChecker: EndpointChecker;
      now: () => Date;
      intervals: RenterIntervals;
      queueLimitBytes: number;
      shutdownFlushMs: number;
    },
  ) {
    this.state = state;
    this.privateKey = privateKey;
    this.stateDir = options.stateDir ?? null;
    this.transport = options.transport;
    this.endpointChecker = options.endpointChecker;
    this.now = options.now;
    this.intervals = options.intervals;
    this.queueLimitBytes = options.queueLimitBytes;
    this.shutdownFlushMs = options.shutdownFlushMs;
  }

  static async enroll(options: RenterEnrollOptions): Promise<RenterClient> {
    const invitationToken = options.invitationToken.trim();
    if (invitationToken.length < 1 || invitationToken.length > 200) {
      throw new RenterEnrollmentError("The invitation token is empty or too long");
    }

    let apiBaseUrl: string;
    try {
      apiBaseUrl = validateApiBaseUrl(options.apiBaseUrl);
    } catch {
      throw new RenterEnrollmentError("The API base URL is invalid");
    }

    let endpointHostname: string;
    try {
      endpointHostname = normalizeEndpointHostname(options.endpointHostname);
    } catch {
      throw new RenterEnrollmentError("The provider endpoint hostname is invalid");
    }

    const workloadRef = validateWorkloadRef(options.workloadRef);
    if (options.stateDir && hasRenterState(options.stateDir)) {
      throw new RenterEnrollmentError(
        "This state directory already contains an enrolled renter; refusing to overwrite it",
      );
    }

    const keyPair = generateRenterKeyPair();
    const transport = options.transport ?? new HttpRenterApi({ baseUrl: apiBaseUrl });
    const sdkVersion = (options.sdkVersion ?? SDK_VERSION).slice(0, 40);

    let response: RenterEnrollmentResponse;
    try {
      response = await transport.enroll({
        invitationToken,
        publicKey: keyPair.publicKeyBase64Url,
        requestId: randomUUID(),
        sdkVersion,
      });
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        const code = (error as { code?: unknown }).code;
        const status = (error as { status?: unknown }).status;
        throw new RenterEnrollmentError(
          "The API rejected the invitation redemption",
          typeof code === "string" ? code : null,
          typeof status === "number" ? status : null,
        );
      }
      throw new RenterEnrollmentError("The invitation redemption did not complete");
    }

    if (response.protocolVersion !== "1.0") {
      throw new RenterEnrollmentError("The API returned an unsupported protocol version");
    }
    const certificate = sourceKeyCertificateSchema.safeParse(response.certificate);
    if (!certificate.success || certificate.data.source_type !== "renter_client") {
      throw new RenterEnrollmentError("The API returned an invalid renter certificate");
    }
    if (
      certificate.data.source_key_id !== response.sourceKeyId ||
      certificate.data.public_key !== keyPair.publicKeyBase64Url ||
      certificate.data.incident_id !== response.incidentId
    ) {
      throw new RenterEnrollmentError("The API returned a certificate outside this session scope");
    }

    const sessionEndsAt = parseTimestamp(response.sessionEndsAt, "sessionEndsAt");
    const ingestionDeadline = new Date(sessionEndsAt.getTime() + INGESTION_GRACE_MS);

    const state: PersistedRenterState = {
      state_version: 1,
      api_base_url: apiBaseUrl,
      incident_id: response.incidentId,
      source_key_id: response.sourceKeyId,
      private_key_pem: keyPair.privateKeyPem,
      ingestion_credential: response.ingestionCredential,
      sdk_version: sdkVersion,
      ...(workloadRef === undefined ? {} : { workload_ref: workloadRef }),
      endpoint_hostname: endpointHostname,
      session_ends_at: sessionEndsAt.toISOString(),
      ingestion_deadline: ingestionDeadline.toISOString(),
      next_sequence: 1,
      queue: [],
      dropped_events: 0,
    };

    if (options.stateDir) {
      try {
        saveRenterState(options.stateDir, state);
      } catch {
        throw new RenterEnrollmentError(
          "The invitation was redeemed but local SDK state could not be written; the provider must revoke and replace the invitation",
        );
      }
    }

    const client = new RenterClient(
      state,
      keyPair.privateKey,
      buildClientOptions(options, transport),
    );
    return client;
  }

  static resume(options: RenterResumeOptions): RenterClient {
    const state = loadRenterState(options.stateDir);
    validateApiBaseUrl(state.api_base_url);
    normalizeEndpointHostname(state.endpoint_hostname);

    const privateKey = loadRenterPrivateKey(state.private_key_pem);
    const transport = options.transport ?? new HttpRenterApi({ baseUrl: state.api_base_url });

    return new RenterClient(state, privateKey, buildClientOptions(options, transport));
  }

  private persist(): void {
    if (this.stateDir) saveRenterState(this.stateDir, this.state);
  }

  start(): void {
    if (this.started && !this.stopped) return;
    this.stopped = false;
    this.started = true;

    if (this.state.halted_reason) {
      this.stopped = true;
      return;
    }
    if (this.isPastIngestionDeadline()) {
      this.halt("INGESTION_DEADLINE");
      this.stopped = true;
      return;
    }

    this.loops.push(
      createLoop(
        this.intervals.heartbeatMs,
        async () => {
          if (this.isPastSessionEnd()) {
            this.stopEmissionLoops();
            return;
          }
          this.emitHeartbeatOnce();
        },
        () => undefined,
      ),
    );

    this.loops.push(
      createLoop(
        this.intervals.endpointMs,
        async () => {
          if (this.isPastSessionEnd()) {
            this.stopEmissionLoops();
            return;
          }
          await this.checkEndpointOnce();
        },
        () => undefined,
      ),
    );

    this.scheduleUpload(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const loop of this.loops) loop.stop();
    this.loops = [];
    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }

    if (!this.state.halted_reason && this.state.queue.length > 0) {
      await withTimeout(this.flushOnce(), this.shutdownFlushMs);
    }
    this.persist();
  }

  status(): RenterStatus {
    return {
      incidentId: this.state.incident_id,
      sourceKeyId: this.state.source_key_id,
      apiBaseUrl: this.state.api_base_url,
      endpointHostname: this.state.endpoint_hostname,
      sessionEndsAt: this.state.session_ends_at,
      ingestionDeadline: this.state.ingestion_deadline,
      started: this.started && !this.stopped,
      haltedReason: this.state.halted_reason ?? null,
      nextSequence: this.state.next_sequence,
      queueEvents: this.state.queue.length,
      queueBytes: this.queueBytes(),
      queueLimitBytes: this.queueLimitBytes,
      droppedEvents: this.state.dropped_events,
      lastEndpointResult: this.state.last_endpoint_result ?? null,
    };
  }

  setClientState(state: RenterClientState): void {
    this.clientState = state;
    this.persist();
  }

  emitHeartbeatOnce(): boolean {
    if (this.state.halted_reason || this.isPastSessionEnd()) return false;
    const payload: RenterHeartbeatPayload = {
      sdk_version: this.state.sdk_version,
      ...(this.state.workload_ref === undefined ? {} : { workload_ref: this.state.workload_ref }),
      client_state: this.clientState,
    };
    return this.enqueueEvent("renter_heartbeat", payload);
  }

  async checkEndpointOnce(): Promise<boolean> {
    if (this.state.halted_reason || this.isPastSessionEnd()) return false;

    let observation: EndpointObservation;
    try {
      observation = await this.endpointChecker.check(this.state.endpoint_hostname);
    } catch {
      observation = { result: "unknown", latencyMs: 0, failureCategory: "unknown" };
    }

    const now = this.now().getTime();
    const lastEmitted = this.state.last_endpoint_emitted_at
      ? Date.parse(this.state.last_endpoint_emitted_at)
      : null;
    const stateChanged = this.state.last_endpoint_result !== observation.result;
    const intervalDue = lastEmitted === null || now - lastEmitted >= this.intervals.endpointMs;

    if (!stateChanged && !intervalDue) return false;

    const payload: RenterEndpointResultPayload = {
      result: observation.result,
      latency_ms: Math.max(0, Math.min(60_000, Math.round(observation.latencyMs))),
      ...(observation.failureCategory === undefined
        ? {}
        : { failure_category: observation.failureCategory }),
    };

    const queued = this.enqueueEvent("renter_endpoint_result", payload);
    if (queued) {
      this.state.last_endpoint_result = observation.result;
      this.state.last_endpoint_emitted_at = this.now().toISOString();
      this.persist();
    }
    return queued;
  }

  async flushOnce(): Promise<
    | { kind: "idle" }
    | { kind: "uploaded" }
    | { kind: "retry"; delayMs: number }
    | { kind: "halted" }
  > {
    if (this.state.halted_reason) return { kind: "halted" };
    if (this.isPastIngestionDeadline()) {
      this.halt("INGESTION_DEADLINE");
      return { kind: "halted" };
    }

    const entry = this.state.queue[0];
    if (!entry) {
      this.uploadAttempt = 0;
      return { kind: "idle" };
    }

    const result = await this.transport.postEvent(entry.raw, this.state.ingestion_credential);

    if (result.kind === "accepted" || result.kind === "duplicate") {
      this.removeQueueEntry(entry.event_id);
      this.uploadAttempt = 0;
      this.persist();
      return { kind: "uploaded" };
    }

    if (result.kind === "incident_closed") {
      this.halt(result.code ?? "INCIDENT_CLOSED");
      return { kind: "halted" };
    }

    if (result.kind === "retryable") {
      this.uploadAttempt += 1;
      const backoff = computeBackoffDelay(
        this.uploadAttempt,
        Math.random,
        this.intervals.uploadBaseDelayMs,
        this.intervals.uploadMaxDelayMs,
      );
      const delayMs = Math.max(backoff, result.retryAfterMs ?? 0);
      return { kind: "retry", delayMs };
    }

    this.halt(result.code ?? "UPLOAD_HALTED");
    return { kind: "halted" };
  }

  private enqueueEvent(
    eventType: "renter_heartbeat" | "renter_endpoint_result",
    payload: unknown,
  ): boolean {
    const now = this.now();
    if (now.getTime() >= Date.parse(this.state.session_ends_at)) return false;

    const sequence = this.state.next_sequence;
    const event = buildRenterEvent({
      incidentId: this.state.incident_id,
      sourceKeyId: this.state.source_key_id,
      privateKey: this.privateKey,
      eventType,
      payload,
      sequence,
      observedAt: now.toISOString(),
    });

    if (event.sizeBytes > this.queueLimitBytes) return false;

    while (this.queueBytes() + event.sizeBytes > this.queueLimitBytes) {
      const dropped = this.state.queue.shift();
      if (!dropped) break;
      this.state.dropped_events += 1;
    }

    if (this.queueBytes() + event.sizeBytes > this.queueLimitBytes) return false;

    const entry: PersistedQueueEntry = {
      event_id: event.envelope.event_id,
      sequence,
      event_type: eventType,
      raw: event.raw,
      size_bytes: event.sizeBytes,
      created_at: now.toISOString(),
    };

    this.state.queue.push(entry);
    this.state.next_sequence = sequence + 1;
    this.persist();
    return true;
  }

  private removeQueueEntry(eventId: string): void {
    const index = this.state.queue.findIndex((entry) => entry.event_id === eventId);
    if (index >= 0) this.state.queue.splice(index, 1);
  }

  private queueBytes(): number {
    return this.state.queue.reduce((total, entry) => total + entry.size_bytes, 0);
  }

  private isPastSessionEnd(): boolean {
    return this.now().getTime() >= Date.parse(this.state.session_ends_at);
  }

  private isPastIngestionDeadline(): boolean {
    return this.now().getTime() >= Date.parse(this.state.ingestion_deadline);
  }

  private halt(reason: string): void {
    if (this.state.halted_reason) return;
    this.state.halted_reason = reason.slice(0, 80);
    this.stopped = true;
    for (const loop of this.loops) loop.stop();
    this.loops = [];
    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }
    this.persist();
  }

  private stopEmissionLoops(): void {
    for (const loop of this.loops.splice(0)) loop.stop();
  }

  private scheduleUpload(delayMs: number): void {
    if (this.stopped) return;
    this.uploadTimer = setTimeout(() => void this.uploadTick(), delayMs);
  }

  private async uploadTick(): Promise<void> {
    if (this.stopped) return;

    let nextDelay = 2_000;
    try {
      const result = await this.flushOnce();
      if (result.kind === "uploaded") {
        nextDelay = 250;
      } else if (result.kind === "retry") {
        nextDelay = result.delayMs;
      } else if (result.kind === "halted") {
        return;
      }
    } catch {
      nextDelay = 5_000;
    }
    this.scheduleUpload(nextDelay);
  }
}

function buildClientOptions(
  options: {
    stateDir?: string;
    endpointChecker?: EndpointChecker;
    now?: () => Date;
    intervals?: Partial<RenterIntervals>;
    queueLimitBytes?: number;
    shutdownFlushMs?: number;
  },
  transport: RenterApiTransport,
) {
  return {
    ...(options.stateDir === undefined ? {} : { stateDir: options.stateDir }),
    transport,
    endpointChecker: options.endpointChecker ?? new HttpsHealthChecker(),
    now: options.now ?? (() => new Date()),
    intervals: { ...DEFAULT_RENTER_INTERVALS, ...options.intervals },
    queueLimitBytes: options.queueLimitBytes ?? DEFAULT_QUEUE_LIMIT_BYTES,
    shutdownFlushMs: options.shutdownFlushMs ?? 2_000,
  };
}
