import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { generateAgentKeyPair } from "../src/crypto.js";
import { EventSpool, SpoolIntegrityError } from "../src/spool.js";
import { canonicalEnvelope, makeHostEvent, makeTempDir, removeTempDir } from "./helpers.js";

const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";

describe("EventSpool", () => {
  const directories: string[] = [];
  const spools: EventSpool[] = [];

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

  function newSpool(directory: string, quotaBytes?: number): EventSpool {
    const spool = new EventSpool(join(directory, "spool.sqlite"), {
      ...(quotaBytes === undefined ? {} : { quotaBytes }),
    });
    spools.push(spool);
    directories.push(directory);
    return spool;
  }

  it("persists signed events and survives a restart", () => {
    const directory = makeTempDir();
    const keyPair = generateAgentKeyPair();
    const spool = newSpool(directory);
    const sequence = spool.allocateEventSequence();
    const envelope = makeHostEvent({
      sequence,
      incidentId: INCIDENT_ID,
      sourceKeyId: SOURCE_KEY_ID,
      keyPair,
    });
    const raw = canonicalEnvelope(envelope);

    expect(spool.enqueue(envelope, raw, false)).toEqual({ inserted: true, dropped: 0 });
    expect(spool.stats().eventCount).toBe(1);
    spool.close();

    const reopened = new EventSpool(join(directory, "spool.sqlite"));
    spools.push(reopened);
    const pending = reopened.nextPendingEvent();

    expect(pending?.eventId).toBe(envelope.event_id);
    expect(pending?.sequence).toBe(sequence);
    expect(pending?.raw).toBe(raw);
    expect(reopened.allocateEventSequence()).toBe(sequence + 1);
  });

  it("keeps sequence numbers durable when a crash leaves a gap", () => {
    const directory = makeTempDir();
    const spool = newSpool(directory);

    expect(spool.allocateEventSequence()).toBe(1);
    expect(spool.allocateEventSequence()).toBe(2);
    spool.close();

    const reopened = new EventSpool(join(directory, "spool.sqlite"));
    spools.push(reopened);

    expect(reopened.peekNextEventSequence()).toBe(3);
    expect(reopened.allocateEventSequence()).toBe(3);
    expect(reopened.stats().eventCount).toBe(0);
  });

  it("keeps the presence sequence independent from the event sequence", () => {
    const directory = makeTempDir();
    const spool = newSpool(directory);

    expect(spool.allocatePresenceSequence()).toBe(1);
    expect(spool.allocateEventSequence()).toBe(1);
    expect(spool.allocatePresenceSequence()).toBe(2);
    expect(spool.allocateEventSequence()).toBe(2);
    spool.close();

    const reopened = new EventSpool(join(directory, "spool.sqlite"));
    spools.push(reopened);

    expect(reopened.allocatePresenceSequence()).toBe(3);
    expect(reopened.allocateEventSequence()).toBe(3);
  });

  it("drops oldest non-critical observations but preserves critical transitions", () => {
    const directory = makeTempDir();
    const keyPair = generateAgentKeyPair();
    const probe = newSpool(makeTempDir());
    const sequence = probe.allocateEventSequence();
    const probeEnvelope = makeHostEvent({
      sequence,
      incidentId: INCIDENT_ID,
      sourceKeyId: SOURCE_KEY_ID,
      keyPair,
    });
    const raw = canonicalEnvelope(probeEnvelope);
    const size = Buffer.byteLength(raw, "utf8");
    probe.close();

    const quota = size * 2 + 16;
    const spool = newSpool(directory, quota);

    const enqueue = (critical: boolean) => {
      const nextSequence = spool.allocateEventSequence();
      const envelope = makeHostEvent({
        sequence: nextSequence,
        incidentId: INCIDENT_ID,
        sourceKeyId: SOURCE_KEY_ID,
        keyPair,
      });
      return { envelope, result: spool.enqueue(envelope, canonicalEnvelope(envelope), critical) };
    };

    const first = enqueue(false);
    const second = enqueue(false);
    const third = enqueue(false);
    expect(third.result).toEqual({ inserted: true, dropped: 1 });
    expect(spool.stats().droppedCount).toBe(1);
    expect(spool.stats().eventCount).toBe(2);

    const critical = enqueue(true);
    expect(critical.result).toEqual({ inserted: true, dropped: 1 });
    expect(spool.stats().eventCount).toBe(2);

    const extraCritical = enqueue(true);
    expect(extraCritical.result).toEqual({ inserted: true, dropped: 1 });
    expect(spool.stats().eventCount).toBe(2);

    const overflowCritical = enqueue(true);
    expect(overflowCritical.result).toEqual({ inserted: false, reason: "quota" });
    expect(spool.stats().eventCount).toBe(2);

    const pendingSequences: number[] = [];
    for (let event = spool.nextPendingEvent(); event; event = spool.nextPendingEvent()) {
      pendingSequences.push(event.sequence);
      spool.remove(event.eventId);
    }

    expect(pendingSequences).toHaveLength(2);
    expect(pendingSequences).toContain(critical.envelope.sequence);
    expect(pendingSequences).toContain(extraCritical.envelope.sequence);
    expect(pendingSequences).not.toContain(first.envelope.sequence);
    expect(pendingSequences).not.toContain(second.envelope.sequence);
    expect(pendingSequences).not.toContain(third.envelope.sequence);
  });

  it("blocks uploads for a closed incident without deleting its events", () => {
    const directory = makeTempDir();
    const keyPair = generateAgentKeyPair();
    const spool = newSpool(directory);

    const firstSequence = spool.allocateEventSequence();
    const first = makeHostEvent({
      sequence: firstSequence,
      incidentId: INCIDENT_ID,
      sourceKeyId: SOURCE_KEY_ID,
      keyPair,
    });
    spool.enqueue(first, canonicalEnvelope(first), false);
    spool.blockIncident(INCIDENT_ID, "INCIDENT_CLOSED");

    expect(spool.nextPendingEvent()).toBeNull();
    expect(spool.stats().blockedIncidents[0]?.incidentId).toBe(INCIDENT_ID);
    expect(spool.stats().eventCount).toBe(1);

    const otherIncident = "33333333-3333-4333-8333-333333333333";
    const secondSequence = spool.allocateEventSequence();
    const second = makeHostEvent({
      sequence: secondSequence,
      incidentId: otherIncident,
      sourceKeyId: SOURCE_KEY_ID,
      keyPair,
    });
    spool.enqueue(second, canonicalEnvelope(second), false);

    expect(spool.nextPendingEvent()?.incidentId).toBe(otherIncident);
  });

  it("uses WAL mode on a file-backed spool", () => {
    const directory = makeTempDir();
    const spool = newSpool(directory);
    spool.close();
    spools.splice(spools.indexOf(spool), 1);

    const database = new Database(join(directory, "spool.sqlite"), { readonly: true });
    try {
      expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    } finally {
      database.close();
    }
    expect(statSync(join(directory, "spool.sqlite")).mode & 0o777).toBe(0o600);
  });

  it("refuses to open a corrupt spool instead of resetting the sequence", () => {
    const directory = makeTempDir();
    const path = join(directory, "spool.sqlite");
    writeFileSync(path, "this is not a sqlite database", "utf8");

    expect(() => new EventSpool(path)).toThrow(SpoolIntegrityError);
  });
});
