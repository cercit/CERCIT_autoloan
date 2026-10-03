-- =============================================================================
-- 072: Practice logins for visitors: officer, manager, head (fix list D1)
-- =============================================================================
-- Three practice roles do the real jobs, but only on synthetic customers:
--   * Practice Officer: sees own and unassigned cases; checks and decides
--   * Practice Manager: sees every case; checks, decides and overrides
--   * Practice Head: as the manager, and drafts and simulates credit policy;
--     never sends a draft for approval or makes it live
-- None of them: sees real customers or a full PAN or mobile (no pii.reveal),
-- creates applications (so no visitor types a real person's details in),
-- approves policy or pricing, changes the risk model, manages users, roles,
-- employers or organisation settings.
--
-- Guards (like 042 for the demo login), whatever screen or function is used:
--   * a practice role can only hold the rights listed below;
--   * a practice login can change a case only when the case is SYNTHETIC
--     (applications, credit decisions, overrides, notes, documents);
--   * before a practice login first changes a synthetic case, the case's
--     status, owner and decision are kept (practice_case_snapshots), so the
--     reset (073, D2) can put it back exactly;
--   * a policy version a practice login wrote stays a draft (or is cancelled);
--   * a practice account keeps its practice role, and is never locked out
--     (its password is shown on the sign-in page).
--
-- The three logins are created by Sameer in Supabase (Authentication > Users >
-- Add user, Auto Confirm) with the emails below and one shared password, which
-- also goes in the GitHub secret VITE_PRACTICE_PASSWORD (D3). Never in this file.
--
-- Run order: after 071. Safe to re-run.
-- =============================================================================

ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT false;

INSERT INTO roles (code, name, description, is_system, is_legacy, is_active, mfa_required, idle_timeout_minutes, is_practice) VALUES
  ('practice_officer', 'Practice officer', 'Visitor practice login: works synthetic cases as an officer. No real customers.', true, false, true, false, 30, true),
  ('practice_manager', 'Practice manager', 'Visitor practice login: works synthetic cases as a credit manager. No real customers.', true, false, true, false, 30, true),
  ('practice_head',    'Practice head',    'Visitor practice login: as a manager, and drafts and simulates policy (never makes it live). No real customers.', true, false, true, false, 30, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, is_system = true, is_practice = true;

-- Only these rights may ever sit on a practice role.
CREATE OR REPLACE FUNCTION trg_practice_role_rights()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM roles WHERE code = NEW.role_code AND is_practice)
     AND NEW.permission_code NOT IN ('app.view.own', 'app.view.team', 'app.view.all', 'app.evaluate', 'app.decide',
                                     'app.override', 'policy.view', 'policy.author', 'policy.simulate',
                                     'pricing.view', 'model.view', 'report.view') THEN
    RAISE EXCEPTION 'a practice role may not hold %', NEW.permission_code USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_practice_role_rights ON role_permissions;
CREATE TRIGGER trg_practice_role_rights BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION trg_practice_role_rights();

-- The head decides cases and drafts policy, which 036 keeps apart. Waived for
-- the practice head only: its cases are synthetic and its drafts can never be
-- sent for approval or made live (guard below).
INSERT INTO role_conflict_waivers (role_code, permission_a, permission_b, reason, review_by)
SELECT 'practice_head', c.permission_a, c.permission_b,
       'Practice login on synthetic cases; its policy drafts can be simulated but never sent for approval or made live (072).',
       DATE '2027-04-01'
FROM permission_conflicts c
WHERE (c.permission_a, c.permission_b) IN (('app.decide', 'policy.author'), ('policy.author', 'app.decide'))
ON CONFLICT (role_code, permission_a, permission_b) DO UPDATE SET reason = EXCLUDED.reason, review_by = EXCLUDED.review_by;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r, p FROM (VALUES
  ('practice_officer', ARRAY['app.view.own', 'app.evaluate', 'app.decide', 'report.view']),
  ('practice_manager', ARRAY['app.view.team', 'app.evaluate', 'app.decide', 'app.override', 'policy.view', 'pricing.view', 'report.view']),
  ('practice_head',    ARRAY['app.view.all', 'app.evaluate', 'app.decide', 'app.override', 'policy.view', 'policy.author',
                             'policy.simulate', 'pricing.view', 'model.view', 'report.view'])
) AS x(r, ps), unnest(ps) AS p
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- The three accounts' role rows. Gmail plus-addresses: mail lands in cercit@gmail.com.
INSERT INTO users (email, full_name, role, state_code, is_active) VALUES
  ('cercit+practice.officer@gmail.com', 'Practice Officer', 'practice_officer', NULL, true),
  ('cercit+practice.manager@gmail.com', 'Practice Manager', 'practice_manager', NULL, true),
  ('cercit+practice.head@gmail.com',    'Practice Head',    'practice_head',    NULL, true)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true,
    max_sanction_amount = NULL, daily_case_limit = NULL;

-- Is the signed-in person on a practice login?
CREATE OR REPLACE FUNCTION fn_is_practice_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users u JOIN roles r ON r.code = u.role
                 WHERE u.id = fn_current_staff_id() AND r.is_practice);
$$;

REVOKE ALL ON FUNCTION fn_is_practice_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_is_practice_user() TO authenticated;

-- -----------------------------------------------------------------------------
-- What a case looked like before practice logins touched it
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS practice_case_snapshots (
  application_id     UUID         NOT NULL,
  status             VARCHAR(30),
  approval_stage     VARCHAR(20),
  assigned_officer_id UUID,
  final_decision_at  TIMESTAMPTZ,
  decision           JSONB,
  taken_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  taken_by           UUID,
  CONSTRAINT pk_practice_case_snapshots PRIMARY KEY (application_id),
  CONSTRAINT fk_practice_case_snapshots_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
ALTER TABLE practice_case_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON practice_case_snapshots FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_practice_snapshot(p_application UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO practice_case_snapshots (application_id, status, approval_stage, assigned_officer_id, final_decision_at, decision, taken_by)
  SELECT a.id, a.status, a.approval_stage, a.assigned_officer_id, a.final_decision_at,
         (SELECT to_jsonb(d) FROM credit_decisions d WHERE d.application_id = a.id ORDER BY d.created_at DESC LIMIT 1),
         fn_current_staff_id()
  FROM applications a WHERE a.id = p_application
  ON CONFLICT (application_id) DO NOTHING;
$$;

-- One guard for every table a case change touches: a practice login may only
-- change synthetic cases, and the first change keeps a snapshot.
CREATE OR REPLACE FUNCTION trg_practice_synthetic_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app    UUID;
  v_origin TEXT;
BEGIN
  IF NOT fn_is_practice_user() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'applications' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'practice logins work on the synthetic cases already there; they don''t create applications' USING ERRCODE = '42501';
    END IF;
    v_app := OLD.id;
  ELSE
    v_app := CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;
  END IF;
  SELECT origin INTO v_origin FROM applications WHERE id = v_app;
  IF v_app IS NULL OR v_origin IS DISTINCT FROM 'SYNTHETIC' THEN
    RAISE EXCEPTION 'practice logins work on synthetic cases only' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME IN ('applications', 'credit_decisions') THEN
    PERFORM fn_practice_snapshot(v_app);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['applications', 'credit_decisions', 'override_logs', 'decision_overrides', 'escalations',
                           'audit_events', 'documents', 'application_document_requirements']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND (t = 'applications' OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                                          AND table_name = t AND column_name = 'application_id' AND data_type = 'uuid')) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_practice_synthetic_only ON %I', t);
      IF t = 'audit_events' THEN
        -- notes and events: only those about a case are checked
        EXECUTE format('CREATE TRIGGER trg_practice_synthetic_only BEFORE INSERT ON %I FOR EACH ROW '
                       'WHEN (NEW.application_id IS NOT NULL) EXECUTE FUNCTION trg_practice_synthetic_only()', t);
      ELSE
        EXECUTE format('CREATE TRIGGER trg_practice_synthetic_only BEFORE INSERT OR UPDATE OR DELETE ON %I '
                       'FOR EACH ROW EXECUTE FUNCTION trg_practice_synthetic_only()', t);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- A practice login's policy draft can be edited, simulated and cancelled, never
-- sent for approval, approved or made live.
CREATE OR REPLACE FUNCTION trg_practice_policy_stays_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('DRAFT', 'CANCELLED')
     AND (fn_is_practice_user()
          OR EXISTS (SELECT 1 FROM users u JOIN roles r ON r.code = u.role WHERE u.id = NEW.authored_by AND r.is_practice)) THEN
    RAISE EXCEPTION 'a practice draft stays a draft: it can be simulated but not sent for approval or made live' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_practice_policy_stays_draft ON policy_versions;
CREATE TRIGGER trg_practice_policy_stays_draft BEFORE UPDATE ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION trg_practice_policy_stays_draft();

-- Practice accounts keep their practice role.
CREATE OR REPLACE FUNCTION trg_practice_keeps_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND EXISTS (SELECT 1 FROM roles WHERE code = OLD.role AND is_practice) THEN
    RAISE EXCEPTION 'a practice account keeps its practice role; add a separate account instead' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_practice_keeps_role ON users;
CREATE TRIGGER trg_practice_keeps_role BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION trg_practice_keeps_role();

-- Lockout skips public-demo and practice accounts (their passwords are public); otherwise as 042.
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
    AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = u.role AND (r.is_public_demo OR r.is_practice))
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

REVOKE ALL ON FUNCTION trg_practice_role_rights(), fn_practice_snapshot(UUID), trg_practice_synthetic_only(),
                       trg_practice_policy_stays_draft(), trg_practice_keeps_role() FROM PUBLIC, anon, authenticated;

-- Checks after running:
-- SELECT code, is_practice FROM roles WHERE code LIKE 'practice_%';                     -- three rows, true
-- SELECT role, email FROM users WHERE role LIKE 'practice_%';                            -- three rows
-- SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_practice_synthetic_only';           -- 7 or 8
