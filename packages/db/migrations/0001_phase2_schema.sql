-- Incident Witness Phase 2 schema.
-- This migration is applied by DATABASE_URL_MIGRATOR and is never run by the
-- API or worker runtime roles.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE TYPE host_status AS ENUM (
  'pending_endpoint',
  'pending_enrollment',
  'active',
  'archived'
);

CREATE TYPE witness_source_type AS ENUM (
  'host_agent',
  'renter_client',
  'platform_probe'
);

CREATE TYPE witness_key_status AS ENUM (
  'active',
  'revoked',
  'retired'
);

CREATE TYPE source_credential_type AS ENUM (
  'host_agent',
  'renter_client'
);

CREATE TYPE incident_status AS ENUM (
  'collecting',
  'awaiting_finalize',
  'sealed',
  'cancelled'
);

CREATE TYPE evidence_grade AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'INSUFFICIENT'
);

CREATE TYPE evidence_validation_status AS ENUM (
  'accepted'
);

CREATE TYPE probe_job_status AS ENUM (
  'pending',
  'leased',
  'completed',
  'retry',
  'dead',
  'cancelled'
);

CREATE TYPE platform_key_status AS ENUM (
  'active',
  'retired',
  'revoked'
);

CREATE TYPE audit_actor_type AS ENUM (
  'provider',
  'host_agent',
  'renter_client',
  'platform_worker',
  'system'
);

CREATE TYPE audit_result AS ENUM (
  'success',
  'denied',
  'failure'
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  alias varchar(80) NOT NULL,
  endpoint_hostname varchar(253) NOT NULL,
  endpoint_path varchar(120) NOT NULL DEFAULT '/.well-known/incident-witness/health',
  endpoint_verified_at timestamptz,
  endpoint_dns_fingerprint text,
  status host_status NOT NULL DEFAULT 'pending_endpoint',
  agent_version varchar(40),
  last_agent_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hosts_endpoint_path_check
    CHECK (endpoint_path = '/.well-known/incident-witness/health')
);

CREATE INDEX hosts_owner_created_idx
  ON hosts (owner_user_id, created_at DESC);
CREATE UNIQUE INDEX hosts_owner_hostname_active_idx
  ON hosts (owner_user_id, lower(endpoint_hostname))
  WHERE status <> 'archived';
CREATE INDEX hosts_status_last_seen_idx
  ON hosts (status, last_agent_seen_at);

CREATE TABLE host_endpoint_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  challenge_hash bytea NOT NULL,
  dns_record_name varchar(300) NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT host_endpoint_challenges_attempt_count_check
    CHECK (attempt_count BETWEEN 0 AND 10)
);

CREATE INDEX host_endpoint_challenges_host_expiry_idx
  ON host_endpoint_challenges (host_id, expires_at DESC);
CREATE INDEX host_endpoint_challenges_expiry_idx
  ON host_endpoint_challenges (expires_at);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
  title varchar(100) NOT NULL,
  workload_ref varchar(100),
  status incident_status NOT NULL DEFAULT 'collecting',
  capture_started_at timestamptz NOT NULL,
  capture_ends_at timestamptz NOT NULL,
  ingestion_deadline timestamptz NOT NULL,
  ended_at timestamptz,
  sealed_at timestamptz,
  rule_version varchar(30),
  assessment_code varchar(40),
  evidence_grade evidence_grade,
  simulation_present boolean NOT NULL DEFAULT false,
  accepted_event_count integer NOT NULL DEFAULT 0,
  accepted_event_bytes bigint NOT NULL DEFAULT 0,
  demo_mode boolean NOT NULL DEFAULT false,
  cancel_reason varchar(30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_capture_window_check CHECK (
    capture_ends_at > capture_started_at
    AND capture_ends_at >= capture_started_at + interval '2 minutes'
    AND capture_ends_at <= capture_started_at + interval '240 minutes'
  ),
  CONSTRAINT incidents_ingestion_deadline_check
    CHECK (ingestion_deadline >= capture_ends_at),
  CONSTRAINT incidents_event_count_check
    CHECK (accepted_event_count BETWEEN 0 AND 4000),
  CONSTRAINT incidents_event_bytes_check
    CHECK (accepted_event_bytes BETWEEN 0 AND 7340032),
  CONSTRAINT incidents_sealed_at_check CHECK (
    (status = 'sealed' AND sealed_at IS NOT NULL)
    OR (status <> 'sealed' AND sealed_at IS NULL)
  ),
  CONSTRAINT incidents_cancel_reason_check CHECK (
    cancel_reason IS NULL
    OR cancel_reason IN ('USER_CANCELLED', 'NO_EVIDENCE')
  )
);

CREATE INDEX incidents_owner_created_idx
  ON incidents (owner_user_id, created_at DESC);
CREATE INDEX incidents_host_status_idx
  ON incidents (host_id, status);
CREATE INDEX incidents_status_windows_idx
  ON incidents (status, capture_ends_at, ingestion_deadline);
CREATE UNIQUE INDEX incidents_one_active_per_host_idx
  ON incidents (host_id)
  WHERE status IN ('collecting', 'awaiting_finalize');

CREATE TABLE witness_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  host_id uuid REFERENCES hosts(id) ON DELETE RESTRICT,
  incident_id uuid REFERENCES incidents(id) ON DELETE RESTRICT,
  source_type witness_source_type NOT NULL,
  public_key bytea NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  status witness_key_status NOT NULL DEFAULT 'active',
  certificate_json jsonb NOT NULL,
  certificate_signature bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  last_presence_sequence bigint NOT NULL DEFAULT 0,
  last_presence_hash bytea,
  CONSTRAINT witness_keys_scope_check CHECK (
    (source_type = 'host_agent'
      AND host_id IS NOT NULL
      AND owner_user_id IS NOT NULL
      AND incident_id IS NULL)
    OR (source_type = 'renter_client'
      AND incident_id IS NOT NULL
      AND host_id IS NULL)
    OR (source_type = 'platform_probe'
      AND host_id IS NULL
      AND incident_id IS NULL)
  ),
  CONSTRAINT witness_keys_presence_sequence_check
    CHECK (last_presence_sequence BETWEEN 0 AND 9007199254740991)
);

CREATE INDEX witness_keys_host_status_idx
  ON witness_keys (host_id, status);
CREATE INDEX witness_keys_incident_status_idx
  ON witness_keys (incident_id, status);
CREATE INDEX witness_keys_source_status_idx
  ON witness_keys (source_type, status);

CREATE TABLE source_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key_id uuid NOT NULL REFERENCES witness_keys(id) ON DELETE RESTRICT,
  credential_hash bytea NOT NULL UNIQUE,
  credential_type source_credential_type NOT NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_credentials_key_revoked_idx
  ON source_credentials (source_key_id, revoked_at);

CREATE TABLE enrollment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_key_id uuid REFERENCES witness_keys(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX enrollment_tokens_host_expiry_idx
  ON enrollment_tokens (host_id, expires_at DESC);

CREATE TABLE renter_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  renter_key_id uuid REFERENCES witness_keys(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX renter_invitations_incident_expiry_idx
  ON renter_invitations (incident_id, expires_at DESC);

CREATE TABLE evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  source_key_id uuid NOT NULL REFERENCES witness_keys(id) ON DELETE RESTRICT,
  source_type witness_source_type NOT NULL,
  event_type varchar(50) NOT NULL,
  sequence bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  canonical_event jsonb NOT NULL,
  canonical_sha256 bytea NOT NULL,
  signature bytea NOT NULL,
  simulation_mode boolean NOT NULL DEFAULT false,
  validation_status evidence_validation_status NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_events_sequence_check
    CHECK (sequence BETWEEN 1 AND 9007199254740991)
);

CREATE UNIQUE INDEX evidence_events_source_sequence_idx
  ON evidence_events (source_key_id, sequence);
CREATE UNIQUE INDEX evidence_events_incident_id_idx
  ON evidence_events (incident_id, id);
CREATE INDEX evidence_events_incident_observed_idx
  ON evidence_events (incident_id, observed_at, id);
CREATE INDEX evidence_events_source_sequence_lookup_idx
  ON evidence_events (source_key_id, sequence);

CREATE TABLE probe_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
  scheduled_at timestamptz NOT NULL,
  lease_owner varchar(80),
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  status probe_job_status NOT NULL DEFAULT 'pending',
  last_error_code varchar(50),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX probe_jobs_due_idx
  ON probe_jobs (scheduled_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX probe_jobs_lease_expiry_idx
  ON probe_jobs (lease_expires_at);
CREATE INDEX probe_jobs_incident_scheduled_idx
  ON probe_jobs (incident_id, scheduled_at);

CREATE TABLE platform_signing_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id varchar(80) NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  algorithm varchar(20) NOT NULL DEFAULT 'Ed25519',
  status platform_key_status NOT NULL DEFAULT 'active',
  not_before timestamptz NOT NULL DEFAULT now(),
  not_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_signing_keys_algorithm_check
    CHECK (algorithm = 'Ed25519')
);

CREATE TABLE evidence_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  bundle_version varchar(20) NOT NULL,
  rule_version varchar(30) NOT NULL,
  platform_key_id uuid NOT NULL REFERENCES platform_signing_keys(id) ON DELETE RESTRICT,
  manifest jsonb NOT NULL,
  manifest_sha256 bytea NOT NULL,
  platform_signature bytea NOT NULL,
  byte_length integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_bundles_byte_length_check
    CHECK (byte_length <= 10485760)
);

CREATE INDEX evidence_bundles_owner_created_idx
  ON evidence_bundles (owner_user_id, created_at DESC);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type audit_actor_type NOT NULL,
  actor_id uuid,
  owner_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resource_type varchar(40) NOT NULL,
  resource_id uuid,
  action varchar(60) NOT NULL,
  result audit_result NOT NULL,
  request_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_owner_created_idx
  ON audit_events (owner_user_id, created_at DESC);
CREATE INDEX audit_events_resource_created_idx
  ON audit_events (resource_type, resource_id, created_at DESC);
CREATE INDEX audit_events_request_idx
  ON audit_events (request_id);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  operation varchar(80) NOT NULL,
  key_hash bytea NOT NULL,
  request_hash bytea NOT NULL,
  response_status integer NOT NULL,
  resource_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idempotency_records_key_idx
  ON idempotency_records (owner_user_id, operation, key_hash);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hosts_set_updated_at
  BEFORE UPDATE ON hosts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER incidents_set_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER probe_jobs_set_updated_at
  BEFORE UPDATE ON probe_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
