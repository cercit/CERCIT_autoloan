-- cercit — writing a policy draft (backlog CC2.1)
--
-- The Policy Rules screen stops switching rules on and off directly. Instead a
-- change starts as a draft copied from the version in force, one or more
-- settings are changed on it, and it goes through 023 for approval.
--
--   fn_policy_draft_create     copy the version in force into a new draft
--   fn_policy_draft_set_param  change one setting on your own draft
--   fn_policy_draft_discard    cancel a draft you have not sent yet
--   fn_policy_settings         the settings of a version, with their limits
--
-- Only the author of a draft may change it, only while it is a draft, and the
-- typed limits in 016 still apply to every value. Approved and live versions
-- are untouchable here, as they are everywhere else.
--
-- Run order: after 023. Safe to re-run.

-- =============================================================================
-- 1. Start a draft from the version in force
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_draft_create(
  p_version_code VARCHAR(20),
  p_rationale    TEXT,
  p_tier         VARCHAR(12) DEFAULT 'STANDARD',
  p_product      TEXT DEFAULT 'CAR_NEW'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_base  UUID;
  v_id    UUID;
BEGIN
  v_actor := fn_require_permission('policy.author');

  IF p_version_code IS NULL OR btrim(p_version_code) = '' THEN
    RAISE EXCEPTION 'a version name is required';
  END IF;
  IF p_rationale IS NULL OR btrim(p_rationale) = '' THEN
    RAISE EXCEPTION 'a reason for the change is required';
  END IF;

  v_base := fn_policy_version_at(p_product);
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'no policy version is in force for %', p_product;
  END IF;

  INSERT INTO policy_versions (product, version_code, base_version_id, rationale, tier, authored_by)
  VALUES (p_product, btrim(p_version_code), v_base, p_rationale, p_tier, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO policy_parameters (policy_version_id, param_key, value)
  SELECT v_id, param_key, value FROM policy_parameters WHERE policy_version_id = v_base;

  INSERT INTO policy_documents (policy_version_id, engine, document)
  SELECT v_id, engine, document FROM policy_documents WHERE policy_version_id = v_base;

  RETURN jsonb_build_object('versionId', v_id, 'versionCode', btrim(p_version_code), 'basedOn', v_base);
END;
$$;

-- =============================================================================
-- 2. Change one setting on your own draft
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_draft_set_param(
  p_version_id UUID,
  p_key        TEXT,
  p_value      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_ver   policy_versions%ROWTYPE;
  v_was   JSONB;
BEGIN
  v_actor := fn_require_permission('policy.author');

  SELECT * INTO v_ver FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_ver.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'policy version % is %, only a draft can be changed', v_ver.version_code, v_ver.status;
  END IF;
  IF v_actor IS NOT NULL AND v_ver.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'policy version % belongs to someone else', v_ver.version_code USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_was FROM policy_parameters WHERE policy_version_id = p_version_id AND param_key = p_key;

  -- The typed limits in 016 check the value; an unknown key fails its foreign key.
  INSERT INTO policy_parameters (policy_version_id, param_key, value)
  VALUES (p_version_id, p_key, p_value)
  ON CONFLICT (policy_version_id, param_key) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object('versionId', p_version_id, 'key', p_key, 'was', v_was, 'now', p_value);
END;
$$;

-- =============================================================================
-- 3. Discard a draft
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_draft_discard(p_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_ver   policy_versions%ROWTYPE;
BEGIN
  v_actor := fn_require_permission('policy.author');

  SELECT * INTO v_ver FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_ver.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'policy version % is %, only a draft can be discarded', v_ver.version_code, v_ver.status;
  END IF;
  IF v_actor IS NOT NULL AND v_ver.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'policy version % belongs to someone else', v_ver.version_code USING ERRCODE = '42501';
  END IF;

  -- Versions are never deleted (016). Cancelling keeps the trail.
  UPDATE policy_versions SET status = 'CANCELLED', updated_at = now() WHERE id = p_version_id;

  RETURN jsonb_build_object('versionId', p_version_id, 'versionCode', v_ver.version_code, 'status', 'CANCELLED');
END;
$$;

-- =============================================================================
-- 4. Read a version's settings, with what each one is allowed to be
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_settings(p_version_id UUID)
RETURNS TABLE (
  param_key    VARCHAR,
  label        VARCHAR,
  section      VARCHAR,
  value        JSONB,
  live_value   JSONB,
  value_type   VARCHAR,
  unit         VARCHAR,
  min_value    NUMERIC,
  max_value    NUMERIC,
  description  VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.view', 'policy.author', 'policy.approve']);

  SELECT fn_policy_version_at(v.product) INTO v_live FROM policy_versions v WHERE v.id = p_version_id;

  RETURN QUERY
  SELECT d.param_key, d.label, d.section, p.value, l.value,
         d.value_type, d.unit, d.min_value, d.max_value, d.description
  FROM policy_parameters p
  JOIN parameter_definitions d ON d.param_key = p.param_key
  LEFT JOIN policy_parameters l ON l.policy_version_id = v_live AND l.param_key = p.param_key
  WHERE p.policy_version_id = p_version_id
  ORDER BY d.section, d.param_key;
END;
$$;

-- =============================================================================
-- 5. Access
-- =============================================================================
REVOKE ALL ON FUNCTION fn_policy_draft_create(VARCHAR, TEXT, VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_draft_set_param(UUID, TEXT, JSONB)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_draft_discard(UUID)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_settings(UUID)                             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION fn_policy_draft_create(VARCHAR, TEXT, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_draft_set_param(UUID, TEXT, JSONB)         TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_draft_discard(UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_settings(UUID)                             TO authenticated;

-- Check
-- SELECT param_key, value, live_value FROM fn_policy_settings(fn_policy_version_at());
