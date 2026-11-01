/**
 * Records the Incident Witness demo flow at 1280x720.
 *
 * The local E2E web/API servers and the demo seed must already be running.
 * The recorder writes the raw browser video plus a small timeline file that
 * the FFmpeg assembly step uses to align the voiceover.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(SCRIPT_DIR, "assets");
const RAW_DIR = resolve(SCRIPT_DIR, "raw");
const STATE_FILE = resolve(SCRIPT_DIR, "demo-state.json");
const TIMELINE_FILE = resolve(SCRIPT_DIR, "timeline.json");

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3110";
const E2E_TOKEN = process.env.IW_E2E_TOKEN ?? "demo-provider-token";
const E2E_COOKIE = "iw_e2e_session";

const SCENE_STARTS = [0, 15, 35, 55, 70, 90, 105];
const TOTAL_SECONDS = 135;

type DemoState = {
  incidentId: string;
  incidentTitle: string;
  bundlePath: string;
};

function tamperOneByte(source: Buffer): Buffer {
  const needle = Buffer.from('"host_alias":"', "utf8");
  const index = source.indexOf(needle);
  if (index < 0) throw new Error("Could not find host_alias in the downloaded bundle");

  const valueStart = index + needle.length;
  const output = Buffer.from(source);
  const original = output[valueStart];

  if (original === undefined) throw new Error("Bundle host_alias has no value");
  if (original === 0x53) output[valueStart] = 0x54;
  else if (original === 0x41) output[valueStart] = 0x42;
  else output[valueStart] = original === 0x42 ? 0x43 : 0x42;

  return output;
}

async function main(): Promise<void> {
  await mkdir(ASSETS_DIR, { recursive: true });
  await mkdir(RAW_DIR, { recursive: true });

  const state = JSON.parse(await readFile(STATE_FILE, "utf8")) as DemoState;
  const validBundlePath = resolve(ASSETS_DIR, "demo-bundle.json");
  const tamperedBundlePath = resolve(ASSETS_DIR, "demo-bundle-tampered.json");

  const browser = await chromium.launch({ headless: true });

  // Compile the Next dev routes and load API data before the recording clock
  // starts. Without this, first-load compilation can leave a loading state on
  // screen at a scene boundary.
  const warmupContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
  });
  await warmupContext.addCookies([
    {
      name: E2E_COOKIE,
      value: E2E_TOKEN,
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);
  const warmupPage = await warmupContext.newPage();
  try {
    await warmupPage.goto("/", { waitUntil: "domcontentloaded" });
    await warmupPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await warmupPage.getByRole("heading", { level: 1, name: "Provider dashboard" }).waitFor();
    await warmupPage.goto(`/incidents/${state.incidentId}`, { waitUntil: "domcontentloaded" });
    await warmupPage.getByRole("heading", { name: "Evidence timeline" }).waitFor();
    await warmupPage.goto("/verify", { waitUntil: "domcontentloaded" });
    await warmupPage
      .getByRole("heading", { level: 1, name: "Verify an evidence bundle" })
      .waitFor();
  } catch (error) {
    console.warn(
      `[demo] warmup did not complete cleanly: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await warmupContext.close();

  const startedAt = Date.now();
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: RAW_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  await context.addCookies([
    {
      name: E2E_COOKIE,
      value: E2E_TOKEN,
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript({
    content: `
      (() => {
        const installDemoChrome = () => {
          const style = document.createElement("style");
          style.id = "iw-demo-chrome";
          style.textContent = "nextjs-portal{display:none!important}";
          (document.head || document.documentElement).appendChild(style);
        };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", installDemoChrome, { once: true });
        } else {
          installDemoChrome();
        }

        const installCursor = () => {
          if (document.getElementById("iw-demo-cursor")) return;
          const cursor = document.createElement("div");
          cursor.id = "iw-demo-cursor";
          cursor.setAttribute("aria-hidden", "true");
          cursor.style.cssText = [
            "position:fixed",
            "left:50%",
            "top:50%",
            "width:18px",
            "height:18px",
            "border:2px solid #26D18C",
            "border-radius:9999px",
            "background:rgba(38,209,140,0.18)",
            "box-shadow:0 0 18px rgba(38,209,140,0.75)",
            "pointer-events:none",
            "transform:translate(-50%,-50%)",
            "transition:width 120ms ease,height 120ms ease,background 120ms ease",
            "z-index:2147483647",
          ].join(";");
          document.body.appendChild(cursor);
          window.addEventListener("mousemove", (event) => {
            cursor.style.left = event.clientX + "px";
            cursor.style.top = event.clientY + "px";
          });
          window.addEventListener("mousedown", () => {
            cursor.style.width = "28px";
            cursor.style.height = "28px";
            cursor.style.background = "rgba(38,209,140,0.36)";
          });
          window.addEventListener("mouseup", () => {
            cursor.style.width = "18px";
            cursor.style.height = "18px";
            cursor.style.background = "rgba(38,209,140,0.18)";
          });
        };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", installCursor, { once: true });
        } else {
          installCursor();
        }
      })();
    `,
  });

  const scene = (seconds: number) => startedAt + seconds * 1000;

  async function holdUntil(seconds: number, label: string): Promise<void> {
    const remaining = scene(seconds) - Date.now();
    if (remaining > 0) {
      await page.waitForTimeout(remaining);
      return;
    }
    console.warn(`[demo] ${label} overran its scene by ${Math.abs(remaining)} ms`);
  }

  async function pointAt(locator: ReturnType<typeof page.locator>): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
    await page.waitForTimeout(220);
  }

  // Scene 1 — public homepage (explicit 5 second hold).
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(5_000);
  await page.evaluate(() => window.scrollBy({ top: 360, behavior: "smooth" }));
  await holdUntil(11, "homepage scroll");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await holdUntil(13.5, "homepage");

  // Scene 2 — authenticated workspace via the header Workspace link.
  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  if ((await primaryNav.getByRole("link", { name: "Login" }).count()) !== 0) {
    throw new Error("Authenticated header still exposes the Login link");
  }
  const workspaceLink = primaryNav.getByRole("link", { name: "Workspace" });
  if ((await workspaceLink.count()) !== 1) {
    throw new Error("Authenticated header does not expose exactly one Workspace link");
  }
  await pointAt(workspaceLink);
  await workspaceLink.click();
  await page.getByRole("heading", { level: 1, name: "Provider dashboard" }).waitFor();
  await holdUntil(SCENE_STARTS[1]!, "dashboard entry");
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.scrollBy({ top: 260, behavior: "smooth" }));
  await holdUntil(27, "dashboard");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await holdUntil(33.5, "dashboard");

  // Scene 3 — deterministic timeline from the seeded sealed incident.
  const incidentLink = page.getByRole("link", { name: state.incidentTitle, exact: true });
  await pointAt(incidentLink);
  await incidentLink.click();
  await page.getByRole("heading", { level: 1, name: "Evidence session" }).waitFor();
  await holdUntil(SCENE_STARTS[2]!, "timeline entry");
  const timelineHeading = page.getByRole("heading", { name: "Evidence timeline" });
  await timelineHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const lastTimelineEvent = page.locator(".iw-timeline-event").last();
  await lastTimelineEvent.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2_500);
  const probeEventChip = lastTimelineEvent.locator(".iw-chip-probe");
  if ((await probeEventChip.count()) > 0) {
    await pointAt(probeEventChip);
    await page.waitForTimeout(1_500);
  }
  await timelineHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await pointAt(page.locator(".iw-chip-host").first());
  await pointAt(page.locator(".iw-chip-renter").first());
  await pointAt(page.locator(".iw-chip-probe").first());
  await holdUntil(SCENE_STARTS[3]!, "timeline");

  // Scene 4 — sealed bundle download.
  const downloadButton = page.getByRole("button", { name: "Download sealed bundle" });
  await pointAt(downloadButton);
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  await download.saveAs(validBundlePath);
  await page.getByText(/Downloaded incident-witness-/).waitFor();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await holdUntil(SCENE_STARTS[4]!, "download");

  // Scene 5 — local browser verifier with the downloaded bundle.
  await page.goto("/verify", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: "Verify an evidence bundle" }).waitFor();
  const fileInput = page.locator("#bundle-file");
  await fileInput.setInputFiles(validBundlePath);
  await page.getByText("VALID", { exact: true }).waitFor();
  await page.getByText("VALID", { exact: true }).scrollIntoViewIfNeeded();
  await holdUntil(SCENE_STARTS[5]!, "valid verification");

  // Scene 6 — change one byte on disk and verify the tampered copy.
  const original = await readFile(validBundlePath);
  await writeFile(tamperedBundlePath, tamperOneByte(original));
  const clearButton = page.getByRole("button", { name: "Clear result" });
  if (await clearButton.isVisible().catch(() => false)) {
    await pointAt(clearButton);
    await clearButton.click();
  }
  await fileInput.setInputFiles(tamperedBundlePath);
  await page.getByText("INVALID", { exact: true }).waitFor();
  await page.getByText("INVALID", { exact: true }).scrollIntoViewIfNeeded();
  await page
    .getByText("One or more integrity or signature checks failed", { exact: false })
    .waitFor();
  await holdUntil(SCENE_STARTS[6]!, "tampered verification");

  // Scene 7 — close on the public project and repository link.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  const footer = page.locator("footer");
  await footer.scrollIntoViewIfNeeded();
  const githubLink = footer.getByRole("link", { name: /GitHub/i });
  if (await githubLink.isVisible().catch(() => false)) {
    await pointAt(githubLink);
  }
  await holdUntil(TOTAL_SECONDS, "outro");

  const video = page.video();
  await context.close();
  await browser.close();

  if (pageErrors.length > 0) {
    throw new Error(`Browser page errors during recording: ${pageErrors.slice(0, 5).join(" | ")}`);
  }

  const rawVideo = video ? await video.path() : null;
  if (!rawVideo) throw new Error("Playwright did not produce a video recording");

  await writeFile(
    TIMELINE_FILE,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        durationSeconds: TOTAL_SECONDS,
        sceneStarts: SCENE_STARTS,
        rawVideo,
        validBundlePath,
        tamperedBundlePath,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Recorded raw video at ${rawVideo}`);
  console.log(`Valid bundle: ${validBundlePath}`);
  console.log(`Tampered bundle: ${tamperedBundlePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
