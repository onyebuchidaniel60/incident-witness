-- Phase 3C follow-up: event ingestion needs to see its own previously accepted
-- events for exact-duplicate and sequence-collision checks. Scope the machine
-- SELECT policy to the authenticated source key and incident; cross-key event-ID
-- collisions are still caught by the primary-key constraint.

CREATE POLICY evidence_events_machine_select ON evidence_events
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_ingest'
    AND incident_id = nullif(current_setting('iw.incident_id', true), '')::uuid
    AND source_key_id = nullif(current_setting('iw.source_key_id', true), '')::uuid
  );
