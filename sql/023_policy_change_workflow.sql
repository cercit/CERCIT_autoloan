-- cercit — the policy change workflow (backlog CC1.1, CC1.2)
--
-- Four steps, each a function with its own permission check, so a policy change
-- follows the same path every time and leaves a record:
--
--   propose  -> fn_policy_submit    (policy.author)   DRAFT -> PENDING_APPROVAL
--   withdraw -> fn_policy_withdraw  (policy.author)   PENDING_APPROVAL -> DRAFT
--   approve  -> fn_policy_approve   (policy.approve)  PENDING_APPROVAL -> APPROVED, with a start date
--   reject   -> fn_policy_reject    (policy.approve)  PENDING_APPROVAL -> REJECTED
--
-- and one job:
--   fn_policy_activate_due  — makes approved versions live on their date and
--                             closes the version they replace (CC1.2)
--
-- Nobody approves their own change. The database enforces that in three places:
-- the check constraint in 016, the review trigger in 016, and here, where the
-- approver is read from the login rather than passed in.
--
-- Run order: after 022. Safe to re-run.

-- =============================================================================
-- 1. Propose
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_submit(
  p_version_id UUID,
  p_title      VARCHAR(200),
  p_summary    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_version policy_versions%ROWTYPE;
  v_request UUID;
BEGIN
  v_actor := fn_require_permission('policy.author');

  SELECT * INTO v_version FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'policy version % is %, only a draft can be proposed', v_version.version_code, v_version.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM policy_documents WHERE policy_version_id = p_version_id) THEN
    RAISE EXCEPTION 'policy version % has no rules to review', v_version.version_code;
  END IF;

  -- A draft written straight into the database (such as 021) has no author yet;
  -- whoever proposes it owns it, and can then never approve it.
  UPDATE policy_versions
  SET status       = 'PENDING_APPROVAL',
      submitted_at = now(),
      authored_by  = COALESCE(authored_by, v_actor),
      updated_at   = now()
  WHERE id = p_version_id;

  INSERT INTO policy_change_requests (policy_version_id, title, summary, requested_by)
  VALUES (p_version_id, p_title, p_summary, v_actor)
  RETURNING id INTO v_request;

  RETURN jsonb_build_object(
    'versionId', p_version_id,
    'versionCode', v_version.version_code,
    'status', 'PENDING_APPROVAL',
    'changeRequestId', v_request
  );
END;
$$;

-- =============================================================================
-- 2. Withdraw (back to the author's desk)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_withdraw(
  p_version_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_version policy_versions%ROWTYPE;
BEGIN
  v_actor := fn_require_permission('policy.author');

  SELECT * INTO v_version FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'policy version % is %, only one waiting for approval can be withdrawn', v_version.version_code, v_version.status;
  END IF;
  IF v_actor IS NOT NULL AND v_version.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'policy version % was proposed by someone else', v_version.version_code USING ERRCODE = '42501';
  END IF;

  UPDATE policy_versions
  SET status = 'DRAFT', submitted_at = NULL, updated_at = now()
  WHERE id = p_version_id;

  -- Reviews are for other people's opinions (016 refuses a review by the author),
  -- so a withdrawal is noted on the request itself.
  UPDATE policy_change_requests
  SET summary = concat_ws(chr(10), summary, 'Withdrawn ' || to_char(now(), 'DD Mon YYYY HH24:MI') ||
                                  CASE WHEN p_reason IS NULL THEN '' ELSE ': ' || p_reason END)
  WHERE id = (SELECT id FROM policy_change_requests WHERE policy_version_id = p_version_id ORDER BY created_at DESC LIMIT 1);

  RETURN jsonb_build_object('versionId', p_version_id, 'versionCode', v_version.version_code, 'status', 'DRAFT');
END;
$$;

-- =============================================================================
-- 3. Approve, with the date it starts
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_approve(
  p_version_id     UUID,
  p_effective_from TIMESTAMPTZ,
  p_comment        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_version policy_versions%ROWTYPE;
  v_live    policy_versions%ROWTYPE;
BEGIN
  v_actor := fn_require_permission('policy.approve');

  SELECT * INTO v_version FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'policy version % is %, only one waiting for approval can be approved', v_version.version_code, v_version.status;
  END IF;
  IF v_actor IS NOT NULL AND v_version.authored_by = v_actor THEN
    RAISE EXCEPTION 'policy version % was written by you; someone else must approve it', v_version.version_code USING ERRCODE = '42501';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'a start date is required';
  END IF;
  IF p_effective_from < now() THEN
    RAISE EXCEPTION 'a policy version cannot start in the past';
  END IF;

  SELECT * INTO v_live
  FROM policy_versions
  WHERE tenant_id = v_version.tenant_id AND product = v_version.product AND status = 'ACTIVE';

  IF v_live.id IS NOT NULL AND v_live.effective_from >= p_effective_from THEN
    RAISE EXCEPTION 'version % is already live from %; choose a later start date',
      v_live.version_code, to_char(v_live.effective_from, 'DD Mon YYYY HH24:MI');
  END IF;

  UPDATE policy_versions
  SET status         = 'APPROVED',
      approved_by     = v_actor,
      approved_at     = now(),
      effective_from  = p_effective_from,
      updated_at      = now()
  WHERE id = p_version_id;

  INSERT INTO policy_change_reviews (change_request_id, reviewer_id, decision, comment)
  SELECT id, v_actor, 'APPROVE', p_comment
  FROM policy_change_requests
  WHERE policy_version_id = p_version_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'versionId', p_version_id,
    'versionCode', v_version.version_code,
    'status', 'APPROVED',
    'effectiveFrom', p_effective_from
  );
END;
$$;

-- =============================================================================
-- 4. Reject
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_reject(
  p_version_id UUID,
  p_comment    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_version policy_versions%ROWTYPE;
BEGIN
  v_actor := fn_require_permission('policy.approve');

  IF p_comment IS NULL OR btrim(p_comment) = '' THEN
    RAISE EXCEPTION 'a reason is required when rejecting a policy change';
  END IF;

  SELECT * INTO v_version FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'policy version % is %, only one waiting for approval can be rejected', v_version.version_code, v_version.status;
  END IF;
  IF v_actor IS NOT NULL AND v_version.authored_by = v_actor THEN
    RAISE EXCEPTION 'policy version % was written by you; someone else must review it', v_version.version_code USING ERRCODE = '42501';
  END IF;

  UPDATE policy_versions SET status = 'REJECTED', updated_at = now() WHERE id = p_version_id;

  INSERT INTO policy_change_reviews (change_request_id, reviewer_id, decision, comment)
  SELECT id, v_actor, 'REJECT', p_comment
  FROM policy_change_requests
  WHERE policy_version_id = p_version_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object('versionId', p_version_id, 'versionCode', v_version.version_code, 'status', 'REJECTED');
END;
$$;

-- =============================================================================
-- 5. Make approved versions live on their date (CC1.2)
-- =============================================================================
-- Run on a schedule. Each version that has reached its start date replaces the
-- one in force: the old one is closed at exactly the moment the new one starts,
-- so the history has no gap and no overlap, and decisions made yesterday can
-- still be read against yesterday's rules.
CREATE OR REPLACE FUNCTION fn_policy_activate_due()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due      policy_versions%ROWTYPE;
  v_switched JSONB := '[]'::jsonb;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.approve', 'policy.emergency']);

  FOR v_due IN
    SELECT * FROM policy_versions
    WHERE status = 'APPROVED' AND effective_from <= now()
    ORDER BY effective_from
    FOR UPDATE
  LOOP
    UPDATE policy_versions
    SET status = 'SUPERSEDED', effective_to = v_due.effective_from, updated_at = now()
    WHERE tenant_id = v_due.tenant_id AND product = v_due.product AND status = 'ACTIVE';

    UPDATE policy_versions SET status = 'ACTIVE', updated_at = now() WHERE id = v_due.id;

    v_switched := v_switched || jsonb_build_object(
      'versionId', v_due.id, 'versionCode', v_due.version_code, 'effectiveFrom', v_due.effective_from
    );
  END LOOP;

  RETURN jsonb_build_object('activated', jsonb_array_length(v_switched), 'versions', v_switched);
END;
$$;

-- =============================================================================
-- 6. Reading the queue
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_pending()
RETURNS TABLE (
  version_id     UUID,
  version_code   VARCHAR,
  tier           VARCHAR,
  rationale      TEXT,
  title          VARCHAR,
  summary        TEXT,
  author         VARCHAR,
  submitted_at   TIMESTAMPTZ,
  mine           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := fn_require_any_permission(ARRAY['policy.view', 'policy.approve']);

  RETURN QUERY
  SELECT v.id, v.version_code, v.tier, v.rationale, r.title, r.summary,
         u.full_name::VARCHAR, v.submitted_at,
         v_actor IS NOT NULL AND v.authored_by = v_actor
  FROM policy_versions v
  LEFT JOIN LATERAL (
    SELECT cr.title, cr.summary FROM policy_change_requests cr
    WHERE cr.policy_version_id = v.id ORDER BY cr.created_at DESC LIMIT 1
  ) r ON true
  LEFT JOIN users u ON u.id = v.authored_by
  WHERE v.status = 'PENDING_APPROVAL'
  ORDER BY v.submitted_at;
END;
$$;

-- =============================================================================
-- 7. Access
-- =============================================================================
REVOKE ALL ON FUNCTION fn_policy_submit(UUID, VARCHAR, TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_withdraw(UUID, TEXT)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_approve(UUID, TIMESTAMPTZ, TEXT)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_reject(UUID, TEXT)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_activate_due()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_policy_pending()                          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION fn_policy_submit(UUID, VARCHAR, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_withdraw(UUID, TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_approve(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_reject(UUID, TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_pending()                        TO authenticated;
-- The activation job runs as the service role from a schedule, not from a screen.
GRANT EXECUTE ON FUNCTION fn_policy_activate_due()                   TO service_role;

-- Check
-- SELECT * FROM fn_policy_pending();
