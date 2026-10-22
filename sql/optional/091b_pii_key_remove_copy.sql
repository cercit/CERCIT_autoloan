-- =============================================================================
-- 091b: remove the old copy of the encryption key from app_secrets (by hand)
-- =============================================================================
-- Run ONLY after:
--   1. 091 has run and its check showed in_vault = true and still_decrypts = true;
--   2. you have saved the key somewhere safe outside Supabase (a password manager).
--      To see it once, in the SQL editor:  SELECT value FROM app_secrets WHERE name = 'pii_key';
--      Without a saved copy, a restore into another project could never decrypt PAN or mobile.
--
-- It refuses to delete unless Vault holds the identical key.
-- =============================================================================

DO $$
DECLARE
  v_key TEXT;
  v_vault TEXT;
BEGIN
  SELECT value INTO v_key FROM app_secrets WHERE name = 'pii_key';
  IF v_key IS NULL THEN
    RAISE NOTICE '091b: already removed';
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_vault FROM vault.decrypted_secrets WHERE name = 'pii_key';
  IF v_vault IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION '091b: Vault does not hold the same key; nothing deleted';
  END IF;
  DELETE FROM app_secrets WHERE name = 'pii_key';
END;
$$;

-- Check: still decrypts with only the Vault copy
-- SELECT fn_pii_decrypt(mobile_enc) IS NOT NULL FROM customers WHERE mobile_enc IS NOT NULL LIMIT 1;   -- true
