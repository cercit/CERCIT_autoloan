-- cercit — customer onboarding, part 3: how documents are captured (28 Sep 2026)
--
-- Changes asked for after step 3 went live:
--   * a live photo comes first (matched later against the PAN and Aadhaar photos)
--   * PAN and Aadhaar can come as a card photo (front + back) or as one
--     downloaded PDF (DigiLocker, e-Aadhaar); the back of the PAN is optional
--   * password-locked salary slips, bank statements, e-Aadhaar and ITR-V: the
--     customer types the password, the upload service uses it once to open the
--     file and saves an unlocked copy. The password is never stored.
--   * Aadhaar with the full number is masked (first 8 digits blacked out) by the
--     upload service before the file is kept (RBI KYC Master Direction, as
--     amended 29 May 2019).
--   * ITR acknowledgements, optional, several files allowed
--
-- Customers now upload into incoming/<application>/ only; the finalise step
-- (AWS Lambda cercit-document-finalize) unlocks and masks, moves the file into
-- its folder and registers it here with the customer's own sign-in.
--
-- Run order: after 044. Safe to re-run.

ALTER TABLE document_types ADD COLUMN IF NOT EXISTS back_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE document_types ADD COLUMN IF NOT EXISTS multi_file    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE document_types ADD COLUMN IF NOT EXISTS ask_password  BOOLEAN NOT NULL DEFAULT false;

INSERT INTO document_types (code, name, required, required_note, sides, sources, allowed_mime, sort_order)
VALUES ('ITR', 'Income tax returns (ITR-V)', 'OPTIONAL', 'If you file returns: the last 2 years', 1, ARRAY['upload'],
        ARRAY['application/pdf', 'image/jpeg', 'image/png'], 75)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, required_note = EXCLUDED.required_note, sort_order = EXCLUDED.sort_order;

-- The live photo is now asked for on every application, taken first.
UPDATE document_types SET required = 'ALWAYS', required_note = NULL, sort_order = 5,
                          allowed_mime = ARRAY['image/jpeg'], max_mb = 5
WHERE code = 'LIVE_PHOTO';

UPDATE document_types SET back_required = (code <> 'PAN' AND code <> 'COMPANY_ID') WHERE sides = 2;
UPDATE document_types SET multi_file   = code IN ('SALARY_SLIP', 'BANK_STMT', 'ITR');
UPDATE document_types SET ask_password = code IN ('SALARY_SLIP', 'BANK_STMT', 'AADHAAR', 'ITR');
UPDATE document_types SET upload_type = 'itr', storage_folder = 'uploads/other/itr' WHERE code = 'ITR';

-- Drafts already open get the live photo on their checklist.
INSERT INTO application_document_requirements (application_id, doc_type, required)
SELECT a.id, 'LIVE_PHOTO', 'ALWAYS' FROM applications a WHERE a.status = 'DRAFT'
ON CONFLICT (application_id, doc_type) DO NOTHING;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS aadhaar_masked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS unlocked       BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- Register a file (replaces the 044 version; two new flags from the finalise step)
-- =============================================================================

DROP FUNCTION IF EXISTS fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN);

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
  v_app     UUID := fn_customer_draft_uuid(p_application_id);
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
  -- A two-sided card may also come as one downloaded PDF ("single").
  IF v_side NOT IN ('front', 'back', 'single') OR (v_type.sides = 1 AND v_side <> 'single') THEN
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
    RAISE EXCEPTION '%', CASE WHEN v_type.allowed_mime = ARRAY['image/jpeg'] THEN 'take the photo with the camera'
                              ELSE 'upload a PDF, JPG or PNG' END USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > v_type.max_mb::BIGINT * 1024 * 1024 THEN
    RAISE EXCEPTION 'the file must be under % MB', v_type.max_mb USING ERRCODE = '22023';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'file check failed; upload it again' USING ERRCODE = '22023';
  END IF;

  -- A new file replaces the old one for that side; a downloaded PDF replaces the
  -- card photos and the other way round. Multi-file documents keep every file.
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
  -- A locked file we could not open still needs an unlocked copy.
  IF coalesce(p_was_locked, false) AND NOT coalesce(p_unlocked, false) THEN
    v_reason := 'We could not open the locked PDF; upload an unlocked copy or give the password';
    v_done := false;
  END IF;

  INSERT INTO application_document_requirements (application_id, doc_type, required, status, reason)
  VALUES (v_app, p_doc_type, v_type.required, CASE WHEN v_done THEN 'RECEIVED' ELSE 'MISSING' END, v_reason)
  ON CONFLICT (application_id, doc_type) DO UPDATE
  SET status = CASE WHEN v_done THEN 'RECEIVED' ELSE 'MISSING' END, reason = v_reason, updated_at = now();

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (v_app, 'DOCUMENT_UPLOADED',
          jsonb_build_object('doc_type', p_doc_type, 'side', v_side, 'document_id', v_doc, 'size', p_size_bytes,
                             'backend', p_backend, 'unlocked', coalesce(p_unlocked, false), 'masked', coalesce(p_masked, false)),
          'CUSTOMER');

  RETURN jsonb_build_object('document_id', v_doc, 'status',
    (SELECT status FROM application_document_requirements WHERE application_id = v_app AND doc_type = p_doc_type));
END;
$$;

-- =============================================================================
-- The resume view carries how each document may be captured
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
                      'back_required', t.back_required, 'multi_file', t.multi_file, 'ask_password', t.ask_password,
                      'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('side', d.side, 'file_name', d.file_name,
                                                                             'size', d.file_size_bytes, 'uploaded_at', d.uploaded_at,
                                                                             'unlocked', d.unlocked, 'masked', d.aadhaar_masked)
                                                          ORDER BY d.uploaded_at), '[]'::jsonb)
                                FROM documents d
                                WHERE d.application_id = v_app.id AND d.doc_type = r.doc_type AND d.superseded_at IS NULL)
                    ) ORDER BY t.sort_order), '[]'::jsonb)
                    FROM application_document_requirements r JOIN document_types t ON t.code = r.doc_type
                    WHERE r.application_id = v_app.id)
    ) END);
END;
$$;

-- Every uploadable type, with what the upload screen needs to draw it
-- (optional ones like the company ID and ITR are not on the checklist until used).
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
           'back_required', back_required, 'multi_file', multi_file, 'ask_password', ask_password)), '{}'::jsonb)
  FROM document_types WHERE upload_type IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_register_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION fn_customer_current() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_customer_current() TO authenticated;
REVOKE ALL ON FUNCTION fn_document_upload_types() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_document_upload_types() TO authenticated;

-- Checks after running:
-- SELECT code, required, sides, back_required, multi_file, ask_password, storage_folder FROM document_types ORDER BY sort_order;
