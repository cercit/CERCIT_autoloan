-- cercit — PII encryption at rest (PAN, mobile)
--
-- Phase 1 of 2. This script encrypts and backfills but does NOT drop the
-- plaintext columns; 013_pii_drop_plaintext.sql does that once you have
-- verified decryption works. Run them in separate sittings.
--
-- BEFORE RUNNING: set the encryption key (see section 1). If the key is lost,
-- the encrypted values are unrecoverable. Store it in your password manager.
--
-- Design:
--   pan_enc / mobile_enc   pgp_sym_encrypt ciphertext — non-deterministic
--   pan_hash               HMAC-SHA256 blind index — restores UNIQUE + lookup
--   pan_last4 / mobile_last4  plaintext tail for masked display
--
-- Non-deterministic ciphertext cannot back a UNIQUE constraint, which is why
-- uk_customers_pan is replaced by a unique index on the blind index instead.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. Key storage
--
-- No RLS policy is created, so PostgREST roles get nothing. Only SECURITY
-- DEFINER functions owned by the table owner can read it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_secrets (
  name       TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_app_secrets PRIMARY KEY (name)
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_secrets FROM anon, authenticated;

-- >>> EDIT THIS LINE: replace the placeholder with a long random string. <<<
-- Generate one with:  openssl rand -base64 48
INSERT INTO app_secrets (name, value)
VALUES ('pii_key', 'REPLACE_ME_WITH_A_LONG_RANDOM_KEY')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_pii_key()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT value FROM app_secrets WHERE name = 'pii_key';
$$;

REVOKE ALL ON FUNCTION fn_pii_key() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. Crypto helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_pii_encrypt(p_plain TEXT)
RETURNS BYTEA
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_plain IS NULL OR btrim(p_plain) = '' THEN NULL
    ELSE pgp_sym_encrypt(btrim(p_plain), fn_pii_key())
  END;
$$;

CREATE OR REPLACE FUNCTION fn_pii_decrypt(p_cipher BYTEA)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_cipher IS NULL THEN NULL
    ELSE pgp_sym_decrypt(p_cipher, fn_pii_key())
  END;
$$;

-- Deterministic blind index. Case/space normalised so the same PAN always
-- hashes identically.
-- STABLE, not IMMUTABLE: it reads the key out of app_secrets. The unique index
-- is on the stored pan_hash column rather than this expression, so STABLE is fine.
CREATE OR REPLACE FUNCTION fn_pii_hash(p_plain TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_plain IS NULL OR btrim(p_plain) = '' THEN NULL
    ELSE encode(hmac(upper(btrim(p_plain)), fn_pii_key(), 'sha256'), 'hex')
  END;
$$;

REVOKE ALL ON FUNCTION fn_pii_encrypt(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_pii_decrypt(BYTEA) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_pii_hash(TEXT) FROM PUBLIC, anon, authenticated;

-- Mask helper — 'ABCPK1234F' -> 'XXXXXX234F'
CREATE OR REPLACE FUNCTION fn_pii_mask(p_last4 TEXT, p_width INT DEFAULT 10)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_last4 IS NULL OR p_last4 = '' THEN NULL
    ELSE repeat('X', GREATEST(p_width - length(p_last4), 0)) || p_last4
  END;
$$;

-- =============================================================================
-- 3. Columns
-- =============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pan_enc      BYTEA,
  ADD COLUMN IF NOT EXISTS pan_hash     TEXT,
  ADD COLUMN IF NOT EXISTS pan_last4    VARCHAR(4),
  ADD COLUMN IF NOT EXISTS mobile_enc   BYTEA,
  ADD COLUMN IF NOT EXISTS mobile_last4 VARCHAR(4);

-- customers.mobile is NOT NULL in 001, but the trigger below empties it after
-- encrypting. Without this the backfill fails on the first row. The "every
-- customer has a mobile" guarantee moves to mobile_enc in section 6.
ALTER TABLE customers ALTER COLUMN mobile DROP NOT NULL;

-- =============================================================================
-- 4. Write trigger — encrypts on the way in, blanks the plaintext column
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_customers_encrypt_pii()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pan_number IS NOT NULL AND btrim(NEW.pan_number) <> '' THEN
    NEW.pan_enc   := fn_pii_encrypt(NEW.pan_number);
    NEW.pan_hash  := fn_pii_hash(NEW.pan_number);
    NEW.pan_last4 := right(btrim(NEW.pan_number), 4);
  END IF;

  IF NEW.mobile IS NOT NULL AND btrim(NEW.mobile) <> '' THEN
    NEW.mobile_enc   := fn_pii_encrypt(NEW.mobile);
    NEW.mobile_last4 := right(btrim(NEW.mobile), 4);
  END IF;

  -- Always emptied, including for '' — 013 adds a CHECK that depends on this.
  NEW.pan_number := NULL;
  NEW.mobile := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_encrypt_pii ON customers;
CREATE TRIGGER trg_customers_encrypt_pii
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trg_customers_encrypt_pii();

-- =============================================================================
-- 5. Backfill existing rows
-- =============================================================================

UPDATE customers
SET
  pan_enc      = COALESCE(pan_enc, fn_pii_encrypt(pan_number)),
  pan_hash     = COALESCE(pan_hash, fn_pii_hash(pan_number)),
  pan_last4    = COALESCE(pan_last4, right(btrim(pan_number), 4)),
  mobile_enc   = COALESCE(mobile_enc, fn_pii_encrypt(mobile)),
  mobile_last4 = COALESCE(mobile_last4, right(btrim(mobile), 4))
WHERE pan_number IS NOT NULL OR mobile IS NOT NULL;

-- The trigger blanks pan_number / mobile as part of that UPDATE, so after this
-- statement both plaintext columns are NULL for every row.

-- =============================================================================
-- 6. Swap the PAN uniqueness onto the blind index
-- =============================================================================

ALTER TABLE customers DROP CONSTRAINT IF EXISTS uk_customers_pan;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS ck_customers_mobile_present;
ALTER TABLE customers
  ADD CONSTRAINT ck_customers_mobile_present CHECK (mobile_enc IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uk_customers_pan_hash
  ON customers (pan_hash)
  WHERE pan_hash IS NOT NULL;

-- =============================================================================
-- 7. Reveal RPC — full PAN / mobile for an officer who needs it, audited
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_pii(p_customer_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TABLE (pan_number TEXT, mobile TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = actor
      AND is_active
      AND role IN ('admin', 'credit_officer', 'reviewer')
  ) THEN
    RAISE EXCEPTION 'not permitted to reveal customer PII';
  END IF;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (
    'PII_REVEAL', 'OFFICER', actor,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'reason', COALESCE(p_reason, 'not stated')
    )
  );

  RETURN QUERY
  SELECT fn_pii_decrypt(c.pan_enc), fn_pii_decrypt(c.mobile_enc)
  FROM customers c
  WHERE c.id = p_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_customer_pii(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_pii(UUID, TEXT) TO authenticated;

-- =============================================================================
-- 8. fn_list_applications — serve masked PAN / mobile
--
-- Section 5 blanked the plaintext columns, so the original body would return
-- NULL for both. Signature is unchanged; only the two projected columns move
-- to the masked form. Officers who need the full value call fn_customer_pii.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_list_applications()
RETURNS TABLE (
  application_uuid UUID,
  application_id VARCHAR,
  full_name VARCHAR,
  email VARCHAR,
  mobile VARCHAR,
  employer_name VARCHAR,
  age_at_application SMALLINT,
  pan_number VARCHAR,
  city VARCHAR,
  state_code VARCHAR,
  status VARCHAR,
  current_step SMALLINT,
  loan_amount_requested DECIMAL,
  tenure_months SMALLINT,
  declared_net_salary DECIMAL,
  vehicle_make VARCHAR,
  vehicle_model VARCHAR,
  vehicle_variant VARCHAR,
  ex_showroom_price DECIMAL,
  on_road_price DECIMAL,
  dealer_name VARCHAR,
  cibil_score SMALLINT,
  decision VARCHAR,
  rate DECIMAL,
  foir_pct DECIMAL,
  ltv_pct DECIMAL,
  officer_name VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS application_uuid,
    a.application_id,
    c.full_name,
    c.email,
    fn_pii_mask(c.mobile_last4, 10)::VARCHAR AS mobile,
    c.employer_name,
    c.age_at_application,
    fn_pii_mask(c.pan_last4, 10)::VARCHAR AS pan_number,
    c.city,
    c.state_code,
    a.status,
    a.current_step,
    a.loan_amount_requested,
    a.tenure_months,
    a.declared_net_salary,
    v.make AS vehicle_make,
    v.model AS vehicle_model,
    v.variant AS vehicle_variant,
    v.ex_showroom_price,
    v.on_road_price,
    d.dealer_name,
    br.score AS cibil_score,
    cd.decision,
    cd.sanctioned_rate AS rate,
    r.foir_calculated AS foir_pct,
    r.ltv_calculated AS ltv_pct,
    u.full_name AS officer_name,
    a.created_at
  FROM applications a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN vehicles v ON v.application_id = a.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN bureau_reports br ON br.application_id = a.id
  LEFT JOIN credit_decisions cd ON cd.application_id = a.id
  LEFT JOIN recommendations r ON r.application_id = a.id
  LEFT JOIN users u ON u.id = a.assigned_officer_id
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 9. Verify — both should return the values you started with
-- =============================================================================

-- SELECT pan_last4, mobile_last4, fn_pii_decrypt(pan_enc) AS pan,
--        fn_pii_decrypt(mobile_enc) AS mobile
-- FROM customers LIMIT 5;
