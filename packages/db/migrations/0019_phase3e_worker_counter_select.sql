-- Phase 3E follow-up: the probe worker must read the incident evidence
-- counters under the same row lock before appending a platform probe event.
-- Grants only; no table or column definitions change.

GRANT SELECT (
  accepted_event_count,
  accepted_event_bytes
) ON TABLE incidents TO iw_worker;
