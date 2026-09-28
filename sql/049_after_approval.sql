-- cercit — after approval: loan offer and KFS, agreement, EMI mandate, disbursement (28 Sep 2026)
--
-- The customer journey from final approval to the money reaching the dealer:
--
--   1. The officer issues the loan offer: sanction letter + Key Facts Statement
--      (RBI circular RBI/2024-25/18, 15 Apr 2024). The offer fixes the amount,
--      rate, fees, APR and EMI; the KFS is valid for 3 working days.
--   2. The customer reads the KFS and accepts it with an email code. They
--      accept exactly the version they saw (its hash is checked).
--   3. The loan agreement is prepared from a frozen snapshot of the offer, and
--      the customer e-signs it (typed name + email code). In production this
--      is Aadhaar eSign through a licensed provider; here it is marked as a
--      demo signature. The agreement's hash is kept with the signature.
--   4. The customer sets up EMI auto-debit (e-NACH, simulated in the demo).
--   5. The customer sends the dealer's papers: down-payment receipt, vehicle
--      invoice (hypothecated to the lender) and the insurance policy (lender
--      as loss payee). The officer accepts each.
--   6. The officer disburses to the dealer: a loan account and its repayment
--      schedule are created (loan_accounts, 029). The RC with the hypothecation
--      is then asked for.
--
-- Every document the customer gets (sanction letter, KFS, agreement,
-- schedule, mandate confirmation, disbursement advice, welcome letter) is
-- generated from these rows by the website's document maker (lib/doc-pdf.ts).
--
-- Run order: after 048. Safe to re-run.

-- =============================================================================
-- 1. Loan arithmetic
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_emi(p_principal NUMERIC, p_rate_pct NUMERIC, p_months INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_rate_pct = 0 THEN round(p_principal / p_months, 2)
              ELSE round(p_principal * (p_rate_pct / 1200) * power(1 + p_rate_pct / 1200, p_months)
                         / (power(1 + p_rate_pct / 1200, p_months) - 1), 2) END;
$$;

-- APR as the KFS defines it: the annual rate at which the EMIs repay the amount
-- the borrower actually gets after the upfront charges (monthly IRR x 12).
CREATE OR REPLACE FUNCTION fn_apr(p_net NUMERIC, p_emi NUMERIC, p_months INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  lo NUMERIC := 0;
  hi NUMERIC := 1;   -- 100% a month: far above any real loan
  mid NUMERIC;
  pv NUMERIC;
BEGIN
  IF p_net <= 0 OR p_emi <= 0 OR p_months <= 0 THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..80 LOOP
    mid := (lo + hi) / 2;
    pv := CASE WHEN mid = 0 THEN p_emi * p_months ELSE p_emi * (1 - power(1 + mid, -p_months)) / mid END;
    IF pv > p_net THEN lo := mid; ELSE hi := mid; END IF;
  END LOOP;
  RETURN round((lo + hi) / 2 * 12 * 100, 2);
END;
$$;

CREATE OR REPLACE FUNCTION fn_add_working_days(p_from DATE, p_days INTEGER)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d DATE := p_from;
  n INTEGER := 0;
BEGIN
  WHILE n < p_days LOOP
    d := d + 1;
    IF extract(isodow FROM d) < 6 THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- First EMI: the 5th of the month after disbursement, at least 15 days away.
CREATE OR REPLACE FUNCTION fn_first_emi_date(p_disbursed DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN (date_trunc('month', p_disbursed) + INTERVAL '1 month' + INTERVAL '4 days')::DATE - p_disbursed >= 15
              THEN (date_trunc('month', p_disbursed) + INTERVAL '1 month' + INTERVAL '4 days')::DATE
              ELSE (date_trunc('month', p_disbursed) + INTERVAL '2 months' + INTERVAL '4 days')::DATE END;
$$;

-- =============================================================================
-- 2. Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS loan_offers (
  id                    UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id        UUID          NOT NULL,
  version               SMALLINT      NOT NULL,
  status                VARCHAR(12)   NOT NULL DEFAULT 'ISSUED',   -- ISSUED / ACCEPTED / EXPIRED / WITHDRAWN
  sanction_ref          VARCHAR(40)   NOT NULL,
  kfs_ref               VARCHAR(40)   NOT NULL,
  sanctioned_amount     DECIMAL(12,2) NOT NULL,
  rate_pct              DECIMAL(5,2)  NOT NULL,
  rate_type             VARCHAR(10)   NOT NULL DEFAULT 'FIXED',
  tenure_months         SMALLINT      NOT NULL,
  emi                   DECIMAL(10,2) NOT NULL,
  processing_fee        DECIMAL(10,2) NOT NULL,
  documentation_charge  DECIMAL(10,2) NOT NULL,
  gst_on_fees           DECIMAL(10,2) NOT NULL,
  stamp_duty            DECIMAL(10,2) NOT NULL,
  total_upfront         DECIMAL(10,2) NOT NULL,
  net_disbursal         DECIMAL(12,2) NOT NULL,
  apr_pct               DECIMAL(5,2)  NOT NULL,
  total_interest        DECIMAL(12,2) NOT NULL,
  total_payable         DECIMAL(12,2) NOT NULL,
  emi_day               SMALLINT      NOT NULL DEFAULT 5,
  indicative_first_emi  DATE          NOT NULL,
  penal_charge          DECIMAL(10,2) NOT NULL DEFAULT 500,
  bounce_charge         DECIMAL(10,2) NOT NULL DEFAULT 500,
  foreclosure_pct       DECIMAL(5,2)  NOT NULL DEFAULT 4,
  foreclosure_lock_emis SMALLINT      NOT NULL DEFAULT 6,
  cooling_off_days      SMALLINT      NOT NULL DEFAULT 3,
  dealer_name           VARCHAR(200),
  vehicle               VARCHAR(250),
  valid_until           DATE          NOT NULL,
  kfs_hash              VARCHAR(64)   NOT NULL,
  issued_by             UUID,
  issued_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  accepted_at           TIMESTAMPTZ,
  CONSTRAINT pk_loan_offers PRIMARY KEY (id),
  CONSTRAINT fk_loan_offers_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT uq_loan_offers_version UNIQUE (application_id, version),
  CONSTRAINT ck_loan_offers_status CHECK (status IN ('ISSUED', 'ACCEPTED', 'EXPIRED', 'WITHDRAWN'))
);

CREATE TABLE IF NOT EXISTS loan_agreements (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id    UUID          NOT NULL,
  offer_id          UUID          NOT NULL,
  agreement_ref     VARCHAR(40)   NOT NULL,
  template_version  VARCHAR(20)   NOT NULL,
  snapshot          JSONB         NOT NULL,     -- everything the agreement text is built from, frozen
  content_hash      VARCHAR(64)   NOT NULL,
  status            VARCHAR(8)    NOT NULL DEFAULT 'READY',   -- READY / SIGNED / VOID
  signer_name       VARCHAR(200),
  sign_method       VARCHAR(30),
  code_verified_at  TIMESTAMPTZ,
  signed_at         TIMESTAMPTZ,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_loan_agreements PRIMARY KEY (id),
  CONSTRAINT fk_loan_agreements_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_loan_agreements_offer FOREIGN KEY (offer_id) REFERENCES loan_offers(id),
  CONSTRAINT ck_loan_agreements_status CHECK (status IN ('READY', 'SIGNED', 'VOID'))
);

CREATE TABLE IF NOT EXISTS repayment_mandates (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id  UUID          NOT NULL,
  holder_name     VARCHAR(200)  NOT NULL,
  bank_name       VARCHAR(100)  NOT NULL,
  ifsc            VARCHAR(11)   NOT NULL,
  account_enc     BYTEA         NOT NULL,
  account_last4   VARCHAR(4)    NOT NULL,
  account_type    VARCHAR(10)   NOT NULL,     -- SAVINGS / CURRENT
  max_amount      DECIMAL(12,2) NOT NULL,
  frequency       VARCHAR(10)   NOT NULL DEFAULT 'MONTHLY',
  start_date      DATE          NOT NULL,
  end_date        DATE          NOT NULL,
  umrn            VARCHAR(30)   NOT NULL,
  mode            VARCHAR(20)   NOT NULL DEFAULT 'E_NACH_SIMULATED',
  status          VARCHAR(12)   NOT NULL DEFAULT 'REGISTERED',   -- REGISTERED / CANCELLED
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_repayment_mandates PRIMARY KEY (id),
  CONSTRAINT fk_repayment_mandates_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT ck_repayment_mandates_ifsc CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
);

ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS offer_id        UUID;
ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS first_emi_date  DATE;
ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS paid_to         VARCHAR(200);
ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS payment_ref     VARCHAR(40);
ALTER TABLE loan_accounts ADD COLUMN IF NOT EXISTS net_paid        DECIMAL(12,2);

ALTER TABLE loan_offers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_agreements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayment_mandates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loan_offers, loan_agreements, repayment_mandates FROM anon, authenticated;
GRANT SELECT ON loan_offers, loan_agreements TO authenticated;
DROP POLICY IF EXISTS "staff_read" ON loan_offers;
CREATE POLICY "staff_read" ON loan_offers FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON loan_agreements;
CREATE POLICY "staff_read" ON loan_agreements FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

-- The dealer's papers before disbursement, and the RC after it. They are
-- OPTIONAL in the catalogue so a new application's checklist (043) never
-- includes them; they are added to an application when they become due.
ALTER TABLE document_types ADD COLUMN IF NOT EXISTS stage VARCHAR(16) NOT NULL DEFAULT 'APPLICATION';   -- APPLICATION / BEFORE_DISBURSAL / AFTER_DISBURSAL
INSERT INTO document_types (code, name, required, required_note, sides, sources, allowed_mime, sort_order, multi_file, back_required, ask_password, upload_type, storage_folder)
VALUES
  ('MARGIN_RECEIPT',  'Down payment receipt from the dealer', 'OPTIONAL', 'Your share of the on-road price, paid to the dealer', 1, ARRAY['upload'], ARRAY['application/pdf', 'image/jpeg', 'image/png'], 100, false, true, false, 'margin_receipt', 'uploads/other/margin-receipt'),
  ('VEHICLE_INVOICE', 'Vehicle invoice',                      'OPTIONAL', 'From the dealer, showing the hypothecation to us',   1, ARRAY['upload'], ARRAY['application/pdf', 'image/jpeg', 'image/png'], 110, false, true, false, 'vehicle_invoice', 'uploads/other/invoice'),
  ('INSURANCE',       'Motor insurance policy',               'OPTIONAL', 'Comprehensive cover with us as loss payee',          1, ARRAY['upload'], ARRAY['application/pdf', 'image/jpeg', 'image/png'], 120, false, true, true,  'insurance', 'uploads/other/insurance'),
  ('RC',              'Registration certificate (RC)',        'OPTIONAL', 'With the hypothecation to us, within 30 days of registration', 1, ARRAY['upload'], ARRAY['application/pdf', 'image/jpeg', 'image/png'], 130, false, true, false, 'rc', 'uploads/other/rc')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, required_note = EXCLUDED.required_note, sort_order = EXCLUDED.sort_order,
    upload_type = EXCLUDED.upload_type, storage_folder = EXCLUDED.storage_folder, ask_password = EXCLUDED.ask_password;
UPDATE document_types SET stage = CASE code WHEN 'RC' THEN 'AFTER_DISBURSAL' ELSE 'BEFORE_DISBURSAL' END
WHERE code IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE', 'RC');

-- The upload screens get the stage, so step 3 lists only application documents.
CREATE OR REPLACE FUNCTION fn_document_upload_types()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(code, jsonb_build_object(
           'upload_type', upload_type, 'folder', storage_folder, 'allowed_mime', to_jsonb(allowed_mime), 'max_mb', max_mb,
           'name', name, 'required', required, 'note', required_note, 'sides', sides, 'sort', sort_order,
           'back_required', back_required, 'multi_file', multi_file, 'ask_password', ask_password, 'stage', stage)), '{}'::jsonb)
  FROM document_types WHERE upload_type IS NOT NULL;
$$;

-- =============================================================================
-- 3. Everything after approval, for one application (customer or staff view)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_after_approval_data(p_app UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'application', (SELECT jsonb_build_object('application_id', a.application_id, 'status', a.status, 'approval_stage', a.approval_stage,
                                              'decided_at', a.final_decision_at)
                    FROM applications a WHERE a.id = p_app),
    'customer', (SELECT jsonb_build_object('full_name', c.full_name, 'email', c.email, 'pan', fn_pii_mask(c.pan_last4, 10),
                                           'mobile', fn_pii_mask(c.mobile_last4, 10), 'dob', c.date_of_birth, 'father_name', c.father_name,
                                           'address', (SELECT jsonb_build_object('line1', ad.line1, 'line2', ad.line2, 'city', ad.city,
                                                                                 'state', (SELECT name FROM states WHERE code = ad.state_code), 'pincode', ad.pincode)
                                                       FROM customer_addresses ad WHERE ad.customer_id = c.id AND ad.address_type = 'CURRENT'))
                 FROM customers c JOIN applications a ON a.customer_id = c.id WHERE a.id = p_app),
    'vehicle', (SELECT jsonb_build_object('make', q.make, 'model', q.model, 'variant', q.variant, 'colour', q.colour, 'fuel', q.fuel_type,
                                          'dealer', q.dealer_name, 'ex_showroom', q.ex_showroom, 'on_road', coalesce(q.on_road, q.ex_showroom))
                FROM vehicle_quotations q WHERE q.application_id = p_app),
    'offer', (SELECT to_jsonb(o) - 'application_id' - 'issued_by'
                     || jsonb_build_object('officer', (SELECT full_name FROM users WHERE id = o.issued_by),
                                           'expired', o.status = 'ISSUED' AND o.valid_until < current_date)
              FROM loan_offers o WHERE o.application_id = p_app ORDER BY o.version DESC LIMIT 1),
    'agreement', (SELECT to_jsonb(g) - 'application_id' - 'user_agent' FROM loan_agreements g
                  WHERE g.application_id = p_app AND g.status <> 'VOID' ORDER BY g.created_at DESC LIMIT 1),
    'mandate', (SELECT jsonb_build_object('holder_name', m.holder_name, 'bank_name', m.bank_name, 'ifsc', m.ifsc,
                                          'account', 'XXXXXX' || m.account_last4, 'account_type', m.account_type, 'max_amount', m.max_amount,
                                          'frequency', m.frequency, 'start_date', m.start_date, 'end_date', m.end_date, 'umrn', m.umrn,
                                          'mode', m.mode, 'status', m.status, 'created_at', m.created_at)
                FROM repayment_mandates m WHERE m.application_id = p_app AND m.status = 'REGISTERED' ORDER BY m.created_at DESC LIMIT 1),
    'loan', (SELECT jsonb_build_object('loan_account_no', l.loan_account_no, 'disbursed_on', l.disbursed_on, 'disbursed_amount', l.disbursed_amount,
                                       'net_paid', l.net_paid, 'paid_to', l.paid_to, 'payment_ref', l.payment_ref, 'emi', l.emi_amount,
                                       'tenure_months', l.tenure_months, 'rate_pct', l.contract_rate_pct, 'first_emi_date', l.first_emi_date,
                                       'installment_day', l.installment_day, 'status', l.status,
                                       'schedule', (SELECT jsonb_agg(jsonb_build_object('no', i.installment_no, 'due', i.due_date, 'emi', i.amount_due,
                                                                                        'principal', i.principal_due, 'interest', i.interest_due)
                                                                     ORDER BY i.installment_no)
                                                    FROM loan_installments i WHERE i.loan_id = l.id))
             FROM loan_accounts l WHERE l.application_id = p_app ORDER BY l.created_at DESC LIMIT 1),
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object('doc_type', r.doc_type, 'name', t.name, 'status', r.status, 'note', coalesce(r.reason, t.required_note),
                                                             'required', r.required, 'sides', t.sides, 'back_required', t.back_required,
                                                             'multi_file', t.multi_file, 'ask_password', t.ask_password,
                                                             'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('side', d.side, 'file_name', d.file_name,
                                                                                         'size', d.file_size_bytes, 'uploaded_at', d.uploaded_at)), '[]'::jsonb)
                                                                       FROM documents d WHERE d.application_id = p_app AND d.doc_type = r.doc_type AND d.superseded_at IS NULL))
                                            ORDER BY t.sort_order), '[]'::jsonb)
                  FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                  WHERE r.application_id = p_app AND r.doc_type IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE', 'RC')),
    'org', fn_public_org_info());
$$;

CREATE OR REPLACE FUNCTION fn_customer_after_approval(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app UUID;
BEGIN
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND customer_id = fn_customer_me();
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN fn_after_approval_data(v_app);
END;
$$;

CREATE OR REPLACE FUNCTION fn_staff_after_approval(p_application_id TEXT)
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
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN fn_after_approval_data(v_app);
END;
$$;

-- =============================================================================
-- 4. The officer issues the offer
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_issue_offer(p_application_id TEXT, p JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff   UUID := fn_require_permission('app.decide');
  v_app     applications%ROWTYPE;
  v_q       vehicle_quotations%ROWTYPE;
  v_amount  NUMERIC;
  v_rate    NUMERIC;
  v_tenure  INTEGER;
  v_emi     NUMERIC;
  v_fee     NUMERIC;
  v_doc     NUMERIC := 500;
  v_gst     NUMERIC;
  v_stamp   NUMERIC;
  v_upfront NUMERIC;
  v_version SMALLINT;
  v_id      UUID;
  v_seq     TEXT;
  v_fields  JSONB;
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER' FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_app.status = 'APPROVED' AND v_app.approval_stage = 'FINAL') THEN
    RAISE EXCEPTION 'issue the loan offer after final approval' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM loan_offers WHERE application_id = v_app.id AND status = 'ACCEPTED') THEN
    RAISE EXCEPTION 'the customer has already accepted an offer' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_q FROM vehicle_quotations WHERE application_id = v_app.id;

  -- Amount and rate: what the officer decided, else what the engine recommended.
  v_amount := coalesce(nullif(p->>'amount', '')::NUMERIC,
                       (SELECT sanctioned_amount FROM credit_decisions WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1),
                       v_q.loan_amount_requested, v_app.loan_amount_requested);
  v_rate := coalesce(nullif(p->>'rate_pct', '')::NUMERIC,
                     (SELECT sanctioned_rate FROM credit_decisions WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1),
                     (SELECT recommended_rate FROM recommendations WHERE application_id = v_app.id ORDER BY generated_at DESC LIMIT 1),
                     8.99);
  v_tenure := coalesce(nullif(p->>'tenure_months', '')::INTEGER, v_q.tenure_months, v_app.tenure_months);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > coalesce(v_q.loan_amount_requested, v_app.loan_amount_requested) THEN
    RAISE EXCEPTION 'the offer cannot be more than the customer asked for' USING ERRCODE = '22023';
  END IF;
  IF v_rate < 5 OR v_rate > 30 OR v_tenure < 12 OR v_tenure > 96 THEN
    RAISE EXCEPTION 'check the rate and tenure' USING ERRCODE = '22023';
  END IF;

  -- Charges (demo schedule of charges): processing 1% (Rs 3,000 to 10,000),
  -- documentation Rs 500, GST 18% on both, stamp duty 0.1% of the loan.
  v_fee := least(10000, greatest(3000, round(v_amount * 0.01)));
  v_gst := round((v_fee + v_doc) * 0.18, 2);
  v_stamp := round(v_amount * 0.001);
  v_upfront := v_fee + v_doc + v_gst + v_stamp;
  v_emi := fn_emi(v_amount, v_rate, v_tenure);

  UPDATE loan_offers SET status = 'WITHDRAWN' WHERE application_id = v_app.id AND status = 'ISSUED';
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM loan_offers WHERE application_id = v_app.id;
  v_seq := regexp_replace(p_application_id, '\D', '', 'g');

  v_fields := jsonb_build_object('app', p_application_id, 'v', v_version, 'amount', v_amount, 'rate', v_rate, 'tenure', v_tenure,
                                 'emi', v_emi, 'fee', v_fee, 'doc', v_doc, 'gst', v_gst, 'stamp', v_stamp,
                                 'apr', fn_apr(v_amount - v_upfront, v_emi, v_tenure));

  INSERT INTO loan_offers (application_id, version, sanction_ref, kfs_ref, sanctioned_amount, rate_pct, tenure_months, emi,
                           processing_fee, documentation_charge, gst_on_fees, stamp_duty, total_upfront, net_disbursal, apr_pct,
                           total_interest, total_payable, indicative_first_emi, dealer_name, vehicle, valid_until, kfs_hash, issued_by)
  VALUES (v_app.id, v_version,
          'CVF/SL/' || to_char(now(), 'YYYY') || '/' || v_seq || '/' || v_version,
          'CVF/KFS/' || to_char(now(), 'YYYY') || '/' || v_seq || '/' || v_version,
          v_amount, v_rate, v_tenure, v_emi, v_fee, v_doc, v_gst, v_stamp, v_upfront, v_amount - v_upfront,
          fn_apr(v_amount - v_upfront, v_emi, v_tenure),
          round(v_emi * v_tenure - v_amount, 2), round(v_emi * v_tenure + v_upfront, 2),
          fn_first_emi_date(current_date + 7), v_q.dealer_name, concat_ws(' ', v_q.make, v_q.model, v_q.variant),
          fn_add_working_days(current_date, 3),
          encode(extensions.digest(v_fields::TEXT, 'sha256'), 'hex'), v_staff)
  RETURNING id INTO v_id;

  INSERT INTO application_stage_events (application_id, stage, note)
  VALUES (v_app.id, 'SANCTION', 'Loan offer and Key Facts Statement issued');
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (v_app.id, 'OFFER_ISSUED', v_fields, 'USER', v_staff);

  RETURN jsonb_build_object('offer_id', v_id, 'version', v_version);
END;
$$;

-- =============================================================================
-- 5. The customer: accept the KFS, sign the agreement, set up the mandate
-- =============================================================================

-- An email code entered in the last 15 minutes (same test as submit, 046).
CREATE OR REPLACE FUNCTION fn_fresh_code_at()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT max(to_timestamp((m->>'timestamp')::BIGINT))
  FROM jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) m
  WHERE m->>'method' IN ('otp', 'magiclink', 'email/signup')
    AND to_timestamp((m->>'timestamp')::BIGINT) > now() - INTERVAL '15 minutes';
$$;

CREATE OR REPLACE FUNCTION fn_customer_accept_offer(p_application_id TEXT, p_kfs_hash TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app      applications%ROWTYPE;
  v_offer    loan_offers%ROWTYPE;
  v_snapshot JSONB;
  v_template CONSTANT TEXT := 'CVF-LA-2026.09';
  v_ref      TEXT;
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND customer_id = fn_customer_me() FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_offer FROM loan_offers WHERE application_id = v_app.id AND status = 'ISSUED' ORDER BY version DESC LIMIT 1;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'there is no loan offer waiting for you' USING ERRCODE = '22023';
  END IF;
  IF v_offer.valid_until < current_date THEN
    UPDATE loan_offers SET status = 'EXPIRED' WHERE id = v_offer.id;
    RAISE EXCEPTION 'this offer expired on %; ask us for a fresh one', to_char(v_offer.valid_until, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF p_kfs_hash IS DISTINCT FROM v_offer.kfs_hash THEN
    RAISE EXCEPTION 'the offer has changed since you opened it; reload the page' USING ERRCODE = '22023';
  END IF;
  IF fn_fresh_code_at() IS NULL THEN
    RAISE EXCEPTION 'confirm with the code we email you' USING ERRCODE = '28000';
  END IF;

  UPDATE loan_offers SET status = 'ACCEPTED', accepted_at = now() WHERE id = v_offer.id;

  -- The agreement is built from a frozen snapshot, so it reads the same whenever it is opened.
  v_snapshot := fn_after_approval_data(v_app.id) - 'documents' - 'agreement' - 'mandate' - 'loan';
  v_ref := 'CVF/LA/' || to_char(now(), 'YYYY') || '/' || regexp_replace(p_application_id, '\D', '', 'g') || '/' || v_offer.version;
  UPDATE loan_agreements SET status = 'VOID' WHERE application_id = v_app.id AND status = 'READY';
  INSERT INTO loan_agreements (application_id, offer_id, agreement_ref, template_version, snapshot, content_hash)
  VALUES (v_app.id, v_offer.id, v_ref, v_template, v_snapshot,
          encode(extensions.digest(v_template || ':' || v_snapshot::TEXT, 'sha256'), 'hex'));

  -- The dealer's papers are needed before disbursement.
  INSERT INTO application_document_requirements (application_id, doc_type, required, status)
  SELECT v_app.id, code, 'ALWAYS', 'MISSING' FROM document_types WHERE code IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE')
  ON CONFLICT (application_id, doc_type) DO NOTHING;

  INSERT INTO application_stage_events (application_id, stage, note) VALUES (v_app.id, 'KFS_ACCEPTED', 'You accepted the loan offer');
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, user_agent)
  VALUES (v_app.id, 'OFFER_ACCEPTED', jsonb_build_object('offer_id', v_offer.id, 'kfs_ref', v_offer.kfs_ref, 'kfs_hash', v_offer.kfs_hash,
                                                         'code_at', fn_fresh_code_at()), 'CUSTOMER', left(p_user_agent, 300));
  RETURN jsonb_build_object('status', 'ACCEPTED', 'agreement_ref', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fn_customer_sign_agreement(p_application_id TEXT, p_content_hash TEXT, p_signer_name TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app  applications%ROWTYPE;
  v_agr  loan_agreements%ROWTYPE;
  v_name TEXT;
  v_code TIMESTAMPTZ := fn_fresh_code_at();
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND customer_id = fn_customer_me() FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_agr FROM loan_agreements WHERE application_id = v_app.id AND status = 'READY' ORDER BY created_at DESC LIMIT 1;
  IF v_agr.id IS NULL THEN
    RAISE EXCEPTION 'there is no agreement waiting for your signature' USING ERRCODE = '22023';
  END IF;
  IF p_content_hash IS DISTINCT FROM v_agr.content_hash THEN
    RAISE EXCEPTION 'the agreement has changed since you opened it; reload the page' USING ERRCODE = '22023';
  END IF;
  SELECT full_name INTO v_name FROM customers WHERE id = v_app.customer_id;
  IF lower(regexp_replace(btrim(coalesce(p_signer_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'type your full name exactly as shown: %', v_name USING ERRCODE = '22023';
  END IF;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'confirm with the code we email you' USING ERRCODE = '28000';
  END IF;

  UPDATE loan_agreements
  SET status = 'SIGNED', signer_name = v_name, sign_method = 'EMAIL_CODE_DEMO', code_verified_at = v_code, signed_at = now(),
      user_agent = left(p_user_agent, 300)
  WHERE id = v_agr.id;
  INSERT INTO application_stage_events (application_id, stage, note) VALUES (v_app.id, 'AGREEMENT_SIGNED', 'You signed the loan agreement');
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, user_agent)
  VALUES (v_app.id, 'AGREEMENT_SIGNED', jsonb_build_object('agreement_ref', v_agr.agreement_ref, 'content_hash', v_agr.content_hash,
                                                           'code_at', v_code), 'CUSTOMER', left(p_user_agent, 300));
  RETURN jsonb_build_object('status', 'SIGNED', 'signed_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION fn_customer_set_mandate(p_application_id TEXT, p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     applications%ROWTYPE;
  v_offer   loan_offers%ROWTYPE;
  v_acct    TEXT := regexp_replace(coalesce(p->>'account_number', ''), '\s', '', 'g');
  v_ifsc    TEXT := upper(btrim(coalesce(p->>'ifsc', '')));
  v_holder  TEXT := btrim(coalesce(p->>'holder_name', ''));
  v_bank    TEXT := btrim(coalesce(p->>'bank_name', ''));
  v_type    TEXT := upper(coalesce(p->>'account_type', 'SAVINGS'));
  v_start   DATE;
  v_umrn    TEXT;
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND customer_id = fn_customer_me() FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_offer FROM loan_offers WHERE application_id = v_app.id AND status = 'ACCEPTED' ORDER BY version DESC LIMIT 1;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'accept the loan offer first' USING ERRCODE = '22023';
  END IF;
  IF v_holder !~ '^[A-Za-z][A-Za-z .''-]{1,199}$' THEN
    RAISE EXCEPTION 'enter the account holder''s name as the bank has it' USING ERRCODE = '22023';
  END IF;
  IF length(v_bank) < 3 THEN
    RAISE EXCEPTION 'enter the bank''s name' USING ERRCODE = '22023';
  END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'enter the 11-character IFSC, e.g. HDFC0001234' USING ERRCODE = '22023';
  END IF;
  IF v_acct !~ '^[0-9]{9,18}$' THEN
    RAISE EXCEPTION 'enter the account number: 9 to 18 digits' USING ERRCODE = '22023';
  END IF;
  IF v_type NOT IN ('SAVINGS', 'CURRENT') THEN
    RAISE EXCEPTION 'choose savings or current account' USING ERRCODE = '22023';
  END IF;
  IF fn_fresh_code_at() IS NULL THEN
    RAISE EXCEPTION 'confirm with the code we email you' USING ERRCODE = '28000';
  END IF;

  UPDATE repayment_mandates SET status = 'CANCELLED' WHERE application_id = v_app.id AND status = 'REGISTERED';
  v_start := v_offer.indicative_first_emi;
  -- A real UMRN comes from NPCI; the simulated one is SIM + 17 digits.
  v_umrn := 'SIM' || lpad((abs(hashtext(v_app.id::TEXT || v_acct || clock_timestamp()::TEXT)) % 100000000000000000)::TEXT, 17, '0');
  INSERT INTO repayment_mandates (application_id, holder_name, bank_name, ifsc, account_enc, account_last4, account_type,
                                  max_amount, start_date, end_date, umrn)
  VALUES (v_app.id, initcap(v_holder), v_bank, v_ifsc, fn_pii_encrypt(v_acct), right(v_acct, 4), v_type,
          -- Twice the EMI, rounded up to the thousand: room for a penal charge, never an open cheque.
          ceil(v_offer.emi * 2 / 1000) * 1000, v_start, (v_start + make_interval(months => v_offer.tenure_months + 12))::DATE, v_umrn);

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app.id, 'MANDATE_REGISTERED', jsonb_build_object('ifsc', v_ifsc, 'account_last4', right(v_acct, 4), 'umrn', v_umrn, 'mode', 'E_NACH_SIMULATED'), 'CUSTOMER');
  RETURN jsonb_build_object('status', 'REGISTERED', 'umrn', v_umrn);
END;
$$;

-- =============================================================================
-- 6. The officer disburses
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_disburse(p_application_id TEXT, p JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff   UUID := fn_require_permission('app.decide');
  v_app     applications%ROWTYPE;
  v_offer   loan_offers%ROWTYPE;
  v_missing TEXT[] := '{}';
  v_loan    UUID;
  v_no      TEXT;
  v_first   DATE := fn_first_emi_date(current_date);
  v_bal     NUMERIC;
  v_int     NUMERIC;
  v_prin    NUMERIC;
  v_r       NUMERIC;
  v_ref     TEXT;
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER' FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'this application is not ready to disburse' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_offer FROM loan_offers WHERE application_id = v_app.id AND status = 'ACCEPTED' ORDER BY version DESC LIMIT 1;
  IF v_offer.id IS NULL THEN v_missing := v_missing || 'the accepted loan offer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM loan_agreements WHERE application_id = v_app.id AND status = 'SIGNED') THEN
    v_missing := v_missing || 'the signed agreement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM repayment_mandates WHERE application_id = v_app.id AND status = 'REGISTERED') THEN
    v_missing := v_missing || 'the EMI mandate';
  END IF;
  v_missing := v_missing || coalesce((SELECT array_agg(t.name ORDER BY t.sort_order) FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                                      WHERE r.application_id = v_app.id AND r.doc_type IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE')
                                        AND r.status NOT IN ('ACCEPTED', 'WAIVED')), '{}');
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'before disbursing we need: %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;

  v_no := 'CL' || to_char(now(), 'YYMM') || lpad(((SELECT count(*) FROM loan_accounts) + 1)::TEXT, 6, '0');
  v_ref := coalesce(nullif(btrim(p->>'payment_ref'), ''), 'SIMNEFT' || to_char(now(), 'YYMMDDHH24MISS'));
  INSERT INTO loan_accounts (loan_account_no, application_id, customer_id, disbursed_on, disbursed_amount, installment_day, emi_amount,
                             tenure_months, contract_rate_pct, offer_id, first_emi_date, paid_to, payment_ref, net_paid)
  VALUES (v_no, v_app.id, v_app.customer_id, current_date, v_offer.sanctioned_amount, 5, v_offer.emi, v_offer.tenure_months,
          v_offer.rate_pct, v_offer.id, v_first, coalesce(v_offer.dealer_name, 'The dealer'), v_ref, v_offer.net_disbursal)
  RETURNING id INTO v_loan;

  -- Reducing-balance schedule; the last instalment absorbs the rounding.
  v_bal := v_offer.sanctioned_amount;
  v_r := v_offer.rate_pct / 1200;
  FOR i IN 1..v_offer.tenure_months LOOP
    v_int := round(v_bal * v_r, 2);
    v_prin := CASE WHEN i = v_offer.tenure_months THEN v_bal ELSE v_offer.emi - v_int END;
    INSERT INTO loan_installments (loan_id, installment_no, due_date, amount_due, principal_due, interest_due)
    VALUES (v_loan, i, (v_first + make_interval(months => i - 1))::DATE, v_prin + v_int, v_prin, v_int);
    v_bal := v_bal - v_prin;
  END LOOP;

  UPDATE applications SET status = 'DISBURSED' WHERE id = v_app.id;
  INSERT INTO application_document_requirements (application_id, doc_type, required, status, reason)
  VALUES (v_app.id, 'RC', 'ALWAYS', 'MISSING', 'Upload within 30 days of the car''s registration')
  ON CONFLICT (application_id, doc_type) DO NOTHING;
  INSERT INTO application_stage_events (application_id, stage, note) VALUES (v_app.id, 'DISBURSED', 'Loan paid to the dealer');
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (v_app.id, 'LOAN_DISBURSED', jsonb_build_object('loan_account_no', v_no, 'amount', v_offer.sanctioned_amount,
                                                         'net_paid', v_offer.net_disbursal, 'payment_ref', v_ref), 'USER', v_staff);
  RETURN jsonb_build_object('loan_account_no', v_no, 'first_emi_date', v_first);
END;
$$;

-- =============================================================================
-- 7. Uploads, tracking and document checks after approval (047 functions, widened)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_open_uuid(p_application_id TEXT, p_doc_type TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := fn_customer_me();
  v_app      applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND customer_id = v_customer;
  IF v_app.id IS NOT NULL AND (
       v_app.status = 'DRAFT'
       OR (v_app.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW', 'APPROVED', 'DISBURSED')
           AND EXISTS (SELECT 1 FROM application_document_requirements r
                       WHERE r.application_id = v_app.id
                         AND (p_doc_type IS NULL OR r.doc_type = p_doc_type)
                         AND (r.status = 'REUPLOAD' OR (r.doc_type = 'QUOTE' AND r.status = 'MISSING')
                              OR (r.doc_type IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE', 'RC') AND r.status = 'MISSING'))))) THEN
    RETURN v_app.id;
  END IF;
  RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
END;
$$;

CREATE OR REPLACE FUNCTION fn_customer_track()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := fn_customer_me();
BEGIN
  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('customer', NULL, 'applications', '[]'::jsonb, 'draft', NULL);
  END IF;
  RETURN jsonb_build_object(
    'customer', (SELECT jsonb_build_object('first_name', first_name, 'email', email) FROM customers WHERE id = v_customer),
    'draft', (SELECT jsonb_build_object('application_id', application_id, 'step', onboarding_step)
              FROM applications WHERE customer_id = v_customer AND status = 'DRAFT' ORDER BY created_at DESC LIMIT 1),
    'applications', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'application_id', a.application_id,
        'status', a.status,
        'approval_stage', a.approval_stage,
        'submitted_at', coalesce(a.customer_submitted_at, a.created_at),
        'decided_at', a.final_decision_at,
        'loan_amount', coalesce(q.loan_amount_requested, a.loan_amount_requested),
        'tenure_months', coalesce(q.tenure_months, a.tenure_months),
        'vehicle', CASE WHEN q.make IS NULL THEN NULL ELSE concat_ws(' ', q.make, q.model, q.variant) END,
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('stage', e.stage, 'at', e.at, 'note', e.note) ORDER BY e.at), '[]'::jsonb)
                   FROM application_stage_events e WHERE e.application_id = a.id),
        'loan', jsonb_build_object(
          'offer', (SELECT jsonb_build_object('status', CASE WHEN o.status = 'ISSUED' AND o.valid_until < current_date THEN 'EXPIRED' ELSE o.status END,
                                              'valid_until', o.valid_until, 'amount', o.sanctioned_amount, 'emi', o.emi, 'apr_pct', o.apr_pct)
                    FROM loan_offers o WHERE o.application_id = a.id ORDER BY o.version DESC LIMIT 1),
          'agreement', (SELECT g.status FROM loan_agreements g WHERE g.application_id = a.id AND g.status <> 'VOID' ORDER BY g.created_at DESC LIMIT 1),
          'mandate', EXISTS (SELECT 1 FROM repayment_mandates m WHERE m.application_id = a.id AND m.status = 'REGISTERED'),
          'account', (SELECT l.loan_account_no FROM loan_accounts l WHERE l.application_id = a.id ORDER BY l.created_at DESC LIMIT 1)),
        'attention', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'doc_type', r.doc_type, 'name', t.name, 'note', r.reason, 'status', r.status, 'required', r.required,
                          'sides', t.sides, 'back_required', t.back_required, 'multi_file', t.multi_file, 'ask_password', t.ask_password,
                          'files', '[]'::jsonb) ORDER BY t.sort_order), '[]'::jsonb)
                      FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                      WHERE r.application_id = a.id AND a.status NOT IN ('REJECTED', 'WITHDRAWN', 'CANCELLED')
                        AND (r.status = 'REUPLOAD' OR (r.doc_type = 'QUOTE' AND r.status = 'MISSING')
                             OR (r.doc_type IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE', 'RC') AND r.status = 'MISSING')))
      ) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM applications a LEFT JOIN vehicle_quotations q ON q.application_id = a.id
      WHERE a.customer_id = v_customer AND a.status <> 'DRAFT'));
END;
$$;

CREATE OR REPLACE FUNCTION fn_staff_customer_action(p_application_id TEXT, p_action TEXT, p JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app      applications%ROWTYPE;
  v_staff    UUID := fn_current_staff_id();
  v_action   TEXT := upper(coalesce(p_action, ''));
  v_doc      TEXT := p->>'doc_type';
  v_reason   TEXT := nullif(btrim(coalesce(p->>'reason', p->>'note', '')), '');
  v_decision TEXT := upper(coalesce(p->>'decision', ''));
  v_missing  TEXT;
  v_open     BOOLEAN;
BEGIN
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER' FOR UPDATE;
  IF v_app.id IS NULL OR v_app.status = 'DRAFT' THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  v_open := v_app.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')
            OR (v_app.status = 'APPROVED' AND v_app.approval_stage = 'IN_PRINCIPLE');

  -- After approval only the dealer's papers and the RC are still checked (049).
  IF v_action IN ('ACCEPT_DOC', 'REQUEST_DOC') AND v_app.status IN ('APPROVED', 'DISBURSED') THEN
    v_open := v_doc IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE', 'RC');
  END IF;

  IF v_action = 'ASSIGN_TO_ME' THEN
    PERFORM fn_require_any_permission(ARRAY['app.evaluate', 'app.decide']);
    UPDATE applications SET assigned_officer_id = v_staff WHERE id = v_app.id;

  ELSIF v_action IN ('ACCEPT_DOC', 'REQUEST_DOC') THEN
    PERFORM fn_require_permission('app.evaluate');
    IF NOT v_open THEN
      RAISE EXCEPTION 'this application is closed' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM application_document_requirements WHERE application_id = v_app.id AND doc_type = v_doc) THEN
      RAISE EXCEPTION 'that document is not on this application' USING ERRCODE = '22023';
    END IF;
    IF v_action = 'ACCEPT_DOC' THEN
      UPDATE application_document_requirements SET status = 'ACCEPTED', reason = NULL, updated_at = now()
      WHERE application_id = v_app.id AND doc_type = v_doc AND status = 'RECEIVED';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'only a received document can be accepted' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_reason IS NULL OR length(v_reason) < 5 THEN
        RAISE EXCEPTION 'tell the customer what is wrong with the document' USING ERRCODE = '22023';
      END IF;
      UPDATE application_document_requirements SET status = 'REUPLOAD', reason = left(v_reason, 300), updated_at = now()
      WHERE application_id = v_app.id AND doc_type = v_doc;
    END IF;

  ELSIF v_action = 'DOCS_VERIFIED' THEN
    PERFORM fn_require_permission('app.evaluate');
    IF v_app.status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'the documents were already checked' USING ERRCODE = '22023';
    END IF;
    SELECT string_agg(t.name, ', ' ORDER BY t.sort_order) INTO v_missing
    FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
    WHERE r.application_id = v_app.id AND r.required = 'ALWAYS' AND r.status NOT IN ('ACCEPTED', 'WAIVED');
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'accept these first: %', v_missing USING ERRCODE = '22023';
    END IF;
    UPDATE applications SET status = 'UNDER_ASSESSMENT', assigned_officer_id = coalesce(assigned_officer_id, v_staff) WHERE id = v_app.id;
    INSERT INTO application_stage_events (application_id, stage, note) VALUES
      (v_app.id, 'DOCS_VERIFIED', 'Documents checked'),
      (v_app.id, 'CREDIT_CHECK', 'Credit assessment started');

  ELSIF v_action = 'DECIDE' THEN
    PERFORM fn_require_permission('app.decide');
    IF v_app.status NOT IN ('UNDER_ASSESSMENT', 'UNDER_REVIEW') THEN
      RAISE EXCEPTION 'decide after the documents are checked' USING ERRCODE = '22023';
    END IF;
    IF v_decision NOT IN ('APPROVE', 'REFER', 'REJECT') THEN
      RAISE EXCEPTION 'choose approve, refer or reject' USING ERRCODE = '22023';
    END IF;
    IF v_decision <> 'APPROVE' AND (v_reason IS NULL OR length(v_reason) < 10) THEN
      RAISE EXCEPTION 'write the reason (at least a sentence)' USING ERRCODE = '22023';
    END IF;
    IF v_decision = 'APPROVE' AND v_app.approval_stage = 'FINAL'
       AND NOT EXISTS (SELECT 1 FROM application_document_requirements
                       WHERE application_id = v_app.id AND doc_type = 'QUOTE' AND status IN ('RECEIVED', 'ACCEPTED')) THEN
      RAISE EXCEPTION 'final approval needs the dealer''s quotation' USING ERRCODE = '22023';
    END IF;
    -- The loan lives on the quotation for customer applications; the shared
    -- decision function (018) reads it from the application.
    UPDATE applications a
    SET loan_amount_requested = coalesce(a.loan_amount_requested, q.loan_amount_requested),
        tenure_months = coalesce(a.tenure_months, q.tenure_months)
    FROM vehicle_quotations q WHERE q.application_id = a.id AND a.id = v_app.id;
    -- With a policy-engine recommendation, the same decision path as staff-created
    -- applications (credit_decisions, overrides). Without one (no bureau pull yet
    -- for customer applications, reconcile list R21) the decision is recorded here.
    IF EXISTS (SELECT 1 FROM recommendations WHERE application_id = v_app.id) THEN
      PERFORM fn_officer_decision(p_application_id, CASE v_decision WHEN 'REFER' THEN 'MAYBE' ELSE v_decision END, v_reason);
    ELSE
      UPDATE applications
      SET status = CASE v_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'UNDER_REVIEW' END,
          final_decision_at = now()
      WHERE id = v_app.id;
    END IF;
    IF v_decision = 'REFER' THEN
      UPDATE applications SET final_decision_at = NULL WHERE id = v_app.id;
    ELSE
      INSERT INTO application_stage_events (application_id, stage, note)
      VALUES (v_app.id, 'DECISION', CASE WHEN v_decision = 'REJECT' THEN 'Not approved'
                                         WHEN v_app.approval_stage = 'IN_PRINCIPLE' THEN 'Approved in principle'
                                         ELSE 'Approved' END);
    END IF;

  ELSIF v_action = 'MOVE_TO_FINAL' THEN
    PERFORM fn_require_permission('app.evaluate');
    IF NOT (v_app.status = 'APPROVED' AND v_app.approval_stage = 'IN_PRINCIPLE') THEN
      RAISE EXCEPTION 'only an in-principle approval moves to final' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM application_document_requirements
                   WHERE application_id = v_app.id AND doc_type = 'QUOTE' AND status IN ('RECEIVED', 'ACCEPTED')) THEN
      RAISE EXCEPTION 'the customer has not sent the dealer''s quotation yet' USING ERRCODE = '22023';
    END IF;
    UPDATE applications SET status = 'UNDER_ASSESSMENT', approval_stage = 'FINAL', final_decision_at = NULL WHERE id = v_app.id;
    INSERT INTO application_stage_events (application_id, stage, note) VALUES (v_app.id, 'CREDIT_CHECK', 'Final check with the quotation');

  ELSIF v_action = 'NOTE' THEN
    PERFORM fn_require_any_permission(ARRAY['app.evaluate', 'app.decide']);
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'write the note' USING ERRCODE = '22023';
    END IF;

  ELSE
    RAISE EXCEPTION 'unknown action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (v_app.id, 'OFFICER_' || v_action,
          jsonb_strip_nulls(jsonb_build_object('doc_type', v_doc, 'decision', nullif(v_decision, ''), 'note', v_reason,
                                               'from_status', v_app.status)),
          'USER', v_staff);

  RETURN jsonb_build_object('application_id', p_application_id,
                            'status', (SELECT status FROM applications WHERE id = v_app.id),
                            'approval_stage', (SELECT approval_stage FROM applications WHERE id = v_app.id));
END;
$$;

REVOKE ALL ON FUNCTION fn_after_approval_data(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_open_uuid(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_after_approval(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_after_approval(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_after_approval(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_after_approval(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_issue_offer(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_issue_offer(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_accept_offer(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_accept_offer(TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_sign_agreement(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_sign_agreement(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_set_mandate(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_set_mandate(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_disburse(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_disburse(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_track() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_track() TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_can_upload(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_can_upload(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_action(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_action(TEXT, TEXT, JSONB) TO authenticated;

-- Checks after running:
-- SELECT code, upload_type, storage_folder FROM document_types WHERE code IN ('MARGIN_RECEIPT', 'VEHICLE_INVOICE', 'INSURANCE', 'RC');
