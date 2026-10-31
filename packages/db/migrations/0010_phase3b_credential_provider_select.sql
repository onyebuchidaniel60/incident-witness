-- Phase 3B follow-up: provider key revocation updates linked source
-- credentials. PostgreSQL requires the target rows to be visible under the
-- provider context, so add a narrowly scoped SELECT policy for credentials
-- linked to a host key or incident key owned by the provider. The API never
-- returns credential hashes.

CREATE POLICY source_credentials_provider_select ON source_credentials
  FOR SELECT TO iw_api
  USING (
    current_setting('iw.request_mode', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM witness_keys k
      WHERE k.id = source_credentials.source_key_id
        AND (
          k.owner_user_id = public.iw_uid()
          OR EXISTS (
            SELECT 1 FROM incidents i
            WHERE i.id = k.incident_id
              AND i.owner_user_id = public.iw_uid()
          )
        )
    )
  );
