import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createApiPool,
  createWorkerPool,
  withApiTransaction,
  withProviderTransaction,
} from "../src/client.js";
import { loadEnvironment, requireEnvironment } from "../src/env.js";

loadEnvironment();

const userA = "a1111111-1111-4111-8111-111111111111";
const userB = "b2222222-2222-4222-8222-222222222222";
const hostA = "a3333333-3333-4333-8333-333333333333";
const hostB = "b4444444-4444-4444-8444-444444444444";
const incidentA = "a5555555-5555-4555-8555-555555555555";
const incidentB = "b6666666-6666-4666-8666-666666666666";
const hostKeyA = "a7777777-7777-4777-8777-777777777777";
const sourceCredentialA = "a8888888-8888-4888-8888-888888888888";
const platformKey = "a9999999-9999-4999-8999-999999999999";
const testBundle = "b0000000-0000-4000-8000-000000000000";
const testProbeJob = "c1111111-1111-4111-8111-111111111111";
const testAudit = "d2222222-2222-4222-8222-222222222222";
const testEvent = "e3333333-3333-4333-8333-333333333333";
const testRequest = "f4444444-4444-4444-8444-444444444444";
const credentialHex = Buffer.alloc(32, 0x33).toString("hex");

let migrator: Pool;
let api: Pool;
let worker: Pool;

async function cleanup(client: PoolClient) {
  const incidents = [incidentA, incidentB];
  await client.query("delete from evidence_events where incident_id = any($1::uuid[])", [incidents]);
  await client.query("delete from evidence_bundles where incident_id = any($1::uuid[])", [incidents]);
  await client.query("delete from probe_jobs where incident_id = any($1::uuid[])", [incidents]);
  await client.query("delete from source_credentials where source_key_id = $1", [hostKeyA]);
  await client.query("delete from enrollment_tokens where host_id = any($1::uuid[])", [[hostA, hostB]]);
  await client.query("delete from renter_invitations where incident_id = any($1::uuid[])", [
    incidents,
  ]);
  await client.query("delete from witness_keys where id = $1", [hostKeyA]);
  await client.query("delete from incidents where id = any($1::uuid[])", [incidents]);
  await client.query("delete from hosts where id = any($1::uuid[])", [[hostA, hostB]]);
  await client.query("delete from audit_events where request_id = $1", [testRequest]);
  await client.query("delete from platform_signing_keys where id = $1", [platformKey]);
  await client.query("delete from profiles where id = any($1::uuid[])", [[userA, userB]]);
  await client.query("delete from auth.users where id = any($1::uuid[])", [[userA, userB]]);
}

beforeAll(async () => {
  migrator = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 2,
    application_name: "adr-001-fixture",
  });
  api = createApiPool();
  worker = createWorkerPool();

  const client = await migrator.connect();
  try {
    await cleanup(client);
    await client.query("begin");
    await client.query(
      `insert into auth.users
         (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values
         ($1, 'authenticated', 'authenticated', 'iw-adr-a@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
         ($2, 'authenticated', 'authenticated', 'iw-adr-b@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [userA, userB],
    );
    await client.query(
      `insert into profiles (id, display_name)
       values ($1, 'ADR User A'), ($2, 'ADR User B')`,
      [userA, userB],
    );
    await client.query(
      `insert into hosts
         (id, owner_user_id, alias, endpoint_hostname, endpoint_verified_at, status)
       values
         ($1, $3, 'adr-host-a', 'adr-a.example.invalid', now(), 'active'),
         ($2, $4, 'adr-host-b', 'adr-b.example.invalid', now(), 'active')`,
      [hostA, hostB, userA, userB],
    );
    await client.query(
      `insert into incidents
         (id, owner_user_id, host_id, title, status, capture_started_at, capture_ends_at, ingestion_deadline)
       values
         ($1, $3, $4, 'ADR incident A', 'collecting', now() - interval '5 minutes', now() + interval '30 minutes', now() + interval '1 day'),
         ($2, $5, $6, 'ADR incident B', 'collecting', now() - interval '5 minutes', now() + interval '30 minutes', now() + interval '1 day')`,
      [incidentA, incidentB, userA, hostA, userB, hostB],
    );
    await client.query(
      `insert into witness_keys
         (id, owner_user_id, host_id, source_type, public_key, fingerprint, certificate_json, certificate_signature)
       values
         ($1, $2, $3, 'host_agent', decode(repeat('11', 32), 'hex'), 'adr-host-key-a', '{}'::jsonb, decode(repeat('22', 64), 'hex'))`,
      [hostKeyA, userA, hostA],
    );
    await client.query(
      `insert into source_credentials
         (id, source_key_id, credential_hash, credential_type)
       values ($1, $2, decode(repeat('33', 32), 'hex'), 'host_agent')`,
      [sourceCredentialA, hostKeyA],
    );
    await client.query(
      `insert into platform_signing_keys
         (id, key_id, public_key, fingerprint, status)
       values ($1, 'adr-platform-key', decode(repeat('44', 32), 'hex'), 'adr-platform-key-fingerprint', 'active')`,
      [platformKey],
    );
    await client.query(
      `insert into evidence_events
         (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at, canonical_event, canonical_sha256, signature)
       values
         ($1, $2, $3, 'host_agent', 'host_heartbeat', 1, now(), '{}'::jsonb, decode(repeat('55', 32), 'hex'), decode(repeat('66', 64), 'hex'))`,
      [testEvent, incidentA, hostKeyA],
    );
    await client.query(
      `insert into probe_jobs (id, incident_id, host_id, scheduled_at, status)
       values ($1, $2, $3, now(), 'pending')`,
      [testProbeJob, incidentA, hostA],
    );
    await client.query(
      `insert into evidence_bundles
         (id, incident_id, owner_user_id, bundle_version, rule_version, platform_key_id, manifest, manifest_sha256, platform_signature, byte_length)
       values ($1, $2, $3, '1.0', 'adr-test', $4, '{}'::jsonb, decode(repeat('77', 32), 'hex'), decode(repeat('88', 64), 'hex'), 10)`,
      [testBundle, incidentA, userA, platformKey],
    );
    await client.query(
      `insert into audit_events
         (id, actor_type, owner_user_id, resource_type, resource_id, action, result, request_id, metadata)
       values ($1, 'provider', $2, 'adr_test', $3, 'adr_test', 'success', $4, '{}'::jsonb)`,
      [testAudit, userA, incidentA, testRequest],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
});

afterAll(async () => {
  if (migrator) {
    const client = await migrator.connect();
    try {
      await cleanup(client);
    } finally {
      client.release();
      await migrator.end();
    }
  }
  await api?.end();
  await worker?.end();
});

describe("ADR-001 staging integration tests", () => {
  it("T01: uses real restricted login roles", async () => {
    const result = await migrator.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>(
      `select rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
         from pg_roles
        where rolname in ('iw_api', 'iw_worker')
        order by rolname`,
    );

    expect(result.rows).toHaveLength(2);
    for (const role of result.rows) {
      expect(role).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcanlogin: true,
        rolcreatedb: false,
        rolcreaterole: false,
      });
    }
  });

  it("T02: enforces the grant matrix rather than relying on RLS alone", async () => {
    const apiGrants = await migrator.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
         from information_schema.table_privileges
        where grantee = 'iw_api' and table_schema = 'public'`,
    );
    const apiPrivileges = new Set(apiGrants.rows.map((row) => `${row.table_name}:${row.privilege_type}`));

    expect(apiPrivileges.has("profiles:SELECT")).toBe(true);
    expect(apiPrivileges.has("hosts:SELECT")).toBe(true);
    expect(apiPrivileges.has("evidence_events:SELECT")).toBe(true);
    expect(apiPrivileges.has("evidence_events:UPDATE")).toBe(false);
    expect(apiPrivileges.has("evidence_events:DELETE")).toBe(false);
    expect(apiPrivileges.has("evidence_bundles:UPDATE")).toBe(false);
    expect(apiPrivileges.has("evidence_bundles:DELETE")).toBe(false);

    const publicRolePrivileges = await migrator.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.table_privileges
        where grantee in ('anon', 'authenticated') and table_schema = 'public'`,
    );
    expect(publicRolePrivileges.rows[0]?.count).toBe("0");
  });

  it("T03: sets transaction-local JWT identity for provider access", async () => {
    const result = await withProviderTransaction(api, userA, async ({ client }) => {
      const identity = await client.query<{ uid: string }>("select public.iw_uid() as uid");
      const hostCount = await client.query<{ count: string }>(
        "select count(*)::text as count from hosts where id = $1",
        [hostA],
      );
      const otherCount = await client.query<{ count: string }>(
        "select count(*)::text as count from hosts where id = $1",
        [hostB],
      );

      return {
        uid: identity.rows[0]?.uid,
        hostCount: hostCount.rows[0]?.count,
        otherCount: otherCount.rows[0]?.count,
      };
    });

    expect(result).toEqual({ uid: userA, hostCount: "1", otherCount: "0" });
  });

  it("T04: does not leak transaction identity across pool reuse", async () => {
    const reusePool = new Pool({
      connectionString: requireEnvironment("DATABASE_URL_IW_API"),
      max: 1,
    });

    try {
      await withProviderTransaction(reusePool, userA, async ({ client }) => {
        await client.query("select 1");
      });

      const client = await reusePool.connect();
      try {
        const result = await client.query<{
          subject: string | null;
          uid: string | null;
          hostCount: string;
        }>(
          `select nullif(current_setting('request.jwt.claim.sub', true), '') as subject,
                  public.iw_uid() as uid,
                  (select count(*)::text from hosts) as "hostCount"`,
        );
        expect(result.rows[0]?.subject).toBeNull();
        expect(result.rows[0]?.uid).toBeNull();
        expect(result.rows[0]?.hostCount).toBe("0");
      } finally {
        client.release();
      }
    } finally {
      await reusePool.end();
    }
  });

  it("T05: rolls back identity and writes after an error", async () => {
    await expect(
      withProviderTransaction(api, userA, async ({ client }) => {
        await client.query("update hosts set alias = 'should-not-persist' where id = $1", [hostA]);
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");

    const result = await migrator.query<{ alias: string }>("select alias from hosts where id = $1", [
      hostA,
    ]);
    expect(result.rows[0]?.alias).toBe("adr-host-a");

    const leak = await api.query<{ count: string }>("select count(*)::text as count from hosts");
    expect(leak.rows[0]?.count).toBe("0");
  });

  it("T06: prevents cross-owner reads and updates at the database layer", async () => {
    const result = await withProviderTransaction(api, userA, async ({ client }) => {
      const others = await client.query<{ count: string }>(
        "select count(*)::text as count from hosts where id = $1",
        [hostB],
      );
      const update = await client.query(
        "update hosts set alias = 'unauthorized' where id = $1",
        [hostB],
      );
      return { others: others.rows[0]?.count, updated: update.rowCount };
    });

    expect(result).toEqual({ others: "0", updated: 0 });
  });

  it("T07: targets policies to iw_api and denies missing context", async () => {
    const policies = await migrator.query<{ roles: string[] }>(
      `select roles
         from pg_policies
        where schemaname = 'public' and tablename = 'hosts'`,
    );
    expect(policies.rows.some((row) => row.roles.includes("iw_api"))).toBe(true);
    expect(policies.rows.some((row) => row.roles.includes("authenticated"))).toBe(false);

    const noContext = await api.query<{ count: string }>("select count(*)::text as count from hosts");
    expect(noContext.rows[0]?.count).toBe("0");
  });

  it("T08: permits only scoped machine-ingest inserts", async () => {
    const eventId = randomUUID();
    const result = await withApiTransaction(
      api,
      {
        mode: "machine_ingest",
        gucs: {
          "iw.credential_hash_hex": credentialHex,
          "iw.source_key_id": hostKeyA,
          "iw.incident_id": incidentA,
          "iw.host_id": hostA,
          "iw.source_type": "host_agent",
        },
      },
      async ({ client }) => {
        const credential = await client.query<{ id: string }>(
          "select id from source_credentials where source_key_id = $1",
          [hostKeyA],
        );
        const inserted = await client.query(
          `insert into evidence_events
             (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at, canonical_event, canonical_sha256, signature)
           values ($1, $2, $3, 'host_agent', 'host_heartbeat', 2, now(), '{}'::jsonb, decode(repeat('99', 32), 'hex'), decode(repeat('aa', 64), 'hex'))`,
          [eventId, incidentA, hostKeyA],
        );
        return { credentialId: credential.rows[0]?.id, inserted: inserted.rowCount };
      },
    );

    expect(result).toEqual({ credentialId: sourceCredentialA, inserted: 1 });
  });

  it("T09: constrains worker reads and writes", async () => {
    const workerClient = await worker.connect();
    try {
      const leases = await workerClient.query<{ count: string }>(
        "select count(*)::text as count from probe_jobs where id = $1",
        [testProbeJob],
      );
      const update = await workerClient.query(
        "update probe_jobs set status = 'leased', lease_owner = 'adr-worker', lease_expires_at = now() + interval '30 seconds' where id = $1",
        [testProbeJob],
      );

      expect(leases.rows[0]?.count).toBe("1");
      expect(update.rowCount).toBe(1);

      await expect(workerClient.query("select id from source_credentials limit 1")).rejects.toThrow();
      await expect(workerClient.query("select id from profiles limit 1")).rejects.toThrow();
      await expect(workerClient.query("select id from evidence_bundles limit 1")).rejects.toThrow();
    } finally {
      workerClient.release();
    }
  });

  it("T10: rejects role escalation and bypass attempts", async () => {
    const client = await api.connect();
    try {
      await client.query("begin");
      await expect(client.query("set local role authenticated")).rejects.toThrow();
      await client.query("rollback");

      await expect(client.query("create table iw_escalation_test (id integer)")).rejects.toThrow();
      await client.query("set row_security = off");
      await expect(client.query("select count(*) from hosts")).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it("T11: verifies the session-pooler runtime identity and transaction scoping", async () => {
    const result = await withProviderTransaction(api, userA, async ({ client }) => {
      const identity = await client.query<{ current_user: string; subject: string }>(
        `select current_user, current_setting('request.jwt.claim.sub', true) as subject`,
      );
      return identity.rows[0];
    });

    expect(result?.current_user).toBe("iw_api");
    expect(result?.subject).toBe(userA);
  });

  it("T12: keeps auth.uid() and the restricted-role wrapper aligned", async () => {
    const client = await migrator.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userA]);
      const ownerUid = await client.query<{ uid: string }>("select auth.uid() as uid");
      await client.query("rollback");

      const apiUid = await withProviderTransaction(api, userA, async ({ client: apiClient }) => {
        const result = await apiClient.query<{ uid: string }>("select public.iw_uid() as uid");
        return result.rows[0]?.uid;
      });

      expect(apiUid).toBe(ownerUid.rows[0]?.uid);
    } finally {
      client.release();
    }
  });

  it("T13: leaves evidence and audit records immutable to iw_api", async () => {
    await expect(
      api.query("update evidence_events set event_type = 'tampered' where id = $1", [testEvent]),
    ).rejects.toThrow();
    await expect(api.query("delete from evidence_events where id = $1", [testEvent])).rejects.toThrow();
    await expect(
      api.query("update evidence_bundles set bundle_version = '2.0' where id = $1", [testBundle]),
    ).rejects.toThrow();
    await expect(
      api.query("delete from audit_events where request_id = $1", [testRequest]),
    ).rejects.toThrow();
  });

  it("T14: rolls back an event when the transaction fails", async () => {
    const eventId = randomUUID();
    const before = await migrator.query<{ count: string }>(
      "select count(*)::text as count from evidence_events where incident_id = $1",
      [incidentA],
    );

    await expect(
      withApiTransaction(
        api,
        {
          mode: "machine_ingest",
          gucs: {
            "iw.credential_hash_hex": credentialHex,
            "iw.source_key_id": hostKeyA,
            "iw.incident_id": incidentA,
            "iw.host_id": hostA,
          },
        },
        async ({ client }) => {
          await client.query(
            `insert into evidence_events
               (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at, canonical_event, canonical_sha256, signature)
             values ($1, $2, $3, 'host_agent', 'host_heartbeat', 100, now(), '{}'::jsonb, decode(repeat('bb', 32), 'hex'), decode(repeat('cc', 64), 'hex'))`,
            [eventId, incidentA, hostKeyA],
          );
          throw new Error("intentional transaction failure");
        },
      ),
    ).rejects.toThrow("intentional transaction failure");

    const after = await migrator.query<{ count: string }>(
      "select count(*)::text as count from evidence_events where incident_id = $1",
      [incidentA],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
