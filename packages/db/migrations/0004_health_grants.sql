-- The API readiness check reads the migration ledger through the restricted
-- iw_api connection. No other application table access is added here.
GRANT SELECT ON TABLE schema_migrations TO iw_api;
