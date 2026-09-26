-- cercit — "who am I" for the signed-in staff member
--
-- The website read the signed-in person's own row straight from the users
-- table. On the live database that read comes back empty, so the header fell
-- back to a sample name and sign-in routing could not tell staff from
-- customers. This function returns the caller's own row, and nothing else,
-- whatever the table grants are. A login with no staff row gets no rows.
--
-- Run order: after 039. Safe to re-run.

CREATE OR REPLACE FUNCTION fn_my_account()
RETURNS TABLE (
  id UUID, email TEXT, full_name TEXT, role TEXT, role_name TEXT, state_code TEXT,
  is_active BOOLEAN, max_sanction_amount NUMERIC, daily_case_limit INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::TEXT, u.full_name::TEXT, u.role::TEXT, coalesce(r.name, u.role)::TEXT, u.state_code::TEXT,
         u.is_active, u.max_sanction_amount::NUMERIC, u.daily_case_limit::INTEGER
  FROM users u
  LEFT JOIN roles r ON r.code = u.role
  WHERE u.auth_user_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION fn_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_my_account() TO authenticated;

-- Check after running (in the SQL editor there is no signed-in user, so no rows):
-- SELECT proname FROM pg_proc WHERE proname = 'fn_my_account';
