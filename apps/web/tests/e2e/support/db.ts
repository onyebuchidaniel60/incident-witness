import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

for (const candidate of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false, quiet: true });
    break;
  }
}

export const E2E_USER_ID = "f4444444-4444-4444-8444-444444444444";
const E2E_EMAIL = "iw-phase4-e2e@example.invalid";

function migratorPool(): Pool {
  const connectionString = process.env.DATABASE_URL_MIGRATOR;
  if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required for e2e setup");
  return new Pool({ connectionString, max: 2, application_name: "iw-phase4-e2e-seed" });
}

export async function seedE2eUser(): Promise<void> {
  const pool = migratorPool();
  try {
    await pool.query(
      `insert into auth.users
         (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), '{}'::jsonb, '{}'::jsonb, now(), now())
       on conflict (id) do nothing`,
      [E2E_USER_ID, E2E_EMAIL],
    );
    await pool.query(
      `insert into profiles (id, display_name)
       values ($1, 'Phase 4 E2E provider')
       on conflict (id) do update set display_name = excluded.display_name`,
      [E2E_USER_ID],
    );
  } finally {
    await pool.end();
  }
}

export async function cleanupE2eData(): Promise<void> {
  const pool = migratorPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const incidents = `select id from incidents where owner_user_id = $1`;
    await client.query(`delete from evidence_events where incident_id in (${incidents})`, [
      E2E_USER_ID,
    ]);
    await client.query(`delete from evidence_bundles where incident_id in (${incidents})`, [
      E2E_USER_ID,
    ]);
    await client.query(`delete from probe_jobs where incident_id in (${incidents})`, [E2E_USER_ID]);
    await client.query(
      `delete from source_credentials
        where source_key_id in (
          select id from witness_keys
           where owner_user_id = $1
              or incident_id in (${incidents})
        )`,
      [E2E_USER_ID],
    );
    await client.query(`delete from enrollment_tokens where owner_user_id = $1`, [E2E_USER_ID]);
    await client.query(`delete from renter_invitations where owner_user_id = $1`, [E2E_USER_ID]);
    await client.query(`delete from host_endpoint_challenges where owner_user_id = $1`, [
      E2E_USER_ID,
    ]);
    await client.query(
      `delete from witness_keys
        where owner_user_id = $1
           or incident_id in (${incidents})`,
      [E2E_USER_ID],
    );
    await client.query(`delete from incidents where owner_user_id = $1`, [E2E_USER_ID]);
    await client.query(`delete from hosts where owner_user_id = $1`, [E2E_USER_ID]);
    await client.query(`delete from idempotency_records where owner_user_id = $1`, [E2E_USER_ID]);
    await client.query(`delete from audit_events where owner_user_id = $1`, [E2E_USER_ID]);
    await client.query(`delete from profiles where id = $1`, [E2E_USER_ID]);
    await client.query(`delete from auth.users where id = $1`, [E2E_USER_ID]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
