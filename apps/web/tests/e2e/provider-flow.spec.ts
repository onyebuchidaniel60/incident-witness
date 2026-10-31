import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  API_URL,
  enrollHost,
  enrollRenter,
  getIncident,
  sendPresenceWithCredential,
  sendSignedEvent,
} from "./support/api";
import { cleanupE2eData, seedE2eUser } from "./support/db";

const DNS_FILE = "/tmp/opencode/iw-phase4-e2e-dns.json";

async function writeMockDns(input: {
  hostname: string;
  recordName: string;
  value: string;
}): Promise<void> {
  await mkdir("/tmp/opencode", { recursive: true });
  await writeFile(
    DNS_FILE,
    JSON.stringify({
      txt: { [input.recordName]: [input.value] },
      addresses: { [input.hostname]: [{ address: "93.184.216.34", family: 4 }] },
    }),
    "utf8",
  );
}

test.beforeAll(async () => {
  await cleanupE2eData();
  await seedE2eUser();
});

test.afterAll(async () => {
  await cleanupE2eData();
});

test("provider lifecycle: host proof, session, renter, seal and download", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The full provider journey is covered on desktop; mobile shell checks run separately.",
  );
  test.setTimeout(120_000);

  const suffix = `${Date.now()}`.slice(-8);
  const hostAlias = `Phase 4 E2E host ${suffix}`;
  const hostname = `e2e-${suffix}.incident-witness.dev`;
  const incidentTitle = `SIMULATED Phase 4 power flow ${suffix}`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as local test provider" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Provider dashboard" })).toBeVisible();
  await expect(page.getByText("No hosts yet")).toBeVisible();

  await page.getByRole("link", { name: "Add a host" }).click();
  await expect(page).toHaveURL(/\/hosts\/new$/);
  await page.getByLabel("Host alias").fill(hostAlias);
  await page.getByLabel("Public hostname").fill(hostname);
  await page.getByRole("button", { name: "Create host" }).click();

  await expect(page).toHaveURL(/\/hosts\/[0-9a-f-]{36}$/);
  const hostId = page.url().split("/").at(-1);
  if (!hostId) throw new Error("host id missing from URL");
  await expect(page.getByRole("heading", { level: 1, name: "Host detail" })).toBeVisible();
  await expect(page.getByText("Endpoint not verified")).toBeVisible();

  await page.getByRole("button", { name: "Create DNS challenge" }).click();
  const recordName = (await page.getByTestId("dns-record-name").textContent())?.trim();
  const recordValue = (await page.getByTestId("dns-record-value").textContent())?.trim();
  if (!recordName || !recordValue) throw new Error("DNS challenge was not displayed");
  await writeMockDns({ hostname, recordName, value: recordValue });

  await page.getByRole("button", { name: "Verify DNS" }).click();
  await expect(
    page.getByText("Endpoint verified. You can now issue a one-time agent enrollment code."),
  ).toBeVisible();
  await expect(page.getByText("Ready for agent enrollment")).toBeVisible();

  await page.getByRole("button", { name: "Issue enrollment code" }).click();
  const enrollmentCode = (await page.getByTestId("enrollment-code").textContent())?.trim();
  if (!enrollmentCode) throw new Error("enrollment code was not displayed");

  const host = await enrollHost(enrollmentCode);
  await sendPresenceWithCredential({
    hostId,
    credential: host.credential,
    privateKey: host.privateKey,
    sequence: 1,
  });
  await page.reload();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();

  await page.goto("/incidents/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "Start an evidence session" }),
  ).toBeVisible();
  await page.locator("#hostId").selectOption({ index: 1 });
  await page.getByLabel("Session title").fill(incidentTitle);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start evidence session" }).click();

  await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]{36}$/);
  const incidentId = page.url().split("/").at(-1);
  if (!incidentId) throw new Error("incident id missing from URL");
  await expect(page.getByRole("heading", { level: 1, name: "Evidence session" })).toBeVisible();
  await expect(page.getByText("Collecting", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Demo / simulated evidence")).toBeVisible();

  const incident = await getIncident(incidentId);
  const captureStart = Date.parse(incident.data.captureStartedAt);
  const at = (offset: number) => new Date(captureStart + offset).toISOString();

  await sendSignedEvent({
    path: "/v1/agent/events",
    credential: host.credential,
    incidentId,
    sourceKeyId: host.sourceKeyId,
    sourceType: "host_agent",
    eventType: "host_heartbeat",
    sequence: 1,
    observedAt: at(1_000),
    payload: {
      agent_version: "0.1.0-e2e",
      os_family: "linux",
      os_version: "synthetic",
      uptime_seconds: 600,
      agent_health: "ok",
    },
    privateKey: host.privateKey,
  });
  await sendSignedEvent({
    path: "/v1/agent/events",
    credential: host.credential,
    incidentId,
    sourceKeyId: host.sourceKeyId,
    sourceType: "host_agent",
    eventType: "host_power_state",
    sequence: 2,
    observedAt: at(1_200),
    payload: {
      ups_alias: "simulated-ups",
      state: "on_battery",
      charge_percent: 88,
      runtime_seconds: 300,
    },
    privateKey: host.privateKey,
  });

  await page.getByRole("button", { name: "Create renter invitation" }).click();
  const invitationToken = (await page.getByTestId("invitation-token").textContent())?.trim();
  if (!invitationToken) throw new Error("renter invitation token was not displayed");
  await expect(page.getByText("Expires:", { exact: false })).toBeVisible();
  await expect(page.getByText("single-use", { exact: false })).toBeVisible();

  const renter = await enrollRenter(invitationToken);
  await sendSignedEvent({
    path: "/v1/renter/events",
    credential: renter.credential,
    incidentId,
    sourceKeyId: renter.sourceKeyId,
    sourceType: "renter_client",
    eventType: "renter_heartbeat",
    sequence: 1,
    observedAt: at(1_000),
    payload: {
      sdk_version: "0.1.0-e2e",
      workload_ref: "synthetic-phase4",
      client_state: "running",
    },
    privateKey: renter.privateKey,
  });
  await sendSignedEvent({
    path: "/v1/renter/events",
    credential: renter.credential,
    incidentId,
    sourceKeyId: renter.sourceKeyId,
    sourceType: "renter_client",
    eventType: "renter_endpoint_result",
    sequence: 2,
    observedAt: at(1_400),
    payload: {
      result: "unreachable",
      latency_ms: 3_000,
      failure_category: "timeout",
    },
    privateKey: renter.privateKey,
  });

  await page.waitForTimeout(Math.max(0, captureStart + 2_000 - Date.now()));
  await page.reload();
  await expect(page.getByText("host_power_state", { exact: true })).toBeVisible();
  await expect(page.getByText("renter_endpoint_result", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "End capture" }).click();
  await page.getByRole("button", { name: "Confirm end" }).click();
  await expect(page.getByText("Awaiting finalization", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Seal evidence bundle" }).click();
  await page.getByRole("button", { name: "Seal bundle" }).click();
  await expect(page.getByText("Sealed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("POWER_RELATED")).toBeVisible();
  await expect(page.getByText("Evidence grade LOW")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download sealed bundle" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("incident-witness-");
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  const bundleResponse = await fetch(`${API_URL}/v1/incidents/${incidentId}/bundle`, {
    headers: { authorization: "Bearer e2e-provider-token" },
  });
  expect(bundleResponse.status).toBe(200);
  expect(bundleResponse.headers.get("content-type")).toContain(
    "application/vnd.incident-witness.bundle+json",
  );
});
