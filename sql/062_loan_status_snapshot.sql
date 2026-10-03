-- =============================================================================
-- 062: Loan portfolio reads a stored status, not the whole history (fix list C6)
-- =============================================================================
-- The Loan portfolio page (and the dashboard's Portfolio quality box) did not
-- load on the live site. fn_staff_loan_portfolio (058) replayed the repayment
-- history of every loan on every visit, and then matched every loan against
-- every installment of the book, four times over. With 628 loans that ran past
-- the 8-second limit Supabase gives a signed-in request.
--
-- Now:
--   * loan_status_snapshot keeps each installment's status (paid, cleared on,
--     days late, bounces) exactly as fn_loan_installment_status (029) works
--     it out. Days overdue *today* are still counted at read time, so the
--     figures move with the calendar without a refresh.
--   * a loan is marked for refresh (loan_status_stale) whenever one of its
--     installments or payments is added, changed or removed
--   * fn_loan_status_refresh(limit) brings marked loans up to date; it runs
--     once below for the whole book, at the start of each portfolio read (up
--     to 200 loans), and from the daily simulation (G7)
--   * fn_staff_loan_portfolio reads the snapshot with one grouped pass and
--     says how many loans were still waiting for a refresh (stale_loans)
--
-- Same rights and privacy rule as 058. Both new tables are closed to the API.
--
-- Run order: after 061. Safe to re-run. The first run fills the snapshot for
-- every loan (a few seconds for ~600 loans).
-- =============================================================================

CREATE TABLE IF NOT EXISTS loan_status_snapshot (
  loan_id        UUID          NOT NULL REFERENCES loan_accounts(id) ON DELETE CASCADE,
  installment_no SMALLINT      NOT NULL,
  due_date       DATE          NOT NULL,
  amount_due     DECIMAL(12,2) NOT NULL,
  principal_due  DECIMAL(12,2),
  amount_paid    DECIMAL(12,2) NOT NULL,
  shortfall      DECIMAL(12,2) NOT NULL,
  cleared_on     DATE,
  days_late      INTEGER,
  attempts       INTEGER       NOT NULL,
  bounces        INTEGER       NOT NULL,
  refreshed_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_loan_status_snapshot PRIMARY KEY (loan_id, installment_no)
);

CREATE TABLE IF NOT EXISTS loan_status_stale (
  loan_id   UUID        NOT NULL REFERENCES loan_accounts(id) ON DELETE CASCADE,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_loan_status_stale PRIMARY KEY (loan_id)
);

ALTER TABLE loan_status_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_status_stale ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loan_status_snapshot, loan_status_stale FROM anon, authenticated;

-- Mark the loan whenever its schedule or its payments change.
CREATE OR REPLACE FUNCTION fn_mark_loan_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.loan_id ELSE NEW.loan_id END;
BEGIN
  -- a loan being removed (synthetic purge) needs no refresh
  IF EXISTS (SELECT 1 FROM loan_accounts WHERE id = v_loan) THEN
    INSERT INTO loan_status_stale (loan_id) VALUES (v_loan) ON CONFLICT (loan_id) DO NOTHING;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.loan_id IS DISTINCT FROM NEW.loan_id
     AND EXISTS (SELECT 1 FROM loan_accounts WHERE id = OLD.loan_id) THEN
    INSERT INTO loan_status_stale (loan_id) VALUES (OLD.loan_id) ON CONFLICT (loan_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_loan_installments_stale ON loan_installments;
CREATE TRIGGER trg_loan_installments_stale AFTER INSERT OR UPDATE OR DELETE ON loan_installments
  FOR EACH ROW EXECUTE FUNCTION fn_mark_loan_stale();
DROP TRIGGER IF EXISTS trg_loan_repayments_stale ON loan_repayments;
CREATE TRIGGER trg_loan_repayments_stale AFTER INSERT OR UPDATE OR DELETE ON loan_repayments
  FOR EACH ROW EXECUTE FUNCTION fn_mark_loan_stale();

-- Bring marked loans up to date, oldest mark first. NULL limit = all of them.
-- Returns how many loans were refreshed.
CREATE OR REPLACE FUNCTION fn_loan_status_refresh(p_limit INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan UUID;
  v_n    INTEGER := 0;
BEGIN
  FOR v_loan IN
    SELECT s.loan_id FROM loan_status_stale s ORDER BY s.marked_at, s.loan_id LIMIT p_limit
  LOOP
    DELETE FROM loan_status_snapshot WHERE loan_id = v_loan;
    INSERT INTO loan_status_snapshot (loan_id, installment_no, due_date, amount_due, principal_due, amount_paid,
                                      shortfall, cleared_on, days_late, attempts, bounces)
    SELECT v_loan, s.installment_no, s.due_date, s.amount_due, i.principal_due, s.amount_paid,
           s.shortfall, s.cleared_on, s.days_late, s.attempts, s.bounces
    FROM fn_loan_installment_status(v_loan) s
    JOIN loan_installments i ON i.loan_id = v_loan AND i.installment_no = s.installment_no;
    DELETE FROM loan_status_stale WHERE loan_id = v_loan;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION fn_mark_loan_stale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_loan_status_refresh(INTEGER) FROM PUBLIC, anon, authenticated;

-- 058's function, reading the snapshot. Same keys, plus stale_loans.
CREATE OR REPLACE FUNCTION fn_staff_loan_portfolio(p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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

  -- catch up on loans paid since the last read; a large backlog is left to the daily run
  PERFORM fn_loan_status_refresh(200);

  WITH loans AS (
    SELECT l.id, l.loan_account_no, l.disbursed_on, l.disbursed_amount, l.emi_amount, l.tenure_months, l.status,
           a.application_id, coalesce(a.origin, 'REAL') AS origin,
           br.score AS bureau_score, r.recommendation
    FROM loan_accounts l
    LEFT JOIN applications a ON a.id = l.application_id
    LEFT JOIN LATERAL (SELECT b.score FROM bureau_reports b WHERE b.application_id = l.application_id
                       ORDER BY b.created_at DESC LIMIT 1) br ON true
    LEFT JOIN LATERAL (SELECT rr.recommendation FROM recommendations rr WHERE rr.application_id = l.application_id
                       ORDER BY rr.created_at DESC LIMIT 1) r ON true
    WHERE l.disbursed_on <= p_as_of
      AND (v_real OR a.origin = 'SYNTHETIC')
  ),
  inst AS (
    SELECT s.* FROM loan_status_snapshot s JOIN loans lo ON lo.id = s.loan_id
  ),
  agg AS (
    SELECT x.loan_id,
           -- overdue today: the oldest installment due and not cleared by the as-of date
           max(p_as_of - x.due_date) FILTER (WHERE x.due_date < p_as_of AND (x.cleared_on IS NULL OR x.cleared_on > p_as_of)) AS dpd_now,
           sum(x.shortfall) FILTER (WHERE x.due_date < p_as_of AND x.cleared_on IS NULL) AS overdue_amount,
           sum(x.principal_due) FILTER (WHERE x.cleared_on IS NULL OR x.cleared_on > p_as_of) AS principal_left,
           -- worst lateness ever: cleared late, or still unpaid
           max(coalesce(x.days_late, p_as_of - x.due_date)) FILTER (WHERE x.due_date < p_as_of) AS worst_dpd,
           count(*) FILTER (WHERE x.due_date < p_as_of) AS due_count
    FROM inst x GROUP BY x.loan_id
  ),
  per_loan AS (
    SELECT lo.*, coalesce(g.dpd_now, 0) AS dpd_now, coalesce(g.overdue_amount, 0) AS overdue_amount,
           coalesce(g.principal_left, 0) AS principal_left, coalesce(g.worst_dpd, 0) AS worst_dpd,
           coalesce(g.due_count, 0) AS due_count
    FROM loans lo LEFT JOIN agg g ON g.loan_id = lo.id
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
    'stale_loans', (SELECT count(*) FROM loan_status_stale),
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
        FROM inst x
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

-- Data step: mark every loan without a snapshot, then fill the whole book once.
INSERT INTO loan_status_stale (loan_id)
SELECT l.id FROM loan_accounts l
WHERE NOT EXISTS (SELECT 1 FROM loan_status_snapshot s WHERE s.loan_id = l.id)
ON CONFLICT (loan_id) DO NOTHING;
SELECT fn_loan_status_refresh(NULL);

-- Checks after running:
-- SELECT count(*) FROM loan_status_stale;                                   -- 0
-- SELECT count(DISTINCT loan_id) FROM loan_status_snapshot;                 -- the number of loans with a schedule (628 on 3 Oct)
-- SELECT fn_staff_loan_portfolio()->'totals';                               -- answers in well under a second
