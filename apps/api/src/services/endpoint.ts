import { request as httpsRequest } from "node:https";
import type { LookupAddress } from "node:dns";

export const FIXED_HEALTH_PATH = "/.well-known/incident-witness/health";
export const FIXED_HEALTH_BODY = "incident-witness-health-v1\n";
const MAX_RESPONSE_BYTES = 1024;
const REQUEST_TIMEOUT_MS = 3000;

export type EndpointFailureReason =
  | "REDIRECT"
  | "HTTP_STATUS"
  | "CONTENT_TYPE"
  | "BODY_MISMATCH"
  | "BODY_TOO_LARGE"
  | "TLS_ERROR"
  | "TIMEOUT"
  | "CONNECTION_ERROR";

export type EndpointCheckResult =
  | { ok: true }
  | {
      ok: false;
      reasonCode: EndpointFailureReason;
    };

export interface EndpointChecker {
  check(hostname: string, pinnedAddress: LookupAddress): Promise<EndpointCheckResult>;
}

function tlsReason(error: NodeJS.ErrnoException): EndpointFailureReason {
  const code = error.code ?? "";
  if (
    code.includes("CERT") ||
    code.includes("TLS") ||
    code.includes("SSL") ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT"
  ) {
    return "TLS_ERROR";
  }
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") {
    return "TIMEOUT";
  }
  return "CONNECTION_ERROR";
}

/**
 * Performs the fixed HTTPS health check with a pinned, already-validated
 * address. Redirects are never followed, proxy environment variables are not
 * consulted, TLS validation remains enabled against the hostname, and the
 * response is bounded.
 */
export class HttpsEndpointChecker implements EndpointChecker {
  async check(hostname: string, pinnedAddress: LookupAddress): Promise<EndpointCheckResult> {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (result: EndpointCheckResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const request = httpsRequest(
        {
          protocol: "https:",
          hostname,
          port: 443,
          path: FIXED_HEALTH_PATH,
          method: "GET",
          servername: hostname,
          agent: false,
          headers: {
            Host: hostname,
            Accept: "text/plain",
            Connection: "close",
          },
          lookup: (_hostname, options, callback) => {
            const lookupOptions = options as { all?: boolean };
            if (lookupOptions.all) {
              callback(null, [pinnedAddress]);
              return;
            }
            callback(null, pinnedAddress.address, pinnedAddress.family);
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;

          if (status >= 300 && status < 400) {
            response.resume();
            finish({ ok: false, reasonCode: "REDIRECT" });
            return;
          }

          if (status !== 200) {
            response.resume();
            finish({ ok: false, reasonCode: "HTTP_STATUS" });
            return;
          }

          const contentType = String(response.headers["content-type"] ?? "")
            .split(";")[0]
            ?.trim()
            .toLowerCase();
          if (contentType !== "text/plain") {
            response.resume();
            finish({ ok: false, reasonCode: "CONTENT_TYPE" });
            return;
          }

          const chunks: Buffer[] = [];
          let total = 0;

          response.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_RESPONSE_BYTES) {
              response.destroy();
              finish({ ok: false, reasonCode: "BODY_TOO_LARGE" });
              return;
            }
            chunks.push(chunk);
          });

          response.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            finish(
              body === FIXED_HEALTH_BODY
                ? { ok: true }
                : { ok: false, reasonCode: "BODY_MISMATCH" },
            );
          });

          response.on("error", (error: NodeJS.ErrnoException) => {
            finish({ ok: false, reasonCode: tlsReason(error) });
          });
        },
      );

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error("endpoint timeout"));
        finish({ ok: false, reasonCode: "TIMEOUT" });
      });

      request.on("error", (error: NodeJS.ErrnoException) => {
        finish({ ok: false, reasonCode: tlsReason(error) });
      });

      request.end();
    });
  }
}
