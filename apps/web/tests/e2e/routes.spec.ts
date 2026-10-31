import { expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/", heading: "A common record of what each source observed." },
  { path: "/login", heading: "Provider sign-in" },
  { path: "/verify", heading: "Verify an evidence bundle" },
  { path: "/docs", heading: "Incident Witness documentation" },
  { path: "/privacy", heading: "Privacy policy not yet approved." },
  { path: "/terms", heading: "Terms of service not yet approved." },
];

const protectedRoutes = [
  "/dashboard",
  "/hosts",
  "/hosts/new",
  "/hosts/test-host-id",
  "/incidents",
  "/incidents/new",
  "/incidents/test-incident-id",
  "/settings",
];

for (const route of publicRoutes) {
  test(`${route.path} renders its public shell`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    const response = await page.goto(route.path);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);

    const hasBlockingOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasBlockingOverflow).toBe(false);
  });
}

for (const path of protectedRoutes) {
  test(`${path} redirects to the authenticated sign-in route`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole("heading", { level: 1, name: "Provider sign-in" })).toBeVisible();
  });
}

test("login form requests a magic link without a code field", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByLabel("Provider email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send login link" })).toBeVisible();
  await expect(page.getByLabel("One-time code")).toHaveCount(0);
});

test("invalid auth callback redirects to login with a safe error", async ({ page }) => {
  await page.goto("/auth/callback");

  await expect(page).toHaveURL(/\/login\?error=invalid_link$/);
  await expect(page.getByRole("alert").filter({ hasText: "invalid or expired" })).toBeVisible();
});

test("not-found route returns 404 with useful navigation", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/Incident Witness/);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Documentation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Verify a bundle" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("primary navigation works on the current viewport", async ({ page }) => {
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: "Open menu" });
  if (await menuButton.isVisible()) {
    await menuButton.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  }

  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  const docsLink = primaryNavigation.getByRole("link", { name: "Docs" });
  await expect(docsLink).toBeVisible();
  await docsLink.click();
  await expect(page).toHaveURL(/\/docs$/);
});

test("footer provides real documentation and repository destinations", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Documentation" })).toHaveAttribute(
    "href",
    "/docs",
  );
  await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/onyebuchidaniel60/incident-witness",
  );
});
