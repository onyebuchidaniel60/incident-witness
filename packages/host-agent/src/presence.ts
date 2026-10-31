import type { KeyObject } from "node:crypto";

import type { PresenceTransport } from "./api.js";
import { signPresence } from "./crypto.js";
import type { Logger } from "./log.js";
import type { EventSpool } from "./spool.js";

export type PresenceTickResult = {
  kind: "sent" | "duplicate" | "retryable" | "halted";
  sequence: number;
  code?: string;
};

export class PresenceReporter {
  private haltedCode: string | null = null;

  constructor(
    private readonly options: {
      spool: EventSpool;
      privateKey: KeyObject;
      transport: PresenceTransport;
      hostId: string;
      agentVersion: string;
      logger: Logger;
      now?: () => Date;
    },
  ) {}

  isHalted(): boolean {
    return this.haltedCode !== null;
  }

  async tick(): Promise<PresenceTickResult> {
    if (this.haltedCode !== null) {
      return { kind: "halted", sequence: 0, code: this.haltedCode };
    }

    const sequence = this.options.spool.allocatePresenceSequence();
    const presence = signPresence(
      {
        hostId: this.options.hostId,
        observedAt: (this.options.now?.() ?? new Date()).toISOString(),
        heartbeatSequence: sequence,
        agentVersion: this.options.agentVersion,
      },
      this.options.privateKey,
    );

    const result = await this.options.transport.sendPresence(presence);

    if (result.kind === "accepted" || result.kind === "duplicate") {
      this.options.logger.debug("Operational presence heartbeat sent", {
        sequence,
        duplicate: result.kind === "duplicate",
      });
      return { kind: result.kind === "duplicate" ? "duplicate" : "sent", sequence };
    }

    if (result.kind === "retryable") {
      this.options.logger.warn("Operational presence heartbeat was not accepted; sequence consumed", {
        sequence,
        code: result.code ?? "RETRYABLE_ERROR",
        status: result.status ?? 0,
      });
      return { kind: "retryable", sequence, code: result.code ?? "RETRYABLE_ERROR" };
    }

    const code = result.code ?? "PRESENCE_HALTED";
    this.haltedCode = code;
    this.options.logger.error("Operational presence halted after a non-retryable response", {
      sequence,
      code,
      status: result.status ?? 0,
    });
    return { kind: "halted", sequence, code };
  }
}
