-- Phase 5: the probe worker must evaluate the effective capture end before
-- appending a new observation. Grant read access to the manual end timestamp
-- only; no table or column definitions change.

GRANT SELECT (ended_at) ON TABLE incidents TO iw_worker;
