-- cercit — three demo accounts to walk the product with (backlog AD/demo)
--
--   demo1       credit officer   works cases, decides within a limit
--   demo2       credit manager   approves what an officer cannot
--   demo_admin  admin            everything, including the user and policy screens
--
-- demo1 and demo2 sign in with a password. The admin signs in with a code sent
-- to Sameer's inbox, so the account with every right needs the inbox as well as
-- the password. Its address is a Gmail plus-address: Supabase sees a separate
-- account, the mail lands in the one inbox.
--
-- This file carries no passwords. The logins are created in the Supabase
-- dashboard by the person who owns them; the rows below only say who may do
-- what, and the trigger at the end links a login to its row by email. Order
-- does not matter: link now if the login exists, link later when it is created.
--
-- Run order: after 033. Safe to re-run.

-- =============================================================================
-- 1. The three accounts, with what each may do
-- =============================================================================
-- Sanction limits are the demo figures from the scheme design; CC7.1 will
-- enforce them. An admin has no lending limit because an admin does not lend.
INSERT INTO users (email, full_name, role, state_code, is_active, max_sanction_amount, daily_case_limit)
VALUES
  ('demo1@cercit.in',        'Demo1 Officer', 'credit_officer', 'KA', true, 2500000, 40),
  ('demo2@cercit.in',        'Demo2 Manager', 'credit_manager', 'KA', true, 5000000, 20),
  ('cercit+admin@gmail.com', 'Demo Admin',    'admin',          NULL, true, NULL,    NULL)
ON CONFLICT (email) DO UPDATE
SET full_name           = EXCLUDED.full_name,
    role                = EXCLUDED.role,
    state_code          = EXCLUDED.state_code,
    is_active           = true,
    max_sanction_amount = EXCLUDED.max_sanction_amount,
    daily_case_limit    = EXCLUDED.daily_case_limit;

-- =============================================================================
-- 2. Link a login to its role row
-- =============================================================================
-- Matching is by email and only fills a blank: an existing link is never moved,
-- so a new login cannot take over someone else's role row.
UPDATE users u
SET auth_user_id = a.id
FROM auth.users a
WHERE lower(a.email) = lower(u.email)
  AND u.auth_user_id IS NULL;

CREATE OR REPLACE FUNCTION trg_link_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users u
  SET auth_user_id = NEW.id
  WHERE lower(u.email) = lower(NEW.email)
    AND u.auth_user_id IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_auth_user ON auth.users;
CREATE TRIGGER trg_link_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trg_link_auth_user();

REVOKE ALL ON FUNCTION trg_link_auth_user() FROM PUBLIC, anon, authenticated, service_role;

-- A login with no role row here gets nothing: every permission check asks this
-- table first (018). Signing in is not the same as being allowed in.

-- Check after running:
-- SELECT email, role, auth_user_id IS NOT NULL AS can_sign_in FROM users
-- WHERE email IN ('demo1@cercit.in', 'demo2@cercit.in', 'cercit+admin@gmail.com') ORDER BY email;
