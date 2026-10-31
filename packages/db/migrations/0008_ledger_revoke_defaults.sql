-- Supabase's default privileges granted anon/authenticated full access to the
-- newly created ledger table. Remove all default access; only iw_api may read it.
REVOKE ALL ON TABLE iw_schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE iw_schema_migrations TO iw_api;
