import type { HostPowerStatePayload } from "@incident-witness/protocol";

import { UPS_DEVICE_PATTERN } from "../config.js";
import { runFixedCommand, type FixedCommandRunner } from "./exec.js";

export const UPSC_BINARY = "upsc";
export const UPSC_TIMEOUT_MS = 2_000;
export const UPSC_MAX_OUTPUT_BYTES = 64 * 1024;

type UpsReading = {
  state: HostPowerStatePayload["state"];
  chargePercent?: number;
  runtimeSeconds?: number;
};

function parseNumber(value: string, minimum: number, maximum: number): number | undefined {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return undefined;
  return parsed;
}

export function assertSafeUpsDevice(device: string): void {
  if (!UPS_DEVICE_PATTERN.test(device) || device === "." || device === "..") {
    throw new Error("The UPS device alias contains unsupported characters");
  }
}

export function parseUpscOutput(stdout: string): UpsReading {
  const values = new Map<string, string>();

  for (const line of stdout.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key.length > 0) values.set(key, value);
  }

  const status = values.get("ups.status");
  if (status === undefined) {
    return { state: "unavailable" };
  }

  const tokens = status
    .split(/\s+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);

  let state: HostPowerStatePayload["state"];
  if (tokens.includes("LB")) {
    state = "low_battery";
  } else if (tokens.includes("OB")) {
    state = "on_battery";
  } else if (tokens.includes("OL")) {
    state = "online";
  } else {
    state = "unknown";
  }

  const charge = values.get("battery.charge");
  const runtime = values.get("battery.runtime");
  const chargePercent = charge === undefined ? undefined : parseNumber(charge, 0, 100);
  const runtimeSeconds = runtime === undefined ? undefined : parseNumber(runtime, 0, 86_400_000);

  return {
    state,
    ...(chargePercent === undefined ? {} : { chargePercent }),
    ...(runtimeSeconds === undefined
      ? {}
      : { runtimeSeconds: Math.floor(runtimeSeconds) }),
  };
}

export class UpscCollector {
  constructor(
    private readonly device: string,
    private readonly runner: FixedCommandRunner = runFixedCommand,
  ) {
    assertSafeUpsDevice(device);
  }

  async collect(): Promise<HostPowerStatePayload> {
    try {
      const stdout = await this.runner(UPSC_BINARY, [this.device], {
        timeoutMs: UPSC_TIMEOUT_MS,
        maxBufferBytes: UPSC_MAX_OUTPUT_BYTES,
      });
      const reading = parseUpscOutput(stdout);

      return {
        ups_alias: this.device,
        state: reading.state,
        ...(reading.chargePercent === undefined ? {} : { charge_percent: reading.chargePercent }),
        ...(reading.runtimeSeconds === undefined ? {} : { runtime_seconds: reading.runtimeSeconds }),
      };
    } catch {
      return { ups_alias: this.device, state: "unavailable" };
    }
  }
}
