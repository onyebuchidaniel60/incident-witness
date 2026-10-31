import { createPrivateKey, type KeyObject } from "node:crypto";
import { randomUUID } from "node:crypto";

import { loadEnvironment, requireEnvironment } from "@incident-witness/db";
import { z } from "zod";

loadEnvironment();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL_IW_WORKER: z.string().min(1),
  IW_PLATFORM_PROBE_KEY_ID: z.string().uuid(),
  IW_PLATFORM_PROBE_PRIVATE_KEY: z.string().min(1),
  IW_PROBE_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(5_000).default(1_000),
  IW_PROBE_TIMEOUT_MS: z.coerce.number().int().min(500).max(5_000).default(3_000),
  IW_PROBE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(5),
  IW_PROBE_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(60).default(15),
  IW_PROBE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  IW_LOG_LEVEL: z.string().default("info"),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid probe-worker configuration; check: ${fields}`);
}

function parsePrivateKey(encoded: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" });
  } catch {
    throw new Error("Invalid probe-worker configuration; probe private key is not valid PKCS8");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Invalid probe-worker configuration; probe key must be Ed25519");
  }
  return key;
}

export type WorkerConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  platformProbeKeyId: string;
  platformProbePrivateKey: KeyObject;
  pollIntervalMs: number;
  probeTimeoutMs: number;
  concurrency: number;
  probeIntervalSeconds: number;
  maxAttempts: number;
  logLevel: string;
  workerId: string;
};

export const config: WorkerConfig = {
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: requireEnvironment("DATABASE_URL_IW_WORKER"),
  platformProbeKeyId: parsed.data.IW_PLATFORM_PROBE_KEY_ID,
  platformProbePrivateKey: parsePrivateKey(parsed.data.IW_PLATFORM_PROBE_PRIVATE_KEY),
  pollIntervalMs: parsed.data.IW_PROBE_POLL_INTERVAL_MS,
  probeTimeoutMs: parsed.data.IW_PROBE_TIMEOUT_MS,
  concurrency: parsed.data.IW_PROBE_CONCURRENCY,
  probeIntervalSeconds: parsed.data.IW_PROBE_INTERVAL_SECONDS,
  maxAttempts: parsed.data.IW_PROBE_MAX_ATTEMPTS,
  logLevel: parsed.data.IW_LOG_LEVEL,
  workerId: `probe-worker-${randomUUID().slice(0, 18)}`,
};
