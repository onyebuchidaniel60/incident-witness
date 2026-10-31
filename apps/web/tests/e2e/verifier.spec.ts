import { expect, test } from "@playwright/test";

import { makeBundleFixture } from "./support/bundle";

test("local verifier accepts a valid bundle without uploading it", async ({ page }) => {
  const bundle = makeBundleFixture();
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http://127.0.0.1:4100/")) apiRequests.push(request.url());
  });

  await page.goto("/verify");
  await expect(
    page.getByRole("heading", { level: 1, name: "Verify an evidence bundle" }),
  ).toBeVisible();
  await expect(page.getByText("The file is processed entirely in this browser tab.")).toBeVisible();

  await page.getByLabel("Evidence bundle JSON").setInputFiles({
    name: "valid-bundle.json",
    mimeType: "application/json",
    buffer: bundle,
  });

  await expect(page.getByText("VALID", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Bundle integrity and listed signatures verified.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Manifest SHA-256 digest")).toBeVisible();
  await expect(page.getByText("Source event signatures (1)")).toBeVisible();
  await expect(
    page
      .getByText("Verification confirms integrity and signatures relative to trusted keys.", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("local verifier detects a one-byte tampered bundle", async ({ page }) => {
  const tampered = makeBundleFixture({ tampered: true });

  await page.goto("/verify");
  await page.getByLabel("Evidence bundle JSON").setInputFiles({
    name: "tampered-bundle.json",
    mimeType: "application/json",
    buffer: tampered,
  });

  await expect(page.getByText("INVALID", { exact: true })).toBeVisible();
  await expect(
    page.getByText("One or more integrity or signature checks failed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Manifest SHA-256 digest")).toBeVisible();
  await expect(page.getByText("FAIL", { exact: true })).toHaveCount(2);
});
