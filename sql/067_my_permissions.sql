-- =============================================================================
-- 067: The signed-in person's rights, for the menu and buttons (fix list B1, B3)
-- =============================================================================
-- The menu showed all 15 pages to every role, and buttons for actions a role
-- can't take (decide, issue an offer, disburse, edit rules) showed and then
-- failed after a click. The database already refuses those actions; the site
-- now asks once which rights the person has and hides what they can't use.
--
-- fn_my_permissions() returns the caller's role and its rights (the same list
-- fn_require_permission checks), and whether they may see real customers.
-- A login that is not active staff gets an empty list. It only describes the
-- caller; it grants nothing.
--
-- Read only. Run order: after 066. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_my_permissions()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := fn_current_staff_id();
  v_role  TEXT;
BEGIN
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb, 'sees_real_customers', false);
  END IF;
  SELECT role INTO v_role FROM users WHERE id = v_staff;
  RETURN jsonb_build_object(
    'role', v_role,
    'permissions', to_jsonb(fn_role_permissions(v_role)),
    'sees_real_customers', fn_sees_real_customers()
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_my_permissions() TO authenticated;

-- Check after running: signed in on the site, the menu shows only the pages
-- your role can open. In the SQL editor (no signed-in user) it returns an
-- empty list:
-- SELECT fn_my_permissions();
