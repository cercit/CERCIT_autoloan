-- =============================================================================
-- 065: Audit Log, one combined and filtered log (fix list C1 + G6)
-- =============================================================================
-- The Audit Log page read a table called audit_trail, which does not exist,
-- so it was empty for everyone on the live site. The real log is audit_events
-- (4,103 events of 18 types on 2 Oct), and some history sits in its own tables.
--
-- fn_audit_log(...) returns one combined log, newest first, a page at a time:
--   * audit_events: case events, decisions, documents, sign-ins, user and
--     role changes, organisation and automatic-check settings
--   * policy_version_events: credit policy versions drafted, sent for
--     approval, approved, made live, retired (032)
--   * feature_flag_history: module switches turned on or off (015)
--   * application_stage_events: case stage changes (customer journey)
--   * override_logs: officer overrides of a decision
-- Rate-grid changes join the log when they get their own history (G3).
--
-- Filters (all optional): from / to dates, user (a staff id, or SYSTEM, or
-- CUSTOMER), activity code, case number, free text. Pages of 50 by default;
-- the page asks for up to 5,000 rows for the CSV export.
--
-- Who: audit.view (admin, credit manager, credit head, compliance, policy
-- manager). Rows about real customers (origin CUSTOMER, or done by a
-- customer) only for staff who may see real customers (fn_sees_real_customers).
--
-- Read only, and the log itself becomes read only through the API: website
-- and service logins can add events but never change or delete one.
--
-- Run order: after 064. Safe to re-run.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_audit_events_created_at ON audit_events (created_at DESC);

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION fn_audit_log(
  p_from      TIMESTAMPTZ DEFAULT NULL,
  p_to        TIMESTAMPTZ DEFAULT NULL,
  p_actor     TEXT        DEFAULT NULL,
  p_activity  TEXT        DEFAULT NULL,
  p_case      TEXT        DEFAULT NULL,
  p_search    TEXT        DEFAULT NULL,
  p_page      INTEGER     DEFAULT 1,
  p_page_size INTEGER     DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_size   INTEGER := LEAST(GREATEST(coalesce(p_page_size, 50), 1), 5000);
  v_page   INTEGER := GREATEST(coalesce(p_page, 1), 1);
  v_search TEXT := nullif(btrim(coalesce(p_search, '')), '');
  v_case   TEXT := nullif(btrim(coalesce(p_case, '')), '');
  v_out    JSONB;
BEGIN
  PERFORM fn_require_permission('audit.view');
  v_real := fn_sees_real_customers();

  WITH log AS (
    SELECT 'E' || e.id::text AS id, e.created_at AS at,
           CASE WHEN u.id IS NOT NULL THEN u.id::text WHEN e.actor_type = 'CUSTOMER' THEN 'CUSTOMER' ELSE 'SYSTEM' END AS actor_key,
           CASE WHEN u.id IS NOT NULL THEN u.full_name WHEN e.actor_type = 'CUSTOMER' THEN 'Customer' ELSE 'System' END AS actor_name,
           u.role AS actor_role,
           e.event_type AS activity, a.application_id AS case_id, a.origin,
           coalesce(e.event_detail, '{}'::jsonb) AS details
    FROM audit_events e
    LEFT JOIN applications a ON a.id = e.application_id
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE v_real OR (a.origin IS DISTINCT FROM 'CUSTOMER' AND e.actor_type IS DISTINCT FROM 'CUSTOMER')
    UNION ALL
    SELECT 'P' || pe.id::text, pe.at,
           coalesce(u.id::text, 'SYSTEM'), coalesce(u.full_name, 'System'), u.role,
           'POLICY_STATUS', NULL, NULL,
           jsonb_build_object('version', pv.version_code, 'from', pe.from_status, 'to', pe.to_status,
                              'rebuilt', coalesce(pe.reconstructed, false))
    FROM policy_version_events pe
    JOIN policy_versions pv ON pv.id = pe.policy_version_id
    LEFT JOIN users u ON u.id = pe.actor_id
    UNION ALL
    SELECT 'F' || fh.id::text, fh.changed_at,
           coalesce(u.id::text, 'SYSTEM'), coalesce(u.full_name, 'System'), u.role,
           'SWITCH_CHANGED', NULL, NULL,
           jsonb_build_object('switch', fh.flag_key, 'from', fh.old_enabled, 'to', fh.new_enabled)
    FROM feature_flag_history fh
    LEFT JOIN users u ON u.id = fh.changed_by
    UNION ALL
    SELECT 'S' || s.id::text, s.at, 'SYSTEM', 'System', NULL,
           'CASE_STAGE', a.application_id, a.origin,
           jsonb_strip_nulls(jsonb_build_object('stage', s.stage, 'note', s.note))
    FROM application_stage_events s
    JOIN applications a ON a.id = s.application_id
    WHERE v_real OR a.origin IS DISTINCT FROM 'CUSTOMER'
    UNION ALL
    SELECT 'O' || o.id::text, o.created_at,
           coalesce(u.id::text, 'SYSTEM'), coalesce(u.full_name, 'System'), u.role,
           'DECISION_OVERRIDE', a.application_id, a.origin,
           jsonb_strip_nulls(jsonb_build_object('type', o.override_type, 'from', o.original_value,
                                                'to', o.new_value, 'reason', o.reason))
    FROM override_logs o
    JOIN applications a ON a.id = o.application_id
    LEFT JOIN users u ON u.id = o.officer_id
    WHERE v_real OR a.origin IS DISTINCT FROM 'CUSTOMER'
  ),
  filtered AS (
    SELECT * FROM log l
    WHERE (p_from IS NULL OR l.at >= p_from)
      AND (p_to IS NULL OR l.at < p_to)
      AND (p_actor IS NULL OR l.actor_key = p_actor)
      AND (p_activity IS NULL OR l.activity = p_activity)
      AND (v_case IS NULL OR l.case_id ILIKE '%' || v_case || '%')
      AND (v_search IS NULL
           OR l.details::text ILIKE '%' || v_search || '%'
           OR l.activity ILIKE '%' || replace(v_search, ' ', '_') || '%'
           OR l.actor_name ILIKE '%' || v_search || '%'
           OR coalesce(l.case_id, '') ILIKE '%' || v_search || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'page', v_page,
    'page_size', v_size,
    'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', x.id, 'at', x.at, 'actor_key', x.actor_key, 'actor_name', x.actor_name,
                'actor_role', x.actor_role, 'activity', x.activity, 'case_id', x.case_id,
                'synthetic', x.origin = 'SYNTHETIC', 'details', x.details) ORDER BY x.at DESC, x.id), '[]'::jsonb)
             FROM (SELECT * FROM filtered ORDER BY at DESC, id
                   LIMIT v_size OFFSET (v_page - 1) * v_size) x),
    'activities', (SELECT coalesce(jsonb_agg(DISTINCT l.activity), '[]'::jsonb) FROM log l),
    'users', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', k.actor_key, 'name', k.actor_name, 'role', k.actor_role)
                                         ORDER BY k.actor_name), '[]'::jsonb)
              FROM (SELECT DISTINCT actor_key, actor_name, actor_role FROM log) k)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_audit_log(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_audit_log(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Checks after running (as postgres):
-- SELECT fn_audit_log()->'total';                                                         -- about the number of audit events plus history rows
-- SELECT has_table_privilege('authenticated', 'audit_events', 'DELETE');                  -- false
