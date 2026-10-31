-- Phase 3C evidence ingestion and sealing access.
--
-- No table or column definitions change. This migration adds:
--   * narrow machine-ingest incident policies scoped to the authenticated key;
--   * system-lifecycle read access required by automatic sealing;
--   * immutable bundle INSERT access for provider and system seal paths;
--   * public platform-key metadata lookup for the seal transaction.

GRANT INSERT (
  id,
  incident_id,
  owner_user_id,
  bundle_version,
  rule_version,
  platform_key_id,
  manifest,
  manifest_sha256,
  platform_signature,
  byte_length
) ON TABLE evidence_bundles TO iw_api;

GRANT SELECT (
  id,
  key_id,
  public_key,
  fingerprint,
  algorithm,
  status,
  not_before,
  not_after,
  created_at
) ON TABLE platform_signing_keys TO iw_api;

CREATE POLICY platform_signing_keys_api_select ON platform_signing_keys
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) IN ('provider', 'system_lifecycle')
  );

-- Provider seal inserts the immutable bundle before changing incident state.
CREATE POLICY evidence_bundles_provider_insert ON evidence_bundles
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'provider'
    AND owner_user_id = public.iw_uid()
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = evidence_bundles.incident_id
        AND i.owner_user_id = public.iw_uid()
        AND i.status = 'awaiting_finalize'
    )
  );

-- Automatic seal/cancel at the ingestion deadline.
CREATE POLICY evidence_bundles_system_insert ON evidence_bundles
  FOR INSERT TO iw_api
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = evidence_bundles.incident_id
        AND i.owner_user_id = evidence_bundles.owner_user_id
        AND i.status = 'awaiting_finalize'
        AND i.ingestion_deadline <= now()
    )
  );

CREATE POLICY evidence_bundles_system_select ON evidence_bundles
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = evidence_bundles.incident_id
        AND i.status = 'sealed'
        AND i.ingestion_deadline <= now()
    )
  );

-- System seal reads accepted events, source certificates and host metadata.
CREATE POLICY evidence_events_system_select ON evidence_events
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = evidence_events.incident_id
        AND i.status = 'awaiting_finalize'
        AND i.ingestion_deadline <= now()
    )
  );

CREATE POLICY witness_keys_system_select ON witness_keys
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.ingestion_deadline <= now()
        AND i.status = 'awaiting_finalize'
        AND (
          witness_keys.host_id = i.host_id
          OR witness_keys.incident_id = i.id
        )
    )
  );

CREATE POLICY hosts_system_select ON hosts
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.host_id = hosts.id
        AND i.status = 'awaiting_finalize'
        AND i.ingestion_deadline <= now()
    )
  );

CREATE POLICY probe_jobs_system_seal_select ON probe_jobs
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = probe_jobs.incident_id
        AND i.status = 'awaiting_finalize'
        AND i.ingestion_deadline <= now()
    )
  );

-- The system sweeper must see the post-transition row while sealing/cancelling.
DROP POLICY IF EXISTS incidents_system_select ON incidents;
CREATE POLICY incidents_system_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND (
      (
        status IN ('collecting', 'awaiting_finalize')
        AND capture_ends_at <= now()
      )
      OR (
        status IN ('sealed', 'cancelled')
        AND ingestion_deadline <= now()
      )
    )
  );

CREATE POLICY incidents_system_finalize_update ON incidents
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND status = 'awaiting_finalize'
    AND ingestion_deadline <= now()
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND status IN ('sealed', 'cancelled')
  );

-- Machine ingestion incident access is scoped to the authenticated source key.
-- This prevents a host or renter credential from locking an unrelated incident
-- row by supplying an arbitrary incident ID.
DROP POLICY IF EXISTS incidents_machine_select ON incidents;
CREATE POLICY incidents_machine_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND (
      (
        current_setting('iw.source_type', true) = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM witness_keys k
          WHERE k.id = nullif(current_setting('iw.source_key_id', true), '')::uuid
            AND k.host_id = incidents.host_id
        )
      )
      OR (
        current_setting('iw.source_type', true) = 'renter_client'
        AND EXISTS (
          SELECT 1 FROM witness_keys k
          WHERE k.id = nullif(current_setting('iw.source_key_id', true), '')::uuid
            AND k.incident_id = incidents.id
        )
      )
    )
  );

DROP POLICY IF EXISTS incidents_machine_update ON incidents;
CREATE POLICY incidents_machine_update ON incidents
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND (
      (
        current_setting('iw.source_type', true) = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM witness_keys k
          WHERE k.id = nullif(current_setting('iw.source_key_id', true), '')::uuid
            AND k.host_id = incidents.host_id
        )
      )
      OR (
        current_setting('iw.source_type', true) = 'renter_client'
        AND EXISTS (
          SELECT 1 FROM witness_keys k
          WHERE k.id = nullif(current_setting('iw.source_key_id', true), '')::uuid
            AND k.incident_id = incidents.id
        )
      )
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND (
      (
        current_setting('iw.source_type', true) = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM witness_keys k
          WHERE k.id = nullif(current_setting('iw.source_key_id', true), '')::uuid
            AND k.host_id = incidents.host_id
        )
      )
      OR (
        current_setting('iw.source_type', true) = 'renter_client'
        AND EXISTS (
          SELECT 1 FROM witness_keys k
          WHERE k.id = nullif(current_setting('iw.source_key_id', true), '')::uuid
            AND k.incident_id = incidents.id
        )
      )
    )
  );
