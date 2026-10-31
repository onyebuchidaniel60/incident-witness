import { chmodSync, existsSync } from "node:fs";

import Database from "better-sqlite3";
import type { EventEnvelope } from "@incident-witness/protocol";

export const DEFAULT_SPOOL_QUOTA_BYTES = 50 * 1024 * 1024;
export const SPOOL_SCHEMA_VERSION = "1";

const META_NEXT_EVENT_SEQUENCE = "next_event_sequence";
const META_NEXT_PRESENCE_SEQUENCE = "next_presence_sequence";
const META_SPOOL_BYTES = "spool_bytes";
const META_DROPPED_COUNT = "dropped_count";

export class SpoolIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpoolIntegrityError";
  }
}

export type SpoolEvent = {
  eventId: string;
  incidentId: string;
  eventType: string;
  sequence: number;
  observedAt: string;
  raw: string;
  sizeBytes: number;
  critical: boolean;
};

export type EnqueueResult =
  { inserted: true; dropped: number } | { inserted: false; reason: "quota" };

export type BlockedIncident = {
  incidentId: string;
  reasonCode: string;
  blockedAt: string;
};

export type SpoolStats = {
  eventCount: number;
  totalBytes: number;
  quotaBytes: number;
  full: boolean;
  droppedCount: number;
  blockedIncidents: BlockedIncident[];
};

type SpoolRow = {
  event_id: string;
  incident_id: string;
  event_type: string;
  sequence: number;
  observed_at: string;
  envelope_json: string;
  size_bytes: number;
  critical: number;
};

function rowToEvent(row: SpoolRow): SpoolEvent {
  return {
    eventId: row.event_id,
    incidentId: row.incident_id,
    eventType: row.event_type,
    sequence: row.sequence,
    observedAt: row.observed_at,
    raw: row.envelope_json,
    sizeBytes: row.size_bytes,
    critical: row.critical === 1,
  };
}

export class EventSpool {
  private readonly db!: Database.Database;
  readonly quotaBytes: number;
  private readonly filename: string;

  constructor(filename: string, options: { quotaBytes?: number } = {}) {
    this.quotaBytes = options.quotaBytes ?? DEFAULT_SPOOL_QUOTA_BYTES;
    this.filename = filename;

    if (!Number.isSafeInteger(this.quotaBytes) || this.quotaBytes <= 0) {
      throw new Error("The spool quota must be a positive safe integer");
    }

    try {
      this.db = new Database(filename);
      this.db.pragma("synchronous = FULL");
      this.db.pragma("busy_timeout = 5000");
      this.db.pragma("foreign_keys = ON");

      if (filename !== ":memory:") {
        const journalMode = this.db.pragma("journal_mode = WAL", { simple: true });
        if (journalMode !== "wal") {
          throw new SpoolIntegrityError("The local spool could not enter WAL mode");
        }
      }

      const integrity = this.db.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") {
        throw new SpoolIntegrityError("The local spool failed its integrity check");
      }

      this.initializeSchema();
      this.hardenFilePermissions();
    } catch (error) {
      this.db?.close();
      if (error instanceof SpoolIntegrityError) throw error;
      throw new SpoolIntegrityError("The local spool could not be opened or verified");
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      pragma journal_size_limit = 16777216;
    `);

    this.db.exec(`
      create table if not exists spool_meta (
        key text primary key,
        value text not null
      );

      create table if not exists spool_events (
        id integer primary key autoincrement,
        event_id text not null unique,
        incident_id text not null,
        event_type text not null,
        sequence integer not null unique,
        observed_at text not null,
        envelope_json text not null,
        size_bytes integer not null,
        critical integer not null check (critical in (0, 1)),
        created_at text not null
      );

      create index if not exists spool_events_incident_idx
        on spool_events (incident_id, id);

      create table if not exists blocked_incidents (
        incident_id text primary key,
        reason_code text not null,
        blocked_at text not null
      );
    `);

    const schemaVersion = this.getMeta("schema_version");
    if (schemaVersion === null) {
      this.setMeta("schema_version", SPOOL_SCHEMA_VERSION);
    } else if (schemaVersion !== SPOOL_SCHEMA_VERSION) {
      throw new SpoolIntegrityError("The local spool schema version is not supported");
    }

    if (this.getMeta(META_NEXT_EVENT_SEQUENCE) === null) {
      this.setMeta(META_NEXT_EVENT_SEQUENCE, "1");
    }
    if (this.getMeta(META_NEXT_PRESENCE_SEQUENCE) === null) {
      this.setMeta(META_NEXT_PRESENCE_SEQUENCE, "1");
    }
    if (this.getMeta(META_DROPPED_COUNT) === null) {
      this.setMeta(META_DROPPED_COUNT, "0");
    }
    if (this.getMeta(META_SPOOL_BYTES) === null) {
      const total = this.db
        .prepare("select coalesce(sum(size_bytes), 0) as total from spool_events")
        .get() as { total: number };
      this.setMeta(META_SPOOL_BYTES, String(total.total));
    }
  }

  private hardenFilePermissions(): void {
    if (this.filename === ":memory:") return;

    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const path = `${this.filename}${suffix}`;
      if (existsSync(path)) {
        chmodSync(path, 0o600);
      }
    }
  }

  private getMeta(key: string): string | null {
    const row = this.db.prepare("select value from spool_meta where key = ?").get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `insert into spool_meta (key, value) values (?, ?)
         on conflict(key) do update set value = excluded.value`,
      )
      .run(key, value);
  }

  private readSequence(metaKey: string): number {
    const raw = this.getMeta(metaKey);
    const value = raw === null ? Number.NaN : Number(raw);

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new SpoolIntegrityError("A durable sequence counter is invalid");
    }
    if (value >= Number.MAX_SAFE_INTEGER) {
      throw new SpoolIntegrityError("A durable sequence counter has reached its safe limit");
    }

    return value;
  }

  private allocateSequence(metaKey: string): number {
    return this.db.transaction(() => {
      const current = this.readSequence(metaKey);
      this.setMeta(metaKey, String(current + 1));
      return current;
    })();
  }

  allocateEventSequence(): number {
    return this.allocateSequence(META_NEXT_EVENT_SEQUENCE);
  }

  allocatePresenceSequence(): number {
    return this.allocateSequence(META_NEXT_PRESENCE_SEQUENCE);
  }

  peekNextEventSequence(): number {
    return this.readSequence(META_NEXT_EVENT_SEQUENCE);
  }

  peekNextPresenceSequence(): number {
    return this.readSequence(META_NEXT_PRESENCE_SEQUENCE);
  }

  enqueue(envelope: EventEnvelope, raw: string, critical: boolean): EnqueueResult {
    const sizeBytes = Buffer.byteLength(raw, "utf8");
    if (sizeBytes <= 0 || sizeBytes > this.quotaBytes) {
      return { inserted: false, reason: "quota" };
    }

    return this.db.transaction((): EnqueueResult => {
      let totalBytes = Number(this.getMeta(META_SPOOL_BYTES) ?? "0");
      let dropped = 0;

      while (totalBytes + sizeBytes > this.quotaBytes) {
        const oldest = this.db
          .prepare(
            `select id, size_bytes from spool_events
              where critical = 0
              order by id asc
              limit 1`,
          )
          .get() as { id: number; size_bytes: number } | undefined;

        if (!oldest) break;

        this.db.prepare("delete from spool_events where id = ?").run(oldest.id);
        totalBytes -= oldest.size_bytes;
        dropped += 1;
      }

      const droppedCount = Number(this.getMeta(META_DROPPED_COUNT) ?? "0");
      if (dropped > 0) {
        this.setMeta(META_DROPPED_COUNT, String(droppedCount + dropped));
      }

      if (totalBytes + sizeBytes > this.quotaBytes) {
        this.setMeta(META_SPOOL_BYTES, String(totalBytes));
        return { inserted: false, reason: "quota" };
      }

      const createdAt = new Date().toISOString();
      this.db
        .prepare(
          `insert into spool_events
             (event_id, incident_id, event_type, sequence, observed_at, envelope_json,
              size_bytes, critical, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          envelope.event_id,
          envelope.incident_id,
          envelope.event_type,
          envelope.sequence,
          envelope.observed_at,
          raw,
          sizeBytes,
          critical ? 1 : 0,
          createdAt,
        );

      this.setMeta(META_SPOOL_BYTES, String(totalBytes + sizeBytes));
      return { inserted: true, dropped };
    })();
  }

  nextPendingEvent(): SpoolEvent | null {
    const row = this.db
      .prepare(
        `select event_id, incident_id, event_type, sequence, observed_at,
                envelope_json, size_bytes, critical
           from spool_events
          where incident_id not in (select incident_id from blocked_incidents)
          order by id asc
          limit 1`,
      )
      .get() as SpoolRow | undefined;

    return row ? rowToEvent(row) : null;
  }

  remove(eventId: string): boolean {
    return this.db.transaction(() => {
      const row = this.db
        .prepare("select size_bytes from spool_events where event_id = ?")
        .get(eventId) as { size_bytes: number } | undefined;

      if (!row) return false;

      this.db.prepare("delete from spool_events where event_id = ?").run(eventId);
      const total = Math.max(0, Number(this.getMeta(META_SPOOL_BYTES) ?? "0") - row.size_bytes);
      this.setMeta(META_SPOOL_BYTES, String(total));
      return true;
    })();
  }

  blockIncident(
    incidentId: string,
    reasonCode: string,
    blockedAt = new Date().toISOString(),
  ): void {
    this.db
      .prepare(
        `insert into blocked_incidents (incident_id, reason_code, blocked_at)
         values (?, ?, ?)
         on conflict(incident_id) do update set
           reason_code = excluded.reason_code,
           blocked_at = excluded.blocked_at`,
      )
      .run(incidentId, reasonCode, blockedAt);
  }

  listBlockedIncidents(): BlockedIncident[] {
    const rows = this.db
      .prepare(
        `select incident_id, reason_code, blocked_at
           from blocked_incidents
          order by blocked_at asc`,
      )
      .all() as Array<{ incident_id: string; reason_code: string; blocked_at: string }>;

    return rows.map((row) => ({
      incidentId: row.incident_id,
      reasonCode: row.reason_code,
      blockedAt: row.blocked_at,
    }));
  }

  stats(): SpoolStats {
    const row = this.db
      .prepare("select count(*) as count, coalesce(sum(size_bytes), 0) as total from spool_events")
      .get() as { count: number; total: number };
    const dropped = Number(this.getMeta(META_DROPPED_COUNT) ?? "0");

    return {
      eventCount: row.count,
      totalBytes: Number(row.total),
      quotaBytes: this.quotaBytes,
      full: Number(row.total) >= this.quotaBytes,
      droppedCount: dropped,
      blockedIncidents: this.listBlockedIncidents(),
    };
  }

  close(): void {
    this.db.close();
  }
}
