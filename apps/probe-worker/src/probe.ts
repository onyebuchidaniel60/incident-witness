import { Agent, request as httpsRequest } from "node:https";

import type { PlatformProbeResultPayload } from "@incident-witness/protocol";

import {
  DnsLookupError,
  resolvePublicAddress,
  UnsafeProbeTargetError,
  type DnsResolver,
} from "./dns.js";

export const HEALTH_PATH = "/.well-known/incident-witness/health";
export const HEALTH_EXPECTED_BODY = "incident-witness-health-v1\n";
export const PROBE_PORT = 443;

export type PinnedRequestOptions = {
  hostname: string;
  address: string;
  family: 4 | 6;
  path: string;
  method: "GET";
  headers: Record<string, string>;
  timeoutMs: number;
  maxBodyBytes: number;
};

export type PinnedResponse = {
  statusCode: number;
  contentType: string | null;
  body: Buffer;
  latencyMs: number;
};

export type PinnedTransport = (options: PinnedRequestOptions) => Promise<PinnedResponse>;

export type PinnedTransportErrorCode = "TIMEOUT" | "TLS_ERROR" | "NETWORK_ERROR" | "BODY_TOO_LARGE";

export class PinnedTransportError extends Error {
  readonly code: PinnedTransportErrorCode;

  constructor(code: PinnedTransportErrorCode, message: string) {
    super(message);
    this.name = "PinnedTransportError";
    this.code = code;
  }
}

function classifyError(error: unknown): PinnedTransportError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (code === "PROBE_TIMEOUT" || code === "ETIMEDOUT") {
    return new PinnedTransportError("TIMEOUT", "The probe timed out");
  }
  if (
    code.startsWith("ERR_TLS_") ||
    code.startsWith("CERT_") ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID"
  ) {
    return new PinnedTransportError("TLS_ERROR", "The probe failed TLS validation");
  }
  return new PinnedTransportError("NETWORK_ERROR", "The probe connection failed");
}

/**
 * Connects to the already-validated IP. `host` is an IP literal, so Node does
 * not resolve the hostname again. `servername` supplies SNI and certificate
 * name validation, and the Host header carries the authorized hostname. A new
 * non-proxy Agent is used; HTTP(S)_PROXY environment variables are ignored.
 */
export const nodePinnedTransport: PinnedTransport = (options) =>
  new Promise<PinnedResponse>((resolve, reject) => {
    const started = Date.now();
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    let statusCode = 0;
    let contentType: string | null = null;
    let bodyBytes = 0;
    const chunks: Buffer[] = [];

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      action();
    };

    const request = httpsRequest(
      {
        host: options.address,
        family: options.family,
        port: PROBE_PORT,
        path: options.path,
        method: options.method,
        servername: options.hostname,
        headers: options.headers,
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
                new PinnedTransportError("BODY_TOO_LARGE", "The probe response body is too large"),
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
              latencyMs: Math.max(0, Date.now() - started),
            }),
          );
        });

        response.on("error", (error) => {
          finish(() => reject(classifyError(error)));
        });
      },
    );

    timer = setTimeout(() => {
      finish(() => reject(new PinnedTransportError("TIMEOUT", "The probe timed out")));
      request.destroy();
    }, options.timeoutMs);

    request.on("error", (error) => {
      finish(() => reject(classifyError(error)));
    });

    request.end();
  });

export type ProbeOutcome = {
  kind: "result";
  payload: PlatformProbeResultPayload;
  observedAt: Date;
  safeErrorCode?: string;
};

export type ProbeTarget = {
  hostId: string;
  hostname: string;
};

export type ProbeOptions = {
  resolver?: DnsResolver;
  transport?: PinnedTransport;
  timeoutMs?: number;
  maxBodyBytes?: number;
  now?: () => Date;
};

function latencyOf(started: number): number {
  return Math.max(0, Math.min(60_000, Math.round(Date.now() - started)));
}

function resultPayload(
  target: ProbeTarget,
  fields: Partial<PlatformProbeResultPayload> &
    Pick<PlatformProbeResultPayload, "probe_status" | "dns_result" | "response_class">,
): PlatformProbeResultPayload {
  return {
    target_host_id: target.hostId,
    dns_result: fields.dns_result,
    tls_result: fields.tls_result ?? "not_attempted",
    http_result: fields.http_result ?? "not_attempted",
    latency_ms: fields.latency_ms ?? 0,
    response_class: fields.response_class,
    observed_ip_class: fields.observed_ip_class ?? "unknown",
    probe_status: fields.probe_status,
  };
}

/**
 * Resolves once, rejects unsafe or mixed address sets before connection, and
 * probes the fixed HTTPS health contract. Infrastructure/policy failures are
 * represented as gaps so they are not treated as evidence that the host is
 * down. Target outcomes are represented as platform_probe_result events.
 */
export async function probeHostname(
  target: ProbeTarget,
  options: ProbeOptions = {},
): Promise<ProbeOutcome> {
  const now = options.now ?? (() => new Date());
  const started = Date.now();

  let resolved: { hostname: string; address: string; family: 4 | 6 };
  try {
    resolved = await resolvePublicAddress(target.hostname, options.resolver);
  } catch (error) {
    if (error instanceof UnsafeProbeTargetError) {
      return {
        kind: "result",
        payload: resultPayload(target, {
          probe_status: "error",
          dns_result:
            error.code === "INVALID_HOSTNAME" || error.code === "IP_LITERAL"
              ? "dns_error"
              : "rejected_unsafe",
          http_result: "not_attempted",
          tls_result: "not_attempted",
          response_class: "error",
          observed_ip_class: error.code === "UNSAFE_ADDRESS" ? "rejected_unsafe" : "unknown",
          latency_ms: latencyOf(started),
        }),
        observedAt: now(),
        safeErrorCode: `PROBE_${error.code}`,
      };
    }
    if (error instanceof DnsLookupError && error.kind === "nxdomain") {
      return {
        kind: "result",
        payload: resultPayload(target, {
          probe_status: "failed",
          dns_result: "nxdomain",
          http_result: "not_attempted",
          tls_result: "not_attempted",
          response_class: "unavailable",
          observed_ip_class: "unknown",
          latency_ms: latencyOf(started),
        }),
        observedAt: now(),
        safeErrorCode: "PROBE_DNS_NXDOMAIN",
      };
    }

    return {
      kind: "result",
      payload: resultPayload(target, {
        probe_status: "error",
        dns_result: "dns_error",
        http_result: "not_attempted",
        tls_result: "not_attempted",
        response_class: "error",
        observed_ip_class: "unknown",
        latency_ms: latencyOf(started),
      }),
      observedAt: now(),
      safeErrorCode: "PROBE_DNS_INFRASTRUCTURE",
    };
  }

  let response: PinnedResponse;
  try {
    response = await (options.transport ?? nodePinnedTransport)({
      hostname: resolved.hostname,
      address: resolved.address,
      family: resolved.family,
      path: HEALTH_PATH,
      method: "GET",
      headers: {
        Host: resolved.hostname,
        Accept: "text/plain",
        "User-Agent": "incident-witness-probe-worker",
      },
      timeoutMs: options.timeoutMs ?? 3_000,
      maxBodyBytes: options.maxBodyBytes ?? 1_024,
    });
  } catch (error) {
    if (error instanceof PinnedTransportError) {
      if (error.code === "TIMEOUT") {
        return {
          kind: "result",
          payload: resultPayload(target, {
            probe_status: "failed",
            dns_result: "resolved",
            tls_result: "not_attempted",
            http_result: "timeout",
            response_class: "unavailable",
            observed_ip_class: "public",
            latency_ms: latencyOf(started),
          }),
          observedAt: now(),
          safeErrorCode: "PROBE_HTTP_TIMEOUT",
        };
      }
      if (error.code === "TLS_ERROR") {
        return {
          kind: "result",
          payload: resultPayload(target, {
            probe_status: "failed",
            dns_result: "resolved",
            tls_result: "invalid",
            http_result: "not_attempted",
            response_class: "unavailable",
            observed_ip_class: "public",
            latency_ms: latencyOf(started),
          }),
          observedAt: now(),
          safeErrorCode: "PROBE_TLS_INVALID",
        };
      }
      if (error.code === "BODY_TOO_LARGE") {
        return {
          kind: "result",
          payload: resultPayload(target, {
            probe_status: "failed",
            dns_result: "resolved",
            tls_result: "valid",
            http_result: "invalid_body",
            response_class: "unexpected",
            observed_ip_class: "public",
            latency_ms: latencyOf(started),
          }),
          observedAt: now(),
          safeErrorCode: "PROBE_BODY_TOO_LARGE",
        };
      }
      return {
        kind: "result",
        payload: resultPayload(target, {
          probe_status: "failed",
          dns_result: "resolved",
          tls_result: "not_attempted",
          http_result: "error",
          response_class: "unavailable",
          observed_ip_class: "public",
          latency_ms: latencyOf(started),
        }),
        observedAt: now(),
        safeErrorCode: "PROBE_NETWORK_ERROR",
      };
    }

    return {
      kind: "result",
      payload: resultPayload(target, {
        probe_status: "error",
        dns_result: "resolved",
        tls_result: "not_attempted",
        http_result: "error",
        response_class: "error",
        observed_ip_class: "public",
        latency_ms: latencyOf(started),
      }),
      observedAt: now(),
      safeErrorCode: "PROBE_TRANSPORT_INTERNAL",
    };
  }

  const contentType = response.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const expectedBody = response.body.equals(Buffer.from(HEALTH_EXPECTED_BODY, "utf8"));
  const latencyMs = Math.max(0, Math.min(60_000, Math.round(response.latencyMs)));

  if (response.statusCode >= 300 && response.statusCode < 400) {
    return {
      kind: "result",
      payload: resultPayload(target, {
        probe_status: "failed",
        dns_result: "resolved",
        tls_result: "valid",
        http_result: "redirect",
        response_class: "unexpected",
        observed_ip_class: "public",
        latency_ms: latencyMs,
      }),
      observedAt: now(),
      safeErrorCode: "PROBE_REDIRECT",
    };
  }
  if (response.statusCode !== 200) {
    return {
      kind: "result",
      payload: resultPayload(target, {
        probe_status: "failed",
        dns_result: "resolved",
        tls_result: "valid",
        http_result: "unexpected_status",
        response_class: "unexpected",
        observed_ip_class: "public",
        latency_ms: latencyMs,
      }),
      observedAt: now(),
      safeErrorCode: "PROBE_UNEXPECTED_STATUS",
    };
  }
  if (contentType !== "text/plain" || !expectedBody) {
    return {
      kind: "result",
      payload: resultPayload(target, {
        probe_status: "failed",
        dns_result: "resolved",
        tls_result: "valid",
        http_result: "invalid_body",
        response_class: "unexpected",
        observed_ip_class: "public",
        latency_ms: latencyMs,
      }),
      observedAt: now(),
      safeErrorCode: "PROBE_INVALID_BODY",
    };
  }

  return {
    kind: "result",
    payload: resultPayload(target, {
      probe_status: "completed",
      dns_result: "resolved",
      tls_result: "valid",
      http_result: "expected",
      response_class: "expected",
      observed_ip_class: "public",
      latency_ms: latencyMs,
    }),
    observedAt: now(),
  };
}
