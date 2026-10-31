export const E2E_SESSION_COOKIE = "iw_e2e_session";

/**
 * Test-only session seam. It is enabled only for a local test process, never
 * for a production build, and still requires the explicit e2e cookie/token.
 */
export function e2eServerAuthEnabled(): boolean {
  return process.env.IW_E2E_TEST_AUTH === "true" && process.env.NODE_ENV !== "production";
}

export function e2eSessionToken(): string {
  return process.env.IW_E2E_TOKEN ?? "e2e-provider-token";
}

export function e2eClientAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IW_E2E_TEST_AUTH === "true";
}

export function e2eClientToken(): string {
  return process.env.NEXT_PUBLIC_IW_E2E_TOKEN ?? "e2e-provider-token";
}
