import { expect, test } from "@playwright/test";

import { E2E_SESSION_COOKIE, e2eSessionToken } from "../../lib/e2e-auth";

const publicMetadataRoutes = [
  {
    path: "/",
    title: /Incident Witness/,
    description: /provider-neutral protocol for signed, bounded observations/i,
  },
  {
    path: "/docs",
    title: /Documentation \| Incident Witness/,
    description: /host-agent installation and enrollment/i,
  },
  {
    path: "/verify",
    title: /Verify Evidence \| Incident Witness/,
    description: /verify a sealed Incident Witness evidence bundle locally/i,
  },
  {
    path: "/privacy",
    title: /Privacy \| Incident Witness/,
    description: /legal review is pending/i,
  },
  {
    path: "/terms",
    title: /Terms \| Incident Witness/,
    description: /legal terms are pending/i,
  },
];

const crawlablePublicRoutes = ["/", "/docs", "/verify", "/privacy", "/terms", "/login"];

for (const route of publicMetadataRoutes) {
  test(`${route.path} exposes title, description, canonical, icon and social metadata`, async ({
    page,
  }) => {
    await page.goto(route.path);

    await expect(page).toHaveTitle(route.title);

    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toMatch(route.description);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(route.path === "/" ? "^https://[^/]+/?$" : `${route.path}$`),
    );

    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon\.svg/);

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toMatch(/opengraph-image/);
  });
}

test("authenticated workspace pages are marked noindex", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");

  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    {
      name: E2E_SESSION_COOKIE,
      value: e2eSessionToken(),
      url: baseURL,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();

  await page.goto("/dashboard");
  await expect(page).toHaveTitle(/Dashboard \| Incident Witness/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /nofollow/);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toMatch(/Provider workspace overview/i);

  await page.goto("/hosts");
  await expect(page).toHaveTitle(/Hosts \| Incident Witness/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await context.close();
});

test("robots.txt and sitemap.xml expose only public routes", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Sitemap:");
  expect(robotsText).toContain("Disallow: /dashboard");
  expect(robotsText).toContain("Disallow: /hosts");
  expect(robotsText).toContain("Disallow: /incidents");
  expect(robotsText).toContain("Disallow: /settings");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("/docs");
  expect(sitemapText).toContain("/verify");
  expect(sitemapText).toContain("/privacy");
  expect(sitemapText).toContain("/terms");
  expect(sitemapText).not.toContain("/dashboard");
  expect(sitemapText).not.toContain("/hosts");
  expect(sitemapText).not.toContain("/incidents");
});

test("docs page contains working sections and the real operating steps", async ({ page }) => {
  await page.goto("/docs");

  for (const id of [
    "overview",
    "host-agent",
    "renter-sdk",
    "protocol",
    "limitations",
    "reference",
  ]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }

  const tableOfContents = page.getByRole("navigation", { name: "Documentation sections" });
  await expect(tableOfContents.getByRole("link", { name: "Host agent" })).toHaveAttribute(
    "href",
    "#host-agent",
  );
  await tableOfContents.getByRole("link", { name: "Host agent" }).click();
  await expect(page).toHaveURL(/\/docs#host-agent$/);

  await expect(page.getByText("iw-agent enroll --api-url")).toBeVisible();
  await expect(page.getByText("iw-agent run --incident <incident-uuid>")).toBeVisible();
  await expect(page.getByText("RenterClient.enroll")).toBeVisible();
  await expect(page.getByText("iw-rules-v1")).toBeVisible();
  await expect(
    page.getByText("A valid signature establishes integrity and provenance"),
  ).toBeVisible();
  await expect(page.getByText("docs/HOST_AGENT.md")).toBeVisible();
  await expect(page.getByText("docs/RENTER_SDK.md")).toBeVisible();
});

test("every public link resolves and every same-page anchor target exists", async ({
  page,
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const checked = new Set<string>();

  for (const route of crawlablePublicRoutes) {
    await page.goto(route);

    await expect(page.locator('a[href="#"]')).toHaveCount(0);

    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );

    for (const href of hrefs) {
      if (href.startsWith("#")) {
        const targetId = href.slice(1);
        await expect(page.locator(`#${targetId}`)).toBeAttached();
        continue;
      }

      const target = new URL(href, baseURL);
      if (target.origin !== new URL(baseURL).origin) {
        expect(target.protocol).toBe("https:");
        continue;
      }

      const relative = `${target.pathname}${target.search}`;
      if (checked.has(relative)) continue;
      checked.add(relative);

      const response = await request.get(relative, { maxRedirects: 5 });
      expect(response.status(), `${route} links to ${relative}`).toBeLessThan(400);
    }
  }
});

test("footer links to real documentation, legal, verifier and repository destinations", async ({
  page,
}) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  const destinations = [
    ["Documentation", "/docs"],
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["Verify", "/verify"],
  ] as const;

  for (const [name, href] of destinations) {
    const link = footer.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", href);
  }

  await expect(footer.getByRole("link", { name: /GitHub repository/i })).toHaveAttribute(
    "href",
    "https://github.com/onyebuchidaniel60/incident-witness",
  );
});

test("skip link is keyboard reachable, visible and focuses the main landmark", async ({ page }) => {
  await page.goto("/docs");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  const outlineWidth = await skipLink.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outlineWidth.style).not.toBe("none");
  expect(Number.parseFloat(outlineWidth.width)).toBeGreaterThan(0);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/docs#main-content$/);
  const activeElementId = await page.evaluate(() => document.activeElement?.id ?? "");
  expect(activeElementId).toBe("main-content");
});

test("public pages use one h1 and every interactive control has an accessible name", async ({
  page,
}) => {
  for (const route of crawlablePublicRoutes) {
    await page.goto(route);

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const unnamedControls = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
      );

      return controls
        .filter((control) => {
          if (control.closest("[hidden]")) return false;
          const style = window.getComputedStyle(control);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            control.getClientRects().length > 0
          );
        })
        .filter((control) => {
          if (
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement
          ) {
            if (
              control instanceof HTMLInputElement &&
              ["hidden", "submit", "reset"].includes(control.type)
            ) {
              return false;
            }
            return !(
              (control as HTMLInputElement).labels?.length ||
              control.getAttribute("aria-label") ||
              control.getAttribute("aria-labelledby") ||
              control.getAttribute("title")
            );
          }

          return !(
            (control.textContent ?? "").trim() ||
            control.getAttribute("aria-label") ||
            control.getAttribute("aria-labelledby") ||
            control.getAttribute("title")
          );
        })
        .map((control) => control.outerHTML.slice(0, 180));
    });

    expect(unnamedControls, `${route} has controls without accessible names`).toEqual([]);
  }
});
