import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bundleSchema } from "@incident-witness/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runDemo, type DemoResult } from "../src/demo.js";

describe("Phase 3F demo harness", () => {
  let directory: string;
  let result: DemoResult;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "iw-demo-test-"));
    result = await runDemo({
      outputDirectory: directory,
      keepArtifacts: true,
      log: () => undefined,
    });
  }, 120_000);

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("seals a fully labelled simulated bundle that passes the CLI verifier", async () => {
    expect(result.validRun.exitCode).toBe(0);
    expect(result.validRun.stdout).toContain("Result: VALID");
    expect(result.validRun.stdout).toContain("[PASS] Manifest SHA-256 digest");
    expect(result.validRun.stdout).toContain("[PASS] Source event signatures");
    expect(result.validRun.stdout).not.toContain("[FAIL]");
    expect(result.simulationPresent).toBe(true);
    expect(result.assessment).toBe("POWER_RELATED");
    expect(result.evidenceGrade).toBe("LOW");

    const bundle = bundleSchema.parse(
      JSON.parse(await readFile(result.bundlePath, "utf8")) as unknown,
    );
    expect(bundle.manifest.simulation_present).toBe(true);
    expect(bundle.manifest.events.length).toBe(4);
    expect(bundle.manifest.events.every((entry) => entry.event.simulation_mode)).toBe(true);
    expect(bundle.manifest.assessment.code).toBe("POWER_RELATED");
  });

  it("detects a one-byte tamper of the sealed bundle", () => {
    expect(result.tamperedRun.exitCode).toBe(1);
    expect(result.tamperedRun.stdout).toContain("[FAIL] Manifest SHA-256 digest");
    expect(result.tamperedRun.stdout).toContain("[FAIL] Platform Ed25519 manifest signature");
    expect(result.tamperedRun.stdout).toContain("Result: INVALID");
  });
});
