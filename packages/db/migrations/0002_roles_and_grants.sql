-- Restricted runtime roles and column/table grants.
-- Role passwords are provisioned separately from the runtime environment and
-- are never stored in this migration.

DO $roles$
DECLARE
  role_record record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
    INTO role_record
    FROM pg_roles
   WHERE rolname = 'iw_api';

  IF NOT FOUND THEN
    EXECUTE 'CREATE ROLE iw_api LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT';
  ELSE
    IF role_record.rolsuper OR role_record.rolbypassrls
       OR role_record.rolcreatedb OR role_record.rolcreaterole THEN
      RAISE EXCEPTION 'iw_api exists with unsafe role attributes';
    END IF;
    IF NOT role_record.rolcanlogin THEN
      EXECUTE 'ALTER ROLE iw_api LOGIN';
    END IF;
  END IF;

  SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
    INTO role_record
    FROM pg_roles
   WHERE rolname = 'iw_worker';

  IF NOT FOUND THEN
    EXECUTE 'CREATE ROLE iw_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT';
  ELSE
    IF role_record.rolsuper OR role_record.rolbypassrls
       OR role_record.rolcreatedb OR role_record.rolcreaterole THEN
      RAISE EXCEPTION 'iw_worker exists with unsafe role attributes';
    END IF;
    IF NOT role_record.rolcanlogin THEN
      EXECUTE 'ALTER ROLE iw_worker LOGIN';
    END IF;
  END IF;
END
$roles$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA public FROM authenticated;

GRANT USAGE ON SCHEMA public TO iw_api, iw_worker;
GRANT USAGE ON SCHEMA auth TO iw_api;
GRANT EXECUTE ON FUNCTION auth.uid() TO iw_api;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Provider API grants.
GRANT SELECT, INSERT ON TABLE profiles TO iw_api;
GRANT UPDATE (display_name) ON TABLE profiles TO iw_api;

GRANT SELECT, INSERT ON TABLE hosts TO iw_api;
GRANT UPDATE (
  alias,
  endpoint_hostname,
  endpoint_path,
  endpoint_verified_at,
  endpoint_dns_fingerprint,
  status,
  agent_version,
  last_agent_seen_at
) ON TABLE hosts TO iw_api;

GRANT SELECT, INSERT ON TABLE host_endpoint_challenges TO iw_api;
GRANT UPDATE (verified_at, attempt_count) ON TABLE host_endpoint_challenges TO iw_api;

GRANT SELECT, INSERT ON TABLE incidents TO iw_api;
GRANT UPDATE (
  status,
  ended_at,
  sealed_at,
  rule_version,
  assessment_code,
  evidence_grade,
  simulation_present,
  accepted_event_count,
  accepted_event_bytes,
  cancel_reason
) ON TABLE incidents TO iw_api;

GRANT SELECT ON TABLE witness_keys TO iw_api;
GRANT UPDATE (
  status,
  revoked_at,
  last_seen_at,
  last_presence_sequence,
  last_presence_hash
) ON TABLE witness_keys TO iw_api;

GRANT SELECT, INSERT ON TABLE enrollment_tokens TO iw_api;
GRANT UPDATE (redeemed_at, redeemed_key_id, revoked_at) ON TABLE enrollment_tokens TO iw_api;

GRANT SELECT, INSERT ON TABLE renter_invitations TO iw_api;
GRANT UPDATE (redeemed_at, renter_key_id, revoked_at) ON TABLE renter_invitations TO iw_api;

GRANT SELECT, INSERT ON TABLE evidence_events TO iw_api;

GRANT SELECT (
  id,
  source_key_id,
  credential_hash,
  credential_type,
  expires_at,
  revoked_at
) ON TABLE source_credentials TO iw_api;

GRANT SELECT, INSERT ON TABLE idempotency_records TO iw_api;

GRANT SELECT, INSERT ON TABLE audit_events TO iw_api;

GRANT SELECT ON TABLE evidence_bundles TO iw_api;

-- Worker grants. No profile, credential, bundle or provider-account access.
GRANT SELECT (id, endpoint_hostname, status) ON TABLE hosts TO iw_worker;

GRANT SELECT (
  id,
  host_id,
  status,
  capture_started_at,
  capture_ends_at,
  ingestion_deadline
) ON TABLE incidents TO iw_worker;

GRANT SELECT ON TABLE probe_jobs TO iw_worker;
GRANT UPDATE (
  lease_owner,
  lease_expires_at,
  attempt_count,
  status,
  last_error_code,
  completed_at
) ON TABLE probe_jobs TO iw_worker;

GRANT SELECT (
  id,
  source_type,
  public_key,
  fingerprint,
  status,
  certificate_json,
  certificate_signature,
  host_id,
  incident_id
) ON TABLE witness_keys TO iw_worker;

GRANT INSERT ON TABLE evidence_events TO iw_worker;

GRANT INSERT (
  actor_type,
  actor_id,
  resource_type,
  resource_id,
  action,
  result,
  request_id,
  metadata
) ON TABLE audit_events TO iw_worker;
