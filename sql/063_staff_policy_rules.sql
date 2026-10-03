-- =============================================================================
-- 063: Policy Rules page reads the real rules through a function (fix list C7)
-- =============================================================================
-- On the live site the Policy Rules page showed made-up sample rules
-- ("Minimum CIBIL for auto approval 750", "Last updated 28 Aug 2026 by Anand
-- Gopal"): its read of policy_rules failed or came back empty, and the page
-- fell back to the samples without saying so.
--
-- fn_staff_policy_rules() returns, in one call:
--   * rules: every credit rule the engine checks (policy_rules), on or off
--   * version: the credit policy version in force (code, since when, who
--     approved it)
--   * last_change: the latest status change on any policy version, with who
--     made it (policy_version_events, 032)
--
-- Any signed-in staff member may read it (officers need to know the rules).
-- Read only. Run order: after 062. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_policy_rules()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'app.view.aggregate',
                                          'policy.view', 'policy.author', 'policy.approve', 'audit.view']);
  v_version := fn_policy_version_at();

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
                    LIMIT 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_policy_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_policy_rules() TO authenticated;

-- Check after running:
-- SELECT jsonb_array_length(fn_staff_policy_rules()->'rules');   -- 16 (the rules on the page), run as postgres
-- SELECT fn_staff_policy_rules()->'version'->>'version_code';    -- the version in force, e.g. 2026.08
