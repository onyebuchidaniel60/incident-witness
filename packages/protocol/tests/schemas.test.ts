import { describe, expect, it } from "vitest";

import {
  bundleManifestSchema,
  eventBodySchema,
  eventEnvelopeSchema,
  sourceKeyCertificateSchema,
} from "../src/index.js";

const base = {
  protocol_version: "1.0" as const,
  event_id: "00000000-0000-4000-8000-000000000001",
  incident_id: "00000000-0000-4000-8000-000000000002",
  source_key_id: "00000000-0000-4000-8000-000000000003",
  sequence: 1,
  observed_at: "2026-10-30T12:00:00.000Z",
  simulation_mode: false,
  canonicalization: "RFC8785-JCS" as const,
  signature_algorithm: "Ed25519" as const,
};

const validEvents = [
  {
    ...base,
    source_type: "host_agent",
    event_type: "host_heartbeat",
    payload: {
      agent_version: "0.1.0",
      os_family: "linux",
      os_version: "6.8",
      uptime_seconds: 10,
      agent_health: "ok",
    },
  },
  {
    ...base,
    source_type: "host_agent",
    event_type: "host_power_state",
    payload: { ups_alias: "ups0", state: "on_battery", charge_percent: 70, runtime_seconds: 300 },
  },
  {
    ...base,
    source_type: "host_agent",
    event_type: "gpu_telemetry",
    payload: {
      device_index: 0,
      vendor: "NVIDIA",
      model: "A100",
      temperature_c: 42,
      utilization_percent: 91,
      memory_used_mib: 1000,
      memory_total_mib: 40960,
      power_draw_w: 250,
      driver_version: "550.1",
      collection_status: "available",
    },
  },
  {
    ...base,
    source_type: "host_agent",
    event_type: "host_agent_status",
    payload: { status: "started", agent_version: "0.1.0" },
  },
  {
    ...base,
    source_type: "renter_client",
    event_type: "renter_heartbeat",
    payload: {
      sdk_version: "0.1.0",
      workload_ref: "workload-opaque-ref",
      client_state: "running",
      latency_ms: 12,
    },
  },
  {
    ...base,
    source_type: "renter_client",
    event_type: "renter_endpoint_result",
    payload: { result: "reachable", latency_ms: 12 },
  },
  {
    ...base,
    source_type: "platform_probe",
    event_type: "platform_probe_result",
    payload: {
      target_host_id: "00000000-0000-4000-8000-000000000004",
      probe_status: "completed",
      dns_result: "resolved",
      tls_result: "valid",
      http_result: "expected",
      latency_ms: 90,
      response_class: "expected",
      observed_ip_class: "public",
    },
  },
  {
    ...base,
    source_type: "platform_probe",
    event_type: "source_gap",
    payload: {
      expected_interval_seconds: 30,
      missing_started_at: "2026-10-30T12:00:00.000Z",
      missing_ended_at: "2026-10-30T12:00:30.000Z",
      reason_code: "collector_unavailable",
    },
  },
] as const;

describe("strict v1 event schemas", () => {
  it("accepts all eight event types with their matching source types", () => {
    for (const event of validEvents) {
      expect(eventBodySchema.safeParse(event).success, event.event_type).toBe(true);
    }
  });

  it("rejects a source type that does not match the event type", () => {
    const event = {
      ...validEvents[0],
      source_type: "renter_client",
    };

    expect(eventBodySchema.safeParse(event).success).toBe(false);
  });

  it("rejects unknown payload properties and invalid envelope values", () => {
    expect(
      eventBodySchema.safeParse({
        ...validEvents[0],
        payload: { ...validEvents[0].payload, extra: "rejected" },
      }).success,
    ).toBe(false);
    expect(
      eventBodySchema.safeParse({
        ...validEvents[0],
        sequence: 0,
      }).success,
    ).toBe(false);
    expect(
      eventBodySchema.safeParse({
        ...validEvents[0],
        observed_at: "2026-10-30T12:00:00+01:00",
      }).success,
    ).toBe(false);
    expect(
      eventBodySchema.safeParse({
        ...validEvents[0],
        event_id: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("accepts an envelope only with a well-formed signature field", () => {
    const signature = Buffer.alloc(64, 0x01).toString("base64url");
    expect(eventEnvelopeSchema.safeParse({ ...validEvents[0], signature }).success).toBe(true);
    expect(eventEnvelopeSchema.safeParse(validEvents[0]).success).toBe(false);
    expect(
      eventEnvelopeSchema.safeParse({ ...validEvents[0], signature: "not-base64!" }).success,
    ).toBe(false);
  });

  it("enforces scoped source-key certificate shapes", () => {
    const certificate = {
      certificate_version: "1.0" as const,
      source_key_id: base.source_key_id,
      source_type: "host_agent" as const,
      public_key: Buffer.alloc(32, 0x02).toString("base64url"),
      fingerprint: "fingerprint",
      host_id: "00000000-0000-4000-8000-000000000004",
      issued_at: base.observed_at,
      protocol_version: "1.0" as const,
    };

    expect(sourceKeyCertificateSchema.safeParse(certificate).success).toBe(true);
    expect(
      sourceKeyCertificateSchema.safeParse({ ...certificate, source_type: "renter_client" }).success,
    ).toBe(false);
  });

  it("rejects oversized manifest event arrays", () => {
    const emptyManifest = {
      incident_id: base.incident_id,
      host_alias: "host",
      endpoint_hostname: "host.example.invalid",
      capture_started_at: base.observed_at,
      capture_ends_at: base.observed_at,
      sealed_at: base.observed_at,
      protocol_version: "1.0" as const,
      schema_version: "1.0" as const,
      rule_version: "v1",
      events: [],
      source_certificates: [],
      gaps: [],
      assessment: {
        code: "UNKNOWN" as const,
        explanation: "Insufficient evidence.",
        evidence_grade: "INSUFFICIENT" as const,
      },
      simulation_present: false,
      platform_key_id: "platform-key",
      limitations: "Integrity only.",
    };

    expect(bundleManifestSchema.safeParse(emptyManifest).success).toBe(true);
    expect(
      bundleManifestSchema.safeParse({
        ...emptyManifest,
        events: Array.from({ length: 4001 }, () => ({
          event: { ...validEvents[0], signature: Buffer.alloc(64, 0x01).toString("base64url") },
          received_at: base.observed_at,
          event_sha256: Buffer.alloc(32, 0x02).toString("base64url"),
        })),
      }).success,
    ).toBe(false);
  });
});
