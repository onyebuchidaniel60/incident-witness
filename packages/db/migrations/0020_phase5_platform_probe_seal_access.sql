-- Phase 5 sealing access for platform-probe source certificates.
--
-- No table or column definitions change. Platform-probe keys are not owned by a
-- provider, so the existing provider/system key policies cannot expose them to
-- the seal transaction. Platform-probe public keys and registration
-- certificates are public bundle material and contain no private key, so the
-- provider/system seal paths may read them directly.

CREATE POLICY witness_keys_bundle_seal_select ON witness_keys
  FOR SELECT TO iw_api
  USING (
    source_type = 'platform_probe'
    AND current_setting('iw.request_mode', true) IN ('provider', 'system_lifecycle')
  );
