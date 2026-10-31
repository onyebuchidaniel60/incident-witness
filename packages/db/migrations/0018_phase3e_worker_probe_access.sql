-- Phase 3E probe-worker access.
--
-- No table or column definitions change. The separate iw_worker process needs
-- to schedule the next probe interval, append platform_probe evidence, and
-- maintain the incident evidence counters atomically with that append. Access
-- remains narrowly column-scoped and RLS-scoped.

GRANT INSERT (
  incident_id,
  host_id,
  scheduled_at,
  status
) ON TABLE probe_jobs TO iw_worker;

GRANT UPDATE (scheduled_at) ON TABLE probe_jobs TO iw_worker;

CREATE POLICY probe_jobs_worker_insert ON probe_jobs
  FOR INSERT TO iw_worker
  WITH CHECK (
    status IN ('pending', 'retry')
    AND EXISTS (
      SELECT 1
        FROM incidents i
        JOIN hosts h ON h.id = i.host_id
       WHERE i.id = probe_jobs.incident_id
         AND i.host_id = probe_jobs.host_id
         AND i.status = 'collecting'
         AND i.capture_ends_at > now()
         AND h.status = 'active'
    )
  );

GRANT UPDATE (
  accepted_event_count,
  accepted_event_bytes
) ON TABLE incidents TO iw_worker;

CREATE POLICY incidents_worker_counter_update ON incidents
  FOR UPDATE TO iw_worker
  USING (status IN ('collecting', 'awaiting_finalize'))
  WITH CHECK (status IN ('collecting', 'awaiting_finalize'));

-- The worker allocates the next per-key sequence and checks deterministic
-- event-id idempotency. It cannot read payloads, signatures or bundle data.
GRANT SELECT (
  id,
  source_key_id,
  sequence
) ON TABLE evidence_events TO iw_worker;

CREATE POLICY evidence_events_worker_sequence_select ON evidence_events
  FOR SELECT TO iw_worker
  USING (source_type = 'platform_probe');
