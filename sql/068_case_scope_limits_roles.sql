-- =============================================================================
-- 068: Officers see their own cases; user limits enforced; old roles retired
--      (fix list B2, B5, C3)
-- =============================================================================
-- B2. Officers saw every case. "Own cases only" (app.view.own) now applies to
--     the Applications list (fn_list_applications; the paged list 066 and the
--     case screen 061 already use it), the customer queue
--     (fn_staff_customer_queue) and the Applications badge
--     (fn_staff_frame_summary). The rule is fn_staff_case_scope (061):
--     officers see cases assigned to them and, by default, cases nobody has
--     taken yet (security setting officers_see_unassigned = 1; set it to 0 to
--     hide those). Managers, heads, compliance, admins and the demo login see
--     every case, as before. Decision taken by default (open question B2):
--     officers DO see unassigned cases, so new work is never invisible.
--
-- B5. The daily case limit and sanction limit saved on a user (Users page)
--     were never enforced. A check on every officer decision now refuses:
--       * a decision when the person has already decided their daily case
--         limit of cases today (India time);
--       * an approval above the person's sanction limit ("refer it to someone
--         with a higher limit").
--     Blank limits mean no limit. It runs inside the database whatever screen
--     records the decision, and never on system (engine) decisions.
--     Decision taken by default (open question B5): no new amount limits by
--     role; the per-person limits on the Users page are the policy.
--
-- C3. The three old capitalised roles (ADMIN, CREDIT_OFFICER, STATE_HEAD):
--     switched off, no rights, no users. Removed when nobody holds them;
--     otherwise kept switched off and marked retired. One audit entry.
--
-- Run order: after 067 (needs 061's fn_staff_case_scope). Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B2. Lists follow the case scope
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_list_applications()
RETURNS TABLE (
  application_uuid UUID,
  application_id VARCHAR,
  full_name VARCHAR,
  email VARCHAR,
  mobile VARCHAR,
  employer_name VARCHAR,
  age_at_application SMALLINT,
  pan_number VARCHAR,
  city VARCHAR,
  state_code VARCHAR,
  status VARCHAR,
  current_step SMALLINT,
  loan_amount_requested DECIMAL,
  tenure_months SMALLINT,
  declared_net_salary DECIMAL,
  vehicle_make VARCHAR,
  vehicle_model VARCHAR,
  vehicle_variant VARCHAR,
  ex_showroom_price DECIMAL,
  on_road_price DECIMAL,
  dealer_name VARCHAR,
  cibil_score SMALLINT,
  decision VARCHAR,
  rate DECIMAL,
  foir_pct DECIMAL,
  ltv_pct DECIMAL,
  officer_name VARCHAR,
  created_at TIMESTAMPTZ,
  origin VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real BOOLEAN;
BEGIN
  -- B2: officers (app.view.own) see their own and unassigned cases (fn_staff_case_scope, 061)
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real := fn_sees_real_customers();

  RETURN QUERY
  SELECT
    a.id AS application_uuid,
    a.application_id,
    c.full_name,
    c.email,
    fn_pii_mask(c.mobile_last4, 10)::VARCHAR AS mobile,
    c.employer_name,
    c.age_at_application,
    fn_pii_mask(c.pan_last4, 10)::VARCHAR AS pan_number,
    c.city,
    c.state_code,
    a.status,
    a.current_step,
    coalesce(a.loan_amount_requested, q.loan_amount_requested),
    coalesce(a.tenure_months, q.tenure_months),
    a.declared_net_salary,
    coalesce(v.make, q.make)::VARCHAR AS vehicle_make,
    coalesce(v.model, q.model)::VARCHAR AS vehicle_model,
    coalesce(v.variant, q.variant)::VARCHAR AS vehicle_variant,
    coalesce(v.ex_showroom_price, q.ex_showroom),
    coalesce(v.on_road_price, q.on_road),
    coalesce(d.dealer_name, q.dealer_name)::VARCHAR AS dealer_name,
    br.score AS cibil_score,
    cd.decision,
    cd.sanctioned_rate AS rate,
    r.foir_calculated AS foir_pct,
    r.ltv_calculated AS ltv_pct,
    u.full_name AS officer_name,
    a.created_at,
    a.origin
  FROM applications a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN vehicles v ON v.application_id = a.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v.id IS NULL
  -- the latest of each: a customer case can have its credit checks run more than once
  LEFT JOIN LATERAL (SELECT x.score FROM bureau_reports x WHERE x.application_id = a.id
                     ORDER BY x.created_at DESC LIMIT 1) br ON true
  LEFT JOIN LATERAL (SELECT x.decision, x.sanctioned_rate FROM credit_decisions x WHERE x.application_id = a.id
                     ORDER BY x.decided_at DESC NULLS LAST LIMIT 1) cd ON true
  LEFT JOIN LATERAL (SELECT x.foir_calculated, x.ltv_calculated FROM recommendations x WHERE x.application_id = a.id
                     ORDER BY x.created_at DESC LIMIT 1) r ON true
  LEFT JOIN users u ON u.id = a.assigned_officer_id
  CROSS JOIN fn_staff_case_scope() sc
  WHERE (a.origin IS DISTINCT FROM 'CUSTOMER'
         OR (v_real AND a.status <> 'DRAFT'))
    AND (sc.sees_all OR a.assigned_officer_id = sc.me OR (a.assigned_officer_id IS NULL AND sc.unassigned))
  ORDER BY a.created_at DESC;
END;
$$;


CREATE OR REPLACE FUNCTION fn_staff_customer_queue(p_scope TEXT DEFAULT 'OPEN')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sc RECORD;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT * INTO sc FROM fn_staff_case_scope();
  -- Real customers only for staff who may see personal data (050).
  IF NOT fn_sees_real_customers() THEN
    RETURN jsonb_build_object('drafts', 0, 'rows', '[]'::jsonb, 'restricted', true);
  END IF;
  RETURN jsonb_build_object(
    'drafts', (SELECT count(*) FROM applications WHERE origin = 'CUSTOMER' AND status = 'DRAFT'),
    'rows', (SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.submitted_at), '[]'::jsonb) FROM (
      SELECT a.application_id, c.full_name, a.status, a.approval_stage,
             coalesce(a.customer_submitted_at, a.created_at) AS submitted_at,
             round(extract(epoch FROM now() - coalesce(a.customer_submitted_at, a.created_at)) / 3600)::INT AS hours_waiting,
             CASE WHEN q.make IS NULL THEN NULL ELSE concat_ws(' ', q.make, q.model) END AS vehicle,
             coalesce(q.loan_amount_requested, a.loan_amount_requested) AS loan_amount,
             u.full_name AS officer,
             coalesce((a.auto_review->>'fast_lane')::BOOLEAN, false) AS fast_lane,
             coalesce((a.auto_review->>'docs_verified_automatically')::BOOLEAN, false) AS auto_verified,
             (SELECT count(*) FROM audit_events e WHERE e.application_id = a.id AND e.event_type = 'AUTO_DOC_ACCEPTED') AS docs_auto_accepted,
             (SELECT count(*) FROM application_document_requirements r WHERE r.application_id = a.id AND r.status = 'RECEIVED') AS docs_to_check,
             (SELECT count(*) FROM application_document_requirements r WHERE r.application_id = a.id AND r.status = 'REUPLOAD') AS docs_with_customer,
             (SELECT coalesce(sum(cardinality(g.edited_fields)), 0) FROM application_detail_groups g WHERE g.application_id = a.id) AS fields_edited,
             (SELECT f.result FROM kyc_face_matches f WHERE f.application_id = a.id
              ORDER BY CASE f.result WHEN 'MISMATCH' THEN 1 WHEN 'NO_FACE' THEN 2 WHEN 'REVIEW' THEN 3 ELSE 4 END, f.checked_at DESC LIMIT 1) AS face
      FROM applications a
      JOIN customers c ON c.id = a.customer_id
      LEFT JOIN vehicle_quotations q ON q.application_id = a.id
      LEFT JOIN users u ON u.id = a.assigned_officer_id
      WHERE a.origin = 'CUSTOMER' AND a.status <> 'DRAFT'
        -- B2: officers see their own and unassigned cases
        AND (sc.sees_all OR a.assigned_officer_id = sc.me OR (a.assigned_officer_id IS NULL AND sc.unassigned))
        AND CASE upper(coalesce(p_scope, 'OPEN'))
              WHEN 'OPEN' THEN a.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')
                               OR (a.status = 'APPROVED' AND a.approval_stage = 'IN_PRINCIPLE')
              WHEN 'DONE' THEN a.status IN ('APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')
              ELSE true END
    ) x));
END;
$$;


CREATE OR REPLACE FUNCTION fn_staff_frame_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  sc       RECORD;
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
  SELECT * INTO sc FROM fn_staff_case_scope();

  RETURN jsonb_build_object(
    'waiting', (SELECT count(*) FROM applications a
                WHERE a.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')
                  AND a.origin IS DISTINCT FROM 'SYNTHETIC'
                  AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
                  -- B2: an officer's badge counts their own and unassigned cases
                  AND (sc.sees_all OR a.assigned_officer_id = sc.me OR (a.assigned_officer_id IS NULL AND sc.unassigned))),
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


REVOKE EXECUTE ON FUNCTION fn_list_applications() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_list_applications() TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_queue(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_queue(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_frame_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_frame_summary() TO authenticated;

-- -----------------------------------------------------------------------------
-- B5. Daily case limit and sanction limit on officer decisions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_check_officer_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := fn_current_staff_id();
  v_user  users%ROWTYPE;
  v_today INTEGER;
BEGIN
  -- engine and operator decisions carry no person's limits
  IF NEW.decided_by IS DISTINCT FROM 'OFFICER' OR v_staff IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_user FROM users WHERE id = v_staff;

  IF v_user.daily_case_limit IS NOT NULL THEN
    SELECT count(DISTINCT e.application_id) INTO v_today
    FROM audit_events e
    WHERE e.event_type = 'OFFICER_DECISION' AND e.actor_id = v_staff
      AND e.application_id IS DISTINCT FROM NEW.application_id
      AND e.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
    IF v_today >= v_user.daily_case_limit THEN
      RAISE EXCEPTION 'daily case limit reached: you have decided % case(s) today and your limit is %', v_today, v_user.daily_case_limit
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF upper(NEW.decision) = 'APPROVE' AND v_user.max_sanction_amount IS NOT NULL
     AND coalesce(NEW.sanctioned_amount, 0) > v_user.max_sanction_amount THEN
    RAISE EXCEPTION 'above your sanction limit: % is more than your limit of %; refer it to someone with a higher limit',
      round(NEW.sanctioned_amount), round(v_user.max_sanction_amount)
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_check_officer_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_credit_decisions_officer_limits ON credit_decisions;
CREATE TRIGGER trg_credit_decisions_officer_limits BEFORE INSERT OR UPDATE ON credit_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_check_officer_limits();

-- -----------------------------------------------------------------------------
-- C3. Retire the three old capitalised roles
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_removed TEXT[];
  v_kept    TEXT[];
BEGIN
  SELECT array_agg(code ORDER BY code) INTO v_removed FROM roles r
  WHERE r.code IN ('ADMIN', 'CREDIT_OFFICER', 'STATE_HEAD')
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = r.code);
  -- held by a login: switched off and marked retired (counted only the first time)
  SELECT array_agg(code ORDER BY code) INTO v_kept FROM roles r
  WHERE r.code IN ('ADMIN', 'CREDIT_OFFICER', 'STATE_HEAD')
    AND EXISTS (SELECT 1 FROM users u WHERE u.role = r.code)
    AND (r.is_active OR NOT r.is_legacy);

  IF v_removed IS NOT NULL THEN
    DELETE FROM roles WHERE code = ANY (v_removed);
  END IF;
  IF v_kept IS NOT NULL THEN
    UPDATE roles SET is_active = false, is_legacy = true,
           description = 'Retired 3 Oct 2026: an old capitalised role kept only because a login still holds it. Move that login to a current role.'
    WHERE code = ANY (v_kept);
  END IF;
  IF v_removed IS NOT NULL OR v_kept IS NOT NULL THEN
    INSERT INTO audit_events (event_type, actor_type, event_detail)
    VALUES ('ROLES_RETIRED', 'SYSTEM', jsonb_strip_nulls(jsonb_build_object(
              'removed', to_jsonb(v_removed), 'kept_switched_off', to_jsonb(v_kept), 'fix', 'C3')));
  END IF;
END;
$$;

-- Checks after running:
-- SELECT value FROM security_settings WHERE setting_key = 'officers_see_unassigned';   -- 1
-- SELECT code FROM roles WHERE code IN ('ADMIN', 'CREDIT_OFFICER', 'STATE_HEAD');       -- no rows (or marked retired)
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_credit_decisions_officer_limits';   -- one row
