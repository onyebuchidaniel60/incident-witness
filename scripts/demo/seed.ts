/**
 * Seeds a disposable, clearly labelled demo incident in the configured
 * staging database through the local E2E API.
 *
 * This script is demo/test tooling only. It uses the gated E2E auth seam and
 * never runs against production configuration.
 */
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject,
} from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonBytes, type EventBody } from "@incident-witness/protocol";
import {
  createSourceKeyCertificate,
  publicKeyFingerprint,
  sha256Base64Url,
  signEvent,
} from "@incident-witness/protocol/node";
import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const ASSETS_DIR = resolve(SCRIPT_DIR, "assets");
const STATE_FILE = resolve(SCRIPT_DIR, "demo-state.json");

loadEnv({ path: resolve(REPO_ROOT, ".env"), quiet: true });

const API_URL = process.env.IW_DEMO_API_URL ?? "http://127.0.0.1:4110";
const TOKEN = process.env.IW_E2E_TOKEN ?? "demo-provider-token";
const DEFAULT_DEMO_USER_ID = "d4444444-4444-4444-8444-444444444444";
const USER_ID = process.env.IW_E2E_USER_ID ?? DEFAULT_DEMO_USER_ID;
const DNS_FILE = process.env.IW_E2E_DNS_FILE ?? "/tmp/opencode/iw-demo-dns.json";
const CONTENT_TYPE = "application/vnd.incident-witness.event+json";
const PRESENCE_CONTENT_TYPE = "application/vnd.incident-witness.presence+json";
const DEMO_TITLE = "Simulated power interruption — demo";

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed must not run in production");
}
if (USER_ID !== DEFAULT_DEMO_USER_ID && process.env.IW_DEMO_ALLOW_CUSTOM_USER !== "true") {
  throw new Error("Refusing to use a custom demo user id without IW_DEMO_ALLOW_CUSTOM_USER=true");
}

type ApiResponse<T> = { data: T };

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  contentType?: string;
  idempotencyKey?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? TOKEN}`;
  if (options.contentType) headers["content-type"] = options.contentType;
  else if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.contentType
          ? new Uint8Array(options.body as Buffer)
          : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const parsed = (await response.json()) as { error?: { code?: string; message?: string } };
      detail = `${parsed.error?.code ?? ""} ${parsed.error?.message ?? ""}`.trim();
    } catch {
      // Keep the status as the safe failure detail.
    }
    throw new Error(`API ${path} failed with ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  return ((await response.json()) as ApiResponse<T>).data;
}

function migratorPool(): Pool {
  const connectionString = process.env.DATABASE_URL_MIGRATOR;
  if (!connectionString) {
    throw new Error("DATABASE_URL_MIGRATOR is required for the demo seed");
  }
  return new Pool({ connectionString, max: 2, application_name: "iw-demo-seed" });
}

function platformPrivateKey() {
  const encoded = process.env.IW_PLATFORM_SIGNING_PRIVATE_KEY;
  if (!encoded) throw new Error("IW_PLATFORM_SIGNING_PRIVATE_KEY is required for the demo seed");
  return createPrivateKey({
    key: Buffer.from(encoded, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

function publicKeyBase64Url(key: KeyObject): string {
  const jwk = key.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("generated demo key has no public component");
  return jwk.x;
}

async function writeDnsRecord(input: {
  hostname: string;
  recordName: string;
  value: string;
}): Promise<void> {
  await mkdir(dirname(DNS_FILE), { recursive: true });
  await writeFile(
    DNS_FILE,
    JSON.stringify({
      txt: { [input.recordName]: [input.value] },
      addresses: { [input.hostname]: [{ address: "93.184.216.34", family: 4 }] },
    }),
    "utf8",
  );
}

async function enrollDemoHost(hostId: string, enrollmentCode: string) {
  const pair = generateKeyPairSync("ed25519");
  const enrollment = await request<{ sourceKeyId: string; deviceCredential: string }>(
    "/v1/agent/enroll",
    {
      method: "POST",
      token: null,
      body: {
        enrollmentCode,
        publicKey: publicKeyBase64Url(pair.publicKey),
        agentVersion: "0.1.0-demo",
        requestId: randomUUID(),
      },
    },
  );

  const unsigned = {
    hostId,
    observedAt: new Date().toISOString(),
    heartbeatSequence: 1,
    agentVersion: "0.1.0-demo",
  };
  const signature = sign(
    null,
    Buffer.concat([
      Buffer.from("incident-witness-host-presence-v1\n", "utf8"),
      Buffer.from(canonicalJsonBytes(unsigned)),
    ]),
    pair.privateKey,
  ).toString("base64url");

  const response = await fetch(`${API_URL}/v1/agent/heartbeat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${enrollment.deviceCredential}`,
      "content-type": PRESENCE_CONTENT_TYPE,
    },
    body: Buffer.from(canonicalJsonBytes({ ...unsigned, signature })),
  });
  if (!response.ok) {
    throw new Error(`demo presence failed with HTTP ${response.status}`);
  }

  return {
    sourceKeyId: enrollment.sourceKeyId,
    credential: enrollment.deviceCredential,
    privateKey: pair.privateKey,
  };
}

async function sendSignedEvent(input: {
  path: "/v1/agent/events" | "/v1/renter/events";
  credential: string;
  incidentId: string;
  sourceKeyId: string;
  sourceType: "host_agent" | "renter_client";
  eventType: string;
  sequence: number;
  observedAt: string;
  payload: Record<string, unknown>;
  privateKey: KeyObject;
}): Promise<void> {
  const body = {
    protocol_version: "1.0",
    event_id: randomUUID(),
    incident_id: input.incidentId,
    source_key_id: input.sourceKeyId,
    source_type: input.sourceType,
    event_type: input.eventType,
    sequence: input.sequence,
    observed_at: input.observedAt,
    payload: input.payload,
    simulation_mode: true,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  } as EventBody;
  const envelope = signEvent(body, input.privateKey);
  const response = await fetch(`${API_URL}${input.path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.credential}`,
      "content-type": CONTENT_TYPE,
    },
    body: Buffer.from(canonicalJsonBytes(envelope)),
  });
  if (!response.ok) {
    throw new Error(
      `demo event ${input.eventType} failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
}

async function addPlatformProbeEvent(input: {
  client: PoolClient;
  incidentId: string;
  hostId: string;
  observedAt: string;
}) {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = publicKeyBase64Url(pair.publicKey);
  const keyId = randomUUID();
  const certificate = createSourceKeyCertificate(
    {
      certificate_version: "1.0",
      source_key_id: keyId,
      source_type: "platform_probe",
      public_key: publicKey,
      fingerprint: publicKeyFingerprint(publicKey),
      issued_at: new Date().toISOString(),
      protocol_version: "1.0",
    },
    platformPrivateKey(),
  );

  await input.client.query(
    `insert into witness_keys
       (id, owner_user_id, host_id, incident_id, source_type, public_key, fingerprint,
        status, certificate_json, certificate_signature)
     values ($1, null, null, null, 'platform_probe', $2, $3, 'active', $4::jsonb, $5)`,
    [
      keyId,
      Buffer.from(publicKey, "base64url"),
      publicKeyFingerprint(publicKey),
      JSON.stringify(certificate.certificate),
      Buffer.from(certificate.signature, "base64url"),
    ],
  );

  const body: EventBody = {
    protocol_version: "1.0",
    event_id: randomUUID(),
    incident_id: input.incidentId,
    source_key_id: keyId,
    source_type: "platform_probe",
    event_type: "platform_probe_result",
    sequence: 1,
    observed_at: input.observedAt,
    payload: {
      target_host_id: input.hostId,
      probe_status: "failed",
      dns_result: "resolved",
      tls_result: "valid",
      http_result: "timeout",
      latency_ms: 3_000,
      response_class: "unavailable",
      observed_ip_class: "public",
    },
    simulation_mode: true,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  };
  const event = signEvent(body, pair.privateKey);
  const { signature, ...signedBody } = event;
  const receivedAt = new Date();
  const eventSha256 = sha256Base64Url(canonicalJsonBytes(signedBody));
  const canonicalEntry = canonicalJsonBytes({
    event,
    received_at: receivedAt.toISOString(),
    event_sha256: eventSha256,
  });
  const canonicalDigest = createHash("sha256").update(canonicalJsonBytes(signedBody)).digest();

  await input.client.query(
    `insert into evidence_events
       (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at,
        received_at, canonical_event, canonical_sha256, signature, simulation_mode,
        validation_status)
     values ($1, $2, $3, 'platform_probe', 'platform_probe_result', 1, $4, $5, $6::jsonb, $7, $8, true, 'accepted')`,
    [
      event.event_id,
      input.incidentId,
      keyId,
      new Date(input.observedAt),
      receivedAt,
      JSON.stringify(signedBody),
      canonicalDigest,
      Buffer.from(signature, "base64url"),
    ],
  );
  await input.client.query(
    `update incidents
        set accepted_event_count = accepted_event_count + 1,
            accepted_event_bytes = accepted_event_bytes + $1::bigint
      where id = $2`,
    [canonicalEntry.length + 1, input.incidentId],
  );

  return keyId;
}

export async function cleanupDemoData(): Promise<void> {
  const pool = migratorPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const incidents = "select id from incidents where owner_user_id = $1";
    const sourceKeyRows = await client.query<{ source_key_id: string }>(
      `select distinct source_key_id
         from evidence_events
        where incident_id in (${incidents})`,
      [USER_ID],
    );
    const sourceKeyIds = sourceKeyRows.rows.map((row) => row.source_key_id);
    await client.query(`delete from evidence_events where incident_id in (${incidents})`, [
      USER_ID,
    ]);
    await client.query(`delete from evidence_bundles where incident_id in (${incidents})`, [
      USER_ID,
    ]);
    await client.query(`delete from probe_jobs where incident_id in (${incidents})`, [USER_ID]);
    await client.query(
      `delete from source_credentials
        where source_key_id in (
          select id from witness_keys
           where owner_user_id = $1 or id = any($2::uuid[])
        )`,
      [USER_ID, sourceKeyIds],
    );
    await client.query(`delete from enrollment_tokens where owner_user_id = $1`, [USER_ID]);
    await client.query(`delete from renter_invitations where owner_user_id = $1`, [USER_ID]);
    await client.query(`delete from host_endpoint_challenges where owner_user_id = $1`, [USER_ID]);
    await client.query(
      `delete from witness_keys
        where owner_user_id = $1 or id = any($2::uuid[])`,
      [USER_ID, sourceKeyIds],
    );
    await client.query(`delete from incidents where owner_user_id = $1`, [USER_ID]);
    await client.query(`delete from hosts where owner_user_id = $1`, [USER_ID]);
    await client.query(`delete from idempotency_records where owner_user_id = $1`, [USER_ID]);
    await client.query(`delete from audit_events where owner_user_id = $1`, [USER_ID]);
    await client.query(`delete from profiles where id = $1`, [USER_ID]);
    await client.query(`delete from auth.users where id = $1`, [USER_ID]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function seedDemoData(): Promise<{
  hostId: string;
  incidentId: string;
  bundlePath: string;
}> {
  await mkdir(ASSETS_DIR, { recursive: true });
  await cleanupDemoData();

  const pool = migratorPool();
  const seedClient = await pool.connect();
  try {
    await seedClient.query(
      `insert into auth.users
         (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [USER_ID, "iw-demo-video@example.invalid"],
    );
    await seedClient.query(`insert into profiles (id, display_name) values ($1, 'Demo provider')`, [
      USER_ID,
    ]);
  } finally {
    seedClient.release();
    await pool.end();
  }

  const suffix = `${Date.now()}`.slice(-7);
  const hostname = `demo-${suffix}.incident-witness.dev`;
  const host = await request<{ hostId: string }>("/v1/hosts", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: { alias: "Simulated GPU host", hostname },
  });
  const hostId = host.hostId;

  const challenge = await request<{
    challengeId: string;
    dnsRecordName: string;
    dnsRecordValue: string;
  }>(`/v1/hosts/${hostId}/endpoint-challenge`, { method: "POST" });
  await writeDnsRecord({
    hostname,
    recordName: challenge.dnsRecordName,
    value: challenge.dnsRecordValue,
  });
  await request(`/v1/hosts/${hostId}/endpoint-verify`, {
    method: "POST",
    body: { challengeId: challenge.challengeId },
  });

  const enrollment = await request<{ enrollmentCode: string }>(
    `/v1/hosts/${hostId}/enrollment-codes`,
    { method: "POST" },
  );
  const hostAgent = await enrollDemoHost(hostId, enrollment.enrollmentCode);

  const incident = await request<{
    incidentId: string;
    captureStartedAt: string;
    captureEndsAt: string;
  }>("/v1/incidents", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {
      hostId,
      title: DEMO_TITLE,
      durationMinutes: 30,
      workloadRef: "synthetic-demo-workload",
      demoMode: true,
    },
  });
  const incidentId = incident.incidentId;
  const captureStart = Date.parse(incident.captureStartedAt);
  const at = (offsetMs: number) => new Date(captureStart + offsetMs).toISOString();

  await sendSignedEvent({
    path: "/v1/agent/events",
    credential: hostAgent.credential,
    incidentId,
    sourceKeyId: hostAgent.sourceKeyId,
    sourceType: "host_agent",
    eventType: "host_heartbeat",
    sequence: 1,
    observedAt: at(1_000),
    payload: {
      agent_version: "0.1.0-demo",
      os_family: "linux",
      os_version: "synthetic-demo",
      uptime_seconds: 86_400,
      agent_health: "ok",
    },
    privateKey: hostAgent.privateKey,
  });
  await sendSignedEvent({
    path: "/v1/agent/events",
    credential: hostAgent.credential,
    incidentId,
    sourceKeyId: hostAgent.sourceKeyId,
    sourceType: "host_agent",
    eventType: "host_power_state",
    sequence: 2,
    observedAt: at(2_000),
    payload: {
      ups_alias: "simulated-ups",
      state: "on_battery",
      charge_percent: 84,
      runtime_seconds: 240,
    },
    privateKey: hostAgent.privateKey,
  });
  await sendSignedEvent({
    path: "/v1/agent/events",
    credential: hostAgent.credential,
    incidentId,
    sourceKeyId: hostAgent.sourceKeyId,
    sourceType: "host_agent",
    eventType: "gpu_telemetry",
    sequence: 3,
    observedAt: at(2_500),
    payload: { collection_status: "unavailable" },
    privateKey: hostAgent.privateKey,
  });

  const invitation = await request<{ invitationToken: string }>(
    `/v1/incidents/${incidentId}/renter-invitations`,
    { method: "POST" },
  );
  const renterPair = generateKeyPairSync("ed25519");
  const renter = await request<{ sourceKeyId: string; ingestionCredential: string }>(
    "/v1/renter/enroll",
    {
      method: "POST",
      token: null,
      body: {
        invitationToken: invitation.invitationToken,
        publicKey: publicKeyBase64Url(renterPair.publicKey),
        requestId: randomUUID(),
        sdkVersion: "0.1.0-demo",
      },
    },
  );

  await sendSignedEvent({
    path: "/v1/renter/events",
    credential: renter.ingestionCredential,
    incidentId,
    sourceKeyId: renter.sourceKeyId,
    sourceType: "renter_client",
    eventType: "renter_heartbeat",
    sequence: 1,
    observedAt: at(3_000),
    payload: {
      sdk_version: "0.1.0-demo",
      workload_ref: "synthetic-demo-workload",
      client_state: "running",
    },
    privateKey: renterPair.privateKey,
  });
  await sendSignedEvent({
    path: "/v1/renter/events",
    credential: renter.ingestionCredential,
    incidentId,
    sourceKeyId: renter.sourceKeyId,
    sourceType: "renter_client",
    eventType: "renter_endpoint_result",
    sequence: 2,
    observedAt: at(4_000),
    payload: { result: "unreachable", latency_ms: 3_000, failure_category: "timeout" },
    privateKey: renterPair.privateKey,
  });

  const dbPool = migratorPool();
  const dbClient = await dbPool.connect();
  try {
    await addPlatformProbeEvent({
      client: dbClient,
      incidentId,
      hostId,
      observedAt: at(5_000),
    });
  } finally {
    dbClient.release();
    await dbPool.end();
  }

  await request(`/v1/incidents/${incidentId}/end`, { method: "POST" });
  const seal = await request<{
    assessment?: { code?: string; evidenceGrade?: string };
    evidenceGrade?: string;
  }>(`/v1/incidents/${incidentId}/seal`, { method: "POST" });

  const bundleResponse = await fetch(`${API_URL}/v1/incidents/${incidentId}/bundle`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (!bundleResponse.ok) {
    throw new Error(`demo bundle download failed with HTTP ${bundleResponse.status}`);
  }
  const bundlePath = resolve(ASSETS_DIR, "demo-bundle.json");
  await writeFile(bundlePath, Buffer.from(await bundleResponse.arrayBuffer()));

  await writeFile(
    STATE_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        hostId,
        hostname,
        incidentId,
        incidentTitle: DEMO_TITLE,
        bundlePath,
        assessment: seal.assessment ?? null,
        evidenceGrade: seal.evidenceGrade ?? null,
      },
      null,
      2,
    ),
    "utf8",
  );

  return { hostId, incidentId, bundlePath };
}

async function main(): Promise<void> {
  const cleanup = process.argv.includes("--cleanup");
  if (cleanup) {
    await cleanupDemoData();
    console.log("Demo staging data removed.");
    return;
  }

  const result = await seedDemoData();
  console.log(`Seeded demo incident ${result.incidentId}`);
  console.log(`Bundle ready at ${result.bundlePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
