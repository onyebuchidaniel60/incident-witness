import type {
  AssessmentCode,
  EventType,
  EvidenceGrade,
  SourceType,
} from "@incident-witness/protocol";

export const RULE_VERSION = "iw-rules-v1" as const;

export const CORRELATION_WINDOW_MS = 120_000;
export const POWER_CHAIN_WINDOW_MS = 180_000;
export const PROBE_HOST_ADJACENCY_MS = 30_000;

export const SOURCE_TYPES: readonly SourceType[] = [
  "host_agent",
  "renter_client",
  "platform_probe",
];

/**
 * A normalized accepted event. The API only supplies events that have already
 * passed schema, canonical-byte, signature and scope validation.
 */
export type CorrelatorEvent = {
  event_id: string;
  source_key_id: string;
  source_type: SourceType;
  event_type: EventType;
  sequence: number;
  observed_at: string;
  simulation_mode: boolean;
  payload: unknown;
};

export type CorrelatorGap = {
  source_key_id: string;
  source_type: SourceType;
  missing_started_at: string;
  missing_ended_at: string;
  reason_code:
    | "missed_samples"
    | "collector_unavailable"
    | "transport_error"
    | "spool_full"
    | "probe_unavailable"
    | "unknown";
};

export type CorrelationResult = {
  assessmentCode: AssessmentCode;
  explanation: string;
  evidenceGrade: EvidenceGrade;
  ruleVersion: typeof RULE_VERSION;
  simulationPresent: boolean;
  simulationDecisive: boolean;
  flags: string[];
  matchedSources: SourceType[];
  missingSources: SourceType[];
  decisiveEventIds: string[];
  gaps: CorrelatorGap[];
};

export class UnsupportedRuleVersionError extends Error {
  constructor(ruleVersion: string) {
    super(`Unsupported correlator rule version: ${ruleVersion}`);
    this.name = "UnsupportedRuleVersionError";
  }
}
