-- Phase 3C follow-up: an awaiting_finalize incident becomes eligible for
-- automatic sealing at ingestion_deadline, which can be much later than the
-- scheduled capture end. The system visibility policy must use the ingestion
-- deadline for finalization states.

DROP POLICY IF EXISTS incidents_system_select ON incidents;
CREATE POLICY incidents_system_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND (
      (status = 'collecting' AND capture_ends_at <= now())
      OR (
        status IN ('awaiting_finalize', 'sealed', 'cancelled')
        AND ingestion_deadline <= now()
      )
    )
  );
