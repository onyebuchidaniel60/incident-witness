import { describe, expect, it } from "vitest";

import { inject, registerIntegrationHooks } from "./harness.js";

registerIntegrationHooks();

describe("API readiness", () => {
  it("reports ready against the current migration ledger", async () => {
    const response = await inject("GET", "/health/ready", null, undefined, {
      authorization: "Bearer integration-health-token-1234567890",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });
});
