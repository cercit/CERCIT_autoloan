-- =============================================================================
-- 052: Automatic document checks
-- =============================================================================
-- Every document a customer sends is checked by rules, not by a person:
-- is the file whole, could it be read, does it match the customer (PAN,
-- name, date of birth, face, address, employer, salary), is it recent.
-- A document that passes every check that blocks is accepted on its own.
-- When every document needed is accepted, the case moves to the credit
-- check by itself, the credit check runs, and a clean case with an APPROVE
-- recommendation is marked "fast lane". A person still approves (Phase 1).
--
-- What is checked is data, not code: document_check_rules says, for each
-- document and check, whether it runs, whether it blocks, its threshold, and
-- what happens on a fail (a person looks, or the customer is asked again).
-- document_auto_settings switches the whole thing, and each automatic step,
-- on or off. Staff with policy.author change both; every change is audited.
--
-- It also fixes reconcile item R20: the document readers now save what they
-- read into the database (document_readings), not only to S3.
--
-- Run order: after 051. Safe to re-run.

-- =============================================================================
-- 1. Settings and rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_auto_settings (
  id                  BOOLEAN       NOT NULL DEFAULT true,
  enabled             BOOLEAN       NOT NULL DEFAULT true,   -- run the checks at all
  auto_accept         BOOLEAN       NOT NULL DEFAULT true,   -- accept documents that pass
  auto_verify         BOOLEAN       NOT NULL DEFAULT true,   -- move the case on when every needed document is accepted
  auto_credit_checks  BOOLEAN       NOT NULL DEFAULT true,   -- then run the credit checks
  reader_wait_minutes SMALLINT      NOT NULL DEFAULT 30,     -- after this, a document never read counts as unreadable
  updated_by          UUID,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_document_auto_settings PRIMARY KEY (id),
  CONSTRAINT ck_document_auto_settings_one CHECK (id),
  CONSTRAINT ck_document_auto_settings_wait CHECK (reader_wait_minutes BETWEEN 1 AND 1440)
);
INSERT INTO document_auto_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Which document types are accepted automatically when their checks pass.
CREATE TABLE IF NOT EXISTS document_auto_policy (
  doc_type     VARCHAR(20)   NOT NULL,
  auto_accept  BOOLEAN       NOT NULL,
  note         TEXT,
  updated_by   UUID,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_document_auto_policy PRIMARY KEY (doc_type),
  CONSTRAINT fk_document_auto_policy_type FOREIGN KEY (doc_type) REFERENCES document_types(code)
);

CREATE TABLE IF NOT EXISTS document_check_rules (
  doc_type          VARCHAR(20)   NOT NULL,
  check_code        VARCHAR(24)   NOT NULL,
  label             TEXT          NOT NULL,
  enabled           BOOLEAN       NOT NULL DEFAULT true,
  blocking          BOOLEAN       NOT NULL DEFAULT true,   -- must pass for the document to be accepted automatically
  threshold         NUMERIC,                              -- meaning depends on the check (see threshold_hint)
  threshold_hint    TEXT,
  on_fail           VARCHAR(12)   NOT NULL DEFAULT 'REVIEW',   -- REVIEW: a person looks / ASK_CUSTOMER: asked to upload again
  customer_message  TEXT,                                 -- what the customer is told on ASK_CUSTOMER
  sort_order        SMALLINT      NOT NULL DEFAULT 100,
  updated_by        UUID,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_document_check_rules PRIMARY KEY (doc_type, check_code),
  CONSTRAINT fk_document_check_rules_type FOREIGN KEY (doc_type) REFERENCES document_types(code),
  CONSTRAINT ck_document_check_rules_on_fail CHECK (on_fail IN ('REVIEW', 'ASK_CUSTOMER'))
);

INSERT INTO document_auto_policy (doc_type, auto_accept, note) VALUES
  ('PAN',         true,  NULL),
  ('AADHAAR',     true,  NULL),
  ('LIVE_PHOTO',  true,  NULL),
  ('SALARY_SLIP', true,  NULL),
  ('FORM16_B',    true,  NULL),
  ('BANK_STMT',   true,  NULL),
  ('ITR',         false, 'No reader yet'),
  ('QUOTE',       false, 'Checked against the car details by a person'),
  ('EB_BILL',     false, 'No reader yet'),
  ('COMPANY_ID',  false, 'No reader yet'),
  ('MARGIN_RECEIPT',  false, 'Dealer paper, checked by a person'),
  ('VEHICLE_INVOICE', false, 'Dealer paper, checked by a person'),
  ('INSURANCE',       false, 'Dealer paper, checked by a person'),
  ('RC',              false, 'Checked by a person')
ON CONFLICT (doc_type) DO NOTHING;

-- Defaults. Re-running keeps whatever staff changed (DO NOTHING).
INSERT INTO document_check_rules (doc_type, check_code, label, blocking, threshold, threshold_hint, on_fail, customer_message, sort_order) VALUES
  ('PAN', 'FILE_OK',     'File is complete and opened',              true,  NULL, NULL, 'ASK_CUSTOMER', 'We could not open your PAN. Upload it again.', 10),
  ('PAN', 'READ_OK',     'PAN number could be read',                 true,  0.80, 'lowest reader confidence (0-1)', 'REVIEW', 'We could not read your PAN clearly. Upload a sharper copy or the DigiLocker PDF.', 20),
  ('PAN', 'PAN_MATCH',   'PAN matches the one the customer gave',    true,  NULL, NULL, 'REVIEW', NULL, 30),
  ('PAN', 'NAME_MATCH',  'Name matches the customer',                true,  0.80, 'share of name words that match (0-1)', 'REVIEW', NULL, 40),
  ('PAN', 'DOB_MATCH',   'Date of birth matches',                    true,  NULL, NULL, 'REVIEW', NULL, 50),
  ('PAN', 'FACE_MATCH',  'Photo matches the live photo',             true,  90,   'lowest similarity (0-100)', 'REVIEW', NULL, 60),

  ('AADHAAR', 'FILE_OK',     'File is complete and opened',          true,  NULL, NULL, 'ASK_CUSTOMER', 'We could not open your Aadhaar. Upload it again.', 10),
  ('AADHAAR', 'MASKED',      'Aadhaar number is masked',             true,  NULL, NULL, 'REVIEW', NULL, 20),
  ('AADHAAR', 'READ_OK',     'Address could be read',                true,  0.80, 'lowest reader confidence (0-1)', 'REVIEW', NULL, 30),
  ('AADHAAR', 'NAME_MATCH',  'Name matches the customer',            false, 0.80, 'share of name words that match (0-1)', 'REVIEW', NULL, 40),
  ('AADHAAR', 'PIN_MATCH',   'PIN code matches the permanent address', true, NULL, NULL, 'REVIEW', NULL, 50),
  ('AADHAAR', 'DOB_MATCH',   'Date of birth matches',                false, NULL, NULL, 'REVIEW', NULL, 60),
  ('AADHAAR', 'FACE_MATCH',  'Photo matches the live photo',         false, 90,   'lowest similarity (0-100)', 'REVIEW', NULL, 70),

  ('LIVE_PHOTO', 'FILE_OK',    'Photo received',                     true,  NULL, NULL, 'ASK_CUSTOMER', 'Take your photo again.', 10),
  ('LIVE_PHOTO', 'FACE_MATCH', 'Face matches PAN or Aadhaar',        true,  90,   'lowest similarity (0-100)', 'REVIEW', NULL, 20),

  ('SALARY_SLIP', 'FILE_OK',        'Files are complete and opened', true,  NULL, NULL, 'ASK_CUSTOMER', 'We could not open one of your salary slips. Upload it again.', 10),
  ('SALARY_SLIP', 'COUNT',          'Enough months of slips',        true,  3,    'number of slips', 'ASK_CUSTOMER', 'Upload your salary slips for the last 3 months.', 20),
  ('SALARY_SLIP', 'READ_OK',        'Take-home pay could be read',   true,  0.80, 'lowest reader confidence (0-1)', 'REVIEW', NULL, 30),
  ('SALARY_SLIP', 'RECENT',         'Latest slip is recent',         true,  60,   'days since the latest pay month', 'ASK_CUSTOMER', 'Upload your latest salary slip.', 40),
  ('SALARY_SLIP', 'EMPLOYER_MATCH', 'Employer matches what the customer gave', true, 0.60, 'share of name words that match (0-1)', 'REVIEW', NULL, 50),
  ('SALARY_SLIP', 'SALARY_MATCH',   'Take-home pay close to what the customer gave', true, 10, 'largest gap, in %', 'REVIEW', NULL, 60),

  ('FORM16_B', 'FILE_OK',        'File is complete and opened',      true,  NULL, NULL, 'ASK_CUSTOMER', 'We could not open your Form 16. Upload it again.', 10),
  ('FORM16_B', 'READ_OK',        'Employer could be read',           true,  0.80, 'lowest reader confidence (0-1)', 'REVIEW', NULL, 20),
  ('FORM16_B', 'PAN_MATCH',      'PAN on it is the customer''s',     true,  NULL, NULL, 'REVIEW', NULL, 30),
  ('FORM16_B', 'EMPLOYER_MATCH', 'Employer matches what the customer gave', true, 0.60, 'share of name words that match (0-1)', 'REVIEW', NULL, 40),
  ('FORM16_B', 'RECENT',         'For the last or current year',     true,  1,    'assessment years back allowed', 'ASK_CUSTOMER', 'Upload your latest Form 16.', 50),

  ('BANK_STMT', 'FILE_OK',        'Files are complete and opened',   true,  NULL, NULL, 'ASK_CUSTOMER', 'We could not open your bank statement. Upload it again.', 10),
  ('BANK_STMT', 'READ_OK',        'Statement could be read',         true,  NULL, NULL, 'REVIEW', NULL, 20),
  ('BANK_STMT', 'MONTHS',         'Covers enough months',            true,  3,    'months', 'ASK_CUSTOMER', 'Upload a statement that covers at least the last 3 months.', 30),
  ('BANK_STMT', 'SALARY_CREDITS', 'Salary credited every month',     true,  3,    'salary credits', 'REVIEW', NULL, 40),
  ('BANK_STMT', 'BOUNCES',        'No bounced payments',             true,  0,    'bounces allowed', 'REVIEW', NULL, 50),
  ('BANK_STMT', 'SALARY_MATCH',   'Salary credit close to what the customer gave', true, 15, 'largest gap, in %', 'REVIEW', NULL, 60),

  ('ITR',        'FILE_OK', 'File is complete and opened', true, NULL, NULL, 'ASK_CUSTOMER', 'We could not open your ITR. Upload it again.', 10),
  ('QUOTE',      'FILE_OK', 'File is complete and opened', true, NULL, NULL, 'ASK_CUSTOMER', 'We could not open the quotation. Upload it again.', 10),
  ('EB_BILL',    'FILE_OK', 'File is complete and opened', true, NULL, NULL, 'ASK_CUSTOMER', 'We could not open the electricity bill. Upload it again.', 10),
  ('COMPANY_ID', 'FILE_OK', 'File is complete and opened', true, NULL, NULL, 'ASK_CUSTOMER', 'We could not open your company ID. Upload it again.', 10)
ON CONFLICT (doc_type, check_code) DO NOTHING;

-- =============================================================================
-- 2. What the readers found, and what the checks said
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_readings (
  application_id  UUID          NOT NULL,
  reader_type     VARCHAR(20)   NOT NULL,    -- pan_card / aadhaar_card / salary_slip / form16 / bank_statement
  fields          JSONB         NOT NULL,    -- field -> {value, confidence}
  read_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_document_readings PRIMARY KEY (application_id, reader_type),
  CONSTRAINT fk_document_readings_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE TABLE IF NOT EXISTS document_check_results (
  application_id  UUID          NOT NULL,
  doc_type        VARCHAR(20)   NOT NULL,
  check_code      VARCHAR(24)   NOT NULL,
  result          VARCHAR(8)    NOT NULL,    -- PASS / FAIL / UNREAD (the reader could not tell) / WAITING
  detail          TEXT,
  checked_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_document_check_results PRIMARY KEY (application_id, doc_type, check_code),
  CONSTRAINT fk_document_check_results_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT ck_document_check_results_result CHECK (result IN ('PASS', 'FAIL', 'UNREAD', 'WAITING'))
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS auto_review JSONB;

ALTER TABLE document_auto_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_auto_policy   ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_check_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_readings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_check_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON document_auto_settings, document_auto_policy, document_check_rules, document_readings, document_check_results FROM anon, authenticated;
-- Everything is read through the functions below; no direct table access.

-- =============================================================================
-- 3. Small helpers for comparing what was read with what the customer gave
-- =============================================================================

-- Words of a name, lower case, no punctuation or titles.
CREATE OR REPLACE FUNCTION fn_doc_words(p TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(w), '{}') FROM unnest(regexp_split_to_array(
           lower(regexp_replace(coalesce(p, ''), '[^A-Za-z ]', ' ', 'g')), '\s+')) AS w
  WHERE w <> '' AND w NOT IN ('mr', 'mrs', 'ms', 'dr', 'shri', 'smt', 'kumari', 'late');
$$;

-- Share of the shorter name's words found in the longer one. A single letter
-- matches a word it starts with ("Sameer M" and "SAMEER MITTIMANI" = 1.0), but
-- at least one whole word must match.
CREATE OR REPLACE FUNCTION fn_doc_name_score(p_a TEXT, p_b TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a TEXT[] := fn_doc_words(p_a);
  b TEXT[] := fn_doc_words(p_b);
  s TEXT[];
  l TEXT[];
  w TEXT;
  hit INT := 0;
  whole INT := 0;
BEGIN
  IF cardinality(a) = 0 OR cardinality(b) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(a) <= cardinality(b) THEN s := a; l := b; ELSE s := b; l := a; END IF;
  FOREACH w IN ARRAY s LOOP
    IF w = ANY (l) THEN
      hit := hit + 1;
      IF length(w) > 1 THEN whole := whole + 1; END IF;
    ELSIF EXISTS (SELECT 1 FROM unnest(l) x WHERE (length(w) = 1 AND left(x, 1) = w) OR (length(x) = 1 AND left(w, 1) = x)) THEN
      hit := hit + 1;
    END IF;
  END LOOP;
  RETURN CASE WHEN whole = 0 THEN 0 ELSE round(hit::NUMERIC / cardinality(s), 2) END;
END;
$$;

-- Employer names: the same, after dropping the words every company name has.
CREATE OR REPLACE FUNCTION fn_doc_org_score(p_a TEXT, p_b TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT fn_doc_name_score(
    array_to_string(ARRAY(SELECT w FROM unnest(fn_doc_words(p_a)) w
                          WHERE w NOT IN ('pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'the', 'co', 'company', 'corp', 'corporation', 'india', 'and')), ' '),
    array_to_string(ARRAY(SELECT w FROM unnest(fn_doc_words(p_b)) w
                          WHERE w NOT IN ('pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'the', 'co', 'company', 'corp', 'corporation', 'india', 'and')), ' '));
$$;

-- 02/06/1991, 02-06-1991, 02.06.1991 or 1991-06-02 -> date; anything else -> null.
CREATE OR REPLACE FUNCTION fn_doc_date(p TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m TEXT[];
BEGIN
  m := regexp_match(coalesce(p, ''), '(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})');
  IF m IS NOT NULL THEN
    RETURN make_date(m[3]::INT, m[2]::INT, m[1]::INT);
  END IF;
  m := regexp_match(coalesce(p, ''), '(\d{4})-(\d{2})-(\d{2})');
  IF m IS NOT NULL THEN
    RETURN make_date(m[1]::INT, m[2]::INT, m[3]::INT);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- "September 2026", "Sep-26", "09/2026", "2026-09" -> the first of that month.
CREATE OR REPLACE FUNCTION fn_doc_month(p TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT := lower(coalesce(p, ''));
  m TEXT[];
  mon INT;
  yr INT;
BEGIN
  -- Postgres regex: \y is a word boundary (\b would mean backspace).
  m := regexp_match(s, '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,./-]*(\d{4}|\d{2})\y');
  IF m IS NOT NULL THEN
    mon := array_position(ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], m[1]);
    yr := m[2]::INT;
    IF yr < 100 THEN yr := 2000 + yr; END IF;
    RETURN make_date(yr, mon, 1);
  END IF;
  m := regexp_match(s, '\y(\d{1,2})[/.-](\d{4})\y');
  IF m IS NOT NULL THEN
    RETURN make_date(m[2]::INT, m[1]::INT, 1);
  END IF;
  m := regexp_match(s, '\y(\d{4})-(\d{1,2})\y');
  IF m IS NOT NULL THEN
    RETURN make_date(m[1]::INT, m[2]::INT, 1);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- "85,400.00", "Rs 85400" -> 85400; not a number -> null.
CREATE OR REPLACE FUNCTION fn_doc_num(p TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN nullif(regexp_replace(coalesce(p, ''), '[^0-9.]', '', 'g'), '')::NUMERIC;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- The reader's value for a field, and its confidence (1 when the reader gave none).
CREATE OR REPLACE FUNCTION fn_doc_read(p_app UUID, p_reader TEXT, p_field TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(btrim(fields->p_field->>'value'), '') FROM document_readings
  WHERE application_id = p_app AND reader_type = p_reader;
$$;

CREATE OR REPLACE FUNCTION fn_doc_conf(p_app UUID, p_reader TEXT, p_field TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((fields->p_field->>'confidence')::NUMERIC, 1) FROM document_readings
  WHERE application_id = p_app AND reader_type = p_reader AND fields ? p_field;
$$;

-- What the readers found, in the shape the credit checks take (048's p_read).
CREATE OR REPLACE FUNCTION fn_reading_summary(p_app UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'slip_net_salary', fn_doc_num(fn_doc_read(p_app, 'salary_slip', 'net_salary')),
    'form16_annual', fn_doc_num(fn_doc_read(p_app, 'form16', 'gross_total_income')),
    'bank', CASE WHEN fn_doc_read(p_app, 'bank_statement', 'months_analyzed') IS NULL THEN NULL ELSE jsonb_build_object(
      'months', fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'months_analyzed')),
      'avg_monthly_balance', fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'avg_monthly_balance')),
      'avg_salary', fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'avg_salary')),
      'salary_count', coalesce(fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'salary_count')), 0),
      'emi_total', coalesce(fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'emi_total')), 0),
      'bounce_count', coalesce(fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'bounce_count')), 0)) END));
$$;

-- =============================================================================
-- 4. One check
-- =============================================================================
-- Returns PASS, FAIL (a real finding), UNREAD (the reader could not tell; a person
-- looks, the customer is never asked again for it) or WAITING (not read yet).
-- Reasons never contain the customer's values, only what disagreed.

CREATE OR REPLACE FUNCTION fn_doc_check(p_app UUID, p_doc TEXT, p_check TEXT, p_threshold NUMERIC, p_wait_minutes INT)
RETURNS TABLE (result TEXT, detail TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a         applications%ROWTYPE;
  v_c         customers%ROWTYPE;
  v_reader    TEXT;
  v_files     INT;
  v_bad       INT;
  v_last_up   TIMESTAMPTZ;
  v_read_at   TIMESTAMPTZ;
  v_val       TEXT;
  v_num       NUMERIC;
  v_ref       NUMERIC;
  v_date      DATE;
  v_score     NUMERIC;
  v_face      RECORD;
  v_employer  TEXT;
  v_pin       TEXT;
BEGIN
  SELECT * INTO v_a FROM applications WHERE id = p_app;
  SELECT * INTO v_c FROM customers WHERE id = v_a.customer_id;
  SELECT upload_type INTO v_reader FROM document_types WHERE code = p_doc;
  -- Files that could not be opened do not count (the customer was told at upload).
  SELECT count(*) FILTER (WHERE NOT (was_password_protected AND NOT unlocked)),
         count(*) FILTER (WHERE was_password_protected AND NOT unlocked), max(uploaded_at)
  INTO v_files, v_bad, v_last_up
  FROM documents WHERE application_id = p_app AND doc_type = p_doc AND superseded_at IS NULL;
  SELECT read_at INTO v_read_at FROM document_readings WHERE application_id = p_app AND reader_type = v_reader;

  -- Checks that need the reader: wait for it, then call a missing reading a fail.
  IF p_check NOT IN ('FILE_OK', 'COUNT', 'MASKED', 'FACE_MATCH') AND (v_read_at IS NULL OR v_read_at < v_last_up) THEN
    IF v_last_up > now() - make_interval(mins => p_wait_minutes) THEN
      RETURN QUERY SELECT 'WAITING', 'Still being read'; RETURN;
    END IF;
    RETURN QUERY SELECT 'UNREAD', 'The document could not be read'; RETURN;
  END IF;

  CASE p_check
  WHEN 'FILE_OK' THEN
    IF v_files = 0 THEN
      RETURN QUERY SELECT 'FAIL', CASE WHEN v_bad > 0 THEN 'A password-protected file could not be opened' ELSE 'No file' END; RETURN;
    END IF;
    RETURN QUERY SELECT 'PASS', CASE WHEN v_bad > 0 THEN format('%s file(s) could not be opened and were left out', v_bad) END; RETURN;

  WHEN 'COUNT' THEN
    RETURN QUERY SELECT CASE WHEN v_files >= coalesce(p_threshold, 1) THEN 'PASS' ELSE 'FAIL' END,
                        format('%s of %s', v_files, coalesce(p_threshold, 1)::INT); RETURN;

  WHEN 'MASKED' THEN
    RETURN QUERY SELECT CASE WHEN EXISTS (SELECT 1 FROM documents WHERE application_id = p_app AND doc_type = p_doc AND superseded_at IS NULL AND NOT aadhaar_masked)
                             THEN 'FAIL' ELSE 'PASS' END,
                        CASE WHEN EXISTS (SELECT 1 FROM documents WHERE application_id = p_app AND doc_type = p_doc AND superseded_at IS NULL AND NOT aadhaar_masked)
                             THEN 'Stored with the full Aadhaar number' END; RETURN;

  WHEN 'READ_OK' THEN
    v_val := CASE v_reader WHEN 'pan_card' THEN 'pan_number' WHEN 'aadhaar_card' THEN 'address' WHEN 'salary_slip' THEN 'net_salary'
                           WHEN 'form16' THEN 'employer_name' WHEN 'bank_statement' THEN 'months_analyzed' END;
    IF fn_doc_read(p_app, v_reader, v_val) IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', 'The main detail was not found on it'; RETURN;
    END IF;
    v_num := fn_doc_conf(p_app, v_reader, v_val);
    RETURN QUERY SELECT CASE WHEN p_threshold IS NULL OR v_num >= p_threshold THEN 'PASS' ELSE 'FAIL' END,
                        CASE WHEN p_threshold IS NOT NULL AND v_num < p_threshold THEN format('Read with low confidence (%s)', round(v_num, 2)) END; RETURN;

  WHEN 'PAN_MATCH' THEN
    v_val := upper(regexp_replace(coalesce(fn_doc_read(p_app, v_reader, CASE v_reader WHEN 'form16' THEN 'pan' ELSE 'pan_number' END), ''), '\s', '', 'g'));
    IF v_val !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
      RETURN QUERY SELECT 'UNREAD', 'No PAN found on it'; RETURN;
    END IF;
    RETURN QUERY SELECT CASE WHEN fn_pii_hash(v_val) = v_c.pan_hash THEN 'PASS' ELSE 'FAIL' END,
                        CASE WHEN fn_pii_hash(v_val) = v_c.pan_hash THEN NULL ELSE 'A different PAN' END; RETURN;

  WHEN 'NAME_MATCH' THEN
    v_val := fn_doc_read(p_app, v_reader, 'name');
    IF v_val IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', 'No name found on it'; RETURN;
    END IF;
    v_score := fn_doc_name_score(v_val, v_c.full_name);
    RETURN QUERY SELECT CASE WHEN v_score >= coalesce(p_threshold, 0.8) THEN 'PASS' ELSE 'FAIL' END,
                        format('Name match %s%%', round(v_score * 100)); RETURN;

  WHEN 'DOB_MATCH' THEN
    v_date := fn_doc_date(fn_doc_read(p_app, v_reader, 'dob'));
    IF v_date IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', 'No date of birth found on it'; RETURN;
    ELSIF v_c.date_of_birth IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', 'The customer has not given a date of birth'; RETURN;
    END IF;
    RETURN QUERY SELECT CASE WHEN v_date = v_c.date_of_birth THEN 'PASS' ELSE 'FAIL' END,
                        CASE WHEN v_date = v_c.date_of_birth THEN NULL ELSE 'A different date of birth' END; RETURN;

  WHEN 'PIN_MATCH' THEN
    SELECT m[1] || m[2] INTO v_val
    FROM regexp_match(coalesce(fn_doc_read(p_app, v_reader, 'address'), ''), '\m([1-9][0-9]{2})\s?([0-9]{3})\M') AS m;
    SELECT a.pincode INTO v_pin FROM customer_addresses a WHERE a.customer_id = v_c.id AND a.address_type = 'PERMANENT';
    v_pin := coalesce(v_pin, v_c.pincode);
    IF v_val IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', 'No PIN code found in the address'; RETURN;
    END IF;
    RETURN QUERY SELECT CASE WHEN v_val = v_pin THEN 'PASS' ELSE 'FAIL' END,
                        CASE WHEN v_val = v_pin THEN NULL ELSE 'A different PIN code from the permanent address given' END; RETURN;

  WHEN 'FACE_MATCH' THEN
    SELECT f.result, f.similarity INTO v_face FROM kyc_face_matches f
    WHERE f.application_id = p_app AND (p_doc = 'LIVE_PHOTO' OR f.doc_type = p_doc)
    ORDER BY f.checked_at DESC LIMIT 1;
    IF v_face.result IS NULL THEN
      RETURN QUERY SELECT CASE WHEN v_last_up > now() - make_interval(mins => p_wait_minutes) THEN 'WAITING' ELSE 'UNREAD' END, 'No face check yet'; RETURN;
    END IF;
    RETURN QUERY SELECT CASE WHEN v_face.result = 'MATCH' AND coalesce(v_face.similarity, 0) >= coalesce(p_threshold, 90) THEN 'PASS' ELSE 'FAIL' END,
                        format('%s, %s%% similar', initcap(replace(v_face.result, '_', ' ')), coalesce(round(v_face.similarity)::TEXT, '-')); RETURN;

  WHEN 'RECENT' THEN
    IF v_reader = 'form16' THEN
      v_num := (regexp_match(coalesce(fn_doc_read(p_app, v_reader, 'assessment_year'), ''), '(20\d{2})'))[1]::INT;
      IF v_num IS NULL THEN
        RETURN QUERY SELECT 'UNREAD', 'No assessment year found on it'; RETURN;
      END IF;
      -- AY 2026-27 is the financial year that ended in March 2026.
      v_ref := extract(year FROM current_date - INTERVAL '3 months');
      RETURN QUERY SELECT CASE WHEN v_num >= v_ref - coalesce(p_threshold, 1) THEN 'PASS' ELSE 'FAIL' END,
                          format('Assessment year %s-%s', v_num, right((v_num + 1)::TEXT, 2)); RETURN;
    END IF;
    v_date := fn_doc_month(fn_doc_read(p_app, v_reader, 'pay_period'));
    IF v_date IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', 'No pay month found on it'; RETURN;
    END IF;
    RETURN QUERY SELECT CASE WHEN (v_date + INTERVAL '1 month')::DATE >= current_date - coalesce(p_threshold, 60)::INT THEN 'PASS' ELSE 'FAIL' END,
                        'Latest slip is for ' || to_char(v_date, 'Mon YYYY'); RETURN;

  WHEN 'EMPLOYER_MATCH' THEN
    v_val := fn_doc_read(p_app, v_reader, 'employer_name');
    SELECT g.confirmed->>'employer_name' INTO v_employer FROM application_detail_groups g WHERE g.application_id = p_app AND g.group_code = 'EMPLOYMENT';
    v_employer := coalesce(v_employer, v_c.employer_name);
    IF v_val IS NULL OR v_employer IS NULL THEN
      RETURN QUERY SELECT 'UNREAD', CASE WHEN v_val IS NULL THEN 'No employer found on it' ELSE 'The customer has not given an employer' END; RETURN;
    END IF;
    v_score := fn_doc_org_score(v_val, v_employer);
    RETURN QUERY SELECT CASE WHEN v_score >= coalesce(p_threshold, 0.6) THEN 'PASS' ELSE 'FAIL' END,
                        format('Employer match %s%%', round(v_score * 100)); RETURN;

  WHEN 'SALARY_MATCH' THEN
    v_num := fn_doc_num(fn_doc_read(p_app, v_reader, CASE v_reader WHEN 'bank_statement' THEN 'avg_salary' ELSE 'net_salary' END));
    v_ref := v_a.declared_net_salary;
    IF v_num IS NULL OR v_num = 0 OR v_ref IS NULL OR v_ref = 0 THEN
      RETURN QUERY SELECT 'UNREAD', CASE WHEN v_num IS NULL OR v_num = 0 THEN 'No salary found on it' ELSE 'The customer has not given a salary' END; RETURN;
    END IF;
    v_score := round(abs(v_num - v_ref) / v_ref * 100, 1);
    RETURN QUERY SELECT CASE WHEN v_score <= coalesce(p_threshold, 10) THEN 'PASS' ELSE 'FAIL' END,
                        format('%s%% %s what the customer gave', v_score, CASE WHEN v_num < v_ref THEN 'below' ELSE 'above' END); RETURN;

  WHEN 'MONTHS' THEN
    v_num := fn_doc_num(fn_doc_read(p_app, v_reader, 'months_analyzed'));
    RETURN QUERY SELECT CASE WHEN coalesce(v_num, 0) >= coalesce(p_threshold, 3) THEN 'PASS' ELSE 'FAIL' END,
                        format('%s months', coalesce(v_num, 0)); RETURN;

  WHEN 'SALARY_CREDITS' THEN
    v_num := fn_doc_num(fn_doc_read(p_app, v_reader, 'salary_count'));
    RETURN QUERY SELECT CASE WHEN coalesce(v_num, 0) >= coalesce(p_threshold, 3) THEN 'PASS' ELSE 'FAIL' END,
                        format('%s salary credits', coalesce(v_num, 0)); RETURN;

  WHEN 'BOUNCES' THEN
    v_num := coalesce(fn_doc_num(fn_doc_read(p_app, v_reader, 'bounce_count')), 0);
    RETURN QUERY SELECT CASE WHEN v_num <= coalesce(p_threshold, 0) THEN 'PASS' ELSE 'FAIL' END,
                        format('%s bounced', v_num); RETURN;

  ELSE
    RETURN QUERY SELECT 'FAIL', 'Unknown check'; RETURN;
  END CASE;
END;
$$;

-- =============================================================================
-- 5. The credit checks, callable without a person (048, split in two)
-- =============================================================================
-- fn_customer_checks_core is 048's body without the permission check; the
-- staff function checks the permission and calls it. p_actor NULL = SYSTEM.

CREATE OR REPLACE FUNCTION fn_customer_checks_core(p_app UUID, p_read JSONB, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app       applications%ROWTYPE;
  v_q         vehicle_quotations%ROWTYPE;
  v_staff     UUID;
  v_bureau    JSONB;
  v_bank      JSONB := p_read->'bank';
  v_slip      NUMERIC;
  v_f16       NUMERIC;
  v_bank_sal  NUMERIC;
  v_declared  NUMERIC;
  v_sources   NUMERIC[];
  v_variance  NUMERIC;
  v_result    JSONB;
  v_status    TEXT;
BEGIN
  v_staff := p_actor;   -- NULL when the automatic checks run it
  SELECT * INTO v_app FROM applications WHERE id = p_app AND origin = 'CUSTOMER' FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status NOT IN ('UNDER_ASSESSMENT', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'run the credit checks after the documents are checked' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customer_consents WHERE application_id = v_app.id AND purpose = 'BUREAU_PULL' AND withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'the customer has not given consent for a bureau check' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_q FROM vehicle_quotations WHERE application_id = v_app.id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'the car details are missing on this application' USING ERRCODE = '22023';
  END IF;
  v_status := v_app.status;

  -- The loan and tenure live on the quotation for customer applications.
  UPDATE applications SET loan_amount_requested = v_q.loan_amount_requested, tenure_months = v_q.tenure_months WHERE id = v_app.id;

  -- Vehicle, from the quotation (rebuilt on every run).
  DELETE FROM vehicles WHERE application_id = v_app.id;
  INSERT INTO vehicles (application_id, make, model, variant, fuel_type, vehicle_category, ex_showroom_price,
                        road_tax, insurance, registration_charges, on_road_price)
  VALUES (v_app.id, v_q.make, v_q.model, coalesce(nullif(v_q.variant, ''), 'Not given'), coalesce(v_q.fuel_type, 'PETROL'), 'CAR',
          v_q.ex_showroom, coalesce(v_q.road_tax, 0), coalesce(v_q.insurance, 0),
          greatest(0, coalesce(v_q.on_road, v_q.ex_showroom) - v_q.ex_showroom - coalesce(v_q.road_tax, 0) - coalesce(v_q.insurance, 0)),
          coalesce(v_q.on_road, v_q.ex_showroom));

  -- Bureau: keep a real report if there is one; otherwise the simulated pull, once.
  IF NOT EXISTS (SELECT 1 FROM bureau_reports WHERE application_id = v_app.id) THEN
    v_bureau := fn_simulated_bureau(v_app.customer_id);
    INSERT INTO bureau_reports (application_id, customer_id, bureau_name, score, score_date, active_accounts, total_outstanding,
                                total_monthly_emi, dpd_max_12m, dpd_max_24m, dpd_30_count_24m, dpd_60_plus_flag,
                                enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct,
                                oldest_account_months, report_raw_path, extracted_at)
    VALUES (v_app.id, v_app.customer_id, 'CIBIL-SIMULATED', (v_bureau->>'score')::SMALLINT, current_date,
            (v_bureau->>'active_accounts')::SMALLINT, (v_bureau->>'total_outstanding')::NUMERIC, (v_bureau->>'total_monthly_emi')::NUMERIC,
            (v_bureau->>'dpd_max_12m')::SMALLINT, (v_bureau->>'dpd_max_24m')::SMALLINT, (v_bureau->>'dpd_30_count_24m')::SMALLINT,
            (v_bureau->>'dpd_60_plus_flag')::BOOLEAN, (v_bureau->>'enquiry_count_90d')::SMALLINT, (v_bureau->>'writeoff_count_5y')::SMALLINT,
            (v_bureau->>'settled_count_5y')::SMALLINT, (v_bureau->>'credit_utilization_pct')::NUMERIC,
            (v_bureau->>'oldest_account_months')::SMALLINT, 'simulated', now());
  END IF;

  -- Bank statement analysis: only what the reader found.
  DELETE FROM bank_statement_analyses WHERE application_id = v_app.id;
  IF jsonb_typeof(v_bank) = 'object' AND coalesce((v_bank->>'months')::NUMERIC, 0) > 0 THEN
    v_bank_sal := nullif((v_bank->>'avg_salary')::NUMERIC, 0);
    INSERT INTO bank_statement_analyses (application_id, customer_id, statement_from, statement_to, months_covered,
                                         avg_monthly_balance, avg_salary_credit, salary_regularity, bounce_count_6m)
    VALUES (v_app.id, v_app.customer_id, (current_date - ((v_bank->>'months')::INTEGER || ' months')::INTERVAL)::DATE, current_date,
            (v_bank->>'months')::SMALLINT, (v_bank->>'avg_monthly_balance')::NUMERIC, v_bank_sal,
            CASE WHEN coalesce((v_bank->>'salary_count')::INTEGER, 0) >= (v_bank->>'months')::INTEGER THEN 'REGULAR' ELSE 'IRREGULAR' END,
            coalesce((v_bank->>'bounce_count')::SMALLINT, 0));
  END IF;

  -- Income: declared, slip, bank and Form 16, and how far apart they are.
  v_declared := v_app.declared_net_salary;
  v_slip := nullif((p_read->>'slip_net_salary')::NUMERIC, 0);
  v_f16 := nullif((p_read->>'form16_annual')::NUMERIC, 0);
  v_sources := array_remove(ARRAY[v_slip, v_bank_sal, round(v_f16 / 12, 2)], NULL);
  v_variance := CASE WHEN v_declared IS NULL OR v_declared = 0 OR cardinality(v_sources) = 0 THEN NULL
                     ELSE round((SELECT max(abs(s - v_declared)) FROM unnest(v_sources) s) / v_declared * 100, 2) END;
  DELETE FROM income_assessments WHERE application_id = v_app.id;
  INSERT INTO income_assessments (application_id, declared_net_salary, salary_slip_salary, bank_credit_salary,
                                  form16_annual_income, form16_monthly_equiv, income_variance_pct, income_variance_flag,
                                  eligible_net_salary, total_eligible_income, assessment_date)
  VALUES (v_app.id, v_declared, v_slip, v_bank_sal, v_f16, round(v_f16 / 12, 2), v_variance, coalesce(v_variance > 5, false),
          -- The lower of what they declared and what the documents show.
          (SELECT min(s) FROM unnest(array_append(v_sources, v_declared)) s),
          (SELECT min(s) FROM unnest(array_append(v_sources, v_declared)) s), current_date);

  -- The same assessment as staff applications.
  v_result := fn_assess_application(v_app.id);
  -- The assessment marks the case under assessment; a referred case stays referred.
  UPDATE applications SET status = v_status WHERE id = v_app.id;

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (v_app.id, CASE WHEN v_staff IS NULL THEN 'AUTO_RUN_CHECKS' ELSE 'OFFICER_RUN_CHECKS' END,
          jsonb_build_object('bureau', (SELECT bureau_name FROM bureau_reports WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1),
                             'bank_read', v_bank_sal IS NOT NULL, 'slip_read', v_slip IS NOT NULL, 'form16_read', v_f16 IS NOT NULL,
                             'recommendation', (SELECT recommendation FROM recommendations WHERE application_id = v_app.id ORDER BY generated_at DESC LIMIT 1)),
          CASE WHEN v_staff IS NULL THEN 'SYSTEM' ELSE 'USER' END, v_staff);

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION fn_staff_customer_run_checks(p_application_id TEXT, p_read JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := fn_require_permission('app.evaluate');
  v_app   UUID;
BEGIN
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app IS NULL OR NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  -- What the readers saved fills in anything the screen did not send.
  RETURN fn_customer_checks_core(v_app, fn_reading_summary(v_app) || jsonb_strip_nulls(coalesce(p_read, '{}'::jsonb)), v_staff);
END;
$$;


-- =============================================================================
-- 6. The engine
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_auto_review_documents(p_app UUID, p_trigger TEXT DEFAULT 'MANUAL')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set       document_auto_settings%ROWTYPE;
  v_a         applications%ROWTYPE;
  r           RECORD;
  k           RECORD;
  v_res       RECORD;
  v_blocked   BOOLEAN;
  v_waiting   BOOLEAN;
  v_ask       TEXT;
  v_accepted  TEXT[] := '{}';
  v_asked     TEXT[] := '{}';
  v_person    TEXT[] := '{}';
  v_verified  BOOLEAN := false;
  v_checks    TEXT;
  v_rec       TEXT;
  v_summary   JSONB;
BEGIN
  SELECT * INTO v_set FROM document_auto_settings WHERE id;
  SELECT * INTO v_a FROM applications WHERE id = p_app FOR UPDATE;
  IF v_a.id IS NULL OR v_a.origin <> 'CUSTOMER' OR NOT coalesce(v_set.enabled, false) THEN
    RETURN jsonb_build_object('ran', false);
  END IF;
  IF v_a.status NOT IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW', 'APPROVED', 'DISBURSED') THEN
    RETURN jsonb_build_object('ran', false);
  END IF;

  FOR r IN
    SELECT q.doc_type, coalesce(p.auto_accept, false) AS auto_accept
    FROM application_document_requirements q
    LEFT JOIN document_auto_policy p ON p.doc_type = q.doc_type
    WHERE q.application_id = p_app AND q.status = 'RECEIVED'
  LOOP
    v_blocked := false;
    v_waiting := false;
    v_ask := NULL;
    DELETE FROM document_check_results WHERE application_id = p_app AND doc_type = r.doc_type;
    FOR k IN SELECT * FROM document_check_rules WHERE doc_type = r.doc_type AND enabled ORDER BY sort_order LOOP
      SELECT * INTO v_res FROM fn_doc_check(p_app, r.doc_type, k.check_code, k.threshold, v_set.reader_wait_minutes);
      INSERT INTO document_check_results (application_id, doc_type, check_code, result, detail)
      VALUES (p_app, r.doc_type, k.check_code, v_res.result, v_res.detail);
      IF k.blocking AND v_res.result = 'WAITING' THEN
        v_waiting := true;
      ELSIF k.blocking AND v_res.result IN ('FAIL', 'UNREAD') THEN
        v_blocked := true;
        IF v_res.result = 'FAIL' AND k.on_fail = 'ASK_CUSTOMER' AND v_ask IS NULL THEN
          v_ask := coalesce(k.customer_message, 'Upload this document again.');
        END IF;
      END IF;
    END LOOP;

    IF v_ask IS NOT NULL AND v_set.auto_accept THEN
      UPDATE application_document_requirements SET status = 'REUPLOAD', reason = left(v_ask, 300), updated_at = now()
      WHERE application_id = p_app AND doc_type = r.doc_type;
      v_asked := v_asked || r.doc_type::TEXT;
      INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
      VALUES (p_app, 'AUTO_DOC_REQUESTED', jsonb_build_object('doc_type', r.doc_type, 'reason', v_ask, 'trigger', p_trigger), 'SYSTEM');
    ELSIF NOT v_blocked AND NOT v_waiting AND r.auto_accept AND v_set.auto_accept
          AND EXISTS (SELECT 1 FROM document_check_rules WHERE doc_type = r.doc_type AND enabled AND blocking) THEN
      UPDATE application_document_requirements SET status = 'ACCEPTED', reason = NULL, updated_at = now()
      WHERE application_id = p_app AND doc_type = r.doc_type;
      v_accepted := v_accepted || r.doc_type::TEXT;
      INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
      VALUES (p_app, 'AUTO_DOC_ACCEPTED', jsonb_build_object('doc_type', r.doc_type, 'trigger', p_trigger), 'SYSTEM');
    ELSIF NOT v_waiting THEN
      v_person := v_person || r.doc_type::TEXT;
    END IF;
  END LOOP;

  -- Every needed document accepted: on to the credit check, as a person would.
  IF v_set.auto_verify AND v_a.status = 'SUBMITTED'
     AND NOT EXISTS (SELECT 1 FROM application_document_requirements
                     WHERE application_id = p_app AND required = 'ALWAYS' AND status NOT IN ('ACCEPTED', 'WAIVED')) THEN
    UPDATE applications SET status = 'UNDER_ASSESSMENT' WHERE id = p_app;
    INSERT INTO application_stage_events (application_id, stage, note, at) VALUES
      (p_app, 'DOCS_VERIFIED', 'Documents checked automatically', clock_timestamp()),
      (p_app, 'CREDIT_CHECK', 'Credit assessment started', clock_timestamp() + INTERVAL '1 millisecond');
    INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
    VALUES (p_app, 'AUTO_DOCS_VERIFIED', jsonb_build_object('trigger', p_trigger), 'SYSTEM');
    v_verified := true;

    IF v_set.auto_credit_checks THEN
      BEGIN
        PERFORM fn_customer_checks_core(p_app, fn_reading_summary(p_app), NULL);
        v_checks := 'RUN';
      EXCEPTION WHEN OTHERS THEN
        -- A credit check that cannot run leaves the case with a person; say why.
        v_checks := 'NOT_RUN: ' || SQLERRM;
        INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
        VALUES (p_app, 'AUTO_CREDIT_CHECK_SKIPPED', jsonb_build_object('reason', SQLERRM), 'SYSTEM');
      END;
    END IF;
  END IF;

  SELECT recommendation INTO v_rec FROM recommendations WHERE application_id = p_app ORDER BY generated_at DESC LIMIT 1;
  v_summary := jsonb_build_object(
    'at', now(),
    'trigger', p_trigger,
    'accepted_now', to_jsonb(v_accepted),
    'asked_again_now', to_jsonb(v_asked),
    'for_a_person', (SELECT coalesce(jsonb_agg(q.doc_type ORDER BY t.sort_order), '[]'::jsonb)
                     FROM application_document_requirements q JOIN document_types t ON t.code = q.doc_type
                     WHERE q.application_id = p_app AND q.status = 'RECEIVED'
                       AND NOT EXISTS (SELECT 1 FROM document_check_results x WHERE x.application_id = p_app AND x.doc_type = q.doc_type AND x.result = 'WAITING')),
    'still_reading', (SELECT coalesce(jsonb_agg(DISTINCT x.doc_type), '[]'::jsonb) FROM document_check_results x
                      JOIN application_document_requirements q ON q.application_id = x.application_id AND q.doc_type = x.doc_type AND q.status = 'RECEIVED'
                      WHERE x.application_id = p_app AND x.result = 'WAITING'),
    'auto_accepted_total', (SELECT count(*) FROM audit_events WHERE application_id = p_app AND event_type = 'AUTO_DOC_ACCEPTED'),
    'docs_verified_automatically', coalesce((v_a.auto_review->>'docs_verified_automatically')::BOOLEAN, false) OR v_verified,
    'credit_checks', coalesce(v_checks, v_a.auto_review->>'credit_checks'),
    'recommendation', v_rec);
  -- Fast lane: nothing needed a person, and the engine recommends approval.
  v_summary := v_summary || jsonb_build_object('fast_lane',
    (v_summary->>'docs_verified_automatically')::BOOLEAN AND v_rec = 'APPROVE'
    AND NOT EXISTS (SELECT 1 FROM audit_events WHERE application_id = p_app AND event_type IN ('OFFICER_ACCEPT_DOC', 'OFFICER_REQUEST_DOC')));
  UPDATE applications SET auto_review = v_summary WHERE id = p_app;
  RETURN v_summary || jsonb_build_object('ran', true);
END;
$$;

-- The readers call this after each document (service key only): R20.
CREATE OR REPLACE FUNCTION fn_record_document_reading(p_application_id TEXT, p_reader_type TEXT, p_fields JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app UUID;
BEGIN
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id;
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_reader_type NOT IN ('pan_card', 'aadhaar_card', 'salary_slip', 'form16', 'bank_statement') OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'unknown reading' USING ERRCODE = '22023';
  END IF;
  INSERT INTO document_readings (application_id, reader_type, fields, read_at)
  VALUES (v_app, p_reader_type, p_fields - '_cross_validation', now())
  ON CONFLICT (application_id, reader_type) DO UPDATE SET fields = EXCLUDED.fields, read_at = now();
  RETURN fn_auto_review_documents(v_app, 'READING');
END;
$$;

-- 046's face match record, now also re-running the checks.
CREATE OR REPLACE FUNCTION fn_record_face_match(p_application_id TEXT, p_doc_type TEXT, p_side TEXT, p_similarity NUMERIC, p_result TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app UUID;
BEGIN
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id;
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO kyc_face_matches (application_id, doc_type, side, similarity, result)
  VALUES (v_app, p_doc_type, p_side, p_similarity, p_result);
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app, 'FACE_MATCH_CHECKED', jsonb_build_object('doc_type', p_doc_type, 'side', p_side,
                                                          'similarity', p_similarity, 'result', p_result), 'SYSTEM');
  PERFORM fn_auto_review_documents(v_app, 'FACE_MATCH');
END;
$$;

-- On submit (the RECEIVED step) and on every file a submitted customer sends again.
CREATE OR REPLACE FUNCTION trg_auto_review_on_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_auto_review_documents(NEW.application_id, 'SUBMIT');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_stage_received_auto_review ON application_stage_events;
CREATE TRIGGER trg_stage_received_auto_review
  AFTER INSERT ON application_stage_events
  FOR EACH ROW WHEN (NEW.stage = 'RECEIVED')
  EXECUTE FUNCTION trg_auto_review_on_submit();

CREATE OR REPLACE FUNCTION trg_auto_review_on_reupload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'RECEIVED' AND OLD.status IS DISTINCT FROM 'RECEIVED'
     AND EXISTS (SELECT 1 FROM applications WHERE id = NEW.application_id AND status <> 'DRAFT') THEN
    PERFORM fn_auto_review_documents(NEW.application_id, 'REUPLOAD');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_requirement_received_auto_review ON application_document_requirements;
CREATE TRIGGER trg_requirement_received_auto_review
  AFTER UPDATE OF status ON application_document_requirements
  FOR EACH ROW WHEN (NEW.status = 'RECEIVED')
  EXECUTE FUNCTION trg_auto_review_on_reupload();

-- =============================================================================
-- 7. For staff: what the checks said, run them again, change the rules
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_document_checks(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app IS NULL OR NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'summary', (SELECT auto_review FROM applications WHERE id = v_app),
    'enabled', (SELECT enabled FROM document_auto_settings WHERE id),
    'documents', (SELECT coalesce(jsonb_object_agg(d.doc_type, d.checks), '{}'::jsonb) FROM (
      SELECT x.doc_type, jsonb_agg(jsonb_build_object('check', x.check_code, 'label', coalesce(k.label, x.check_code),
                                                      'result', x.result, 'detail', x.detail, 'blocking', coalesce(k.blocking, false),
                                                      'at', x.checked_at) ORDER BY k.sort_order) AS checks
      FROM document_check_results x
      LEFT JOIN document_check_rules k ON k.doc_type = x.doc_type AND k.check_code = x.check_code
      WHERE x.application_id = v_app
      GROUP BY x.doc_type) d),
    'auto_accepted', (SELECT coalesce(jsonb_agg(DISTINCT event_detail->>'doc_type'), '[]'::jsonb)
                      FROM audit_events WHERE application_id = v_app AND event_type = 'AUTO_DOC_ACCEPTED'));
END;
$$;

CREATE OR REPLACE FUNCTION fn_staff_rerun_document_checks(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app UUID;
BEGIN
  PERFORM fn_require_permission('app.evaluate');
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app IS NULL OR NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN fn_auto_review_documents(v_app, 'STAFF');
END;
$$;

CREATE OR REPLACE FUNCTION fn_staff_auto_rules()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.view', 'policy.author', 'app.evaluate']);
  RETURN jsonb_build_object(
    'settings', (SELECT to_jsonb(s) - 'id' FROM document_auto_settings s WHERE id),
    'can_edit', fn_has_permission('policy.author'),
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'doc_type', t.code, 'name', t.name, 'required', t.required,
        'auto_accept', coalesce(p.auto_accept, false), 'note', p.note,
        'checks', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'check', k.check_code, 'label', k.label, 'enabled', k.enabled, 'blocking', k.blocking,
                     'threshold', k.threshold, 'threshold_hint', k.threshold_hint, 'on_fail', k.on_fail,
                     'customer_message', k.customer_message) ORDER BY k.sort_order), '[]'::jsonb)
                   FROM document_check_rules k WHERE k.doc_type = t.code))
      ORDER BY t.sort_order), '[]'::jsonb)
      FROM document_types t LEFT JOIN document_auto_policy p ON p.doc_type = t.code
      WHERE EXISTS (SELECT 1 FROM document_check_rules k WHERE k.doc_type = t.code)));
END;
$$;

-- p: {settings: {enabled, auto_accept, auto_verify, auto_credit_checks, reader_wait_minutes}}
--  or {doc_type, auto_accept}
--  or {doc_type, check, enabled, blocking, threshold, on_fail, customer_message}
CREATE OR REPLACE FUNCTION fn_staff_set_auto_rule(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff  UUID := fn_require_permission('policy.author');
  v_before JSONB;
  v_doc    TEXT := p->>'doc_type';
  v_check  TEXT := p->>'check';
  s        JSONB := p->'settings';
BEGIN
  IF jsonb_typeof(s) = 'object' THEN
    SELECT to_jsonb(x) INTO v_before FROM document_auto_settings x WHERE id;
    UPDATE document_auto_settings SET
      enabled = coalesce((s->>'enabled')::BOOLEAN, enabled),
      auto_accept = coalesce((s->>'auto_accept')::BOOLEAN, auto_accept),
      auto_verify = coalesce((s->>'auto_verify')::BOOLEAN, auto_verify),
      auto_credit_checks = coalesce((s->>'auto_credit_checks')::BOOLEAN, auto_credit_checks),
      reader_wait_minutes = coalesce((s->>'reader_wait_minutes')::SMALLINT, reader_wait_minutes),
      updated_by = v_staff, updated_at = now()
    WHERE id;
  ELSIF v_check IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM document_auto_policy WHERE doc_type = v_doc) THEN
      RAISE EXCEPTION 'unknown document' USING ERRCODE = '22023';
    END IF;
    SELECT to_jsonb(x) INTO v_before FROM document_auto_policy x WHERE doc_type = v_doc;
    UPDATE document_auto_policy SET auto_accept = coalesce((p->>'auto_accept')::BOOLEAN, auto_accept),
                                    updated_by = v_staff, updated_at = now()
    WHERE doc_type = v_doc;
  ELSE
    SELECT to_jsonb(x) INTO v_before FROM document_check_rules x WHERE doc_type = v_doc AND check_code = v_check;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'unknown check' USING ERRCODE = '22023';
    END IF;
    IF p ? 'on_fail' AND p->>'on_fail' NOT IN ('REVIEW', 'ASK_CUSTOMER') THEN
      RAISE EXCEPTION 'on a fail, choose a person looks or ask the customer again' USING ERRCODE = '22023';
    END IF;
    IF p->>'on_fail' = 'ASK_CUSTOMER' AND length(btrim(coalesce(p->>'customer_message', v_before->>'customer_message', ''))) < 10 THEN
      RAISE EXCEPTION 'write what the customer is told' USING ERRCODE = '22023';
    END IF;
    UPDATE document_check_rules SET
      enabled = coalesce((p->>'enabled')::BOOLEAN, enabled),
      blocking = coalesce((p->>'blocking')::BOOLEAN, blocking),
      threshold = CASE WHEN p ? 'threshold' THEN (p->>'threshold')::NUMERIC ELSE threshold END,
      on_fail = coalesce(p->>'on_fail', on_fail),
      customer_message = coalesce(nullif(btrim(p->>'customer_message'), ''), customer_message),
      updated_by = v_staff, updated_at = now()
    WHERE doc_type = v_doc AND check_code = v_check;
  END IF;
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (NULL, 'AUTO_RULE_CHANGED', jsonb_build_object('change', p, 'before', v_before - 'updated_by' - 'updated_at'), 'USER', v_staff);
  RETURN fn_staff_auto_rules();
END;
$$;

-- 050's queue, plus what the automatic checks did on each case.
CREATE OR REPLACE FUNCTION fn_staff_customer_queue(p_scope TEXT DEFAULT 'OPEN')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  -- Real customers only for staff who may see personal data (050).
  IF NOT fn_sees_real_customers() THEN
    RETURN jsonb_build_object('drafts', 0, 'rows', '[]'::jsonb, 'restricted', true);
  END IF;
  RETURN jsonb_build_object(
    'drafts', (SELECT count(*) FROM applications WHERE origin = 'CUSTOMER' AND status = 'DRAFT'),
    'rows', (SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.submitted_at), '[]'::jsonb) FROM (
      SELECT a.application_id, c.full_name, a.status, a.approval_stage,
             coalesce(a.customer_submitted_at, a.created_at) AS submitted_at,
             round(extract(epoch FROM now() - coalesce(a.customer_submitted_at, a.created_at)) / 3600)::INT AS hours_waiting,
             CASE WHEN q.make IS NULL THEN NULL ELSE concat_ws(' ', q.make, q.model) END AS vehicle,
             coalesce(q.loan_amount_requested, a.loan_amount_requested) AS loan_amount,
             u.full_name AS officer,
             coalesce((a.auto_review->>'fast_lane')::BOOLEAN, false) AS fast_lane,
             coalesce((a.auto_review->>'docs_verified_automatically')::BOOLEAN, false) AS auto_verified,
             (SELECT count(*) FROM audit_events e WHERE e.application_id = a.id AND e.event_type = 'AUTO_DOC_ACCEPTED') AS docs_auto_accepted,
             (SELECT count(*) FROM application_document_requirements r WHERE r.application_id = a.id AND r.status = 'RECEIVED') AS docs_to_check,
             (SELECT count(*) FROM application_document_requirements r WHERE r.application_id = a.id AND r.status = 'REUPLOAD') AS docs_with_customer,
             (SELECT coalesce(sum(cardinality(g.edited_fields)), 0) FROM application_detail_groups g WHERE g.application_id = a.id) AS fields_edited,
             (SELECT f.result FROM kyc_face_matches f WHERE f.application_id = a.id
              ORDER BY CASE f.result WHEN 'MISMATCH' THEN 1 WHEN 'NO_FACE' THEN 2 WHEN 'REVIEW' THEN 3 ELSE 4 END, f.checked_at DESC LIMIT 1) AS face
      FROM applications a
      JOIN customers c ON c.id = a.customer_id
      LEFT JOIN vehicle_quotations q ON q.application_id = a.id
      LEFT JOIN users u ON u.id = a.assigned_officer_id
      WHERE a.origin = 'CUSTOMER' AND a.status <> 'DRAFT'
        AND CASE upper(coalesce(p_scope, 'OPEN'))
              WHEN 'OPEN' THEN a.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')
                               OR (a.status = 'APPROVED' AND a.approval_stage = 'IN_PRINCIPLE')
              WHEN 'DONE' THEN a.status IN ('APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')
              ELSE true END
    ) x));
END;
$$;


REVOKE ALL ON FUNCTION fn_doc_read(UUID, TEXT, TEXT), fn_doc_conf(UUID, TEXT, TEXT), fn_reading_summary(UUID),
                       fn_doc_check(UUID, TEXT, TEXT, NUMERIC, INT), fn_auto_review_documents(UUID, TEXT),
                       fn_customer_checks_core(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_record_document_reading(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_record_document_reading(TEXT, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION fn_record_face_match(TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_record_face_match(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
REVOKE ALL ON FUNCTION fn_staff_document_checks(TEXT), fn_staff_rerun_document_checks(TEXT),
                       fn_staff_auto_rules(), fn_staff_set_auto_rule(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_document_checks(TEXT), fn_staff_rerun_document_checks(TEXT),
                          fn_staff_auto_rules(), fn_staff_set_auto_rule(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_run_checks(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_run_checks(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_queue(TEXT) TO authenticated;

-- Applications already submitted get their first automatic check now.
SELECT fn_auto_review_documents(id, 'MIGRATION') FROM applications WHERE origin = 'CUSTOMER' AND status = 'SUBMITTED';

-- Checks after running:
-- SELECT doc_type, count(*) FROM document_check_rules GROUP BY 1 ORDER BY 1;
-- SELECT application_id, auto_review FROM applications WHERE origin = 'CUSTOMER' AND status <> 'DRAFT';
