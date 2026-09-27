-- cercit — customer onboarding, part 1 (customer batch 1 of docs/design/customer-data-model.md)
--
-- The customer journey (Sameer, 27 Sep 2026):
--   1. name (first, middle, last or initial) → mobile + OTP → email + email code
--   2. car details — from the dealer quotation or typed in
--   3. documents
--   4. address and personal details
--
-- This script adds the tables for the whole batch and the functions for
-- steps 1 and 2. Customers never touch tables directly: every read and write
-- goes through the functions below, which only ever act on the caller's own
-- draft. A staff login cannot apply as a customer.
--
-- Mobile OTP is simulated until an SMS provider is connected (reconcile list);
-- the method is recorded on the customer so a simulated check is never
-- mistaken for a real one. Email is proven by the real email code (Supabase).
--
-- Run order: after 042. Safe to re-run.

-- =============================================================================
-- 1. Reference data
-- =============================================================================

CREATE TABLE IF NOT EXISTS consent_texts (
  purpose     VARCHAR(40)   NOT NULL,
  version     VARCHAR(20)   NOT NULL,
  body        TEXT          NOT NULL,
  is_current  BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_consent_texts PRIMARY KEY (purpose, version)
);

INSERT INTO consent_texts (purpose, version, body) VALUES
  ('APPLICATION_PROCESSING', '2026-09-v1',
   'I agree that cercit may use the details and documents I provide to assess my car loan application, '
   || 'verify my identity and contact me about it. I can withdraw this consent at any time by writing to the '
   || 'grievance officer; my application will then stop. This is a demo: do not enter real personal data.'),
  ('BUREAU_PULL', '2026-09-v1',
   'I authorise cercit to obtain my credit report from credit bureaus (CIBIL and one other) to assess this '
   || 'application. The report is used only for this application.')
ON CONFLICT (purpose, version) DO UPDATE SET body = EXCLUDED.body;

CREATE TABLE IF NOT EXISTS document_types (
  code            VARCHAR(20)   NOT NULL,
  name            VARCHAR(80)   NOT NULL,
  required        VARCHAR(12)   NOT NULL,     -- ALWAYS / CONDITIONAL / OPTIONAL
  required_note   TEXT,
  sides           SMALLINT      NOT NULL DEFAULT 1,
  sources         TEXT[]        NOT NULL,
  allowed_mime    TEXT[]        NOT NULL DEFAULT ARRAY['application/pdf', 'image/jpeg', 'image/png'],
  max_mb          SMALLINT      NOT NULL DEFAULT 10,
  retention_years SMALLINT      NOT NULL DEFAULT 8,
  sort_order      SMALLINT      NOT NULL,
  CONSTRAINT pk_document_types PRIMARY KEY (code),
  CONSTRAINT ck_document_types_required CHECK (required IN ('ALWAYS', 'CONDITIONAL', 'OPTIONAL'))
);

-- The document map (docs/design/document-map.md), as data.
INSERT INTO document_types (code, name, required, required_note, sides, sources, sort_order) VALUES
  ('QUOTE',       'Vehicle quotation',               'CONDITIONAL', 'Needed before final approval; in-principle approval can go ahead without it', 1, ARRAY['upload'], 10),
  ('PAN',         'PAN card',                        'ALWAYS',      NULL, 2, ARRAY['digilocker', 'upload'], 20),
  ('AADHAAR',     'Aadhaar (masked)',                'ALWAYS',      'Only the last 4 digits are ever stored', 2, ARRAY['digilocker', 'otp_ekyc', 'upload'], 30),
  ('SALARY_SLIP', 'Salary slips — last 3 months',    'ALWAYS',      NULL, 1, ARRAY['upload'], 40),
  ('FORM16_B',    'Form 16 Part B',                  'ALWAYS',      NULL, 1, ARRAY['upload'], 50),
  ('BANK_STMT',   'Bank statement — salary account, 6 months', 'ALWAYS', 'Bank PDF e-statement or Account Aggregator; no spreadsheets', 1, ARRAY['upload', 'account_aggregator'], 60),
  ('EB_BILL',     'Electricity bill (current address)', 'CONDITIONAL', 'Only if the current address differs from Aadhaar; add the owner''s details if rented', 1, ARRAY['upload'], 70),
  ('COMPANY_ID',  'Company ID card',                 'OPTIONAL',    NULL, 2, ARRAY['upload'], 80),
  ('LIVE_PHOTO',  'Live photo',                      'OPTIONAL',    'Built but switched off (face match)', 1, ARRAY['camera'], 90)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, required = EXCLUDED.required, required_note = EXCLUDED.required_note,
    sides = EXCLUDED.sides, sources = EXCLUDED.sources, sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- 2. Customer, application, documents — new columns
-- =============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name                 VARCHAR(60);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS middle_name                VARCHAR(60);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name                  VARCHAR(60);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile_verified_at         TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile_verification_method VARCHAR(12);   -- SMS / SIMULATED

ALTER TABLE applications ADD COLUMN IF NOT EXISTS channel          VARCHAR(12) NOT NULL DEFAULT 'DIRECT';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS onboarding_step  SMALLINT    NOT NULL DEFAULT 1;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS approval_stage   VARCHAR(12);          -- IN_PRINCIPLE / FINAL
ALTER TABLE applications ADD COLUMN IF NOT EXISTS quote_pending    BOOLEAN     NOT NULL DEFAULT false;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(12) NOT NULL DEFAULT 's3';   -- s3 / supabase / local
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key     TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS side            VARCHAR(6)  NOT NULL DEFAULT 'single'; -- front / back / single
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source          VARCHAR(20) NOT NULL DEFAULT 'upload';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by     VARCHAR(10) NOT NULL DEFAULT 'customer';

-- =============================================================================
-- 3. New tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_consents (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  customer_id     UUID          NOT NULL,
  application_id  UUID,
  purpose         VARCHAR(40)   NOT NULL,
  version         VARCHAR(20)   NOT NULL,
  body_sha256     VARCHAR(64)   NOT NULL,
  user_agent      TEXT,
  given_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  withdrawn_at    TIMESTAMPTZ,
  CONSTRAINT pk_customer_consents PRIMARY KEY (id),
  CONSTRAINT fk_customer_consents_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_customer_consents_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_customer_consents_text FOREIGN KEY (purpose, version) REFERENCES consent_texts(purpose, version)
);

CREATE TABLE IF NOT EXISTS application_document_requirements (
  application_id  UUID          NOT NULL,
  doc_type        VARCHAR(20)   NOT NULL,
  required        VARCHAR(12)   NOT NULL,
  status          VARCHAR(16)   NOT NULL DEFAULT 'MISSING',
  reason          TEXT,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_app_doc_requirements PRIMARY KEY (application_id, doc_type),
  CONSTRAINT fk_app_doc_requirements_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_app_doc_requirements_type FOREIGN KEY (doc_type) REFERENCES document_types(code),
  CONSTRAINT ck_app_doc_requirements_status CHECK (status IN ('MISSING', 'RECEIVED', 'ACCEPTED', 'REUPLOAD', 'WAIVED', 'NOT_NEEDED'))
);

CREATE TABLE IF NOT EXISTS vehicle_quotations (
  id                        UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id            UUID          NOT NULL,
  source                    VARCHAR(12)   NOT NULL,     -- QUOTATION / MANUAL
  document_id               UUID,
  customer_name_on_quote    VARCHAR(200),
  name_match_pct            SMALLINT,
  dealer_id                 UUID,
  dealer_name               VARCHAR(200),
  sales_officer_name        VARCHAR(100),
  sales_officer_mobile      VARCHAR(15),
  quote_date                DATE,
  valid_until               DATE,
  make                      VARCHAR(50)   NOT NULL,
  model                     VARCHAR(80)   NOT NULL,
  variant                   VARCHAR(80),
  colour                    VARCHAR(40),
  fuel_type                 VARCHAR(12),
  ex_showroom               DECIMAL(12,2) NOT NULL,
  road_tax                  DECIMAL(12,2),
  insurance                 DECIMAL(12,2),
  on_road                   DECIMAL(12,2),
  loan_amount_requested     DECIMAL(12,2) NOT NULL,
  tenure_months             SMALLINT      NOT NULL,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_vehicle_quotations PRIMARY KEY (id),
  CONSTRAINT uq_vehicle_quotations_app UNIQUE (application_id),
  CONSTRAINT fk_vehicle_quotations_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_vehicle_quotations_doc FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_vehicle_quotations_dealer FOREIGN KEY (dealer_id) REFERENCES dealers(id),
  CONSTRAINT ck_vehicle_quotations_source CHECK (source IN ('QUOTATION', 'MANUAL')),
  CONSTRAINT ck_vehicle_quotations_prices CHECK (ex_showroom > 0 AND loan_amount_requested > 0),
  CONSTRAINT ck_vehicle_quotations_fuel CHECK (fuel_type IS NULL OR fuel_type IN ('PETROL', 'DIESEL', 'CNG', 'EV', 'HYBRID')),
  CONSTRAINT ck_vehicle_quotations_tenure CHECK (tenure_months BETWEEN 12 AND 96)
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  customer_id     UUID          NOT NULL,
  address_type    VARCHAR(12)   NOT NULL,     -- PERMANENT / CURRENT / OFFICE
  line1           VARCHAR(300)  NOT NULL,
  line2           VARCHAR(300),
  city            VARCHAR(100)  NOT NULL,
  district        VARCHAR(100),
  state_code      VARCHAR(5),
  pincode         VARCHAR(6)    NOT NULL,
  source          VARCHAR(12)   NOT NULL DEFAULT 'TYPED',   -- AADHAAR / EB_BILL / BUREAU / TYPED
  is_rented       BOOLEAN,
  owner_name      VARCHAR(200),
  owner_contact   VARCHAR(20),
  verified        BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_customer_addresses PRIMARY KEY (id),
  CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_customer_addresses_state FOREIGN KEY (state_code) REFERENCES states(code),
  CONSTRAINT ck_customer_addresses_type CHECK (address_type IN ('PERMANENT', 'CURRENT', 'OFFICE')),
  CONSTRAINT ck_customer_addresses_pin CHECK (pincode ~ '^[1-9][0-9]{5}$')
);

-- =============================================================================
-- 4. Who is the customer calling?
-- =============================================================================

-- The caller's customer id, or an error. Staff logins are refused: one
-- person cannot be both lender and borrower on the same login.
CREATE OR REPLACE FUNCTION fn_customer_me()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in with your email code first' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'staff accounts cannot apply as customers' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_id FROM customers WHERE auth_user_id = auth.uid();
  RETURN v_id;
END;
$$;

-- The caller's own draft application by its number, or an error.
CREATE OR REPLACE FUNCTION fn_customer_draft_uuid(p_application_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := fn_customer_me();
  v_app      UUID;
  v_status   TEXT;
BEGIN
  SELECT a.id, a.status INTO v_app, v_status
  FROM applications a
  WHERE a.application_id = p_application_id AND a.customer_id = v_customer;
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'this application has been submitted and can no longer be changed' USING ERRCODE = '22023';
  END IF;
  RETURN v_app;
END;
$$;

-- =============================================================================
-- 5. Step 1 — start (or resume) an application
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_consent_text(p_purpose TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('purpose', purpose, 'version', version, 'body', body)
  FROM consent_texts WHERE purpose = p_purpose AND is_current
  ORDER BY created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_customer_start(
  p_first_name        TEXT,
  p_middle_name       TEXT,
  p_last_name         TEXT,
  p_mobile            TEXT,
  p_mobile_method     TEXT,
  p_consent_version   TEXT,
  p_user_agent        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := fn_customer_me();
  v_email    TEXT := lower(nullif(auth.jwt()->>'email', ''));
  v_first    TEXT := initcap(trim(p_first_name));
  v_middle   TEXT := nullif(initcap(trim(coalesce(p_middle_name, ''))), '');
  v_last     TEXT := initcap(trim(p_last_name));
  v_mobile   TEXT := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_consent  consent_texts%ROWTYPE;
  v_app      UUID;
  v_app_id   TEXT;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'verify your email first' USING ERRCODE = '28000';
  END IF;
  IF v_first !~ '^[A-Za-z][A-Za-z .''-]{0,59}$' THEN
    RAISE EXCEPTION 'enter your first name as on your PAN' USING ERRCODE = '22023';
  END IF;
  IF v_last !~ '^[A-Za-z][A-Za-z .''-]{0,59}$' THEN
    RAISE EXCEPTION 'enter your last name, or its initial' USING ERRCODE = '22023';
  END IF;
  IF v_middle IS NOT NULL AND v_middle !~ '^[A-Za-z][A-Za-z .''-]{0,59}$' THEN
    RAISE EXCEPTION 'middle name can only have letters' USING ERRCODE = '22023';
  END IF;
  IF length(v_mobile) = 12 AND v_mobile LIKE '91%' THEN
    v_mobile := substr(v_mobile, 3);
  END IF;
  IF v_mobile !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'enter a 10-digit Indian mobile number' USING ERRCODE = '22023';
  END IF;
  IF p_mobile_method NOT IN ('SMS', 'SIMULATED') THEN
    RAISE EXCEPTION 'verify your mobile number first' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_consent FROM consent_texts
  WHERE purpose = 'APPLICATION_PROCESSING' AND version = p_consent_version AND is_current;
  IF v_consent.version IS NULL THEN
    RAISE EXCEPTION 'please accept the current consent wording' USING ERRCODE = '22023';
  END IF;

  -- The customer: this login's row, or one created earlier for this email and not yet linked.
  IF v_customer IS NULL THEN
    SELECT id INTO v_customer FROM customers WHERE lower(email) = v_email AND auth_user_id IS NULL;
  END IF;
  IF v_customer IS NULL THEN
    INSERT INTO customers (full_name, email, mobile, first_name, middle_name, last_name,
                           email_verified, auth_user_id, mobile_verified_at, mobile_verification_method)
    VALUES (concat_ws(' ', v_first, v_middle, v_last), v_email, v_mobile, v_first, v_middle, v_last,
            true, auth.uid(), now(), p_mobile_method)
    RETURNING id INTO v_customer;
  ELSE
    UPDATE customers
    SET full_name = concat_ws(' ', v_first, v_middle, v_last),
        first_name = v_first, middle_name = v_middle, last_name = v_last,
        mobile = v_mobile, email_verified = true, auth_user_id = auth.uid(),
        mobile_verified_at = now(), mobile_verification_method = p_mobile_method
    WHERE id = v_customer;
  END IF;

  -- One open draft at a time: resume it if there is one.
  SELECT id, application_id INTO v_app, v_app_id
  FROM applications WHERE customer_id = v_customer AND status = 'DRAFT'
  ORDER BY created_at DESC LIMIT 1;

  IF v_app IS NULL THEN
    v_app_id := fn_generate_application_id();
    INSERT INTO applications (application_id, customer_id, status, current_step, onboarding_step, channel)
    VALUES (v_app_id, v_customer, 'DRAFT', 1, 2, 'DIRECT')
    RETURNING id INTO v_app;

    INSERT INTO application_document_requirements (application_id, doc_type, required)
    SELECT v_app, code, required FROM document_types WHERE required IN ('ALWAYS', 'CONDITIONAL');

    INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
    VALUES (v_app, 'APPLICATION_CREATED', jsonb_build_object('channel', 'DIRECT', 'mobile_check', p_mobile_method), 'CUSTOMER');
  ELSE
    UPDATE applications SET onboarding_step = greatest(onboarding_step, 2) WHERE id = v_app;
  END IF;

  INSERT INTO customer_consents (customer_id, application_id, purpose, version, body_sha256, user_agent)
  VALUES (v_customer, v_app, v_consent.purpose, v_consent.version,
          encode(extensions.digest(v_consent.body, 'sha256'), 'hex'), left(p_user_agent, 300));

  RETURN jsonb_build_object('application_id', v_app_id, 'step', (SELECT onboarding_step FROM applications WHERE id = v_app));
END;
$$;

-- Everything the customer's screens need to resume a draft.
CREATE OR REPLACE FUNCTION fn_customer_current()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := fn_customer_me();
  v_app      applications%ROWTYPE;
BEGIN
  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('customer', NULL, 'draft', NULL);
  END IF;
  SELECT * INTO v_app FROM applications WHERE customer_id = v_customer AND status = 'DRAFT'
  ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'customer', (SELECT jsonb_build_object('first_name', first_name, 'middle_name', middle_name, 'last_name', last_name,
                                           'email', email, 'mobile_last4', mobile_last4,
                                           'mobile_check', mobile_verification_method)
                 FROM customers WHERE id = v_customer),
    'draft', CASE WHEN v_app.id IS NULL THEN NULL ELSE jsonb_build_object(
      'application_id', v_app.application_id,
      'step', v_app.onboarding_step,
      'quote_pending', v_app.quote_pending,
      'vehicle', (SELECT to_jsonb(q) - 'id' - 'application_id' - 'document_id' - 'dealer_id' - 'created_at' - 'updated_at'
                  FROM vehicle_quotations q WHERE q.application_id = v_app.id),
      'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'doc_type', r.doc_type, 'name', t.name, 'required', r.required, 'status', r.status,
                      'note', t.required_note, 'sides', t.sides) ORDER BY t.sort_order), '[]'::jsonb)
                    FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                    WHERE r.application_id = v_app.id)
    ) END);
END;
$$;

-- =============================================================================
-- 6. Step 2 — car details (from the quotation, or typed in)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_save_vehicle(p_application_id TEXT, p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app      UUID := fn_customer_draft_uuid(p_application_id);
  v_source   TEXT := upper(coalesce(p->>'source', 'MANUAL'));
  v_ex       NUMERIC := nullif(p->>'ex_showroom', '')::NUMERIC;
  v_tax      NUMERIC := nullif(p->>'road_tax', '')::NUMERIC;
  v_ins      NUMERIC := nullif(p->>'insurance', '')::NUMERIC;
  v_loan     NUMERIC := nullif(p->>'loan_amount', '')::NUMERIC;
  v_tenure   INTEGER := nullif(p->>'tenure_months', '')::INTEGER;
  v_date     DATE := nullif(p->>'quote_date', '')::DATE;
  v_valid    DATE := nullif(p->>'valid_until', '')::DATE;
  v_on_road  NUMERIC;
  v_dealer   UUID;
BEGIN
  IF v_source NOT IN ('QUOTATION', 'MANUAL') THEN
    RAISE EXCEPTION 'unknown source' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(p->>'make'), '') IS NULL OR nullif(trim(p->>'model'), '') IS NULL THEN
    RAISE EXCEPTION 'choose the car make and model' USING ERRCODE = '22023';
  END IF;
  IF v_ex IS NULL OR v_ex < 100000 OR v_ex > 20000000 THEN
    RAISE EXCEPTION 'enter the ex-showroom price (₹1 lakh to ₹2 crore)' USING ERRCODE = '22023';
  END IF;
  IF v_loan IS NULL OR v_loan < 100000 THEN
    RAISE EXCEPTION 'enter the loan amount you need (at least ₹1 lakh)' USING ERRCODE = '22023';
  END IF;
  v_on_road := v_ex + coalesce(v_tax, 0) + coalesce(v_ins, 0);
  IF v_loan > v_on_road THEN
    RAISE EXCEPTION 'the loan cannot be more than the on-road price' USING ERRCODE = '22023';
  END IF;
  IF v_tenure IS NULL OR v_tenure NOT IN (24, 36, 48, 60, 72, 84) THEN
    RAISE EXCEPTION 'choose a tenure between 2 and 7 years' USING ERRCODE = '22023';
  END IF;
  IF v_source = 'QUOTATION' THEN
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'enter the quotation date' USING ERRCODE = '22023';
    END IF;
    IF v_date > current_date THEN
      RAISE EXCEPTION 'the quotation date cannot be in the future' USING ERRCODE = '22023';
    END IF;
    IF v_valid IS NOT NULL AND v_valid < current_date THEN
      RAISE EXCEPTION 'this quotation has expired; ask the dealer for a fresh one' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p ? 'sales_officer_mobile' AND nullif(p->>'sales_officer_mobile', '') IS NOT NULL
     AND regexp_replace(p->>'sales_officer_mobile', '\D', '', 'g') !~ '^(91)?[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'the sales officer''s mobile should be a 10-digit number' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_dealer FROM dealers
  WHERE nullif(trim(p->>'dealer_name'), '') IS NOT NULL
    AND lower(dealer_name) = lower(trim(p->>'dealer_name'))
  LIMIT 1;

  INSERT INTO vehicle_quotations (application_id, source, dealer_id, dealer_name, sales_officer_name, sales_officer_mobile,
                                  quote_date, valid_until, make, model, variant, colour, fuel_type,
                                  ex_showroom, road_tax, insurance, on_road, loan_amount_requested, tenure_months)
  VALUES (v_app, v_source, v_dealer, nullif(trim(p->>'dealer_name'), ''), nullif(trim(p->>'sales_officer_name'), ''),
          nullif(regexp_replace(coalesce(p->>'sales_officer_mobile', ''), '\D', '', 'g'), ''),
          v_date, v_valid, trim(p->>'make'), trim(p->>'model'), nullif(trim(p->>'variant'), ''),
          nullif(trim(p->>'colour'), ''), nullif(upper(p->>'fuel_type'), ''),
          v_ex, v_tax, v_ins, v_on_road, v_loan, v_tenure)
  ON CONFLICT (application_id) DO UPDATE
  SET source = EXCLUDED.source, dealer_id = EXCLUDED.dealer_id, dealer_name = EXCLUDED.dealer_name,
      sales_officer_name = EXCLUDED.sales_officer_name, sales_officer_mobile = EXCLUDED.sales_officer_mobile,
      quote_date = EXCLUDED.quote_date, valid_until = EXCLUDED.valid_until, make = EXCLUDED.make,
      model = EXCLUDED.model, variant = EXCLUDED.variant, colour = EXCLUDED.colour, fuel_type = EXCLUDED.fuel_type,
      ex_showroom = EXCLUDED.ex_showroom, road_tax = EXCLUDED.road_tax, insurance = EXCLUDED.insurance,
      on_road = EXCLUDED.on_road, loan_amount_requested = EXCLUDED.loan_amount_requested,
      tenure_months = EXCLUDED.tenure_months, updated_at = now();

  -- Typed-in details: the quote is still owed before final approval (two-stage decision, 27 Sep 2026).
  UPDATE applications
  SET loan_amount_requested = v_loan, tenure_months = v_tenure,
      quote_pending = (v_source = 'MANUAL'), onboarding_step = greatest(onboarding_step, 3)
  WHERE id = v_app;

  -- The requirement is met only by the file itself (documents step), never by typed details.
  UPDATE application_document_requirements
  SET reason = CASE WHEN v_source = 'MANUAL'
                    THEN 'Upload the dealer quotation any time before final approval'
                    ELSE 'Upload a photo or PDF of the quotation you copied these details from' END,
      updated_at = now()
  WHERE application_id = v_app AND doc_type = 'QUOTE' AND status = 'MISSING';

  RETURN jsonb_build_object('application_id', p_application_id, 'step', 3, 'quote_pending', v_source = 'MANUAL');
END;
$$;

-- =============================================================================
-- 7. Access
-- =============================================================================

ALTER TABLE consent_texts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_consents                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_quotations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses                ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON consent_texts, document_types, customer_consents, application_document_requirements,
              vehicle_quotations, customer_addresses FROM anon, authenticated;
GRANT SELECT ON consent_texts, document_types, customer_consents, application_document_requirements,
                vehicle_quotations, customer_addresses TO authenticated, service_role;

DROP POLICY IF EXISTS "staff_read" ON consent_texts;
CREATE POLICY "staff_read" ON consent_texts FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON document_types;
CREATE POLICY "staff_read" ON document_types FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON customer_consents;
CREATE POLICY "staff_read" ON customer_consents FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON application_document_requirements;
CREATE POLICY "staff_read" ON application_document_requirements FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON vehicle_quotations;
CREATE POLICY "staff_read" ON vehicle_quotations FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON customer_addresses;
CREATE POLICY "staff_read" ON customer_addresses FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

REVOKE ALL ON FUNCTION fn_customer_me() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_draft_uuid(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_consent_text(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_consent_text(TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_start(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_start(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_current() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_current() TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_save_vehicle(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_save_vehicle(TEXT, JSONB) TO authenticated;

-- Checks after running:
-- SELECT code, name, required FROM document_types ORDER BY sort_order;   -- 9 rows
-- SELECT fn_consent_text('APPLICATION_PROCESSING');
