import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const apiPort = 4100;
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const e2eDnsFile = "/tmp/opencode/iw-phase4-e2e-dns.json";

const apiEnvironment = {
  NODE_ENV: "test",
  PORT: String(apiPort),
  APP_BASE_URL: baseURL,
  IW_API_BASE_URL: apiURL,
  IW_ALLOWED_WEB_ORIGINS: `${baseURL},http://localhost:${port}`,
  IW_E2E_TEST_AUTH: "true",
  IW_E2E_TOKEN: "e2e-provider-token",
  IW_E2E_USER_ID: "f4444444-4444-4444-8444-444444444444",
  IW_E2E_DNS_FILE: e2eDnsFile,
  IW_ENABLE_DEMO_SESSIONS: "true",
  IW_LOG_LEVEL: "silent",
};

const webEnvironment = {
  NEXT_PUBLIC_API_BASE_URL: apiURL,
  NEXT_PUBLIC_IW_E2E_TEST_AUTH: "true",
  NEXT_PUBLIC_IW_E2E_TOKEN: "e2e-provider-token",
  NEXT_PUBLIC_IW_ENABLE_DEMO_SESSIONS: "true",
  IW_E2E_TEST_AUTH: "true",
  IW_E2E_TOKEN: "e2e-provider-token",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:api",
      cwd: path.resolve(__dirname, "../.."),
      url: `${apiURL}/health/live`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: apiEnvironment,
    },
    {
      command: `npm run dev -- --port ${port}`,
      cwd: __dirname,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: webEnvironment,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
