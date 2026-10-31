import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { runFixedCommand, type FixedCommandRunner } from "../src/collectors/exec.js";
import {
  NvidiaSmiCollector,
  NVIDIA_SMI_ARGS,
  NVIDIA_SMI_MAX_OUTPUT_BYTES,
  NVIDIA_SMI_TIMEOUT_MS,
  parseNvidiaSmiOutput,
} from "../src/collectors/nvidia.js";
import {
  assertSafeUpsDevice,
  parseUpscOutput,
  UpscCollector,
  UPSC_MAX_OUTPUT_BYTES,
  UPSC_TIMEOUT_MS,
} from "../src/collectors/ups.js";

describe("nvidia-smi collector", () => {
  const validLine =
    "0, NVIDIA GeForce RTX 4090, 55, 91, 1024, 24564, 301.25, 550.54";

  it("parses the fixed summary fields", () => {
    expect(parseNvidiaSmiOutput(validLine)).toEqual({
      device_index: 0,
      vendor: "NVIDIA",
      model: "NVIDIA GeForce RTX 4090",
      temperature_c: 55,
      utilization_percent: 91,
      memory_used_mib: 1024,
      memory_total_mib: 24564,
      power_draw_w: 301.25,
      driver_version: "550.54",
      collection_status: "available",
    });
  });

  it("represents unavailable values as partial or unavailable instead of normal", () => {
    const partial = parseNvidiaSmiOutput(
      "0, NVIDIA A100, [N/A], 0, 100, 40000, [N/A], 535.104",
    );
    expect(partial.collection_status).toBe("partial");
    expect(partial.temperature_c).toBeUndefined();
    expect(partial.power_draw_w).toBeUndefined();
    expect(partial.utilization_percent).toBe(0);

    expect(parseNvidiaSmiOutput("[N/A], [N/A], [N/A], [N/A], [N/A], [N/A], [N/A], [N/A]")).toEqual(
      { collection_status: "unavailable" },
    );
    expect(parseNvidiaSmiOutput("")).toEqual({ collection_status: "unavailable" });
    expect(parseNvidiaSmiOutput("malformed output")).toEqual({ collection_status: "unavailable" });
  });

  it("invokes only the fixed executable and arguments with a timeout and output cap", async () => {
    const runner = vi.fn<FixedCommandRunner>(async () => validLine);
    const collector = new NvidiaSmiCollector(runner);

    const payload = await collector.collect();

    expect(payload.collection_status).toBe("available");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("nvidia-smi", NVIDIA_SMI_ARGS, {
      timeoutMs: NVIDIA_SMI_TIMEOUT_MS,
      maxBufferBytes: NVIDIA_SMI_MAX_OUTPUT_BYTES,
    });
    expect(NVIDIA_SMI_ARGS.every((argument) => typeof argument === "string")).toBe(true);
    expect(Object.isFrozen(NVIDIA_SMI_ARGS)).toBe(true);
  });

  it("reports unavailable on timeout or command failure", async () => {
    const runner: FixedCommandRunner = async () => {
      throw new Error("ETIMEDOUT");
    };
    const collector = new NvidiaSmiCollector(runner);

    expect(await collector.collect()).toEqual({ collection_status: "unavailable" });
  });
});

describe("upsc collector", () => {
  it("parses allow-listed NUT values", () => {
    expect(
      parseUpscOutput("ups.status: OL\nbattery.charge: 100\nbattery.runtime: 3600\n"),
    ).toEqual({ state: "online", chargePercent: 100, runtimeSeconds: 3600 });

    expect(parseUpscOutput("ups.status: OB LB\nbattery.charge: 4.5\n")).toEqual({
      state: "low_battery",
      chargePercent: 4.5,
    });

    expect(parseUpscOutput("ups.status: OB\n")).toEqual({ state: "on_battery" });
    expect(parseUpscOutput("ups.status: BOOST\n")).toEqual({ state: "unknown" });
  });

  it("reports unavailable for malformed or missing status output", () => {
    expect(parseUpscOutput("")).toEqual({ state: "unavailable" });
    expect(parseUpscOutput("battery.charge: 100\n")).toEqual({ state: "unavailable" });
    expect(parseUpscOutput("not a NUT response")).toEqual({ state: "unavailable" });
  });

  it("passes the configured alias as one fixed argument and reports command failure", async () => {
    const runner = vi.fn<FixedCommandRunner>(async () => {
      throw new Error("ENOENT");
    });
    const collector = new UpscCollector("my-ups", runner);

    expect(await collector.collect()).toEqual({
      ups_alias: "my-ups",
      state: "unavailable",
    });
    expect(runner).toHaveBeenCalledWith("upsc", ["my-ups"], {
      timeoutMs: UPSC_TIMEOUT_MS,
      maxBufferBytes: UPSC_MAX_OUTPUT_BYTES,
    });
  });

  it("rejects aliases that are not plain device names", () => {
    for (const alias of ["", "ups; rm -rf /", "../ups", "..", "ups name", "$(id)"]) {
      expect(() => assertSafeUpsDevice(alias)).toThrow();
    }

    expect(() => assertSafeUpsDevice("apc-1.local_ups")).not.toThrow();
  });
});

describe("fixed command execution", () => {
  it("executes a fixed argument array without a shell", async () => {
    const output = await runFixedCommand(
      process.execPath,
      ["-e", "process.stdout.write('safe-output')"],
      { timeoutMs: 2_000, maxBufferBytes: 1_024 },
    );

    expect(output).toBe("safe-output");
  });

  it("enforces the timeout and output cap", async () => {
    await expect(
      runFixedCommand(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
        timeoutMs: 100,
        maxBufferBytes: 1_024,
      }),
    ).rejects.toThrow();

    await expect(
      runFixedCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"], {
        timeoutMs: 2_000,
        maxBufferBytes: 100,
      }),
    ).rejects.toThrow();
  });

  it("does not use child_process.exec or shell interpolation", () => {
    const source = readFileSync(new URL("../src/collectors/exec.ts", import.meta.url), "utf8");

    expect(source).toContain("execFile");
    expect(source).toContain("shell: false");
    expect(source).not.toMatch(/\bexec\s*\(/);
  });
});
