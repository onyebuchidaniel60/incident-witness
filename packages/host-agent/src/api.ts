import { canonicalJsonString } from "@incident-witness/protocol";
import { z } from "zod";

import { validateApiBaseUrl } from "./config.js";
import type { SignedPresence } from "./crypto.js";

const enrollmentResponseSchema = z
  .object({
    data: z
      .object({
        sourceKeyId: z.string().uuid(),
        certificate: z.record(z.string(), z.unknown()),
        certificateSignature: z.string().min(1),
        deviceCredential: z.string().min(32).max(512),
        apiBaseUrl: z.string().url(),
        protocolVersion: z.literal("1.0"),
      })
      .strict(),
  })
  .strict();

export type EnrollmentRequest = {
  enrollmentCode: string;
  publicKey: string;
  agentVersion: string;
  requestId: string;
};

export type EnrollmentResult = z.infer<typeof enrollmentResponseSchema>["data"];

export type PresenceResult = {
  kind: "accepted" | "duplicate" | "retryable" | "halted";
  status: number | null;
  code?: string;
};

export type EventResult = {
  kind: "accepted" | "duplicate" | "incident_closed" | "retryable" | "halted";
  status: number | null;
  code?: string;
};

export type EventTransport = {
  sendEvent(raw: string): Promise<EventResult>;
};

export type PresenceTransport = {
  sendPresence(presence: SignedPresence): Promise<PresenceResult>;
};

export type AgentTransport = EventTransport &
  PresenceTransport & {
    enroll(request: EnrollmentRequest): Promise<EnrollmentResult>;
  };

export class AgentApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, status: number | null, code: string | null) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.code = code;
  }
}

type FetchLike = typeof fetch;

function extractErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    const code = parsed.error?.code;
    return typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class HttpAgentApi implements AgentTransport {
  private readonly baseUrl: string;
  private readonly credential: string | null;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: {
    baseUrl: string;
    credential?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  }) {
    this.baseUrl = validateApiBaseUrl(options.baseUrl);
    this.credential = options.credential ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async post(path: string, body: string, contentType: string) {
    const headers: Record<string, string> = {
      "content-type": contentType,
      accept: "application/json",
    };

    if (this.credential) {
      headers.authorization = `Bearer ${this.credential}`;
    }

    try {
      const response = await this.fetchImpl(joinUrl(this.baseUrl, path), {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      return {
        status: response.status,
        ok: response.ok,
        body: await response.text(),
      };
    } catch {
      return { status: null, ok: false, body: "" };
    }
  }

  async enroll(request: EnrollmentRequest): Promise<EnrollmentResult> {
    const response = await this.post(
      "/v1/agent/enroll",
      JSON.stringify(request),
      "application/json",
    );

    if (response.status === null) {
      throw new AgentApiError("The enrollment request could not reach the API", null, null);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new AgentApiError(
        "The enrollment request was rejected",
        response.status,
        extractErrorCode(response.body) ?? null,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new AgentApiError("The enrollment response was not valid JSON", response.status, null);
    }

    const result = enrollmentResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new AgentApiError("The enrollment response was incomplete", response.status, null);
    }

    return result.data.data;
  }

  async sendPresence(presence: SignedPresence): Promise<PresenceResult> {
    const response = await this.post(
      "/v1/agent/heartbeat",
      canonicalJsonString(presence),
      "application/vnd.incident-witness.presence+json",
    );

    if (response.status === null) {
      return { kind: "retryable", status: null, code: "NETWORK_ERROR" };
    }

    if (response.status === 200) {
      try {
        const parsed = JSON.parse(response.body) as { data?: { duplicate?: unknown } };
        if (parsed.data?.duplicate === true) {
          return { kind: "duplicate", status: 200 };
        }
      } catch {
        // A 200 response is authoritative; an unreadable body does not change acceptance.
      }
      return { kind: "accepted", status: 200 };
    }

    const code = extractErrorCode(response.body) ?? `HTTP_${response.status}`;
    if (isRetryableStatus(response.status) || response.status === 422) {
      return { kind: "retryable", status: response.status, code };
    }

    return { kind: "halted", status: response.status, code };
  }

  async sendEvent(raw: string): Promise<EventResult> {
    const response = await this.post(
      "/v1/agent/events",
      raw,
      "application/vnd.incident-witness.event+json",
    );

    if (response.status === null) {
      return { kind: "retryable", status: null, code: "NETWORK_ERROR" };
    }

    if (response.status === 200) {
      return { kind: "duplicate", status: 200 };
    }
    if (response.status === 202) {
      return { kind: "accepted", status: 202 };
    }

    const code = extractErrorCode(response.body) ?? `HTTP_${response.status}`;
    if (isRetryableStatus(response.status)) {
      return { kind: "retryable", status: response.status, code };
    }
    if (response.status === 409 && code === "INCIDENT_CLOSED") {
      return { kind: "incident_closed", status: 409, code };
    }

    return { kind: "halted", status: response.status, code };
  }
}
