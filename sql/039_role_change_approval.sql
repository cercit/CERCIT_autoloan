-- cercit — role builder with a second approval (backlog AD3.1, AD3.2, AD4.1)
--
-- An admin proposes a new role, or a change to what a role may do, and a
-- different person approves it before it takes effect. Until then nothing
-- changes. The rules, all checked here:
--
--   * proposing needs role.manage (admin); approving needs role.approve,
--     a new right given to Compliance, who already reviews access (02-Access)
--   * nobody approves their own proposal, and no role may hold both
--     role.manage and role.approve (new conflicting pair)
--   * a proposal that would give a role a conflicting pair is refused when
--     proposed, with the reason, unless that role has a recorded waiver
--   * the admin role cannot be edited here: removing its user or role rights
--     would lock everyone out of this screen
--   * a role still held by active users cannot be switched off
--   * one open proposal per role at a time
--   * proposals, approvals, rejections and withdrawals are all audited
--
-- Run order: after 038. Safe to re-run.

-- =============================================================================
-- 1. New right and conflicting pair
-- =============================================================================

INSERT INTO permissions (code, module, description) VALUES
  ('role.approve', 'admin', 'Approve someone else''s role change')
ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

INSERT INTO permission_conflicts (permission_a, permission_b, reason) VALUES
  ('role.approve', 'role.manage', 'Could propose and approve their own role change')
ON CONFLICT (permission_a, permission_b) DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO role_permissions (role_code, permission_code)
SELECT 'compliance', 'role.approve'
WHERE EXISTS (SELECT 1 FROM roles WHERE code = 'compliance')
  AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_code = 'compliance' AND permission_code = 'role.approve');

-- =============================================================================
-- 2. Proposals
-- =============================================================================

CREATE TABLE IF NOT EXISTS role_change_requests (
  id                   UUID          NOT NULL DEFAULT gen_random_uuid(),
  kind                 VARCHAR(10)   NOT NULL,
  role_code            VARCHAR(30)   NOT NULL,
  name                 VARCHAR(60)   NOT NULL,
  description          TEXT          NOT NULL,
  permissions          TEXT[]        NOT NULL,
  mfa_required         BOOLEAN       NOT NULL,
  idle_timeout_minutes SMALLINT      NOT NULL,
  is_active            BOOLEAN       NOT NULL,
  before_state         JSONB,
  reason               TEXT          NOT NULL,
  status               VARCHAR(10)   NOT NULL DEFAULT 'PENDING',
  requested_by         UUID,
  requested_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  decided_by           UUID,
  decided_at           TIMESTAMPTZ,
  decision_note        TEXT,

  CONSTRAINT pk_role_change_requests         PRIMARY KEY (id),
  CONSTRAINT ck_role_change_requests_kind    CHECK (kind IN ('CREATE', 'CHANGE')),
  CONSTRAINT ck_role_change_requests_status  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  CONSTRAINT ck_role_change_requests_code    CHECK (role_code ~ '^[a-z][a-z_]{1,29}$'),
  CONSTRAINT ck_role_change_requests_timeout CHECK (idle_timeout_minutes BETWEEN 5 AND 60),
  CONSTRAINT ck_role_change_requests_two     CHECK (decided_by IS NULL OR requested_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT fk_role_change_requests_by      FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_role_change_requests_dec     FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_change_requests_open
  ON role_change_requests (role_code) WHERE status = 'PENDING';

-- The first conflicting pair a set of rights would put on one role, ignoring
-- pairs the role has a waiver for. NULL when the set is clean.
CREATE OR REPLACE FUNCTION fn_first_conflict(p_role TEXT, p_permissions TEXT[])
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT format('%s and %s cannot sit on one role: %s', c.permission_a, c.permission_b, c.reason)
  FROM permission_conflicts c
  WHERE c.permission_a = ANY (p_permissions)
    AND c.permission_b = ANY (p_permissions)
    AND NOT EXISTS (SELECT 1 FROM role_conflict_waivers w
                    WHERE w.role_code = p_role AND w.permission_a = c.permission_a AND w.permission_b = c.permission_b)
  ORDER BY c.permission_a, c.permission_b
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_role_request_submit(
  p_role_code            TEXT,
  p_name                 TEXT,
  p_description          TEXT,
  p_permissions          TEXT[],
  p_mfa_required         BOOLEAN,
  p_idle_timeout_minutes INTEGER,
  p_is_active            BOOLEAN,
  p_reason               TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    UUID;
  v_role     roles%ROWTYPE;
  v_perms    TEXT[];
  v_unknown  TEXT;
  v_conflict TEXT;
  v_kind     TEXT;
  v_before   JSONB;
  v_id       UUID;
BEGIN
  v_actor := fn_require_permission('role.manage');

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'explain the change (at least 10 characters); the approver reads it' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 3 THEN
    RAISE EXCEPTION 'give the role a name' USING ERRCODE = '22023';
  END IF;
  IF p_role_code IS NULL OR p_role_code !~ '^[a-z][a-z_]{1,29}$' THEN
    RAISE EXCEPTION 'role code must be lower case letters and underscores, like branch_auditor' USING ERRCODE = '22023';
  END IF;
  IF p_idle_timeout_minutes IS NULL OR p_idle_timeout_minutes NOT BETWEEN 5 AND 60 THEN
    RAISE EXCEPTION 'idle timeout must be between 5 and 60 minutes' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT p ORDER BY p), ARRAY[]::TEXT[]) INTO v_perms FROM unnest(p_permissions) AS p;
  IF cardinality(v_perms) = 0 AND coalesce(p_is_active, true) THEN
    RAISE EXCEPTION 'an active role needs at least one right' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(p, ', ') INTO v_unknown FROM unnest(v_perms) AS p WHERE NOT EXISTS (SELECT 1 FROM permissions x WHERE x.code = p);
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'unknown rights: %', v_unknown USING ERRCODE = '22023';
  END IF;

  v_conflict := fn_first_conflict(p_role_code, v_perms);
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_role FROM roles WHERE code = p_role_code;
  IF v_role.code IS NULL THEN
    v_kind := 'CREATE';
    IF NOT coalesce(p_is_active, true) THEN
      RAISE EXCEPTION 'a new role starts switched on' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_kind := 'CHANGE';
    IF v_role.code = 'admin' THEN
      RAISE EXCEPTION 'the admin role cannot be changed here; losing its rights would lock everyone out of this screen' USING ERRCODE = '42501';
    END IF;
    IF NOT coalesce(p_is_active, true) AND EXISTS (SELECT 1 FROM users WHERE role = p_role_code AND is_active) THEN
      RAISE EXCEPTION 'active users still hold this role; move them to another role first' USING ERRCODE = '22023';
    END IF;
    v_before := jsonb_build_object(
      'name', v_role.name, 'description', v_role.description, 'mfa_required', v_role.mfa_required,
      'idle_timeout_minutes', v_role.idle_timeout_minutes, 'is_active', v_role.is_active,
      'permissions', (SELECT coalesce(jsonb_agg(permission_code ORDER BY permission_code), '[]'::jsonb)
                      FROM role_permissions WHERE role_code = p_role_code));
    IF v_before = jsonb_build_object(
         'name', trim(p_name), 'description', coalesce(trim(p_description), ''), 'mfa_required', coalesce(p_mfa_required, false),
         'idle_timeout_minutes', p_idle_timeout_minutes, 'is_active', coalesce(p_is_active, true),
         'permissions', to_jsonb(v_perms)) THEN
      RAISE EXCEPTION 'nothing has changed' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM role_change_requests WHERE role_code = p_role_code AND status = 'PENDING') THEN
    RAISE EXCEPTION 'a change to this role is already waiting for approval' USING ERRCODE = '23505';
  END IF;

  INSERT INTO role_change_requests (kind, role_code, name, description, permissions, mfa_required,
                                    idle_timeout_minutes, is_active, before_state, reason, requested_by)
  VALUES (v_kind, p_role_code, trim(p_name), coalesce(trim(p_description), ''), v_perms, coalesce(p_mfa_required, false),
          p_idle_timeout_minutes, coalesce(p_is_active, true), v_before, trim(p_reason), v_actor)
  RETURNING id INTO v_id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('ROLE_CHANGE_PROPOSED', CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
          jsonb_build_object('request_id', v_id, 'role_code', p_role_code, 'kind', v_kind, 'permissions', v_perms,
                             'reason', trim(p_reason)));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_role_request_decide(p_request_id UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    UUID;
  v_req      role_change_requests%ROWTYPE;
  v_conflict TEXT;
BEGIN
  v_actor := fn_require_permission('role.approve');

  SELECT * INTO v_req FROM role_change_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'this request was already %', lower(v_req.status) USING ERRCODE = '22023';
  END IF;
  IF v_actor IS NOT NULL AND v_actor = v_req.requested_by THEN
    RAISE EXCEPTION 'you proposed this change; someone else must approve it' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND (p_note IS NULL OR length(trim(p_note)) < 5) THEN
    RAISE EXCEPTION 'say why you are rejecting it (at least 5 characters)' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    -- The world may have moved since the proposal: check again before applying.
    v_conflict := fn_first_conflict(v_req.role_code, v_req.permissions);
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23514';
    END IF;
    IF NOT v_req.is_active AND EXISTS (SELECT 1 FROM users WHERE role = v_req.role_code AND is_active) THEN
      RAISE EXCEPTION 'active users now hold this role; it cannot be switched off' USING ERRCODE = '22023';
    END IF;

    INSERT INTO roles (code, name, description, is_system, is_legacy, is_active, mfa_required, idle_timeout_minutes)
    VALUES (v_req.role_code, v_req.name, v_req.description, false, false, v_req.is_active, v_req.mfa_required, v_req.idle_timeout_minutes)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active,
        mfa_required = EXCLUDED.mfa_required, idle_timeout_minutes = EXCLUDED.idle_timeout_minutes;

    DELETE FROM role_permissions WHERE role_code = v_req.role_code AND NOT (permission_code = ANY (v_req.permissions));
    INSERT INTO role_permissions (role_code, permission_code)
    SELECT v_req.role_code, p FROM unnest(v_req.permissions) AS p
    ON CONFLICT (role_code, permission_code) DO NOTHING;
  END IF;

  UPDATE role_change_requests
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
      decided_by = v_actor, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  WHERE id = p_request_id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (CASE WHEN p_approve THEN 'ROLE_CHANGE_APPROVED' ELSE 'ROLE_CHANGE_REJECTED' END,
          CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
          jsonb_build_object('request_id', p_request_id, 'role_code', v_req.role_code, 'note', p_note,
                             'before', v_req.before_state,
                             'after', jsonb_build_object('name', v_req.name, 'permissions', v_req.permissions,
                                                         'mfa_required', v_req.mfa_required,
                                                         'idle_timeout_minutes', v_req.idle_timeout_minutes,
                                                         'is_active', v_req.is_active)));
END;
$$;

CREATE OR REPLACE FUNCTION fn_role_request_withdraw(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_req   role_change_requests%ROWTYPE;
BEGIN
  v_actor := fn_require_permission('role.manage');
  SELECT * INTO v_req FROM role_change_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'no open request to withdraw' USING ERRCODE = '22023';
  END IF;
  IF v_actor IS NOT NULL AND v_actor IS DISTINCT FROM v_req.requested_by THEN
    RAISE EXCEPTION 'only the person who proposed it can withdraw it' USING ERRCODE = '42501';
  END IF;
  UPDATE role_change_requests SET status = 'WITHDRAWN', decided_at = now() WHERE id = p_request_id;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('ROLE_CHANGE_WITHDRAWN', CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
          jsonb_build_object('request_id', p_request_id, 'role_code', v_req.role_code));
END;
$$;

-- What the Roles screen shows. Anyone with role.manage, role.approve or
-- user.view may look; the flags say which buttons to show.
CREATE OR REPLACE FUNCTION fn_roles_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := fn_require_any_permission(ARRAY['role.manage', 'role.approve', 'user.view']);

  RETURN jsonb_build_object(
    'me', v_actor,
    'can_manage', fn_has_permission('role.manage'),
    'can_approve', fn_has_permission('role.approve'),
    'roles', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'code', r.code, 'name', r.name, 'description', r.description,
        'is_system', r.is_system, 'is_legacy', r.is_legacy, 'is_active', r.is_active,
        'mfa_required', r.mfa_required, 'idle_timeout_minutes', r.idle_timeout_minutes,
        'permissions', (SELECT coalesce(jsonb_agg(rp.permission_code ORDER BY rp.permission_code), '[]'::jsonb)
                        FROM role_permissions rp WHERE rp.role_code = r.code),
        'active_users', (SELECT count(*) FROM users u WHERE u.role = r.code AND u.is_active),
        'waivers', (SELECT coalesce(jsonb_agg(jsonb_build_object('a', w.permission_a, 'b', w.permission_b, 'reason', w.reason, 'review_by', w.review_by)), '[]'::jsonb)
                    FROM role_conflict_waivers w WHERE w.role_code = r.code)
      ) ORDER BY r.is_legacy, NOT r.is_active, r.name), '[]'::jsonb)
      FROM roles r
      WHERE r.code ~ '^[a-z]'),
    'permissions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'module', p.module, 'description', p.description)
                      ORDER BY p.module, p.code), '[]'::jsonb)
      FROM permissions p),
    'conflicts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('a', c.permission_a, 'b', c.permission_b, 'reason', c.reason)), '[]'::jsonb)
      FROM permission_conflicts c),
    'requests', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'role_code', q.role_code, 'name', q.name, 'description', q.description,
        'permissions', to_jsonb(q.permissions), 'mfa_required', q.mfa_required,
        'idle_timeout_minutes', q.idle_timeout_minutes, 'is_active', q.is_active,
        'before', q.before_state, 'reason', q.reason, 'status', q.status,
        'requested_by', rb.full_name, 'requested_by_me', q.requested_by IS NOT DISTINCT FROM v_actor AND v_actor IS NOT NULL,
        'requested_at', q.requested_at, 'decided_by', db.full_name, 'decided_at', q.decided_at, 'decision_note', q.decision_note
      ) ORDER BY (q.status = 'PENDING') DESC, q.requested_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM role_change_requests ORDER BY (status = 'PENDING') DESC, requested_at DESC LIMIT 30) q
      LEFT JOIN users rb ON rb.id = q.requested_by
      LEFT JOIN users db ON db.id = q.decided_by)
  );
END;
$$;

-- =============================================================================
-- 3. Access
-- =============================================================================

ALTER TABLE role_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON role_change_requests FROM anon, authenticated;
GRANT SELECT ON role_change_requests TO service_role;

REVOKE ALL ON FUNCTION fn_first_conflict(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_role_request_submit(TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_role_request_submit(TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, BOOLEAN, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_role_request_decide(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_role_request_decide(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_role_request_withdraw(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_role_request_withdraw(UUID) TO authenticated;
REVOKE ALL ON FUNCTION fn_roles_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_roles_overview() TO authenticated;

-- Checks after running:
-- SELECT permission_code FROM role_permissions WHERE role_code = 'compliance' AND permission_code = 'role.approve';  -- one row
-- SELECT * FROM v_role_conflicts;   -- still only the two waived rows
