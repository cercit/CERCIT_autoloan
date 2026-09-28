-- cercit — keep real customers' data away from the public demo login (28 Sep 2026)
--
-- The "Try the demo" account (042, role demo_viewer) is shared on the login
-- page and has app.view.all, so it could open the customer-application
-- screens, read customer tables through the API, and (through the staff file
-- link) open a real customer's PAN and Aadhaar. Harmless while every record
-- was sample data; not once real people apply.
--
-- Rule from here: real customers' data (customer-journey applications, origin
-- CUSTOMER, and the customers who signed in to apply) is visible only to
-- staff holding pii.reveal: officers, managers, credit head, compliance,
-- admin. The demo account, the old viewer role and the policy manager keep
-- seeing sample and synthetic cases only.
--
--   * fn_sees_real_customers(): the one test, also called by the AWS
--     services before handing out a file link or extracted fields
--   * restrictive row policies on every table holding customer-journey data
--   * the staff read functions that bypass row security check it too
--   * the old Applications list no longer lists customer-journey applications
--     (they have their own queue; reconcile list R22)
--
-- Run order: after 049. Safe to re-run.

CREATE OR REPLACE FUNCTION fn_sees_real_customers()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_is_active_staff() AND fn_has_permission('pii.reveal');
$$;

CREATE OR REPLACE FUNCTION fn_is_customer_application(p_application UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM applications WHERE id = p_application AND origin = 'CUSTOMER');
$$;

REVOKE ALL ON FUNCTION fn_sees_real_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_sees_real_customers() TO authenticated;
REVOKE ALL ON FUNCTION fn_is_customer_application(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_is_customer_application(UUID) TO authenticated;

-- =============================================================================
-- 1. Row policies. Restrictive: they narrow whatever the permissive policies allow.
-- =============================================================================

DROP POLICY IF EXISTS "real_customers_need_pii" ON applications;
CREATE POLICY "real_customers_need_pii" ON applications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (origin <> 'CUSTOMER' OR fn_sees_real_customers());

DROP POLICY IF EXISTS "real_customers_need_pii" ON customers;
CREATE POLICY "real_customers_need_pii" ON customers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_id IS NULL OR fn_sees_real_customers());

DROP POLICY IF EXISTS "real_customers_need_pii" ON customer_addresses;
CREATE POLICY "real_customers_need_pii" ON customer_addresses AS RESTRICTIVE FOR SELECT TO authenticated
  USING (fn_sees_real_customers() OR NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.auth_user_id IS NOT NULL));

-- Every table keyed by application (uuid): the row is hidden when it belongs to a real customer's application.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents', 'application_document_requirements', 'vehicle_quotations', 'customer_consents',
                           'application_detail_groups', 'application_stage_events', 'kyc_face_matches', 'loan_offers',
                           'loan_agreements', 'repayment_mandates', 'audit_events', 'bureau_reports', 'income_assessments',
                           'recommendations', 'bank_statement_analyses', 'bank_transactions', 'credit_decisions', 'vehicles',
                           'document_extractions', 'obligation_details', 'loan_accounts', 'override_logs']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'application_id' AND data_type = 'uuid') THEN
      EXECUTE format('DROP POLICY IF EXISTS "real_customers_need_pii" ON %I', t);
      EXECUTE format('CREATE POLICY "real_customers_need_pii" ON %I AS RESTRICTIVE FOR SELECT TO authenticated '
                     'USING (application_id IS NULL OR fn_sees_real_customers() OR NOT fn_is_customer_application(application_id))', t);
    END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- 2. Staff read functions (they run with the owner's rights, so check themselves)
-- =============================================================================

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

CREATE OR REPLACE FUNCTION fn_staff_customer_case(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_c   customers%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  IF NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_c FROM customers WHERE id = v_app.customer_id;

  RETURN jsonb_build_object(
    'application', jsonb_build_object(
      'application_id', v_app.application_id, 'status', v_app.status, 'approval_stage', v_app.approval_stage,
      'submitted_at', v_app.customer_submitted_at, 'created_at', v_app.created_at, 'decided_at', v_app.final_decision_at,
      'declared_net_salary', v_app.declared_net_salary, 'quote_pending', v_app.quote_pending,
      'officer', (SELECT full_name FROM users WHERE id = v_app.assigned_officer_id),
      'assigned_to_me', v_app.assigned_officer_id IS NOT DISTINCT FROM fn_current_staff_id()),
    'customer', jsonb_build_object(
      'full_name', v_c.full_name, 'email', v_c.email,
      'mobile', fn_pii_mask(v_c.mobile_last4, 10), 'mobile_check', v_c.mobile_verification_method,
      'pan', fn_pii_mask(v_c.pan_last4, 10), 'dob', v_c.date_of_birth, 'age', v_c.age_at_application,
      'father_name', v_c.father_name, 'gender', v_c.gender, 'marital_status', v_c.marital_status,
      'employer_name', v_c.employer_name, 'employer_category', v_c.employer_category, 'designation', v_c.designation,
      'date_of_joining', v_c.date_of_joining),
    'addresses', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'type', address_type, 'line1', line1, 'line2', line2, 'city', city, 'state_code', state_code, 'pincode', pincode,
                    'source', source, 'residence', residence_type, 'owner_name', owner_name,
                    'owner_mobile', CASE WHEN owner_contact IS NULL THEN NULL ELSE fn_pii_mask(right(owner_contact, 4), 10) END,
                    'years', years_at_address) ORDER BY address_type DESC), '[]'::jsonb)
                  FROM customer_addresses WHERE customer_id = v_c.id),
    'groups', (SELECT coalesce(jsonb_object_agg(group_code, jsonb_build_object(
                 'prefilled', prefilled, 'confirmed', confirmed, 'edited', to_jsonb(edited_fields), 'confirmed_at', confirmed_at)), '{}'::jsonb)
               FROM application_detail_groups WHERE application_id = v_app.id),
    'vehicle', (SELECT to_jsonb(q) - 'id' - 'application_id' - 'document_id' - 'dealer_id' FROM vehicle_quotations q WHERE q.application_id = v_app.id),
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'doc_type', r.doc_type, 'name', t.name, 'required', r.required, 'status', r.status, 'reason', r.reason, 'sides', t.sides,
                    'files', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'side', d.side, 'file_name', d.file_name, 'size', d.file_size_bytes, 'mime', d.mime_type,
                                'key', d.storage_key, 'backend', d.storage_backend, 'uploaded_at', d.uploaded_at,
                                'was_locked', d.was_password_protected, 'unlocked', d.unlocked, 'masked', d.aadhaar_masked)
                                ORDER BY d.uploaded_at), '[]'::jsonb)
                              FROM documents d WHERE d.application_id = v_app.id AND d.doc_type = r.doc_type AND d.superseded_at IS NULL)
                  ) ORDER BY t.sort_order), '[]'::jsonb)
                  FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                  WHERE r.application_id = v_app.id),
    'face', (SELECT coalesce(jsonb_agg(jsonb_build_object('doc_type', doc_type, 'side', side, 'similarity', similarity,
                                                         'result', result, 'checked_at', checked_at)), '[]'::jsonb)
             FROM (SELECT DISTINCT ON (doc_type) * FROM kyc_face_matches WHERE application_id = v_app.id
                   ORDER BY doc_type, checked_at DESC) f),
    'consents', (SELECT coalesce(jsonb_agg(jsonb_build_object('purpose', purpose, 'version', version, 'given_at', given_at) ORDER BY given_at), '[]'::jsonb)
                 FROM customer_consents WHERE application_id = v_app.id),
    'stages', (SELECT coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'note', note, 'at', at) ORDER BY at), '[]'::jsonb)
               FROM application_stage_events WHERE application_id = v_app.id),
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', event_type, 'detail', event_detail, 'actor', actor_type,
                                                            'by', (SELECT full_name FROM users WHERE id = e.actor_id), 'at', created_at)
                                          ORDER BY created_at DESC), '[]'::jsonb)
                FROM (SELECT * FROM audit_events WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 60) e));
END;
$$;

CREATE OR REPLACE FUNCTION fn_staff_customer_checks(p_application_id TEXT)
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
  IF NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'bureau', (SELECT to_jsonb(b) - 'id' - 'application_id' - 'customer_id' FROM bureau_reports b WHERE application_id = v_app ORDER BY created_at DESC LIMIT 1),
    'bank', (SELECT to_jsonb(k) - 'id' - 'application_id' - 'customer_id' FROM bank_statement_analyses k WHERE application_id = v_app ORDER BY created_at DESC LIMIT 1),
    'income', (SELECT to_jsonb(i) - 'id' - 'application_id' FROM income_assessments i WHERE application_id = v_app ORDER BY created_at DESC LIMIT 1),
    'recommendation', (SELECT to_jsonb(r) - 'id' - 'application_id' FROM recommendations r WHERE application_id = v_app ORDER BY generated_at DESC LIMIT 1),
    'declared_existing_emis', (SELECT declared_existing_emis FROM applications WHERE id = v_app));
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
  IF NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN fn_after_approval_data(v_app);
END;
$$;

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
  IF NOT fn_sees_real_customers() THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('doc_type', doc_type, 'side', side, 'similarity', similarity,
                                                      'result', result, 'checked_at', checked_at)), '[]'::jsonb)
          FROM (SELECT DISTINCT ON (f.doc_type) f.* FROM kyc_face_matches f JOIN applications a ON a.id = f.application_id
                WHERE a.application_id = p_application_id ORDER BY f.doc_type, f.checked_at DESC) x);
END;
$$;

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Narrowing "own" and "team" to the caller's cases comes with the Admin
  -- module's scopes; for now any view permission sees the list, as today.
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);

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
  -- Customer-journey applications have their own queue and screens (047, 050).
  WHERE a.origin <> 'CUSTOMER'
  ORDER BY a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_customer_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_queue(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_case(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_case(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_checks(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_checks(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_after_approval(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_after_approval(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_face_matches(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_face_matches(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_list_applications() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_list_applications() TO authenticated;

-- Checks after running (signed in as the demo account these return nothing):
-- SELECT fn_sees_real_customers();
