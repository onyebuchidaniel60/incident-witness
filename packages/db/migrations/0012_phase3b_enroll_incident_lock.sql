-- Phase 3B follow-up: renter enrollment takes a shared row lock on the
-- incident so it cannot race a manual end/finalization. PostgreSQL applies the
-- UPDATE policy to SELECT ... FOR SHARE, so add the narrow enrollment policy.

CREATE POLICY incidents_enroll_update ON incidents
  FOR UPDATE TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('iw.request_mode', true) = 'machine_enroll'
    AND id = nullif(current_setting('iw.incident_id', true), '')::uuid
  );
