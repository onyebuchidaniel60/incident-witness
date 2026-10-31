import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { EventResult, EventTransport } from "../src/api.js";
import { generateAgentKeyPair } from "../src/crypto.js";
import { EventSpool } from "../src/spool.js";
import { computeBackoffDelay, EventUploader } from "../src/uploader.js";
import {
  canonicalEnvelope,
  captureLogger,
  makeHostEvent,
  makeTempDir,
  removeTempDir,
} from "./helpers.js";

const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_INCIDENT_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_KEY_ID = "33333333-3333-4333-8333-333333333333";

describe("EventUploader", () => {
  const directories: string[] = [];
  const spools: EventSpool[] = [];
  const keyPair = generateAgentKeyPair();

  afterEach(() => {
    for (const spool of spools.splice(0)) {
      try {
        spool.close();
      } catch {
        // already closed
      }
    }
    for (const directory of directories.splice(0)) {
      removeTempDir(directory);
    }
  });

  function makeSpool(): EventSpool {
    const directory = makeTempDir();
    directories.push(directory);
    const spool = new EventSpool(join(directory, "spool.sqlite"));
    spools.push(spool);
    return spool;
  }

  function queueEvent(spool: EventSpool, incidentId = INCIDENT_ID): void {
    const sequence = spool.allocateEventSequence();
    const envelope = makeHostEvent({
      sequence,
      incidentId,
      sourceKeyId: SOURCE_KEY_ID,
      keyPair,
    });
    spool.enqueue(envelope, canonicalEnvelope(envelope), false);
  }

  function uploader(spool: EventSpool, transport: EventTransport, random = () => 0.5) {
    return new EventUploader({
      spool,
      transport,
      logger: captureLogger().logger,
      random,
      baseDelayMs: 1_000,
      maxDelayMs: 300_000,
    });
  }

  it("removes an event after an accepted upload", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    const sent: string[] = [];
    const uploaderInstance = uploader(spool, {
      sendEvent: async (raw) => {
        sent.push(raw);
        return { kind: "accepted", status: 202 };
      },
    });

    expect(await uploaderInstance.tick()).toMatchObject({ kind: "uploaded", sequence: 1 });
    expect(sent).toHaveLength(1);
    expect(spool.stats().eventCount).toBe(0);
    expect(await uploaderInstance.tick()).toEqual({ kind: "idle" });
  });

  it("treats an identical duplicate as delivered", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    const uploaderInstance = uploader(spool, {
      sendEvent: async () => ({ kind: "duplicate", status: 200 }),
    });

    expect(await uploaderInstance.tick()).toMatchObject({ kind: "uploaded" });
    expect(spool.stats().eventCount).toBe(0);
  });

  it("retries 5xx and 429 responses with exponential backoff and jitter", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    let calls = 0;
    const uploaderInstance = uploader(
      spool,
      {
        sendEvent: async (): Promise<EventResult> => {
          calls += 1;
          return calls === 1
            ? { kind: "retryable", status: 503, code: "DEPENDENCY_UNAVAILABLE" }
            : { kind: "retryable", status: 429, code: "RATE_LIMITED" };
        },
      },
      () => 0.5,
    );

    const first = await uploaderInstance.tick();
    expect(first).toMatchObject({ kind: "retry", attempt: 1, code: "DEPENDENCY_UNAVAILABLE" });
    if (first.kind === "retry") {
      expect(first.delayMs).toBeGreaterThanOrEqual(500);
      expect(first.delayMs).toBeLessThanOrEqual(1_000);
    }

    const second = await uploaderInstance.tick();
    expect(second).toMatchObject({ kind: "retry", attempt: 2, code: "RATE_LIMITED" });
    if (second.kind === "retry") {
      expect(second.delayMs).toBeGreaterThanOrEqual(1_000);
      expect(second.delayMs).toBeLessThanOrEqual(2_000);
    }

    expect(spool.stats().eventCount).toBe(1);
    expect(calls).toBe(2);
  });

  it("retries network errors without deleting the event", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    const uploaderInstance = uploader(spool, {
      sendEvent: async () => ({ kind: "retryable", status: null, code: "NETWORK_ERROR" }),
    });

    expect(await uploaderInstance.tick()).toMatchObject({
      kind: "retry",
      code: "NETWORK_ERROR",
    });
    expect(spool.stats().eventCount).toBe(1);
  });

  it("halts on 4xx validation errors and never retries them", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    let calls = 0;
    const uploaderInstance = uploader(spool, {
      sendEvent: async () => {
        calls += 1;
        return { kind: "halted", status: 422, code: "VALIDATION_ERROR" };
      },
    });

    expect(await uploaderInstance.tick()).toEqual({ kind: "halted", code: "VALIDATION_ERROR" });
    expect(await uploaderInstance.tick()).toEqual({ kind: "halted", code: "VALIDATION_ERROR" });
    expect(calls).toBe(1);
    expect(uploaderInstance.isHalted()).toBe(true);
    expect(spool.stats().eventCount).toBe(1);
  });

  it("halts on revoked credentials", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    const uploaderInstance = uploader(spool, {
      sendEvent: async () => ({ kind: "halted", status: 403, code: "PERMISSION_DENIED" }),
    });

    expect(await uploaderInstance.tick()).toMatchObject({ kind: "halted" });
    expect(spool.stats().eventCount).toBe(1);
  });

  it("stops sending evidence for an incident after INCIDENT_CLOSED", async () => {
    const spool = makeSpool();
    queueEvent(spool);
    queueEvent(spool);
    queueEvent(spool, OTHER_INCIDENT_ID);
    let calls = 0;
    const uploaderInstance = uploader(spool, {
      sendEvent: async () => {
        calls += 1;
        return { kind: "incident_closed", status: 409, code: "INCIDENT_CLOSED" };
      },
    });

    expect(await uploaderInstance.tick()).toMatchObject({
      kind: "incident_closed",
      incidentId: INCIDENT_ID,
    });
    expect(spool.stats().blockedIncidents[0]?.incidentId).toBe(INCIDENT_ID);

    expect(await uploaderInstance.tick()).toMatchObject({
      kind: "incident_closed",
      incidentId: OTHER_INCIDENT_ID,
    });
    expect(calls).toBe(2);
    expect(await uploaderInstance.tick()).toEqual({ kind: "idle" });
    expect(spool.stats().eventCount).toBe(3);
  });

  it("keeps the backlog after a restart and resumes in order", async () => {
    const directory = makeTempDir();
    directories.push(directory);
    const path = join(directory, "spool.sqlite");
    const firstSpool = new EventSpool(path);
    queueEvent(firstSpool);
    queueEvent(firstSpool);
    firstSpool.close();

    const reopened = new EventSpool(path);
    spools.push(reopened);
    const uploadedSequences: number[] = [];
    const uploaderInstance = uploader(reopened, {
      sendEvent: async (raw) => {
        const parsed = JSON.parse(raw) as { sequence: number };
        uploadedSequences.push(parsed.sequence);
        return { kind: "accepted", status: 202 };
      },
    });

    await uploaderInstance.tick();
    await uploaderInstance.tick();

    expect(uploadedSequences).toEqual([1, 2]);
    expect(reopened.stats().eventCount).toBe(0);
  });
});

describe("computeBackoffDelay", () => {
  it("uses bounded exponential backoff with full jitter", () => {
    expect(computeBackoffDelay(1, () => 0)).toBe(500);
    expect(computeBackoffDelay(1, () => 1)).toBe(1_000);
    expect(computeBackoffDelay(2, () => 0)).toBe(1_000);
    expect(computeBackoffDelay(2, () => 1)).toBe(2_000);
    expect(computeBackoffDelay(100, () => 1, { maxDelayMs: 300_000 })).toBe(300_000);
    expect(computeBackoffDelay(0, () => 0.5)).toBe(750);
  });
});
