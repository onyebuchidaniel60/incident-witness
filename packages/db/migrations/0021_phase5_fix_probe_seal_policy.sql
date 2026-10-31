-- Correct the platform-probe seal policy to avoid recursive RLS evaluation.
--
-- The first policy queried evidence_events from witness_keys while the
-- evidence_events INSERT policy queried witness_keys, producing PostgreSQL
-- error 42P17. Platform-probe public keys and registration certificates are
-- public bundle material and contain no private key, so provider/system seal
-- paths may read them directly when the request mode is provider or system.

DROP POLICY IF EXISTS witness_keys_bundle_seal_select ON witness_keys;

CREATE POLICY witness_keys_bundle_seal_select ON witness_keys
  FOR SELECT TO iw_api
  USING (
    source_type = 'platform_probe'
    AND current_setting('iw.request_mode', true) IN ('provider', 'system_lifecycle')
  );
