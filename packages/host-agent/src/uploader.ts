import type { EventTransport } from "./api.js";
import type { Logger } from "./log.js";
import type { EventSpool } from "./spool.js";

export type BackoffOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export function computeBackoffDelay(
  attempt: number,
  random: () => number = Math.random,
  options: BackoffOptions = {},
): number {
  const base = options.baseDelayMs ?? 1_000;
  const maximum = options.maxDelayMs ?? 300_000;
  const exponent = Math.min(20, Math.max(1, Math.floor(attempt)));
  const exponential = Math.min(maximum, base * 2 ** (exponent - 1));

  return Math.round(exponential / 2 + Math.max(0, Math.min(1, random())) * (exponential / 2));
}

export type UploadTickResult =
  | { kind: "idle" }
  | { kind: "uploaded"; eventId: string; sequence: number }
  | { kind: "retry"; code: string; attempt: number; delayMs: number }
  | { kind: "incident_closed"; incidentId: string; code: string }
  | { kind: "halted"; code: string };

export class EventUploader {
  private attempt = 0;
  private haltedCode: string | null = null;

  constructor(
    private readonly options: {
      spool: EventSpool;
      transport: EventTransport;
      logger: Logger;
      random?: () => number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    },
  ) {}

  isHalted(): boolean {
    return this.haltedCode !== null;
  }

  async tick(): Promise<UploadTickResult> {
    if (this.haltedCode !== null) {
      return { kind: "halted", code: this.haltedCode };
    }

    const event = this.options.spool.nextPendingEvent();
    if (!event) {
      this.attempt = 0;
      return { kind: "idle" };
    }

    const result = await this.options.transport.sendEvent(event.raw);

    if (result.kind === "accepted" || result.kind === "duplicate") {
      this.options.spool.remove(event.eventId);
      this.options.logger.info("Evidence event uploaded", {
        eventType: event.eventType,
        sequence: event.sequence,
        duplicate: result.kind === "duplicate",
      });
      this.attempt = 0;
      return { kind: "uploaded", eventId: event.eventId, sequence: event.sequence };
    }

    if (result.kind === "incident_closed") {
      const code = result.code ?? "INCIDENT_CLOSED";
      this.options.spool.blockIncident(event.incidentId, code);
      this.options.logger.warn("Evidence upload stopped for a closed incident", {
        incidentId: event.incidentId,
        code,
      });
      this.attempt = 0;
      return { kind: "incident_closed", incidentId: event.incidentId, code };
    }

    if (result.kind === "retryable") {
      this.attempt += 1;
      const code = result.code ?? "RETRYABLE_ERROR";
      const delayMs = computeBackoffDelay(this.attempt, this.options.random, {
        baseDelayMs: this.options.baseDelayMs,
        maxDelayMs: this.options.maxDelayMs,
      });
      this.options.logger.warn("Evidence upload will be retried", {
        eventType: event.eventType,
        sequence: event.sequence,
        attempt: this.attempt,
        code,
        delayMs,
      });
      return { kind: "retry", code, attempt: this.attempt, delayMs };
    }

    const code = result.code ?? "UPLOAD_HALTED";
    this.haltedCode = code;
    this.options.logger.error("Evidence upload halted after a non-retryable response", {
      eventType: event.eventType,
      sequence: event.sequence,
      code,
      status: result.status ?? 0,
    });
    return { kind: "halted", code };
  }

  resetBackoff(): void {
    this.attempt = 0;
  }
}
