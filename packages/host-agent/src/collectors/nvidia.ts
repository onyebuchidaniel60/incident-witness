import type { GpuTelemetryPayload } from "@incident-witness/protocol";

import { runFixedCommand, type FixedCommandRunner } from "./exec.js";

export const NVIDIA_SMI_BINARY = "nvidia-smi";
export const NVIDIA_SMI_TIMEOUT_MS = 2_000;
export const NVIDIA_SMI_MAX_OUTPUT_BYTES = 64 * 1024;
export const NVIDIA_SMI_QUERY =
  "index,name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,driver_version";
export const NVIDIA_SMI_ARGS = Object.freeze([
  "-i",
  "0",
  `--query-gpu=${NVIDIA_SMI_QUERY}`,
  "--format=csv,noheader,nounits",
]);

const UNAVAILABLE_MARKERS = new Set(["", "n/a", "[n/a]", "[not supported]", "not supported"]);

function optionalNumber(
  value: string | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (UNAVAILABLE_MARKERS.has(trimmed.toLowerCase())) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return undefined;
  return parsed;
}

function optionalInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed = optionalNumber(value, minimum, maximum);
  if (parsed === undefined || !Number.isSafeInteger(parsed)) return undefined;
  return parsed;
}

function optionalText(value: string | undefined, maximumLength: number): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || UNAVAILABLE_MARKERS.has(trimmed.toLowerCase())) return undefined;
  return trimmed.slice(0, maximumLength);
}

export function parseNvidiaSmiOutput(stdout: string): GpuTelemetryPayload {
  const line = stdout
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);

  if (!line) {
    return { collection_status: "unavailable" };
  }

  const fields = line.split(",").map((field) => field.trim());
  if (fields.length < 8) {
    return { collection_status: "unavailable" };
  }

  const deviceIndex = optionalInteger(fields[0], 0, 1_000_000);
  const model = optionalText(fields[1], 100);
  const temperature = optionalNumber(fields[2], -40, 150);
  const utilization = optionalNumber(fields[3], 0, 100);
  const memoryUsed = optionalInteger(fields[4], 0, Number.MAX_SAFE_INTEGER);
  const memoryTotal = optionalInteger(fields[5], 0, Number.MAX_SAFE_INTEGER);
  const powerDraw = optionalNumber(fields[6], 0, 2_000);
  const driverVersion = optionalText(fields[7], 40);

  const coreValues = [temperature, utilization, memoryUsed, memoryTotal, powerDraw];
  const availableCount = coreValues.filter((value) => value !== undefined).length;

  if (!model && availableCount === 0) {
    return { collection_status: "unavailable" };
  }

  const payload: GpuTelemetryPayload = {
    ...(deviceIndex === undefined ? {} : { device_index: deviceIndex }),
    ...(model === undefined ? {} : { vendor: "NVIDIA", model }),
    ...(temperature === undefined ? {} : { temperature_c: temperature }),
    ...(utilization === undefined ? {} : { utilization_percent: utilization }),
    ...(memoryUsed === undefined ? {} : { memory_used_mib: memoryUsed }),
    ...(memoryTotal === undefined ? {} : { memory_total_mib: memoryTotal }),
    ...(powerDraw === undefined ? {} : { power_draw_w: powerDraw }),
    ...(driverVersion === undefined ? {} : { driver_version: driverVersion }),
    collection_status: availableCount === coreValues.length ? "available" : "partial",
  };

  return payload;
}

export class NvidiaSmiCollector {
  constructor(private readonly runner: FixedCommandRunner = runFixedCommand) {}

  async collect(): Promise<GpuTelemetryPayload> {
    try {
      const stdout = await this.runner(NVIDIA_SMI_BINARY, NVIDIA_SMI_ARGS, {
        timeoutMs: NVIDIA_SMI_TIMEOUT_MS,
        maxBufferBytes: NVIDIA_SMI_MAX_OUTPUT_BYTES,
      });
      return parseNvidiaSmiOutput(stdout);
    } catch {
      return { collection_status: "unavailable" };
    }
  }
}
