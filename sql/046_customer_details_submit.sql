-- cercit — customer onboarding, part 4: details, submit, tracking (28 Sep 2026)
--
--   * Step 4 in three groups: personal, address, work. Each is pre-filled from
--     what the document readers found, and the customer confirms it. What we
--     showed and what they confirmed are both kept, with the fields they
--     changed listed (a signal for the manual-edit checks).
--   * If the current address differs from Aadhaar, the electricity bill
--     becomes needed on this application; if rented, the owner's name and
--     mobile are asked.
--   * Submit needs every group confirmed, every needed document in, the bureau
--     consent, and an email code entered in the last 15 minutes.
--   * Tracking: the customer's own applications with their stages.
--   * Returning customers: the continue-link service (AWS) finds a draft by
--     mobile through a blind index (mobile_hash), the same way PAN is found.
--   * Face match results (live photo against the PAN and Aadhaar photos) are
--     recorded by the upload service for staff to see.
--
-- Run order: after 045. Safe to re-run.

-- =============================================================================
-- 1. Columns and tables
-- =============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS father_name       VARCHAR(120);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marital_status    VARCHAR(12);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS designation       VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_joining   DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS employer_category VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile_hash       TEXT;

ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS years_at_address SMALLINT;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS residence_type   VARCHAR(10);   -- OWNED / RENTED / FAMILY / COMPANY
CREATE UNIQUE INDEX IF NOT EXISTS uk_customer_addresses_type ON customer_addresses (customer_id, address_type);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS customer_submitted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS application_detail_groups (
  application_id  UUID          NOT NULL,
  group_code      VARCHAR(12)   NOT NULL,     -- PERSONAL / ADDRESS / EMPLOYMENT
  prefilled       JSONB         NOT NULL DEFAULT '{}'::jsonb,   -- what we showed, read from documents
  confirmed       JSONB         NOT NULL,                        -- what the customer confirmed
  edited_fields   TEXT[]        NOT NULL DEFAULT '{}',
  confirmed_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_application_detail_groups PRIMARY KEY (application_id, group_code),
  CONSTRAINT fk_application_detail_groups_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT ck_application_detail_groups_code CHECK (group_code IN ('PERSONAL', 'ADDRESS', 'EMPLOYMENT'))
);

-- What the customer sees on the tracking page. Staff steps add rows as they are built.
CREATE TABLE IF NOT EXISTS application_stage_events (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id  UUID          NOT NULL,
  stage           VARCHAR(20)   NOT NULL,     -- RECEIVED / DOCS_VERIFIED / CREDIT_CHECK / DECISION / SANCTION
  note            TEXT,
  at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_application_stage_events PRIMARY KEY (id),
  CONSTRAINT fk_application_stage_events_app FOREIGN KEY (application_id) REFERENCES applications(id)
);
CREATE INDEX IF NOT EXISTS idx_application_stage_events_app ON application_stage_events (application_id, at);

CREATE TABLE IF NOT EXISTS kyc_face_matches (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id  UUID          NOT NULL,
  doc_type        VARCHAR(20)   NOT NULL,     -- PAN / AADHAAR
  side            VARCHAR(6)    NOT NULL,
  similarity      DECIMAL(5,2),               -- 0–100 from the face-matching service; null when no face was found
  result          VARCHAR(12)   NOT NULL,     -- MATCH / REVIEW / MISMATCH / NO_FACE
  checked_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_kyc_face_matches PRIMARY KEY (id),
  CONSTRAINT fk_kyc_face_matches_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT ck_kyc_face_matches_result CHECK (result IN ('MATCH', 'REVIEW', 'MISMATCH', 'NO_FACE'))
);
CREATE INDEX IF NOT EXISTS idx_kyc_face_matches_app ON kyc_face_matches (application_id, checked_at DESC);

ALTER TABLE application_detail_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_stage_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_face_matches          ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON application_detail_groups, application_stage_events, kyc_face_matches FROM anon, authenticated;
GRANT SELECT ON application_detail_groups, application_stage_events, kyc_face_matches TO authenticated;
DROP POLICY IF EXISTS "staff_read" ON application_detail_groups;
CREATE POLICY "staff_read" ON application_detail_groups FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON application_stage_events;
CREATE POLICY "staff_read" ON application_stage_events FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read" ON kyc_face_matches;
CREATE POLICY "staff_read" ON kyc_face_matches FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

-- =============================================================================
-- 2. Mobile blind index (same scheme as PAN in 012)
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
    NEW.mobile_hash  := fn_pii_hash(regexp_replace(NEW.mobile, '\D', '', 'g'));
    NEW.mobile_last4 := right(btrim(NEW.mobile), 4);
  END IF;

  -- Always emptied, including for '' — 013 adds a CHECK that depends on this.
  NEW.pan_number := NULL;
  NEW.mobile := NULL;

  RETURN NEW;
END;
$$;

UPDATE customers SET mobile_hash = fn_pii_hash(regexp_replace(fn_pii_decrypt(mobile_enc), '\D', '', 'g'))
WHERE mobile_hash IS NULL AND mobile_enc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_mobile_hash ON customers (mobile_hash);

-- =============================================================================
-- 3. Helpers
-- =============================================================================

-- "s•••@gmail.com": enough for the owner to recognise, not enough to learn it.
CREATE OR REPLACE FUNCTION fn_mask_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_email IS NULL OR position('@' IN p_email) < 2 THEN NULL
              ELSE left(p_email, 1) || '•••' || substr(p_email, position('@' IN p_email)) END;
$$;

CREATE OR REPLACE FUNCTION fn_check_address(p JSONB, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'enter your % address', p_label USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p->>'line1', ''))) < 5 THEN
    RAISE EXCEPTION 'enter the house number and street for your % address', p_label USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p->>'city', ''))) < 2 THEN
    RAISE EXCEPTION 'enter the city for your % address', p_label USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM states WHERE code = p->>'state_code') THEN
    RAISE EXCEPTION 'choose the state for your % address', p_label USING ERRCODE = '22023';
  END IF;
  IF coalesce(p->>'pincode', '') !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'enter the 6-digit PIN code for your % address', p_label USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_upsert_customer_address(p_customer UUID, p_type TEXT, p JSONB, p_source TEXT,
                                                      p_rented BOOLEAN, p_residence TEXT, p_owner TEXT, p_owner_mobile TEXT, p_years SMALLINT)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO customer_addresses (customer_id, address_type, line1, line2, city, state_code, pincode, source,
                                  is_rented, residence_type, owner_name, owner_contact, years_at_address)
  VALUES (p_customer, p_type, left(btrim(p->>'line1'), 300), nullif(left(btrim(coalesce(p->>'line2', '')), 300), ''),
          left(initcap(btrim(p->>'city')), 100), p->>'state_code', p->>'pincode', p_source,
          p_rented, p_residence, p_owner, p_owner_mobile, p_years)
  ON CONFLICT (customer_id, address_type) DO UPDATE
  SET line1 = EXCLUDED.line1, line2 = EXCLUDED.line2, city = EXCLUDED.city, state_code = EXCLUDED.state_code,
      pincode = EXCLUDED.pincode, source = EXCLUDED.source, is_rented = EXCLUDED.is_rented,
      residence_type = EXCLUDED.residence_type, owner_name = EXCLUDED.owner_name,
      owner_contact = EXCLUDED.owner_contact, years_at_address = EXCLUDED.years_at_address, verified = false;
$$;

-- =============================================================================
-- 4. Step 4: read and save the three groups
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_details(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app      UUID := fn_customer_draft_uuid(p_application_id);
  v_customer UUID := fn_customer_me();
BEGIN
  RETURN jsonb_build_object(
    'groups', (SELECT coalesce(jsonb_object_agg(group_code, jsonb_build_object('values', confirmed, 'confirmed_at', confirmed_at)), '{}'::jsonb)
               FROM application_detail_groups WHERE application_id = v_app),
    'customer', (SELECT jsonb_build_object('full_name', full_name, 'email', email, 'pan_last4', pan_last4)
                 FROM customers WHERE id = v_customer),
    'states', (SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name) ORDER BY name) FROM states),
    'eb_bill', (SELECT jsonb_build_object('required', required, 'status', status)
                FROM application_document_requirements WHERE application_id = v_app AND doc_type = 'EB_BILL'));
END;
$$;

CREATE OR REPLACE FUNCTION fn_customer_save_details(p_application_id TEXT, p_group TEXT, p JSONB, p_prefilled JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app       UUID := fn_customer_draft_uuid(p_application_id);
  v_customer  UUID := fn_customer_me();
  v_group     TEXT := upper(coalesce(p_group, ''));
  v_saved     JSONB := p;
  v_shown     JSONB := coalesce(p_prefilled, '{}'::jsonb);
  v_dob       DATE;
  v_pan       TEXT;
  v_doj       DATE;
  v_salary    NUMERIC;
  v_same      BOOLEAN;
  v_res       TEXT;
  v_owner     TEXT;
  v_owner_mob TEXT;
  v_years     SMALLINT;
  v_edited    TEXT[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'nothing to save' USING ERRCODE = '22023';
  END IF;

  IF v_group = 'PERSONAL' THEN
    BEGIN
      v_dob := (p->>'dob')::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'enter your date of birth as on your PAN' USING ERRCODE = '22023';
    END;
    IF v_dob IS NULL OR v_dob > current_date - INTERVAL '18 years' OR v_dob < current_date - INTERVAL '75 years' THEN
      RAISE EXCEPTION 'check your date of birth: you must be between 18 and 75' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p->>'father_name', '') !~ '^[A-Za-z][A-Za-z .''-]{1,119}$' THEN
      RAISE EXCEPTION 'enter your father''s name as on your PAN' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p->>'gender', '') NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
      RAISE EXCEPTION 'choose your gender' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p->>'marital_status', '') NOT IN ('SINGLE', 'MARRIED', 'OTHER') THEN
      RAISE EXCEPTION 'choose your marital status' USING ERRCODE = '22023';
    END IF;
    v_pan := upper(regexp_replace(coalesce(p->>'pan', ''), '\s', '', 'g'));
    -- The PAN comes back masked once saved; the customer re-types it only to change it.
    IF v_pan ~ '^X{6}' THEN
      v_pan := NULL;
      IF (SELECT pan_hash FROM customers WHERE id = v_customer) IS NULL THEN
        RAISE EXCEPTION 'enter your PAN' USING ERRCODE = '22023';
      END IF;
    ELSIF v_pan !~ '^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$' THEN
      RAISE EXCEPTION 'enter your personal PAN: 10 characters, the 4th is P (e.g. ABCPE1234F)' USING ERRCODE = '22023';
    ELSIF EXISTS (SELECT 1 FROM customers WHERE pan_hash = fn_pii_hash(v_pan) AND id <> v_customer) THEN
      RAISE EXCEPTION 'this PAN is already on another cercit account; write to support@cercit.in and we''ll sort it out' USING ERRCODE = '23505';
    END IF;

    UPDATE customers
    SET date_of_birth = v_dob, age_at_application = extract(year FROM age(v_dob))::SMALLINT,
        father_name = initcap(btrim(p->>'father_name')), gender = p->>'gender', marital_status = p->>'marital_status',
        pan_number = coalesce(v_pan, pan_number)
    WHERE id = v_customer;
    -- The PAN never sits in plain text: the confirmed copy keeps the last 4 only.
    v_saved := jsonb_set(p, '{pan}', to_jsonb('XXXXXX' || (SELECT pan_last4 FROM customers WHERE id = v_customer)));
    IF v_shown ? 'pan' THEN
      v_shown := jsonb_set(v_shown, '{pan}', to_jsonb(CASE WHEN upper(v_shown->>'pan') = coalesce(v_pan, '') OR v_pan IS NULL
                                                           THEN v_saved->>'pan' ELSE 'XXXXXX' || right(v_shown->>'pan', 4) END));
    END IF;

  ELSIF v_group = 'ADDRESS' THEN
    PERFORM fn_check_address(p->'permanent', 'permanent');
    v_same := coalesce((p->>'current_same')::BOOLEAN, false);
    IF NOT v_same THEN
      PERFORM fn_check_address(p->'current', 'current');
    END IF;
    v_res := p->>'residence';
    IF coalesce(v_res, '') NOT IN ('OWNED', 'RENTED', 'FAMILY', 'COMPANY') THEN
      RAISE EXCEPTION 'tell us if your current home is owned, rented, family-owned or given by your company' USING ERRCODE = '22023';
    END IF;
    IF v_res = 'RENTED' THEN
      v_owner := nullif(btrim(coalesce(p->>'owner_name', '')), '');
      v_owner_mob := regexp_replace(coalesce(p->>'owner_mobile', ''), '\D', '', 'g');
      IF v_owner IS NULL OR v_owner !~ '^[A-Za-z][A-Za-z .''-]{1,119}$' THEN
        RAISE EXCEPTION 'enter the house owner''s name' USING ERRCODE = '22023';
      END IF;
      IF v_owner_mob !~ '^[6-9][0-9]{9}$' THEN
        RAISE EXCEPTION 'enter the house owner''s 10-digit mobile number' USING ERRCODE = '22023';
      END IF;
    END IF;
    BEGIN
      v_years := nullif(p->>'years_at_current', '')::SMALLINT;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'enter how many years you have lived at your current address' USING ERRCODE = '22023';
    END;
    IF v_years IS NULL OR v_years < 0 OR v_years > 80 THEN
      RAISE EXCEPTION 'enter how many years you have lived at your current address' USING ERRCODE = '22023';
    END IF;

    PERFORM fn_upsert_customer_address(v_customer, 'PERMANENT', p->'permanent',
                                       CASE WHEN v_shown ? 'permanent' THEN 'AADHAAR' ELSE 'TYPED' END,
                                       NULL, NULL, NULL, NULL, NULL);
    PERFORM fn_upsert_customer_address(v_customer, 'CURRENT', CASE WHEN v_same THEN p->'permanent' ELSE p->'current' END,
                                       CASE WHEN v_same AND v_shown ? 'permanent' THEN 'AADHAAR' ELSE 'TYPED' END,
                                       v_res = 'RENTED', v_res, initcap(v_owner), nullif(v_owner_mob, ''), v_years);
    -- The older single-address columns, still read by the staff screens.
    UPDATE customers c
    SET address_line1 = a.line1, address_line2 = a.line2, city = a.city, state_code = a.state_code, pincode = a.pincode
    FROM customer_addresses a WHERE a.customer_id = c.id AND a.address_type = 'CURRENT' AND c.id = v_customer;

    -- The electricity bill: needed when the current address is not the Aadhaar one.
    INSERT INTO application_document_requirements (application_id, doc_type, required, status, reason)
    VALUES (v_app, 'EB_BILL', CASE WHEN v_same THEN 'CONDITIONAL' ELSE 'ALWAYS' END,
            CASE WHEN v_same THEN 'NOT_NEEDED' ELSE 'MISSING' END,
            CASE WHEN v_same THEN NULL ELSE 'Needed: your current address is different from your Aadhaar address' END)
    ON CONFLICT (application_id, doc_type) DO UPDATE
    SET required = EXCLUDED.required,
        status = CASE WHEN application_document_requirements.status IN ('RECEIVED', 'ACCEPTED') THEN application_document_requirements.status
                      ELSE EXCLUDED.status END,
        reason = CASE WHEN application_document_requirements.status IN ('RECEIVED', 'ACCEPTED') THEN NULL ELSE EXCLUDED.reason END,
        updated_at = now();
    IF v_owner_mob IS NOT NULL THEN
      v_saved := jsonb_set(v_saved, '{owner_mobile}', to_jsonb(v_owner_mob));
    END IF;

  ELSIF v_group = 'EMPLOYMENT' THEN
    IF length(btrim(coalesce(p->>'employer_name', ''))) < 2 THEN
      RAISE EXCEPTION 'enter your employer''s name as on your salary slip' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p->>'employer_category', '') NOT IN ('PRIVATE_LTD', 'PUBLIC_LTD', 'MNC', 'GOVERNMENT', 'PSU', 'PARTNERSHIP', 'PROPRIETORSHIP', 'OTHER') THEN
      RAISE EXCEPTION 'choose the kind of company you work for' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_doj := (p->>'date_of_joining')::DATE;
      v_salary := (p->>'net_monthly_salary')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'check your joining date and monthly take-home pay' USING ERRCODE = '22023';
    END;
    IF v_doj IS NULL OR v_doj > current_date OR v_doj < DATE '1960-01-01' THEN
      RAISE EXCEPTION 'enter the date you joined this employer' USING ERRCODE = '22023';
    END IF;
    IF v_salary IS NULL OR v_salary < 5000 OR v_salary > 10000000 THEN
      RAISE EXCEPTION 'enter your monthly take-home pay in rupees, as on your salary slip' USING ERRCODE = '22023';
    END IF;
    UPDATE customers
    SET employer_name = left(btrim(p->>'employer_name'), 200), employment_type = 'SALARIED',
        employer_category = p->>'employer_category', designation = nullif(left(btrim(coalesce(p->>'designation', '')), 100), ''),
        date_of_joining = v_doj
    WHERE id = v_customer;
    UPDATE applications SET declared_net_salary = round(v_salary, 2) WHERE id = v_app;

  ELSE
    RAISE EXCEPTION 'unknown group' USING ERRCODE = '22023';
  END IF;

  -- Fields we pre-filled that the customer changed.
  SELECT coalesce(array_agg(e.key ORDER BY e.key), '{}') INTO v_edited
  FROM jsonb_each(v_shown) e
  WHERE e.value NOT IN ('null'::jsonb, '""'::jsonb) AND (v_saved -> e.key) IS DISTINCT FROM e.value;

  INSERT INTO application_detail_groups (application_id, group_code, prefilled, confirmed, edited_fields)
  VALUES (v_app, v_group, v_shown, v_saved, v_edited)
  ON CONFLICT (application_id, group_code) DO UPDATE
  SET prefilled = EXCLUDED.prefilled, confirmed = EXCLUDED.confirmed, edited_fields = EXCLUDED.edited_fields, confirmed_at = now();

  UPDATE applications SET onboarding_step = greatest(onboarding_step, 4) WHERE id = v_app;

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app, 'DETAILS_CONFIRMED', jsonb_build_object('group', v_group, 'edited', to_jsonb(v_edited)), 'CUSTOMER');

  RETURN jsonb_build_object('group', v_group, 'values', v_saved, 'edited', to_jsonb(v_edited));
END;
$$;

-- =============================================================================
-- 5. Submit
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_submit(p_application_id TEXT, p_bureau_consent_version TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app      UUID := fn_customer_draft_uuid(p_application_id);
  v_customer UUID := fn_customer_me();
  v_consent  consent_texts%ROWTYPE;
  v_missing  TEXT;
  v_fresh    BOOLEAN;
  v_quote    BOOLEAN;
BEGIN
  IF (SELECT count(*) FROM application_detail_groups WHERE application_id = v_app) < 3 THEN
    RAISE EXCEPTION 'confirm your personal, address and work details first' USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(t.name, ', ' ORDER BY t.sort_order) INTO v_missing
  FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
  WHERE r.application_id = v_app AND r.required = 'ALWAYS' AND r.status NOT IN ('RECEIVED', 'ACCEPTED', 'WAIVED');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'still needed: %', v_missing USING ERRCODE = '22023';
  END IF;

  -- The email code: the sign-in method list in the session token carries when
  -- the code was entered. It must be within the last 15 minutes.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) m
    WHERE m->>'method' IN ('otp', 'magiclink', 'email/signup')
      AND to_timestamp((m->>'timestamp')::BIGINT) > now() - INTERVAL '15 minutes')
  INTO v_fresh;
  IF NOT v_fresh THEN
    RAISE EXCEPTION 'confirm with the code we email you, then submit' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_consent FROM consent_texts
  WHERE purpose = 'BUREAU_PULL' AND version = p_bureau_consent_version AND is_current;
  IF v_consent.version IS NULL THEN
    RAISE EXCEPTION 'please accept the current credit bureau consent' USING ERRCODE = '22023';
  END IF;
  INSERT INTO customer_consents (customer_id, application_id, purpose, version, body_sha256, user_agent)
  VALUES (v_customer, v_app, v_consent.purpose, v_consent.version,
          encode(extensions.digest(v_consent.body, 'sha256'), 'hex'), left(p_user_agent, 300));

  -- Without the dealer's quotation the application goes for in-principle approval.
  v_quote := EXISTS (SELECT 1 FROM application_document_requirements
                     WHERE application_id = v_app AND doc_type = 'QUOTE' AND status IN ('RECEIVED', 'ACCEPTED'));
  UPDATE applications
  SET status = 'SUBMITTED', customer_submitted_at = now(), documents_submitted_at = coalesce(documents_submitted_at, now()),
      onboarding_step = 5, approval_stage = CASE WHEN v_quote THEN 'FINAL' ELSE 'IN_PRINCIPLE' END
  WHERE id = v_app;

  INSERT INTO application_stage_events (application_id, stage, note) VALUES (v_app, 'RECEIVED', 'Submitted by the customer');
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app, 'APPLICATION_SUBMITTED', jsonb_build_object('approval_stage', CASE WHEN v_quote THEN 'FINAL' ELSE 'IN_PRINCIPLE' END,
                                                             'bureau_consent', v_consent.version), 'CUSTOMER');

  RETURN jsonb_build_object('application_id', p_application_id, 'status', 'SUBMITTED',
                            'approval_stage', CASE WHEN v_quote THEN 'FINAL' ELSE 'IN_PRINCIPLE' END);
END;
$$;

-- =============================================================================
-- 6. Tracking
-- =============================================================================

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
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('stage', e.stage, 'at', e.at) ORDER BY e.at), '[]'::jsonb)
                   FROM application_stage_events e WHERE e.application_id = a.id),
        'attention', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'note', r.reason) ORDER BY t.sort_order), '[]'::jsonb)
                      FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                      WHERE r.application_id = a.id AND (r.status = 'REUPLOAD' OR (r.doc_type = 'QUOTE' AND r.status = 'MISSING')))
      ) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM applications a LEFT JOIN vehicle_quotations q ON q.application_id = a.id
      WHERE a.customer_id = v_customer AND a.status <> 'DRAFT'));
END;
$$;

-- =============================================================================
-- 7. Returning customers and face match (called by the AWS services only)
-- =============================================================================

-- The continue-link service asks: does this mobile have an application in progress?
CREATE OR REPLACE FUNCTION fn_customer_resume_lookup(p_mobile TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('email', c.email, 'email_masked', fn_mask_email(c.email),
                            'application_id', a.application_id, 'step', a.onboarding_step, 'started', a.created_at)
  FROM customers c JOIN applications a ON a.customer_id = c.id AND a.status = 'DRAFT'
  WHERE c.mobile_hash = fn_pii_hash(right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10))
  ORDER BY a.created_at DESC
  LIMIT 1;
$$;

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
END;
$$;

-- Staff: the latest face match per document for one application.
CREATE OR REPLACE FUNCTION fn_face_matches(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_active_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('doc_type', doc_type, 'side', side, 'similarity', similarity,
                                                      'result', result, 'checked_at', checked_at)), '[]'::jsonb)
          FROM (SELECT DISTINCT ON (f.doc_type) f.* FROM kyc_face_matches f JOIN applications a ON a.id = f.application_id
                WHERE a.application_id = p_application_id ORDER BY f.doc_type, f.checked_at DESC) x);
END;
$$;

REVOKE ALL ON FUNCTION fn_check_address(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_upsert_customer_address(UUID, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT, TEXT, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_details(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_details(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_save_details(TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_save_details(TEXT, TEXT, JSONB, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_submit(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_submit(TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_track() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_track() TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_resume_lookup(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_customer_resume_lookup(TEXT) TO service_role;
REVOKE ALL ON FUNCTION fn_record_face_match(TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_record_face_match(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
REVOKE ALL ON FUNCTION fn_face_matches(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_face_matches(TEXT) TO authenticated;

-- Checks after running:
-- SELECT count(*) FILTER (WHERE mobile_hash IS NULL) AS missing_hash FROM customers;   -- 0
