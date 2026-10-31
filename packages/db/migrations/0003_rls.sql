-- Row-level security for provider and machine access.
-- Every table is deny-by-default for roles without an explicit grant/policy.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_endpoint_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE renter_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE probe_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;

-- Provider API policies.

CREATE POLICY profiles_provider_select ON profiles
  FOR SELECT TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND id = auth.uid());

CREATE POLICY profiles_provider_insert ON profiles
  FOR INSERT TO iw_api
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND id = auth.uid());

CREATE POLICY profiles_provider_update ON profiles
  FOR UPDATE TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND id = auth.uid())
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND id = auth.uid());

CREATE POLICY hosts_provider_select ON hosts
  FOR SELECT TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY hosts_provider_insert ON hosts
  FOR INSERT TO iw_api
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY hosts_provider_update ON hosts
  FOR UPDATE TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid())
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY host_endpoint_challenges_provider_select ON host_endpoint_challenges
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hosts h
      WHERE h.id = host_endpoint_challenges.host_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY host_endpoint_challenges_provider_insert ON host_endpoint_challenges
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hosts h
      WHERE h.id = host_endpoint_challenges.host_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY host_endpoint_challenges_provider_update ON host_endpoint_challenges
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
  );

CREATE POLICY incidents_provider_select ON incidents
  FOR SELECT TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY incidents_provider_insert ON incidents
  FOR INSERT TO iw_api
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY incidents_provider_update ON incidents
  FOR UPDATE TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid())
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY witness_keys_provider_select ON witness_keys
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM incidents i
        WHERE i.id = witness_keys.incident_id
          AND i.owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY witness_keys_provider_update ON witness_keys
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM incidents i
        WHERE i.id = witness_keys.incident_id
          AND i.owner_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM incidents i
        WHERE i.id = witness_keys.incident_id
          AND i.owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY enrollment_tokens_provider_select ON enrollment_tokens
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM hosts h WHERE h.id = enrollment_tokens.host_id AND h.owner_user_id = auth.uid())
  );

CREATE POLICY enrollment_tokens_provider_insert ON enrollment_tokens
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM hosts h WHERE h.id = enrollment_tokens.host_id AND h.owner_user_id = auth.uid())
  );

CREATE POLICY enrollment_tokens_provider_update ON enrollment_tokens
  FOR UPDATE TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid())
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY renter_invitations_provider_select ON renter_invitations
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = renter_invitations.incident_id
        AND i.owner_user_id = auth.uid()
    )
  );

CREATE POLICY renter_invitations_provider_insert ON renter_invitations
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = renter_invitations.incident_id
        AND i.owner_user_id = auth.uid()
    )
  );

CREATE POLICY renter_invitations_provider_update ON renter_invitations
  FOR UPDATE TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid())
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY evidence_events_provider_select ON evidence_events
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = evidence_events.incident_id
        AND i.owner_user_id = auth.uid()
    )
  );

CREATE POLICY evidence_bundles_provider_select ON evidence_bundles
  FOR SELECT TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY idempotency_records_provider_select ON idempotency_records
  FOR SELECT TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY idempotency_records_provider_insert ON idempotency_records
  FOR INSERT TO iw_api
  WITH CHECK (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY audit_events_provider_select ON audit_events
  FOR SELECT TO iw_api
  USING (current_setting('iw.request_mode', true) = 'provider' AND owner_user_id = auth.uid());

CREATE POLICY audit_events_provider_insert ON audit_events
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = auth.uid()
  );

-- Machine-ingestion policies for iw_api. These are tested with the real
-- transaction-local GUCs; no SET ROLE is used.

CREATE POLICY source_credentials_machine_select ON source_credentials
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND credential_hash = decode(
      nullif(current_setting('iw.credential_hash_hex', true), ''),
      'hex'
    )
  );

CREATE POLICY witness_keys_machine_select ON witness_keys
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.source_key_id', true), '')::uuid
  );

CREATE POLICY witness_keys_machine_update ON witness_keys
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.source_key_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.source_key_id', true), '')::uuid
  );

CREATE POLICY incidents_machine_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
  );

CREATE POLICY incidents_machine_update ON incidents
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
  );

CREATE POLICY hosts_machine_select ON hosts
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.host_id', true), '')::uuid
  );

CREATE POLICY hosts_machine_update ON hosts
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.host_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.host_id', true), '')::uuid
  );

CREATE POLICY evidence_events_machine_insert ON evidence_events
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND source_type IN ('host_agent', 'renter_client')
    AND source_key_id = nullif(current_setting('iw.source_key_id', true), '')::uuid
    AND incident_id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM witness_keys k
      WHERE k.id = evidence_events.source_key_id
        AND k.status = 'active'
        AND k.source_type = evidence_events.source_type
        AND (k.host_id = nullif(current_setting('iw.host_id', true), '')::uuid OR k.host_id IS NULL)
        AND (k.incident_id = evidence_events.incident_id OR k.incident_id IS NULL)
    )
  );

CREATE POLICY audit_events_machine_insert ON audit_events
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND actor_type IN ('host_agent', 'renter_client', 'system')
  );

-- Worker-only policies.

CREATE POLICY incidents_worker_select ON incidents
  FOR SELECT TO iw_worker
  USING (status IN ('collecting', 'awaiting_finalize'));

CREATE POLICY hosts_worker_select ON hosts
  FOR SELECT TO iw_worker
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.host_id = hosts.id
        AND i.status IN ('collecting', 'awaiting_finalize')
    )
  );

CREATE POLICY probe_jobs_worker_select ON probe_jobs
  FOR SELECT TO iw_worker
  USING (true);

CREATE POLICY probe_jobs_worker_update ON probe_jobs
  FOR UPDATE TO iw_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY witness_keys_worker_select ON witness_keys
  FOR SELECT TO iw_worker
  USING (source_type = 'platform_probe' AND status = 'active');

CREATE POLICY evidence_events_worker_insert ON evidence_events
  FOR INSERT TO iw_worker
  WITH CHECK (
    source_type = 'platform_probe'
    AND EXISTS (
      SELECT 1 FROM witness_keys k
      WHERE k.id = evidence_events.source_key_id
        AND k.source_type = 'platform_probe'
        AND k.status = 'active'
    )
  );

CREATE POLICY audit_events_worker_insert ON audit_events
  FOR INSERT TO iw_worker
  WITH CHECK (actor_type = 'platform_worker');
