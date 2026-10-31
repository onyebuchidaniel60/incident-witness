import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import { requireEnvironment } from "./env.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export type TransactionContext = {
  client: PoolClient;
  db: Database;
};

export type ApiTransactionMode =
  | "provider"
  | "machine_ingest"
  | "machine_enroll"
  | "system_lifecycle";

export type ApiTransactionOptions = {
  mode: ApiTransactionMode;
  subject?: string;
  gucs?: Record<string, string>;
};

const allowedGucNames = new Set([
  "request.jwt.claim.sub",
  "iw.request_mode",
  "iw.credential_hash_hex",
  "iw.enrollment_token_hash_hex",
  "iw.invitation_token_hash_hex",
  "iw.owner_user_id",
  "iw.source_key_id",
  "iw.incident_id",
  "iw.host_id",
  "iw.source_type",
]);

export function createApiPool(): Pool {
  return new Pool({
    connectionString: requireEnvironment("DATABASE_URL_IW_API"),
    max: 10,
    application_name: "incident-witness-api",
  });
}

export function createWorkerPool(): Pool {
  return new Pool({
    connectionString: requireEnvironment("DATABASE_URL_IW_WORKER"),
    max: 5,
    application_name: "incident-witness-worker",
  });
}

export async function setTransactionGuc(
  client: PoolClient,
  name: string,
  value: string,
): Promise<void> {
  if (!allowedGucNames.has(name) || name === "iw.request_mode") {
    throw new Error(`Unsupported transaction GUC: ${name}`);
  }
  await client.query("select set_config($1, $2, true)", [name, value]);
}

export async function assertRuntimeRole(
  pool: Pool,
  expectedRole: "iw_api" | "iw_worker",
): Promise<void> {
  const client = await pool.connect();

  try {
    const result = await client.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `select current_user,
              r.rolsuper,
              r.rolbypassrls
         from pg_roles r
        where r.rolname = current_user`,
    );
    const row = result.rows[0];

    if (!row || row.current_user !== expectedRole || row.rolsuper || row.rolbypassrls) {
      throw new Error(`Database connection is not the restricted ${expectedRole} runtime role`);
    }
  } finally {
    client.release();
  }
}

export async function withApiTransaction<T>(
  pool: Pool,
  options: ApiTransactionOptions,
  callback: (context: TransactionContext) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("select set_config('iw.request_mode', $1, true)", [options.mode]);

    if (options.subject !== undefined) {
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
        options.subject,
      ]);
    }

    for (const [name, value] of Object.entries(options.gucs ?? {})) {
      await setTransactionGuc(client, name, value);
    }

    const db = drizzle(client, { schema });
    const result = await callback({ client, db });
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original error if rollback also fails.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function withProviderTransaction<T>(
  pool: Pool,
  subject: string,
  callback: (context: TransactionContext) => Promise<T>,
): Promise<T> {
  return withApiTransaction(pool, { mode: "provider", subject }, callback);
}

export async function checkDatabaseReady(pool: Pool, expectedMigration: string): Promise<boolean> {
  const result = await pool.query<{ migration: string | null }>(
    `select max(version) as migration
       from iw_schema_migrations`,
  );

  return result.rows[0]?.migration === expectedMigration;
}

export async function latestMigration(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ version: string }>(
    `select version
       from iw_schema_migrations
      order by version desc
      limit 1`,
  );

  return result.rows[0]?.version ?? null;
}
