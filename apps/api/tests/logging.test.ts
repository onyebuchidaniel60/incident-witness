import { describe, expect, it } from "vitest";

import { loggerRedaction } from "../src/logging.js";

describe("API log redaction configuration", () => {
  it("covers root-level and nested secret fields", () => {
    for (const path of [
      "authorization",
      "cookie",
      "set-cookie",
      "token",
      "password",
      "secret",
      "credential",
      "privateKey",
      "accessToken",
      "refreshToken",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.authorization",
      "*.cookie",
      "*.token",
      "*.password",
      "*.secret",
      "*.credential",
      "*.privateKey",
    ]) {
      expect(loggerRedaction.paths).toContain(path);
    }

    expect(loggerRedaction.censor).toBe("[REDACTED]");
  });
});
