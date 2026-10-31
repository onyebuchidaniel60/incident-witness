import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const hostStatus = pgEnum("host_status", [
  "pending_endpoint",
  "pending_enrollment",
  "active",
  "archived",
]);

export const witnessSourceType = pgEnum("witness_source_type", [
  "host_agent",
  "renter_client",
  "platform_probe",
]);

export const witnessKeyStatus = pgEnum("witness_key_status", ["active", "revoked", "retired"]);

export const sourceCredentialType = pgEnum("source_credential_type", [
  "host_agent",
  "renter_client",
]);

export const incidentStatus = pgEnum("incident_status", [
  "collecting",
  "awaiting_finalize",
  "sealed",
  "cancelled",
]);

export const evidenceGrade = pgEnum("evidence_grade", [
  "HIGH",
  "MEDIUM",
  "LOW",
  "INSUFFICIENT",
]);

export const evidenceValidationStatus = pgEnum("evidence_validation_status", ["accepted"]);

export const probeJobStatus = pgEnum("probe_job_status", [
  "pending",
  "leased",
  "completed",
  "retry",
  "dead",
  "cancelled",
]);

export const platformKeyStatus = pgEnum("platform_key_status", ["active", "retired", "revoked"]);

export const auditActorType = pgEnum("audit_actor_type", [
  "provider",
  "host_agent",
  "renter_client",
  "platform_worker",
  "system",
]);

export const auditResult = pgEnum("audit_result", ["success", "denied", "failure"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: varchar("display_name", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hosts = pgTable(
  "hosts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    alias: varchar("alias", { length: 80 }).notNull(),
    endpointHostname: varchar("endpoint_hostname", { length: 253 }).notNull(),
    endpointPath: varchar("endpoint_path", { length: 120 })
      .notNull()
      .default("/.well-known/incident-witness/health"),
    endpointVerifiedAt: timestamp("endpoint_verified_at", { withTimezone: true }),
    endpointDnsFingerprint: text("endpoint_dns_fingerprint"),
    status: hostStatus("status").notNull().default("pending_endpoint"),
    agentVersion: varchar("agent_version", { length: 40 }),
    lastAgentSeenAt: timestamp("last_agent_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hosts_owner_created_idx").on(table.ownerUserId, table.createdAt.desc()),
    uniqueIndex("hosts_owner_hostname_active_idx")
      .on(table.ownerUserId, sql`lower(${table.endpointHostname})`)
      .where(sql`${table.status} <> 'archived'`),
    index("hosts_status_last_seen_idx").on(table.status, table.lastAgentSeenAt),
    check(
      "hosts_endpoint_path_check",
      sql`${table.endpointPath} = '/.well-known/incident-witness/health'`,
    ),
  ],
);

export const hostEndpointChallenges = pgTable(
  "host_endpoint_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    challengeHash: bytea("challenge_hash").notNull(),
    dnsRecordName: varchar("dns_record_name", { length: 300 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("host_endpoint_challenges_host_expiry_idx").on(table.hostId, table.expiresAt.desc()),
    index("host_endpoint_challenges_expiry_idx").on(table.expiresAt),
    check(
      "host_endpoint_challenges_attempt_count_check",
      sql`${table.attemptCount} between 0 and 10`,
    ),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 100 }).notNull(),
    workloadRef: varchar("workload_ref", { length: 100 }),
    status: incidentStatus("status").notNull().default("collecting"),
    captureStartedAt: timestamp("capture_started_at", { withTimezone: true }).notNull(),
    captureEndsAt: timestamp("capture_ends_at", { withTimezone: true }).notNull(),
    ingestionDeadline: timestamp("ingestion_deadline", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    sealedAt: timestamp("sealed_at", { withTimezone: true }),
    ruleVersion: varchar("rule_version", { length: 30 }),
    assessmentCode: varchar("assessment_code", { length: 40 }),
    evidenceGrade: evidenceGrade("evidence_grade"),
    simulationPresent: boolean("simulation_present").notNull().default(false),
    acceptedEventCount: integer("accepted_event_count").notNull().default(0),
    acceptedEventBytes: bigint("accepted_event_bytes", { mode: "number" }).notNull().default(0),
    demoMode: boolean("demo_mode").notNull().default(false),
    cancelReason: varchar("cancel_reason", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("incidents_owner_created_idx").on(table.ownerUserId, table.createdAt.desc()),
    index("incidents_host_status_idx").on(table.hostId, table.status),
    index("incidents_status_windows_idx").on(
      table.status,
      table.captureEndsAt,
      table.ingestionDeadline,
    ),
    uniqueIndex("incidents_one_active_per_host_idx")
      .on(table.hostId)
      .where(sql`${table.status} in ('collecting','awaiting_finalize')`),
    check(
      "incidents_capture_window_check",
      sql`${table.captureEndsAt} > ${table.captureStartedAt}
        and ${table.captureEndsAt} >= ${table.captureStartedAt} + interval '2 minutes'
        and ${table.captureEndsAt} <= ${table.captureStartedAt} + interval '240 minutes'`,
    ),
    check(
      "incidents_ingestion_deadline_check",
      sql`${table.ingestionDeadline} >= ${table.captureEndsAt}`,
    ),
    check(
      "incidents_event_count_check",
      sql`${table.acceptedEventCount} between 0 and 4000`,
    ),
    check(
      "incidents_event_bytes_check",
      sql`${table.acceptedEventBytes} between 0 and 7340032`,
    ),
    check(
      "incidents_sealed_at_check",
      sql`(${table.status} = 'sealed' and ${table.sealedAt} is not null)
        or (${table.status} <> 'sealed' and ${table.sealedAt} is null)`,
    ),
    check(
      "incidents_cancel_reason_check",
      sql`${table.cancelReason} is null or ${table.cancelReason} in ('USER_CANCELLED','NO_EVIDENCE')`,
    ),
  ],
);

export const witnessKeys = pgTable(
  "witness_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").references(() => profiles.id, { onDelete: "restrict" }),
    hostId: uuid("host_id").references(() => hosts.id, { onDelete: "restrict" }),
    incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "restrict" }),
    sourceType: witnessSourceType("source_type").notNull(),
    publicKey: bytea("public_key").notNull(),
    fingerprint: text("fingerprint").notNull().unique(),
    status: witnessKeyStatus("status").notNull().default("active"),
    certificateJson: jsonb("certificate_json").notNull(),
    certificateSignature: bytea("certificate_signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastPresenceSequence: bigint("last_presence_sequence", { mode: "number" })
      .notNull()
      .default(0),
    lastPresenceHash: bytea("last_presence_hash"),
  },
  (table) => [
    index("witness_keys_host_status_idx").on(table.hostId, table.status),
    index("witness_keys_incident_status_idx").on(table.incidentId, table.status),
    index("witness_keys_source_status_idx").on(table.sourceType, table.status),
    check(
      "witness_keys_scope_check",
      sql`(${table.sourceType} = 'host_agent'
          and ${table.hostId} is not null
          and ${table.ownerUserId} is not null
          and ${table.incidentId} is null)
        or (${table.sourceType} = 'renter_client'
          and ${table.incidentId} is not null
          and ${table.hostId} is null)
        or (${table.sourceType} = 'platform_probe'
          and ${table.hostId} is null
          and ${table.incidentId} is null)`,
    ),
    check(
      "witness_keys_presence_sequence_check",
      sql`${table.lastPresenceSequence} between 0 and 9007199254740991`,
    ),
  ],
);

export const sourceCredentials = pgTable(
  "source_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKeyId: uuid("source_key_id")
      .notNull()
      .references(() => witnessKeys.id, { onDelete: "restrict" }),
    credentialHash: bytea("credential_hash").notNull().unique(),
    credentialType: sourceCredentialType("credential_type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("source_credentials_key_revoked_idx").on(table.sourceKeyId, table.revokedAt)],
);

export const enrollmentTokens = pgTable(
  "enrollment_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    tokenHash: bytea("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedKeyId: uuid("redeemed_key_id").references(() => witnessKeys.id, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("enrollment_tokens_host_expiry_idx").on(table.hostId, table.expiresAt.desc())],
);

export const renterInvitations = pgTable(
  "renter_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    tokenHash: bytea("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    renterKeyId: uuid("renter_key_id").references(() => witnessKeys.id, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("renter_invitations_incident_expiry_idx").on(table.incidentId, table.expiresAt.desc()),
  ],
);

export const evidenceEvents = pgTable(
  "evidence_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "restrict" }),
    sourceKeyId: uuid("source_key_id")
      .notNull()
      .references(() => witnessKeys.id, { onDelete: "restrict" }),
    sourceType: witnessSourceType("source_type").notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    canonicalEvent: jsonb("canonical_event").notNull(),
    canonicalSha256: bytea("canonical_sha256").notNull(),
    signature: bytea("signature").notNull(),
    simulationMode: boolean("simulation_mode").notNull().default(false),
    validationStatus: evidenceValidationStatus("validation_status").notNull().default("accepted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("evidence_events_source_sequence_idx").on(table.sourceKeyId, table.sequence),
    uniqueIndex("evidence_events_incident_id_idx").on(table.incidentId, table.id),
    index("evidence_events_incident_observed_idx").on(
      table.incidentId,
      table.observedAt,
      table.id,
    ),
    index("evidence_events_source_sequence_lookup_idx").on(table.sourceKeyId, table.sequence),
    check(
      "evidence_events_sequence_check",
      sql`${table.sequence} between 1 and 9007199254740991`,
    ),
  ],
);

export const probeJobs = pgTable(
  "probe_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "restrict" }),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "restrict" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    leaseOwner: varchar("lease_owner", { length: 80 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    status: probeJobStatus("status").notNull().default("pending"),
    lastErrorCode: varchar("last_error_code", { length: 50 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("probe_jobs_due_idx")
      .on(table.scheduledAt)
      .where(sql`${table.status} in ('pending','retry')`),
    index("probe_jobs_lease_expiry_idx").on(table.leaseExpiresAt),
    index("probe_jobs_incident_scheduled_idx").on(table.incidentId, table.scheduledAt),
  ],
);

export const platformSigningKeys = pgTable("platform_signing_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyId: varchar("key_id", { length: 80 }).notNull().unique(),
  publicKey: bytea("public_key").notNull(),
  fingerprint: text("fingerprint").notNull().unique(),
  algorithm: varchar("algorithm", { length: 20 }).notNull().default("Ed25519"),
  status: platformKeyStatus("status").notNull().default("active"),
  notBefore: timestamp("not_before", { withTimezone: true }).notNull().defaultNow(),
  notAfter: timestamp("not_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evidenceBundles = pgTable(
  "evidence_bundles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .unique()
      .references(() => incidents.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    bundleVersion: varchar("bundle_version", { length: 20 }).notNull(),
    ruleVersion: varchar("rule_version", { length: 30 }).notNull(),
    platformKeyId: uuid("platform_key_id")
      .notNull()
      .references(() => platformSigningKeys.id, { onDelete: "restrict" }),
    manifest: jsonb("manifest").notNull(),
    manifestSha256: bytea("manifest_sha256").notNull(),
    platformSignature: bytea("platform_signature").notNull(),
    byteLength: integer("byte_length").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("evidence_bundles_byte_length_check", sql`${table.byteLength} <= 10485760`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: auditActorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    ownerUserId: uuid("owner_user_id").references(() => profiles.id, { onDelete: "set null" }),
    resourceType: varchar("resource_type", { length: 40 }).notNull(),
    resourceId: uuid("resource_id"),
    action: varchar("action", { length: 60 }).notNull(),
    result: auditResult("result").notNull(),
    requestId: uuid("request_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_owner_created_idx").on(table.ownerUserId, table.createdAt.desc()),
    index("audit_events_resource_created_idx").on(
      table.resourceType,
      table.resourceId,
      table.createdAt.desc(),
    ),
    index("audit_events_request_idx").on(table.requestId),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    operation: varchar("operation", { length: 80 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    resourceId: uuid("resource_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_records_key_idx").on(
      table.ownerUserId,
      table.operation,
      table.keyHash,
    ),
  ],
);

export const schema = {
  profiles,
  hosts,
  hostEndpointChallenges,
  incidents,
  witnessKeys,
  sourceCredentials,
  enrollmentTokens,
  renterInvitations,
  evidenceEvents,
  probeJobs,
  platformSigningKeys,
  evidenceBundles,
  auditEvents,
  idempotencyRecords,
};
