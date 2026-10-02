-- =============================================================================
-- 058: Loan portfolio view
-- =============================================================================
-- One read-only function for the Portfolio page: how the disbursed book is
-- paying today. It reads the repayment history (029) through
-- fn_loan_installment_status, so "late" means exactly what the credit rules
-- mean by it.
--
--   * overdue buckets today: current, 1-30, 31-60, 61-90, 90+ days, with the
--     principal still owed in each
--   * bounce rate by month, last 12 months of due dates
--   * vintages: loans grouped by the quarter they were paid out, with how many
--     have ever been 30+ days late
--   * late rate by bureau score band at approval, and by the engine's grade
--   * the loans most overdue right now
--
-- Who sees what: staff who can view cases or work on policy. Loans of real
-- customers are counted only for staff who may see real customers
-- (fn_sees_real_customers); the public demo login sees synthetic loans only.
--
-- Run order: after 057. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_loan_portfolio(p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_result JSONB;
BEGIN
  -- the same rights fn_loan_installment_status asks for, less a customer's own
  PERFORM fn_require_any_permission(ARRAY['app.view.team', 'app.view.all', 'policy.simulate', 'policy.author', 'policy.approve']);
  v_real := fn_sees_real_customers();

  WITH loans AS (
    SELECT l.id, l.loan_account_no, l.disbursed_on, l.disbursed_amount, l.emi_amount, l.tenure_months, l.status,
           a.application_id, coalesce(a.origin, 'REAL') AS origin,
           br.score AS bureau_score, r.recommendation
    FROM loan_accounts l
    LEFT JOIN applications a ON a.id = l.application_id
    LEFT JOIN bureau_reports br ON br.application_id = l.application_id
    LEFT JOIN LATERAL (SELECT rr.recommendation FROM recommendations rr WHERE rr.application_id = l.application_id
                       ORDER BY rr.created_at DESC LIMIT 1) r ON true
    WHERE l.disbursed_on <= p_as_of
      AND (v_real OR a.origin = 'SYNTHETIC')
  ),
  inst AS (
    SELECT lo.id AS loan_id, s.*, i.principal_due
    FROM loans lo
    CROSS JOIN LATERAL fn_loan_installment_status(lo.id) s
    JOIN loan_installments i ON i.loan_id = lo.id AND i.installment_no = s.installment_no
  ),
  per_loan AS (
    SELECT lo.*,
           -- overdue today: the oldest installment due and not cleared by the as-of date
           coalesce((SELECT max(p_as_of - x.due_date) FROM inst x
                     WHERE x.loan_id = lo.id AND x.due_date < p_as_of
                       AND (x.cleared_on IS NULL OR x.cleared_on > p_as_of)), 0) AS dpd_now,
           coalesce((SELECT sum(x.shortfall) FROM inst x
                     WHERE x.loan_id = lo.id AND x.due_date < p_as_of AND x.cleared_on IS NULL), 0) AS overdue_amount,
           coalesce((SELECT sum(x.principal_due) FROM inst x
                     WHERE x.loan_id = lo.id AND (x.cleared_on IS NULL OR x.cleared_on > p_as_of)), 0) AS principal_left,
           -- worst lateness ever: cleared late, or still unpaid
           coalesce((SELECT max(coalesce(x.days_late, p_as_of - x.due_date)) FROM inst x
                     WHERE x.loan_id = lo.id AND x.due_date < p_as_of), 0) AS worst_dpd,
           (SELECT count(*) FROM inst x WHERE x.loan_id = lo.id AND x.due_date < p_as_of) AS due_count
    FROM loans lo
  ),
  bucketed AS (
    SELECT p.*,
           CASE WHEN p.dpd_now = 0 THEN 'Current'
                WHEN p.dpd_now <= 30 THEN '1-30'
                WHEN p.dpd_now <= 60 THEN '31-60'
                WHEN p.dpd_now <= 90 THEN '61-90'
                ELSE '90+' END AS bucket,
           CASE WHEN p.bureau_score IS NULL THEN 'No score'
                WHEN p.bureau_score < 700 THEN 'Below 700'
                WHEN p.bureau_score < 750 THEN '700-749'
                ELSE '750+' END AS score_band
    FROM per_loan p
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'includes_real', v_real,
    'totals', (SELECT jsonb_build_object(
        'loans', count(*),
        'synthetic', count(*) FILTER (WHERE origin = 'SYNTHETIC'),
        'disbursed', coalesce(sum(disbursed_amount), 0),
        'principal_left', coalesce(sum(principal_left), 0),
        'overdue_amount', coalesce(sum(overdue_amount), 0),
        'loans_overdue', count(*) FILTER (WHERE dpd_now > 0),
        'ever_30_plus', count(*) FILTER (WHERE worst_dpd > 30),
        'par_30_pct', round(100.0 * coalesce(sum(principal_left) FILTER (WHERE dpd_now > 30), 0) / nullif(sum(principal_left), 0), 2))
      FROM bucketed),
    'buckets', (SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', b.name, 'loans', coalesce(x.loans, 0),
                                                              'principal_left', coalesce(x.principal_left, 0)) ORDER BY b.ord), '[]'::jsonb)
      FROM (VALUES (1, 'Current'), (2, '1-30'), (3, '31-60'), (4, '61-90'), (5, '90+')) b(ord, name)
      LEFT JOIN (SELECT bucket, count(*) AS loans, sum(principal_left) AS principal_left FROM bucketed GROUP BY bucket) x
        ON x.bucket = b.name),
    'bounces_by_month', (SELECT coalesce(jsonb_agg(m ORDER BY m->>'month'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('month', to_char(date_trunc('month', x.due_date), 'YYYY-MM'),
                                  'due', count(*),
                                  'bounced', count(*) FILTER (WHERE x.bounces > 0),
                                  'bounce_pct', round(100.0 * count(*) FILTER (WHERE x.bounces > 0) / count(*), 2)) AS m
        FROM inst x JOIN loans lo ON lo.id = x.loan_id
        WHERE x.due_date < p_as_of AND x.due_date >= date_trunc('month', p_as_of) - interval '12 months'
        GROUP BY date_trunc('month', x.due_date)) t),
    'vintages', (SELECT coalesce(jsonb_agg(v ORDER BY v->>'quarter'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('quarter', to_char(date_trunc('quarter', disbursed_on), 'YYYY') || '-Q' || extract(quarter FROM disbursed_on),
                                  'loans', count(*),
                                  'disbursed', sum(disbursed_amount),
                                  'avg_months_on_book', round(avg(due_count), 1),
                                  'ever_30_plus', count(*) FILTER (WHERE worst_dpd > 30),
                                  'ever_30_plus_pct', round(100.0 * count(*) FILTER (WHERE worst_dpd > 30) / count(*), 2)) AS v
        FROM bucketed GROUP BY date_trunc('quarter', disbursed_on), extract(quarter FROM disbursed_on), to_char(date_trunc('quarter', disbursed_on), 'YYYY')) t),
    'by_score_band', (SELECT coalesce(jsonb_agg(jsonb_build_object('band', b.name, 'loans', coalesce(x.loans, 0),
                                                                    'ever_30_plus', coalesce(x.bad, 0),
                                                                    'ever_30_plus_pct', x.pct) ORDER BY b.ord), '[]'::jsonb)
      FROM (VALUES (1, 'Below 700'), (2, '700-749'), (3, '750+'), (4, 'No score')) b(ord, name)
      LEFT JOIN (SELECT score_band, count(*) AS loans, count(*) FILTER (WHERE worst_dpd > 30) AS bad,
                        round(100.0 * count(*) FILTER (WHERE worst_dpd > 30) / count(*), 2) AS pct
                 FROM bucketed GROUP BY score_band) x ON x.score_band = b.name
      WHERE b.name <> 'No score' OR x.loans > 0),
    'by_recommendation', (SELECT coalesce(jsonb_agg(jsonb_build_object('recommendation', recommendation, 'loans', loans,
                                                                        'ever_30_plus', bad, 'ever_30_plus_pct', pct) ORDER BY recommendation), '[]'::jsonb)
      FROM (SELECT coalesce(recommendation, 'NONE') AS recommendation, count(*) AS loans,
                   count(*) FILTER (WHERE worst_dpd > 30) AS bad,
                   round(100.0 * count(*) FILTER (WHERE worst_dpd > 30) / count(*), 2) AS pct
            FROM bucketed GROUP BY 1) t),
    'attention', (SELECT coalesce(jsonb_agg(a ORDER BY (a->>'dpd_now')::int DESC, a->>'loan_account_no'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('loan_account_no', loan_account_no, 'application_id', application_id,
                                  'synthetic', origin = 'SYNTHETIC', 'disbursed_on', disbursed_on,
                                  'dpd_now', dpd_now, 'overdue_amount', overdue_amount,
                                  'principal_left', principal_left, 'emi', emi_amount, 'bureau_score', bureau_score) AS a
        FROM bucketed WHERE dpd_now > 0 ORDER BY dpd_now DESC, loan_account_no LIMIT 15) t)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_loan_portfolio(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_loan_portfolio(DATE) TO authenticated;
