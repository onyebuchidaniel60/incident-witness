import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { z } from "zod";

export const RENTER_STATE_FILE = "renter-state.json";

const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, "Expected RFC3339 UTC timestamp");

const queueEntrySchema = z
  .object({
    event_id: z.string().uuid(),
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    event_type: z.string().min(1).max(50),
    raw: z.string().min(1),
    size_bytes: z.number().int().positive(),
    created_at: timestampSchema,
  })
  .strict();

export const renterStateSchema = z
  .object({
    state_version: z.literal(1),
    api_base_url: z.string().url(),
    incident_id: z.string().uuid(),
    source_key_id: z.string().uuid(),
    private_key_pem: z.string().min(1),
    ingestion_credential: z.string().min(32).max(512),
    sdk_version: z.string().min(1).max(40),
    workload_ref: z.string().max(100).optional(),
    endpoint_hostname: z.string().min(1).max(253),
    session_ends_at: timestampSchema,
    ingestion_deadline: timestampSchema,
    next_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    queue: z.array(queueEntrySchema),
    dropped_events: z.number().int().nonnegative().default(0),
    last_endpoint_result: z
      .enum(["reachable", "unreachable", "timeout", "tls_error", "http_error", "unknown"])
      .optional(),
    last_endpoint_emitted_at: timestampSchema.optional(),
    halted_reason: z.string().min(1).max(80).optional(),
  })
  .strict();

export type PersistedRenterState = z.infer<typeof renterStateSchema>;
export type PersistedQueueEntry = z.infer<typeof queueEntrySchema>;

export class RenterStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenterStateError";
  }
}

export function statePath(stateDir: string): string {
  return join(stateDir, RENTER_STATE_FILE);
}

function assertOwned(uid: number, label: string): void {
  const current = process.getuid?.();
  if (current !== undefined && current !== uid) {
    throw new RenterStateError(`${label} is not owned by the current user`);
  }
}

export function ensureStateDirectory(stateDir: string): void {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const stats = lstatSync(stateDir);

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new RenterStateError("The SDK state path is not a directory");
  }
  assertOwned(stats.uid, "The SDK state directory");
  chmodSync(stateDir, 0o700);
}

function readPrivateFile(path: string): string {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new RenterStateError("The SDK state file is not a regular file");
  }
  assertOwned(stats.uid, "The SDK state file");
  chmodSync(path, 0o600);
  return readFileSync(path, "utf8");
}

function writeAtomicPrivateFile(path: string, contents: string): void {
  const directory = path.slice(0, path.lastIndexOf("/"));
  const temporary = `${directory}/.renter-state-${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);

  try {
    writeSync(descriptor, contents, null, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }

  closeSync(descriptor);
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

export function loadRenterState(stateDir: string): PersistedRenterState {
  const path = statePath(stateDir);
  let raw: string;

  try {
    raw = readPrivateFile(path);
  } catch {
    throw new RenterStateError("No saved renter SDK state was found");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RenterStateError("The saved renter SDK state is not valid JSON");
  }

  const result = renterStateSchema.safeParse(parsed);
  if (!result.success) {
    throw new RenterStateError("The saved renter SDK state is invalid");
  }

  return result.data;
}

export function saveRenterState(stateDir: string, state: PersistedRenterState): void {
  ensureStateDirectory(stateDir);
  const validated = renterStateSchema.parse(state);
  writeAtomicPrivateFile(statePath(stateDir), `${JSON.stringify(validated, null, 2)}\n`);
}

export function hasRenterState(stateDir: string): boolean {
  try {
    lstatSync(statePath(stateDir));
    return true;
  } catch {
    return false;
  }
}
