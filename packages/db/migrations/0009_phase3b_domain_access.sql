-- Phase 3B domain access.
--
-- The Phase 2 schema already contains every table and column Phase 3B needs.
-- This migration adds only the narrow column grants and RLS policies required
-- by host enrollment, renter enrollment, incident lifecycle, key revocation and
-- host archival. No table or column definition is changed.
--
-- Identity remains transaction-local:
--   provider         -> request.jwt.claim.sub + public.iw_uid()
--   machine_ingest   -> source credential hash + source/host/incident scope
--   machine_enroll   -> one-time token hash + host/incident scope
--   system_lifecycle -> bounded overdue-incident sweeper only

-- Host endpoint challenges: issuing a replacement challenge expires the old one.
GRANT UPDATE (expires_at) ON TABLE host_endpoint_challenges TO iw_api;

-- Probe jobs: provider routes create the initial job, end/archive cancel future
-- jobs; the lifecycle sweeper performs the same cancellation in system mode.
GRANT SELECT (
  id,
  incident_id,
  host_id,
  scheduled_at,
  lease_owner,
  lease_expires_at,
  attempt_count,
  status,
  last_error_code,
  completed_at,
  created_at,
  updated_at
) ON TABLE probe_jobs TO iw_api;
GRANT INSERT (incident_id, host_id, scheduled_at, status) ON TABLE probe_jobs TO iw_api;
GRANT UPDATE (status, completed_at) ON TABLE probe_jobs TO iw_api;

-- Source credentials: enrollment creates one; revocation only sets timestamps.
GRANT INSERT (source_key_id, credential_hash, credential_type, expires_at)
  ON TABLE source_credentials TO iw_api;
GRANT UPDATE (revoked_at, last_used_at) ON TABLE source_credentials TO iw_api;

-- Witness keys: enrollment registers the public key and platform certificate.
GRANT INSERT (
  id,
  owner_user_id,
  host_id,
  incident_id,
  source_type,
  public_key,
  fingerprint,
  status,
  certificate_json,
  certificate_signature
) ON TABLE witness_keys TO iw_api;

-- Provider probe-job access is limited to incidents the provider owns.
CREATE POLICY probe_jobs_provider_select ON probe_jobs
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.owner_user_id = public.iw_uid()
    )
  );

CREATE POLICY probe_jobs_provider_insert ON probe_jobs
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.host_id = probe_jobs.host_id
        AND i.owner_user_id = public.iw_uid()
    )
  );

CREATE POLICY probe_jobs_provider_update ON probe_jobs
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.owner_user_id = public.iw_uid()
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.owner_user_id = public.iw_uid()
    )
  );

-- Provider key revocation may revoke credentials linked to owned host keys or
-- keys scoped to an owned incident. It never exposes credential hashes.
CREATE POLICY source_credentials_provider_update ON source_credentials
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM witness_keys k
      WHERE k.id = source_credentials.source_key_id
        AND (
          k.owner_user_id = public.iw_uid()
          OR EXISTS (
            SELECT 1 FROM incidents i
            WHERE i.id = k.incident_id
              AND i.owner_user_id = public.iw_uid()
          )
        )
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM witness_keys k
      WHERE k.id = source_credentials.source_key_id
        AND (
          k.owner_user_id = public.iw_uid()
          OR EXISTS (
            SELECT 1 FROM incidents i
            WHERE i.id = k.incident_id
              AND i.owner_user_id = public.iw_uid()
          )
        )
    )
  );

-- Machine presence may update only the credential's last-used timestamp.
CREATE POLICY source_credentials_machine_update ON source_credentials
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND source_key_id = nullif(current_setting('iw.source_key_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND source_key_id = nullif(current_setting('iw.source_key_id', true), '')::uuid
  );

-- Machine enrollment: a one-time token is the only authority. The API sets the
-- token hash, then the host/incident/owner/source-key scope, inside one
-- transaction after validating the token row.
CREATE POLICY enrollment_tokens_enroll_select ON enrollment_tokens
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND token_hash = decode(
      nullif(current_setting('iw.enrollment_token_hash_hex', true), ''),
      'hex'
    )
  );

CREATE POLICY enrollment_tokens_enroll_update ON enrollment_tokens
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND token_hash = decode(
      nullif(current_setting('iw.enrollment_token_hash_hex', true), ''),
      'hex'
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND token_hash = decode(
      nullif(current_setting('iw.enrollment_token_hash_hex', true), ''),
      'hex'
    )
  );

CREATE POLICY hosts_enroll_select ON hosts
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.host_id', true), '')::uuid
    AND owner_user_id = nullif(current_setting('iw.owner_user_id', true), '')::uuid
  );

CREATE POLICY hosts_enroll_update ON hosts
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.host_id', true), '')::uuid
    AND owner_user_id = nullif(current_setting('iw.owner_user_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.host_id', true), '')::uuid
    AND owner_user_id = nullif(current_setting('iw.owner_user_id', true), '')::uuid
  );

CREATE POLICY incidents_enroll_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
  );

CREATE POLICY renter_invitations_enroll_select ON renter_invitations
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND token_hash = decode(
      nullif(current_setting('iw.invitation_token_hash_hex', true), ''),
      'hex'
    )
  );

CREATE POLICY renter_invitations_enroll_update ON renter_invitations
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND token_hash = decode(
      nullif(current_setting('iw.invitation_token_hash_hex', true), ''),
      'hex'
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND token_hash = decode(
      nullif(current_setting('iw.invitation_token_hash_hex', true), ''),
      'hex'
    )
  );

CREATE POLICY witness_keys_enroll_select ON witness_keys
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND (
      id = nullif(current_setting('iw.source_key_id', true), '')::uuid
      OR (
        source_type = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
      )
      OR (
        source_type = 'renter_client'
        AND incident_id = nullif(current_setting('iw.incident_id', true), '')::uuid
      )
    )
  );

CREATE POLICY witness_keys_enroll_insert ON witness_keys
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.source_key_id', true), '')::uuid
    AND (
      (
        source_type = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
        AND incident_id IS NULL
        AND owner_user_id = nullif(current_setting('iw.owner_user_id', true), '')::uuid
      )
      OR (
        source_type = 'renter_client'
        AND incident_id = nullif(current_setting('iw.incident_id', true), '')::uuid
        AND host_id IS NULL
        AND owner_user_id = nullif(current_setting('iw.owner_user_id', true), '')::uuid
      )
    )
  );

CREATE POLICY source_credentials_enroll_insert ON source_credentials
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND source_key_id = nullif(current_setting('iw.source_key_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM witness_keys k
      WHERE k.id = source_credentials.source_key_id
        AND k.status = 'active'
        AND k.source_type::text = source_credentials.credential_type::text
    )
  );

CREATE POLICY audit_events_enroll_insert ON audit_events
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND actor_type IN ('host_agent', 'renter_client', 'system')
  );

-- Lifecycle sweeper: bounded to collecting incidents whose capture window has
-- elapsed. Probe jobs are cancelled before the incident state changes so the
-- policy can still see the incident as collecting.
CREATE POLICY incidents_system_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND status = 'collecting'
    AND capture_ends_at <= now()
  );

CREATE POLICY incidents_system_update ON incidents
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND status = 'collecting'
    AND capture_ends_at <= now()
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND status = 'awaiting_finalize'
  );

CREATE POLICY probe_jobs_system_select ON probe_jobs
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.status = 'collecting'
        AND i.capture_ends_at <= now()
    )
  );

CREATE POLICY probe_jobs_system_update ON probe_jobs
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.status = 'collecting'
        AND i.capture_ends_at <= now()
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.status = 'collecting'
        AND i.capture_ends_at <= now()
    )
  );

CREATE POLICY audit_events_system_insert ON audit_events
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND actor_type = 'system'
  );
