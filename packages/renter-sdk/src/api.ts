import { z } from "zod";

const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, "Expected RFC3339 UTC timestamp");

export const renterEnrollmentResponseSchema = z
  .object({
    data: z
      .object({
        sourceKeyId: z.string().uuid(),
        certificate: z.record(z.string(), z.unknown()),
        certificateSignature: z.string().min(1),
        ingestionCredential: z.string().min(32).max(512),
        incidentId: z.string().uuid(),
        sessionEndsAt: timestampSchema,
        protocolVersion: z.literal("1.0"),
      })
      .strict(),
  })
  .strict();

export type RenterEnrollmentResponse = z.infer<typeof renterEnrollmentResponseSchema>["data"];

export type RenterEnrollmentRequest = {
  invitationToken: string;
  publicKey: string;
  requestId: string;
  sdkVersion: string;
};

export type RenterEventResult = {
  kind: "accepted" | "duplicate" | "incident_closed" | "retryable" | "halted";
  status: number | null;
  code?: string;
  retryAfterMs?: number;
};

export type RenterApiTransport = {
  enroll(request: RenterEnrollmentRequest): Promise<RenterEnrollmentResponse>;
  postEvent(raw: string, credential: string): Promise<RenterEventResult>;
};

export class RenterApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, status: number | null, code: string | null) {
    super(message);
    this.name = "RenterApiError";
    this.status = status;
    this.code = code;
  }
}

type FetchLike = typeof fetch;

export function validateApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The API base URL is not valid");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The API base URL must not contain credentials, query or fragment");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The API base URL must use HTTPS");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
    throw new Error("Plain HTTP is only permitted for a local development API");
  }

  return url.toString().replace(/\/$/, "");
}

function extractErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    const code = parsed.error?.code;
    return typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.round(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(60_000, Math.max(0, date - Date.now()));
  }
  return undefined;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class HttpRenterApi implements RenterApiTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: { baseUrl: string; fetchImpl?: FetchLike; timeoutMs?: number }) {
    this.baseUrl = validateApiBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async post(path: string, body: string, headers: Record<string, string>) {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...headers,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      return {
        status: response.status,
        ok: response.ok,
        body: await response.text(),
        retryAfter: parseRetryAfter(response.headers.get("retry-after")),
      };
    } catch {
      return { status: null, ok: false, body: "", retryAfter: undefined };
    }
  }

  async enroll(request: RenterEnrollmentRequest): Promise<RenterEnrollmentResponse> {
    const response = await this.post("/v1/renter/enroll", JSON.stringify(request), {});

    if (response.status === null) {
      throw new RenterApiError("The invitation redemption could not reach the API", null, null);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new RenterApiError(
        "The invitation redemption was rejected",
        response.status,
        extractErrorCode(response.body) ?? null,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new RenterApiError("The enrollment response was not valid JSON", response.status, null);
    }

    const result = renterEnrollmentResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new RenterApiError("The enrollment response was incomplete", response.status, null);
    }

    return result.data.data;
  }

  async postEvent(raw: string, credential: string): Promise<RenterEventResult> {
    const response = await this.post("/v1/renter/events", raw, {
      "content-type": "application/vnd.incident-witness.event+json",
      authorization: `Bearer ${credential}`,
    });

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
    if (isRetryable(response.status)) {
      return {
        kind: "retryable",
        status: response.status,
        code,
        ...(response.retryAfter === undefined ? {} : { retryAfterMs: response.retryAfter }),
      };
    }
    if (response.status === 409 && code === "INCIDENT_CLOSED") {
      return { kind: "incident_closed", status: 409, code };
    }

    return { kind: "halted", status: response.status, code };
  }
}
