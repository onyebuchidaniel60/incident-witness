import { describe, expect, it } from "vitest";

import {
  correlate,
  RULE_VERSION,
  UnsupportedRuleVersionError,
  type CorrelatorEvent,
} from "../src/index.js";

const baseTime = Date.parse("2026-01-01T00:00:00.000Z");

function at(seconds: number): string {
  return new Date(baseTime + seconds * 1000).toISOString();
}

let eventCounter = 0;

function makeEvent(overrides: Partial<CorrelatorEvent> & Pick<CorrelatorEvent, "event_type" | "source_type" | "payload">): CorrelatorEvent {
  eventCounter += 1;
  return {
    event_id: `00000000-0000-4000-8000-${String(eventCounter).padStart(12, "0")}`,
    source_key_id:
      overrides.source_type === "platform_probe"
        ? "00000000-0000-4000-8000-0000000000f0"
        : overrides.source_type === "renter_client"
          ? "00000000-0000-4000-8000-0000000000e0"
          : "00000000-0000-4000-8000-0000000000d0",
    sequence: eventCounter,
    observed_at: at(0),
    simulation_mode: false,
    ...overrides,
  };
}

function hostHeartbeat(seconds: number, simulation = false): CorrelatorEvent {
  return makeEvent({
    event_type: "host_heartbeat",
    source_type: "host_agent",
    observed_at: at(seconds),
    simulation_mode: simulation,
    payload: {
      agent_version: "0.1.0",
      os_family: "linux",
      os_version: "6.8",
      uptime_seconds: 120,
      agent_health: "ok",
    },
  });
}

function powerTransition(seconds: number, simulation = false): CorrelatorEvent {
  return makeEvent({
    event_type: "host_power_state",
    source_type: "host_agent",
    observed_at: at(seconds),
    simulation_mode: simulation,
    payload: {
      ups_alias: "ups0",
      state: "on_battery",
      charge_percent: 42,
    },
  });
}

function probeFailure(seconds: number, simulation = false): CorrelatorEvent {
  return makeEvent({
    event_type: "platform_probe_result",
    source_type: "platform_probe",
    observed_at: at(seconds),
    simulation_mode: simulation,
    payload: {
      target_host_id: "00000000-0000-4000-8000-0000000000a0",
      probe_status: "completed",
      dns_result: "resolved",
      tls_result: "valid",
      http_result: "timeout",
      latency_ms: 3000,
      response_class: "unavailable",
      observed_ip_class: "public",
    },
  });
}

function probeError(seconds: number): CorrelatorEvent {
  return makeEvent({
    event_type: "platform_probe_result",
    source_type: "platform_probe",
    observed_at: at(seconds),
    payload: {
      target_host_id: "00000000-0000-4000-8000-0000000000a0",
      probe_status: "error",
      dns_result: "dns_error",
      tls_result: "not_attempted",
      http_result: "not_attempted",
      latency_ms: 0,
      response_class: "error",
      observed_ip_class: "unknown",
    },
  });
}

function renterFailure(seconds: number): CorrelatorEvent {
  return makeEvent({
    event_type: "renter_endpoint_result",
    source_type: "renter_client",
    observed_at: at(seconds),
    payload: {
      result: "unreachable",
      latency_ms: 3000,
      failure_category: "network",
    },
  });
}

function hostExit(seconds: number): CorrelatorEvent {
  return makeEvent({
    event_type: "host_agent_status",
    source_type: "host_agent",
    observed_at: at(seconds),
    payload: { status: "stopped", agent_version: "0.1.0" },
  });
}

function renterExit(seconds: number): CorrelatorEvent {
  return makeEvent({
    event_type: "renter_heartbeat",
    source_type: "renter_client",
    observed_at: at(seconds),
    payload: { sdk_version: "0.1.0", client_state: "stopped" },
  });
}

function gapEvent(seconds: number): CorrelatorEvent {
  return makeEvent({
    event_type: "source_gap",
    source_type: "platform_probe",
    observed_at: at(seconds),
    payload: {
      expected_interval_seconds: 30,
      missing_started_at: at(seconds),
      missing_ended_at: at(seconds + 30),
      reason_code: "missed_samples",
    },
  });
}

describe("deterministic correlator", () => {
  it("returns UNKNOWN/INSUFFICIENT for no usable observations", () => {
    const result = correlate([], RULE_VERSION);
    expect(result.assessmentCode).toBe("UNKNOWN");
    expect(result.evidenceGrade).toBe("INSUFFICIENT");
    expect(result.decisiveEventIds).toEqual([]);
  });

  it("returns UNKNOWN/LOW when only a host heartbeat is present", () => {
    const result = correlate([hostHeartbeat(0)], RULE_VERSION);
    expect(result.assessmentCode).toBe("UNKNOWN");
    expect(result.evidenceGrade).toBe("LOW");
    expect(result.missingSources).toContain("renter_client");
    expect(result.missingSources).toContain("platform_probe");
  });

  it("detects POWER_RELATED with all three source categories", () => {
    const result = correlate(
      [hostHeartbeat(0), powerTransition(10), renterFailure(20), probeFailure(30)],
      RULE_VERSION,
    );
    expect(result.assessmentCode).toBe("POWER_RELATED");
    expect(result.evidenceGrade).toBe("HIGH");
    expect(result.matchedSources).toEqual([
      "host_agent",
      "platform_probe",
      "renter_client",
    ]);
    expect(result.explanation).toContain("consistent with a power-related interruption");
  });

  it("returns POWER_RELATED/MEDIUM when only one external category supports the pattern", () => {
    const result = correlate([hostHeartbeat(0), powerTransition(10), renterFailure(20)], RULE_VERSION);
    expect(result.assessmentCode).toBe("POWER_RELATED");
    expect(result.evidenceGrade).toBe("MEDIUM");
    expect(result.missingSources).toContain("platform_probe");
  });

  it("caps a simulated decisive power pattern at LOW", () => {
    const result = correlate(
      [hostHeartbeat(0), powerTransition(10, true), renterFailure(20), probeFailure(30)],
      RULE_VERSION,
    );
    expect(result.assessmentCode).toBe("POWER_RELATED");
    expect(result.evidenceGrade).toBe("LOW");
    expect(result.simulationPresent).toBe(true);
    expect(result.simulationDecisive).toBe(true);
    expect(result.flags).toContain("SIMULATED_EVIDENCE_PRESENT");
    expect(result.explanation).toContain("capped at LOW");
  });

  it("detects EXTERNAL_REACHABILITY_LOSS with host and probe, upgraded by renter corroboration", () => {
    const partial = correlate([hostHeartbeat(20), probeFailure(10)], RULE_VERSION);
    expect(partial.assessmentCode).toBe("EXTERNAL_REACHABILITY_LOSS");
    expect(partial.evidenceGrade).toBe("MEDIUM");

    const full = correlate(
      [hostHeartbeat(20), probeFailure(10), renterFailure(30)],
      RULE_VERSION,
    );
    expect(full.assessmentCode).toBe("EXTERNAL_REACHABILITY_LOSS");
    expect(full.evidenceGrade).toBe("HIGH");
    expect(full.explanation).toContain("does not identify the precise upstream network cause");
  });

  it("does not classify a probe infrastructure/policy error as external reachability loss", () => {
    const result = correlate([hostHeartbeat(20), probeError(10)], RULE_VERSION);
    expect(result.assessmentCode).toBe("UNKNOWN");
  });

  it("does not classify UPS online alone", () => {
    const online = makeEvent({
      event_type: "host_power_state",
      source_type: "host_agent",
      observed_at: at(5),
      payload: { ups_alias: "ups0", state: "online", charge_percent: 100 },
    });
    const result = correlate([hostHeartbeat(0), online, probeFailure(30)], RULE_VERSION);
    expect(result.assessmentCode).not.toBe("POWER_RELATED");
  });

  it("detects HOST_OR_WORKLOAD_EXIT only with supporting observations", () => {
    const result = correlate(
      [hostExit(10), renterFailure(20), probeFailure(30)],
      RULE_VERSION,
    );
    expect(result.assessmentCode).toBe("HOST_OR_WORKLOAD_EXIT");
    expect(result.evidenceGrade).toBe("HIGH");
    expect(result.explanation).toContain("intent is not inferred");

    const unsupported = correlate([hostExit(10)], RULE_VERSION);
    expect(unsupported.assessmentCode).toBe("UNKNOWN");
  });

  it("detects renter exit with probe support at MEDIUM", () => {
    const result = correlate([renterExit(10), probeFailure(20)], RULE_VERSION);
    expect(result.assessmentCode).toBe("HOST_OR_WORKLOAD_EXIT");
    expect(result.evidenceGrade).toBe("MEDIUM");
  });

  it("is independent of input ordering", () => {
    const events = [hostHeartbeat(0), powerTransition(10), renterFailure(20), probeFailure(30)];
    const forward = correlate(events, RULE_VERSION);
    const reversed = correlate([...events].reverse(), RULE_VERSION);
    expect(reversed).toEqual(forward);
  });

  it("extracts source gaps deterministically", () => {
    const result = correlate([gapEvent(0)], RULE_VERSION);
    expect(result.assessmentCode).toBe("UNKNOWN");
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      source_type: "platform_probe",
      reason_code: "missed_samples",
    });
  });

  it("rejects an unsupported rule version", () => {
    expect(() => correlate([], "iw-rules-v999")).toThrow(UnsupportedRuleVersionError);
  });
});
