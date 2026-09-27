-- cercit — the staff side of customer applications (28 Sep 2026)
--
-- A customer application, once submitted, lands in the officer's queue. The
-- officer sees what the customer confirmed next to what the documents said,
-- every file, the face match and the changes the customer made; accepts or
-- asks again for documents; moves the case to the credit check; and records
-- the decision. Each step the customer should know about is added to
-- application_stage_events, which their tracking page reads.
--
-- A customer can upload again after submitting, but only a document the
-- officer asked for again, or the dealer's quotation for final approval.
--
-- Run order: after 046. Safe to re-run.

-- =============================================================================
-- 1. Which applications came from the customer journey
-- =============================================================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS origin VARCHAR(10) NOT NULL DEFAULT 'STAFF';   -- STAFF / CUSTOMER

-- Only the customer journey creates document checklists.
UPDATE applications a SET origin = 'CUSTOMER'
WHERE origin <> 'CUSTOMER' AND EXISTS (SELECT 1 FROM application_document_requirements r WHERE r.application_id = a.id);

CREATE OR REPLACE FUNCTION trg_requirements_mark_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE applications SET origin = 'CUSTOMER' WHERE id = NEW.application_id AND origin <> 'CUSTOMER';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requirements_mark_customer ON application_document_requirements;
CREATE TRIGGER trg_requirements_mark_customer
  AFTER INSERT ON application_document_requirements
  FOR EACH ROW EXECUTE FUNCTION trg_requirements_mark_customer();

CREATE INDEX IF NOT EXISTS idx_applications_origin_status ON applications (origin, status);

-- =============================================================================
-- 2. Customer uploads after submitting
-- =============================================================================

-- The customer's own application, open for this document: a draft, or a
-- submitted one where the officer asked for this document again, or the
-- quotation is still to come. Anything else reads as "not found".
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
       OR (v_app.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW', 'APPROVED')
           AND EXISTS (SELECT 1 FROM application_document_requirements r
                       WHERE r.application_id = v_app.id
                         AND (p_doc_type IS NULL OR r.doc_type = p_doc_type)
                         AND (r.status = 'REUPLOAD' OR (r.doc_type = 'QUOTE' AND r.status = 'MISSING'))))) THEN
    RETURN v_app.id;
  END IF;
  RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
END;
$$;

CREATE OR REPLACE FUNCTION fn_customer_can_upload(p_application_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_customer_open_uuid(p_application_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Same as 045 except for the first line: a submitted application is open for
-- a document the officer asked for again.
CREATE OR REPLACE FUNCTION fn_customer_register_document(
  p_application_id TEXT,
  p_doc_type       TEXT,
  p_side           TEXT,
  p_storage_key    TEXT,
  p_file_name      TEXT,
  p_mime_type      TEXT,
  p_size_bytes     BIGINT,
  p_sha256         TEXT,
  p_backend        TEXT DEFAULT 's3',
  p_was_locked     BOOLEAN DEFAULT false,
  p_unlocked       BOOLEAN DEFAULT false,
  p_masked         BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     UUID := fn_customer_open_uuid(p_application_id, p_doc_type);
  v_type    document_types%ROWTYPE;
  v_side    TEXT := lower(coalesce(p_side, 'single'));
  v_doc     UUID;
  v_single  BOOLEAN;
  v_front   BOOLEAN;
  v_back    BOOLEAN;
  v_done    BOOLEAN;
  v_reason  TEXT;
BEGIN
  SELECT * INTO v_type FROM document_types WHERE code = p_doc_type;
  IF v_type.code IS NULL OR v_type.storage_folder IS NULL THEN
    RAISE EXCEPTION 'unknown document type' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM application_document_requirements WHERE application_id = v_app AND doc_type = p_doc_type)
     AND v_type.required <> 'OPTIONAL' THEN
    RAISE EXCEPTION 'this document is not asked for on this application' USING ERRCODE = '22023';
  END IF;
  IF v_side NOT IN ('front', 'back', 'single') OR (v_type.sides = 1 AND v_side <> 'single') THEN
    RAISE EXCEPTION 'wrong side for this document' USING ERRCODE = '22023';
  END IF;
  IF p_backend NOT IN ('s3', 'supabase', 'local') THEN
    RAISE EXCEPTION 'unknown storage' USING ERRCODE = '22023';
  END IF;
  IF p_storage_key IS NULL OR left(p_storage_key, length(v_type.storage_folder || '/' || p_application_id || '/'))
                              <> v_type.storage_folder || '/' || p_application_id || '/'
     OR p_storage_key LIKE '%..%' THEN
    RAISE EXCEPTION 'that file does not belong to this application' USING ERRCODE = '42501';
  END IF;
  IF p_mime_type <> ALL (v_type.allowed_mime) THEN
    RAISE EXCEPTION '%', CASE WHEN v_type.allowed_mime = ARRAY['image/jpeg'] THEN 'take the photo with the camera'
                              ELSE 'upload a PDF, JPG or PNG' END USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > v_type.max_mb::BIGINT * 1024 * 1024 THEN
    RAISE EXCEPTION 'the file must be under % MB', v_type.max_mb USING ERRCODE = '22023';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'file check failed; upload it again' USING ERRCODE = '22023';
  END IF;

  IF NOT v_type.multi_file THEN
    UPDATE documents SET superseded_at = now()
    WHERE application_id = v_app AND doc_type = p_doc_type AND superseded_at IS NULL
      AND (side = v_side OR (v_side = 'single') <> (side = 'single'));
  END IF;

  INSERT INTO documents (application_id, doc_type, file_name, file_path, file_hash, file_size_bytes, mime_type,
                         upload_status, storage_backend, storage_key, side, source, uploaded_by,
                         was_password_protected, unlocked, aadhaar_masked)
  VALUES (v_app, p_doc_type, left(coalesce(nullif(trim(p_file_name), ''), 'document'), 255), p_storage_key, p_sha256,
          p_size_bytes, p_mime_type, 'UPLOADED', p_backend, p_storage_key, v_side,
          CASE WHEN p_doc_type = 'LIVE_PHOTO' THEN 'camera' ELSE 'upload' END, 'customer',
          coalesce(p_was_locked, false), coalesce(p_unlocked, false), coalesce(p_masked, false))
  RETURNING id INTO v_doc;

  SELECT bool_or(side = 'single'), bool_or(side = 'front'), bool_or(side = 'back')
  INTO v_single, v_front, v_back
  FROM documents WHERE application_id = v_app AND doc_type = p_doc_type AND superseded_at IS NULL;

  v_done := CASE WHEN v_type.sides = 1 THEN coalesce(v_single, false)
                 ELSE coalesce(v_single, false) OR (coalesce(v_front, false) AND (coalesce(v_back, false) OR NOT v_type.back_required)) END;
  v_reason := CASE WHEN v_done THEN NULL
                   WHEN coalesce(v_front, false) THEN 'Upload the back too'
                   ELSE 'Upload the front too' END;
  IF coalesce(p_was_locked, false) AND NOT coalesce(p_unlocked, false) THEN
    v_reason := 'We could not open the locked PDF; upload an unlocked copy or give the password';
    v_done := false;
  END IF;

  INSERT INTO application_document_requirements (application_id, doc_type, required, status, reason)
  VALUES (v_app, p_doc_type, v_type.required, CASE WHEN v_done THEN 'RECEIVED' ELSE 'MISSING' END, v_reason)
  ON CONFLICT (application_id, doc_type) DO UPDATE
  SET status = CASE WHEN v_done THEN 'RECEIVED'
                    WHEN application_document_requirements.status = 'REUPLOAD' THEN 'REUPLOAD' ELSE 'MISSING' END,
      reason = CASE WHEN v_done THEN NULL ELSE coalesce(v_reason, application_document_requirements.reason) END,
      updated_at = now();

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app, 'DOCUMENT_UPLOADED',
          jsonb_build_object('doc_type', p_doc_type, 'side', v_side, 'document_id', v_doc, 'size', p_size_bytes,
                             'backend', p_backend, 'unlocked', coalesce(p_unlocked, false), 'masked', coalesce(p_masked, false),
                             'after_submit', (SELECT status <> 'DRAFT' FROM applications WHERE id = v_app)),
          'CUSTOMER');

  RETURN jsonb_build_object('document_id', v_doc, 'status',
    (SELECT status FROM application_document_requirements WHERE application_id = v_app AND doc_type = p_doc_type));
END;
$$;

-- Tracking (046) now gives what the upload box needs for each item waiting on the customer.
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
        'attention', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'doc_type', r.doc_type, 'name', t.name, 'note', r.reason, 'status', r.status, 'required', r.required,
                          'sides', t.sides, 'back_required', t.back_required, 'multi_file', t.multi_file, 'ask_password', t.ask_password,
                          'files', '[]'::jsonb) ORDER BY t.sort_order), '[]'::jsonb)
                      FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                      WHERE r.application_id = a.id AND a.status NOT IN ('REJECTED', 'WITHDRAWN', 'CANCELLED')
                        AND (r.status = 'REUPLOAD' OR (r.doc_type = 'QUOTE' AND r.status = 'MISSING')))
      ) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM applications a LEFT JOIN vehicle_quotations q ON q.application_id = a.id
      WHERE a.customer_id = v_customer AND a.status <> 'DRAFT'));
END;
$$;

-- =============================================================================
-- 3. The officer's queue
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

-- =============================================================================
-- 4. One case, everything the officer needs
-- =============================================================================

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

-- =============================================================================
-- 5. What the officer does
-- =============================================================================
--   ASSIGN_TO_ME                         take the case
--   ACCEPT_DOC   {doc_type}              the file is fine
--   REQUEST_DOC  {doc_type, reason}      ask the customer again (they see the reason)
--   DOCS_VERIFIED                        every needed document accepted: on to the credit check
--   DECIDE       {decision, note}        APPROVE / REFER / REJECT (app.decide)
--   MOVE_TO_FINAL                        in-principle approved and the quotation is in: final check
--   NOTE         {note}                  internal note

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

REVOKE ALL ON FUNCTION fn_customer_open_uuid(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_can_upload(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_can_upload(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_track() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_track() TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_queue(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_case(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_case(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_action(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_action(TEXT, TEXT, JSONB) TO authenticated;

-- Checks after running:
-- SELECT origin, status, count(*) FROM applications GROUP BY 1, 2 ORDER BY 1, 2;
