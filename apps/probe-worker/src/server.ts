import { createPublicKey, type KeyObject } from "node:crypto";

import { assertRuntimeRole, createWorkerPool } from "@incident-witness/db";
import type { Pool } from "pg";

import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { PostgresProbeJobStore } from "./store.js";
import { ProbeWorker } from "./worker.js";

function derivePublicKey(privateKey: KeyObject): Buffer {
  const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("The probe private key has no public component");
  return Buffer.from(jwk.x, "base64url");
}

async function verifyProbeKey(pool: Pool): Promise<void> {
  const result = await pool.query<{
    id: string;
    source_type: string;
    public_key: Buffer;
    status: string;
  }>(
    `select id, source_type, public_key, status
       from witness_keys
      where id = $1`,
    [config.platformProbeKeyId],
  );
  const row = result.rows[0];

  if (!row || row.source_type !== "platform_probe" || row.status !== "active") {
    throw new Error("No active platform_probe key is registered for IW_PLATFORM_PROBE_KEY_ID");
  }

  const publicKey = derivePublicKey(config.platformProbePrivateKey);
  if (publicKey.length !== 32 || !row.public_key.equals(publicKey)) {
    throw new Error("IW_PLATFORM_PROBE_PRIVATE_KEY does not match the registered public key");
  }
}

async function main(): Promise<void> {
  const logger = createLogger(config.logLevel);
  const pool = createWorkerPool();

  try {
    await assertRuntimeRole(pool, "iw_worker");
    await verifyProbeKey(pool);

    const store = new PostgresProbeJobStore(pool, {
      workerId: config.workerId,
      sourceKeyId: config.platformProbeKeyId,
      intervalSeconds: config.probeIntervalSeconds,
    });
    const worker = new ProbeWorker({
      store,
      sourceKeyId: config.platformProbeKeyId,
      privateKey: config.platformProbePrivateKey,
      intervalSeconds: config.probeIntervalSeconds,
      concurrency: config.concurrency,
      maxAttempts: config.maxAttempts,
      pollIntervalMs: config.pollIntervalMs,
      probeTimeoutMs: config.probeTimeoutMs,
      logger,
    });

    logger.info("Probe worker started", {
      workerId: config.workerId,
      sourceKeyId: config.platformProbeKeyId,
      intervalSeconds: config.probeIntervalSeconds,
      concurrency: config.concurrency,
    });

    let stopping = false;
    const shutdown = (signal: string): void => {
      if (stopping) return;
      stopping = true;
      logger.info("Probe worker stopping", { signal });
      void worker.stop();
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    await worker.run();
    logger.info("Probe worker stopped", { ...worker.getMetrics() });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "PROBE_WORKER_FATAL";
  console.error(
    `${new Date().toISOString()} ERROR Probe worker failed ${JSON.stringify({ code })}`,
  );
  process.exitCode = 1;
});
