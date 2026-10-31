-- Phase 3C follow-up: the system SELECT policy must allow the new row created
-- by the collecting -> awaiting_finalize transition (capture_ends_at <= now)
-- as well as the later awaiting_finalize -> sealed/cancelled transition
-- (ingestion_deadline <= now).

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
        status IN ('awaiting_finalize', 'sealed', 'cancelled')
        AND ingestion_deadline <= now()
      )
    )
  );
