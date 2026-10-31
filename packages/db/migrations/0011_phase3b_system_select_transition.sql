-- Phase 3B follow-up: PostgreSQL also applies the SELECT policy visibility to
-- the updated row. The sweeper's SELECT policy must therefore include the
-- post-transition state so a collecting -> awaiting_finalize update is allowed.
-- This also removes temporary diagnostic policies created during local testing.

DROP POLICY IF EXISTS incidents_system_select_any ON incidents;
DROP POLICY IF EXISTS incidents_system_update_test ON incidents;
DROP POLICY IF EXISTS incidents_system_update_true ON incidents;

DROP POLICY IF EXISTS incidents_system_select ON incidents;

CREATE POLICY incidents_system_select ON incidents
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'system_lifecycle'
    AND status IN ('collecting', 'awaiting_finalize')
    AND capture_ends_at <= now()
  );
