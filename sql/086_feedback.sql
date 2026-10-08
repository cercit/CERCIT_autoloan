-- =============================================================================
-- 086: feedback when someone signs out (fix list L3, 9 Oct 2026)
-- =============================================================================
-- Visitors sign in as Head, Manager or Officer from the sign-in page. When they
-- press Sign out they're asked four things (all optional, Skip is fine):
--   1. how was it (1-5 stars)
--   2. could you find what you needed (YES / MOSTLY / NO)
--   3. what's missing, and why it would help
--   4. anything broken
-- Saved with their role and the page they were on; no personal details asked.
-- The Admin reads them on the Users page (fn_feedback_list).
--
-- Run order: after 085. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_feedback (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  user_id     UUID,
  role_code   VARCHAR(30),
  experience  SMALLINT,
  findability VARCHAR(10),
  needed      TEXT,
  bugs        TEXT,
  page        VARCHAR(200),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_app_feedback PRIMARY KEY (id),
  CONSTRAINT ck_app_feedback_experience CHECK (experience IS NULL OR experience BETWEEN 1 AND 5),
  CONSTRAINT ck_app_feedback_findability CHECK (findability IS NULL OR findability IN ('YES', 'MOSTLY', 'NO')),
  CONSTRAINT ck_app_feedback_lengths CHECK (length(coalesce(needed, '')) <= 2000 AND length(coalesce(bugs, '')) <= 2000)
);
CREATE INDEX IF NOT EXISTS ix_app_feedback_created ON app_feedback (created_at DESC);
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_feedback FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_feedback_submit(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := fn_current_staff_id();
  v_role TEXT;
  v_exp  SMALLINT := nullif(p->>'experience', '')::SMALLINT;
  v_find TEXT := nullif(upper(btrim(coalesce(p->>'findability', ''))), '');
  v_need TEXT := nullif(btrim(coalesce(p->>'needed', '')), '');
  v_bugs TEXT := nullif(btrim(coalesce(p->>'bugs', '')), '');
  v_id   UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF v_exp IS NULL AND v_find IS NULL AND v_need IS NULL AND v_bugs IS NULL THEN
    RAISE EXCEPTION 'nothing to send' USING ERRCODE = '22023';
  END IF;
  IF v_exp IS NOT NULL AND v_exp NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'rate from 1 to 5' USING ERRCODE = '22023';
  END IF;
  IF v_find IS NOT NULL AND v_find NOT IN ('YES', 'MOSTLY', 'NO') THEN
    RAISE EXCEPTION 'choose yes, mostly or no' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO v_role FROM users WHERE id = v_me;
  INSERT INTO app_feedback (user_id, role_code, experience, findability, needed, bugs, page)
  VALUES (v_me, v_role, v_exp, v_find, left(v_need, 2000), left(v_bugs, 2000), left(nullif(p->>'page', ''), 200))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- The Admin's view: newest first, with the role (not the person)
CREATE OR REPLACE FUNCTION fn_feedback_list(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, role_name TEXT, experience SMALLINT, findability VARCHAR, needed TEXT, bugs TEXT, page VARCHAR)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    PERFORM fn_require_permission('user.manage');
  END IF;
  RETURN QUERY
    SELECT f.id, f.created_at, coalesce(r.name, f.role_code)::TEXT, f.experience, f.findability, f.needed, f.bugs, f.page
    FROM app_feedback f LEFT JOIN roles r ON r.code = f.role_code
    ORDER BY f.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION fn_feedback_submit(JSONB), fn_feedback_list(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_feedback_submit(JSONB), fn_feedback_list(INTEGER) TO authenticated;

-- Check after running:
-- SELECT count(*) FROM app_feedback;   -- 0 to start
