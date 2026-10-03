-- =============================================================================
-- 060: Live figures for the staff page frame (fix list A1, A2)
-- =============================================================================
-- The menu badge on Applications used to be a fixed "12" and the bell showed
-- sample notifications. Both now come from here. Signed-in staff can't read
-- `applications` or `audit_events` directly (the privacy rules keep those
-- tables behind functions), so the page frame asks this one function instead.
--
--   * waiting: real cases waiting for a person (SUBMITTED, UNDER_ASSESSMENT,
--     UNDER_REVIEW). Synthetic cases are the simulated book and are left out.
--   * events: the latest 12 events from the audit log in the last 14 days, in
--     the categories the bell shows. Synthetic cases and sign-ins are left out;
--     staff-login changes only for people who may view users.
--   Real customers' cases count only for staff who may see real customers
--   (fn_sees_real_customers), so the public demo login gets none of them.
--
-- Read only. Run order: after 059. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_frame_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_users  BOOLEAN;
  v_since  TIMESTAMPTZ := now() - INTERVAL '14 days';
  v_types  TEXT[] := ARRAY['APPLICATION_CREATED', 'APPLICATION_SUBMITTED', 'DOCUMENT_UPLOADED', 'DETAILS_CONFIRMED',
                           'AUTO_DOC_REQUESTED', 'FACE_MATCH_CHECKED', 'APPLICATION_ASSESSED', 'ENGINE_DECISION',
                           'DECISION_GENERATED', 'OFFICER_DECISION', 'OFFICER_ACCEPT_DOC', 'LOAN_DISBURSED',
                           'USER_CREATED', 'USER_CHANGED', 'USER_SUSPENDED'];
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real  := fn_sees_real_customers();
  v_users := fn_has_permission('user.view');

  RETURN jsonb_build_object(
    'waiting', (SELECT count(*) FROM applications a
                WHERE a.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')
                  AND a.origin IS DISTINCT FROM 'SYNTHETIC'
                  AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)),
    'events', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
                 SELECT jsonb_build_object('id', e.id, 'event_type', e.event_type, 'created_at', e.created_at,
                                           'application_id', a.application_id) AS x
                 FROM audit_events e
                 LEFT JOIN applications a ON a.id = e.application_id
                 WHERE e.created_at >= v_since
                   AND e.event_type = ANY (v_types)
                   AND (e.application_id IS NOT NULL OR (e.event_type LIKE 'USER\_%' AND v_users))
                   AND a.origin IS DISTINCT FROM 'SYNTHETIC'
                   AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
                 ORDER BY e.created_at DESC
                 LIMIT 12) t)
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_frame_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_frame_summary() TO authenticated;
