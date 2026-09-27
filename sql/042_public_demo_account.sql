-- cercit — a public, read-only demo account on the live database
--
-- The Official sign-in page shows this account's email and password, so
-- visitors (and the planned 2,000 synthetic customers' cases) can be explored
-- on real data. Because its password is public, the account must not be able
-- to change anything:
--
--   * role demo_viewer holds view rights only: cases, credit rules, rates,
--     the risk model and reports. No creating, deciding, revealing PAN or
--     mobile, exporting, staff list or audit trail (both hold real addresses)
--   * a guard refuses any right on a public-demo role that is not a view
--     right, whoever adds it, including the role builder after approval
--   * the account is exempt from lockout: otherwise any visitor could lock it
--     for everyone with five wrong passwords (gap register #44)
--
-- The login itself is created by Sameer in Supabase (Authentication > Users >
-- Add user, Auto Confirm) with the email below; its password is set there and
-- in the GitHub secret VITE_DEMO_PASSWORD, never in this repository.
--
-- Run order: after 041. Safe to re-run.

ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_public_demo BOOLEAN NOT NULL DEFAULT false;

INSERT INTO roles (code, name, description, is_system, is_legacy, is_active, mfa_required, idle_timeout_minutes, is_public_demo)
VALUES ('demo_viewer', 'Demo visitor',
        'Public demo account. Looks at cases, rules, rates and reports; changes nothing.',
        true, false, true, false, 30, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, is_system = true, is_public_demo = true;

-- Only view rights may ever sit on a public-demo role.
CREATE OR REPLACE FUNCTION trg_public_demo_read_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM roles WHERE code = NEW.role_code AND is_public_demo)
     AND NEW.permission_code NOT IN ('app.view.all', 'app.view.aggregate', 'policy.view', 'pricing.view', 'model.view', 'report.view') THEN
    RAISE EXCEPTION 'the public demo role may only look, not %', NEW.permission_code USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_demo_read_only ON role_permissions;
CREATE TRIGGER trg_public_demo_read_only
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION trg_public_demo_read_only();

REVOKE ALL ON FUNCTION trg_public_demo_read_only() FROM PUBLIC, anon, authenticated;

INSERT INTO role_permissions (role_code, permission_code)
SELECT 'demo_viewer', p
FROM unnest(ARRAY['app.view.all', 'policy.view', 'pricing.view', 'model.view', 'report.view']) AS p
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- The account's role row. The login links itself by email when created (034).
-- A Gmail plus-address: mail to it lands in cercit@gmail.com.
INSERT INTO users (email, full_name, role, state_code, is_active)
VALUES ('cercit+demo@gmail.com', 'Demo Visitor', 'demo_viewer', NULL, true)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true,
    max_sanction_amount = NULL, daily_case_limit = NULL;

-- The demo login's password is public, so its role can never be swapped for a
-- stronger one: that would hand those rights to every visitor.
CREATE OR REPLACE FUNCTION trg_public_demo_keeps_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND EXISTS (SELECT 1 FROM roles WHERE code = OLD.role AND is_public_demo) THEN
    RAISE EXCEPTION 'the public demo account keeps its demo role; add a separate account instead' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_demo_keeps_role ON users;
CREATE TRIGGER trg_public_demo_keeps_role
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION trg_public_demo_keeps_role();

REVOKE ALL ON FUNCTION trg_public_demo_keeps_role() FROM PUBLIC, anon, authenticated;

-- Lockout skips public-demo accounts; otherwise the same as 036.
CREATE OR REPLACE FUNCTION fn_record_failed_login(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  UPDATE users u
  SET failed_login_count = u.failed_login_count + 1
  WHERE lower(u.email) = lower(trim(p_email))
    AND u.is_active
    AND (u.locked_until IS NULL OR u.locked_until <= now())
    AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = u.role AND r.is_public_demo)
  RETURNING u.id, u.failed_login_count INTO v_user;

  IF v_user.id IS NOT NULL AND v_user.failed_login_count >= coalesce(fn_security_setting('lockout_threshold'), 5) THEN
    UPDATE users
    SET locked_until = now() + make_interval(mins => coalesce(fn_security_setting('lockout_minutes'), 30)),
        failed_login_count = 0
    WHERE id = v_user.id;

    INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
    VALUES ('ACCOUNT_LOCKED', 'SYSTEM', v_user.id,
            jsonb_build_object('failed_attempts', v_user.failed_login_count,
                               'minutes', coalesce(fn_security_setting('lockout_minutes'), 30)));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_record_failed_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_record_failed_login(TEXT) TO anon, authenticated;

-- Checks after running:
-- SELECT fn_role_permissions('demo_viewer');          -- five view rights
-- SELECT email, role, auth_user_id IS NOT NULL AS has_login FROM users WHERE email = 'cercit+demo@gmail.com';
