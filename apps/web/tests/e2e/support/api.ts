import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";

import { canonicalJsonBytes, type EventBody } from "@incident-witness/protocol";
import { signEvent } from "@incident-witness/protocol/node";

export const API_URL = "http://127.0.0.1:4100";
export const E2E_TOKEN = "e2e-provider-token";
export const EVENT_CONTENT_TYPE = "application/vnd.incident-witness.event+json";
export const PRESENCE_CONTENT_TYPE = "application/vnd.incident-witness.presence+json";

type ApiResponse<T> = { data: T };

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    contentType?: string;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? E2E_TOKEN}`;
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
    let code = "";
    try {
      const parsed = (await response.json()) as { error?: { code?: string; message?: string } };
      code = `${parsed.error?.code ?? ""} ${parsed.error?.message ?? ""}`.trim();
    } catch {
      // Keep the HTTP status as the safe failure detail.
    }
    throw new Error(`API ${path} failed with ${response.status}${code ? `: ${code}` : ""}`);
  }

  return (await response.json()) as T;
}

export function publicKeyBase64Url(key: KeyObject): string {
  const jwk = key.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("test key has no public component");
  return jwk.x;
}

export async function enrollHost(enrollmentCode: string) {
  const pair = generateKeyPairSync("ed25519");
  const enrollment = await request<ApiResponse<{ sourceKeyId: string; deviceCredential: string }>>(
    "/v1/agent/enroll",
    {
      method: "POST",
      token: null,
      body: {
        enrollmentCode,
        publicKey: publicKeyBase64Url(pair.publicKey),
        agentVersion: "0.1.0-e2e",
        requestId: randomUUID(),
      },
    },
  );
  return {
    sourceKeyId: enrollment.data.sourceKeyId,
    credential: enrollment.data.deviceCredential,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
  };
}

export async function sendPresenceWithCredential(input: {
  hostId: string;
  credential: string;
  privateKey: KeyObject;
  sequence?: number;
}) {
  const unsigned = {
    hostId: input.hostId,
    observedAt: new Date().toISOString(),
    heartbeatSequence: input.sequence ?? 1,
    agentVersion: "0.1.0-e2e",
  };
  const signature = sign(
    null,
    Buffer.concat([
      Buffer.from("incident-witness-host-presence-v1\n", "utf8"),
      Buffer.from(canonicalJsonBytes(unsigned)),
    ]),
    input.privateKey,
  ).toString("base64url");
  const raw = Buffer.from(canonicalJsonBytes({ ...unsigned, signature }));

  const response = await fetch(`${API_URL}/v1/agent/heartbeat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.credential}`,
      "content-type": PRESENCE_CONTENT_TYPE,
    },
    body: raw,
  });
  if (!response.ok) throw new Error(`presence failed with HTTP ${response.status}`);
  return response;
}

export async function enrollRenter(invitationToken: string) {
  const pair = generateKeyPairSync("ed25519");
  const response = await request<ApiResponse<{ sourceKeyId: string; ingestionCredential: string }>>(
    "/v1/renter/enroll",
    {
      method: "POST",
      token: null,
      body: {
        invitationToken,
        publicKey: publicKeyBase64Url(pair.publicKey),
        requestId: randomUUID(),
        sdkVersion: "0.1.0-e2e",
      },
    },
  );
  return {
    sourceKeyId: response.data.sourceKeyId,
    credential: response.data.ingestionCredential,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
  };
}

export async function sendSignedEvent(input: {
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
}) {
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
  const raw = Buffer.from(canonicalJsonBytes(envelope));

  const response = await fetch(`${API_URL}${input.path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.credential}`,
      "content-type": EVENT_CONTENT_TYPE,
    },
    body: raw,
  });
  if (!response.ok) throw new Error(`event ingestion failed with HTTP ${response.status}`);
  return response;
}

export async function getIncident(incidentId: string) {
  return request<
    ApiResponse<{
      captureStartedAt: string;
      status: string;
      acceptedEventCount: number;
    }>
  >(`/v1/incidents/${incidentId}`);
}
