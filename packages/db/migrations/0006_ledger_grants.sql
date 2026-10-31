-- Readiness reads the dedicated Incident Witness migration ledger through
-- iw_api. The ledger is not a product data table and has no RLS policy.
GRANT SELECT ON TABLE iw_schema_migrations TO iw_api;
