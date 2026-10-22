-- =============================================================================
-- 091: the PAN / mobile encryption key moves into Supabase Vault (R2, 22 Oct 2026)
-- =============================================================================
-- Before: the key sat in the app_secrets table (012), in the same database as
-- the data it protects. Locked from the app, but a database dump or anyone who
-- could read that table had both the data and the key.
--
-- Now: the key lives in Supabase Vault, which stores it encrypted with a root
-- key Supabase keeps outside the database. A dump or a table read no longer
-- carries a usable key. fn_pii_key() reads Vault first and falls back to
-- app_secrets only if Vault has no key (local tests, or before this runs).
--
-- What it doesn't do: a database superuser can still ask Vault for the key.
-- Full separation (a key service outside Supabase) is a production step.
--
-- Two steps, on purpose:
--   Step 1 (this file): copy the key into Vault, check it is identical, switch
--     fn_pii_key() to Vault. app_secrets keeps its copy for now.
--   Step 2 (091b, later, by hand): after Sameer has saved the key in his
--     password manager, delete the app_secrets copy. Without a saved copy, a
--     restore into another project could never decrypt the data.
--
-- The key itself is never changed, so every stored PAN and mobile still decrypts.
-- Run order: after 090. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_key TEXT;
  v_vault TEXT;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE '091: no Vault here; the key stays in app_secrets';
    RETURN;
  END IF;
  SELECT value INTO v_key FROM app_secrets WHERE name = 'pii_key';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_vault USING 'pii_key';
  IF v_vault IS NULL THEN
    IF v_key IS NULL THEN
      RAISE EXCEPTION '091: no key in app_secrets or Vault';
    END IF;
    EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
      USING v_key, 'pii_key', 'cercit PAN / mobile encryption key (moved from app_secrets by 091)';
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_vault USING 'pii_key';
  END IF;
  IF v_key IS NOT NULL AND v_vault IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION '091: the Vault key differs from app_secrets; nothing switched';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_pii_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  k TEXT;
BEGIN
  -- 091: Vault first; app_secrets only if Vault has no key.
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO k USING 'pii_key';
  END IF;
  IF k IS NULL THEN
    SELECT value INTO k FROM app_secrets WHERE name = 'pii_key';
  END IF;
  RETURN k;
END;
$$;
REVOKE ALL ON FUNCTION fn_pii_key() FROM PUBLIC, anon, authenticated;

-- Check after running (both should be true; neither shows the key):
-- SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_key') AS in_vault,
--        (SELECT fn_pii_decrypt(mobile_enc) IS NOT NULL FROM customers WHERE mobile_enc IS NOT NULL LIMIT 1) AS still_decrypts;
