import { z } from "zod";

import { base64UrlToBytes } from "./base64.js";

const uuidSchema = z.string().uuid();
const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, "Expected RFC3339 UTC timestamp")
  .refine((value) => Number.isFinite(Date.parse(value)), "Timestamp is not a valid date");

const finiteNumber = z.number().refine(Number.isFinite, "Number must be finite");
const safeInteger = z.number().refine(Number.isSafeInteger, "Integer is outside the safe range");
const positiveSafeInteger = safeInteger.refine((value) => value > 0, "Integer must be positive");
const nonNegativeSafeInteger = safeInteger.refine((value) => value >= 0, "Integer must be non-negative");

function base64UrlBytesSchema(byteLength: number, label: string) {
  return z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, `${label} must be unpadded base64url`)
    .refine((value) => {
      try {
        return base64UrlToBytes(value).length === byteLength;
      } catch {
        return false;
      }
    }, `${label} must decode to ${byteLength} bytes`);
}

export const publicKeySchema = base64UrlBytesSchema(32, "Ed25519 public key");
export const signatureSchema = base64UrlBytesSchema(64, "Ed25519 signature");
export const sha256Schema = base64UrlBytesSchema(32, "SHA-256 digest");

export const sourceTypeSchema = z.enum(["host_agent", "renter_client", "platform_probe"]);
export const eventTypeSchema = z.enum([
  "host_heartbeat",
  "host_power_state",
  "gpu_telemetry",
  "host_agent_status",
  "renter_heartbeat",
  "renter_endpoint_result",
  "platform_probe_result",
  "source_gap",
]);

const eventCommon = z
  .object({
    protocol_version: z.literal("1.0"),
    event_id: uuidSchema,
    incident_id: uuidSchema,
    source_key_id: uuidSchema,
    sequence: positiveSafeInteger,
    observed_at: timestampSchema,
    simulation_mode: z.boolean(),
    canonicalization: z.literal("RFC8785-JCS"),
    signature_algorithm: z.literal("Ed25519"),
  })
  .strict();

const hostHeartbeatPayload = z
  .object({
    agent_version: z.string().min(1).max(40),
    os_family: z.string().min(1).max(40),
    os_version: z.string().min(1).max(80),
    uptime_seconds: nonNegativeSafeInteger,
    agent_health: z.enum(["ok", "degraded", "unknown"]),
  })
  .strict();

const hostPowerStatePayload = z
  .object({
    ups_alias: z.string().min(1).max(80),
    state: z.enum(["online", "on_battery", "low_battery", "unknown", "unavailable"]),
    charge_percent: finiteNumber.min(0).max(100).optional(),
    runtime_seconds: nonNegativeSafeInteger.optional(),
  })
  .strict();

const gpuTelemetryPayload = z
  .object({
    device_index: nonNegativeSafeInteger.optional(),
    vendor: z.string().max(40).optional(),
    model: z.string().max(100).optional(),
    temperature_c: finiteNumber.min(-40).max(150).optional(),
    utilization_percent: finiteNumber.min(0).max(100).optional(),
    memory_used_mib: nonNegativeSafeInteger.optional(),
    memory_total_mib: nonNegativeSafeInteger.optional(),
    power_draw_w: finiteNumber.min(0).max(2000).optional(),
    driver_version: z.string().max(40).optional(),
    collection_status: z.enum(["available", "partial", "unavailable"]),
  })
  .strict();

const hostAgentStatusPayload = z
  .object({
    status: z.enum(["started", "stopped", "recovered", "degraded"]),
    agent_version: z.string().min(1).max(40),
  })
  .strict();

const renterHeartbeatPayload = z
  .object({
    sdk_version: z.string().min(1).max(40),
    workload_ref: z.string().max(100).optional(),
    client_state: z.enum(["starting", "running", "degraded", "stopped", "unknown"]),
    latency_ms: nonNegativeSafeInteger.max(60_000).optional(),
    failure_category: z
      .enum(["none", "network", "tls", "http", "timeout", "dns", "unknown"])
      .optional(),
  })
  .strict();

const renterEndpointResultPayload = z
  .object({
    result: z.enum(["reachable", "unreachable", "timeout", "tls_error", "http_error", "unknown"]),
    latency_ms: nonNegativeSafeInteger.max(60_000),
    failure_category: z.enum(["network", "tls", "http", "timeout", "dns", "unknown"]).optional(),
  })
  .strict();

const platformProbeResultPayload = z
  .object({
    target_host_id: uuidSchema,
    probe_status: z.enum(["completed", "failed", "error"]),
    dns_result: z.enum(["resolved", "nxdomain", "dns_error", "rejected_unsafe"]),
    tls_result: z.enum(["valid", "invalid", "error", "not_attempted"]),
    http_result: z.enum([
      "expected",
      "unexpected_status",
      "invalid_body",
      "redirect",
      "timeout",
      "error",
      "not_attempted",
    ]),
    latency_ms: nonNegativeSafeInteger.max(60_000),
    response_class: z.enum(["expected", "unexpected", "unavailable", "error"]),
    observed_ip_class: z.enum(["public", "rejected_unsafe", "unknown"]),
  })
  .strict();

const sourceGapPayload = z
  .object({
    expected_interval_seconds: positiveSafeInteger.max(86_400),
    missing_started_at: timestampSchema,
    missing_ended_at: timestampSchema,
    reason_code: z.enum([
      "missed_samples",
      "collector_unavailable",
      "transport_error",
      "spool_full",
      "probe_unavailable",
      "unknown",
    ]),
  })
  .strict();

function bodyVariant<T extends z.infer<typeof eventTypeSchema>>(
  eventType: T,
  sourceType: z.infer<typeof sourceTypeSchema>,
  payload: z.ZodType,
) {
  return eventCommon
    .extend({
      source_type: z.literal(sourceType),
      event_type: z.literal(eventType),
      payload,
    })
    .strict();
}

const bodyVariants = [
  bodyVariant("host_heartbeat", "host_agent", hostHeartbeatPayload),
  bodyVariant("host_power_state", "host_agent", hostPowerStatePayload),
  bodyVariant("gpu_telemetry", "host_agent", gpuTelemetryPayload),
  bodyVariant("host_agent_status", "host_agent", hostAgentStatusPayload),
  bodyVariant("renter_heartbeat", "renter_client", renterHeartbeatPayload),
  bodyVariant("renter_endpoint_result", "renter_client", renterEndpointResultPayload),
  bodyVariant("platform_probe_result", "platform_probe", platformProbeResultPayload),
  bodyVariant("source_gap", "platform_probe", sourceGapPayload),
] as const;

export const eventBodySchema = z.discriminatedUnion("event_type", bodyVariants);

const envelopeVariants = [
  bodyVariants[0].extend({ signature: signatureSchema }).strict(),
  bodyVariants[1].extend({ signature: signatureSchema }).strict(),
  bodyVariants[2].extend({ signature: signatureSchema }).strict(),
  bodyVariants[3].extend({ signature: signatureSchema }).strict(),
  bodyVariants[4].extend({ signature: signatureSchema }).strict(),
  bodyVariants[5].extend({ signature: signatureSchema }).strict(),
  bodyVariants[6].extend({ signature: signatureSchema }).strict(),
  bodyVariants[7].extend({ signature: signatureSchema }).strict(),
] as const;

export const eventEnvelopeSchema = z.discriminatedUnion("event_type", envelopeVariants);

export type EventType = z.infer<typeof eventTypeSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type EventBody = z.infer<typeof eventBodySchema>;
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type HostHeartbeatPayload = z.infer<typeof hostHeartbeatPayload>;
export type HostPowerStatePayload = z.infer<typeof hostPowerStatePayload>;
export type GpuTelemetryPayload = z.infer<typeof gpuTelemetryPayload>;
export type HostAgentStatusPayload = z.infer<typeof hostAgentStatusPayload>;
export type RenterHeartbeatPayload = z.infer<typeof renterHeartbeatPayload>;
export type RenterEndpointResultPayload = z.infer<typeof renterEndpointResultPayload>;
export type PlatformProbeResultPayload = z.infer<typeof platformProbeResultPayload>;
export type SourceGapPayload = z.infer<typeof sourceGapPayload>;

const certificateCommon = z
  .object({
    certificate_version: z.literal("1.0"),
    source_key_id: uuidSchema,
    public_key: publicKeySchema,
    fingerprint: z.string().min(1).max(100),
    issued_at: timestampSchema,
    protocol_version: z.literal("1.0"),
  })
  .strict();

export const sourceKeyCertificateSchema = z.discriminatedUnion("source_type", [
  certificateCommon
    .extend({
      source_type: z.literal("host_agent"),
      host_id: uuidSchema,
    })
    .strict(),
  certificateCommon
    .extend({
      source_type: z.literal("renter_client"),
      incident_id: uuidSchema,
    })
    .strict(),
  certificateCommon
    .extend({
      source_type: z.literal("platform_probe"),
    })
    .strict(),
]);

export const signedSourceKeyCertificateSchema = z
  .object({
    certificate: sourceKeyCertificateSchema,
    signature: signatureSchema,
    signature_algorithm: z.literal("Ed25519"),
  })
  .strict();

export type SourceKeyCertificate = z.infer<typeof sourceKeyCertificateSchema>;
export type SignedSourceKeyCertificate = z.infer<typeof signedSourceKeyCertificateSchema>;

export const assessmentCodeSchema = z.enum([
  "POWER_RELATED",
  "EXTERNAL_REACHABILITY_LOSS",
  "HOST_OR_WORKLOAD_EXIT",
  "UNKNOWN",
]);

export const evidenceGradeSchema = z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]);

const bundleEventEntrySchema = z
  .object({
    event: eventEnvelopeSchema,
    received_at: timestampSchema,
    event_sha256: sha256Schema,
  })
  .strict();

const bundleGapEntrySchema = z
  .object({
    source_key_id: uuidSchema,
    source_type: sourceTypeSchema,
    missing_started_at: timestampSchema,
    missing_ended_at: timestampSchema,
    reason_code: z.enum([
      "missed_samples",
      "collector_unavailable",
      "transport_error",
      "spool_full",
      "probe_unavailable",
      "unknown",
    ]),
  })
  .strict();

const assessmentSchema = z
  .object({
    code: assessmentCodeSchema,
    explanation: z.string().min(1).max(2000),
    evidence_grade: evidenceGradeSchema,
  })
  .strict();

export const bundleManifestSchema = z
  .object({
    incident_id: uuidSchema,
    host_alias: z.string().min(1).max(80),
    endpoint_hostname: z.string().min(1).max(253),
    capture_started_at: timestampSchema,
    capture_ends_at: timestampSchema,
    sealed_at: timestampSchema,
    protocol_version: z.literal("1.0"),
    schema_version: z.literal("1.0"),
    rule_version: z.string().min(1).max(30),
    events: z.array(bundleEventEntrySchema).max(4000),
    source_certificates: z.array(signedSourceKeyCertificateSchema).max(10),
    gaps: z.array(bundleGapEntrySchema).max(4000),
    assessment: assessmentSchema,
    simulation_present: z.boolean(),
    platform_key_id: z.string().min(1).max(80),
    limitations: z.string().min(1).max(1000),
  })
  .strict();

export const bundleSchema = z
  .object({
    bundle_version: z.literal("1.0"),
    manifest: bundleManifestSchema,
    manifest_sha256: sha256Schema,
    platform_signature: signatureSchema,
  })
  .strict();

export type BundleManifest = z.infer<typeof bundleManifestSchema>;
export type Bundle = z.infer<typeof bundleSchema>;
export type AssessmentCode = z.infer<typeof assessmentCodeSchema>;
export type EvidenceGrade = z.infer<typeof evidenceGradeSchema>;
