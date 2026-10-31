import type { AssessmentCode, EvidenceGrade, SourceType } from "@incident-witness/protocol";

import {
  CORRELATION_WINDOW_MS,
  POWER_CHAIN_WINDOW_MS,
  PROBE_HOST_ADJACENCY_MS,
  RULE_VERSION,
  SOURCE_TYPES,
  UnsupportedRuleVersionError,
  type CorrelatorEvent,
  type CorrelatorGap,
  type CorrelationResult,
} from "./types.js";

const EXPLANATIONS: Record<AssessmentCode, string> = {
  POWER_RELATED: "Evidence pattern consistent with a power-related interruption.",
  EXTERNAL_REACHABILITY_LOSS:
    "External reachability loss observed; evidence does not identify the precise upstream network cause.",
  HOST_OR_WORKLOAD_EXIT: "Host/workload exit signal observed; intent is not inferred.",
  UNKNOWN: "Available evidence is insufficient to classify this interruption.",
};

const GAP_REASONS = new Set<CorrelatorGap["reason_code"]>([
  "missed_samples",
  "collector_unavailable",
  "transport_error",
  "spool_full",
  "probe_unavailable",
  "unknown",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function eventTime(event: CorrelatorEvent): number {
  return Date.parse(event.observed_at);
}

function compareEvents(left: CorrelatorEvent, right: CorrelatorEvent): number {
  const timeDifference = eventTime(left) - eventTime(right);
  if (timeDifference !== 0) return timeDifference;

  if (left.source_type !== right.source_type) {
    return left.source_type < right.source_type ? -1 : 1;
  }
  if (left.source_key_id !== right.source_key_id) {
    return left.source_key_id < right.source_key_id ? -1 : 1;
  }
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  if (left.event_id === right.event_id) return 0;
  return left.event_id < right.event_id ? -1 : 1;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function isPowerTransition(event: CorrelatorEvent): boolean {
  if (event.event_type !== "host_power_state") return false;
  const payload = asRecord(event.payload);
  if (!payload) return false;
  const state = stringField(payload, "state");
  return state === "on_battery" || state === "low_battery";
}

function isHostSignal(event: CorrelatorEvent): boolean {
  return event.event_type === "host_heartbeat" || event.event_type === "host_agent_status";
}

function isProbeFailure(event: CorrelatorEvent): boolean {
  if (event.event_type !== "platform_probe_result") return false;
  const payload = asRecord(event.payload);
  if (!payload) return false;

  const responseClass = stringField(payload, "response_class");
  const probeStatus = stringField(payload, "probe_status");

  // A probe infrastructure/policy error is not evidence that the target host is down.
  if (probeStatus === "error") return false;

  return (
    responseClass === "unexpected" ||
    responseClass === "unavailable" ||
    responseClass === "error" ||
    probeStatus === "failed"
  );
}

function isRenterFailure(event: CorrelatorEvent): boolean {
  if (event.event_type !== "renter_endpoint_result") return false;
  const payload = asRecord(event.payload);
  if (!payload) return false;
  const result = stringField(payload, "result");
  return (
    result === "unreachable" ||
    result === "timeout" ||
    result === "tls_error" ||
    result === "http_error"
  );
}

function isExitSignal(event: CorrelatorEvent): boolean {
  const payload = asRecord(event.payload);
  if (!payload) return false;

  if (event.event_type === "host_agent_status") {
    return stringField(payload, "status") === "stopped";
  }
  if (event.event_type === "renter_heartbeat") {
    return stringField(payload, "client_state") === "stopped";
  }
  return false;
}

function inWindow(
  event: CorrelatorEvent,
  anchor: number,
  beforeMs: number,
  afterMs: number,
): boolean {
  const time = eventTime(event);
  return time >= anchor - beforeMs && time <= anchor + afterMs;
}

function matchPowerRelated(events: CorrelatorEvent[]): CorrelatorEvent[] | null {
  const heartbeats = events.filter((event) => event.event_type === "host_heartbeat");
  const transitions = events.filter(isPowerTransition);

  for (const transition of transitions) {
    const transitionTime = eventTime(transition);
    const heartbeatsBefore = heartbeats.filter((event) => eventTime(event) <= transitionTime);
    if (heartbeatsBefore.length === 0) continue;

    const heartbeatAfter = heartbeats.some(
      (event) =>
        eventTime(event) > transitionTime &&
        eventTime(event) <= transitionTime + POWER_CHAIN_WINDOW_MS,
    );
    if (heartbeatAfter) continue;

    const externalLosses = events.filter(
      (event) =>
        (isProbeFailure(event) || isRenterFailure(event)) &&
        inWindow(event, transitionTime, PROBE_HOST_ADJACENCY_MS, POWER_CHAIN_WINDOW_MS),
    );
    if (externalLosses.length === 0) continue;

    return [heartbeatsBefore[heartbeatsBefore.length - 1]!, transition, ...externalLosses];
  }

  return null;
}

function matchHostOrWorkloadExit(events: CorrelatorEvent[]): CorrelatorEvent[] | null {
  for (const exit of events.filter(isExitSignal)) {
    const exitTime = eventTime(exit);
    const support = events.filter((event) => {
      if (!inWindow(event, exitTime, PROBE_HOST_ADJACENCY_MS, CORRELATION_WINDOW_MS)) {
        return false;
      }
      if (exit.source_type === "host_agent") {
        return isProbeFailure(event) || isRenterFailure(event);
      }
      if (exit.source_type === "renter_client") {
        return isProbeFailure(event);
      }
      return false;
    });

    if (support.length > 0) return [exit, ...support];
  }

  return null;
}

function matchExternalReachability(events: CorrelatorEvent[]): CorrelatorEvent[] | null {
  for (const probeFailure of events.filter(isProbeFailure)) {
    const probeTime = eventTime(probeFailure);
    const hostSignal = events.find(
      (event) =>
        isHostSignal(event) &&
        Math.abs(eventTime(event) - probeTime) <= PROBE_HOST_ADJACENCY_MS,
    );
    if (!hostSignal) continue;

    const renterCorroboration = events.find(
      (event) =>
        isRenterFailure(event) &&
        Math.abs(eventTime(event) - probeTime) <= CORRELATION_WINDOW_MS,
    );

    return [
      hostSignal,
      probeFailure,
      ...(renterCorroboration ? [renterCorroboration] : []),
    ];
  }

  return null;
}

function gradeFor(matchedSources: SourceType[], simulationDecisive: boolean): EvidenceGrade {
  if (simulationDecisive) return "LOW";

  const hasExternal = matchedSources.some((source) => source !== "host_agent");
  if (matchedSources.length >= 3 && hasExternal) return "HIGH";
  if (matchedSources.length >= 2 && hasExternal) return "MEDIUM";
  return "LOW";
}

function extractGaps(events: CorrelatorEvent[]): CorrelatorGap[] {
  const gaps = new Map<string, CorrelatorGap>();

  for (const event of events) {
    if (event.event_type !== "source_gap") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;

    const missingStartedAt = stringField(payload, "missing_started_at");
    const missingEndedAt = stringField(payload, "missing_ended_at");
    const reasonCode = stringField(payload, "reason_code");

    if (
      !missingStartedAt ||
      !missingEndedAt ||
      !reasonCode ||
      !GAP_REASONS.has(reasonCode as CorrelatorGap["reason_code"])
    ) {
      continue;
    }

    const gap: CorrelatorGap = {
      source_key_id: event.source_key_id,
      source_type: event.source_type,
      missing_started_at: missingStartedAt,
      missing_ended_at: missingEndedAt,
      reason_code: reasonCode as CorrelatorGap["reason_code"],
    };
    gaps.set(
      `${gap.source_key_id}|${gap.source_type}|${gap.missing_started_at}|${gap.missing_ended_at}|${gap.reason_code}`,
      gap,
    );
  }

  return [...gaps.values()].sort((left, right) => {
    if (left.missing_started_at !== right.missing_started_at) {
      return left.missing_started_at < right.missing_started_at ? -1 : 1;
    }
    if (left.source_type !== right.source_type) {
      return left.source_type < right.source_type ? -1 : 1;
    }
    if (left.source_key_id !== right.source_key_id) {
      return left.source_key_id < right.source_key_id ? -1 : 1;
    }
    return left.missing_ended_at < right.missing_ended_at ? -1 : 1;
  });
}

function buildResult(
  code: AssessmentCode,
  decisive: CorrelatorEvent[],
  allEvents: CorrelatorEvent[],
): CorrelationResult {
  const matchedSources = uniqueSorted(decisive.map((event) => event.source_type));
  const missingSources = SOURCE_TYPES.filter((source) => !matchedSources.includes(source));
  const simulationPresent = allEvents.some((event) => event.simulation_mode);
  const simulationDecisive = decisive.some((event) => event.simulation_mode);
  const evidenceGrade = gradeFor(matchedSources, simulationDecisive);

  let explanation = EXPLANATIONS[code];
  if (simulationDecisive) {
    explanation +=
      " Simulated evidence is present in the decisive pattern; the evidence grade is capped at LOW.";
  } else if (simulationPresent) {
    explanation += " Simulated evidence is present elsewhere in the record.";
  }
  if (missingSources.length > 0) {
    explanation += ` Missing decisive source categories: ${missingSources.join(", ")}.`;
  }

  return {
    assessmentCode: code,
    explanation,
    evidenceGrade,
    ruleVersion: RULE_VERSION,
    simulationPresent,
    simulationDecisive,
    flags: simulationDecisive ? ["SIMULATED_EVIDENCE_PRESENT"] : [],
    matchedSources,
    missingSources,
    decisiveEventIds: uniqueSorted(decisive.map((event) => event.event_id)),
    gaps: extractGaps(allEvents),
  };
}

function buildUnknown(events: CorrelatorEvent[]): CorrelationResult {
  const allSources = uniqueSorted(events.map((event) => event.source_type));
  const missingSources = SOURCE_TYPES.filter((source) => !allSources.includes(source));
  const simulationPresent = events.some((event) => event.simulation_mode);

  let explanation = EXPLANATIONS.UNKNOWN;
  if (missingSources.length > 0) {
    explanation += ` Missing source categories: ${missingSources.join(", ")}.`;
  }
  if (simulationPresent) {
    explanation += " Simulated evidence is present; no decisive pattern was matched.";
  }

  return {
    assessmentCode: "UNKNOWN",
    explanation,
    evidenceGrade: events.length === 0 ? "INSUFFICIENT" : "LOW",
    ruleVersion: RULE_VERSION,
    simulationPresent,
    simulationDecisive: false,
    flags: [],
    matchedSources: allSources,
    missingSources,
    decisiveEventIds: [],
    gaps: extractGaps(events),
  };
}

/**
 * Pure deterministic correlator. The same normalized event set and rule version
 * always produce the same result; input order is irrelevant.
 */
export function correlate(
  events: CorrelatorEvent[],
  ruleVersion: string = RULE_VERSION,
): CorrelationResult {
  if (ruleVersion !== RULE_VERSION) {
    throw new UnsupportedRuleVersionError(ruleVersion);
  }

  const sorted = events
    .filter((event) => Number.isFinite(eventTime(event)))
    .sort(compareEvents);

  const powerRelated = matchPowerRelated(sorted);
  if (powerRelated) return buildResult("POWER_RELATED", powerRelated, sorted);

  const hostOrWorkloadExit = matchHostOrWorkloadExit(sorted);
  if (hostOrWorkloadExit) {
    return buildResult("HOST_OR_WORKLOAD_EXIT", hostOrWorkloadExit, sorted);
  }

  const externalReachability = matchExternalReachability(sorted);
  if (externalReachability) {
    return buildResult("EXTERNAL_REACHABILITY_LOSS", externalReachability, sorted);
  }

  return buildUnknown(sorted);
}
