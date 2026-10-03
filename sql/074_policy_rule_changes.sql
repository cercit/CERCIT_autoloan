-- =============================================================================
-- 074: Policy Rules: switch a rule on or off, modify its limit, through approval (fix list G2)
-- =============================================================================
-- The Policy Rules page had "Edit / Deactivate" links that did nothing and a
-- status button that wrote straight to the live rule. Now a change to a rule
-- goes through the policy versioning and approval already built (016, 023,
-- 024): it is recorded on a draft policy version, sent for approval, approved
-- by someone else with a date, and applied to the rules the engine checks
-- (policy_rules) when that version goes live.
--
--   * policy_version_rule_changes: on a version, the rules it switches on or
--     off, the new limit, or what happens if the rule fails (refer / decline)
--   * fn_policy_rule_draft(rule, on/off, limit, action): policy.author; puts the
--     change on the author's open draft, starting one from the version in
--     force if there is none
--   * fn_policy_rule_draft_remove(rule): takes a change back off the draft
--   * when a version becomes ACTIVE (however it gets there), its rule changes
--     are applied to policy_rules and recorded in policy_rule_history
--   * fn_staff_policy_rules (063) also returns the reader's draft, changes
--     waiting for approval, approved changes not live yet, and whether the
--     reader may author or approve
--
-- Run order: after 073. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_version_rule_changes (
  policy_version_id UUID         NOT NULL,
  rule_id           VARCHAR(20)  NOT NULL,
  is_active         BOOLEAN,
  threshold_value   VARCHAR(50),
  severity_on_fail  VARCHAR(10),
  before            JSONB        NOT NULL,
  changed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_policy_version_rule_changes PRIMARY KEY (policy_version_id, rule_id),
  CONSTRAINT fk_policy_version_rule_changes_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id) ON DELETE CASCADE,
  CONSTRAINT ck_policy_version_rule_changes_severity CHECK (severity_on_fail IS NULL OR severity_on_fail IN ('REJECT', 'MAYBE')),
  CONSTRAINT ck_policy_version_rule_changes_something CHECK (is_active IS NOT NULL OR threshold_value IS NOT NULL OR severity_on_fail IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS policy_rule_history (
  id                UUID         NOT NULL DEFAULT gen_random_uuid(),
  rule_id           VARCHAR(20)  NOT NULL,
  policy_version_id UUID         NOT NULL,
  before            JSONB        NOT NULL,
  after             JSONB        NOT NULL,
  applied_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_policy_rule_history PRIMARY KEY (id)
);

ALTER TABLE policy_version_rule_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_rule_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON policy_version_rule_changes, policy_rule_history FROM anon, authenticated;

-- Put a rule change on the author's open draft (starting one if needed).
CREATE OR REPLACE FUNCTION fn_policy_rule_draft(
  p_rule_id    TEXT,
  p_is_active  BOOLEAN DEFAULT NULL,
  p_threshold  TEXT    DEFAULT NULL,
  p_severity   TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('policy.author');
  v_rule  policy_rules%ROWTYPE;
  v_draft UUID;
  v_old   policy_version_rule_changes%ROWTYPE;
  v_thr   TEXT := nullif(btrim(coalesce(p_threshold, '')), '');
  v_sev   TEXT := nullif(upper(btrim(coalesce(p_severity, ''))), '');
BEGIN
  SELECT * INTO v_rule FROM policy_rules WHERE rule_id = p_rule_id;
  IF v_rule.rule_id IS NULL THEN
    RAISE EXCEPTION 'no rule %', p_rule_id USING ERRCODE = 'P0002';
  END IF;
  IF v_thr IS NOT NULL AND v_rule.threshold_value ~ '^-?[0-9]+(\.[0-9]+)?$' AND v_thr !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'the limit for % is a number', v_rule.rule_name USING ERRCODE = '22023';
  END IF;
  IF v_sev IS NOT NULL AND v_sev NOT IN ('REJECT', 'MAYBE') THEN
    RAISE EXCEPTION 'if the rule fails: decline (REJECT) or refer to a person (MAYBE)' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_draft FROM policy_versions
  WHERE authored_by = v_actor AND status = 'DRAFT' AND product = 'CAR_NEW'
  ORDER BY created_at DESC LIMIT 1;
  IF v_draft IS NULL THEN
    v_draft := (fn_policy_draft_create('R' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD-HH24MISSMS'),
                                       'Credit rule changes from the Policy Rules page')->>'versionId')::UUID;
  END IF;

  SELECT * INTO v_old FROM policy_version_rule_changes WHERE policy_version_id = v_draft AND rule_id = p_rule_id;
  INSERT INTO policy_version_rule_changes (policy_version_id, rule_id, is_active, threshold_value, severity_on_fail, before)
  VALUES (v_draft, p_rule_id,
          CASE WHEN coalesce(p_is_active, v_old.is_active) IS DISTINCT FROM v_rule.is_active THEN coalesce(p_is_active, v_old.is_active) END,
          CASE WHEN coalesce(v_thr, v_old.threshold_value) IS DISTINCT FROM v_rule.threshold_value THEN coalesce(v_thr, v_old.threshold_value) END,
          CASE WHEN coalesce(v_sev, v_old.severity_on_fail) IS DISTINCT FROM v_rule.severity_on_fail THEN coalesce(v_sev, v_old.severity_on_fail) END,
          jsonb_build_object('is_active', v_rule.is_active, 'threshold_value', v_rule.threshold_value, 'severity_on_fail', v_rule.severity_on_fail))
  ON CONFLICT (policy_version_id, rule_id) DO UPDATE
  SET is_active = EXCLUDED.is_active, threshold_value = EXCLUDED.threshold_value,
      severity_on_fail = EXCLUDED.severity_on_fail, changed_at = now();
  -- a change back to the rule as it is today is no change
  DELETE FROM policy_version_rule_changes
  WHERE policy_version_id = v_draft AND rule_id = p_rule_id
    AND is_active IS NULL AND threshold_value IS NULL AND severity_on_fail IS NULL;
  RETURN fn_staff_policy_rules();
EXCEPTION WHEN check_violation THEN
  -- the change matched the rule as it is: nothing to keep
  DELETE FROM policy_version_rule_changes WHERE policy_version_id = v_draft AND rule_id = p_rule_id;
  RETURN fn_staff_policy_rules();
END;
$$;

CREATE OR REPLACE FUNCTION fn_policy_rule_draft_remove(p_rule_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('policy.author');
BEGIN
  DELETE FROM policy_version_rule_changes c
  USING policy_versions v
  WHERE v.id = c.policy_version_id AND v.authored_by = v_actor AND v.status = 'DRAFT' AND c.rule_id = p_rule_id;
  RETURN fn_staff_policy_rules();
END;
$$;

-- When a version goes live, its rule changes reach the rules the engine checks.
CREATE OR REPLACE FUNCTION trg_policy_version_apply_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c policy_version_rule_changes%ROWTYPE;
  r policy_rules%ROWTYPE;
BEGIN
  FOR c IN SELECT * FROM policy_version_rule_changes WHERE policy_version_id = NEW.id LOOP
    SELECT * INTO r FROM policy_rules WHERE rule_id = c.rule_id;
    CONTINUE WHEN r.rule_id IS NULL;
    UPDATE policy_rules SET
      is_active = coalesce(c.is_active, is_active),
      threshold_value = coalesce(c.threshold_value, threshold_value),
      severity_on_fail = coalesce(c.severity_on_fail, severity_on_fail),
      policy_version = left(NEW.version_code, 10),
      updated_at = now()
    WHERE rule_id = c.rule_id;
    INSERT INTO policy_rule_history (rule_id, policy_version_id, before, after)
    VALUES (c.rule_id, NEW.id,
            jsonb_build_object('is_active', r.is_active, 'threshold_value', r.threshold_value, 'severity_on_fail', r.severity_on_fail),
            jsonb_build_object('is_active', coalesce(c.is_active, r.is_active), 'threshold_value', coalesce(c.threshold_value, r.threshold_value),
                               'severity_on_fail', coalesce(c.severity_on_fail, r.severity_on_fail)));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_version_apply_rules ON policy_versions;
CREATE TRIGGER trg_policy_version_apply_rules AFTER UPDATE OF status ON policy_versions
  FOR EACH ROW WHEN (NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE')
  EXECUTE FUNCTION trg_policy_version_apply_rules();

-- 063's reader, with the drafts, approvals and rights around the rules.
CREATE OR REPLACE FUNCTION fn_staff_policy_rules()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version UUID;
  v_me      UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'app.view.aggregate',
                                          'policy.view', 'policy.author', 'policy.approve', 'audit.view']);
  v_version := fn_policy_version_at();
  v_me := fn_current_staff_id();

  RETURN jsonb_build_object(
    'rules', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'rule_id', r.rule_id, 'rule_name', r.rule_name, 'category', r.category,
                 'parameter', r.parameter, 'operator', r.operator,
                 'threshold_value', r.threshold_value, 'threshold_unit', r.threshold_unit,
                 'severity_on_fail', r.severity_on_fail, 'reason_code', r.reason_code,
                 'policy_version', r.policy_version, 'is_active', r.is_active,
                 'description', r.description, 'created_at', r.created_at, 'updated_at', r.updated_at)
               ORDER BY r.display_order, r.rule_id), '[]'::jsonb)
              FROM policy_rules r),
    'version', (SELECT jsonb_build_object(
                  'version_code', v.version_code, 'status', v.status,
                  'effective_from', v.effective_from, 'approved_at', v.approved_at,
                  'approved_by', u.full_name, 'rationale', v.rationale)
                FROM policy_versions v LEFT JOIN users u ON u.id = v.approved_by
                WHERE v.id = v_version),
    'last_change', (SELECT jsonb_build_object(
                      'version_code', v.version_code, 'from_status', e.from_status, 'to_status', e.to_status,
                      'at', e.at, 'by', coalesce(u.full_name, 'System'))
                    FROM policy_version_events e
                    JOIN policy_versions v ON v.id = e.policy_version_id
                    LEFT JOIN users u ON u.id = e.actor_id
                    ORDER BY e.at DESC, e.seq DESC
                    LIMIT 1),
    -- rule changes on versions not live yet: the reader's draft, those waiting for approval, approved ones to come
    'changes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'version_id', v.id, 'version_code', v.version_code, 'status', v.status,
                   'mine', v.authored_by IS NOT DISTINCT FROM v_me, 'author', u.full_name,
                   'effective_from', v.effective_from, 'rule_id', c.rule_id, 'is_active', c.is_active,
                   'threshold_value', c.threshold_value, 'severity_on_fail', c.severity_on_fail, 'before', c.before)
                 ORDER BY v.created_at, c.rule_id), '[]'::jsonb)
                FROM policy_version_rule_changes c
                JOIN policy_versions v ON v.id = c.policy_version_id
                LEFT JOIN users u ON u.id = v.authored_by
                WHERE (v.status = 'DRAFT' AND v.authored_by IS NOT DISTINCT FROM v_me)
                   OR v.status IN ('PENDING_APPROVAL', 'APPROVED')),
    'can_author', fn_has_permission('policy.author'),
    'can_approve', fn_has_permission('policy.approve')
  );
END;
$$;

REVOKE ALL ON FUNCTION trg_policy_version_apply_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_policy_rule_draft(TEXT, BOOLEAN, TEXT, TEXT), fn_policy_rule_draft_remove(TEXT),
                       fn_staff_policy_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_policy_rule_draft(TEXT, BOOLEAN, TEXT, TEXT), fn_policy_rule_draft_remove(TEXT),
                          fn_staff_policy_rules() TO authenticated;

-- Check after running:
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_policy_version_apply_rules';   -- one row
