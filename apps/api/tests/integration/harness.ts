import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject,
} from "node:crypto";

import { canonicalJsonBytes } from "@incident-witness/protocol";
import { createApiPool, loadEnvironment, requireEnvironment } from "@incident-witness/db";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import type { JwtVerifier } from "../../src/auth/jwt.js";
import type { ResolvedAddress } from "../../src/domain/ip.js";
import type { DnsResolver } from "../../src/services/dns.js";
import type { EndpointCheckResult, EndpointChecker } from "../../src/services/endpoint.js";

loadEnvironment();

export const userA = "c1111111-1111-4111-8111-111111111111";
export const userB = "d2222222-2222-4222-8222-222222222222";
export const tokenA = "integration-user-a";
export const tokenB = "integration-user-b";

export const testUsers = [userA, userB];

export class FakeDnsResolver implements DnsResolver {
  txt = new Map<string, string[][]>();
  addresses = new Map<string, ResolvedAddress[]>();

  async resolveTxt(name: string): Promise<string[][]> {
    const value = this.txt.get(name);
    if (!value) {
      const error = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      throw error;
    }
    return value;
  }

  async lookup(name: string): Promise<ResolvedAddress[]> {
    const value = this.addresses.get(name);
    if (!value) {
      const error = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      throw error;
    }
    return value;
  }
}

export class FakeEndpointChecker implements EndpointChecker {
  result: EndpointCheckResult = { ok: true };
  calls: Array<{ hostname: string; address: string; family: number }> = [];

  async check(
    hostname: string,
    pinnedAddress: { address: string; family: number },
  ): Promise<EndpointCheckResult> {
    this.calls.push({
      hostname,
      address: pinnedAddress.address,
      family: pinnedAddress.family,
    });
    return this.result;
  }
}

export const dns = new FakeDnsResolver();
export const endpointChecker = new FakeEndpointChecker();

export let app: Awaited<ReturnType<typeof buildApp>>;
export let migrator: Pool;
export let apiPool: Pool;
export let platformPrivateKey: KeyObject;
export let platformPublicKey: KeyObject;
export let appConfig: AppConfig;

const jwtVerifier: JwtVerifier = async (token) => {
  const id = token === tokenA ? userA : token === tokenB ? userB : null;
  if (!id) throw new Error("invalid token");
  return {
    id,
    claims: {
      sub: id,
      iss: "https://integration.example.invalid/auth/v1",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  };
};

function testConfig(): AppConfig {
  return {
    nodeEnv: "test",
    port: 0,
    appBaseUrl: "http://localhost:3000",
    apiBaseUrl: "http://localhost:4000",
    supabaseUrl: "https://integration.example.invalid",
    supabaseJwksUrl: "https://integration.example.invalid/auth/v1/.well-known/jwks.json",
    supabaseJwtIssuer: "https://integration.example.invalid/auth/v1",
    databaseUrlIwApi: requireEnvironment("DATABASE_URL_IW_API"),
    tokenPepper: requireEnvironment("IW_TOKEN_PEPPER"),
    platformSigningKey: platformPrivateKey,
    platformKeyId: "integration-platform-key",
    allowedWebOrigins: new Set(["http://localhost:3000"]),
    healthcheckToken: "integration-health-token-1234567890",
    logLevel: "silent",
    enableDemoSessions: false,
  };
}

export async function cleanupData(): Promise<void> {
  const client = await migrator.connect();
  try {
    await client.query("begin");
    const incidents = `select id from incidents where owner_user_id = any($1::uuid[])`;
    await client.query(
      `delete from evidence_events where incident_id in (${incidents})`,
      [testUsers],
    );
    await client.query(
      `delete from evidence_bundles where incident_id in (${incidents})`,
      [testUsers],
    );
    await client.query(
      `delete from probe_jobs where incident_id in (${incidents})`,
      [testUsers],
    );
    await client.query(
      `delete from source_credentials
        where source_key_id in (
          select id from witness_keys
           where owner_user_id = any($1::uuid[])
              or incident_id in (${incidents})
        )`,
      [testUsers],
    );
    await client.query(`delete from enrollment_tokens where owner_user_id = any($1::uuid[])`, [
      testUsers,
    ]);
    await client.query(`delete from renter_invitations where owner_user_id = any($1::uuid[])`, [
      testUsers,
    ]);
    await client.query(
      `delete from host_endpoint_challenges where owner_user_id = any($1::uuid[])`,
      [testUsers],
    );
    await client.query(
      `delete from witness_keys
        where owner_user_id = any($1::uuid[])
           or incident_id in (${incidents})`,
      [testUsers],
    );
    await client.query(`delete from incidents where owner_user_id = any($1::uuid[])`, [testUsers]);
    await client.query(`delete from hosts where owner_user_id = any($1::uuid[])`, [testUsers]);
    await client.query(`delete from idempotency_records where owner_user_id = any($1::uuid[])`, [
      testUsers,
    ]);
    await client.query(`delete from audit_events where owner_user_id = any($1::uuid[])`, [
      testUsers,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedUsers(): Promise<void> {
  const client = await migrator.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into auth.users
         (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values
         ($1, 'authenticated', 'authenticated', 'iw-phase3b-a@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
         ($2, 'authenticated', 'authenticated', 'iw-phase3b-b@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
       on conflict (id) do nothing`,
      [userA, userB],
    );
    await client.query(
      `insert into profiles (id, display_name)
       values ($1, 'Phase 3B User A'), ($2, 'Phase 3B User B')
       on conflict (id) do nothing`,
      [userA, userB],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedActiveHost(input: {
  ownerUserId: string;
  alias: string;
  hostname: string;
  lastSeenAt?: Date;
}): Promise<string> {
  const id = randomUUID();
  await migrator.query(
    `insert into hosts
       (id, owner_user_id, alias, endpoint_hostname, endpoint_verified_at, status, last_agent_seen_at)
     values ($1, $2, $3, $4, now(), 'active', $5)`,
    [id, input.ownerUserId, input.alias, input.hostname, input.lastSeenAt ?? new Date()],
  );
  return id;
}

export async function inject(
  method: "GET" | "POST" | "PATCH",
  url: string,
  token: string | null,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    payload: payload as string | object | Buffer | undefined,
  });
}

export function idempotencyHeaders(key: string = randomUUID()): Record<string, string> {
  return { "idempotency-key": key };
}

export function publicKeyBase64Url(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("missing raw public key");
  return jwk.x;
}

export function presenceBody(input: {
  hostId: string;
  sequence: number;
  observedAt?: string;
  agentVersion?: string;
  privateKey: KeyObject;
  signatureOverride?: string;
}): Buffer {
  const unsigned = {
    hostId: input.hostId,
    observedAt: input.observedAt ?? new Date().toISOString(),
    heartbeatSequence: input.sequence,
    agentVersion: input.agentVersion ?? "0.1.0-test",
  };
  const signature =
    input.signatureOverride ??
    sign(
      null,
      Buffer.concat([
        Buffer.from("incident-witness-host-presence-v1\n", "utf8"),
        Buffer.from(canonicalJsonBytes(unsigned)),
      ]),
      input.privateKey,
    ).toString("base64url");

  return Buffer.from(
    canonicalJsonBytes({
      ...unsigned,
      signature,
    }),
  );
}

export async function setupIntegration(): Promise<void> {
  migrator = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 4,
    application_name: "phase3b-integration-migrator",
  });
  apiPool = createApiPool();

  await seedUsers();
  await cleanupData();

  const pair = generateKeyPairSync("ed25519");
  platformPrivateKey = pair.privateKey;
  platformPublicKey = pair.publicKey;

  const rawPublicKey = createPublicKey(platformPrivateKey).export({ format: "jwk" }) as {
    x?: string;
  };
  if (!rawPublicKey.x) throw new Error("test platform key has no raw public key");
  const platformPublicKeyBytes = Buffer.from(rawPublicKey.x, "base64url");
  const platformFingerprint = createHash("sha256")
    .update(platformPublicKeyBytes)
    .digest("base64url");
  await migrator.query(
    `insert into platform_signing_keys
       (key_id, public_key, fingerprint, algorithm, status, not_before)
     values ('integration-platform-key', $1, $2, 'Ed25519', 'active', now())
     on conflict (key_id) do update
       set public_key = excluded.public_key,
           fingerprint = excluded.fingerprint,
           status = 'active'`,
    [platformPublicKeyBytes, platformFingerprint],
  );

  appConfig = testConfig();
  app = await buildApp({
    config: appConfig,
    apiPool,
    jwtVerifier,
    dnsResolver: dns,
    endpointChecker,
    enableSweeper: false,
    logger: false,
  });
}

export async function teardownIntegration(): Promise<void> {
  await app?.close();
  await cleanupData();
  const client = await migrator.connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from platform_signing_keys where key_id = 'integration-platform-key'`,
    );
    await client.query(`delete from profiles where id = any($1::uuid[])`, [testUsers]);
    await client.query(`delete from auth.users where id = any($1::uuid[])`, [testUsers]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await migrator.end();
  }
  await apiPool?.end();
}

export function registerIntegrationHooks(): void {
  beforeAll(async () => {
    await setupIntegration();
  });

  beforeEach(async () => {
    dns.txt.clear();
    dns.addresses.clear();
    endpointChecker.calls = [];
    endpointChecker.result = { ok: true };
    await cleanupData();
  });

  afterAll(async () => {
    await teardownIntegration();
  });
}
