import { spawn } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertRuntimeRole, createApiPool, requireEnvironment } from "@incident-witness/db";
import {
  bundleSchema,
  canonicalJsonBytes,
  type Bundle,
  type EventBody,
} from "@incident-witness/protocol";
import { signEvent } from "@incident-witness/protocol/node";
import { Pool } from "pg";

import { buildApp } from "../../../apps/api/src/app.js";
import type { AppConfig } from "../../../apps/api/src/config.js";
import { config as defaultConfig } from "../../../apps/api/src/config.js";
import type { ResolvedAddress } from "../../../apps/api/src/domain/ip.js";
import type { DnsResolver } from "../../../apps/api/src/services/dns.js";
import type {
  EndpointCheckResult,
  EndpointChecker,
} from "../../../apps/api/src/services/endpoint.js";

const DEMO_USER_ID = "e3333333-3333-4333-8333-333333333333";
const DEMO_TOKEN = "phase3f-demo-provider-token";
const EVENT_CONTENT_TYPE = "application/vnd.incident-witness.event+json";
const PRESENCE_CONTENT_TYPE = "application/vnd.incident-witness.presence+json";
const CLI_PATH = fileURLToPath(new URL("../../iw-verify/dist/cli.js", import.meta.url));

export type CliRun = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type DemoResult = {
  artifactDirectory: string;
  bundlePath: string;
  tamperedBundlePath: string;
  hostId: string;
  incidentId: string;
  assessment: string;
  evidenceGrade: string;
  simulationPresent: boolean;
  eventCount: number;
  validRun: CliRun;
  tamperedRun: CliRun;
};

export type DemoOptions = {
  outputDirectory?: string;
  keepArtifacts?: boolean;
  keepData?: boolean;
  log?: (line: string) => void;
};

class FakeDnsResolver implements DnsResolver {
  readonly txt = new Map<string, string[][]>();
  readonly addresses = new Map<string, ResolvedAddress[]>();

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

class FakeEndpointChecker implements EndpointChecker {
  async check(): Promise<EndpointCheckResult> {
    return { ok: true };
  }
}

type ApiResponse = {
  statusCode: number;
  body: string;
  rawPayload: Buffer;
};

function responseData<T>(response: ApiResponse, label: string): T {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    let code = "";
    try {
      const body = JSON.parse(response.body) as { error?: { code?: unknown } };
      if (typeof body.error?.code === "string") code = ` ${body.error.code}`;
    } catch {
      // The status code is sufficient for a safe failure message.
    }
    throw new Error(`${label} failed with HTTP ${response.statusCode}${code}`);
  }

  try {
    return (JSON.parse(response.body) as { data: T }).data;
  } catch {
    throw new Error(`${label} returned an invalid JSON response`);
  }
}

function publicKeyBase64Url(key: KeyObject): string {
  const jwk = key.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("Generated Ed25519 key has no public component");
  return jwk.x;
}

function presenceRequest(input: {
  hostId: string;
  sequence: number;
  privateKey: KeyObject;
  observedAt: string;
  agentVersion: string;
}): Buffer {
  const unsigned = {
    hostId: input.hostId,
    observedAt: input.observedAt,
    heartbeatSequence: input.sequence,
    agentVersion: input.agentVersion,
  };
  const signature = sign(
    null,
    Buffer.concat([
      Buffer.from("incident-witness-host-presence-v1\n", "utf8"),
      Buffer.from(canonicalJsonBytes(unsigned)),
    ]),
    input.privateKey,
  ).toString("base64url");

  return Buffer.from(canonicalJsonBytes({ ...unsigned, signature }));
}

function signedEvent(input: {
  incidentId: string;
  sourceKeyId: string;
  sourceType: "host_agent" | "renter_client";
  eventType: string;
  sequence: number;
  observedAt: string;
  payload: Record<string, unknown>;
  privateKey: KeyObject;
}): Buffer {
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

  return Buffer.from(canonicalJsonBytes(signEvent(body, input.privateKey)));
}

async function cleanupDemoData(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const incidents = `select id from incidents where owner_user_id = $1`;
    await client.query(`delete from evidence_events where incident_id in (${incidents})`, [
      DEMO_USER_ID,
    ]);
    await client.query(`delete from evidence_bundles where incident_id in (${incidents})`, [
      DEMO_USER_ID,
    ]);
    await client.query(`delete from probe_jobs where incident_id in (${incidents})`, [
      DEMO_USER_ID,
    ]);
    await client.query(
      `delete from source_credentials
        where source_key_id in (
          select id from witness_keys
           where owner_user_id = $1
              or incident_id in (${incidents})
        )`,
      [DEMO_USER_ID],
    );
    await client.query(`delete from enrollment_tokens where owner_user_id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from renter_invitations where owner_user_id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from host_endpoint_challenges where owner_user_id = $1`, [
      DEMO_USER_ID,
    ]);
    await client.query(
      `delete from witness_keys
        where owner_user_id = $1
           or incident_id in (${incidents})`,
      [DEMO_USER_ID],
    );
    await client.query(`delete from incidents where owner_user_id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from hosts where owner_user_id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from idempotency_records where owner_user_id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from audit_events where owner_user_id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from profiles where id = $1`, [DEMO_USER_ID]);
    await client.query(`delete from auth.users where id = $1`, [DEMO_USER_ID]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function seedDemoProvider(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into auth.users
         (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), '{}'::jsonb, '{}'::jsonb, now(), now())
       on conflict (id) do nothing`,
      [DEMO_USER_ID, "iw-phase3f-demo@example.invalid"],
    );
    await client.query(
      `insert into profiles (id, display_name)
       values ($1, 'Phase 3F synthetic provider')
       on conflict (id) do update set display_name = excluded.display_name`,
      [DEMO_USER_ID],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function runCli(args: string[]): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

/**
 * Runs a synthetic power-pattern incident end to end against the configured
 * staging database and a locally constructed API instance. No real hardware
 * telemetry is collected or implied. Every event and the sealed manifest are
 * labelled as simulated/demo evidence.
 */
export async function runDemo(options: DemoOptions = {}): Promise<DemoResult> {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const artifactDirectory = options.outputDirectory ?? (await mkdtemp(join(tmpdir(), "iw-demo-")));
  const keepArtifacts = options.keepArtifacts ?? true;
  const bundlePath = join(artifactDirectory, "phase3f-demo-bundle.json");
  const tamperedBundlePath = join(artifactDirectory, "phase3f-demo-bundle-tampered.json");

  const migrator = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 2,
    application_name: "iw-demo-harness-migrator",
  });
  const apiPool = createApiPool();
  const dns = new FakeDnsResolver();
  const endpointChecker = new FakeEndpointChecker();
  const jwtVerifier = async (token: string) => {
    if (token !== DEMO_TOKEN) throw new Error("invalid demo token");
    return {
      id: DEMO_USER_ID,
      claims: {
        sub: DEMO_USER_ID,
        iss: "https://phase3f-demo.invalid/auth/v1",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    };
  };

  let app: Awaited<ReturnType<typeof buildApp>> | null = null;
  try {
    await assertRuntimeRole(apiPool, "iw_api");

    const appConfig: AppConfig = {
      ...defaultConfig,
      nodeEnv: "test",
      logLevel: "silent",
      enableDemoSessions: true,
    };
    app = await buildApp({
      config: appConfig,
      apiPool,
      jwtVerifier,
      dnsResolver: dns,
      endpointChecker,
      enableSweeper: false,
      logger: false,
    });

    const call = async (
      method: "GET" | "POST" | "PATCH",
      url: string,
      input: {
        token?: string;
        payload?: unknown;
        headers?: Record<string, string>;
      } = {},
    ) =>
      app!.inject({
        method,
        url,
        headers: {
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
          ...input.headers,
        },
        payload: input.payload as string | object | Buffer | undefined,
      });

    log("[demo] Phase 3F synthetic incident harness");
    log(
      "[demo] All events are generated locally, marked simulation_mode=true, and are not real hardware telemetry.",
    );
    log("[demo] 1/10 Resetting disposable provider data in the configured staging database");
    await cleanupDemoData(migrator);
    await seedDemoProvider(migrator);

    const suffix = randomUUID().slice(0, 8);
    const hostname = `demo-${suffix}.incident-witness.dev`;
    const alias = `Phase 3F synthetic host ${suffix}`;

    log("[demo] 2/10 Creating provider host and completing synthetic DNS/HTTPS verification");
    const hostResponse = await call("POST", "/v1/hosts", {
      token: DEMO_TOKEN,
      payload: { alias, hostname },
      headers: { "idempotency-key": randomUUID() },
    });
    const hostId = responseData<{ hostId: string }>(hostResponse, "host creation").hostId;

    const challengeResponse = await call("POST", `/v1/hosts/${hostId}/endpoint-challenge`, {
      token: DEMO_TOKEN,
    });
    const challenge = responseData<{
      challengeId: string;
      dnsRecordName: string;
      dnsRecordValue: string;
    }>(challengeResponse, "endpoint challenge");
    dns.txt.set(challenge.dnsRecordName, [[challenge.dnsRecordValue]]);
    dns.addresses.set(hostname, [{ address: "93.184.216.34", family: 4 }]);

    const verifyResponse = await call("POST", `/v1/hosts/${hostId}/endpoint-verify`, {
      token: DEMO_TOKEN,
      payload: { challengeId: challenge.challengeId },
    });
    responseData<{ verified: boolean }>(verifyResponse, "endpoint verification");

    log("[demo] 3/10 Enrolling a simulated host agent with a fresh local Ed25519 key");
    const enrollmentCodeResponse = await call("POST", `/v1/hosts/${hostId}/enrollment-codes`, {
      token: DEMO_TOKEN,
    });
    const enrollmentCode = responseData<{ enrollmentCode: string }>(
      enrollmentCodeResponse,
      "enrollment code",
    ).enrollmentCode;
    const hostKeys = generateKeyPairSync("ed25519");
    const hostEnrollmentResponse = await call("POST", "/v1/agent/enroll", {
      payload: {
        enrollmentCode,
        publicKey: publicKeyBase64Url(hostKeys.publicKey),
        agentVersion: "0.1.0-demo",
        requestId: randomUUID(),
      },
    });
    const hostEnrollment = responseData<{
      sourceKeyId: string;
      deviceCredential: string;
    }>(hostEnrollmentResponse, "host enrollment");

    const presenceResponse = await call("POST", "/v1/agent/heartbeat", {
      payload: presenceRequest({
        hostId,
        sequence: 1,
        privateKey: hostKeys.privateKey,
        observedAt: new Date().toISOString(),
        agentVersion: "0.1.0-demo",
      }),
      headers: {
        authorization: `Bearer ${hostEnrollment.deviceCredential}`,
        "content-type": PRESENCE_CONTENT_TYPE,
      },
    });
    responseData<{ accepted: boolean }>(presenceResponse, "host presence heartbeat");

    log("[demo] 4/10 Creating a labelled demo evidence session");
    const incidentResponse = await call("POST", "/v1/incidents", {
      token: DEMO_TOKEN,
      payload: {
        hostId,
        title: `SIMULATED Phase 3F power-pattern demo ${suffix}`,
        durationMinutes: 2,
        workloadRef: "synthetic-demo-workload",
        demoMode: true,
      },
      headers: { "idempotency-key": randomUUID() },
    });
    const incident = responseData<{
      incidentId: string;
      captureStartedAt: string;
    }>(incidentResponse, "incident creation");

    log("[demo] 5/10 Enrolling a simulated renter client key through the invitation contract");
    const invitationResponse = await call(
      "POST",
      `/v1/incidents/${incident.incidentId}/renter-invitations`,
      { token: DEMO_TOKEN },
    );
    const invitationToken = responseData<{ invitationToken: string }>(
      invitationResponse,
      "renter invitation",
    ).invitationToken;
    const renterKeys = generateKeyPairSync("ed25519");
    const renterEnrollmentResponse = await call("POST", "/v1/renter/enroll", {
      payload: {
        invitationToken,
        publicKey: publicKeyBase64Url(renterKeys.publicKey),
        requestId: randomUUID(),
        sdkVersion: "0.1.0-demo",
      },
    });
    const renterEnrollment = responseData<{
      sourceKeyId: string;
      ingestionCredential: string;
    }>(renterEnrollmentResponse, "renter enrollment");

    log("[demo] 6/10 Generating and ingesting signed synthetic power/reachability events");
    const captureStart = Date.parse(incident.captureStartedAt);
    const at = (offsetMs: number) => new Date(captureStart + offsetMs).toISOString();

    const hostEvents = [
      {
        eventType: "host_heartbeat",
        sequence: 1,
        observedAt: at(1_000),
        payload: {
          agent_version: "0.1.0-demo",
          os_family: "linux",
          os_version: "synthetic",
          uptime_seconds: 600,
          agent_health: "ok",
        },
      },
      {
        eventType: "host_power_state",
        sequence: 2,
        observedAt: at(1_200),
        payload: {
          ups_alias: "simulated-ups",
          state: "on_battery",
          charge_percent: 88,
          runtime_seconds: 300,
        },
      },
    ];

    for (const event of hostEvents) {
      const response = await call("POST", "/v1/agent/events", {
        payload: signedEvent({
          incidentId: incident.incidentId,
          sourceKeyId: hostEnrollment.sourceKeyId,
          sourceType: "host_agent",
          eventType: event.eventType,
          sequence: event.sequence,
          observedAt: event.observedAt,
          payload: event.payload,
          privateKey: hostKeys.privateKey,
        }),
        headers: {
          authorization: `Bearer ${hostEnrollment.deviceCredential}`,
          "content-type": EVENT_CONTENT_TYPE,
        },
      });
      responseData<{ accepted: boolean }>(response, `host event ${event.eventType}`);
    }

    const renterEvents = [
      {
        eventType: "renter_heartbeat",
        sequence: 1,
        observedAt: at(1_000),
        payload: {
          sdk_version: "0.1.0-demo",
          workload_ref: "synthetic-demo-workload",
          client_state: "running",
        },
      },
      {
        eventType: "renter_endpoint_result",
        sequence: 2,
        observedAt: at(1_400),
        payload: {
          result: "unreachable",
          latency_ms: 3_000,
          failure_category: "timeout",
        },
      },
    ];

    for (const event of renterEvents) {
      const response = await call("POST", "/v1/renter/events", {
        payload: signedEvent({
          incidentId: incident.incidentId,
          sourceKeyId: renterEnrollment.sourceKeyId,
          sourceType: "renter_client",
          eventType: event.eventType,
          sequence: event.sequence,
          observedAt: event.observedAt,
          payload: event.payload,
          privateKey: renterKeys.privateKey,
        }),
        headers: {
          authorization: `Bearer ${renterEnrollment.ingestionCredential}`,
          "content-type": EVENT_CONTENT_TYPE,
        },
      });
      responseData<{ accepted: boolean }>(response, `renter event ${event.eventType}`);
    }

    const waitMs = captureStart + 1_800 - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    log("[demo] 7/10 Ending the capture window");
    const endResponse = await call("POST", `/v1/incidents/${incident.incidentId}/end`, {
      token: DEMO_TOKEN,
    });
    responseData<{ status: string; endedAt: string }>(endResponse, "incident end");

    log("[demo] 8/10 Sealing the immutable evidence bundle");
    const sealResponse = await call("POST", `/v1/incidents/${incident.incidentId}/seal`, {
      token: DEMO_TOKEN,
    });
    const sealed = responseData<{
      assessment: { code: string; evidenceGrade: string };
      eventCount: number;
    }>(sealResponse, "bundle seal");

    log("[demo] 9/10 Downloading the sealed bundle");
    const bundleResponse = await call("GET", `/v1/incidents/${incident.incidentId}/bundle`, {
      token: DEMO_TOKEN,
    });
    if (bundleResponse.statusCode !== 200) {
      throw new Error(`bundle download failed with HTTP ${bundleResponse.statusCode}`);
    }
    const bundleBytes = bundleResponse.rawPayload;
    await writeFile(bundlePath, bundleBytes);
    const bundle = bundleSchema.parse(JSON.parse(bundleBytes.toString("utf8")) as Bundle);
    const allEventsSimulated = bundle.manifest.events.every((entry) => entry.event.simulation_mode);
    if (!bundle.manifest.simulation_present || !allEventsSimulated) {
      throw new Error("Sealed bundle is not fully labelled as simulated");
    }

    log("[demo] 10/10 Running the offline CLI verifier, then a one-byte tamper check");
    const validRun = await runCli([bundlePath]);
    log("");
    log("[demo] === iw-verify: sealed bundle ===");
    log(validRun.stdout.trimEnd());
    if (validRun.stderr.trim()) log(validRun.stderr.trimEnd());

    const tampered = JSON.parse(await readFile(bundlePath, "utf8")) as Bundle;
    const firstCharacter = tampered.manifest.host_alias.slice(0, 1);
    tampered.manifest.host_alias = `${firstCharacter === "X" ? "Y" : "X"}${tampered.manifest.host_alias.slice(1)}`;
    await writeFile(tamperedBundlePath, JSON.stringify(tampered, null, 2), "utf8");

    const tamperedRun = await runCli([tamperedBundlePath]);
    log("");
    log("[demo] === iw-verify: one-byte-tampered bundle ===");
    log(tamperedRun.stdout.trimEnd());
    if (tamperedRun.stderr.trim()) log(tamperedRun.stderr.trimEnd());

    if (validRun.exitCode !== 0) {
      throw new Error(`CLI verifier rejected the valid bundle (exit ${validRun.exitCode})`);
    }
    if (tamperedRun.exitCode !== 1) {
      throw new Error(
        `CLI verifier did not detect the tampered bundle (exit ${tamperedRun.exitCode})`,
      );
    }

    log("");
    log("[demo] Summary");
    log(`[demo] Host: ${hostId}`);
    log(`[demo] Incident: ${incident.incidentId}`);
    log(`[demo] Assessment: ${sealed.assessment.code} / ${sealed.assessment.evidenceGrade}`);
    log(
      `[demo] Events: ${sealed.eventCount}; simulation_present=${bundle.manifest.simulation_present}`,
    );
    log(`[demo] Valid bundle verifier exit: ${validRun.exitCode}`);
    log(`[demo] Tampered bundle verifier exit: ${tamperedRun.exitCode} (expected 1)`);
    log(`[demo] Artifacts: ${artifactDirectory}`);
    log("[demo] No real GPU, UPS or renter workload telemetry was used.");

    return {
      artifactDirectory,
      bundlePath,
      tamperedBundlePath,
      hostId,
      incidentId: incident.incidentId,
      assessment: sealed.assessment.code,
      evidenceGrade: sealed.assessment.evidenceGrade,
      simulationPresent: bundle.manifest.simulation_present,
      eventCount: sealed.eventCount,
      validRun,
      tamperedRun,
    };
  } finally {
    try {
      if (app) await app.close();
    } finally {
      await apiPool.end();
      if (!options.keepData) {
        try {
          await cleanupDemoData(migrator);
        } finally {
          await migrator.end();
        }
      } else {
        await migrator.end();
      }
      if (!keepArtifacts) {
        await rm(artifactDirectory, { recursive: true, force: true });
      }
    }
  }
}
