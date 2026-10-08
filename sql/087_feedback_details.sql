-- =============================================================================
-- 087: sign-out feedback, second version (9 Oct 2026)
-- =============================================================================
-- Adds to 086:
--   * "what couldn't you find?" (asked when they answer MOSTLY or NO)
--   * who they are: LENDING (works in lending or credit), PRODUCT (product or
--     tech), STUDENT, HIRING (hiring or recruiting), OTHER
--   * optional name and contact (email or LinkedIn), only with their consent
--     to be contacted about this feedback (contact_ok). Real personal data:
--     optional, used only to reply, never shown outside the Admin's list.
-- The Admin's list (fn_feedback_list) shows the new fields.
--
-- Run order: after 086. Safe to re-run.
-- =============================================================================

ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS lost_where TEXT;
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS profile    VARCHAR(10);
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS name       VARCHAR(100);
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS contact    VARCHAR(200);
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS contact_ok BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS ck_app_feedback_profile;
ALTER TABLE app_feedback ADD CONSTRAINT ck_app_feedback_profile
  CHECK (profile IS NULL OR profile IN ('LENDING', 'PRODUCT', 'STUDENT', 'HIRING', 'OTHER'));
ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS ck_app_feedback_contact_ok;
ALTER TABLE app_feedback ADD CONSTRAINT ck_app_feedback_contact_ok
  CHECK (contact IS NULL OR contact_ok);
ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS ck_app_feedback_lengths;
ALTER TABLE app_feedback ADD CONSTRAINT ck_app_feedback_lengths
  CHECK (length(coalesce(needed, '')) <= 2000 AND length(coalesce(bugs, '')) <= 2000 AND length(coalesce(lost_where, '')) <= 1000);

CREATE OR REPLACE FUNCTION fn_feedback_submit(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := fn_current_staff_id();
  v_role    TEXT;
  v_exp     SMALLINT := nullif(p->>'experience', '')::SMALLINT;
  v_find    TEXT := nullif(upper(btrim(coalesce(p->>'findability', ''))), '');
  v_lost    TEXT := nullif(btrim(coalesce(p->>'lost_where', '')), '');
  v_need    TEXT := nullif(btrim(coalesce(p->>'needed', '')), '');
  v_bugs    TEXT := nullif(btrim(coalesce(p->>'bugs', '')), '');
  v_prof    TEXT := nullif(upper(btrim(coalesce(p->>'profile', ''))), '');
  v_name    TEXT := nullif(btrim(coalesce(p->>'name', '')), '');
  v_contact TEXT := nullif(btrim(coalesce(p->>'contact', '')), '');
  v_ok      BOOLEAN := coalesce((p->>'contact_ok')::BOOLEAN, false);
  v_id      UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF v_exp IS NULL AND v_find IS NULL AND v_need IS NULL AND v_bugs IS NULL AND v_lost IS NULL THEN
    RAISE EXCEPTION 'nothing to send' USING ERRCODE = '22023';
  END IF;
  IF v_exp IS NOT NULL AND v_exp NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'rate from 1 to 5' USING ERRCODE = '22023';
  END IF;
  IF v_find IS NOT NULL AND v_find NOT IN ('YES', 'MOSTLY', 'NO') THEN
    RAISE EXCEPTION 'choose yes, mostly or no' USING ERRCODE = '22023';
  END IF;
  IF v_prof IS NOT NULL AND v_prof NOT IN ('LENDING', 'PRODUCT', 'STUDENT', 'HIRING', 'OTHER') THEN
    RAISE EXCEPTION 'choose who you are from the list' USING ERRCODE = '22023';
  END IF;
  IF v_contact IS NOT NULL AND NOT v_ok THEN
    RAISE EXCEPTION 'tick the box to let us contact you, or leave contact empty' USING ERRCODE = '22023';
  END IF;
  IF v_contact IS NOT NULL AND v_contact !~* '^([^@\s]+@[^@\s]+\.[a-z]{2,}|(https?://)?(www\.)?linkedin\.com/\S+)$' THEN
    RAISE EXCEPTION 'give an email address or a LinkedIn link' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO v_role FROM users WHERE id = v_me;
  INSERT INTO app_feedback (user_id, role_code, experience, findability, lost_where, needed, bugs, page, profile, name, contact, contact_ok)
  VALUES (v_me, v_role, v_exp, v_find, left(v_lost, 1000), left(v_need, 2000), left(v_bugs, 2000), left(nullif(p->>'page', ''), 200),
          v_prof, left(v_name, 100), left(v_contact, 200), v_contact IS NOT NULL AND v_ok)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS fn_feedback_list(INTEGER);
CREATE FUNCTION fn_feedback_list(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, role_name TEXT, experience SMALLINT, findability VARCHAR, lost_where TEXT,
               needed TEXT, bugs TEXT, page VARCHAR, profile VARCHAR, name VARCHAR, contact VARCHAR)
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
    SELECT f.id, f.created_at, coalesce(r.name, f.role_code)::TEXT, f.experience, f.findability, f.lost_where,
           f.needed, f.bugs, f.page, f.profile, f.name, f.contact
    FROM app_feedback f LEFT JOIN roles r ON r.code = f.role_code
    ORDER BY f.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION fn_feedback_submit(JSONB), fn_feedback_list(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_feedback_submit(JSONB), fn_feedback_list(INTEGER) TO authenticated;
