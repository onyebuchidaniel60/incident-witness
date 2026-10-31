import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { Agent, request as httpsRequest } from "node:https";

import type { RenterEndpointResultPayload } from "@incident-witness/protocol";

export const HEALTH_PATH = "/.well-known/incident-witness/health";
export const HEALTH_EXPECTED_BODY = "incident-witness-health-v1\n";
export const HEALTH_TIMEOUT_MS = 3_000;
export const HEALTH_MAX_BODY_BYTES = 1_024;

export type EndpointObservation = {
  result: RenterEndpointResultPayload["result"];
  latencyMs: number;
  failureCategory?: RenterEndpointResultPayload["failure_category"];
};

export type RawHealthResponse = {
  statusCode: number;
  contentType: string | null;
  body: Buffer;
};

export type HealthTransport = (options: {
  hostname: string;
  timeoutMs: number;
  maxBodyBytes: number;
}) => Promise<RawHealthResponse>;

export type HealthTransportErrorCode =
  "PROBE_TIMEOUT" | "TLS_ERROR" | "DNS_ERROR" | "NETWORK_ERROR" | "BODY_TOO_LARGE";

export class HealthTransportError extends Error {
  readonly code: HealthTransportErrorCode;

  constructor(code: HealthTransportErrorCode, message: string) {
    super(message);
    this.name = "HealthTransportError";
    this.code = code;
  }
}

function classifyTransportError(error: unknown): HealthTransportError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (code === "PROBE_TIMEOUT" || code === "ETIMEDOUT") {
    return new HealthTransportError("PROBE_TIMEOUT", "The health request timed out");
  }
  if (
    code.startsWith("ERR_TLS_") ||
    code.startsWith("CERT_") ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID"
  ) {
    return new HealthTransportError("TLS_ERROR", "The health request failed TLS validation");
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NODATA") {
    return new HealthTransportError("DNS_ERROR", "The health hostname could not be resolved");
  }

  return new HealthTransportError("NETWORK_ERROR", "The health request failed");
}

export function normalizeEndpointHostname(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, "");
  if (trimmed.length < 1 || trimmed.length > 253) {
    throw new Error("The endpoint hostname length is invalid");
  }
  if (isIP(trimmed) !== 0) {
    throw new Error("The endpoint must be a hostname, not an IP address");
  }
  if (trimmed.includes(":") || trimmed.includes("/") || trimmed.includes("%")) {
    throw new Error("The endpoint hostname contains unsupported characters");
  }

  const ascii = domainToASCII(trimmed);
  if (!ascii || ascii.length > 253) {
    throw new Error("The endpoint hostname is not valid IDNA");
  }
  if (ascii === "localhost" || ascii.endsWith(".localhost")) {
    throw new Error("The endpoint hostname must be public");
  }
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ascii)
  ) {
    throw new Error("The endpoint hostname is not a valid DNS name");
  }

  return ascii;
}

/**
 * Fixed GET /v1 health check. Redirects are never followed. TLS certificate
 * validation is enabled. No proxy agent is used, so HTTP(S)_PROXY variables do
 * not affect this request.
 */
export const nodeHealthTransport: HealthTransport = (options) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const chunks: Buffer[] = [];
    let bodyBytes = 0;
    let statusCode = 0;
    let contentType: string | null = null;

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      action();
    };

    const request = httpsRequest(
      {
        hostname: options.hostname,
        port: 443,
        path: HEALTH_PATH,
        method: "GET",
        headers: {
          host: options.hostname,
          accept: "text/plain",
          "user-agent": "incident-witness-renter-sdk",
        },
        agent: new Agent({ keepAlive: false }),
        rejectUnauthorized: true,
      },
      (response) => {
        statusCode = response.statusCode ?? 0;
        const header = response.headers["content-type"];
        contentType = typeof header === "string" ? header : null;

        response.on("data", (chunk: Buffer) => {
          bodyBytes += chunk.length;
          if (bodyBytes > options.maxBodyBytes) {
            finish(() =>
              reject(
                new HealthTransportError("BODY_TOO_LARGE", "The health response body is too large"),
              ),
            );
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          finish(() =>
            resolve({
              statusCode,
              contentType,
              body: Buffer.concat(chunks),
            }),
          );
        });

        response.on("error", (error) => {
          finish(() => reject(classifyTransportError(error)));
        });
      },
    );

    timer = setTimeout(() => {
      finish(() =>
        reject(new HealthTransportError("PROBE_TIMEOUT", "The health request timed out")),
      );
      request.destroy();
    }, options.timeoutMs);

    request.on("error", (error) => {
      finish(() => reject(classifyTransportError(error)));
    });

    request.end();
  });

export class HttpsHealthChecker {
  constructor(
    private readonly options: {
      transport?: HealthTransport;
      timeoutMs?: number;
      maxBodyBytes?: number;
      now?: () => number;
    } = {},
  ) {}

  async check(hostnameInput: string): Promise<EndpointObservation> {
    const hostname = normalizeEndpointHostname(hostnameInput);
    const started = this.options.now?.() ?? Date.now();

    try {
      const response = await (this.options.transport ?? nodeHealthTransport)({
        hostname,
        timeoutMs: this.options.timeoutMs ?? HEALTH_TIMEOUT_MS,
        maxBodyBytes: this.options.maxBodyBytes ?? HEALTH_MAX_BODY_BYTES,
      });

      const latencyMs = Math.max(
        0,
        Math.min(60_000, Math.round((this.options.now?.() ?? Date.now()) - started)),
      );
      const contentType = response.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";

      if (response.statusCode >= 300 && response.statusCode < 400) {
        return { result: "http_error", latencyMs, failureCategory: "http" };
      }
      if (response.statusCode !== 200) {
        return { result: "http_error", latencyMs, failureCategory: "http" };
      }
      if (contentType !== "text/plain") {
        return { result: "http_error", latencyMs, failureCategory: "http" };
      }
      if (!response.body.equals(Buffer.from(HEALTH_EXPECTED_BODY, "utf8"))) {
        return { result: "http_error", latencyMs, failureCategory: "http" };
      }

      return { result: "reachable", latencyMs };
    } catch (error) {
      const latencyMs = Math.max(
        0,
        Math.min(60_000, Math.round((this.options.now?.() ?? Date.now()) - started)),
      );

      if (error instanceof HealthTransportError) {
        if (error.code === "PROBE_TIMEOUT") {
          return { result: "timeout", latencyMs, failureCategory: "timeout" };
        }
        if (error.code === "TLS_ERROR") {
          return { result: "tls_error", latencyMs, failureCategory: "tls" };
        }
        if (error.code === "DNS_ERROR") {
          return { result: "unreachable", latencyMs, failureCategory: "dns" };
        }
        if (error.code === "BODY_TOO_LARGE") {
          return { result: "http_error", latencyMs, failureCategory: "http" };
        }
        return { result: "unreachable", latencyMs, failureCategory: "network" };
      }

      return { result: "unknown", latencyMs, failureCategory: "unknown" };
    }
  }
}

export type EndpointChecker = {
  check(hostname: string): Promise<EndpointObservation>;
};
