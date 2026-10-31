import { describe, expect, it } from "vitest";

import { createLogger } from "../src/log.js";

describe("safe logging", () => {
  it("redacts credential, token, secret and private-key fields", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "debug", sink: (line) => lines.push(line) });

    logger.info("test", {
      hostId: "host-1",
      credential: "should-not-appear",
      token: "should-not-appear",
      secret: "should-not-appear",
      privateKey: "should-not-appear",
      authorization: "should-not-appear",
    });

    const output = lines.join("\n");
    expect(output).toContain("host-1");
    expect(output).not.toContain("should-not-appear");
    expect(output).toContain("[redacted]");
  });
});
