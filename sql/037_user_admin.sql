-- cercit — staff account management (backlog AD2.1, AD2.2, AD2.3)
--
-- The Users screen adds, changes, suspends and unlocks staff through these
-- functions only. Direct writes to users stay closed (009). Every change is
-- checked here, not in the browser:
--
--   * the caller needs user.manage (admin)
--   * nobody changes their own role, limit or status: an admin cannot promote
--     or suspend themselves, so one person can never widen their own rights
--   * only active, current roles can be given; the two older roles
--     (reviewer, viewer) are kept for existing users but not handed out
--   * limits must be sensible: a sanction limit only for roles that decide cases
--   * every change is written to audit_events with the before and after values
--
-- A sign-in for the new person is sent from the screen (Supabase emails them a
-- code); 034's trigger links that login to this row by email.
--
-- Run order: after 036. Safe to re-run.

CREATE OR REPLACE FUNCTION fn_admin_save_user(
  p_user_id             UUID,
  p_email               TEXT,
  p_full_name           TEXT,
  p_role                TEXT,
  p_state_code          TEXT     DEFAULT NULL,
  p_max_sanction_amount NUMERIC  DEFAULT NULL,
  p_daily_case_limit    INTEGER  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_before  users%ROWTYPE;
  v_role    roles%ROWTYPE;
  v_email   TEXT := lower(trim(p_email));
  v_name    TEXT := trim(p_full_name);
  v_id      UUID;
BEGIN
  v_actor := fn_require_permission('user.manage');

  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'enter the person''s full name' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_role FROM roles WHERE code = p_role;
  IF v_role.code IS NULL OR NOT v_role.is_active THEN
    RAISE EXCEPTION 'role % does not exist or is switched off', p_role USING ERRCODE = '22023';
  END IF;

  IF p_state_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM states WHERE code = p_state_code) THEN
    RAISE EXCEPTION 'unknown state %', p_state_code USING ERRCODE = '22023';
  END IF;

  IF p_max_sanction_amount IS NOT NULL THEN
    IF p_max_sanction_amount <= 0 OR p_max_sanction_amount > 100000000 THEN
      RAISE EXCEPTION 'sanction limit must be between 1 and 10,00,00,000' USING ERRCODE = '22023';
    END IF;
    IF NOT ('app.decide' = ANY (fn_role_permissions(p_role))) THEN
      RAISE EXCEPTION 'a % does not decide cases, so has no sanction limit', v_role.name USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_daily_case_limit IS NOT NULL AND (p_daily_case_limit < 1 OR p_daily_case_limit > 200) THEN
    RAISE EXCEPTION 'daily case limit must be between 1 and 200' USING ERRCODE = '22023';
  END IF;

  IF p_user_id IS NULL THEN
    -- New person
    IF v_role.is_legacy THEN
      RAISE EXCEPTION 'role % is an older role and is not given to new people', v_role.name USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'someone with % already exists', v_email USING ERRCODE = '23505';
    END IF;

    INSERT INTO users (email, full_name, role, state_code, is_active, max_sanction_amount, daily_case_limit, auth_user_id)
    VALUES (v_email, v_name, p_role, p_state_code, true, p_max_sanction_amount, p_daily_case_limit,
            (SELECT a.id FROM auth.users a WHERE lower(a.email) = v_email
               AND NOT EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = a.id) LIMIT 1))
    RETURNING id INTO v_id;

    INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
    VALUES ('USER_CREATED', CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
            jsonb_build_object('user_id', v_id, 'email', v_email, 'role', p_role,
                               'state_code', p_state_code, 'max_sanction_amount', p_max_sanction_amount,
                               'daily_case_limit', p_daily_case_limit));
    RETURN v_id;
  END IF;

  -- Existing person
  SELECT * INTO v_before FROM users WHERE id = p_user_id;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;
  IF v_before.id = v_actor THEN
    RAISE EXCEPTION 'you cannot change your own account; ask another admin' USING ERRCODE = '42501';
  END IF;
  IF v_role.is_legacy AND v_before.role <> p_role THEN
    RAISE EXCEPTION 'role % is an older role and is not given to anyone new', v_role.name USING ERRCODE = '22023';
  END IF;
  IF v_email <> lower(v_before.email) AND EXISTS (SELECT 1 FROM users WHERE lower(email) = v_email AND id <> p_user_id) THEN
    RAISE EXCEPTION 'someone with % already exists', v_email USING ERRCODE = '23505';
  END IF;
  -- A login is tied to its address. Changing the address of a linked account
  -- would hand the role to whoever holds the new one, so it is not allowed.
  IF v_email <> lower(v_before.email) AND v_before.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'this person has already signed in; their email cannot be changed. Suspend and add them again' USING ERRCODE = '42501';
  END IF;

  UPDATE users
  SET email = v_email,
      full_name = v_name,
      role = p_role,
      state_code = p_state_code,
      max_sanction_amount = p_max_sanction_amount,
      daily_case_limit = p_daily_case_limit
  WHERE id = p_user_id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('USER_CHANGED', CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
          jsonb_build_object(
            'user_id', p_user_id,
            'before', jsonb_build_object('email', v_before.email, 'full_name', v_before.full_name, 'role', v_before.role,
                                         'state_code', v_before.state_code, 'max_sanction_amount', v_before.max_sanction_amount,
                                         'daily_case_limit', v_before.daily_case_limit),
            'after',  jsonb_build_object('email', v_email, 'full_name', v_name, 'role', p_role,
                                         'state_code', p_state_code, 'max_sanction_amount', p_max_sanction_amount,
                                         'daily_case_limit', p_daily_case_limit)));
  RETURN p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_admin_set_user_active(p_user_id UUID, p_active BOOLEAN, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID;
  v_before BOOLEAN;
BEGIN
  v_actor := fn_require_permission('user.manage');

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'give a reason (at least 5 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'you cannot suspend or reactivate your own account' USING ERRCODE = '42501';
  END IF;

  SELECT is_active INTO v_before FROM users WHERE id = p_user_id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;
  IF p_active AND NOT EXISTS (
      SELECT 1 FROM users u JOIN roles r ON r.code = u.role AND r.is_active WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'give this person a current role before reactivating them' USING ERRCODE = '22023';
  END IF;

  UPDATE users SET is_active = p_active WHERE id = p_user_id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (CASE WHEN p_active THEN 'USER_REACTIVATED' ELSE 'USER_SUSPENDED' END,
          CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
          jsonb_build_object('user_id', p_user_id, 'was_active', v_before, 'reason', trim(p_reason)));
END;
$$;

-- The list behind the Users screen. Anyone with user.view sees it; the
-- screen shows the change buttons only to those with user.manage.
CREATE OR REPLACE FUNCTION fn_admin_list_users()
RETURNS TABLE (
  id UUID, email TEXT, full_name TEXT, role TEXT, role_name TEXT, role_is_legacy BOOLEAN,
  state_code TEXT, state_name TEXT, is_active BOOLEAN, locked_until TIMESTAMPTZ,
  max_sanction_amount NUMERIC, daily_case_limit INTEGER, has_login BOOLEAN,
  last_login_at TIMESTAMPTZ, is_me BOOLEAN, can_manage BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID;
  v_manage BOOLEAN;
BEGIN
  v_actor := fn_require_permission('user.view');
  v_manage := fn_has_permission('user.manage');

  RETURN QUERY
  SELECT u.id, u.email::TEXT, u.full_name::TEXT, u.role::TEXT, r.name::TEXT, coalesce(r.is_legacy, false),
         u.state_code::TEXT, s.name::TEXT, u.is_active, u.locked_until,
         u.max_sanction_amount::NUMERIC, u.daily_case_limit::INTEGER, u.auth_user_id IS NOT NULL,
         u.last_login_at, u.id = v_actor, v_manage
  FROM users u
  LEFT JOIN roles r ON r.code = u.role
  LEFT JOIN states s ON s.code = u.state_code
  ORDER BY u.is_active DESC, u.full_name;
END;
$$;

REVOKE ALL ON FUNCTION fn_admin_save_user(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_admin_save_user(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION fn_admin_set_user_active(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_admin_set_user_active(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_admin_list_users() TO authenticated;

-- Checks after running:
-- SELECT proname FROM pg_proc WHERE proname IN ('fn_admin_save_user', 'fn_admin_set_user_active', 'fn_admin_list_users');
-- SELECT email, role_name, is_active, has_login FROM fn_admin_list_users();   -- run as a trusted operator: every user
