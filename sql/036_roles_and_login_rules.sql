-- cercit — roles and permissions as data, and the login rules (backlog AD1.1, AD1.2, AD1.3)
--
-- Until now each role's rights were written into fn_role_permissions() as a
-- CASE list (018). This script moves them into tables so the Admin screens can
-- show and later change them, and adds the rules from the admin parameter
-- register, section B (Vault/Policies/08):
--
--   password minimum length   12        (enforced by Supabase Auth; stored here so screens can show it)
--   failed logins to lock     5         locked for 30 minutes, or until an admin unlocks
--   idle timeout              15 min    10 min for admin, credit head, policy manager, compliance
--   MFA                       required for the same four roles; enforcement is a switch, off until
--                             the enrolment screen exists, so nobody is locked out on day one
--
-- Rights do not change: every role gets exactly what 018 gave it. The tests
-- compare the two lists.
--
-- Run order: after 035. Safe to re-run.

-- =============================================================================
-- 1. Permission catalogue
-- =============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  code        VARCHAR(40)   NOT NULL,
  module      VARCHAR(30)   NOT NULL,
  description TEXT          NOT NULL,

  CONSTRAINT pk_permissions      PRIMARY KEY (code),
  CONSTRAINT ck_permissions_code CHECK (code ~ '^[a-z]+(\.[a-z_]+)+$')
);

INSERT INTO permissions (code, module, description) VALUES
  ('app.view.own',       'cases',      'See cases assigned to me'),
  ('app.view.team',      'cases',      'See my team''s cases'),
  ('app.view.all',       'cases',      'See every case'),
  ('app.view.aggregate', 'cases',      'See case totals only, no named borrowers'),
  ('app.create',         'cases',      'Create an application'),
  ('app.evaluate',       'cases',      'Run the assessment on a case'),
  ('app.decide',         'cases',      'Approve or decline a case within my sanction limit'),
  ('app.override',       'cases',      'Override the recommendation, with a reason'),
  ('pii.reveal',         'cases',      'Reveal a borrower''s full PAN and mobile (logged)'),
  ('policy.view',        'policy',     'Read credit rules and their versions'),
  ('policy.author',      'policy',     'Propose a change to the credit rules'),
  ('policy.approve',     'policy',     'Approve someone else''s rule change'),
  ('policy.simulate',    'policy',     'Test a rule change against past cases'),
  ('policy.emergency',   'policy',     'Switch off a rule at once, reviewed afterwards'),
  ('pricing.view',       'pricing',    'Read the rate grid'),
  ('pricing.author',     'pricing',    'Propose a rate grid change'),
  ('pricing.approve',    'pricing',    'Approve someone else''s rate change'),
  ('model.view',         'model',      'Read risk model versions and results'),
  ('model.propose',      'model',      'Propose a new risk model version'),
  ('model.approve',      'model',      'Approve a risk model for use'),
  ('consent.view',       'compliance', 'Read customer consent records'),
  ('aml.review',         'compliance', 'Review anti-money-laundering alerts'),
  ('grievance.handle',   'compliance', 'Handle customer complaints'),
  ('user.view',          'admin',      'See staff accounts'),
  ('user.manage',        'admin',      'Create, change, suspend and unlock staff accounts'),
  ('role.manage',        'admin',      'Change what each role may do'),
  ('audit.view',         'audit',      'Read the audit trail'),
  ('report.view',        'reports',    'Open reports and dashboards'),
  ('report.export',      'reports',    'Download reports')
ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

-- =============================================================================
-- 2. Roles, with their login rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles (
  code                 VARCHAR(30)   NOT NULL,
  name                 VARCHAR(60)   NOT NULL,
  description          TEXT          NOT NULL,
  is_system            BOOLEAN       NOT NULL DEFAULT false,
  is_legacy            BOOLEAN       NOT NULL DEFAULT false,
  is_active            BOOLEAN       NOT NULL DEFAULT true,
  mfa_required         BOOLEAN       NOT NULL DEFAULT false,
  idle_timeout_minutes SMALLINT      NOT NULL DEFAULT 15,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_roles         PRIMARY KEY (code),
  CONSTRAINT ck_roles_code    CHECK (code ~ '^[a-z][a-z_]{1,29}$' OR (NOT is_active AND code ~ '^[A-Za-z][A-Za-z_]{1,29}$')),
  CONSTRAINT ck_roles_timeout CHECK (idle_timeout_minutes BETWEEN 5 AND 60)
);

DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (code, name, description, is_system, is_legacy, mfa_required, idle_timeout_minutes) VALUES
  ('credit_officer', 'Credit Officer',  'Underwriter. Decides cases within a sanction limit.',                           true, false, false, 15),
  ('credit_manager', 'Credit Manager',  'Decides above the officer limit; approves overrides and deviations.',          true, false, false, 15),
  ('credit_head',    'Credit Head',     'Approves rule, rate and model changes; high-value sanctions.',                 true, false, true,  10),
  ('policy_manager', 'Policy Manager',  'Writes rule and rate changes. Never decides a case.',                         true, false, true,  10),
  ('compliance',     'Compliance',      'Reads everything, including the audit trail. Changes nothing.',               true, false, true,  10),
  ('admin',          'Admin',           'Staff accounts, roles and settings.',                                         true, false, true,  10),
  ('reviewer',       'Reviewer',        'Older role: reviews and overrides team cases. Replaced by Credit Manager.',   true, true,  false, 15),
  ('viewer',         'Viewer',          'Older role: read-only. Replaced by Compliance.',                              true, true,  false, 15)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, is_system = true, is_legacy = EXCLUDED.is_legacy;
-- mfa_required and idle_timeout_minutes are left alone on re-run: they may have been changed since.

-- Any role already on a user row that is not in the list above (the 002 seed
-- users carry CREDIT_OFFICER and STATE_HEAD in capitals) becomes an
-- inactive role with no rights. That is what 018 gave it too (no rights), and
-- it lets the foreign key below go on without touching anyone's row.
INSERT INTO roles (code, name, description, is_active)
SELECT DISTINCT u.role, u.role, 'Found on a user row by 036; not a known role. Has no rights.', false
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = u.role)
  AND u.role ~ '^[A-Za-z][A-Za-z_]{1,29}$';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users u WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = u.role)) THEN
    RAISE EXCEPTION 'users.role holds a value that is not a valid role code: %',
      (SELECT string_agg(DISTINCT role, ', ') FROM users u WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = u.role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_role') THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role) REFERENCES roles(code) ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- 3. Which role may do what
-- =============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code       VARCHAR(30)   NOT NULL,
  permission_code VARCHAR(40)   NOT NULL,
  granted_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_role_permissions      PRIMARY KEY (role_code, permission_code),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_code) REFERENCES roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_perm FOREIGN KEY (permission_code) REFERENCES permissions(code)
);

-- Pairs of rights that must not sit with one person (02-Access-Control-and-SoD).
-- Author-and-approve on the same policy change is stopped per change by 016
-- (approver differs from author), so it is not listed as a role-level pair.
CREATE TABLE IF NOT EXISTS permission_conflicts (
  permission_a VARCHAR(40)   NOT NULL,
  permission_b VARCHAR(40)   NOT NULL,
  reason       TEXT          NOT NULL,

  CONSTRAINT pk_permission_conflicts PRIMARY KEY (permission_a, permission_b),
  CONSTRAINT fk_permission_conflicts_a FOREIGN KEY (permission_a) REFERENCES permissions(code),
  CONSTRAINT fk_permission_conflicts_b FOREIGN KEY (permission_b) REFERENCES permissions(code),
  CONSTRAINT ck_permission_conflicts_order CHECK (permission_a < permission_b)
);

INSERT INTO permission_conflicts (permission_a, permission_b, reason) VALUES
  ('app.decide',    'policy.author',  'A rule could be shaped around a borrower the same person decides'),
  ('app.decide',    'user.manage',    'Could give themselves a higher sanction limit, then use it'),
  ('policy.author', 'user.manage',    'Could give themselves the right to approve their own rule'),
  ('policy.approve','user.manage',    'Could create an approver account and approve through it')
ON CONFLICT (permission_a, permission_b) DO UPDATE SET reason = EXCLUDED.reason;

-- A documented exception: a role allowed to hold a conflicting pair, with the
-- reason on record. Each one shows in v_role_conflicts until it is removed.
CREATE TABLE IF NOT EXISTS role_conflict_waivers (
  role_code    VARCHAR(30)   NOT NULL,
  permission_a VARCHAR(40)   NOT NULL,
  permission_b VARCHAR(40)   NOT NULL,
  reason       TEXT          NOT NULL,
  review_by    DATE          NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_role_conflict_waivers PRIMARY KEY (role_code, permission_a, permission_b),
  CONSTRAINT fk_role_conflict_waivers_role FOREIGN KEY (role_code) REFERENCES roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_role_conflict_waivers_pair FOREIGN KEY (permission_a, permission_b) REFERENCES permission_conflicts(permission_a, permission_b)
);

INSERT INTO role_conflict_waivers (role_code, permission_a, permission_b, reason, review_by) VALUES
  ('credit_head', 'app.decide', 'policy.author',
   'Access policy gives the Credit Head both. Each rule change still needs an approver other than its author (016).',
   '2027-01-01'),
  ('admin', 'app.decide', 'user.manage',
   'Decision 0.3: the demo admin keeps all access during the build. Remove before real data.',
   '2026-11-01')
ON CONFLICT (role_code, permission_a, permission_b) DO UPDATE SET reason = EXCLUDED.reason, review_by = EXCLUDED.review_by;

CREATE OR REPLACE FUNCTION trg_role_permission_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_clash RECORD;
BEGIN
  SELECT c.permission_a, c.permission_b, c.reason INTO v_clash
  FROM permission_conflicts c
  JOIN role_permissions rp
    ON rp.role_code = NEW.role_code
   AND rp.permission_code = CASE WHEN c.permission_a = NEW.permission_code THEN c.permission_b ELSE c.permission_a END
  WHERE NEW.permission_code IN (c.permission_a, c.permission_b)
    AND NOT EXISTS (
      SELECT 1 FROM role_conflict_waivers w
      WHERE w.role_code = NEW.role_code AND w.permission_a = c.permission_a AND w.permission_b = c.permission_b)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'role % cannot hold both % and %: %',
      NEW.role_code, v_clash.permission_a, v_clash.permission_b, v_clash.reason
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permission_conflict ON role_permissions;
CREATE TRIGGER trg_role_permission_conflict
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION trg_role_permission_conflict();

-- Seed: exactly the rights 018 wrote into fn_role_permissions().
INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM (VALUES
  ('admin',          ARRAY['app.view.all', 'app.create', 'app.evaluate', 'app.decide', 'app.override', 'pii.reveal',
                           'user.view', 'user.manage', 'role.manage', 'audit.view', 'report.view', 'report.export']),
  ('credit_officer', ARRAY['app.view.own', 'app.create', 'app.evaluate', 'app.decide', 'pii.reveal',
                           'report.view', 'report.export']),
  ('reviewer',       ARRAY['app.view.team', 'app.override', 'pii.reveal', 'report.view', 'report.export']),
  ('viewer',         ARRAY['app.view.own', 'report.view', 'report.export']),
  ('credit_manager', ARRAY['app.view.team', 'app.create', 'app.evaluate', 'app.decide', 'app.override', 'pii.reveal',
                           'audit.view', 'report.view', 'report.export']),
  ('credit_head',    ARRAY['app.view.all', 'app.create', 'app.evaluate', 'app.decide', 'app.override', 'pii.reveal',
                           'policy.view', 'policy.author', 'policy.approve', 'policy.simulate', 'policy.emergency',
                           'pricing.view', 'pricing.author', 'pricing.approve',
                           'model.view', 'model.propose', 'model.approve',
                           'audit.view', 'report.view', 'report.export']),
  ('policy_manager', ARRAY['app.view.aggregate',
                           'policy.view', 'policy.author', 'policy.simulate',
                           'pricing.view', 'pricing.author',
                           'model.view', 'model.propose',
                           'audit.view', 'report.view', 'report.export']),
  ('compliance',     ARRAY['app.view.all', 'pii.reveal', 'policy.view', 'policy.simulate', 'pricing.view', 'model.view',
                           'consent.view', 'aml.review', 'grievance.handle',
                           'audit.view', 'report.view', 'report.export'])
) AS s(role_code, perms)
JOIN roles r ON r.code = s.role_code
CROSS JOIN LATERAL unnest(s.perms) AS p(code)
WHERE NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_code = r.code AND x.permission_code = p.code);

-- Every role holding a conflicting pair, waived or not. Should list only waivers.
CREATE OR REPLACE VIEW v_role_conflicts AS
SELECT a.role_code, c.permission_a, c.permission_b, c.reason,
       w.reason IS NOT NULL AS waived, w.reason AS waiver_reason, w.review_by
FROM permission_conflicts c
JOIN role_permissions a ON a.permission_code = c.permission_a
JOIN role_permissions b ON b.permission_code = c.permission_b AND b.role_code = a.role_code
LEFT JOIN role_conflict_waivers w
  ON w.role_code = a.role_code AND w.permission_a = c.permission_a AND w.permission_b = c.permission_b;

-- =============================================================================
-- 4. Login rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS security_settings (
  setting_key VARCHAR(40)   NOT NULL,
  value       INTEGER       NOT NULL,
  description TEXT          NOT NULL,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_security_settings PRIMARY KEY (setting_key)
);

DROP TRIGGER IF EXISTS trg_security_settings_updated_at ON security_settings;
CREATE TRIGGER trg_security_settings_updated_at
  BEFORE UPDATE ON security_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO security_settings (setting_key, value, description) VALUES
  ('password_min_length', 12, 'Shortest password allowed. Supabase Auth enforces it: set the same number under Authentication > Providers > Email.'),
  ('lockout_threshold',    5, 'Failed sign-ins in a row before the account locks'),
  ('lockout_minutes',     30, 'How long a locked account stays locked, unless an admin unlocks it sooner'),
  ('mfa_enforced',         0, '1 = roles marked MFA-required must sign in with a second factor. Keep at 0 until the enrolment screen exists.')
ON CONFLICT (setting_key) DO UPDATE SET description = EXCLUDED.description;
-- Values are left alone on re-run.

CREATE OR REPLACE FUNCTION fn_security_setting(p_key TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM security_settings WHERE setting_key = p_key;
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count SMALLINT    NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at      TIMESTAMPTZ;

-- =============================================================================
-- 5. Permission checks read the tables, and refuse locked accounts
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_role_permissions(p_role TEXT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(rp.permission_code ORDER BY rp.permission_code), ARRAY[]::TEXT[])
  FROM role_permissions rp
  JOIN roles r ON r.code = rp.role_code AND r.is_active
  WHERE rp.role_code = p_role;
$$;

-- A locked account is treated like a deactivated one: its login still works,
-- but nothing behind it does. So is a role that needs a second sign-in step
-- when the person has not taken it. Row-level security uses this too (009).
CREATE OR REPLACE FUNCTION fn_current_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM users u
  LEFT JOIN roles r ON r.code = u.role
  WHERE u.auth_user_id = auth.uid()
    AND u.is_active
    AND (u.locked_until IS NULL OR u.locked_until <= now())
    AND NOT (coalesce(r.mfa_required, false)
             AND coalesce((SELECT value FROM security_settings WHERE setting_key = 'mfa_enforced'), 0) = 1
             AND coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2');
$$;

CREATE OR REPLACE FUNCTION fn_require_any_permission(p_permissions TEXT[])
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role    TEXT;
  v_locked  TIMESTAMPTZ;
  v_mfa     BOOLEAN;
BEGIN
  IF fn_is_trusted_operator() THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.id, u.role, u.locked_until, r.mfa_required
  INTO v_user_id, v_role, v_locked, v_mfa
  FROM users u
  LEFT JOIN roles r ON r.code = u.role
  WHERE u.auth_user_id = auth.uid() AND u.is_active;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'no active cercit user for this login' USING ERRCODE = '42501';
  END IF;

  IF v_locked > now() THEN
    RAISE EXCEPTION 'account locked until %', to_char(v_locked AT TIME ZONE 'Asia/Kolkata', 'HH24:MI "IST"')
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_mfa, false)
     AND coalesce(fn_security_setting('mfa_enforced'), 0) = 1
     AND coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'second sign-in step required for this role' USING ERRCODE = '42501';
  END IF;

  IF NOT (fn_role_permissions(v_role) && p_permissions) THEN
    RAISE EXCEPTION 'permission denied: %', array_to_string(p_permissions, ' or ') USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$$;

-- =============================================================================
-- 6. Sign-in bookkeeping
-- =============================================================================

-- Called by the sign-in screen after a wrong password. Says nothing back, so it
-- cannot be used to find out which addresses belong to staff.
-- Known limit (gap register #44): anyone can call it, so anyone who knows a
-- staff address can lock that account for 30 minutes. A Supabase password-check
-- hook would close this; it needs a paid Supabase plan.
CREATE OR REPLACE FUNCTION fn_record_failed_login(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  UPDATE users
  SET failed_login_count = failed_login_count + 1
  WHERE lower(email) = lower(trim(p_email))
    AND is_active
    AND (locked_until IS NULL OR locked_until <= now())
  RETURNING id, failed_login_count INTO v_user;

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

-- Called right after a successful sign-in. Tells the screen whether to carry on
-- and which rules apply to this person; clears the failed-attempt count.
CREATE OR REPLACE FUNCTION fn_record_login()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.id, u.role, u.locked_until, u.is_active, r.name AS role_name, r.mfa_required, r.idle_timeout_minutes
  INTO v_user
  FROM users u
  LEFT JOIN roles r ON r.code = u.role
  WHERE u.auth_user_id = auth.uid();

  IF v_user.id IS NULL OR NOT v_user.is_active THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_access');
  END IF;

  IF v_user.locked_until > now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'locked', 'locked_until', v_user.locked_until);
  END IF;

  UPDATE users SET failed_login_count = 0, last_login_at = now() WHERE id = v_user.id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('LOGIN', 'OFFICER', v_user.id, jsonb_build_object('role', v_user.role));

  RETURN jsonb_build_object(
    'allowed', true,
    'role', v_user.role,
    'role_name', v_user.role_name,
    'idle_timeout_minutes', coalesce(v_user.idle_timeout_minutes, 15),
    'mfa_required', coalesce(v_user.mfa_required, false),
    'mfa_enforced', coalesce(fn_security_setting('mfa_enforced'), 0) = 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_unlock_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := fn_require_permission('user.manage');

  UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
  END IF;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('ACCOUNT_UNLOCKED', CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
          jsonb_build_object('user_id', p_user_id));
END;
$$;

-- Rules any visitor may see, so the sign-in screen can state them.
CREATE OR REPLACE FUNCTION fn_login_rules()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'password_min_length', coalesce(fn_security_setting('password_min_length'), 12),
    'lockout_threshold',   coalesce(fn_security_setting('lockout_threshold'), 5),
    'lockout_minutes',     coalesce(fn_security_setting('lockout_minutes'), 30));
$$;

-- =============================================================================
-- 7. Access
-- =============================================================================

ALTER TABLE permissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_conflicts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_conflict_waivers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_settings      ENABLE ROW LEVEL SECURITY;

-- Staff can read the role set-up; nobody changes it through the API yet.
-- AD3/AD4 add the change functions, with a second approval.
REVOKE ALL ON permissions, roles, role_permissions, permission_conflicts, role_conflict_waivers, security_settings
  FROM anon, authenticated;
GRANT SELECT ON permissions, roles, role_permissions, permission_conflicts, role_conflict_waivers, security_settings
  TO authenticated;
GRANT SELECT ON permissions, roles, role_permissions, permission_conflicts, role_conflict_waivers, security_settings
  TO service_role;

DROP POLICY IF EXISTS "staff_read_permissions" ON permissions;
CREATE POLICY "staff_read_permissions" ON permissions FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_roles" ON roles;
CREATE POLICY "staff_read_roles" ON roles FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_role_permissions" ON role_permissions;
CREATE POLICY "staff_read_role_permissions" ON role_permissions FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_permission_conflicts" ON permission_conflicts;
CREATE POLICY "staff_read_permission_conflicts" ON permission_conflicts FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_role_conflict_waivers" ON role_conflict_waivers;
CREATE POLICY "staff_read_role_conflict_waivers" ON role_conflict_waivers FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_security_settings" ON security_settings;
CREATE POLICY "staff_read_security_settings" ON security_settings FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

REVOKE ALL ON v_role_conflicts FROM anon, authenticated;
GRANT SELECT ON v_role_conflicts TO service_role;

REVOKE ALL ON FUNCTION trg_role_permission_conflict() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_security_setting(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_record_failed_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_record_failed_login(TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION fn_record_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_record_login() TO authenticated;
REVOKE ALL ON FUNCTION fn_unlock_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_unlock_user(UUID) TO authenticated;
REVOKE ALL ON FUNCTION fn_login_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_login_rules() TO anon, authenticated;

-- Checks after running:
-- SELECT code, name, mfa_required, idle_timeout_minutes, (SELECT count(*) FROM role_permissions rp WHERE rp.role_code = r.code) AS rights FROM roles r ORDER BY code;
-- SELECT * FROM v_role_conflicts;            -- expect two rows, both waived
-- SELECT fn_login_rules();
