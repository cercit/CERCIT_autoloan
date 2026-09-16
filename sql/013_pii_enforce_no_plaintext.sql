-- cercit — PII encryption phase 2: lock the plaintext columns shut
--
-- Run ONLY after 012_pii_encryption.sql, and only once you have confirmed
-- decryption returns the original values:
--
--   SELECT pan_last4, fn_pii_decrypt(pan_enc) AS pan,
--          mobile_last4, fn_pii_decrypt(mobile_enc) AS mobile
--   FROM customers LIMIT 10;
--
-- If that returns NULL or errors for rows that had values, STOP — the key in
-- app_secrets does not match what the data was encrypted with.
--
-- Why constrain rather than DROP: fn_create_application and
-- fn_submit_full_application both assign customers.mobile / customers.pan_number
-- directly, and the BEFORE trigger from 012 encrypts those assignments on the
-- way in. Dropping the columns would break both writers. A CHECK gives the same
-- guarantee — no plaintext can ever rest in the table — without a rewrite,
-- because the BEFORE trigger nulls the value before constraints are evaluated.

-- =============================================================================
-- 1. Refuse to proceed if anything is still unencrypted
-- =============================================================================

DO $$
DECLARE
  leftover INT;
BEGIN
  SELECT count(*) INTO leftover
  FROM customers
  WHERE (pan_number IS NOT NULL AND btrim(pan_number) <> '')
     OR (mobile IS NOT NULL AND btrim(mobile) <> '');

  IF leftover > 0 THEN
    RAISE EXCEPTION
      '% customer row(s) still hold plaintext PAN/mobile — re-run 012 first', leftover;
  END IF;

  SELECT count(*) INTO leftover
  FROM customers
  WHERE (pan_last4 IS NOT NULL AND pan_enc IS NULL)
     OR (mobile_last4 IS NOT NULL AND mobile_enc IS NULL);

  IF leftover > 0 THEN
    RAISE EXCEPTION
      '% customer row(s) have a masked tail but no ciphertext — backfill incomplete', leftover;
  END IF;
END;
$$;

-- =============================================================================
-- 2. Assert plaintext can never rest in the table again
-- =============================================================================

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS ck_customers_pan_not_plaintext;
ALTER TABLE customers
  ADD CONSTRAINT ck_customers_pan_not_plaintext
  CHECK (pan_number IS NULL);

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS ck_customers_mobile_not_plaintext;
ALTER TABLE customers
  ADD CONSTRAINT ck_customers_mobile_not_plaintext
  CHECK (mobile IS NULL);

COMMENT ON COLUMN customers.pan_number IS
  'Write-only inbox. The BEFORE trigger encrypts into pan_enc and nulls this; a CHECK keeps it empty. Read pan_last4 or call fn_customer_pii.';
COMMENT ON COLUMN customers.mobile IS
  'Write-only inbox. The BEFORE trigger encrypts into mobile_enc and nulls this; a CHECK keeps it empty. Read mobile_last4 or call fn_customer_pii.';

-- =============================================================================
-- 3. Verify the guard holds
-- =============================================================================

-- This must fail with "violates check constraint":
--   UPDATE customers SET pan_number = 'ABCPK1234F' WHERE false;
--
-- And a normal write must still succeed, landing encrypted:
--   SELECT fn_submit_full_application(...);
