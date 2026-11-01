/**
 * Records the Incident Witness demo flow at 1280x720.
 *
 * The local E2E web/API servers and the demo seed must already be running.
 * Scene durations are read from the generated narration files with ffprobe so
 * the recording follows the voiceover instead of a hardcoded timeline.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(SCRIPT_DIR, "assets");
const AUDIO_DIR = resolve(SCRIPT_DIR, "audio");
const RAW_DIR = resolve(SCRIPT_DIR, "raw");
const STATE_FILE = resolve(SCRIPT_DIR, "demo-state.json");
const TIMELINE_FILE = resolve(SCRIPT_DIR, "timeline.json");

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3110";
const E2E_TOKEN = process.env.IW_E2E_TOKEN ?? "demo-provider-token";
const E2E_COOKIE = "iw_e2e_session";
const SCENE_BREATHING_SECONDS = 1;

type DemoState = {
  incidentId: string;
  incidentTitle: string;
  bundlePath: string;
};

type SceneCapture = {
  index: number;
  label: string;
  audioFile: string;
  audioDurationSeconds: number;
  durationSeconds: number;
  startOffsetMs: number;
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

function ffprobeDuration(file: string): number {
  const output = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" },
  );
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read a positive duration from ${file}`);
  }
  return duration;
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

  const scenes: SceneCapture[] = [];

  async function pointAt(locator: ReturnType<typeof page.locator>): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
    await page.waitForTimeout(220);
  }

  async function captureScene(input: {
    index: number;
    label: string;
    action?: () => Promise<void>;
  }): Promise<void> {
    const audioFile = resolve(AUDIO_DIR, `scene-${input.index}.wav`);
    const audioDurationSeconds = ffprobeDuration(audioFile);
    const durationSeconds = audioDurationSeconds + SCENE_BREATHING_SECONDS;
    const startOffsetMs = Date.now() - startedAt;
    const sceneEndsAt = startedAt + startOffsetMs + durationSeconds * 1000;

    if (input.action) await input.action();

    const remainingMs = sceneEndsAt - Date.now();
    if (remainingMs > 0) {
      await page.waitForTimeout(remainingMs);
    } else {
      console.warn(`[demo] ${input.label} overran its scene by ${Math.abs(remainingMs)} ms`);
    }

    scenes.push({
      index: input.index,
      label: input.label,
      audioFile,
      audioDurationSeconds,
      durationSeconds,
      startOffsetMs,
    });

    console.log(
      `[demo] scene ${input.index}: ${audioDurationSeconds.toFixed(2)}s audio + ${SCENE_BREATHING_SECONDS}s hold`,
    );
  }

  // Scene 1 — public homepage.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await captureScene({ index: 1, label: "homepage" });

  // Scene 2 — authenticated workspace.
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
  await captureScene({ index: 2, label: "dashboard" });

  // Scene 3 — deterministic three-source timeline.
  const incidentLink = page.getByRole("link", { name: state.incidentTitle, exact: true });
  await pointAt(incidentLink);
  await incidentLink.click();
  await page.getByRole("heading", { level: 1, name: "Evidence session" }).waitFor();
  const timelineHeading = page.getByRole("heading", { name: "Evidence timeline" });
  await timelineHeading.scrollIntoViewIfNeeded();
  await captureScene({
    index: 3,
    label: "timeline",
    action: async () => {
      await pointAt(page.locator(".iw-chip-host").first());
      await pointAt(page.locator(".iw-chip-renter").first());
      await pointAt(page.locator(".iw-chip-probe").first());
    },
  });

  // Scene 4 — sealed bundle download.
  const downloadButton = page.getByRole("button", { name: "Download sealed bundle" });
  await downloadButton.scrollIntoViewIfNeeded();
  await captureScene({
    index: 4,
    label: "download",
    action: async () => {
      await pointAt(downloadButton);
      const downloadPromise = page.waitForEvent("download");
      await downloadButton.click();
      const download = await downloadPromise;
      await download.saveAs(validBundlePath);
      await page.getByText(/Downloaded incident-witness-/).waitFor();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    },
  });

  // Scene 5 — local browser verifier with the downloaded bundle.
  await page.goto("/verify", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: "Verify an evidence bundle" }).waitFor();
  const fileInput = page.locator("#bundle-file");
  await captureScene({
    index: 5,
    label: "valid verification",
    action: async () => {
      await fileInput.setInputFiles(validBundlePath);
      await page.getByText("VALID", { exact: true }).waitFor();
      await page.getByText("VALID", { exact: true }).scrollIntoViewIfNeeded();
    },
  });

  // Scene 6 — change one byte on disk and verify the tampered copy.
  const original = await readFile(validBundlePath);
  await writeFile(tamperedBundlePath, tamperOneByte(original));
  await captureScene({
    index: 6,
    label: "tampered verification",
    action: async () => {
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
    },
  });

  // Scene 7 — close on the public project and repository link.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  const footer = page.locator("footer");
  await footer.scrollIntoViewIfNeeded();
  const githubLink = footer.getByRole("link", { name: /GitHub/i });
  await captureScene({
    index: 7,
    label: "outro",
    action: async () => {
      if (await githubLink.isVisible().catch(() => false)) {
        await pointAt(githubLink);
      }
    },
  });

  // Give the final frame a moment to settle before closing the recording.
  await page.waitForTimeout(500);

  const video = page.video();
  await context.close();
  await browser.close();

  if (pageErrors.length > 0) {
    throw new Error(`Browser page errors during recording: ${pageErrors.slice(0, 5).join(" | ")}`);
  }

  const rawVideo = video ? await video.path() : null;
  if (!rawVideo) throw new Error("Playwright did not produce a video recording");

  const expectedDurationSeconds = scenes.reduce(
    (maximum, scene) => Math.max(maximum, scene.startOffsetMs / 1000 + scene.durationSeconds),
    0,
  );
  const rawVideoDuration = ffprobeDuration(rawVideo);
  if (rawVideoDuration < expectedDurationSeconds - 0.5) {
    throw new Error(
      `Raw video is ${rawVideoDuration.toFixed(2)}s but the scene plan needs ${expectedDurationSeconds.toFixed(2)}s`,
    );
  }

  await writeFile(
    TIMELINE_FILE,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        rawVideo,
        rawVideoDurationSeconds: rawVideoDuration,
        validBundlePath,
        tamperedBundlePath,
        scenes,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Recorded raw video at ${rawVideo} (${rawVideoDuration.toFixed(2)}s)`);
  console.log(`Valid bundle: ${validBundlePath}`);
  console.log(`Tampered bundle: ${tamperedBundlePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
