-- Phase 3C follow-up: avoid RLS recursion between incidents and witness_keys.
-- The API validates the source key scope before setting these GUCs. The policy
-- then prevents a host key from locking an incident belonging to another host,
-- and renter keys are already pinned to their incident before the lock.

DROP POLICY IF EXISTS incidents_machine_select ON incidents;
CREATE POLICY incidents_machine_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND (
      current_setting('iw.source_type', true) = 'renter_client'
      OR (
        current_setting('iw.source_type', true) = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
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
      current_setting('iw.source_type', true) = 'renter_client'
      OR (
        current_setting('iw.source_type', true) = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND (
      current_setting('iw.source_type', true) = 'renter_client'
      OR (
        current_setting('iw.source_type', true) = 'host_agent'
        AND host_id = nullif(current_setting('iw.host_id', true), '')::uuid
      )
    )
  );
