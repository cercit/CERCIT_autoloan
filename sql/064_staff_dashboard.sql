-- =============================================================================
-- 064: Dashboard figures through one staff function (fix list C10)
-- =============================================================================
-- The dashboard counted applications, turnaround and the decision trend by
-- reading `applications` straight from the browser. Signed-in staff have no
-- read right on that table (privacy rules), so on the live site the figures
-- were empty or zero. Several boxes were also typed into the page: FPD risk
-- 1.8% "Elevated", a +12% trend, a funnel made of fixed ratios, a sample
-- activity feed, and "AI confidence" numbers for six sample cases.
--
-- fn_staff_dashboard(from) returns, for applications created since `from`
-- (all time when null):
--   * totals: sent (drafts left out), approved (approved or disbursed),
--     rejected, pending (submitted, being assessed, referred), straight-through
--     share (cases the system decided with no person), the same count for the
--     equal period before (for the trend), and how many are synthetic
--   * funnel: sent -> documents in -> bureau pulled -> approved -> disbursed
--   * tat: average hours from sending to the final decision, by week (last 8)
--   * trend: decisions per day, last 30 days (approve / refer / reject)
--   * fpd: first-payment default: loans whose first instalment, due 30+ days
--     ago, was paid 30+ days late or not at all (from loan_status_snapshot, 062)
--   * my_queue: up to 5 cases assigned to the caller and waiting
--   * exceptions: up to 10 referred cases, newest first, with the rules
--     they failed (or the engine's summary) and the server engine's score
--     where it ran
--   * activity: the latest 7 events from the audit log (sign-ins left out)
--
-- Same rules as the other staff functions: any app.view right (with only
-- app.view.aggregate, the policy manager, the figures without any case
-- lists); real
-- customers' cases only for staff who may see real customers
-- (fn_sees_real_customers), so the public demo login gets staff and
-- synthetic cases only. Synthetic cases are counted (they are the simulated
-- book the demo runs on) and reported separately.
--
-- Writes nothing but the loan status catch-up (062). Run order: after 063 (needs 062's snapshot). Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_dashboard(p_from TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real  BOOLEAN;
  v_me    UUID;
  v_prior TIMESTAMPTZ;
  v_cases BOOLEAN;
  v_out   JSONB;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'app.view.aggregate']);
  v_real := fn_sees_real_customers();
  v_me := fn_current_staff_id();
  -- totals only for a login that may see figures but not cases (policy manager)
  v_cases := fn_is_trusted_operator() OR fn_has_permission('app.view.own') OR fn_has_permission('app.view.team')
             OR fn_has_permission('app.view.all');
  v_prior := CASE WHEN p_from IS NULL THEN NULL ELSE p_from - (now() - p_from) END;
  -- first-payment figures come from the stored loan status (062); catch up on recent payments
  PERFORM fn_loan_status_refresh(200);

  WITH visible AS (
    SELECT a.* FROM applications a
    WHERE a.status <> 'DRAFT'
      AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
  ),
  inrange AS (
    SELECT v.*,
           (SELECT d.decided_by FROM credit_decisions d WHERE d.application_id = v.id
            ORDER BY d.decided_at DESC NULLS LAST, d.created_at DESC LIMIT 1) AS decided_by
    FROM visible v
    WHERE p_from IS NULL OR v.created_at >= p_from
  ),
  decisions AS (
    SELECT d.decision, d.decided_at
    FROM credit_decisions d JOIN visible v ON v.id = d.application_id
    WHERE d.decided_at >= current_date - 29
  ),
  first_inst AS (
    SELECT s.loan_id, s.due_date, s.cleared_on, s.days_late
    FROM loan_status_snapshot s
    JOIN loan_accounts l ON l.id = s.loan_id
    JOIN visible v ON v.id = l.application_id
    WHERE s.installment_no = 1 AND s.due_date <= current_date - 30
  )
  SELECT jsonb_build_object(
    'from', p_from,
    'includes_real', v_real,
    'totals', (SELECT jsonb_build_object(
        'total', count(*),
        'synthetic', count(*) FILTER (WHERE origin = 'SYNTHETIC'),
        'approved', count(*) FILTER (WHERE status IN ('APPROVED', 'DISBURSED')),
        'rejected', count(*) FILTER (WHERE status = 'REJECTED'),
        'pending', count(*) FILTER (WHERE status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')),
        'decided', count(*) FILTER (WHERE status IN ('APPROVED', 'DISBURSED', 'REJECTED')),
        'straight_through', count(*) FILTER (WHERE status IN ('APPROVED', 'DISBURSED', 'REJECTED') AND decided_by = 'SYSTEM'),
        'prior_total', CASE WHEN p_from IS NULL THEN NULL ELSE
                         (SELECT count(*) FROM visible p WHERE p.created_at >= v_prior AND p.created_at < p_from) END)
      FROM inrange),
    'funnel', (SELECT jsonb_build_object(
        'sent', count(*),
        'documents', count(*) FILTER (WHERE i.documents_submitted_at IS NOT NULL
                                         OR EXISTS (SELECT 1 FROM documents d WHERE d.application_id = i.id)),
        'bureau', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM bureau_reports b WHERE b.application_id = i.id)),
        'approved', count(*) FILTER (WHERE i.status IN ('APPROVED', 'DISBURSED')),
        'disbursed', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM loan_accounts l WHERE l.application_id = i.id)))
      FROM inrange i),
    'tat', (SELECT coalesce(jsonb_agg(w ORDER BY w->>'week_start'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('week_start', to_char(date_trunc('week', i.final_decision_at), 'YYYY-MM-DD'),
                                  'cases', count(*),
                                  'avg_hours', round(avg(extract(epoch FROM i.final_decision_at - coalesce(i.customer_submitted_at, i.created_at)) / 3600)::numeric, 1)) AS w
        FROM inrange i
        WHERE i.final_decision_at IS NOT NULL AND i.final_decision_at >= date_trunc('week', now()) - interval '7 weeks'
        GROUP BY date_trunc('week', i.final_decision_at)) t),
    'trend', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'approved', coalesce(x.approved, 0),
                                                           'review', coalesce(x.review, 0), 'rejected', coalesce(x.rejected, 0))
                                        ORDER BY d.day), '[]'::jsonb)
      FROM (SELECT to_char(g, 'YYYY-MM-DD') AS day FROM generate_series(current_date - 29, current_date, interval '1 day') g) d
      LEFT JOIN (SELECT to_char(decided_at, 'YYYY-MM-DD') AS day,
                        count(*) FILTER (WHERE decision = 'APPROVE') AS approved,
                        count(*) FILTER (WHERE decision NOT IN ('APPROVE', 'REJECT')) AS review,
                        count(*) FILTER (WHERE decision = 'REJECT') AS rejected
                 FROM decisions GROUP BY 1) x ON x.day = d.day),
    'fpd', (SELECT jsonb_build_object(
        'loans', count(*),
        'defaults', count(*) FILTER (WHERE coalesce(days_late, current_date - due_date) > 30),
        'pct', round(100.0 * count(*) FILTER (WHERE coalesce(days_late, current_date - due_date) > 30) / nullif(count(*), 0), 2))
      FROM first_inst),
    'my_queue', (SELECT coalesce(jsonb_agg(q ORDER BY q->>'since'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('application_id', v.application_id, 'full_name', c.full_name, 'status', v.status,
                                  'since', coalesce(v.customer_submitted_at, v.created_at), 'origin', v.origin,
                                  'recommendation', (SELECT r.recommendation FROM recommendations r WHERE r.application_id = v.id
                                                     ORDER BY r.created_at DESC LIMIT 1)) AS q
        FROM visible v JOIN customers c ON c.id = v.customer_id
        WHERE v_cases AND v_me IS NOT NULL AND v.assigned_officer_id = v_me
          AND v.status IN ('SUBMITTED', 'UNDER_ASSESSMENT', 'UNDER_REVIEW')
        ORDER BY coalesce(v.customer_submitted_at, v.created_at) LIMIT 5) t),
    'exceptions', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('application_id', v.application_id, 'full_name', c.full_name, 'origin', v.origin,
                                  'created_at', v.created_at,
                                  'loan_amount', coalesce(v.loan_amount_requested, q.loan_amount_requested),
                                  'dealer_name', coalesce(dl.dealer_name, q.dealer_name),
                                  'engine_score', (SELECT e.score FROM engine_decisions e WHERE e.application_id = v.id
                                                   ORDER BY e.decided_at DESC LIMIT 1),
                                  'reason', coalesce(
                                    (SELECT string_agg(f->>'rule_name', ', ')
                                     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lr.risk_factors) = 'array'
                                                                    THEN lr.risk_factors ELSE '[]'::jsonb END) f
                                     WHERE f->>'result' = 'FAIL'),
                                    lr.summary_text)) AS x
        FROM visible v
        JOIN customers c ON c.id = v.customer_id
        LEFT JOIN vehicles vh ON vh.application_id = v.id
        LEFT JOIN dealers dl ON dl.id = vh.dealer_id
        LEFT JOIN vehicle_quotations q ON q.application_id = v.id AND vh.id IS NULL
        LEFT JOIN LATERAL (SELECT r.risk_factors, r.summary_text FROM recommendations r WHERE r.application_id = v.id
                           ORDER BY r.created_at DESC LIMIT 1) lr ON true
        WHERE v_cases AND v.status = 'UNDER_REVIEW'
        ORDER BY v.created_at DESC LIMIT 10) t),
    'activity', (SELECT coalesce(jsonb_agg(e ORDER BY e->>'created_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', ev.id, 'event_type', ev.event_type, 'created_at', ev.created_at,
                                  'application_id', a.application_id,
                                  'actor', CASE WHEN u.full_name IS NOT NULL THEN u.full_name
                                                WHEN ev.actor_type = 'CUSTOMER' THEN 'Customer' ELSE 'System' END) AS e
        FROM audit_events ev
        LEFT JOIN applications a ON a.id = ev.application_id
        LEFT JOIN users u ON u.id = ev.actor_id
        WHERE v_cases AND ev.application_id IS NOT NULL
          AND ev.event_type NOT IN ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PII_REVEAL')
          AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
        ORDER BY ev.created_at DESC LIMIT 7) t)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_dashboard(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_dashboard(TIMESTAMPTZ) TO authenticated;

-- Check after running (as postgres, so every case counts):
-- SELECT fn_staff_dashboard(now() - interval '30 days')->'totals';
