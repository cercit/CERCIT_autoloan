-- cercit — customer onboarding, part 2: document uploads (step 3)
--
-- The browser asks the upload service (AWS Lambda) for a one-time upload link,
-- puts the file straight into storage, then registers it here. The database
-- records only where the file is (backend + key), its hash and size — never the
-- file itself, and never a PDF password.
--
--   * fn_customer_can_upload: the Lambda asks this, with the customer's own
--     sign-in token, before handing out an upload link. Only the owner of a
--     draft application gets one.
--   * fn_customer_register_document: checks the storage key really sits in
--     this application's folder for this document type, so a customer cannot
--     claim someone else's file.
--   * a newer file for the same document and side replaces the older one
--     (kept, marked superseded) — nothing is deleted.
--   * a document with two sides is "received" only when both are in.
--
-- Storage is switchable (decision 27 Sep 2026: S3 while free, Supabase storage
-- as the backup): documents.storage_backend says which, the key layout is the
-- same in both.
--
-- Run order: after 043. Safe to re-run.

ALTER TABLE document_types ADD COLUMN IF NOT EXISTS upload_type    VARCHAR(20);
ALTER TABLE document_types ADD COLUMN IF NOT EXISTS storage_folder VARCHAR(60);

-- upload_type = the name the upload service knows; storage_folder = where files land.
-- The KYC, salary slip, Form 16 and bank folders trigger the document readers.
UPDATE document_types t SET upload_type = v.u, storage_folder = v.f
FROM (VALUES
  ('PAN',         'pan_card',       'uploads/kyc'),
  ('AADHAAR',     'aadhaar_card',   'uploads/kyc'),
  ('SALARY_SLIP', 'salary_slip',    'uploads/salary-slips'),
  ('FORM16_B',    'form16',         'uploads/form16'),
  ('BANK_STMT',   'bank_statement', 'uploads/bank-statements'),
  ('QUOTE',       'quote',          'uploads/other/quote'),
  ('EB_BILL',     'eb_bill',        'uploads/other/eb-bill'),
  ('COMPANY_ID',  'company_id',     'uploads/other/company-id'),
  ('LIVE_PHOTO',  'live_photo',     'uploads/other/live-photo')
) AS v(code, u, f)
WHERE t.code = v.code;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS superseded_at         TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS was_password_protected BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- 1. Asked by the upload service before it hands out an upload link
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_can_upload(p_application_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_customer_draft_uuid(p_application_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- =============================================================================
-- 2. Register an uploaded file
-- =============================================================================

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
  p_was_locked     BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     UUID := fn_customer_draft_uuid(p_application_id);
  v_type    document_types%ROWTYPE;
  v_side    TEXT := lower(coalesce(p_side, 'single'));
  v_doc     UUID;
  v_sides   INTEGER;
BEGIN
  SELECT * INTO v_type FROM document_types WHERE code = p_doc_type;
  IF v_type.code IS NULL OR v_type.storage_folder IS NULL THEN
    RAISE EXCEPTION 'unknown document type' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM application_document_requirements WHERE application_id = v_app AND doc_type = p_doc_type)
     AND v_type.required <> 'OPTIONAL' THEN
    RAISE EXCEPTION 'this document is not asked for on this application' USING ERRCODE = '22023';
  END IF;
  IF v_side NOT IN ('front', 'back', 'single') OR (v_type.sides = 2 AND v_side = 'single') OR (v_type.sides = 1 AND v_side <> 'single') THEN
    RAISE EXCEPTION 'wrong side for this document' USING ERRCODE = '22023';
  END IF;
  IF p_backend NOT IN ('s3', 'supabase', 'local') THEN
    RAISE EXCEPTION 'unknown storage' USING ERRCODE = '22023';
  END IF;
  -- The key must sit in this application's folder for this document type.
  IF p_storage_key IS NULL OR left(p_storage_key, length(v_type.storage_folder || '/' || p_application_id || '/'))
                              <> v_type.storage_folder || '/' || p_application_id || '/'
     OR p_storage_key LIKE '%..%' THEN
    RAISE EXCEPTION 'that file does not belong to this application' USING ERRCODE = '42501';
  END IF;
  IF p_mime_type <> ALL (v_type.allowed_mime) THEN
    RAISE EXCEPTION 'upload a PDF, JPG or PNG' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > v_type.max_mb::BIGINT * 1024 * 1024 THEN
    RAISE EXCEPTION 'the file must be under % MB', v_type.max_mb USING ERRCODE = '22023';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'file check failed; upload it again' USING ERRCODE = '22023';
  END IF;

  -- Salary slips and bank statements may come as several files; for everything
  -- else a new file replaces the old one for that side.
  IF p_doc_type NOT IN ('SALARY_SLIP', 'BANK_STMT') THEN
    UPDATE documents SET superseded_at = now()
    WHERE application_id = v_app AND doc_type = p_doc_type AND side = v_side AND superseded_at IS NULL;
  END IF;

  INSERT INTO documents (application_id, doc_type, file_name, file_path, file_hash, file_size_bytes, mime_type,
                         upload_status, storage_backend, storage_key, side, source, uploaded_by, was_password_protected)
  VALUES (v_app, p_doc_type, left(coalesce(nullif(trim(p_file_name), ''), 'document'), 255), p_storage_key, p_sha256,
          p_size_bytes, p_mime_type, 'UPLOADED', p_backend, p_storage_key, v_side, 'upload', 'customer', coalesce(p_was_locked, false))
  RETURNING id INTO v_doc;

  SELECT count(DISTINCT side) INTO v_sides FROM documents
  WHERE application_id = v_app AND doc_type = p_doc_type AND superseded_at IS NULL;

  INSERT INTO application_document_requirements (application_id, doc_type, required, status, reason)
  VALUES (v_app, p_doc_type, v_type.required,
          CASE WHEN v_sides >= v_type.sides THEN 'RECEIVED' ELSE 'MISSING' END,
          CASE WHEN v_sides < v_type.sides THEN 'Upload the other side too' END)
  ON CONFLICT (application_id, doc_type) DO UPDATE
  SET status = CASE WHEN v_sides >= v_type.sides THEN 'RECEIVED' ELSE 'MISSING' END,
      reason = CASE WHEN v_sides < v_type.sides THEN 'Upload the other side too' END,
      updated_at = now();

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app, 'DOCUMENT_UPLOADED',
          jsonb_build_object('doc_type', p_doc_type, 'side', v_side, 'document_id', v_doc, 'size', p_size_bytes, 'backend', p_backend),
          'CUSTOMER');

  RETURN jsonb_build_object('document_id', v_doc, 'status',
    (SELECT status FROM application_document_requirements WHERE application_id = v_app AND doc_type = p_doc_type));
END;
$$;

-- =============================================================================
-- 3. The resume view now lists the files on each checklist item
-- =============================================================================

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
                      'note', coalesce(r.reason, t.required_note), 'sides', t.sides,
                      'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('side', d.side, 'file_name', d.file_name,
                                                                             'size', d.file_size_bytes, 'uploaded_at', d.uploaded_at)
                                                          ORDER BY d.uploaded_at), '[]'::jsonb)
                                FROM documents d
                                WHERE d.application_id = v_app.id AND d.doc_type = r.doc_type AND d.superseded_at IS NULL)
                    ) ORDER BY t.sort_order), '[]'::jsonb)
                    FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                    WHERE r.application_id = v_app.id)
    ) END);
END;
$$;

-- Lets the customer's browser know the upload type and folder for each document.
CREATE OR REPLACE FUNCTION fn_document_upload_types()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(code, jsonb_build_object('upload_type', upload_type, 'folder', storage_folder,
                                                            'allowed_mime', to_jsonb(allowed_mime), 'max_mb', max_mb)), '{}'::jsonb)
  FROM document_types WHERE upload_type IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION fn_customer_can_upload(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_can_upload(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_current() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_current() TO authenticated;
REVOKE ALL ON FUNCTION fn_document_upload_types() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_document_upload_types() TO authenticated;

-- Checks after running:
-- SELECT code, upload_type, storage_folder FROM document_types ORDER BY sort_order;
