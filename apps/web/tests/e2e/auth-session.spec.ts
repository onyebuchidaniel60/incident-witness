import { expect, test } from "@playwright/test";

import { E2E_SESSION_COOKIE, e2eSessionToken } from "../../lib/e2e-auth";
import { getSupabaseCookieOptions } from "../../lib/supabase/env";

const API_URL = "http://127.0.0.1:4100";

test("production Supabase cookies are path-scoped, lax and secure", () => {
  expect(getSupabaseCookieOptions("production")).toEqual({
    path: "/",
    sameSite: "lax",
    secure: true,
  });
});

test("magic-link callback persists a session cookie and survives refresh", async ({
  page,
  context,
}) => {
  await page.goto("/auth/callback?code=e2e-magic-link");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Provider dashboard" })).toBeVisible();

  const sessionCookie = (await context.cookies()).find(
    (cookie) => cookie.name === E2E_SESSION_COOKIE,
  );
  expect(sessionCookie?.value).toBe(e2eSessionToken());
  expect(sessionCookie?.path).toBe("/");
  expect(sessionCookie?.sameSite).toBe("Lax");

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Provider dashboard" })).toBeVisible();

  await page.goto("/hosts");
  await expect(page).toHaveURL(/\/hosts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your hosts" })).toBeVisible();
});

test("proxy redirects without a session and accepts a test-injected session", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");

  const anonymous = await browser.newContext({ baseURL });
  const anonymousPage = await anonymous.newPage();
  const apiRequests: string[] = [];
  anonymousPage.on("request", (request) => {
    if (request.url().startsWith(API_URL)) apiRequests.push(request.url());
  });

  await anonymousPage.goto("/dashboard");
  await expect(anonymousPage).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(
    anonymousPage.getByRole("heading", { level: 1, name: "Provider sign-in" }),
  ).toBeVisible();
  await expect(anonymousPage.getByText(/authentication token is invalid/i)).toHaveCount(0);

  await anonymousPage.goto("/hosts");
  await expect(anonymousPage).toHaveURL(/\/login\?next=%2Fhosts$/);
  await expect(anonymousPage.getByText(/authentication token is invalid/i)).toHaveCount(0);

  await anonymousPage.goto("/");
  await expect(
    anonymousPage
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Workspace" }),
  ).toHaveCount(0);
  await expect(
    anonymousPage.locator('nav[aria-label="Primary"] a[href="/login"]'),
  ).toHaveCount(1);

  expect(apiRequests).toEqual([]);
  await anonymous.close();

  const authenticated = await browser.newContext({ baseURL });
  await authenticated.addCookies([
    {
      name: E2E_SESSION_COOKIE,
      value: e2eSessionToken(),
      url: baseURL,
      sameSite: "Lax",
    },
  ]);
  const authenticatedPage = await authenticated.newPage();
  const response = await authenticatedPage.goto("/dashboard");
  expect(response?.status()).toBe(200);
  await expect(authenticatedPage).toHaveURL(/\/dashboard$/);
  await expect(
    authenticatedPage.getByRole("heading", { level: 1, name: "Provider dashboard" }),
  ).toBeVisible();

  await authenticatedPage.goto("/");
  await expect(
    authenticatedPage.locator('nav[aria-label="Primary"] a[href="/dashboard"]'),
  ).toHaveCount(1);
  await expect(
    authenticatedPage.locator('nav[aria-label="Primary"] a[href="/login"]'),
  ).toHaveCount(0);

  await authenticatedPage.goto("/hosts");
  await expect(authenticatedPage).toHaveURL(/\/hosts$/);
  await expect(
    authenticatedPage.getByRole("heading", { level: 1, name: "Your hosts" }),
  ).toBeVisible();
  await authenticated.close();
});

test("API 401 redirects to login without rendering a raw auth error", async ({ page }) => {
  await page.goto("/auth/callback?code=e2e-magic-link");
  await expect(page.getByRole("heading", { level: 1, name: "Provider dashboard" })).toBeVisible();

  await page.route(`${API_URL}/**`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "AUTH_INVALID_TOKEN",
          message: "The authentication token is invalid.",
          request_id: "req-auth-session-test",
        },
      }),
    });
  });

  try {
    await page.goto("/dashboard");
  } catch (error) {
    // The API client can complete a hard login redirect while the document is
    // still loading, which Playwright reports as an aborted navigation.
    if (!String(error).includes("ERR_ABORTED")) throw error;
  }
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/, { timeout: 10_000 });
  await expect(page.getByText(/authentication token is invalid/i)).toHaveCount(0);
});

test("Workspace is hidden when logged out and direct navigation stays protected", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(API_URL)) apiRequests.push(request.url());
  });

  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workspace" }),
  ).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Provider sign-in" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Provider dashboard" })).toHaveCount(0);
  await expect(page.getByText(/authentication token is invalid/i)).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});
