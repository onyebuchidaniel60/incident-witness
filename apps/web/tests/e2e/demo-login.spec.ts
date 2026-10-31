import { expect, test } from "@playwright/test";

import { DEMO_LOGIN_EMAIL, demoLoginConfigured, demoLoginEnabled } from "../../lib/demo-login";

test("demo login is disabled in production unless explicitly enabled", () => {
  expect(demoLoginEnabled({ NODE_ENV: "production" })).toBe(false);
  expect(demoLoginEnabled({ NODE_ENV: "production", IW_ENABLE_DEMO_LOGIN: "true" })).toBe(true);
  expect(demoLoginEnabled({ NODE_ENV: "development" })).toBe(true);
});

test("demo login requires the server-only service-role key", () => {
  expect(demoLoginConfigured({ NODE_ENV: "production", IW_ENABLE_DEMO_LOGIN: "true" })).toBe(false);
  expect(
    demoLoginConfigured({
      NODE_ENV: "production",
      IW_ENABLE_DEMO_LOGIN: "true",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-value",
    }),
  ).toBe(true);
});

test("the demo email is fixed and cannot be supplied by the caller", () => {
  expect(DEMO_LOGIN_EMAIL).toBe("judge@incidentwitness.com");
});

test("demo login rejects cross-origin requests", async ({ request }) => {
  const response = await request.post("/api/demo-login", {
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    data: { email: "attacker@example.com" },
  });

  expect(response.status()).toBe(403);
  expect(await response.text()).not.toContain("attacker@example.com");
});

test("demo login fails closed without service-role configuration", async ({ request, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");

  const response = await request.post("/api/demo-login", {
    headers: { origin: baseURL },
    data: { email: "attacker@example.com" },
  });

  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toContain("no-store");

  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };
  expect(body.error?.code).toBe("DEMO_LOGIN_NOT_CONFIGURED");
  expect(JSON.stringify(body)).not.toContain("attacker@example.com");
});

test("demo login is POST-only", async ({ request }) => {
  const response = await request.get("/api/demo-login");
  expect(response.status()).toBe(405);
});

test("the judge demo button is hidden when the route is not configured", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Enter as Judge/ })).toHaveCount(0);
});
