import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Pool } from "pg";

import { requireEnvironment } from "./env.js";

const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));
const ledgerTable = "iw_schema_migrations";

async function ensureLedger(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists ${ledgerTable} (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

export async function runMigrations(): Promise<void> {
  const pool = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 1,
    application_name: "incident-witness-migrator",
  });

  try {
    await ensureLedger(pool);
    const files = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const sql = await readFile(`${migrationsDirectory}/${file}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await pool.query<{ checksum: string }>(
        `select checksum from ${ledgerTable} where version = $1`,
        [version],
      );

      if (applied.rowCount) {
        if (applied.rows[0]?.checksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${version}`);
        }
        console.log(`already applied: ${version}`);
        continue;
      }

      const client = await pool.connect();

      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          `insert into ${ledgerTable} (version, checksum) values ($1, $2)`,
          [version, checksum],
        );
        await client.query("commit");
        console.log(`applied: ${version}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

export async function migrationStatus(): Promise<void> {
  const pool = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 1,
    application_name: "incident-witness-migrator",
  });

  try {
    await ensureLedger(pool);
    const files = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const applied = await pool.query<{ version: string; applied_at: Date }>(
      `select version, applied_at from ${ledgerTable} order by version`,
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      console.log(`${appliedVersions.has(version) ? "applied" : "pending"}: ${version}`);
    }
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
const isMain =
  entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;

if (isMain) {
  if (process.argv.includes("--status")) {
    await migrationStatus();
  } else {
    await runMigrations();
  }
}
