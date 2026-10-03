-- =============================================================================
-- 080: Erase a customer's personal data on request; how long data is kept (fix list H6, database part)
-- =============================================================================
-- DPDP Act 2023: a customer may ask for their personal data to be erased, and
-- data must not be kept once its purpose is served, unless a law requires it.
-- The law that does here: RBI's KYC Master Direction (and the PMLA rules) keep
-- a borrower's records for 5 years after the loan ends.
--
-- Run from the SQL editor only (rare, can't be undone, no website screen):
--
--   1. find the customer, ids only (nothing personal is shown):
--        SELECT fn_erasure_find('their@email');
--   2. check what would be erased, and whether the law says keep it:
--        SELECT fn_erasure_check('<customer id>');
--   3. record the request:   SELECT fn_erasure_record('<customer id>', 'EMAIL', 'asked on 3 Oct');
--   4. erase:                SELECT fn_erasure_execute('<request id>', 'ERASE');
--      (or close it:         SELECT fn_erasure_refuse('<request id>', 'why');)
--   5. the stored files:     SELECT * FROM fn_erasure_storage_queue();
--      delete each file from S3 (or Supabase storage), then
--        SELECT fn_erasure_storage_done(ARRAY['<key>', ...]);
--      Deleting the files in S3 automatically is the AWS part of H6, not built yet.
--
-- What erasure does, for every application of the customer:
--   deleted:   documents (rows; files queued for deletion), what the readers
--              read, face matches, document check results, bank transactions,
--              month summaries, salary slips, Form 16, bureau accounts and
--              enquiries, obligations, step-4 groups, addresses
--   blanked:   the customer's name, email, PAN, mobile, Aadhaar digits, date
--              of birth, address, employer and the rest of the customer row;
--              the name on the quotation and the dealer's contact; the
--              agreement's signer, snapshot and browser; the mandate's account
--              holder, account number, IFSC and UMRN; bank account details; the
--              raw bureau report link; the consent's browser line; the
--              sign-in account (the customer can't sign in again)
--   kept:      the applications, recommendations, decisions, policy results,
--              loan accounts and payments, consent proof (hash and date) and
--              the audit log: the record of what the lender decided and why,
--              now about an anonymous customer
-- Refused while: an application is still open (decide or reject it first),
-- a loan is live, or a closed loan is inside the 5-year retention period (the
-- answer says from when it is possible). Synthetic customers: fn_synthetic_purge.
--
-- How long data is kept: data_protection_settings (5 years after a loan
-- closes; 180 days after a decision when no loan was made, a default to
-- confirm). fn_retention_due() lists the customers past it, ids only; a
-- person decides on each (nothing is erased by itself).
--
-- Run order: after 079. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_protection_settings (
  id                      SMALLINT     NOT NULL DEFAULT 1,
  loan_retention_years    SMALLINT     NOT NULL DEFAULT 5,
  no_loan_retention_days  SMALLINT     NOT NULL DEFAULT 180,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_data_protection_settings PRIMARY KEY (id),
  CONSTRAINT ck_data_protection_settings_one CHECK (id = 1),
  CONSTRAINT ck_data_protection_settings_years CHECK (loan_retention_years >= 5),
  CONSTRAINT ck_data_protection_settings_days CHECK (no_loan_retention_days BETWEEN 30 AND 3650)
);
INSERT INTO data_protection_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE data_protection_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON data_protection_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS erasure_requests (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  customer_id     UUID          NOT NULL,
  received_via    VARCHAR(20)   NOT NULL,
  note            TEXT,
  status          VARCHAR(10)   NOT NULL DEFAULT 'PENDING',
  requested_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  refused_reason  TEXT,
  summary         JSONB,
  CONSTRAINT pk_erasure_requests PRIMARY KEY (id),
  CONSTRAINT fk_erasure_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT ck_erasure_requests_via CHECK (received_via IN ('EMAIL', 'PHONE', 'LETTER', 'IN_PERSON', 'RETENTION', 'OTHER')),
  CONSTRAINT ck_erasure_requests_status CHECK (status IN ('PENDING', 'ERASED', 'REFUSED'))
);
CREATE INDEX IF NOT EXISTS ix_erasure_requests_customer ON erasure_requests (customer_id);
ALTER TABLE erasure_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erasure_requests FROM anon, authenticated;

-- Files to delete from storage (the AWS part of H6 will read this)
CREATE TABLE IF NOT EXISTS document_storage_deletions (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  request_id       UUID          NOT NULL,
  storage_backend  VARCHAR(20),
  storage_key      TEXT,
  file_path        TEXT,
  queued_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT pk_document_storage_deletions PRIMARY KEY (id),
  CONSTRAINT fk_document_storage_deletions_request FOREIGN KEY (request_id) REFERENCES erasure_requests(id)
);
CREATE INDEX IF NOT EXISTS ix_document_storage_deletions_request ON document_storage_deletions (request_id);
ALTER TABLE document_storage_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON document_storage_deletions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_erasure_require_operator()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'personal data is erased from the SQL editor only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Find a customer by email: ids only, never their details
CREATE OR REPLACE FUNCTION fn_erasure_find(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_erasure_require_operator();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'customer_id', c.id,
             'applications', (SELECT coalesce(jsonb_agg(jsonb_build_object('application', a.application_id, 'origin', a.origin, 'status', a.status)
                                                        ORDER BY a.created_at), '[]'::jsonb)
                              FROM applications a WHERE a.customer_id = c.id)))
    FROM customers c WHERE lower(c.email) = lower(trim(p_email))), '[]'::jsonb);
END;
$$;

-- What erasure would do for a customer, and whether the law says keep the data
CREATE OR REPLACE FUNCTION fn_erasure_check(p_customer UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust     customers%ROWTYPE;
  v_apps     UUID[];
  v_set      data_protection_settings%ROWTYPE;
  v_reasons  TEXT[] := '{}';
  v_until    DATE;
  v_counts   JSONB := '{}'::jsonb;
  v_t        TEXT;
  v_n        BIGINT;
BEGIN
  PERFORM fn_erasure_require_operator();
  SELECT * INTO v_cust FROM customers WHERE id = p_customer;
  IF v_cust.id IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_set FROM data_protection_settings WHERE id = 1;
  SELECT coalesce(array_agg(id), '{}') INTO v_apps FROM applications WHERE customer_id = p_customer;

  IF EXISTS (SELECT 1 FROM applications WHERE customer_id = p_customer AND origin = 'SYNTHETIC') THEN
    v_reasons := v_reasons || 'synthetic customer: use fn_synthetic_purge()'::TEXT;
  END IF;
  IF v_cust.full_name = 'Erased customer' THEN
    v_reasons := v_reasons || 'already erased'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM applications WHERE customer_id = p_customer
             AND status NOT IN ('DRAFT', 'REJECTED', 'DISBURSED', 'WITHDRAWN', 'CANCELLED')) THEN
    v_reasons := v_reasons || 'an application is still open: decide or reject it first'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM loan_accounts WHERE application_id = ANY (v_apps) AND status = 'LIVE') THEN
    v_reasons := v_reasons || 'a loan is live: records are kept while it runs and for the retention period after'::TEXT;
  END IF;
  SELECT max(closed_on + make_interval(years => v_set.loan_retention_years))::DATE INTO v_until
  FROM loan_accounts WHERE application_id = ANY (v_apps) AND status <> 'LIVE' AND closed_on IS NOT NULL;
  IF v_until IS NOT NULL AND v_until > current_date THEN
    v_reasons := v_reasons || format('a closed loan is inside the %s-year retention period (KYC records): possible from %s',
                                     v_set.loan_retention_years, to_char(v_until, 'DD Mon YYYY'));
  END IF;

  FOREACH v_t IN ARRAY ARRAY['documents', 'document_readings', 'document_extractions', 'document_check_results', 'kyc_face_matches',
                             'bank_transactions', 'bank_monthly_summary', 'salary_slips', 'form16_part_b', 'bureau_accounts',
                             'bureau_enquiries', 'obligation_details', 'application_detail_groups'] LOOP
    CONTINUE WHEN to_regclass('public.' || v_t) IS NULL;
    EXECUTE format('SELECT count(*) FROM %I WHERE application_id = ANY ($1)', v_t) INTO v_n USING v_apps;
    v_counts := v_counts || jsonb_build_object(v_t, v_n);
  END LOOP;
  v_counts := v_counts || jsonb_build_object('customer_addresses', (SELECT count(*) FROM customer_addresses WHERE customer_id = p_customer));

  RETURN jsonb_build_object(
    'customer_id', p_customer,
    'applications', cardinality(v_apps),
    'erasable', cardinality(v_reasons) = 0,
    'reasons', to_jsonb(v_reasons),
    'rows_to_delete', v_counts);
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_record(p_customer UUID, p_via TEXT, p_note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM fn_erasure_require_operator();
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer) THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO erasure_requests (customer_id, received_via, note)
  VALUES (p_customer, upper(coalesce(p_via, 'OTHER')), p_note)
  RETURNING id INTO v_id;
  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('ERASURE_REQUESTED', 'SYSTEM', jsonb_build_object('request', v_id, 'customer', p_customer, 'via', upper(coalesce(p_via, 'OTHER'))));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_refuse(p_request UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_erasure_require_operator();
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'say why the request is refused' USING ERRCODE = '22023';
  END IF;
  UPDATE erasure_requests SET status = 'REFUSED', refused_reason = p_reason, closed_at = now()
  WHERE id = p_request AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no pending request %', p_request USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('ERASURE_REFUSED', 'SYSTEM', jsonb_build_object('request', p_request, 'reason', p_reason));
END;
$$;

-- Blanks one column for the given applications: NULL where allowed, else an empty value of its type
CREATE OR REPLACE FUNCTION fn_erasure_blank(p_table TEXT, p_column TEXT, p_key TEXT, p_ids UUID[])
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notnull BOOLEAN;
  v_type    TEXT;
  v_len     INTEGER;
  v_value   TEXT;
  v_n       BIGINT;
BEGIN
  SELECT a.attnotnull, format_type(a.atttypid, a.atttypmod), nullif(a.atttypmod, -1) - 4 INTO v_notnull, v_type, v_len
  FROM pg_attribute a WHERE a.attrelid = to_regclass('public.' || p_table) AND a.attname = p_column AND NOT a.attisdropped;
  IF v_type IS NULL THEN
    RETURN 0; -- the column isn't there in this database
  END IF;
  v_value := CASE WHEN NOT v_notnull THEN 'NULL'
                  WHEN v_type IN ('jsonb', 'json') THEN '''{}''::jsonb'
                  WHEN v_type = 'bytea' THEN '''''::bytea'
                  WHEN v_type LIKE 'character%' OR v_type = 'text' THEN quote_literal(left('erased', coalesce(v_len, 6)))
                  ELSE NULL END;
  IF v_value IS NULL THEN
    RAISE EXCEPTION '%.% (%) is required and has no empty value', p_table, p_column, v_type;
  END IF;
  EXECUTE format('UPDATE %I SET %I = %s WHERE %I = ANY ($1)', p_table, p_column, v_value, p_key) USING p_ids;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_execute(p_request UUID, p_confirm TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req      erasure_requests%ROWTYPE;
  v_check    JSONB;
  v_cust     customers%ROWTYPE;
  v_apps     UUID[];
  v_docs     UUID[];
  v_fk       RECORD;
  v_t        TEXT;
  v_n        BIGINT;
  v_summary  JSONB := '{}'::jsonb;
  v_col      TEXT;
BEGIN
  PERFORM fn_erasure_require_operator();
  IF p_confirm IS DISTINCT FROM 'ERASE' THEN
    RAISE EXCEPTION 'type ERASE to confirm: this can''t be undone' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_req FROM erasure_requests WHERE id = p_request FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'no pending request %', p_request USING ERRCODE = 'P0002';
  END IF;
  v_check := fn_erasure_check(v_req.customer_id);
  IF NOT (v_check->>'erasable')::BOOLEAN THEN
    RAISE EXCEPTION 'not erased: %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_check->'reasons')), '; ')
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cust FROM customers WHERE id = v_req.customer_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_apps FROM applications WHERE customer_id = v_cust.id;
  SELECT coalesce(array_agg(id), '{}') INTO v_docs FROM documents WHERE application_id = ANY (v_apps);

  -- 1. the stored files, queued for deletion from storage
  INSERT INTO document_storage_deletions (request_id, storage_backend, storage_key, file_path)
  SELECT v_req.id, d.storage_backend, d.storage_key, d.file_path
  FROM documents d WHERE d.id = ANY (v_docs) AND (d.storage_key IS NOT NULL OR d.file_path IS NOT NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('files_queued', v_n);

  -- 2. rows that point at the documents: the quotation keeps its figures, the rest go
  FOR v_fk IN
    SELECT c.conrelid::regclass::TEXT AS tbl, a.attname AS col, NOT a.attnotnull AS nullable
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'documents'::regclass AND cardinality(c.conkey) = 1
  LOOP
    IF v_fk.tbl = 'vehicle_quotations' AND v_fk.nullable THEN
      EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = ANY ($1)', v_fk.tbl, v_fk.col, v_fk.col) USING v_docs;
    ELSE
      EXECUTE format('DELETE FROM %I WHERE %I = ANY ($1)', v_fk.tbl, v_fk.col) USING v_docs;
    END IF;
  END LOOP;

  -- 3. the detail, by application
  FOREACH v_t IN ARRAY ARRAY['document_readings', 'document_extractions', 'document_check_results', 'kyc_face_matches',
                             'bank_transactions', 'bank_monthly_summary', 'salary_slips', 'form16_part_b', 'bureau_accounts',
                             'bureau_enquiries', 'obligation_details', 'application_detail_groups', 'documents'] LOOP
    CONTINUE WHEN to_regclass('public.' || v_t) IS NULL;
    EXECUTE format('DELETE FROM %I WHERE application_id = ANY ($1)', v_t) USING v_apps;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object(v_t, v_n);
  END LOOP;
  DELETE FROM customer_addresses WHERE customer_id = v_cust.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('customer_addresses', v_n);

  -- 4. personal fields kept on the decision record, blanked
  PERFORM fn_erasure_blank('vehicle_quotations', c, 'application_id', v_apps)
  FROM unnest(ARRAY['customer_name_on_quote', 'sales_officer_name', 'sales_officer_mobile']) c;
  PERFORM fn_erasure_blank('loan_agreements', c, 'application_id', v_apps)
  FROM unnest(ARRAY['signer_name', 'snapshot', 'user_agent']) c;
  PERFORM fn_erasure_blank('repayment_mandates', c, 'application_id', v_apps)
  FROM unnest(ARRAY['holder_name', 'account_enc', 'account_last4', 'ifsc', 'umrn']) c;
  PERFORM fn_erasure_blank('bank_statement_analyses', c, 'application_id', v_apps)
  FROM unnest(ARRAY['account_number_last4', 'ifsc', 'account_opened_on']) c;
  PERFORM fn_erasure_blank('bureau_reports', c, 'application_id', v_apps)
  FROM unnest(ARRAY['report_raw_path', 'report_ref']) c;
  PERFORM fn_erasure_blank('customer_consents', 'user_agent', 'customer_id', ARRAY[v_cust.id]);

  -- 5. the customer: anonymous from here on
  FOREACH v_col IN ARRAY ARRAY['first_name', 'middle_name', 'last_name', 'father_name', 'pan_enc', 'pan_hash', 'pan_last4',
                               'mobile_hash', 'mobile_last4', 'aadhaar_last_four', 'date_of_birth', 'gender',
                               'address_line1', 'address_line2', 'city', 'pincode', 'employer_name', 'designation',
                               'salary_bank_name', 'marital_status', 'date_of_joining', 'auth_user_id'] LOOP
    PERFORM fn_erasure_blank('customers', v_col, 'id', ARRAY[v_cust.id]);
  END LOOP;
  UPDATE customers
  SET full_name = 'Erased customer',
      email = 'erased+' || left(replace(id::TEXT, '-', ''), 12) || '@erased.invalid',
      email_verified = false,
      mobile_enc = fn_pii_encrypt('erased'),  -- 012 requires a value; this one holds nothing
      updated_at = now()
  WHERE id = v_cust.id;

  -- 6. the sign-in account
  IF v_cust.auth_user_id IS NOT NULL AND to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.users WHERE id = $1' USING v_cust.auth_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('sign_in_account', v_n);
  END IF;

  UPDATE erasure_requests SET status = 'ERASED', closed_at = now(), summary = v_summary WHERE id = v_req.id;
  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('PERSONAL_DATA_ERASED', 'SYSTEM', jsonb_build_object('request', v_req.id, 'customer', v_cust.id, 'rows', v_summary));
  RETURN jsonb_build_object('request', v_req.id, 'erased', v_summary,
                            'next', 'delete the queued files from storage: SELECT * FROM fn_erasure_storage_queue();');
END;
$$;

-- Files waiting to be deleted from storage, and marking them done
CREATE OR REPLACE FUNCTION fn_erasure_storage_queue()
RETURNS TABLE (request_id UUID, storage_backend VARCHAR, storage_key TEXT, file_path TEXT, queued_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_erasure_require_operator();
  RETURN QUERY
    SELECT d.request_id, d.storage_backend, d.storage_key, d.file_path, d.queued_at
    FROM document_storage_deletions d WHERE d.deleted_at IS NULL ORDER BY d.queued_at;
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_storage_done(p_keys TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  PERFORM fn_erasure_require_operator();
  UPDATE document_storage_deletions SET deleted_at = now()
  WHERE deleted_at IS NULL AND (storage_key = ANY (p_keys) OR file_path = ANY (p_keys));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Customers whose data is past the retention period: ids and dates only
CREATE OR REPLACE FUNCTION fn_retention_due()
RETURNS TABLE (customer_id UUID, reason TEXT, since DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set data_protection_settings%ROWTYPE;
BEGIN
  PERFORM fn_erasure_require_operator();
  SELECT * INTO v_set FROM data_protection_settings WHERE id = 1;
  RETURN QUERY
  WITH per AS (
    SELECT c.id,
           bool_or(a.origin = 'SYNTHETIC') AS synthetic,
           bool_or(a.status NOT IN ('DRAFT', 'REJECTED', 'DISBURSED', 'WITHDRAWN', 'CANCELLED')) AS open_app,
           bool_or(l.status = 'LIVE') AS live_loan,
           max(l.closed_on) AS loan_closed,
           bool_or(l.id IS NOT NULL) AS had_loan,
           max(coalesce(a.updated_at, a.created_at))::DATE AS last_activity
    FROM customers c
    JOIN applications a ON a.customer_id = c.id
    LEFT JOIN loan_accounts l ON l.application_id = a.id
    WHERE c.full_name <> 'Erased customer'
    GROUP BY c.id)
  SELECT p.id,
         CASE WHEN p.had_loan THEN format('loan closed over %s years ago', v_set.loan_retention_years)
              ELSE format('no loan, last activity over %s days ago', v_set.no_loan_retention_days) END,
         CASE WHEN p.had_loan THEN (p.loan_closed + make_interval(years => v_set.loan_retention_years))::DATE
              ELSE p.last_activity + v_set.no_loan_retention_days END
  FROM per p
  WHERE NOT p.synthetic AND NOT p.open_app AND NOT coalesce(p.live_loan, false)
    AND ((p.had_loan AND p.loan_closed IS NOT NULL
          AND p.loan_closed + make_interval(years => v_set.loan_retention_years) < current_date)
      OR (NOT p.had_loan AND p.last_activity + v_set.no_loan_retention_days < current_date))
  ORDER BY 3;
END;
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_erasure_require_operator()', 'fn_erasure_find(TEXT)', 'fn_erasure_check(UUID)',
                           'fn_erasure_record(UUID, TEXT, TEXT)', 'fn_erasure_refuse(UUID, TEXT)',
                           'fn_erasure_blank(TEXT, TEXT, TEXT, UUID[])', 'fn_erasure_execute(UUID, TEXT)',
                           'fn_erasure_storage_queue()', 'fn_erasure_storage_done(TEXT[])', 'fn_retention_due()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END;
$$;

-- Check after running (ids only, nothing personal):
-- SELECT * FROM data_protection_settings;
-- SELECT * FROM fn_retention_due();
