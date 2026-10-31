-- Supabase's default public-schema event trigger enables RLS on new tables.
-- The migration ledger is an internal, non-product table and is readable only
-- through the explicit iw_api grant added above; it does not need RLS.
ALTER TABLE iw_schema_migrations DISABLE ROW LEVEL SECURITY;
