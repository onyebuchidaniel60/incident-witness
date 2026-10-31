import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", heading: "A common record of what each source observed." },
  { path: "/login", heading: "Sign-in is not connected in Phase 1." },
  { path: "/verify", heading: "The local bundle verifier is not connected in Phase 1." },
  { path: "/docs", heading: "Incident Witness documentation" },
  { path: "/privacy", heading: "Privacy policy not yet approved." },
  { path: "/terms", heading: "Terms of service not yet approved." },
  { path: "/dashboard", heading: "Dashboard placeholder" },
  { path: "/hosts", heading: "Host list placeholder" },
  { path: "/hosts/new", heading: "Host registration is not connected in Phase 1." },
  { path: "/hosts/test-host-id", heading: "Host detail placeholder" },
  { path: "/incidents", heading: "Session list placeholder" },
  { path: "/incidents/new", heading: "Session creation is not connected in Phase 1." },
  { path: "/incidents/test-incident-id", heading: "Session timeline placeholder" },
  { path: "/settings", heading: "Settings are not connected in Phase 1." },
];

for (const route of routes) {
  test(`${route.path} renders its structural placeholder`, async ({ page }) => {
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

test("not-found route returns 404 with useful navigation", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
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

test("protected placeholder pages clearly state that no auth is active", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByText("Protected-area placeholder", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Authentication is not connected in Phase 1/i).first(),
  ).toBeVisible();
});

test("footer provides real documentation and repository destinations", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Documentation" })).toHaveAttribute("href", "/docs");
  await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/onyebuchidaniel60/incident-witness",
  );
});
