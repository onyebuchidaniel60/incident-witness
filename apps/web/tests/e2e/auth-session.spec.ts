import { expect, test } from "@playwright/test";

import { E2E_SESSION_COOKIE, e2eSessionToken } from "../../lib/e2e-auth";
import { getSupabaseCookieOptions } from "../../lib/supabase/env";

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
  await expect(
    page.getByRole("heading", { level: 1, name: "Provider dashboard" }),
  ).toBeVisible();

  const sessionCookie = (await context.cookies()).find(
    (cookie) => cookie.name === E2E_SESSION_COOKIE,
  );
  expect(sessionCookie?.value).toBe(e2eSessionToken());
  expect(sessionCookie?.path).toBe("/");
  expect(sessionCookie?.sameSite).toBe("Lax");

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Provider dashboard" }),
  ).toBeVisible();

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
  await anonymousPage.goto("/dashboard");
  await expect(anonymousPage).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(
    anonymousPage.getByRole("heading", { level: 1, name: "Provider sign-in" }),
  ).toBeVisible();
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

  await authenticatedPage.goto("/hosts");
  await expect(authenticatedPage).toHaveURL(/\/hosts$/);
  await expect(
    authenticatedPage.getByRole("heading", { level: 1, name: "Your hosts" }),
  ).toBeVisible();
  await authenticated.close();
});
