export const DEMO_LOGIN_EMAIL = "judge@incidentwitness.com";

type DemoLoginEnvironment = Record<string, string | undefined>;

/**
 * The demo login is available in local/test environments, or in production
 * only when the operator explicitly enables it for the hackathon.
 */
export function demoLoginEnabled(env: DemoLoginEnvironment = process.env): boolean {
  return env.NODE_ENV !== "production" || env.IW_ENABLE_DEMO_LOGIN === "true";
}

/**
 * The button and route require both the enablement guard and the server-only
 * service-role key. The key must never be a NEXT_PUBLIC_* variable.
 */
export function demoLoginConfigured(env: DemoLoginEnvironment = process.env): boolean {
  return demoLoginEnabled(env) && Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * The route is POST-only and same-origin. A missing Origin header is accepted
 * for non-browser tooling; a browser cross-site request is always rejected.
 */
export function isSameOriginDemoLoginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol ?? requestUrl.protocol.replace(":", "");

    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}
