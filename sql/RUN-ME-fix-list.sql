-- =============================================================================
-- RUN-ME: the fix-list migrations 061-080, in order, in one file
-- =============================================================================
-- Built 3 Oct 2026 from the separate sql/NNN files (which stay the source:
-- each one explains itself in its header). Run this in the Supabase SQL editor.
--
-- BEFORE YOU RUN
--   1. Switch on pg_cron: Database > Extensions > pg_cron. 075 (daily
--      simulation) and 079 (weekly settings backup) schedule their jobs only
--      if it is on; without it they say so and skip the job.
--   2. Run the whole file at once. The SQL editor runs it as one transaction:
--      if any part fails, nothing is changed. Then stop and send the red error.
--      (Or run part by part, in order: each part starts with a PART line.)
--
-- AFTER IT RUNS
--   The last result shows every part with ok = true. Each part also has its
--   own check right after it. No check reads any customer's details.
--   With pg_cron on, also run:  SELECT jobname, schedule FROM cron.job;
--   it should list cercit-simulation-daily and cercit-settings-backup-weekly.
--   Then tick each file in docs/migration-run-log.md.
--
-- THEN, OUTSIDE THE DATABASE (see docs/practice-logins.md, docs/data-protection.md,
-- docs/production-checklist.md)
--   * create the 3 practice logins and the GitHub secret VITE_PRACTICE_PASSWORD (072, D3)
--   * add the GitHub secrets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the backup copy (079, H7)
--   * merge the pull request so the website matches the database
--
-- Every part is safe to run twice.
--
-- PARTS
--   061  Application Review reads through one staff function (fix list C5)
--   062  Loan portfolio reads a stored status, not the whole history (fix list C6)
--   063  Policy Rules page reads the real rules through a function (fix list C7)
--   064  Dashboard figures through one staff function (fix list C10)
--   065  Audit Log, one combined and filtered log (fix list C1 + G6)
--   066  Applications list a page at a time, searched in the database (fix list C4)
--   067  The signed-in person's rights, for the menu and buttons (fix list B1, B3)
--   068  Officers see their own cases; user limits enforced; old roles retired
--   069  A real Employer Master, with checks behind each field (fix list G4, C9)
--   070  Employer category in the credit engine and on the officer's card (fix list C8)
--   071  Rate Grid: edit and add grids, through pricing approval (fix list G3)
--   072  Practice logins for visitors: officer, manager, head (fix list D1)
--   073  Reset the practice cases to fresh (fix list D2)
--   074  Policy Rules: switch a rule on or off, modify its limit, through approval (fix list G2)
--   075  Daily simulation: the synthetic book keeps moving by itself (fix list G7)
--   076  Save today's settings as the defaults; reset all settings in one click (fix list G1)
--   077  The live risk score reads the inputs the model was trained on (fix list E1)
--   078  Fix what the security and performance checks flag (fix list H3)
--   079  Weekly backup of the settings and policy tables (fix list H7)
--   080  Erase a customer's personal data on request; how long data is kept (fix list H6, database part)
-- =============================================================================


-- #############################################################################
-- PART 061: Application Review reads through one staff function (fix list C5)  (sql/061_staff_application_review.sql)
-- #############################################################################

-- =============================================================================
-- 061: Application Review reads through one staff function (fix list C5)
-- =============================================================================
-- The Application Review page read `applications`, `customers`,
-- `obligation_details`, `bureau_reports`, the bank tables and `audit_events`
-- straight from the browser. Signed-in staff have no read right on those
-- tables (privacy rules), so the page never loaded on the live site: it waited
-- on "Loading application..." for ever.
--
-- fn_staff_application_review(application_id) returns the whole case in one
-- call, as JSON:
--   * case: the case, applicant (PAN and mobile masked), car, latest
--     recommendation, decision and bureau score
--   * obligations: loans found on the bureau or declared
--   * bureau: the latest bureau summary (null if none)
--   * bank: the latest bank statement summary and its transactions (null if none)
--   * timeline: the case's audit events, oldest first, with who did each
--   * duplicates: other applications with the same PAN or mobile (by blind
--     index; up to 5), shown with the same privacy rule
--
-- Same rules as the Applications list: any app.view right, a real customer's
-- case only for staff who may see real customers (fn_sees_real_customers), and
-- for officers only their own or unassigned cases (fn_staff_case_scope, below).
-- Otherwise "application not found".
--
-- Also here, because every list after it uses it (fix list B2): which cases a
-- staff member sees. fn_staff_case_scope() answers once per call:
--   * sees_all: credit managers, heads, compliance, admins, the demo login
--     (app.view.team or app.view.all) and the SQL editor see every case
--   * otherwise (officers, app.view.own) only cases assigned to them, plus
--     cases nobody has taken yet when the setting officers_see_unassigned is 1
--     (the default, so new work is never invisible; set it to 0 to hide them)
-- The real-customer rule (fn_sees_real_customers) applies on top, as before.
--
-- Read only. Run order: after 060. Safe to re-run.
-- =============================================================================

INSERT INTO security_settings (setting_key, value, description) VALUES
  ('officers_see_unassigned', 1, '1 = officers (own cases only) also see cases nobody has taken yet, so they can pick them up; 0 = only cases assigned to them')
ON CONFLICT (setting_key) DO UPDATE SET description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION fn_staff_case_scope(OUT sees_all BOOLEAN, OUT me UUID, OUT unassigned BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  sees_all := fn_is_trusted_operator() OR fn_has_permission('app.view.all') OR fn_has_permission('app.view.team');
  me := fn_current_staff_id();
  unassigned := coalesce((SELECT value FROM security_settings WHERE setting_key = 'officers_see_unassigned'), 1) = 1;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_case_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_case_scope() TO authenticated;

CREATE OR REPLACE FUNCTION fn_staff_application_review(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_app    applications%ROWTYPE;
  v_cust   customers%ROWTYPE;
  v_bank   bank_statement_analyses%ROWTYPE;
  v_case   JSONB;
  v_scope  RECORD;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real := fn_sees_real_customers();

  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_scope FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT v_real)
     OR NOT (v_scope.sees_all OR v_app.assigned_officer_id = v_scope.me
             OR (v_app.assigned_officer_id IS NULL AND v_scope.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_cust FROM customers WHERE id = v_app.customer_id;

  SELECT jsonb_build_object(
    'application_id', v_app.application_id,
    'origin', v_app.origin,
    'status', v_app.status,
    'created_at', v_app.created_at,
    'full_name', v_cust.full_name,
    'email', v_cust.email,
    'mobile', fn_pii_mask(v_cust.mobile_last4, 10),
    'pan_number', fn_pii_mask(v_cust.pan_last4, 10),
    'age_at_application', v_cust.age_at_application,
    'employer_name', v_cust.employer_name,
    'city', v_cust.city,
    'state_code', v_cust.state_code,
    'address_line1', v_cust.address_line1,
    'address_line2', v_cust.address_line2,
    'pincode', v_cust.pincode,
    'designation', v_cust.designation,
    'residence_type', v_cust.residence_type,
    'years_in_current_job', v_cust.years_in_current_job,
    'total_work_experience_years', v_cust.total_work_experience_years,
    'salary_bank_name', v_cust.salary_bank_name,
    'loan_amount_requested', coalesce(v_app.loan_amount_requested, q.loan_amount_requested),
    'tenure_months', coalesce(v_app.tenure_months, q.tenure_months),
    'declared_net_salary', v_app.declared_net_salary,
    'vehicle_make', coalesce(v.make, q.make),
    'vehicle_model', coalesce(v.model, q.model),
    'vehicle_variant', coalesce(v.variant, q.variant),
    'ex_showroom_price', coalesce(v.ex_showroom_price, q.ex_showroom),
    'on_road_price', coalesce(v.on_road_price, q.on_road),
    'dealer_name', coalesce(d.dealer_name, q.dealer_name),
    'cibil_score', br.score,
    'decision', coalesce(r.recommendation, cd.decision),
    'final_decision', cd.decision,
    'rate', coalesce(r.recommended_rate, cd.sanctioned_rate),
    'foir_pct', r.foir_calculated,
    'ltv_pct', r.ltv_calculated,
    'risk_factors', coalesce(r.risk_factors, '[]'::jsonb),
    'summary_text', r.summary_text,
    'policy_version', (SELECT pv.version_code FROM policy_versions pv WHERE pv.id = r.policy_version_id),
    'rules_snapshot', r.rules_snapshot,
    'model_version', r.model_version,
    'version_basis', r.version_basis,
    'officer_name', u.full_name
  ) INTO v_case
  FROM (SELECT 1) one
  LEFT JOIN vehicles v ON v.application_id = v_app.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN vehicle_quotations q ON q.application_id = v_app.id AND v.id IS NULL
  LEFT JOIN LATERAL (SELECT x.score FROM bureau_reports x WHERE x.application_id = v_app.id
                     ORDER BY x.created_at DESC LIMIT 1) br ON true
  LEFT JOIN LATERAL (SELECT x.decision, x.sanctioned_rate FROM credit_decisions x WHERE x.application_id = v_app.id
                     ORDER BY x.decided_at DESC NULLS LAST LIMIT 1) cd ON true
  LEFT JOIN LATERAL (SELECT x.* FROM recommendations x WHERE x.application_id = v_app.id
                     ORDER BY x.created_at DESC LIMIT 1) r ON true
  LEFT JOIN users u ON u.id = v_app.assigned_officer_id
  LIMIT 1;

  SELECT * INTO v_bank FROM bank_statement_analyses WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'case', v_case,
    'obligations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'lender_name', o.lender_name, 'obligation_type', o.obligation_type,
                       'monthly_emi', o.monthly_emi, 'outstanding_amount', o.outstanding_amount,
                       'dpd_current', o.dpd_current, 'source', o.source) ORDER BY o.created_at), '[]'::jsonb)
                    FROM obligation_details o WHERE o.application_id = v_app.id),
    'bureau', (SELECT jsonb_build_object(
                 'bureau_name', b.bureau_name, 'score', b.score, 'no_hit', b.no_hit,
                 'active_accounts', b.active_accounts, 'total_outstanding', b.total_outstanding,
                 'total_monthly_emi', b.total_monthly_emi, 'enquiry_count_90d', b.enquiry_count_90d,
                 'dpd_max_12m', b.dpd_max_12m, 'dpd_max_24m', b.dpd_max_24m,
                 'dpd_30_count_24m', b.dpd_30_count_24m, 'dpd_60_plus_flag', b.dpd_60_plus_flag,
                 'writeoff_count_5y', b.writeoff_count_5y, 'settled_count_5y', b.settled_count_5y,
                 'credit_utilization_pct', b.credit_utilization_pct,
                 'oldest_account_months', b.oldest_account_months,
                 'pulled_at', coalesce(b.pulled_at, b.created_at))
               FROM bureau_reports b WHERE b.application_id = v_app.id
               ORDER BY b.created_at DESC LIMIT 1),
    'bank', CASE WHEN v_bank.id IS NULL THEN NULL ELSE jsonb_build_object(
               'bank_name', v_bank.bank_name,
               'months_covered', v_bank.months_covered,
               'avg_monthly_balance', v_bank.avg_monthly_balance,
               'avg_salary_credit', v_bank.avg_salary_credit,
               'salary_regularity', v_bank.salary_regularity,
               'total_emi_debits', v_bank.total_emi_debits,
               'bounce_count_6m', v_bank.bounce_count_6m,
               'cash_deposit_total_6m', v_bank.cash_deposit_total_6m,
               'transactions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                   'txn_date', t.txn_date, 'txn_type', t.txn_type, 'amount', t.amount,
                                   'balance_after', t.balance_after, 'description', t.description,
                                   'category', t.category) ORDER BY t.txn_date, t.created_at), '[]'::jsonb)
                                FROM bank_transactions t WHERE t.analysis_id = v_bank.id))
             END,
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'event_type', e.event_type, 'created_at', e.created_at,
                    'actor', CASE WHEN u.full_name IS NOT NULL THEN u.full_name
                                  WHEN e.actor_type = 'CUSTOMER' THEN 'Customer'
                                  ELSE 'System' END,
                    'detail', e.event_detail) ORDER BY e.created_at, e.id), '[]'::jsonb)
                 FROM audit_events e
                 LEFT JOIN users u ON u.id = e.actor_id
                 WHERE e.application_id = v_app.id),
    'duplicates', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
                     SELECT jsonb_build_object(
                              'application_id', a2.application_id, 'full_name', c2.full_name, 'status', a2.status,
                              'match_field', CASE WHEN c2.pan_hash = v_cust.pan_hash THEN 'PAN' ELSE 'Mobile' END) AS x
                     FROM applications a2
                     JOIN customers c2 ON c2.id = a2.customer_id
                     WHERE a2.id <> v_app.id
                       AND ((v_cust.pan_hash IS NOT NULL AND c2.pan_hash = v_cust.pan_hash)
                         OR (v_cust.mobile_hash IS NOT NULL AND c2.mobile_hash = v_cust.mobile_hash))
                       AND (a2.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
                     ORDER BY a2.created_at DESC
                     LIMIT 5) dup)
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_application_review(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_application_review(TEXT) TO authenticated;

-- Check after running:
-- SELECT has_function_privilege('authenticated', 'fn_staff_application_review(text)', 'execute');   -- true

-- CHECK 061: Application Review function
SELECT '061' AS part, 'Application Review function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_application_review') AND EXISTS (SELECT 1 FROM security_settings WHERE setting_key = 'officers_see_unassigned')) AS ok;

-- #############################################################################
-- PART 062: Loan portfolio reads a stored status, not the whole history (fix list C6)  (sql/062_loan_status_snapshot.sql)
-- #############################################################################

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

-- CHECK 062: loan status snapshot
SELECT '062' AS part, 'loan status snapshot' AS what, (to_regclass('public.loan_status_snapshot') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_loan_status_refresh')) AS ok;

-- #############################################################################
-- PART 063: Policy Rules page reads the real rules through a function (fix list C7)  (sql/063_staff_policy_rules.sql)
-- #############################################################################

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

-- CHECK 063: Policy Rules function
SELECT '063' AS part, 'Policy Rules function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_policy_rules')) AS ok;

-- #############################################################################
-- PART 064: Dashboard figures through one staff function (fix list C10)  (sql/064_staff_dashboard.sql)
-- #############################################################################

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

-- CHECK 064: Dashboard function
SELECT '064' AS part, 'Dashboard function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_dashboard')) AS ok;

-- #############################################################################
-- PART 065: Audit Log, one combined and filtered log (fix list C1 + G6)  (sql/065_audit_log.sql)
-- #############################################################################

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

-- (the date index it needs, idx_audit_events_created, has been there since 001)

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

-- CHECK 065: Audit Log function
SELECT '065' AS part, 'Audit Log function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_log')) AS ok;

-- #############################################################################
-- PART 066: Applications list a page at a time, searched in the database (fix list C4)  (sql/066_applications_page.sql)
-- #############################################################################

-- =============================================================================
-- 066: Applications list a page at a time, searched in the database (fix list C4)
-- =============================================================================
-- The Applications page was slow to open (Sameer, 2 Oct). It loaded all
-- ~2,000 cases at once through fn_list_applications, then asked for the
-- server engine's decisions by sending every case number in one request (a
-- very long address that can fail), then searched and sorted in the browser.
--
-- fn_list_applications_page(...) does the work in the database and returns
-- one page:
--   * search: case number, applicant name or employer (contains), the last 4
--     of a PAN, or a whole PAN (matched by its blind index, never decrypted)
--   * statuses: a list of database statuses to keep (empty = all)
--   * sort: submitted (default, newest first), name, loan, cibil or status
--   * page / page size (50 by default, at most 200)
-- Each row carries the same columns as fn_list_applications plus the server
-- engine's latest decision, so no second request is needed. The first page
-- is filtered and counted on the cases table alone; the bureau score,
-- decision and car are looked up for the 50 rows shown (or, when sorting by
-- score, for the filtered cases).
--
-- Same visibility as fn_list_applications: any app.view right; a real
-- customer's case only for staff who may see real customers, and never a
-- draft they have not sent; officers see their own and unassigned cases
-- (fn_staff_case_scope, 061; fix list B2).
--
-- Read only. Run order: after 065. Safe to re-run. fn_list_applications stays
-- as it is for the other screens that use it.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_bureau_reports_application ON bureau_reports (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_application ON credit_decisions (application_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS ix_recommendations_application ON recommendations (application_id, created_at DESC);
-- (engine decisions by case and cases by date are already indexed: idx_engine_decisions_app in 033, idx_applications_created in 001)

CREATE OR REPLACE FUNCTION fn_list_applications_page(
  p_search    TEXT    DEFAULT NULL,
  p_statuses  TEXT[]  DEFAULT NULL,
  p_sort      TEXT    DEFAULT 'submitted',
  p_desc      BOOLEAN DEFAULT true,
  p_page      INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_q      TEXT := nullif(btrim(coalesce(p_search, '')), '');
  v_hash   TEXT;
  v_size   INTEGER := LEAST(GREATEST(coalesce(p_page_size, 50), 1), 200);
  v_page   INTEGER := GREATEST(coalesce(p_page, 1), 1);
  v_sort   TEXT := CASE WHEN p_sort IN ('submitted', 'name', 'loan', 'cibil', 'status') THEN p_sort ELSE 'submitted' END;
  v_desc   BOOLEAN := coalesce(p_desc, true);
  v_total  BIGINT;
  v_rows   JSONB;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real := fn_sees_real_customers();
  -- a whole PAN is looked up by its blind index
  IF v_q ~* '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    v_hash := fn_pii_hash(v_q);
  END IF;

  WITH filtered AS (
    SELECT a.id,
           CASE v_sort WHEN 'name' THEN lower(c.full_name) WHEN 'status' THEN a.status END AS sort_text,
           CASE v_sort WHEN 'loan' THEN coalesce(a.loan_amount_requested, q.loan_amount_requested)
                       WHEN 'cibil' THEN (SELECT x.score FROM bureau_reports x WHERE x.application_id = a.id
                                          ORDER BY x.created_at DESC LIMIT 1) END AS sort_num,
           a.created_at
    FROM applications a
    JOIN customers c ON c.id = a.customer_id
    CROSS JOIN fn_staff_case_scope() sc
    LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v_sort = 'loan'
    WHERE (a.origin IS DISTINCT FROM 'CUSTOMER' OR (v_real AND a.status <> 'DRAFT'))
      AND (sc.sees_all OR a.assigned_officer_id = sc.me OR (a.assigned_officer_id IS NULL AND sc.unassigned))
      AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR a.status = ANY (p_statuses))
      AND (v_q IS NULL
           OR a.application_id ILIKE '%' || v_q || '%'
           OR c.full_name ILIKE '%' || v_q || '%'
           OR c.employer_name ILIKE '%' || v_q || '%'
           OR (length(v_q) = 4 AND upper(c.pan_last4) = upper(v_q))
           OR (v_hash IS NOT NULL AND c.pan_hash = v_hash))
  ),
  ordered AS (
    SELECT x.id, row_number() OVER (ORDER BY
             CASE WHEN v_desc THEN x.sort_text END DESC NULLS LAST,
             CASE WHEN NOT v_desc THEN x.sort_text END ASC NULLS LAST,
             CASE WHEN v_desc THEN x.sort_num END DESC NULLS LAST,
             CASE WHEN NOT v_desc THEN x.sort_num END ASC NULLS LAST,
             CASE WHEN v_desc THEN x.created_at END DESC,
             CASE WHEN NOT v_desc THEN x.created_at END ASC,
             x.id) AS ord
    FROM filtered x
  )
  SELECT (SELECT count(*) FROM filtered),
         (SELECT coalesce(jsonb_agg(r ORDER BY ord), '[]'::jsonb) FROM (
          SELECT p.ord, jsonb_build_object(
            'application_id', a.application_id,
            'full_name', c.full_name,
            'email', c.email,
            'mobile', fn_pii_mask(c.mobile_last4, 10),
            'employer_name', c.employer_name,
            'age_at_application', c.age_at_application,
            'pan_number', fn_pii_mask(c.pan_last4, 10),
            'city', c.city,
            'state_code', c.state_code,
            'status', a.status,
            'loan_amount_requested', coalesce(a.loan_amount_requested, q.loan_amount_requested),
            'tenure_months', coalesce(a.tenure_months, q.tenure_months),
            'declared_net_salary', a.declared_net_salary,
            'vehicle_make', coalesce(v.make, q.make),
            'vehicle_model', coalesce(v.model, q.model),
            'vehicle_variant', coalesce(v.variant, q.variant),
            'ex_showroom_price', coalesce(v.ex_showroom_price, q.ex_showroom),
            'on_road_price', coalesce(v.on_road_price, q.on_road),
            'dealer_name', coalesce(d.dealer_name, q.dealer_name),
            'cibil_score', br.score,
            'decision', cd.decision,
            'rate', cd.sanctioned_rate,
            'foir_pct', r.foir_calculated,
            'ltv_pct', r.ltv_calculated,
            'officer_name', u.full_name,
            'created_at', a.created_at,
            'origin', a.origin,
            'engine_decision', ed.decision) AS r
          FROM ordered p
          JOIN applications a ON a.id = p.id
          JOIN customers c ON c.id = a.customer_id
          LEFT JOIN vehicles v ON v.application_id = a.id
          LEFT JOIN dealers d ON d.id = v.dealer_id
          LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v.id IS NULL
          LEFT JOIN LATERAL (SELECT x.score FROM bureau_reports x WHERE x.application_id = a.id
                             ORDER BY x.created_at DESC LIMIT 1) br ON true
          LEFT JOIN LATERAL (SELECT x.decision, x.sanctioned_rate FROM credit_decisions x WHERE x.application_id = a.id
                             ORDER BY x.decided_at DESC NULLS LAST LIMIT 1) cd ON true
          LEFT JOIN LATERAL (SELECT x.foir_calculated, x.ltv_calculated FROM recommendations x WHERE x.application_id = a.id
                             ORDER BY x.created_at DESC LIMIT 1) r ON true
          LEFT JOIN LATERAL (SELECT x.decision FROM engine_decisions x WHERE x.application_id = a.id
                             ORDER BY x.decided_at DESC LIMIT 1) ed ON true
          LEFT JOIN users u ON u.id = a.assigned_officer_id
          WHERE p.ord > (v_page - 1) * v_size AND p.ord <= v_page * v_size
         ) t)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION fn_list_applications_page(TEXT, TEXT[], TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_list_applications_page(TEXT, TEXT[], TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- Check after running (as postgres):
-- SELECT fn_list_applications_page()->'total';                     -- every case (about 2,000)
-- SELECT jsonb_array_length(fn_list_applications_page()->'rows');  -- 50

-- CHECK 066: Applications page function
SELECT '066' AS part, 'Applications page function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_list_applications_page')) AS ok;

-- #############################################################################
-- PART 067: The signed-in person's rights, for the menu and buttons (fix list B1, B3)  (sql/067_my_permissions.sql)
-- #############################################################################

-- =============================================================================
-- 067: The signed-in person's rights, for the menu and buttons (fix list B1, B3)
-- =============================================================================
-- The menu showed all 15 pages to every role, and buttons for actions a role
-- can't take (decide, issue an offer, disburse, edit rules) showed and then
-- failed after a click. The database already refuses those actions; the site
-- now asks once which rights the person has and hides what they can't use.
--
-- fn_my_permissions() returns the caller's role and its rights (the same list
-- fn_require_permission checks), and whether they may see real customers.
-- A login that is not active staff gets an empty list. It only describes the
-- caller; it grants nothing.
--
-- Read only. Run order: after 066. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_my_permissions()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := fn_current_staff_id();
  v_role  TEXT;
BEGIN
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb, 'sees_real_customers', false);
  END IF;
  SELECT role INTO v_role FROM users WHERE id = v_staff;
  RETURN jsonb_build_object(
    'role', v_role,
    'permissions', to_jsonb(fn_role_permissions(v_role)),
    'sees_real_customers', fn_sees_real_customers()
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_my_permissions() TO authenticated;

-- Check after running: signed in on the site, the menu shows only the pages
-- your role can open. In the SQL editor (no signed-in user) it returns an
-- empty list:
-- SELECT fn_my_permissions();

-- CHECK 067: my permissions function
SELECT '067' AS part, 'my permissions function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_my_permissions')) AS ok;

-- #############################################################################
-- PART 068: Officers see their own cases; user limits enforced; old roles retired  (sql/068_case_scope_limits_roles.sql)
-- #############################################################################

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

-- CHECK 068: officer limits trigger; old roles gone or retired
SELECT '068' AS part, 'officer limits trigger; old roles gone or retired' AS what, (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_credit_decisions_officer_limits')) AS ok;

-- #############################################################################
-- PART 069: A real Employer Master, with checks behind each field (fix list G4, C9)  (sql/069_employer_master.sql)
-- #############################################################################

-- =============================================================================
-- 069: A real Employer Master, with checks behind each field (fix list G4, C9)
-- =============================================================================
-- The Employer Master page read the `dealers` table and relabelled each car
-- maker as an employer, every one "Category B", verified "today" (C9). Nothing
-- on it was an employer or a check. The employer category (A/B/C) drives the
-- rate loading, the LTV and tenure caps and the processing fee, so it needs a
-- real master behind it (C8 uses it in the engine, migration 070).
--
-- Tables
--   * employers: name and the other names it appears under on payslips; CIN
--     and GSTIN; type (government, PSU, listed, MNC, public limited, private
--     limited, LLP, partnership, proprietorship, other) and the resulting
--     category A/B/C; listed on NSE/BSE; year of incorporation (and the exact
--     date if known) and years of filings; company status; official email
--     domains; industry; head-office city and state; caution flag and reason;
--     last verified on and by whom. `verified` is false until the checks pass
--     and someone confirms; until then the category is provisional.
--   * employer_checks: every check run, with its result, detail and source.
--   * employer_category_changes: a change of category is a request one person
--     makes and a second person approves (never the same person).
--   * employer_reference_list: the maintained lists the checks compare with
--     (government and PSU bodies; NSE/BSE listed companies).
--   * employer_master_settings: which provider runs the company checks.
--     SIMULATED today: it reads the CIN's own fields (listed or unlisted,
--     state, year, company type) and treats the company as active; it never
--     invents facts about a real company. A live MCA provider replaces it later.
--
-- Checks (fn_employer_run_checks): CIN at MCA (simulated), GSTIN format and
-- checksum, listed-company list, government/PSU list, caution list. Per case
-- (fn_employer_for_application, used by 070): official email domain, and the
-- name on payslips and Form 16 against the master and its other names.
--
-- Category rule (fn_employer_category_rule): government, PSU, listed company
-- or MNC -> A; public or private limited / LLP with 3+ years of filings and
-- active -> B; otherwise C. A struck-off or insolvent company is C and goes to
-- a person. With no checks yet, the category is provisional from the type.
--
-- Starting rows: one employer per distinct employer name already on
-- applications, with the type the customer gave, no CIN or GSTIN, not
-- verified. Nothing is made up.
--
-- New right employer.manage (credit head, credit manager, policy manager,
-- admin): add and edit employers, run checks, request a category change, and
-- approve someone else's request.
--
-- Run order: after 068. Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Name key: the same employer under small spelling differences
-- -----------------------------------------------------------------------------
-- "Infosys Ltd", "Infosys Limited" and "INFOSYS LTD." share the key "infosys".
CREATE OR REPLACE FUNCTION fn_employer_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9 ]', ' ', 'g'),
             '\y(pvt|private|ltd|limited|llp|the|co|company|corp|corporation|inc|india)\y', ' ', 'g'),
           '\s+', ' ', 'g')), '');
$$;

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employers (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  name              VARCHAR(200)  NOT NULL,
  name_key          TEXT          NOT NULL,
  aliases           TEXT[]        NOT NULL DEFAULT '{}',
  cin               VARCHAR(21),
  gstin             VARCHAR(15),
  employer_type     VARCHAR(20)   NOT NULL DEFAULT 'OTHER',
  category          CHAR(1)       NOT NULL DEFAULT 'C',
  verified          BOOLEAN       NOT NULL DEFAULT false,
  listed            BOOLEAN,
  listed_symbol     VARCHAR(20),
  incorporation_year SMALLINT,
  incorporated_on   DATE,
  years_of_filings  SMALLINT,
  company_status    VARCHAR(20)   NOT NULL DEFAULT 'UNKNOWN',
  email_domains     TEXT[]        NOT NULL DEFAULT '{}',
  industry          VARCHAR(100),
  hq_city           VARCHAR(100),
  hq_state          VARCHAR(2),
  caution           BOOLEAN       NOT NULL DEFAULT false,
  caution_reason    TEXT,
  last_verified_at  TIMESTAMPTZ,
  last_verified_by  UUID,
  source            VARCHAR(40)   NOT NULL DEFAULT 'STAFF',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_employers PRIMARY KEY (id),
  CONSTRAINT uq_employers_name_key UNIQUE (name_key),
  CONSTRAINT ck_employers_type CHECK (employer_type IN ('GOVERNMENT', 'PSU', 'LISTED', 'MNC', 'PUBLIC_LTD', 'PRIVATE_LTD',
                                                         'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'OTHER')),
  CONSTRAINT ck_employers_category CHECK (category IN ('A', 'B', 'C')),
  CONSTRAINT ck_employers_status CHECK (company_status IN ('ACTIVE', 'STRUCK_OFF', 'UNDER_INSOLVENCY', 'UNKNOWN')),
  CONSTRAINT ck_employers_cin CHECK (cin IS NULL OR cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'),
  CONSTRAINT ck_employers_gstin CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  CONSTRAINT fk_employers_verified_by FOREIGN KEY (last_verified_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS employer_checks (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  employer_id  UUID         NOT NULL,
  check_code   VARCHAR(20)  NOT NULL,
  result       VARCHAR(15)  NOT NULL,
  detail       JSONB        NOT NULL DEFAULT '{}',
  source       VARCHAR(30)  NOT NULL,
  checked_by   UUID,
  checked_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_employer_checks PRIMARY KEY (id),
  CONSTRAINT fk_employer_checks_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT ck_employer_checks_code CHECK (check_code IN ('CIN_MCA', 'GSTIN', 'LISTED', 'GOVT_PSU', 'CAUTION')),
  CONSTRAINT ck_employer_checks_result CHECK (result IN ('PASS', 'FAIL', 'REVIEW', 'NOT_APPLICABLE', 'INFO'))
);
CREATE INDEX IF NOT EXISTS ix_employer_checks_employer ON employer_checks (employer_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS employer_category_changes (
  id            UUID         NOT NULL DEFAULT gen_random_uuid(),
  employer_id   UUID         NOT NULL,
  from_category CHAR(1)      NOT NULL,
  to_category   CHAR(1)      NOT NULL,
  reason        TEXT         NOT NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'PENDING',
  requested_by  UUID,
  requested_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  CONSTRAINT pk_employer_category_changes PRIMARY KEY (id),
  CONSTRAINT fk_employer_category_changes_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT ck_employer_category_changes_to CHECK (to_category IN ('A', 'B', 'C')),
  CONSTRAINT ck_employer_category_changes_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
);
-- one open request per employer
CREATE UNIQUE INDEX IF NOT EXISTS uq_employer_category_changes_open ON employer_category_changes (employer_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS employer_reference_list (
  list_code  VARCHAR(10)  NOT NULL,
  name       VARCHAR(200) NOT NULL,
  name_key   TEXT         NOT NULL,
  exchange   VARCHAR(10),
  symbol     VARCHAR(20),
  source     TEXT         NOT NULL,
  added_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_employer_reference_list PRIMARY KEY (list_code, name_key),
  CONSTRAINT ck_employer_reference_list_code CHECK (list_code IN ('GOVT_PSU', 'LISTED'))
);

CREATE TABLE IF NOT EXISTS employer_master_settings (
  id        BOOLEAN      NOT NULL DEFAULT true,
  provider  VARCHAR(20)  NOT NULL DEFAULT 'SIMULATED',
  CONSTRAINT pk_employer_master_settings PRIMARY KEY (id),
  CONSTRAINT ck_employer_master_settings_one CHECK (id),
  CONSTRAINT ck_employer_master_settings_provider CHECK (provider IN ('SIMULATED', 'MCA_LIVE'))
);
INSERT INTO employer_master_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Applications point at the employer they were matched to (filled by 070).
ALTER TABLE applications ADD COLUMN IF NOT EXISTS employer_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_employer') THEN
    ALTER TABLE applications ADD CONSTRAINT fk_applications_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE SET NULL;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS ix_applications_employer ON applications (employer_id);

-- Closed to the API: read and changed through the functions below.
ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_category_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_reference_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_master_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employers, employer_checks, employer_category_changes, employer_reference_list, employer_master_settings
  FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. The right to manage employers
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, description) VALUES
  ('employer.manage', 'pricing', 'Add and edit employers, run their checks, and request or approve a category change (never your own)')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, 'employer.manage' FROM roles r
WHERE r.code IN ('credit_head', 'credit_manager', 'policy_manager', 'admin')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Reference lists (maintained; the checks compare with them)
-- -----------------------------------------------------------------------------

INSERT INTO employer_reference_list (list_code, name, name_key, exchange, symbol, source) VALUES
  ('GOVT_PSU', 'Indian Railways', fn_employer_key('Indian Railways'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Government of Karnataka', fn_employer_key('Government of Karnataka'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Government of Maharashtra', fn_employer_key('Government of Maharashtra'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Government of Tamil Nadu', fn_employer_key('Government of Tamil Nadu'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Central Board of Direct Taxes', fn_employer_key('Central Board of Direct Taxes'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Oil and Natural Gas Corporation Ltd', fn_employer_key('ONGC Ltd'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Bharat Electronics Ltd', fn_employer_key('Bharat Electronics Ltd'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Indian Oil Corporation Ltd', fn_employer_key('Indian Oil Corporation Ltd'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'State Bank of India', fn_employer_key('State Bank of India'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Infosys Ltd', fn_employer_key('Infosys Ltd'), 'NSE', 'INFY', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Tata Consultancy Services Ltd', fn_employer_key('Tata Consultancy Services Ltd'), 'NSE', 'TCS', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'HCL Technologies Ltd', fn_employer_key('HCL Technologies Ltd'), 'NSE', 'HCLTECH', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Larsen and Toubro Ltd', fn_employer_key('Larsen and Toubro Ltd'), 'NSE', 'LT', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Wipro Ltd', fn_employer_key('Wipro Ltd'), 'NSE', 'WIPRO', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Bosch Ltd', fn_employer_key('Bosch Ltd'), 'NSE', 'BOSCHLTD', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Siemens Ltd', fn_employer_key('Siemens Ltd'), 'NSE', 'SIEMENS', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Oil and Natural Gas Corporation Ltd', fn_employer_key('ONGC Ltd'), 'NSE', 'ONGC', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Bharat Electronics Ltd', fn_employer_key('Bharat Electronics Ltd'), 'NSE', 'BEL', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Indian Oil Corporation Ltd', fn_employer_key('Indian Oil Corporation Ltd'), 'NSE', 'IOC', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'State Bank of India', fn_employer_key('State Bank of India'), 'NSE', 'SBIN', 'Starting list, 3 Oct 2026')
ON CONFLICT (list_code, name_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Rules and checks (internal)
-- -----------------------------------------------------------------------------

-- The category the policy gives an employer.
CREATE OR REPLACE FUNCTION fn_employer_category_rule(p_type TEXT, p_listed BOOLEAN, p_years SMALLINT, p_status TEXT)
RETURNS CHAR(1)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('STRUCK_OFF', 'UNDER_INSOLVENCY') THEN 'C'
    WHEN p_type IN ('GOVERNMENT', 'PSU', 'LISTED', 'MNC') OR coalesce(p_listed, false) THEN 'A'
    WHEN p_type IN ('PUBLIC_LTD', 'PRIVATE_LTD', 'LLP') AND coalesce(p_years, 0) >= 3 AND p_status = 'ACTIVE' THEN 'B'
    -- not checked yet: provisional from the declared type (a limited company is taken as B until its filings are seen)
    WHEN p_type IN ('PUBLIC_LTD', 'PRIVATE_LTD', 'LLP') AND p_status = 'UNKNOWN' THEN 'B'
    ELSE 'C'
  END::CHAR(1);
$$;

-- GSTIN: 2-digit state, 10-character PAN, entity number, 'Z', check character (mod 36).
CREATE OR REPLACE FUNCTION fn_gstin_valid(p_gstin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_chars CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum   INTEGER := 0;
  v_prod  INTEGER;
  v_i     INTEGER;
BEGIN
  IF p_gstin IS NULL OR p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RETURN false;
  END IF;
  FOR v_i IN 1..14 LOOP
    v_prod := (strpos(v_chars, substr(p_gstin, v_i, 1)) - 1) * CASE WHEN v_i % 2 = 0 THEN 2 ELSE 1 END;
    v_sum := v_sum + v_prod / 36 + v_prod % 36;
  END LOOP;
  RETURN substr(v_chars, ((36 - v_sum % 36) % 36) + 1, 1) = substr(p_gstin, 15, 1);
END;
$$;

-- Run every master check on one employer, record each, and bring the derived
-- fields up to date. Returns the checks and the category the rule gives.
CREATE OR REPLACE FUNCTION fn_employer_checks_internal(p_employer UUID, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e          employers%ROWTYPE;
  v_provider TEXT;
  v_source   TEXT;
  v_listed   employer_reference_list%ROWTYPE;
  v_govt     BOOLEAN;
  v_year     SMALLINT;
  v_years    SMALLINT;
  v_status   TEXT;
  v_keys     TEXT[];
  v_rule     CHAR(1);
BEGIN
  SELECT * INTO e FROM employers WHERE id = p_employer;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT provider INTO v_provider FROM employer_master_settings;
  v_source := CASE coalesce(v_provider, 'SIMULATED') WHEN 'SIMULATED' THEN 'SIMULATED' ELSE v_provider END;
  v_keys := array_append(ARRAY(SELECT fn_employer_key(a) FROM unnest(e.aliases) a), e.name_key);
  v_status := e.company_status;
  v_years := e.years_of_filings;
  v_year := e.incorporation_year;

  -- CIN at MCA. Simulated: the CIN itself says listed (L) or unlisted (U), the
  -- state, the year of incorporation and the company type (GOI/SGC are
  -- government companies); the company is taken as active.
  IF e.cin IS NULL THEN
    INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
    VALUES (p_employer, 'CIN_MCA',
            CASE WHEN e.employer_type IN ('GOVERNMENT', 'PARTNERSHIP', 'PROPRIETORSHIP') THEN 'NOT_APPLICABLE' ELSE 'REVIEW' END,
            jsonb_build_object('note', CASE WHEN e.employer_type IN ('GOVERNMENT', 'PARTNERSHIP', 'PROPRIETORSHIP')
                                            THEN 'No company number for this type of employer'
                                            ELSE 'No CIN on file: add it to check the company at MCA' END),
            v_source, p_actor);
  ELSE
    v_year := substr(e.cin, 9, 4)::SMALLINT;
    v_years := LEAST(GREATEST(extract(year FROM now())::INT - v_year, 0), 30)::SMALLINT;
    v_status := 'ACTIVE';
    INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
    VALUES (p_employer, 'CIN_MCA', 'PASS',
            jsonb_build_object('listed_per_cin', left(e.cin, 1) = 'L', 'state', substr(e.cin, 7, 2),
                               'incorporation_year', v_year, 'years_of_filings', v_years,
                               'company_type', substr(e.cin, 13, 3), 'status', 'ACTIVE',
                               'note', CASE WHEN v_source = 'SIMULATED'
                                            THEN 'Simulated: read from the CIN itself; status taken as active until a live MCA lookup is switched on'
                                            ELSE 'Checked at MCA' END),
            v_source, p_actor);
  END IF;

  -- GSTIN format and check character
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'GSTIN',
          CASE WHEN e.gstin IS NULL THEN CASE WHEN e.employer_type = 'GOVERNMENT' THEN 'NOT_APPLICABLE' ELSE 'REVIEW' END
               WHEN fn_gstin_valid(e.gstin) THEN 'PASS' ELSE 'FAIL' END,
          CASE WHEN e.gstin IS NULL THEN jsonb_build_object('note', 'No GSTIN on file')
               WHEN fn_gstin_valid(e.gstin) THEN jsonb_build_object('state', left(e.gstin, 2), 'pan', substr(e.gstin, 3, 10),
                                                                      'note', 'Format and check character are right; registration status is simulated as active')
               ELSE jsonb_build_object('note', 'Not a valid GSTIN (format or check character wrong)') END,
          'FORMAT', p_actor);

  -- Listed company list
  SELECT * INTO v_listed FROM employer_reference_list WHERE list_code = 'LISTED' AND name_key = ANY (v_keys) LIMIT 1;
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'LISTED', CASE WHEN v_listed.name IS NOT NULL OR left(coalesce(e.cin, ''), 1) = 'L' THEN 'PASS' ELSE 'INFO' END,
          CASE WHEN v_listed.name IS NOT NULL THEN jsonb_build_object('exchange', v_listed.exchange, 'symbol', v_listed.symbol, 'listed_as', v_listed.name)
               WHEN left(coalesce(e.cin, ''), 1) = 'L' THEN jsonb_build_object('note', 'The CIN marks it as listed; not on our NSE/BSE list yet')
               ELSE jsonb_build_object('note', 'Not on the NSE/BSE list') END,
          'REFERENCE_LIST', p_actor);

  -- Government / PSU list
  v_govt := EXISTS (SELECT 1 FROM employer_reference_list WHERE list_code = 'GOVT_PSU' AND name_key = ANY (v_keys));
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'GOVT_PSU',
          CASE WHEN e.employer_type NOT IN ('GOVERNMENT', 'PSU') AND NOT v_govt THEN 'NOT_APPLICABLE'
               WHEN v_govt THEN 'PASS' ELSE 'REVIEW' END,
          jsonb_build_object('note', CASE WHEN v_govt THEN 'On the government and PSU list'
                                          WHEN e.employer_type IN ('GOVERNMENT', 'PSU') THEN 'Recorded as government or PSU but not on the list: confirm from the employer ID card or payslip, then add it to the list'
                                          ELSE 'Not a government body or PSU' END),
          'REFERENCE_LIST', p_actor);

  -- Caution list
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'CAUTION', CASE WHEN e.caution THEN 'REVIEW' ELSE 'PASS' END,
          jsonb_build_object('note', CASE WHEN e.caution THEN 'On the caution list: ' || coalesce(e.caution_reason, 'no reason given') || '. Cases go to a person.'
                                          ELSE 'Not on the caution list' END),
          'MASTER', p_actor);

  v_rule := fn_employer_category_rule(
              CASE WHEN v_govt AND e.employer_type NOT IN ('GOVERNMENT', 'PSU') THEN 'PSU' ELSE e.employer_type END,
              v_listed.name IS NOT NULL OR left(coalesce(e.cin, ''), 1) = 'L', v_years, v_status);

  UPDATE employers SET
    listed = (v_listed.name IS NOT NULL OR left(coalesce(e.cin, ''), 1) = 'L'),
    listed_symbol = v_listed.symbol,
    incorporation_year = v_year,
    years_of_filings = v_years,
    company_status = v_status,
    last_verified_at = now(),
    last_verified_by = p_actor,
    updated_at = now()
  WHERE id = p_employer;

  RETURN jsonb_build_object('rule_category', v_rule, 'current_category', e.category);
END;
$$;

REVOKE ALL ON FUNCTION fn_employer_checks_internal(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Starting rows: the employers already named on applications (not verified)
-- -----------------------------------------------------------------------------

-- Also run by the daily simulation (G7) for employers new customers name.
CREATE OR REPLACE FUNCTION fn_employer_seed_from_applications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO employers (name, name_key, employer_type, category, source)
  SELECT DISTINCT ON (fn_employer_key(c.employer_name))
         btrim(c.employer_name), fn_employer_key(c.employer_name),
         CASE WHEN c.employer_category IN ('GOVERNMENT', 'PSU', 'MNC', 'PUBLIC_LTD', 'PRIVATE_LTD', 'PARTNERSHIP', 'PROPRIETORSHIP')
              THEN c.employer_category ELSE 'OTHER' END,
         fn_employer_category_rule(CASE WHEN c.employer_category IN ('GOVERNMENT', 'PSU', 'MNC', 'PUBLIC_LTD', 'PRIVATE_LTD', 'PARTNERSHIP', 'PROPRIETORSHIP')
                                        THEN c.employer_category ELSE 'OTHER' END, NULL, NULL, 'UNKNOWN'),
         'FROM_APPLICATIONS'
  FROM customers c
  WHERE fn_employer_key(c.employer_name) IS NOT NULL
  ORDER BY fn_employer_key(c.employer_name), (c.employer_category IS NULL), c.created_at
  ON CONFLICT (name_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION fn_employer_seed_from_applications() FROM PUBLIC, anon, authenticated;

SELECT fn_employer_seed_from_applications();

-- -----------------------------------------------------------------------------
-- 7. Staff functions
-- -----------------------------------------------------------------------------

-- The list, with search, category filter and per-employer case figures.
CREATE OR REPLACE FUNCTION fn_employer_list(p_search TEXT DEFAULT NULL, p_category TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q    TEXT := nullif(btrim(coalesce(p_search, '')), '');
  v_real BOOLEAN;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'pricing.view',
                                          'pricing.author', 'pricing.approve', 'employer.manage']);
  v_real := fn_sees_real_customers();
  RETURN jsonb_build_object(
    'can_manage', fn_has_permission('employer.manage'),
    'provider', (SELECT provider FROM employer_master_settings),
    'pending', (SELECT count(*) FROM employer_category_changes WHERE status = 'PENDING'),
    'rows', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'id', e.id, 'name', e.name, 'aliases', e.aliases, 'employer_type', e.employer_type,
        'category', e.category, 'verified', e.verified, 'listed', e.listed, 'cin', e.cin, 'gstin', e.gstin,
        'company_status', e.company_status, 'years_of_filings', e.years_of_filings, 'industry', e.industry,
        'hq_city', e.hq_city, 'caution', e.caution, 'last_verified_at', e.last_verified_at,
        'last_verified_by', (SELECT full_name FROM users WHERE id = e.last_verified_by),
        'pending_change', EXISTS (SELECT 1 FROM employer_category_changes p WHERE p.employer_id = e.id AND p.status = 'PENDING'),
        'cases', (SELECT count(*) FROM applications a WHERE a.employer_id = e.id
                  AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)),
        'loans', (SELECT count(*) FROM loan_accounts l JOIN applications a ON a.id = l.application_id
                  WHERE a.employer_id = e.id AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)),
        'late_loans', (SELECT count(DISTINCT l.id) FROM loan_accounts l JOIN applications a ON a.id = l.application_id
                       JOIN loan_status_snapshot s ON s.loan_id = l.id
                       WHERE a.employer_id = e.id AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
                         AND coalesce(s.days_late, CASE WHEN s.cleared_on IS NULL AND s.due_date < current_date
                                                        THEN current_date - s.due_date END, 0) > 30)) AS x
      FROM employers e
      WHERE (v_q IS NULL OR e.name ILIKE '%' || v_q || '%' OR e.cin ILIKE '%' || v_q || '%'
             OR e.gstin ILIKE '%' || v_q || '%' OR EXISTS (SELECT 1 FROM unnest(e.aliases) a WHERE a ILIKE '%' || v_q || '%'))
        AND (p_category IS NULL OR e.category = p_category)) t)
  );
END;
$$;

-- One employer: every field, the latest result of each check, the category
-- the rule gives, and the category change history.
CREATE OR REPLACE FUNCTION fn_employer_get(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e employers%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'pricing.view',
                                          'pricing.author', 'pricing.approve', 'employer.manage']);
  SELECT * INTO e FROM employers WHERE id = p_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'employer', to_jsonb(e) - 'name_key' || jsonb_build_object('last_verified_by_name', (SELECT full_name FROM users WHERE id = e.last_verified_by)),
    'rule_category', fn_employer_category_rule(e.employer_type, e.listed, e.years_of_filings, e.company_status),
    'checks', (SELECT coalesce(jsonb_agg(jsonb_build_object('check', c.check_code, 'result', c.result, 'detail', c.detail,
                                                             'source', c.source, 'at', c.checked_at,
                                                             'by', (SELECT full_name FROM users WHERE id = c.checked_by))
                                         ORDER BY c.check_code), '[]'::jsonb)
               FROM (SELECT DISTINCT ON (check_code) * FROM employer_checks WHERE employer_id = p_id
                     ORDER BY check_code, checked_at DESC) c),
    'changes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'from', r.from_category, 'to', r.to_category,
                                                              'reason', r.reason, 'status', r.status,
                                                              'requested_by', (SELECT full_name FROM users WHERE id = r.requested_by),
                                                              'requested_by_me', r.requested_by IS NOT DISTINCT FROM fn_current_staff_id(),
                                                              'requested_at', r.requested_at,
                                                              'decided_by', (SELECT full_name FROM users WHERE id = r.decided_by),
                                                              'decided_at', r.decided_at, 'note', r.decision_note)
                                          ORDER BY r.requested_at DESC), '[]'::jsonb)
                FROM employer_category_changes r WHERE r.employer_id = p_id)
  );
END;
$$;

-- Add or edit an employer. The category is not edited here: a new employer
-- gets the category the rule gives; a change goes through a request.
CREATE OR REPLACE FUNCTION fn_employer_save(p_id UUID, p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  v_name  TEXT := nullif(btrim(coalesce(p->>'name', '')), '');
  v_type  TEXT := upper(coalesce(nullif(p->>'employer_type', ''), 'OTHER'));
  v_id    UUID := p_id;
  v_cin   TEXT := nullif(upper(btrim(coalesce(p->>'cin', ''))), '');
  v_gst   TEXT := nullif(upper(btrim(coalesce(p->>'gstin', ''))), '');
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'give the employer''s name' USING ERRCODE = '22023';
  END IF;
  IF v_cin IS NOT NULL AND v_cin !~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$' THEN
    RAISE EXCEPTION 'that is not a CIN (21 characters, e.g. L85110KA1981PLC013115)' USING ERRCODE = '22023';
  END IF;
  IF v_gst IS NOT NULL AND NOT fn_gstin_valid(v_gst) THEN
    RAISE EXCEPTION 'that is not a valid GSTIN (15 characters, the last is a check character)' USING ERRCODE = '22023';
  END IF;
  IF (p ? 'caution') AND (p->>'caution')::BOOLEAN AND nullif(btrim(coalesce(p->>'caution_reason', '')), '') IS NULL THEN
    RAISE EXCEPTION 'give a reason for the caution flag' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO employers (name, name_key, employer_type, category, source)
    VALUES (v_name, fn_employer_key(v_name), v_type, fn_employer_category_rule(v_type, NULL, NULL, 'UNKNOWN'), 'STAFF')
    RETURNING id INTO v_id;
  ELSIF NOT EXISTS (SELECT 1 FROM employers WHERE id = v_id) THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE employers SET
    name = v_name,
    name_key = fn_employer_key(v_name),
    aliases = coalesce(ARRAY(SELECT DISTINCT btrim(x) FROM jsonb_array_elements_text(coalesce(p->'aliases', '[]'::jsonb)) x
                             WHERE btrim(x) <> ''), '{}'),
    cin = v_cin,
    gstin = v_gst,
    employer_type = v_type,
    incorporated_on = nullif(p->>'incorporated_on', '')::DATE,
    email_domains = coalesce(ARRAY(SELECT DISTINCT lower(regexp_replace(btrim(x), '^@', ''))
                                   FROM jsonb_array_elements_text(coalesce(p->'email_domains', '[]'::jsonb)) x
                                   WHERE btrim(x) <> ''), '{}'),
    industry = nullif(btrim(coalesce(p->>'industry', '')), ''),
    hq_city = nullif(btrim(coalesce(p->>'hq_city', '')), ''),
    hq_state = nullif(upper(btrim(coalesce(p->>'hq_state', ''))), ''),
    caution = coalesce((p->>'caution')::BOOLEAN, false),
    caution_reason = CASE WHEN coalesce((p->>'caution')::BOOLEAN, false) THEN nullif(btrim(coalesce(p->>'caution_reason', '')), '') END,
    -- a changed record needs checking again before it counts as verified
    verified = false,
    updated_at = now()
  WHERE id = v_id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (CASE WHEN p_id IS NULL THEN 'EMPLOYER_ADDED' ELSE 'EMPLOYER_CHANGED' END, 'USER', v_actor,
          jsonb_build_object('employer', v_name, 'employer_id', v_id));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'an employer with this name is already in the master' USING ERRCODE = '23505';
END;
$$;

-- Run the checks. When they all pass (or don't apply) the employer is verified;
-- when the rule gives a different category, a change request is opened for a
-- second person to approve.
CREATE OR REPLACE FUNCTION fn_employer_run_checks(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  v_r     JSONB;
  v_open  INTEGER;
  e       employers%ROWTYPE;
BEGIN
  v_r := fn_employer_checks_internal(p_id, v_actor);
  SELECT count(*) INTO v_open FROM (
    SELECT DISTINCT ON (check_code) result FROM employer_checks WHERE employer_id = p_id ORDER BY check_code, checked_at DESC) c
  WHERE result IN ('FAIL', 'REVIEW');
  UPDATE employers SET verified = (v_open = 0) WHERE id = p_id;
  SELECT * INTO e FROM employers WHERE id = p_id;

  IF (v_r->>'rule_category') <> e.category
     AND NOT EXISTS (SELECT 1 FROM employer_category_changes WHERE employer_id = p_id AND status = 'PENDING') THEN
    INSERT INTO employer_category_changes (employer_id, from_category, to_category, reason, requested_by)
    VALUES (p_id, e.category, (v_r->>'rule_category')::CHAR(1),
            'The checks give category ' || (v_r->>'rule_category') || ' (' || e.employer_type || ', '
              || coalesce(e.years_of_filings::TEXT || ' years of filings', 'filings not known') || ', '
              || lower(e.company_status) || ')', v_actor);
  END IF;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('EMPLOYER_CHECKED', 'USER', v_actor,
          jsonb_build_object('employer', e.name, 'employer_id', p_id, 'verified', e.verified, 'rule_category', v_r->>'rule_category'));
  RETURN fn_employer_get(p_id);
END;
$$;

-- Ask for a category change (a second person approves it).
CREATE OR REPLACE FUNCTION fn_employer_request_category(p_id UUID, p_category TEXT, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  v_from  CHAR(1);
  v_req   UUID;
BEGIN
  SELECT category INTO v_from FROM employers WHERE id = p_id;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;
  IF upper(p_category) NOT IN ('A', 'B', 'C') OR upper(p_category) = v_from THEN
    RAISE EXCEPTION 'choose a different category, A, B or C' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'give a reason' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM employer_category_changes WHERE employer_id = p_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'a category change is already waiting for approval' USING ERRCODE = '22023';
  END IF;
  INSERT INTO employer_category_changes (employer_id, from_category, to_category, reason, requested_by)
  VALUES (p_id, v_from, upper(p_category), btrim(p_reason), v_actor) RETURNING id INTO v_req;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('EMPLOYER_CATEGORY_REQUESTED', 'USER', v_actor,
          jsonb_build_object('employer_id', p_id, 'from', v_from, 'to', upper(p_category), 'reason', btrim(p_reason)));
  RETURN v_req;
END;
$$;

-- Approve or reject someone else's request. Withdraw your own.
CREATE OR REPLACE FUNCTION fn_employer_decide_category(p_request UUID, p_action TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  r       employer_category_changes%ROWTYPE;
  v_act   TEXT := upper(coalesce(p_action, ''));
BEGIN
  SELECT * INTO r FROM employer_category_changes WHERE id = p_request FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'PENDING' THEN
    RAISE EXCEPTION 'no open category change with that id' USING ERRCODE = 'P0002';
  END IF;
  IF v_act = 'WITHDRAW' THEN
    IF r.requested_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'only the person who asked can withdraw it' USING ERRCODE = '42501';
    END IF;
  ELSIF v_act IN ('APPROVE', 'REJECT') THEN
    IF r.requested_by IS NOT DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'a second person must approve a category change' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'approve, reject or withdraw' USING ERRCODE = '22023';
  END IF;

  UPDATE employer_category_changes SET
    status = CASE v_act WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END,
    decided_by = v_actor, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = p_request;
  IF v_act = 'APPROVE' THEN
    UPDATE employers SET category = r.to_category, updated_at = now() WHERE id = r.employer_id;
  END IF;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('EMPLOYER_CATEGORY_' || CASE v_act WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END,
          'USER', v_actor, jsonb_build_object('employer_id', r.employer_id, 'from', r.from_category, 'to', r.to_category));
  RETURN fn_employer_get(r.employer_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Per case: which employer, its category, and the two case checks
-- -----------------------------------------------------------------------------
-- Matches the case's employer name (customer details, payslips, Form 16) to
-- the master by name or other names, then checks the customer's email domain
-- and that the payslip and Form 16 names belong to the same employer.
CREATE OR REPLACE FUNCTION fn_employer_for_application(p_application UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust   customers%ROWTYPE;
  e        employers%ROWTYPE;
  v_names  TEXT[];
  v_slip   TEXT[];
  v_f16    TEXT;
  v_domain TEXT;
  v_keys   TEXT[];
  v_email  JSONB;
  v_match  JSONB;
BEGIN
  SELECT c.* INTO v_cust FROM applications a JOIN customers c ON c.id = a.customer_id WHERE a.id = p_application;
  SELECT array_agg(DISTINCT s.employer_name) INTO v_slip FROM salary_slips s
  WHERE s.application_id = p_application AND s.employer_name IS NOT NULL;
  SELECT f.employer_name INTO v_f16 FROM form16_part_b f WHERE f.application_id = p_application;
  v_names := array_remove(array_cat(ARRAY[v_cust.employer_name, v_f16], coalesce(v_slip, '{}')), NULL);

  -- the master employer: the case's own link first, then by name or other names
  SELECT e2.* INTO e FROM applications a JOIN employers e2 ON e2.id = a.employer_id WHERE a.id = p_application;
  IF e.id IS NULL THEN
    SELECT e2.* INTO e FROM employers e2
    WHERE e2.name_key = ANY (ARRAY(SELECT fn_employer_key(n) FROM unnest(v_names) n))
       OR EXISTS (SELECT 1 FROM unnest(e2.aliases) al WHERE fn_employer_key(al) = ANY (ARRAY(SELECT fn_employer_key(n) FROM unnest(v_names) n)))
    ORDER BY (e2.name_key = fn_employer_key(v_cust.employer_name)) DESC, e2.verified DESC
    LIMIT 1;
  END IF;
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'names_seen', to_jsonb(v_names));
  END IF;
  v_keys := array_append(ARRAY(SELECT fn_employer_key(al) FROM unnest(e.aliases) al), e.name_key);

  v_domain := lower(split_part(coalesce(v_cust.email, ''), '@', 2));
  v_email := CASE
    WHEN v_domain = '' THEN jsonb_build_object('result', 'NOT_APPLICABLE', 'note', 'No email on the case')
    WHEN v_domain IN ('gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'rediffmail.com',
                      'icloud.com', 'proton.me', 'protonmail.com', 'synthetic.invalid', 'live.com')
      THEN jsonb_build_object('result', 'NOT_APPLICABLE', 'note', 'Personal email (' || v_domain || '), not checked')
    WHEN cardinality(e.email_domains) = 0 THEN jsonb_build_object('result', 'REVIEW', 'note', 'No official email domain on the employer record')
    WHEN v_domain = ANY (e.email_domains) OR EXISTS (SELECT 1 FROM unnest(e.email_domains) d WHERE v_domain LIKE '%.' || d)
      THEN jsonb_build_object('result', 'PASS', 'note', v_domain || ' is the employer''s domain')
    ELSE jsonb_build_object('result', 'FAIL', 'note', v_domain || ' is not one of the employer''s domains')
  END;

  v_match := CASE
    WHEN v_slip IS NULL AND v_f16 IS NULL THEN jsonb_build_object('result', 'NOT_APPLICABLE', 'note', 'No payslip or Form 16 read yet')
    WHEN NOT EXISTS (SELECT 1 FROM unnest(array_remove(array_cat(coalesce(v_slip, '{}'), ARRAY[v_f16]), NULL)) n
                     WHERE NOT (fn_employer_key(n) = ANY (v_keys)))
      THEN jsonb_build_object('result', 'PASS', 'note', 'Payslip and Form 16 names match the employer or its other names')
    ELSE jsonb_build_object('result', 'REVIEW', 'note', 'A payslip or Form 16 name does not match: ' ||
           (SELECT string_agg(DISTINCT n, ', ') FROM unnest(array_remove(array_cat(coalesce(v_slip, '{}'), ARRAY[v_f16]), NULL)) n
            WHERE NOT (fn_employer_key(n) = ANY (v_keys))))
  END;

  RETURN jsonb_build_object(
    'found', true, 'employer_id', e.id, 'name', e.name, 'category', e.category, 'verified', e.verified,
    'employer_type', e.employer_type, 'caution', e.caution, 'caution_reason', e.caution_reason,
    'checks', jsonb_build_object('EMAIL_DOMAIN', v_email, 'NAME_MATCH', v_match,
                                 'CAUTION', jsonb_build_object('result', CASE WHEN e.caution THEN 'REVIEW' ELSE 'PASS' END,
                                                               'note', CASE WHEN e.caution THEN 'On the caution list: ' || coalesce(e.caution_reason, '') ELSE 'Not on the caution list' END)));
END;
$$;

REVOKE ALL ON FUNCTION fn_employer_for_application(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION fn_employer_list(TEXT, TEXT), fn_employer_get(UUID), fn_employer_save(UUID, JSONB),
                       fn_employer_run_checks(UUID), fn_employer_request_category(UUID, TEXT, TEXT),
                       fn_employer_decide_category(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_employer_list(TEXT, TEXT), fn_employer_get(UUID), fn_employer_save(UUID, JSONB),
                          fn_employer_run_checks(UUID), fn_employer_request_category(UUID, TEXT, TEXT),
                          fn_employer_decide_category(UUID, TEXT, TEXT) TO authenticated;

-- Checks after running:
-- SELECT count(*), count(*) FILTER (WHERE verified) FROM employers;        -- one per employer named on applications; none verified yet
-- SELECT category, count(*) FROM employers GROUP BY 1;                    -- provisional categories from the declared type
-- SELECT count(*) FROM role_permissions WHERE permission_code = 'employer.manage';   -- 4

-- CHECK 069: Employer Master
SELECT '069' AS part, 'Employer Master' AS what, (to_regclass('public.employers') IS NOT NULL AND EXISTS (SELECT 1 FROM permissions WHERE code = 'employer.manage')) AS ok;

-- #############################################################################
-- PART 070: Employer category in the credit engine and on the officer's card (fix list C8)  (sql/070_employer_category_pricing.sql)
-- #############################################################################

-- =============================================================================
-- 070: Employer category in the credit engine and on the officer's card (fix list C8)
-- =============================================================================
-- The Rate Grid shows a loading of +0.40% for category B and +1.25% for C,
-- each category's LTV cap (120 / 110 / 90%), tenure cap (84 / 84 / 60 months)
-- and processing fee (5,000 / 6,500 / 8,000), but the engine priced on the
-- bureau score band alone: nothing linked a customer to a category, and the
-- loading, caps and fee were never applied.
--
-- Now fn_generate_recommendation (last defined in 053) also:
--   * finds the case's employer in the Employer Master (069) by name or other
--     names; if it isn't there yet, takes the provisional category from the
--     type the customer gave (government, PSU, MNC -> A; public / private
--     limited -> B; anything else -> C). The case records the employer, the
--     category and how it was set (verified master, provisional master, or
--     declared type);
--   * adds the category's loading to the band's base rate;
--   * caps tenure at the category's cap when that is tighter;
--   * refers the case to a person (APPROVE becomes MAYBE, never the other way)
--     when the LTV on the ex-showroom price is above the category's cap, when
--     the employer is on the caution list, or when a payslip or Form 16 names
--     a different employer; an unmatched work email is noted only;
--   * stores the category, base rate, loading, processing fee and caps on the
--     recommendation, and says them in the summary.
-- Decisions already made are untouched; this applies to new assessments.
--
-- fn_staff_case_employer(application) gives the officer's card the employer,
-- its category and how it was set, the pricing applied, and the case checks.
--
-- Note for re-runs: 053 also defines fn_generate_recommendation. Running 053
-- again after this file drops the employer pricing; run 070 again after it.
--
-- Run order: after 069. Safe to re-run.
-- =============================================================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS employer_category CHAR(1);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS employer_category_basis VARCHAR(20);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS employer_category CHAR(1);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS employer_category_basis VARCHAR(20);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS base_rate_pct NUMERIC(5,2);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS rate_loading_pct NUMERIC(5,2);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS processing_fee_inr INTEGER;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS category_ltv_cap_pct NUMERIC(6,2);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS category_tenure_cap SMALLINT;

-- The case's employer and category: the Employer Master's when the employer is
-- there (verified or provisional), otherwise provisional from the type the
-- customer gave. Used by the rules (FOIR at the loaded rate) and the pricing.
CREATE OR REPLACE FUNCTION fn_case_employer_category(p_application UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp JSONB := fn_employer_for_application(p_application);
  v_cat CHAR(1);
BEGIN
  IF coalesce((v_emp->>'found')::BOOLEAN, false) THEN
    RETURN jsonb_build_object('category', v_emp->>'category',
                              'basis', CASE WHEN (v_emp->>'verified')::BOOLEAN THEN 'MASTER_VERIFIED' ELSE 'MASTER_PROVISIONAL' END,
                              'employer', v_emp);
  END IF;
  SELECT fn_employer_category_rule(coalesce(nullif(c.employer_category, ''), 'OTHER'), NULL, NULL, 'UNKNOWN')
    INTO v_cat FROM applications a JOIN customers c ON c.id = a.customer_id WHERE a.id = p_application;
  RETURN jsonb_build_object('category', coalesce(v_cat, 'C'), 'basis', 'DECLARED_TYPE', 'employer', v_emp);
END;
$$;

REVOKE ALL ON FUNCTION fn_case_employer_category(UUID) FROM PUBLIC, anon, authenticated;

-- The rules (fn_run_policy_engine, last defined in 053), unchanged but for the EMI
-- they check FOIR with: now at the loaded rate.
CREATE OR REPLACE FUNCTION fn_run_policy_engine(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  bureau RECORD;
  bank RECORD;
  income RECORD;
  rule RECORD;
  actual_val DECIMAL;
  threshold_val DECIMAL;
  passed BOOLEAN;
  result_label VARCHAR(10);
  passed_count INTEGER := 0;
  failed_count INTEGER := 0;
  flagged_count INTEGER := 0;
  has_reject BOOLEAN := false;
  has_maybe BOOLEAN := false;
  results JSONB := '[]'::JSONB;
  age_at_app INTEGER;
  age_at_maturity INTEGER;
  total_obligations DECIMAL;
  proposed_emi DECIMAL;
  foir_pct DECIMAL;
  ltv_pct DECIMAL;
  rate_row rate_grid%ROWTYPE;
BEGIN
  -- Load application data
  SELECT * INTO app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Application not found');
  END IF;

  SELECT * INTO veh FROM vehicles WHERE application_id = p_application_id LIMIT 1;
  SELECT * INTO bureau FROM bureau_reports WHERE application_id = p_application_id
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO bank FROM bank_statement_analyses WHERE application_id = p_application_id
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO income FROM income_assessments WHERE application_id = p_application_id
    ORDER BY created_at DESC LIMIT 1;

  -- Get the customer's age
  SELECT c.age_at_application INTO age_at_app
    FROM customers c WHERE c.id = app.customer_id;
  age_at_maturity := coalesce(age_at_app, 0) + coalesce(app.tenure_months, 0) / 12;

  -- Get rate for EMI calc
  IF bureau.score IS NOT NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true
        AND bureau.score BETWEEN score_band_min AND score_band_max
      LIMIT 1;
  END IF;

  -- Calculate derived values
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  IF rate_row.rate_pct IS NOT NULL THEN
    -- 070 (C8): the EMI at the rate the loan is priced at, base plus the employer category's loading
    proposed_emi := fn_calculate_emi(
      coalesce(app.loan_amount_requested, 0),
      rate_row.rate_pct + CASE WHEN rate_row.rate_pct > 0 THEN coalesce((
        SELECT p.rate_loading_pct FROM employer_category_pricing p
        WHERE p.is_active AND p.category_code = fn_case_employer_category(p_application_id)->>'category' LIMIT 1), 0) ELSE 0 END,
      coalesce(app.tenure_months, 60)
    );
  ELSE
    proposed_emi := coalesce(app.indicative_emi, 0);
  END IF;

  IF coalesce(income.total_eligible_income, app.declared_net_salary, 0) > 0 THEN
    foir_pct := round(
      (total_obligations + proposed_emi) /
      coalesce(income.total_eligible_income, app.declared_net_salary) * 100, 2
    );
  ELSE
    foir_pct := 100;
  END IF;

  IF veh.ex_showroom_price IS NOT NULL AND veh.ex_showroom_price > 0 THEN
    ltv_pct := round(coalesce(app.loan_amount_requested, 0) / veh.ex_showroom_price * 100, 2);
  ELSE
    ltv_pct := 0;
  END IF;

  -- Delete any previous results for this application
  DELETE FROM policy_results WHERE application_id = p_application_id;

  -- Evaluate each active rule
  FOR rule IN
    SELECT * FROM policy_rules WHERE is_active = true ORDER BY display_order
  LOOP
    actual_val := NULL;
    passed := true;

    -- Map rule parameter to actual value
    CASE rule.parameter
      WHEN 'age_at_application' THEN actual_val := age_at_app;
      WHEN 'age_at_maturity' THEN actual_val := age_at_maturity;
      WHEN 'cibil_score' THEN actual_val := bureau.score;
      WHEN 'dpd_max_12m' THEN actual_val := bureau.dpd_max_12m;
      WHEN 'dpd_60_plus_flag' THEN actual_val := CASE WHEN bureau.dpd_60_plus_flag THEN 1 ELSE 0 END;
      WHEN 'writeoff_count_5y' THEN actual_val := bureau.writeoff_count_5y;
      WHEN 'settled_count_5y' THEN actual_val := bureau.settled_count_5y;
      WHEN 'enquiry_count_90d' THEN actual_val := bureau.enquiry_count_90d;
      WHEN 'active_accounts' THEN actual_val := bureau.active_accounts;
      WHEN 'foir_pct' THEN actual_val := foir_pct;
      WHEN 'income_variance_pct' THEN actual_val := income.income_variance_pct;
      WHEN 'ltv_pct' THEN actual_val := ltv_pct;
      WHEN 'bounce_count_6m' THEN actual_val := bank.bounce_count_6m;
      WHEN 'min_amb_vs_emi_pct' THEN
        IF proposed_emi > 0 AND bank.min_amb_5dates IS NOT NULL THEN
          actual_val := round(bank.min_amb_5dates / proposed_emi * 100, 2);
        ELSE
          actual_val := 100;
        END IF;
      WHEN 'salary_regularity' THEN
        actual_val := CASE WHEN bank.salary_regularity = 'REGULAR' THEN 1 ELSE 0 END;
      WHEN 'name_match_score' THEN actual_val := income.name_match_score;
      ELSE
        actual_val := NULL;
    END CASE;

    -- Parse threshold
    IF rule.parameter = 'dpd_60_plus_flag' THEN
      threshold_val := CASE WHEN rule.threshold_value = 'false' THEN 0 ELSE 1 END;
    ELSIF rule.parameter = 'salary_regularity' THEN
      threshold_val := CASE WHEN rule.threshold_value = 'REGULAR' THEN 1 ELSE 0 END;
    ELSE
      threshold_val := rule.threshold_value::DECIMAL;
    END IF;

    -- Skip rule if data is missing (can't evaluate)
    IF actual_val IS NULL THEN
      result_label := 'SKIPPED';
      passed := true;
    ELSE
      -- Evaluate operator
      CASE rule.operator
        WHEN 'GTE' THEN passed := actual_val >= threshold_val;
        WHEN 'LTE' THEN passed := actual_val <= threshold_val;
        WHEN 'EQ'  THEN passed := actual_val = threshold_val;
        WHEN 'GT'  THEN passed := actual_val > threshold_val;
        WHEN 'LT'  THEN passed := actual_val < threshold_val;
        WHEN 'NEQ' THEN passed := actual_val <> threshold_val;
        ELSE passed := true;
      END CASE;

      IF passed THEN
        result_label := 'PASS';
      ELSE
        result_label := 'FAIL';
      END IF;
    END IF;

    -- Count results
    IF result_label = 'PASS' THEN
      passed_count := passed_count + 1;
    ELSIF result_label = 'FAIL' THEN
      IF rule.severity_on_fail = 'REJECT' THEN
        failed_count := failed_count + 1;
        has_reject := true;
      ELSE
        flagged_count := flagged_count + 1;
        has_maybe := true;
      END IF;
    END IF;

    -- Write policy_results row
    INSERT INTO policy_results (
      application_id, rule_id, policy_version, result,
      actual_value, threshold_value, severity, reason, reason_code
    ) VALUES (
      p_application_id, rule.rule_id, rule.policy_version, result_label,
      actual_val, threshold_val,
      CASE WHEN result_label = 'FAIL' THEN rule.severity_on_fail ELSE NULL END,
      CASE WHEN result_label = 'FAIL' THEN rule.description ELSE NULL END,
      CASE WHEN result_label = 'FAIL' THEN rule.reason_code ELSE NULL END
    );

    -- Add to results array
    results := results || jsonb_build_array(
      jsonb_build_object(
        'rule_id', rule.rule_id,
        'rule_name', rule.rule_name,
        'result', result_label,
        'actual', actual_val,
        'threshold', threshold_val,
        'severity', CASE WHEN result_label = 'FAIL' THEN rule.severity_on_fail ELSE NULL END,
        'reason_code', CASE WHEN result_label = 'FAIL' THEN rule.reason_code ELSE NULL END
      )
    );
  END LOOP;

  -- D6 (FD4, 17 Sep 2026), added in 053: with no bureau score (no record at
  -- either bureau, or no report) every bureau rule above is skipped, so the
  -- case must not pass on the rest; it goes to a person. Named as in the
  -- unified rules (MISSING_DATA). Kept out of policy_results, which only holds
  -- rows of policy_rules. R11's automatic reject is not applied.
  IF bureau.score IS NULL THEN
    flagged_count := flagged_count + 1;
    has_maybe := true;
    results := results || jsonb_build_array(
      jsonb_build_object(
        'rule_id', 'MISSING_DATA',
        'rule_name', 'Bureau report missing',
        'result', 'FAIL',
        'actual', NULL,
        'threshold', NULL,
        'severity', 'MAYBE',
        'reason_code', 'MISSING_DATA'
      )
    );
  END IF;

  -- Update application status
  UPDATE applications SET
    status = CASE
      WHEN has_reject THEN 'REJECTED'
      WHEN has_maybe THEN 'UNDER_REVIEW'
      ELSE 'APPROVED'
    END,
    assessment_started_at = coalesce(assessment_started_at, now()),
    final_decision_at = now(),
    updated_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'application_id', app.application_id,
    'decision', CASE
      WHEN has_reject THEN 'REJECT'
      WHEN has_maybe THEN 'MAYBE'
      ELSE 'APPROVE'
    END,
    'rules_passed', passed_count,
    'rules_failed', failed_count,
    'rules_flagged', flagged_count,
    'foir_pct', foir_pct,
    'ltv_pct', ltv_pct,
    'proposed_emi', proposed_emi,
    'rate', rate_row.rate_pct,
    'results', results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION fn_generate_recommendation(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  bureau RECORD;
  bank RECORD;
  income RECORD;
  rate_row rate_grid%ROWTYPE;
  rec_id UUID;
  decision_id UUID;
  decision_band VARCHAR(10);
  rec_rate DECIMAL;
  rec_amount DECIMAL;
  rec_tenure INTEGER;
  rec_emi DECIMAL;
  ltv_calc DECIMAL;
  foir_calc DECIMAL;
  dbr_calc DECIMAL;
  net_surplus DECIMAL;
  risk_factors JSONB;
  positive_factors JSONB;
  rules_passed INTEGER;
  rules_failed INTEGER;
  rules_flagged INTEGER;
  summary TEXT;
  total_obligations DECIMAL;
  policy_result JSONB;
  income_base DECIMAL;
  requested_tenure INTEGER;
  tenure_cap INTEGER;
  tenure_cap_source TEXT;
  ltv_ex_showroom DECIMAL;
  govt BOOLEAN;
BEGIN
  SELECT * INTO app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Application not found');
  END IF;

  SELECT * INTO veh FROM vehicles WHERE application_id = p_application_id LIMIT 1;
  SELECT * INTO bureau FROM bureau_reports WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO bank FROM bank_statement_analyses WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO income FROM income_assessments WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  -- Run policy engine
  policy_result := fn_run_policy_engine(p_application_id);
  rules_passed := coalesce((policy_result->>'rules_passed')::INTEGER, 0);
  rules_failed := coalesce((policy_result->>'rules_failed')::INTEGER, 0);
  rules_flagged := coalesce((policy_result->>'rules_flagged')::INTEGER, 0);

  -- Determine decision band
  IF rules_failed > 0 THEN
    decision_band := 'REJECT';
  ELSIF rules_flagged > 0 THEN
    decision_band := 'MAYBE';
  ELSE
    decision_band := 'APPROVE';
  END IF;

  -- Get rate grid row (with safe fallback)
  IF bureau.score IS NOT NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true
        AND bureau.score BETWEEN score_band_min AND score_band_max
      LIMIT 1;
  END IF;

  IF rate_row IS NULL OR rate_row.rate_pct IS NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true AND band_label = 'APPROVE'
      LIMIT 1;
  END IF;

  rec_rate := coalesce(rate_row.rate_pct, 8.99);
  rec_amount := coalesce(app.loan_amount_requested, 0);

  -- Tenure (CC6.3): the tightest of the product rule and the bureau band's cap.
  -- Employer category also caps tenure, but no category is recorded against an
  -- application yet, so it cannot be applied here (gap register).
  requested_tenure := coalesce(app.tenure_months, 60);
  SELECT c.employment_type = 'GOVERNMENT' INTO govt FROM customers c WHERE c.id = app.customer_id;
  SELECT t.cap, t.source INTO tenure_cap, tenure_cap_source
  FROM fn_tenure_cap(coalesce(govt, false), veh.on_road_price, rate_row.max_tenure_months, rate_row.band_label) t;
  rec_tenure := LEAST(requested_tenure, tenure_cap);

  IF decision_band = 'REJECT' THEN
    rec_rate := 0;
    rec_emi := 0;
  ELSE
    rec_emi := fn_calculate_emi(rec_amount, rec_rate, rec_tenure);
  END IF;

  -- Calculate metrics
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  -- LTV (CC6.2): the rules judge the loan against the ex-showroom price, with a
  -- second rule on the on-road price. ltv_calculated has always held the on-road
  -- figure and the impact check reads it as such, so it stays on-road; the
  -- summary now names both.
  IF coalesce(veh.on_road_price, 0) > 0 THEN
    ltv_calc := round(rec_amount / veh.on_road_price * 100, 2);
  ELSE
    ltv_calc := 0;
  END IF;
  IF coalesce(veh.ex_showroom_price, 0) > 0 THEN
    ltv_ex_showroom := round(rec_amount / veh.ex_showroom_price * 100, 2);
  END IF;

  -- FOIR (CC6.1, decision 0.1): net salary plus eligible other income, the same
  -- base the rules use in fn_run_policy_engine. This used to be net salary alone,
  -- so the stored FOIR could read higher than the one the rules had checked.
  income_base := coalesce(income.total_eligible_income, app.declared_net_salary, 0);
  IF income_base > 0 THEN
    foir_calc := round((total_obligations + rec_emi) / income_base * 100, 2);
    dbr_calc := round(total_obligations / income_base * 100, 2);
    net_surplus := income_base - total_obligations - rec_emi;
  ELSE
    foir_calc := 0;
    dbr_calc := 0;
    net_surplus := 0;
  END IF;

  -- Build risk and positive factors
  risk_factors := coalesce(policy_result->'results', '[]'::JSONB);

  -- The rules checked FOIR at the tenure asked for. A shorter tenure raises the
  -- EMI, so if that pushes FOIR past the band's cap the file goes to a person
  -- rather than being approved on figures nobody checked.
  IF rec_tenure < requested_tenure AND decision_band <> 'REJECT' THEN
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'TENURE_CAPPED', 'result', 'INFO',
      'reason', format('Tenure reduced from %s to %s months (%s)', requested_tenure, rec_tenure, tenure_cap_source)));
    IF decision_band = 'APPROVE' AND coalesce(rate_row.max_foir_pct, 0) > 0 AND foir_calc > rate_row.max_foir_pct THEN
      decision_band := 'MAYBE';
      rules_flagged := rules_flagged + 1;
      risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
        'rule_id', 'FOIR_AT_CAPPED_TENURE', 'result', 'FLAG',
        'reason', format('FOIR is %s%% at %s months, above the %s%% cap', foir_calc, rec_tenure, rate_row.max_foir_pct)));
    END IF;
  END IF;
  positive_factors := '[]'::JSONB;

  IF bureau.score IS NOT NULL AND bureau.score >= 750 THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Strong CIBIL score', 'value', bureau.score));
  END IF;
  IF bureau.dpd_max_12m IS NOT NULL AND bureau.dpd_max_12m = 0 THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Clean repayment history', 'value', 'Zero DPD'));
  END IF;
  IF net_surplus > 0 AND net_surplus > rec_emi THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Strong disposable surplus', 'value', net_surplus));
  END IF;

  -- Build summary
  IF decision_band = 'APPROVE' THEN
    summary := format('Application approved. CIBIL %s, FOIR %s%%, LTV %s%% of ex-showroom (%s%% of on-road). All %s policy rules passed.',
      coalesce(bureau.score::TEXT, 'N/A'), foir_calc, coalesce(ltv_ex_showroom::TEXT, 'N/A'), ltv_calc, rules_passed);
  ELSIF decision_band = 'REJECT' THEN
    summary := format('Application fails %s hard rule(s). Auto-decline recommended.', rules_failed);
  ELSE
    summary := format('Application flagged on %s rule(s). Manual review required.', rules_flagged);
  END IF;
  IF rec_tenure < requested_tenure AND decision_band <> 'REJECT' THEN
    summary := summary || format(' Tenure reduced from %s to %s months (%s).', requested_tenure, rec_tenure, tenure_cap_source);
  END IF;

  -- Insert recommendation
  INSERT INTO recommendations (
    application_id, recommendation, recommended_rate, recommended_rate_type,
    recommended_amount, recommended_tenure, recommended_emi,
    ltv_calculated, foir_calculated, dbr_calculated, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary_text
  ) VALUES (
    p_application_id, decision_band, rec_rate, coalesce(rate_row.rate_type, 'FIXED'),
    rec_amount, rec_tenure, rec_emi,
    ltv_calc, foir_calc, dbr_calc, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary
  ) RETURNING id INTO rec_id;

  -- Insert credit decision
  INSERT INTO credit_decisions (
    application_id, recommendation_id, decision, decided_by,
    sanctioned_amount, sanctioned_rate, sanctioned_tenure, sanctioned_emi,
    sanction_valid_until
  ) VALUES (
    p_application_id, rec_id, decision_band, 'SYSTEM',
    CASE WHEN decision_band != 'REJECT' THEN rec_amount ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_rate ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_tenure ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_emi ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN current_date + 30 ELSE NULL END
  ) RETURNING id INTO decision_id;

  -- Update application status
  UPDATE applications SET
    status = CASE
      WHEN decision_band = 'APPROVE' THEN 'APPROVED'
      WHEN decision_band = 'REJECT' THEN 'REJECTED'
      ELSE 'UNDER_REVIEW'
    END,
    updated_at = now()
  WHERE id = p_application_id;

  -- Audit trail
  INSERT INTO audit_events (application_id, event_type, actor_type, event_detail)
  VALUES (
    p_application_id, 'APPLICATION_ASSESSED', 'SYSTEM',
    jsonb_build_object(
      'application_id', (SELECT application_id FROM applications WHERE id = p_application_id),
      'decision', decision_band,
      'rate', rec_rate,
      'message', summary
    )
  );

  RETURN jsonb_build_object(
    'decision', decision_band,
    'rate', rec_rate,
    'emi', rec_emi,
    'tenure', rec_tenure,
    'amount', rec_amount,
    'foir_pct', foir_calc,
    'ltv_pct', ltv_calc,
    'ltv_ex_showroom_pct', ltv_ex_showroom,
    'tenure_requested', requested_tenure,
    'dbr_pct', dbr_calc,
    'net_surplus', net_surplus,
    'rules_passed', rules_passed,
    'rules_failed', rules_failed,
    'rules_flagged', rules_flagged,
    'summary', summary,
    'risk_factors', risk_factors,
    'positive_factors', positive_factors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


REVOKE EXECUTE ON FUNCTION fn_run_policy_engine(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fn_generate_recommendation(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  bureau RECORD;
  bank RECORD;
  income RECORD;
  rate_row rate_grid%ROWTYPE;
  rec_id UUID;
  decision_id UUID;
  decision_band VARCHAR(10);
  rec_rate DECIMAL;
  rec_amount DECIMAL;
  rec_tenure INTEGER;
  rec_emi DECIMAL;
  ltv_calc DECIMAL;
  foir_calc DECIMAL;
  dbr_calc DECIMAL;
  net_surplus DECIMAL;
  risk_factors JSONB;
  positive_factors JSONB;
  rules_passed INTEGER;
  rules_failed INTEGER;
  rules_flagged INTEGER;
  summary TEXT;
  total_obligations DECIMAL;
  policy_result JSONB;
  income_base DECIMAL;
  requested_tenure INTEGER;
  tenure_cap INTEGER;
  tenure_cap_source TEXT;
  ltv_ex_showroom DECIMAL;
  govt BOOLEAN;
  -- employer category (C8, 070)
  emp JSONB;
  emp_cat CHAR(1);
  emp_basis TEXT;
  cat_row employer_category_pricing%ROWTYPE;
  base_rate DECIMAL;
BEGIN
  SELECT * INTO app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Application not found');
  END IF;

  SELECT * INTO veh FROM vehicles WHERE application_id = p_application_id LIMIT 1;
  SELECT * INTO bureau FROM bureau_reports WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO bank FROM bank_statement_analyses WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO income FROM income_assessments WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  -- Run policy engine
  policy_result := fn_run_policy_engine(p_application_id);
  rules_passed := coalesce((policy_result->>'rules_passed')::INTEGER, 0);
  rules_failed := coalesce((policy_result->>'rules_failed')::INTEGER, 0);
  rules_flagged := coalesce((policy_result->>'rules_flagged')::INTEGER, 0);

  -- Determine decision band
  IF rules_failed > 0 THEN
    decision_band := 'REJECT';
  ELSIF rules_flagged > 0 THEN
    decision_band := 'MAYBE';
  ELSE
    decision_band := 'APPROVE';
  END IF;

  -- Get rate grid row (with safe fallback)
  IF bureau.score IS NOT NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true
        AND bureau.score BETWEEN score_band_min AND score_band_max
      LIMIT 1;
  END IF;

  IF rate_row IS NULL OR rate_row.rate_pct IS NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true AND band_label = 'APPROVE'
      LIMIT 1;
  END IF;

  -- Employer category (C8): the Employer Master's category for this case, or,
  -- when the employer is not in the master yet, the provisional category from
  -- the type the customer gave. It prices the loan (loading on the band rate),
  -- caps tenure and LTV, and sets the processing fee.
  emp := fn_case_employer_category(p_application_id);
  emp_cat := (emp->>'category')::CHAR(1);
  emp_basis := emp->>'basis';
  emp := emp->'employer';
  SELECT * INTO cat_row FROM employer_category_pricing WHERE category_code = emp_cat AND is_active LIMIT 1;
  UPDATE applications SET employer_id = coalesce(nullif(emp->>'employer_id', '')::UUID, employer_id),
                          employer_category = emp_cat, employer_category_basis = emp_basis
  WHERE id = p_application_id;

  base_rate := coalesce(rate_row.rate_pct, 8.99);
  rec_rate := CASE WHEN base_rate > 0 THEN base_rate + coalesce(cat_row.rate_loading_pct, 0) ELSE base_rate END;
  rec_amount := coalesce(app.loan_amount_requested, 0);

  -- Tenure (CC6.3): the tightest of the product rule, the bureau band's cap and
  -- (since 070) the employer category's cap.
  requested_tenure := coalesce(app.tenure_months, 60);
  SELECT c.employment_type = 'GOVERNMENT' INTO govt FROM customers c WHERE c.id = app.customer_id;
  SELECT t.cap, t.source INTO tenure_cap, tenure_cap_source
  FROM fn_tenure_cap(coalesce(govt, false), veh.on_road_price, rate_row.max_tenure_months, rate_row.band_label) t;
  IF cat_row.max_tenure_months IS NOT NULL AND cat_row.max_tenure_months < tenure_cap THEN
    tenure_cap := cat_row.max_tenure_months;
    tenure_cap_source := format('employer category %s cap', emp_cat);
  END IF;
  rec_tenure := LEAST(requested_tenure, tenure_cap);

  IF decision_band = 'REJECT' THEN
    rec_rate := 0;
    rec_emi := 0;
  ELSE
    rec_emi := fn_calculate_emi(rec_amount, rec_rate, rec_tenure);
  END IF;

  -- Calculate metrics
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  -- LTV (CC6.2): the rules judge the loan against the ex-showroom price, with a
  -- second rule on the on-road price. ltv_calculated has always held the on-road
  -- figure and the impact check reads it as such, so it stays on-road; the
  -- summary now names both.
  IF coalesce(veh.on_road_price, 0) > 0 THEN
    ltv_calc := round(rec_amount / veh.on_road_price * 100, 2);
  ELSE
    ltv_calc := 0;
  END IF;
  IF coalesce(veh.ex_showroom_price, 0) > 0 THEN
    ltv_ex_showroom := round(rec_amount / veh.ex_showroom_price * 100, 2);
  END IF;

  -- FOIR (CC6.1, decision 0.1): net salary plus eligible other income, the same
  -- base the rules use in fn_run_policy_engine. This used to be net salary alone,
  -- so the stored FOIR could read higher than the one the rules had checked.
  income_base := coalesce(income.total_eligible_income, app.declared_net_salary, 0);
  IF income_base > 0 THEN
    foir_calc := round((total_obligations + rec_emi) / income_base * 100, 2);
    dbr_calc := round(total_obligations / income_base * 100, 2);
    net_surplus := income_base - total_obligations - rec_emi;
  ELSE
    foir_calc := 0;
    dbr_calc := 0;
    net_surplus := 0;
  END IF;

  -- Build risk and positive factors
  risk_factors := coalesce(policy_result->'results', '[]'::JSONB);

  -- The rules checked FOIR at the tenure asked for. A shorter tenure raises the
  -- EMI, so if that pushes FOIR past the band's cap the file goes to a person
  -- rather than being approved on figures nobody checked.
  IF rec_tenure < requested_tenure AND decision_band <> 'REJECT' THEN
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'TENURE_CAPPED', 'result', 'INFO',
      'reason', format('Tenure reduced from %s to %s months (%s)', requested_tenure, rec_tenure, tenure_cap_source)));
    IF decision_band = 'APPROVE' AND coalesce(rate_row.max_foir_pct, 0) > 0 AND foir_calc > rate_row.max_foir_pct THEN
      decision_band := 'MAYBE';
      rules_flagged := rules_flagged + 1;
      risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
        'rule_id', 'FOIR_AT_CAPPED_TENURE', 'result', 'FLAG',
        'reason', format('FOIR is %s%% at %s months, above the %s%% cap', foir_calc, rec_tenure, rate_row.max_foir_pct)));
    END IF;
  END IF;
  -- Employer category checks (C8): LTV above the category's cap, an employer on
  -- the caution list, or payslip / Form 16 names that don't match the employer
  -- send the file to a person; an unmatched work email is noted.
  risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
    'rule_id', 'EMPLOYER_CATEGORY', 'result', 'INFO', 'rule_name', 'Employer category',
    'reason', format('Category %s (%s): rate +%s%%, LTV cap %s%%, tenure cap %s months, processing fee %s',
                     emp_cat, lower(replace(emp_basis, '_', ' ')), coalesce(cat_row.rate_loading_pct, 0),
                     cat_row.max_ltv_pct, cat_row.max_tenure_months, cat_row.processing_fee_inr)));
  IF decision_band <> 'REJECT' AND cat_row.max_ltv_pct IS NOT NULL AND ltv_ex_showroom IS NOT NULL
     AND ltv_ex_showroom > cat_row.max_ltv_pct THEN
    IF decision_band = 'APPROVE' THEN
      decision_band := 'MAYBE';
    END IF;
    rules_flagged := rules_flagged + 1;
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'LTV_CATEGORY_CAP', 'result', 'FAIL', 'severity', 'MAYBE', 'rule_name', 'LTV within the employer category cap',
      'actual', ltv_ex_showroom, 'threshold', cat_row.max_ltv_pct,
      'reason', format('LTV %s%% of ex-showroom is above the %s%% cap for category %s', ltv_ex_showroom, cat_row.max_ltv_pct, emp_cat)));
  END IF;
  IF decision_band <> 'REJECT' AND coalesce((emp->>'caution')::BOOLEAN, false) THEN
    IF decision_band = 'APPROVE' THEN
      decision_band := 'MAYBE';
    END IF;
    rules_flagged := rules_flagged + 1;
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'EMPLOYER_CAUTION', 'result', 'FAIL', 'severity', 'MAYBE', 'rule_name', 'Employer not on the caution list',
      'reason', 'The employer is on the caution list: ' || coalesce(emp->>'caution_reason', '')));
  END IF;
  IF decision_band <> 'REJECT' AND emp->'checks'->'NAME_MATCH'->>'result' = 'REVIEW' THEN
    IF decision_band = 'APPROVE' THEN
      decision_band := 'MAYBE';
    END IF;
    rules_flagged := rules_flagged + 1;
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'EMPLOYER_NAME_MATCH', 'result', 'FAIL', 'severity', 'MAYBE', 'rule_name', 'Payslip and Form 16 name the same employer',
      'reason', emp->'checks'->'NAME_MATCH'->>'note'));
  END IF;
  IF emp->'checks'->'EMAIL_DOMAIN'->>'result' = 'FAIL' THEN
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'EMPLOYER_EMAIL_DOMAIN', 'result', 'INFO', 'rule_name', 'Work email domain',
      'reason', emp->'checks'->'EMAIL_DOMAIN'->>'note'));
  END IF;
  -- the rate goes on the decision only when the case can be priced
  IF decision_band = 'REJECT' THEN
    rec_rate := 0;
  END IF;

  positive_factors := '[]'::JSONB;

  IF bureau.score IS NOT NULL AND bureau.score >= 750 THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Strong CIBIL score', 'value', bureau.score));
  END IF;
  IF bureau.dpd_max_12m IS NOT NULL AND bureau.dpd_max_12m = 0 THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Clean repayment history', 'value', 'Zero DPD'));
  END IF;
  IF net_surplus > 0 AND net_surplus > rec_emi THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Strong disposable surplus', 'value', net_surplus));
  END IF;

  -- Build summary
  IF decision_band = 'APPROVE' THEN
    summary := format('Application approved. CIBIL %s, FOIR %s%%, LTV %s%% of ex-showroom (%s%% of on-road). All %s policy rules passed.',
      coalesce(bureau.score::TEXT, 'N/A'), foir_calc, coalesce(ltv_ex_showroom::TEXT, 'N/A'), ltv_calc, rules_passed);
  ELSIF decision_band = 'REJECT' THEN
    summary := format('Application fails %s hard rule(s). Auto-decline recommended.', rules_failed);
  ELSE
    summary := format('Application flagged on %s rule(s). Manual review required.', rules_flagged);
  END IF;
  IF rec_tenure < requested_tenure AND decision_band <> 'REJECT' THEN
    summary := summary || format(' Tenure reduced from %s to %s months (%s).', requested_tenure, rec_tenure, tenure_cap_source);
  END IF;
  IF decision_band <> 'REJECT' THEN
    summary := summary || format(' Employer category %s: rate %s%% + %s%% = %s%%, processing fee %s.',
                                 emp_cat, base_rate, coalesce(cat_row.rate_loading_pct, 0), rec_rate, cat_row.processing_fee_inr);
  END IF;

  -- Insert recommendation
  INSERT INTO recommendations (
    application_id, recommendation, recommended_rate, recommended_rate_type,
    recommended_amount, recommended_tenure, recommended_emi,
    ltv_calculated, foir_calculated, dbr_calculated, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary_text, employer_category, employer_category_basis, base_rate_pct, rate_loading_pct,
    processing_fee_inr, category_ltv_cap_pct, category_tenure_cap
  ) VALUES (
    p_application_id, decision_band, rec_rate, coalesce(rate_row.rate_type, 'FIXED'),
    rec_amount, rec_tenure, rec_emi,
    ltv_calc, foir_calc, dbr_calc, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary, emp_cat, emp_basis, base_rate, coalesce(cat_row.rate_loading_pct, 0),
    cat_row.processing_fee_inr, cat_row.max_ltv_pct, cat_row.max_tenure_months
  ) RETURNING id INTO rec_id;

  -- Insert credit decision
  INSERT INTO credit_decisions (
    application_id, recommendation_id, decision, decided_by,
    sanctioned_amount, sanctioned_rate, sanctioned_tenure, sanctioned_emi,
    sanction_valid_until
  ) VALUES (
    p_application_id, rec_id, decision_band, 'SYSTEM',
    CASE WHEN decision_band != 'REJECT' THEN rec_amount ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_rate ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_tenure ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_emi ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN current_date + 30 ELSE NULL END
  ) RETURNING id INTO decision_id;

  -- Update application status
  UPDATE applications SET
    status = CASE
      WHEN decision_band = 'APPROVE' THEN 'APPROVED'
      WHEN decision_band = 'REJECT' THEN 'REJECTED'
      ELSE 'UNDER_REVIEW'
    END,
    updated_at = now()
  WHERE id = p_application_id;

  -- Audit trail
  INSERT INTO audit_events (application_id, event_type, actor_type, event_detail)
  VALUES (
    p_application_id, 'APPLICATION_ASSESSED', 'SYSTEM',
    jsonb_build_object(
      'application_id', (SELECT application_id FROM applications WHERE id = p_application_id),
      'decision', decision_band,
      'rate', rec_rate,
      'message', summary
    )
  );

  RETURN jsonb_build_object(
    'decision', decision_band,
    'rate', rec_rate,
    'emi', rec_emi,
    'tenure', rec_tenure,
    'amount', rec_amount,
    'foir_pct', foir_calc,
    'ltv_pct', ltv_calc,
    'ltv_ex_showroom_pct', ltv_ex_showroom,
    'tenure_requested', requested_tenure,
    'dbr_pct', dbr_calc,
    'net_surplus', net_surplus,
    'rules_passed', rules_passed,
    'rules_failed', rules_failed,
    'rules_flagged', rules_flagged,
    'summary', summary,
    'employer_category', emp_cat,
    'employer_category_basis', emp_basis,
    'rate_loading_pct', coalesce(cat_row.rate_loading_pct, 0),
    'processing_fee_inr', cat_row.processing_fee_inr,
    'risk_factors', risk_factors,
    'positive_factors', positive_factors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


REVOKE EXECUTE ON FUNCTION fn_generate_recommendation(UUID) FROM PUBLIC, anon, authenticated;

-- The officer's card: employer, category and how it was set, pricing applied,
-- and the case checks. Same visibility rules as the case screens.
CREATE OR REPLACE FUNCTION fn_staff_case_employer(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_sc  RECORD;
  v_emp JSONB;
  v_rec recommendations%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_sc FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT fn_sees_real_customers())
     OR NOT (v_sc.sees_all OR v_app.assigned_officer_id = v_sc.me OR (v_app.assigned_officer_id IS NULL AND v_sc.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  v_emp := fn_employer_for_application(v_app.id);
  SELECT * INTO v_rec FROM recommendations WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'employer', v_emp,
    'declared_name', (SELECT employer_name FROM customers WHERE id = v_app.customer_id),
    'declared_type', (SELECT employer_category FROM customers WHERE id = v_app.customer_id),
    'category', coalesce(v_rec.employer_category, v_app.employer_category),
    'basis', coalesce(v_rec.employer_category_basis, v_app.employer_category_basis),
    'pricing', CASE WHEN v_rec.employer_category IS NULL THEN NULL ELSE jsonb_build_object(
                 'base_rate_pct', v_rec.base_rate_pct, 'rate_loading_pct', v_rec.rate_loading_pct,
                 'rate_pct', v_rec.recommended_rate, 'processing_fee_inr', v_rec.processing_fee_inr,
                 'ltv_cap_pct', v_rec.category_ltv_cap_pct, 'tenure_cap', v_rec.category_tenure_cap,
                 'assessed_at', v_rec.created_at) END
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_case_employer(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_case_employer(TEXT) TO authenticated;

-- Checks after running (new assessments only):
-- SELECT employer_category, employer_category_basis, count(*) FROM recommendations
--   WHERE created_at > now() - interval '1 day' GROUP BY 1, 2;
-- SELECT prosrc LIKE '%fn_employer_for_application%' FROM pg_proc WHERE proname = 'fn_generate_recommendation';   -- true

-- CHECK 070: employer category on recommendations
SELECT '070' AS part, 'employer category on recommendations' AS what, (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recommendations' AND column_name = 'employer_category')) AS ok;

-- #############################################################################
-- PART 071: Rate Grid: edit and add grids, through pricing approval (fix list G3)  (sql/071_rate_grid_versions.sql)
-- #############################################################################

-- =============================================================================
-- 071: Rate Grid: edit and add grids, through pricing approval (fix list G3)
-- =============================================================================
-- The Rate Grid page could only show the grid. Now:
--   * pricing_products: a grid per product or segment. "New car, salaried"
--     (CAR_NEW_SALARIED) is the one the engine prices with; others (e.g.
--     commercial vehicles, three-wheelers, self-employed) can be added and
--     approved, and are kept until the engine handles those products.
--   * rate_grid_versions, with their bands (score band: rate, max LTV, max
--     FOIR, max tenure) and employer categories (loading, LTV cap, tenure
--     cap, processing fee).
--   * the steps: someone with pricing.author starts a draft from the grid in
--     force (or a blank one for a new product), changes figures, adds bands,
--     and sends it for approval with a date it should start; someone else
--     with pricing.approve approves or rejects it (never the author); an
--     approved grid goes live on its date and the one before it is kept as
--     history (superseded, with an end date).
--   * when the car grid goes live, its figures are written into rate_grid
--     and employer_category_pricing, the tables the engine reads; the older
--     rows are kept, switched off. So every decision was priced on exactly
--     one grid, and fn_rate_grid_version_at(product, time) says which.
--   * the version in force when this runs becomes version 1 (in force since
--     1 Aug 2026, the date of policy 2026.08).
--
-- Every step is written to the audit log (RATE_GRID_*).
-- Run order: after 070. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pricing_products (
  code         VARCHAR(30)  NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  used_by_engine BOOLEAN    NOT NULL DEFAULT false,
  created_by   UUID,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_pricing_products PRIMARY KEY (code),
  CONSTRAINT ck_pricing_products_code CHECK (code ~ '^[A-Z][A-Z0-9_]{2,29}$')
);

INSERT INTO pricing_products (code, name, description, used_by_engine) VALUES
  ('CAR_NEW_SALARIED', 'New car, salaried', 'New car loans for salaried customers: the grid the engine prices with', true)
ON CONFLICT (code) DO UPDATE SET used_by_engine = true;

CREATE TABLE IF NOT EXISTS rate_grid_versions (
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  product_code    VARCHAR(30)  NOT NULL,
  version_no      INTEGER      NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  rationale       TEXT,
  base_version_id UUID,
  authored_by     UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  decision_note   TEXT,
  effective_from  TIMESTAMPTZ,
  effective_to    TIMESTAMPTZ,
  CONSTRAINT pk_rate_grid_versions PRIMARY KEY (id),
  CONSTRAINT uq_rate_grid_versions_no UNIQUE (product_code, version_no),
  CONSTRAINT fk_rate_grid_versions_product FOREIGN KEY (product_code) REFERENCES pricing_products(code),
  CONSTRAINT ck_rate_grid_versions_status CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'REJECTED'))
);
-- one draft or pending grid per product at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_grid_versions_open ON rate_grid_versions (product_code)
  WHERE status IN ('DRAFT', 'PENDING_APPROVAL');

CREATE TABLE IF NOT EXISTS rate_grid_version_bands (
  version_id        UUID          NOT NULL,
  band_label        VARCHAR(20)   NOT NULL,
  score_band_min    SMALLINT      NOT NULL,
  score_band_max    SMALLINT      NOT NULL,
  rate_pct          NUMERIC(5,2)  NOT NULL,
  rate_type         VARCHAR(20)   NOT NULL DEFAULT 'STANDARD',
  max_ltv_pct       NUMERIC(6,2)  NOT NULL,
  max_foir_pct      NUMERIC(5,2)  NOT NULL,
  max_tenure_months SMALLINT      NOT NULL,
  CONSTRAINT pk_rate_grid_version_bands PRIMARY KEY (version_id, score_band_min),
  CONSTRAINT fk_rate_grid_version_bands_version FOREIGN KEY (version_id) REFERENCES rate_grid_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_grid_version_categories (
  version_id         UUID          NOT NULL,
  category_code      CHAR(1)       NOT NULL,
  category_label     VARCHAR(50)   NOT NULL,
  description        VARCHAR(200)  NOT NULL DEFAULT '',
  rate_loading_pct   NUMERIC(5,2)  NOT NULL,
  max_ltv_pct        NUMERIC(6,2)  NOT NULL,
  max_tenure_months  SMALLINT      NOT NULL,
  processing_fee_inr INTEGER       NOT NULL,
  CONSTRAINT pk_rate_grid_version_categories PRIMARY KEY (version_id, category_code),
  CONSTRAINT fk_rate_grid_version_categories_version FOREIGN KEY (version_id) REFERENCES rate_grid_versions(id) ON DELETE CASCADE,
  CONSTRAINT ck_rate_grid_version_categories_code CHECK (category_code IN ('A', 'B', 'C'))
);

ALTER TABLE pricing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid_version_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid_version_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pricing_products, rate_grid_versions, rate_grid_version_bands, rate_grid_version_categories FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Version 1: the grid in use today
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED') THEN
    INSERT INTO rate_grid_versions (product_code, version_no, status, rationale, effective_from, approved_at)
    VALUES ('CAR_NEW_SALARIED', 1, 'ACTIVE', 'The grid in use when grid versions started (3 Oct 2026), from policy 2026.08',
            TIMESTAMPTZ '2026-08-01 00:00:00+05:30', TIMESTAMPTZ '2026-08-01 00:00:00+05:30')
    RETURNING id INTO v_id;
    INSERT INTO rate_grid_version_bands (version_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
                                         max_ltv_pct, max_foir_pct, max_tenure_months)
    SELECT DISTINCT ON (score_band_min) v_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
           max_ltv_pct, max_foir_pct, max_tenure_months
    FROM rate_grid WHERE vehicle_category = 'CAR' AND is_active
    ORDER BY score_band_min, updated_at DESC;
    INSERT INTO rate_grid_version_categories (version_id, category_code, category_label, description, rate_loading_pct,
                                              max_ltv_pct, max_tenure_months, processing_fee_inr)
    SELECT DISTINCT ON (category_code) v_id, category_code, category_label, description, rate_loading_pct,
           max_ltv_pct, max_tenure_months, processing_fee_inr
    FROM employer_category_pricing WHERE is_active
    ORDER BY category_code, updated_at DESC;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Internal: the grid as JSON; checks on a grid; going live
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_rate_grid_json(p_version UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', v.id, 'product_code', v.product_code, 'version_no', v.version_no, 'status', v.status,
    'rationale', v.rationale, 'created_at', v.created_at, 'submitted_at', v.submitted_at,
    'authored_by', (SELECT full_name FROM users WHERE id = v.authored_by),
    'authored_by_me', v.authored_by IS NOT DISTINCT FROM fn_current_staff_id(),
    'approved_by', (SELECT full_name FROM users WHERE id = v.approved_by), 'approved_at', v.approved_at,
    'decision_note', v.decision_note, 'effective_from', v.effective_from, 'effective_to', v.effective_to,
    'bands', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'band_label', b.band_label, 'score_band_min', b.score_band_min, 'score_band_max', b.score_band_max,
                'rate_pct', b.rate_pct, 'rate_type', b.rate_type, 'max_ltv_pct', b.max_ltv_pct,
                'max_foir_pct', b.max_foir_pct, 'max_tenure_months', b.max_tenure_months)
              ORDER BY b.score_band_min DESC), '[]'::jsonb) FROM rate_grid_version_bands b WHERE b.version_id = v.id),
    'categories', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'category_code', c.category_code, 'category_label', c.category_label, 'description', c.description,
                     'rate_loading_pct', c.rate_loading_pct, 'max_ltv_pct', c.max_ltv_pct,
                     'max_tenure_months', c.max_tenure_months, 'processing_fee_inr', c.processing_fee_inr)
                   ORDER BY c.category_code), '[]'::jsonb) FROM rate_grid_version_categories c WHERE c.version_id = v.id))
  FROM rate_grid_versions v WHERE v.id = p_version;
$$;

-- What is wrong with a grid, in words; empty when it can go for approval.
CREATE OR REPLACE FUNCTION fn_rate_grid_problems(p_version UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out  TEXT[] := '{}';
  v_prev rate_grid_version_bands%ROWTYPE;
  b      rate_grid_version_bands%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rate_grid_version_bands WHERE version_id = p_version) THEN
    v_out := v_out || 'add at least one score band';
  END IF;
  FOR b IN SELECT * FROM rate_grid_version_bands WHERE version_id = p_version ORDER BY score_band_min LOOP
    IF b.score_band_min > b.score_band_max OR b.score_band_min < 300 OR b.score_band_max > 900 THEN
      v_out := v_out || format('band %s: scores must run from low to high, within 300-900', b.band_label);
    END IF;
    IF v_prev.version_id IS NOT NULL AND b.score_band_min <> v_prev.score_band_max + 1 THEN
      v_out := v_out || format('bands %s and %s: leave no gap or overlap between scores', v_prev.band_label, b.band_label);
    END IF;
    IF b.rate_pct < 0 OR b.rate_pct > 36 THEN
      v_out := v_out || format('band %s: rate between 0 and 36%%', b.band_label);
    END IF;
    IF b.rate_pct > 0 AND (b.max_ltv_pct <= 0 OR b.max_ltv_pct > 150 OR b.max_foir_pct <= 0 OR b.max_foir_pct > 100
                           OR b.max_tenure_months < 12 OR b.max_tenure_months > 120) THEN
      v_out := v_out || format('band %s: LTV up to 150%%, FOIR up to 100%%, tenure 12-120 months', b.band_label);
    END IF;
    v_prev := b;
  END LOOP;
  IF (SELECT count(*) FROM rate_grid_version_categories WHERE version_id = p_version) <> 3 THEN
    v_out := v_out || 'give all three employer categories, A, B and C';
  END IF;
  IF EXISTS (SELECT 1 FROM rate_grid_version_categories WHERE version_id = p_version
             AND (rate_loading_pct < 0 OR rate_loading_pct > 10 OR max_ltv_pct <= 0 OR max_ltv_pct > 150
                  OR max_tenure_months < 12 OR max_tenure_months > 120 OR processing_fee_inr < 0 OR processing_fee_inr > 100000)) THEN
    v_out := v_out || 'categories: loading 0-10%, LTV up to 150%, tenure 12-120 months, fee up to 1,00,000';
  END IF;
  RETURN v_out;
END;
$$;

-- Approved grids whose date has come go live; the one before is kept as history.
-- For the engine's product the figures are written into the engine's tables.
CREATE OR REPLACE FUNCTION fn_rate_grid_activate_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v  rate_grid_versions%ROWTYPE;
  v_n INTEGER := 0;
  v_code TEXT;
BEGIN
  FOR v IN SELECT * FROM rate_grid_versions WHERE status = 'APPROVED' AND effective_from <= now()
           ORDER BY product_code, effective_from LOOP
    UPDATE rate_grid_versions SET status = 'SUPERSEDED', effective_to = v.effective_from
    WHERE product_code = v.product_code AND status = 'ACTIVE';
    UPDATE rate_grid_versions SET status = 'ACTIVE' WHERE id = v.id;

    IF (SELECT used_by_engine FROM pricing_products WHERE code = v.product_code) THEN
      -- policy_version holds 10 characters; only the engine's product is written here
      v_code := 'RG-v' || v.version_no;
      UPDATE rate_grid SET is_active = false, updated_at = now() WHERE vehicle_category = 'CAR' AND is_active;
      INSERT INTO rate_grid (score_band_min, score_band_max, band_label, rate_pct, rate_type, max_ltv_pct, max_foir_pct,
                             max_tenure_months, vehicle_category, policy_version, is_active)
      SELECT b.score_band_min, b.score_band_max, b.band_label, b.rate_pct, b.rate_type, b.max_ltv_pct, b.max_foir_pct,
             b.max_tenure_months, 'CAR', v_code, true
      FROM rate_grid_version_bands b WHERE b.version_id = v.id;
      UPDATE employer_category_pricing SET is_active = false, updated_at = now() WHERE is_active;
      INSERT INTO employer_category_pricing (category_code, category_label, description, rate_loading_pct, max_ltv_pct,
                                             max_tenure_months, processing_fee_inr, display_order, policy_version, is_active)
      SELECT c.category_code, c.category_label, c.description, c.rate_loading_pct, c.max_ltv_pct, c.max_tenure_months,
             c.processing_fee_inr, ascii(c.category_code) - 64, v_code, true
      FROM rate_grid_version_categories c WHERE c.version_id = v.id
      ON CONFLICT (category_code, policy_version) DO UPDATE SET is_active = true;
    END IF;

    INSERT INTO audit_events (event_type, actor_type, event_detail)
    VALUES ('RATE_GRID_LIVE', 'SYSTEM', jsonb_build_object('product', v.product_code, 'version', v.version_no));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Which grid was in force for a product at a time (e.g. when a case was assessed).
CREATE OR REPLACE FUNCTION fn_rate_grid_version_at(p_product TEXT, p_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', v.id, 'version_no', v.version_no, 'effective_from', v.effective_from, 'effective_to', v.effective_to)
  FROM rate_grid_versions v
  WHERE v.product_code = p_product AND v.status IN ('ACTIVE', 'SUPERSEDED')
    AND v.effective_from <= p_at AND (v.effective_to IS NULL OR v.effective_to > p_at)
  ORDER BY v.effective_from DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_rate_grid_json(UUID), fn_rate_grid_problems(UUID), fn_rate_grid_activate_due()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_rate_grid_version_at(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_rate_grid_version_at(TEXT, TIMESTAMPTZ) TO authenticated;

-- -----------------------------------------------------------------------------
-- Staff functions
-- -----------------------------------------------------------------------------

-- Everything the page shows for one product: products, the grid in force,
-- the open draft or request, history, and what this person may do.
CREATE OR REPLACE FUNCTION fn_rate_grid_overview(p_product TEXT DEFAULT 'CAR_NEW_SALARIED')
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open UUID;
  v_live UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['pricing.view', 'pricing.author', 'pricing.approve',
                                          'app.view.own', 'app.view.team', 'app.view.all']);
  PERFORM fn_rate_grid_activate_due();
  SELECT id INTO v_live FROM rate_grid_versions WHERE product_code = p_product AND status = 'ACTIVE';
  SELECT id INTO v_open FROM rate_grid_versions WHERE product_code = p_product AND status IN ('DRAFT', 'PENDING_APPROVAL');
  RETURN jsonb_build_object(
    'product', p_product,
    'products', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'description', description,
                                                               'used_by_engine', used_by_engine) ORDER BY NOT used_by_engine, name), '[]'::jsonb)
                 FROM pricing_products),
    'in_force', CASE WHEN v_live IS NULL THEN NULL ELSE fn_rate_grid_json(v_live) END,
    'open', CASE WHEN v_open IS NULL THEN NULL ELSE fn_rate_grid_json(v_open) || jsonb_build_object('problems', to_jsonb(fn_rate_grid_problems(v_open))) END,
    'approved_next', (SELECT fn_rate_grid_json(id) FROM rate_grid_versions WHERE product_code = p_product AND status = 'APPROVED'
                      ORDER BY effective_from LIMIT 1),
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', v.id, 'version_no', v.version_no, 'status', v.status, 'rationale', v.rationale,
                   'authored_by', (SELECT full_name FROM users WHERE id = v.authored_by),
                   'approved_by', (SELECT full_name FROM users WHERE id = v.approved_by),
                   'effective_from', v.effective_from, 'effective_to', v.effective_to, 'decision_note', v.decision_note)
                 ORDER BY v.version_no DESC), '[]'::jsonb)
                FROM rate_grid_versions v WHERE v.product_code = p_product),
    'can_author', fn_has_permission('pricing.author'),
    'can_approve', fn_has_permission('pricing.approve')
  );
END;
$$;

-- A new product or segment (it gets a blank draft grid to fill in).
CREATE OR REPLACE FUNCTION fn_rate_grid_product_create(p_code TEXT, p_name TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v_code  TEXT := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '_', 'g'));
BEGIN
  IF v_code !~ '^[A-Z][A-Z0-9_]{2,29}$' OR length(btrim(coalesce(p_name, ''))) < 3 THEN
    RAISE EXCEPTION 'give the product a short code (e.g. CV_SALARIED) and a name' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pricing_products WHERE code = v_code) THEN
    RAISE EXCEPTION 'there is already a product with that code' USING ERRCODE = '23505';
  END IF;
  INSERT INTO pricing_products (code, name, description, used_by_engine, created_by)
  VALUES (v_code, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), false, v_actor);
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_PRODUCT_ADDED', 'USER', v_actor, jsonb_build_object('product', v_code, 'name', btrim(p_name)));
  RETURN fn_rate_grid_draft_create(v_code, 'First grid for ' || btrim(p_name));
END;
$$;

-- Start a draft: a copy of the grid in force, or of the car grid for a new product.
CREATE OR REPLACE FUNCTION fn_rate_grid_draft_create(p_product TEXT, p_rationale TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v_base  UUID;
  v_id    UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_products WHERE code = p_product) THEN
    RAISE EXCEPTION 'no such product' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM rate_grid_versions WHERE product_code = p_product AND status IN ('DRAFT', 'PENDING_APPROVAL')) THEN
    RAISE EXCEPTION 'this product already has a draft or a grid waiting for approval' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_base FROM rate_grid_versions WHERE product_code = p_product AND status = 'ACTIVE';
  IF v_base IS NULL THEN
    SELECT id INTO v_base FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status = 'ACTIVE';
  END IF;
  INSERT INTO rate_grid_versions (product_code, version_no, status, rationale, base_version_id, authored_by)
  VALUES (p_product, coalesce((SELECT max(version_no) FROM rate_grid_versions WHERE product_code = p_product), 0) + 1,
          'DRAFT', nullif(btrim(coalesce(p_rationale, '')), ''), v_base, v_actor)
  RETURNING id INTO v_id;
  INSERT INTO rate_grid_version_bands
  SELECT v_id, band_label, score_band_min, score_band_max, rate_pct, rate_type, max_ltv_pct, max_foir_pct, max_tenure_months
  FROM rate_grid_version_bands WHERE version_id = v_base;
  INSERT INTO rate_grid_version_categories
  SELECT v_id, category_code, category_label, description, rate_loading_pct, max_ltv_pct, max_tenure_months, processing_fee_inr
  FROM rate_grid_version_categories WHERE version_id = v_base;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_DRAFTED', 'USER', v_actor, jsonb_build_object('product', p_product, 'version_id', v_id));
  RETURN fn_rate_grid_json(v_id);
END;
$$;

-- Replace the draft's bands and categories (the author only, while a draft).
CREATE OR REPLACE FUNCTION fn_rate_grid_draft_save(p_version UUID, p_bands JSONB, p_categories JSONB, p_rationale TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v rate_grid_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'only a draft can be changed' USING ERRCODE = '22023';
  END IF;
  IF v.authored_by IS DISTINCT FROM v_actor AND NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'only the person who started the draft can change it' USING ERRCODE = '42501';
  END IF;
  DELETE FROM rate_grid_version_bands WHERE version_id = p_version;
  INSERT INTO rate_grid_version_bands (version_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
                                       max_ltv_pct, max_foir_pct, max_tenure_months)
  SELECT p_version, upper(left(btrim(x->>'band_label'), 20)), (x->>'score_band_min')::SMALLINT, (x->>'score_band_max')::SMALLINT,
         (x->>'rate_pct')::NUMERIC, coalesce(nullif(x->>'rate_type', ''), 'STANDARD'), (x->>'max_ltv_pct')::NUMERIC,
         (x->>'max_foir_pct')::NUMERIC, (x->>'max_tenure_months')::SMALLINT
  FROM jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) x;
  DELETE FROM rate_grid_version_categories WHERE version_id = p_version;
  INSERT INTO rate_grid_version_categories (version_id, category_code, category_label, description, rate_loading_pct,
                                            max_ltv_pct, max_tenure_months, processing_fee_inr)
  SELECT p_version, upper(x->>'category_code'), coalesce(nullif(x->>'category_label', ''), 'Category ' || upper(x->>'category_code')),
         coalesce(x->>'description', ''), (x->>'rate_loading_pct')::NUMERIC, (x->>'max_ltv_pct')::NUMERIC,
         (x->>'max_tenure_months')::SMALLINT, (x->>'processing_fee_inr')::INTEGER
  FROM jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) x;
  IF p_rationale IS NOT NULL THEN
    UPDATE rate_grid_versions SET rationale = nullif(btrim(p_rationale), '') WHERE id = p_version;
  END IF;
  RETURN fn_rate_grid_json(p_version) || jsonb_build_object('problems', to_jsonb(fn_rate_grid_problems(p_version)));
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'two bands start at the same score' USING ERRCODE = '22023';
  WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
    RAISE EXCEPTION 'fill in every figure with a number' USING ERRCODE = '22023';
END;
$$;

-- Send for approval with the date it should start; withdraw back to a draft; discard a draft.
CREATE OR REPLACE FUNCTION fn_rate_grid_submit(p_version UUID, p_effective_from DATE, p_rationale TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v rate_grid_versions%ROWTYPE;
  v_problems TEXT[];
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'DRAFT' OR v.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'you can only send your own draft' USING ERRCODE = '42501';
  END IF;
  IF p_effective_from IS NULL OR p_effective_from < (now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
    RAISE EXCEPTION 'choose a start date from today on' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_rationale, ''))) < 10 THEN
    RAISE EXCEPTION 'say why the grid is changing (a sentence)' USING ERRCODE = '22023';
  END IF;
  v_problems := fn_rate_grid_problems(p_version);
  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION 'fix the grid first: %', array_to_string(v_problems, '; ') USING ERRCODE = '22023';
  END IF;
  UPDATE rate_grid_versions SET status = 'PENDING_APPROVAL', submitted_at = now(), rationale = btrim(p_rationale),
         effective_from = (p_effective_from::TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
  WHERE id = p_version;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_SUBMITTED', 'USER', v_actor,
          jsonb_build_object('product', v.product_code, 'version', v.version_no, 'from', p_effective_from, 'why', btrim(p_rationale)));
  RETURN fn_rate_grid_json(p_version);
END;
$$;

CREATE OR REPLACE FUNCTION fn_rate_grid_withdraw(p_version UUID, p_discard BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v rate_grid_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status NOT IN ('DRAFT', 'PENDING_APPROVAL') OR v.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'you can only withdraw or discard your own draft' USING ERRCODE = '42501';
  END IF;
  IF p_discard THEN
    DELETE FROM rate_grid_versions WHERE id = p_version;
    INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
    VALUES ('RATE_GRID_DISCARDED', 'USER', v_actor, jsonb_build_object('product', v.product_code, 'version', v.version_no));
    RETURN NULL;
  END IF;
  UPDATE rate_grid_versions SET status = 'DRAFT', submitted_at = NULL, effective_from = NULL WHERE id = p_version;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_WITHDRAWN', 'USER', v_actor, jsonb_build_object('product', v.product_code, 'version', v.version_no));
  RETURN fn_rate_grid_json(p_version);
END;
$$;

-- Approve or reject: pricing.approve, and never the author.
CREATE OR REPLACE FUNCTION fn_rate_grid_decide(p_version UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.approve');
  v rate_grid_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'no grid waiting for approval with that id' USING ERRCODE = 'P0002';
  END IF;
  IF v.authored_by IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'a second person must approve a rate grid' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND length(btrim(coalesce(p_note, ''))) < 5 THEN
    RAISE EXCEPTION 'say why it is rejected' USING ERRCODE = '22023';
  END IF;
  UPDATE rate_grid_versions SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         approved_by = v_actor, approved_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = p_version;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (CASE WHEN p_approve THEN 'RATE_GRID_APPROVED' ELSE 'RATE_GRID_REJECTED' END, 'USER', v_actor,
          jsonb_build_object('product', v.product_code, 'version', v.version_no, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  IF p_approve THEN
    PERFORM fn_rate_grid_activate_due();
  END IF;
  RETURN fn_rate_grid_json(p_version);
END;
$$;

REVOKE ALL ON FUNCTION fn_rate_grid_overview(TEXT), fn_rate_grid_product_create(TEXT, TEXT, TEXT),
                       fn_rate_grid_draft_create(TEXT, TEXT), fn_rate_grid_draft_save(UUID, JSONB, JSONB, TEXT),
                       fn_rate_grid_submit(UUID, DATE, TEXT), fn_rate_grid_withdraw(UUID, BOOLEAN),
                       fn_rate_grid_decide(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_rate_grid_overview(TEXT), fn_rate_grid_product_create(TEXT, TEXT, TEXT),
                          fn_rate_grid_draft_create(TEXT, TEXT), fn_rate_grid_draft_save(UUID, JSONB, JSONB, TEXT),
                          fn_rate_grid_submit(UUID, DATE, TEXT), fn_rate_grid_withdraw(UUID, BOOLEAN),
                          fn_rate_grid_decide(UUID, BOOLEAN, TEXT) TO authenticated;

-- The officer's employer card also names the grid in force when the case was
-- assessed (070's function, with that one key added).
CREATE OR REPLACE FUNCTION fn_staff_case_employer(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_sc  RECORD;
  v_emp JSONB;
  v_rec recommendations%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_sc FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT fn_sees_real_customers())
     OR NOT (v_sc.sees_all OR v_app.assigned_officer_id = v_sc.me OR (v_app.assigned_officer_id IS NULL AND v_sc.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  v_emp := fn_employer_for_application(v_app.id);
  SELECT * INTO v_rec FROM recommendations WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'employer', v_emp,
    'declared_name', (SELECT employer_name FROM customers WHERE id = v_app.customer_id),
    'declared_type', (SELECT employer_category FROM customers WHERE id = v_app.customer_id),
    'category', coalesce(v_rec.employer_category, v_app.employer_category),
    'basis', coalesce(v_rec.employer_category_basis, v_app.employer_category_basis),
    'pricing', CASE WHEN v_rec.employer_category IS NULL THEN NULL ELSE jsonb_build_object(
                 'base_rate_pct', v_rec.base_rate_pct, 'rate_loading_pct', v_rec.rate_loading_pct,
                 'rate_pct', v_rec.recommended_rate, 'processing_fee_inr', v_rec.processing_fee_inr,
                 'ltv_cap_pct', v_rec.category_ltv_cap_pct, 'tenure_cap', v_rec.category_tenure_cap,
                 'assessed_at', v_rec.created_at,
                 'rate_grid', fn_rate_grid_version_at('CAR_NEW_SALARIED', v_rec.created_at)) END
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_case_employer(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_case_employer(TEXT) TO authenticated;

-- Checks after running:
-- SELECT product_code, version_no, status FROM rate_grid_versions;   -- CAR_NEW_SALARIED, 1, ACTIVE
-- SELECT count(*) FROM rate_grid_version_bands;                     -- 3 (the bands in use)

-- CHECK 071: rate grid versions, one live
SELECT '071' AS part, 'rate grid versions, one live' AS what, (EXISTS (SELECT 1 FROM rate_grid_versions WHERE status = 'ACTIVE')) AS ok;

-- #############################################################################
-- PART 072: Practice logins for visitors: officer, manager, head (fix list D1)  (sql/072_practice_roles.sql)
-- #############################################################################

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

-- CHECK 072: practice roles
SELECT '072' AS part, 'practice roles' AS what, ((SELECT count(*) FROM roles WHERE is_practice) = 3) AS ok;

-- #############################################################################
-- PART 073: Reset the practice cases to fresh (fix list D2)  (sql/073_practice_reset.sql)
-- #############################################################################

-- =============================================================================
-- 073: Reset the practice cases to fresh (fix list D2)
-- =============================================================================
-- Visitors on the practice logins (072) take, check, decide and override
-- synthetic cases. fn_practice_reset() puts every case they touched back the
-- way it was before the first practice change (from practice_case_snapshots):
--   * the case's status, stage, owner and decision time;
--   * its credit decision, exactly as the engine (or an earlier officer) left it;
--   * overrides recorded by practice logins on it are removed;
--   * policy drafts written by practice logins are cancelled (versions are
--     never deleted, 016);
--   * cases still assigned to a practice login are let go.
-- The audit log keeps what the visitors did (it can't be changed); one
-- PRACTICE_RESET entry records the reset and its counts.
--
-- Operator only: run it in the SQL editor, or from the daily simulation
-- (G7) once switched on. Website and service logins cannot call it.
--
--   SELECT fn_practice_reset();
--
-- Run order: after 072. Safe to re-run (a second reset finds nothing to do).
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_practice_reset()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice UUID[];
  v_cases    INTEGER := 0;
  v_overrides INTEGER := 0;
  v_drafts   INTEGER := 0;
  v_released INTEGER := 0;
  s          practice_case_snapshots%ROWTYPE;
  v_ver      UUID;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'the practice reset is run by an operator, not from the website' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(u.id), '{}') INTO v_practice FROM users u JOIN roles r ON r.code = u.role WHERE r.is_practice;

  FOR s IN SELECT * FROM practice_case_snapshots LOOP
    DELETE FROM override_logs WHERE application_id = s.application_id;
    DELETE FROM credit_decisions WHERE application_id = s.application_id;
    IF s.decision IS NOT NULL THEN
      INSERT INTO credit_decisions SELECT * FROM jsonb_populate_record(NULL::credit_decisions, s.decision);
    END IF;
    UPDATE applications SET status = s.status, approval_stage = s.approval_stage,
           assigned_officer_id = s.assigned_officer_id, final_decision_at = s.final_decision_at, updated_at = now()
    WHERE id = s.application_id;
    v_cases := v_cases + 1;
  END LOOP;
  DELETE FROM practice_case_snapshots;

  DELETE FROM override_logs WHERE officer_id = ANY (v_practice);
  GET DIAGNOSTICS v_overrides = ROW_COUNT;

  UPDATE applications SET assigned_officer_id = NULL WHERE assigned_officer_id = ANY (v_practice);
  GET DIAGNOSTICS v_released = ROW_COUNT;

  FOR v_ver IN SELECT id FROM policy_versions WHERE authored_by = ANY (v_practice) AND status = 'DRAFT' LOOP
    PERFORM fn_policy_draft_discard(v_ver);
    v_drafts := v_drafts + 1;
  END LOOP;

  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('PRACTICE_RESET', 'SYSTEM', jsonb_build_object('cases_restored', v_cases, 'overrides_removed', v_overrides,
                                                         'cases_released', v_released, 'policy_drafts_cancelled', v_drafts));
  RETURN jsonb_build_object('cases_restored', v_cases, 'overrides_removed', v_overrides,
                            'cases_released', v_released, 'policy_drafts_cancelled', v_drafts);
END;
$$;

REVOKE ALL ON FUNCTION fn_practice_reset() FROM PUBLIC, anon, authenticated, service_role;

-- Check after running: SELECT fn_practice_reset();   -- counts; a second run gives zeros

-- CHECK 073: practice reset
SELECT '073' AS part, 'practice reset' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_practice_reset')) AS ok;

-- #############################################################################
-- PART 074: Policy Rules: switch a rule on or off, modify its limit, through approval (fix list G2)  (sql/074_policy_rule_changes.sql)
-- #############################################################################

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

-- CHECK 074: rule changes through approval
SELECT '074' AS part, 'rule changes through approval' AS what, (to_regclass('public.policy_version_rule_changes') IS NOT NULL) AS ok;

-- #############################################################################
-- PART 075: Daily simulation: the synthetic book keeps moving by itself (fix list G7)  (sql/075_daily_simulation.sql)
-- #############################################################################

-- =============================================================================
-- 075: Daily simulation: the synthetic book keeps moving by itself (fix list G7)
-- =============================================================================
-- *****************************************************************************
-- *  REMOVE BEFORE REAL USE. This makes up customers, decisions, loans and    *
-- *  payments every day. It touches SYNTHETIC records only, but it must not   *
-- *  run on a production lender's database. To stop it:                      *
-- *    SELECT cron.unschedule('cercit-simulation-daily');                     *
-- *    UPDATE simulation_settings SET simulation_enabled = false;             *
-- *  To remove everything it (and 055/056) made: SELECT fn_synthetic_purge(); *
-- *****************************************************************************
--
-- Every day, fn_sim_daily():
--   1. 10 new synthetic leads through the same generator (055): some stay
--      drafts, some are submitted, the rest are assessed by the engine and
--      approved, referred or declined; they are dated that day
--   2. newly approved (final) synthetic cases are disbursed, dated that day,
--      with their repayment schedule
--   3. every synthetic instalment due that day gets a payment attempt: most
--      clear on the due date; ~3% bounce and are paid 2-12 days later; ~0.25%
--      of instalments run 31-60 days late; ~0.05% start a stop (the loan
--      bounces every month after, reaching NPA at 90+ days); weaker profiles
--      (score below 700 or FOIR above 50%) slip three times as often, as in 056
--   4. loans that have paid every instalment close
--   5. the portfolio's stored status is refreshed (062); approved policy
--      versions and rate grids whose date has come go live; new employers are
--      added to the master (unverified); the practice cases are reset (073)
--   6. a one-line summary goes in sim_daily_runs
-- Each day's outcomes come from fixed seeds (the case number and instalment),
-- so a day can be replayed with the same result. Missed days are caught up in
-- order. Everything it makes is SYNTHETIC (SYN... case numbers, SYNL... loans,
-- @synthetic.invalid emails, 5550 mobiles); functions are named fn_sim_...;
-- payment references start SIMD.
--
-- Switch: simulation_settings.simulation_enabled (on for cercit).
-- Schedule: pg_cron job 'cercit-simulation-daily' at 06:00 India time, made
-- here when pg_cron is switched on in Supabase (Database > Extensions > pg_cron);
-- otherwise run this file again after switching it on, or run
-- SELECT fn_sim_daily(); by hand.
--
-- Run order: after 074. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS simulation_settings (
  id                   BOOLEAN  NOT NULL DEFAULT true,
  simulation_enabled   BOOLEAN  NOT NULL DEFAULT true,
  daily_leads          SMALLINT NOT NULL DEFAULT 10,
  reset_practice_daily BOOLEAN  NOT NULL DEFAULT true,
  CONSTRAINT pk_simulation_settings PRIMARY KEY (id),
  CONSTRAINT ck_simulation_settings_one CHECK (id),
  CONSTRAINT ck_simulation_settings_leads CHECK (daily_leads BETWEEN 0 AND 100)
);
INSERT INTO simulation_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sim_daily_runs (
  day        DATE         NOT NULL,
  summary    JSONB        NOT NULL,
  ran_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_sim_daily_runs PRIMARY KEY (day)
);

ALTER TABLE simulation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sim_daily_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON simulation_settings, sim_daily_runs FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Leads: the generator's day batch, dated that day
-- -----------------------------------------------------------------------------
-- Day batches start at 201 (case numbers from SYN0002001), clear of the eight
-- starting batches of 250. Day 0 is 1 Oct 2026.
CREATE OR REPLACE FUNCTION fn_sim_leads(p_day DATE, p_count INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch INTEGER := 201 + (p_day - DATE '2026-10-01');
  v_from  INTEGER;
  v_to    INTEGER;
  v_r     JSONB;
  v_shift INTERVAL;
  a       RECORD;
BEGIN
  IF p_count < 1 OR v_batch < 201 THEN
    RETURN jsonb_build_object('leads', 0);
  END IF;
  v_r := fn_synthetic_generate(v_batch, p_count);
  v_from := (v_batch - 1) * p_count + 1;
  v_to := v_batch * p_count;
  -- dated that day, in office hours, keeping each lead's own order
  FOR a IN SELECT id, customer_id, application_id, created_at FROM applications
           WHERE origin = 'SYNTHETIC' AND application_id BETWEEN 'SYN' || lpad(v_from::TEXT, 7, '0') AND 'SYN' || lpad(v_to::TEXT, 7, '0')
             AND created_at::DATE <> p_day
  LOOP
    v_shift := ((p_day::TIMESTAMP + make_interval(hours => 9) + make_interval(mins => (substr(a.application_id, 4)::INTEGER % 480)))
                AT TIME ZONE 'Asia/Kolkata') - a.created_at;
    UPDATE applications SET created_at = created_at + v_shift,
           documents_submitted_at = documents_submitted_at + v_shift,
           customer_submitted_at = customer_submitted_at + v_shift,
           assessment_started_at = assessment_started_at + v_shift,
           final_decision_at = final_decision_at + v_shift
    WHERE id = a.id;
    UPDATE customers SET created_at = created_at + v_shift WHERE id = a.customer_id;
    UPDATE credit_decisions SET decided_at = decided_at + v_shift, created_at = created_at + v_shift WHERE application_id = a.id;
    UPDATE recommendations SET created_at = created_at + v_shift, generated_at = generated_at + v_shift WHERE application_id = a.id;
  END LOOP;
  RETURN jsonb_build_object('leads', (SELECT count(*) FROM applications WHERE origin = 'SYNTHETIC'
                                      AND application_id BETWEEN 'SYN' || lpad(v_from::TEXT, 7, '0') AND 'SYN' || lpad(v_to::TEXT, 7, '0')),
                            'by_status', (SELECT jsonb_object_agg(status, n) FROM (
                                            SELECT status, count(*) AS n FROM applications WHERE origin = 'SYNTHETIC'
                                              AND application_id BETWEEN 'SYN' || lpad(v_from::TEXT, 7, '0') AND 'SYN' || lpad(v_to::TEXT, 7, '0')
                                            GROUP BY status) s));
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Disburse the day's approved synthetic cases (056's schedule, no seasoning)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sim_disburse_day(p_day DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      RECORD;
  d      RECORD;
  v_loan UUID;
  v_rate NUMERIC;
  v_emi  NUMERIC;
  v_bal  NUMERIC;
  v_int  NUMERIC;
  v_prin NUMERIC;
  v_first DATE;
  v_n    INTEGER := 0;
BEGIN
  FOR r IN
    SELECT a.* FROM applications a
    WHERE a.origin = 'SYNTHETIC' AND a.status = 'APPROVED' AND a.approval_stage = 'FINAL'
      AND NOT EXISTS (SELECT 1 FROM loan_accounts l WHERE l.application_id = a.id)
    ORDER BY a.application_id
  LOOP
    SELECT * INTO d FROM credit_decisions c WHERE c.application_id = r.id AND c.decision = 'APPROVE'
    ORDER BY c.created_at DESC LIMIT 1;
    CONTINUE WHEN d.id IS NULL OR d.sanctioned_amount IS NULL OR coalesce(d.sanctioned_tenure, 0) < 1;
    v_rate := coalesce(d.sanctioned_rate, 9.9);
    v_emi := coalesce(d.sanctioned_emi, round(fn_emi(d.sanctioned_amount, v_rate, d.sanctioned_tenure)));
    v_first := fn_first_emi_date(p_day);
    INSERT INTO loan_accounts (loan_account_no, application_id, customer_id, disbursed_on, disbursed_amount, installment_day,
                               emi_amount, tenure_months, contract_rate_pct, first_emi_date, paid_to, payment_ref, net_paid)
    VALUES ('SYNL' || substr(r.application_id, 4), r.id, r.customer_id, p_day, d.sanctioned_amount, 5, v_emi,
            d.sanctioned_tenure, v_rate, v_first, 'The dealer', 'SIMNEFT' || substr(r.application_id, 4), d.sanctioned_amount)
    RETURNING id INTO v_loan;
    v_bal := d.sanctioned_amount;
    FOR i IN 1..d.sanctioned_tenure LOOP
      v_int := round(v_bal * v_rate / 1200, 2);
      v_prin := CASE WHEN i = d.sanctioned_tenure THEN v_bal ELSE v_emi - v_int END;
      INSERT INTO loan_installments (loan_id, installment_no, due_date, amount_due, principal_due, interest_due)
      VALUES (v_loan, i, (v_first + make_interval(months => i - 1))::DATE, v_prin + v_int, v_prin, v_int);
      v_bal := v_bal - v_prin;
    END LOOP;
    UPDATE applications SET status = 'DISBURSED' WHERE id = r.id;
    INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
    VALUES (r.id, 'LOAN_DISBURSED', jsonb_build_object('loan_account_no', 'SYNL' || substr(r.application_id, 4),
                                                       'amount', d.sanctioned_amount, 'synthetic', true, 'simulated_day', p_day), 'SYSTEM');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. The day's payments, cures and closures
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sim_payments_day(p_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i        RECORD;
  m        INTEGER[];
  v_weak   BOOLEAN;
  v_mult   INTEGER;
  v_r16    INTEGER;
  v_kind   TEXT;
  v_cure   DATE;
  v_paid   INTEGER := 0;
  v_bounce INTEGER := 0;
  v_late   INTEGER := 0;
  v_stop   INTEGER := 0;
  v_cured  INTEGER := 0;
  v_closed INTEGER := 0;
BEGIN
  -- Instalments due by that day with no attempt yet (also any left over from
  -- before the simulation started), each dated its own due date
  FOR i IN
    SELECT li.id, li.loan_id, li.installment_no, li.due_date, li.amount_due, a.application_id, a.id AS app_uuid
    FROM loan_installments li
    JOIN loan_accounts l ON l.id = li.loan_id AND l.status = 'LIVE'
    JOIN applications a ON a.id = l.application_id AND a.origin = 'SYNTHETIC'
    WHERE li.due_date <= p_day
      AND NOT EXISTS (SELECT 1 FROM loan_repayments r WHERE r.installment_id = li.id)
    ORDER BY a.application_id, li.installment_no
  LOOP
    m := fn_sim_bytes('synthetic-v1:' || i.application_id, 'pay' || i.installment_no);
    SELECT coalesce((SELECT score FROM bureau_reports WHERE application_id = i.app_uuid ORDER BY created_at DESC LIMIT 1), 700) < 700
        OR coalesce((SELECT foir_calculated FROM recommendations WHERE application_id = i.app_uuid ORDER BY created_at DESC LIMIT 1), 0) > 50
      INTO v_weak;
    v_mult := CASE WHEN v_weak THEN 3 ELSE 1 END;
    v_r16 := m[4] * 256 + m[5];
    v_kind := CASE
      -- a loan that has stopped keeps bouncing: an earlier instalment 30+ days overdue and never paid
      WHEN EXISTS (SELECT 1 FROM loan_installments e
                   WHERE e.loan_id = i.loan_id AND e.installment_no < i.installment_no AND e.due_date <= i.due_date - 30
                     AND EXISTS (SELECT 1 FROM loan_repayments rb WHERE rb.installment_id = e.id AND rb.outcome = 'BOUNCED')
                     AND NOT EXISTS (SELECT 1 FROM loan_repayments rs WHERE rs.installment_id = e.id AND rs.outcome = 'SUCCESS'))
        THEN 'STOPPED'
      WHEN v_r16 < 33 * v_mult THEN 'STOP'
      WHEN v_r16 < (33 + 164) * v_mult THEN 'LATE'
      WHEN m[2] < 8 THEN 'BOUNCE'
      ELSE 'CLEAN' END;
    IF v_kind = 'CLEAN' THEN
      INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no)
      VALUES (i.loan_id, i.id, i.due_date, i.amount_due, 'MANDATE', 'SUCCESS', 'SIMD' || i.installment_no);
      v_paid := v_paid + 1;
    ELSE
      -- the bounce carries the day it will be paid (never, for a stop), so later days know
      v_cure := CASE v_kind WHEN 'BOUNCE' THEN i.due_date + 2 + m[3] % 11 WHEN 'LATE' THEN i.due_date + 31 + m[1] % 30 END;
      INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no, bounce_reason)
      VALUES (i.loan_id, i.id, i.due_date, i.amount_due, 'MANDATE', 'BOUNCED',
              'SIMD' || i.installment_no || 'B' || coalesce(to_char(v_cure, 'YYYYMMDD'), 'NEVER'), 'Insufficient funds');
      v_bounce := v_bounce + 1;
      v_late := v_late + CASE WHEN v_kind = 'LATE' THEN 1 ELSE 0 END;
      v_stop := v_stop + CASE WHEN v_kind = 'STOP' THEN 1 ELSE 0 END;
    END IF;
  END LOOP;

  -- Bounced instalments whose day to be paid has come
  FOR i IN
    SELECT rb.loan_id, rb.installment_id, li.installment_no, li.amount_due,
           to_date(substring(rb.reference_no FROM 'B([0-9]{8})$'), 'YYYYMMDD') AS cure_on
    FROM loan_repayments rb
    JOIN loan_installments li ON li.id = rb.installment_id
    WHERE rb.outcome = 'BOUNCED' AND rb.reference_no ~ '^SIMD[0-9]+B[0-9]{8}$'
      AND to_date(substring(rb.reference_no FROM 'B([0-9]{8})$'), 'YYYYMMDD') <= p_day
      AND NOT EXISTS (SELECT 1 FROM loan_repayments rs WHERE rs.installment_id = rb.installment_id AND rs.outcome = 'SUCCESS')
  LOOP
    INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no)
    VALUES (i.loan_id, i.installment_id, i.cure_on, i.amount_due, 'UPI', 'SUCCESS', 'SIMD' || i.installment_no || 'P')
    ON CONFLICT (loan_id, reference_no) DO NOTHING;
    v_cured := v_cured + 1;
  END LOOP;

  -- Loans with every instalment paid close
  UPDATE loan_accounts l SET status = 'CLOSED'
  FROM applications a
  WHERE a.id = l.application_id AND a.origin = 'SYNTHETIC' AND l.status = 'LIVE'
    AND (SELECT max(due_date) FROM loan_installments WHERE loan_id = l.id) <= p_day
    AND NOT EXISTS (SELECT 1 FROM loan_installments li WHERE li.loan_id = l.id
                    AND NOT EXISTS (SELECT 1 FROM loan_repayments rs WHERE rs.installment_id = li.id AND rs.outcome = 'SUCCESS'));
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object('paid_on_time', v_paid, 'bounced', v_bounce, 'late_31_60_started', v_late,
                            'stopped_paying', v_stop, 'paid_after_bounce', v_cured, 'loans_closed', v_closed);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. The daily run
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sim_daily(p_day DATE DEFAULT NULL, p_replay BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       simulation_settings%ROWTYPE;
  v_to    DATE := coalesce(p_day, (now() AT TIME ZONE 'Asia/Kolkata')::DATE);
  v_day   DATE;
  v_out   JSONB := '[]'::jsonb;
  v_sum   JSONB;
  v_leads JSONB;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'the simulation runs from the scheduler or the SQL editor' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM simulation_settings;
  IF NOT coalesce(s.simulation_enabled, false) THEN
    RETURN jsonb_build_object('skipped', 'simulation_enabled is off');
  END IF;

  -- catch up missed days in order (at most 31), starting the day after the last run
  v_day := CASE WHEN p_replay THEN v_to
                ELSE greatest(coalesce((SELECT max(day) FROM sim_daily_runs) + 1, v_to), v_to - 30) END;
  WHILE v_day <= v_to LOOP
    IF p_replay OR NOT EXISTS (SELECT 1 FROM sim_daily_runs WHERE day = v_day) THEN
      v_leads := fn_sim_leads(v_day, s.daily_leads);
      PERFORM fn_employer_seed_from_applications();
      v_sum := jsonb_build_object('day', v_day) || v_leads
               || jsonb_build_object('disbursed', fn_sim_disburse_day(v_day))
               || fn_sim_payments_day(v_day);
      INSERT INTO sim_daily_runs (day, summary) VALUES (v_day, v_sum)
      ON CONFLICT (day) DO UPDATE SET summary = EXCLUDED.summary, ran_at = now();
      v_out := v_out || v_sum;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  -- the rest of the day's housekeeping
  PERFORM fn_loan_status_refresh(NULL);
  PERFORM fn_policy_activate_due();
  PERFORM fn_rate_grid_activate_due();
  IF s.reset_practice_daily THEN
    PERFORM fn_practice_reset();
  END IF;
  IF jsonb_array_length(v_out) > 0 THEN
    INSERT INTO audit_events (event_type, actor_type, event_detail)
    VALUES ('SIMULATION_DAY', 'SYSTEM', jsonb_build_object('days', v_out));
  END IF;
  RETURN jsonb_build_object('days', v_out);
END;
$$;

REVOKE ALL ON FUNCTION fn_sim_leads(DATE, INTEGER), fn_sim_disburse_day(DATE), fn_sim_payments_day(DATE),
                       fn_sim_daily(DATE, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

-- The day's summaries for the dashboard and reports (staff who see the book).
CREATE OR REPLACE FUNCTION fn_sim_recent_days(p_days INTEGER DEFAULT 14)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.team', 'app.view.all', 'policy.simulate', 'policy.author', 'policy.approve']);
  RETURN jsonb_build_object(
    'enabled', (SELECT simulation_enabled FROM simulation_settings),
    'days', (SELECT coalesce(jsonb_agg(summary ORDER BY day DESC), '[]'::jsonb)
             FROM (SELECT * FROM sim_daily_runs ORDER BY day DESC LIMIT LEAST(greatest(p_days, 1), 90)) d));
END;
$$;
REVOKE ALL ON FUNCTION fn_sim_recent_days(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_sim_recent_days(INTEGER) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Schedule: 06:00 India time (00:30 UTC), once pg_cron is switched on
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cercit-simulation-daily';
    PERFORM cron.schedule('cercit-simulation-daily', '30 0 * * *', 'SELECT fn_sim_daily()');
    RAISE NOTICE 'cercit-simulation-daily scheduled for 06:00 India time';
  ELSE
    RAISE NOTICE 'pg_cron is not switched on: switch it on (Database > Extensions > pg_cron) and run this file again, or run SELECT fn_sim_daily(); by hand';
  END IF;
END;
$$;

-- Checks after running:
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'cercit-simulation-daily';   -- one row (after pg_cron is on)
-- SELECT fn_sim_daily();                                                                -- today's summary
-- SELECT day, summary FROM sim_daily_runs ORDER BY day DESC LIMIT 7;

-- CHECK 075: daily simulation
SELECT '075' AS part, 'daily simulation' AS what, (to_regclass('public.simulation_settings') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_sim_daily')) AS ok;

-- #############################################################################
-- PART 076: Save today's settings as the defaults; reset all settings in one click (fix list G1)  (sql/076_settings_defaults.sql)
-- #############################################################################

-- =============================================================================
-- 076: Save today's settings as the defaults; reset all settings in one click (fix list G1)
-- =============================================================================
-- Settings only: never applications, customers, documents, loans or their
-- statuses.
--
--   * settings_baselines: a named snapshot of every setting. The first,
--     "Defaults 2 Oct 2026", is taken when this file runs.
--   * fn_settings_baseline_save(name): an admin saves today's settings.
--   * fn_settings_reset_preview(baseline): what a reset would change, line by
--     line, before anything changes.
--   * fn_settings_reset(baseline, typed confirmation): admin only, the word
--     RESET typed; writes one audit entry listing every change.
--
-- What is saved, and how a reset puts it back:
--   at once:   module switches; Document checks (automation, which documents
--              are accepted on their own, every check's on / must-pass /
--              limit / if-it-fails); organisation settings; security
--              settings (incl. officers_see_unassigned); roles (on/off, MFA,
--              idle time) and their rights; simulation and employer-check
--              settings
--   approval:  credit policy (the version-in-force settings and the credit
--              rules' on/off, limit and decline/refer) becomes a NEW policy
--              version waiting for approval by someone other than the admin,
--              live from the date the approver picks; the rate grid and
--              employer-category pricing become a rate grid version waiting
--              for pricing approval. Approved history is never overwritten.
--              (Open question G1: approval, not the emergency route; the
--              emergency route skips the second person.)
--   listed:    the active risk model is shown when it differs but not
--              switched: the model and the app change together (lesson 19);
--              the bureau switches are fixed in code and only listed.
--
-- Run order: after 075. Safe to re-run (the first baseline is kept).
-- =============================================================================

CREATE TABLE IF NOT EXISTS settings_baselines (
  id        UUID          NOT NULL DEFAULT gen_random_uuid(),
  name      VARCHAR(100)  NOT NULL,
  snapshot  JSONB         NOT NULL,
  taken_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  taken_by  UUID,
  CONSTRAINT pk_settings_baselines PRIMARY KEY (id),
  CONSTRAINT uq_settings_baselines_name UNIQUE (name)
);
ALTER TABLE settings_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settings_baselines FROM anon, authenticated;

-- Every setting, flat: "area|item" -> value. Flat keys make the comparison a join.
CREATE OR REPLACE FUNCTION fn_settings_capture()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT jsonb_object_agg('switch|' || flag_key, to_jsonb(enabled)) FROM feature_flags), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('documents|settings.' || key, value)
                 FROM document_auto_settings s, jsonb_each(to_jsonb(s) - 'id' - 'updated_by' - 'updated_at')), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('documents|auto_accept.' || doc_type, to_jsonb(auto_accept)) FROM document_auto_policy), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('documents|check.' || doc_type || '.' || check_code,
                        jsonb_build_object('enabled', enabled, 'blocking', blocking, 'threshold', threshold, 'on_fail', on_fail))
                 FROM document_check_rules), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('organisation|' || key, value)
                 FROM organisation_settings o, jsonb_each(to_jsonb(o) - 'tenant_id' - 'updated_at' - 'updated_by')
                 WHERE o.tenant_id = fn_default_tenant_id()), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('security|' || setting_key, to_jsonb(value)) FROM security_settings), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('roles|' || r.code, jsonb_build_object(
                          'is_active', r.is_active, 'mfa_required', r.mfa_required, 'idle_timeout_minutes', r.idle_timeout_minutes,
                          'permissions', (SELECT coalesce(jsonb_agg(p.permission_code ORDER BY p.permission_code), '[]'::jsonb)
                                          FROM role_permissions p WHERE p.role_code = r.code)))
                 FROM roles r), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('policy|setting.' || p.param_key, p.value)
                 FROM policy_parameters p WHERE p.policy_version_id = fn_policy_version_at()), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('policy|rule.' || rule_id,
                        jsonb_build_object('is_active', is_active, 'threshold_value', threshold_value, 'severity_on_fail', severity_on_fail))
                 FROM policy_rules), '{}'::jsonb)
    || jsonb_build_object('pricing|rate grid',
         (SELECT jsonb_build_object('bands', fn_rate_grid_json(id)->'bands', 'categories', fn_rate_grid_json(id)->'categories')
          FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status = 'ACTIVE'))
    || jsonb_build_object('model|active risk model',
         to_jsonb((SELECT model_version FROM model_versions WHERE status = 'ACTIVE' ORDER BY effective_from DESC LIMIT 1)))
    || jsonb_build_object('bureau|card and overdraft share counted', to_jsonb(fn_bureau_revolving_rate()),
                          'bureau|that share inside FOIR', to_jsonb(fn_bureau_revolving_in_foir()))
    || coalesce((SELECT jsonb_object_agg('simulation|' || key, value)
                 FROM simulation_settings s, jsonb_each(to_jsonb(s) - 'id')), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('employer checks|' || key, value)
                 FROM employer_master_settings s, jsonb_each(to_jsonb(s) - 'id')), '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION fn_settings_capture() FROM PUBLIC, anon, authenticated;

-- The first baseline: the settings as they are when this runs.
INSERT INTO settings_baselines (name, snapshot) VALUES ('Defaults 2 Oct 2026', fn_settings_capture())
ON CONFLICT (name) DO NOTHING;

-- What a reset would change: area, item, now, default, and how it is put back.
CREATE OR REPLACE FUNCTION fn_settings_diff(p_baseline UUID)
RETURNS TABLE (area TEXT, item TEXT, now_value JSONB, default_value JSONB, how TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (SELECT key, value FROM settings_baselines, jsonb_each(snapshot) WHERE id = p_baseline),
       c AS (SELECT key, value FROM jsonb_each(fn_settings_capture()))
  SELECT split_part(coalesce(b.key, c.key), '|', 1), split_part(coalesce(b.key, c.key), '|', 2), c.value, b.value,
         CASE split_part(coalesce(b.key, c.key), '|', 1)
           WHEN 'policy' THEN 'through policy approval'
           WHEN 'pricing' THEN 'through pricing approval'
           WHEN 'model' THEN 'listed only: the model changes with the app'
           WHEN 'bureau' THEN 'listed only: fixed in code'
           ELSE CASE WHEN b.key IS NULL THEN 'kept: added after the defaults were saved' ELSE 'at once' END END
  FROM b FULL JOIN c ON c.key = b.key
  WHERE b.value IS DISTINCT FROM c.value
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION fn_settings_diff(UUID) FROM PUBLIC, anon, authenticated;

-- Admin: list the baselines.
CREATE OR REPLACE FUNCTION fn_settings_baselines()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_permission('org.manage');
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'taken_at', taken_at,
                                                        'taken_by', (SELECT full_name FROM users WHERE id = taken_by),
                                                        'settings', (SELECT count(*) FROM jsonb_object_keys(snapshot)))
                                    ORDER BY taken_at), '[]'::jsonb) FROM settings_baselines);
END;
$$;

CREATE OR REPLACE FUNCTION fn_settings_baseline_save(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('org.manage');
  v_name  TEXT := nullif(btrim(coalesce(p_name, '')), '');
BEGIN
  IF v_name IS NULL OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'give the defaults a name (up to 100 characters)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO settings_baselines (name, snapshot, taken_by) VALUES (v_name, fn_settings_capture(), v_actor);
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('SETTINGS_DEFAULTS_SAVED', 'USER', v_actor, jsonb_build_object('name', v_name));
  RETURN fn_settings_baselines();
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'there are already defaults called %', v_name USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION fn_settings_reset_preview(p_baseline UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_permission('org.manage');
  IF NOT EXISTS (SELECT 1 FROM settings_baselines WHERE id = p_baseline) THEN
    RAISE EXCEPTION 'no such defaults' USING ERRCODE = 'P0002';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('area', area, 'item', item, 'now', now_value,
                                                        'default', default_value, 'how', how)), '[]'::jsonb)
          FROM fn_settings_diff(p_baseline));
END;
$$;

-- The reset itself.
CREATE OR REPLACE FUNCTION fn_settings_reset(p_baseline UUID, p_confirm TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := fn_require_permission('org.manage');
  v_base    settings_baselines%ROWTYPE;
  d         RECORD;
  v_changes JSONB := '[]'::jsonb;
  v_policy  UUID;
  v_grid    UUID;
  v_key     TEXT;
  v_val     JSONB;
  v_k2      TEXT;
BEGIN
  IF btrim(coalesce(p_confirm, '')) <> 'RESET' THEN
    RAISE EXCEPTION 'type RESET to confirm' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_base FROM settings_baselines WHERE id = p_baseline;
  IF v_base.id IS NULL THEN
    RAISE EXCEPTION 'no such defaults' USING ERRCODE = 'P0002';
  END IF;

  FOR d IN SELECT * FROM fn_settings_diff(p_baseline) WHERE default_value IS NOT NULL LOOP
    v_val := d.default_value;
    IF d.area = 'switch' THEN
      UPDATE feature_flags SET enabled = (v_val #>> '{}')::BOOLEAN WHERE flag_key = d.item;
    ELSIF d.area = 'documents' AND d.item LIKE 'settings.%' THEN
      v_k2 := substr(d.item, 10);
      EXECUTE format('UPDATE document_auto_settings SET %I = (%L::jsonb #>> ''{}'')::%s, updated_by = %L, updated_at = now()',
                     v_k2, v_val, CASE WHEN jsonb_typeof(v_val) = 'boolean' THEN 'BOOLEAN' ELSE 'SMALLINT' END, v_actor);
    ELSIF d.area = 'documents' AND d.item LIKE 'auto_accept.%' THEN
      UPDATE document_auto_policy SET auto_accept = (v_val #>> '{}')::BOOLEAN, updated_by = v_actor, updated_at = now()
      WHERE doc_type = substr(d.item, 13);
    ELSIF d.area = 'documents' AND d.item LIKE 'check.%' THEN
      UPDATE document_check_rules SET enabled = (v_val->>'enabled')::BOOLEAN, blocking = (v_val->>'blocking')::BOOLEAN,
             threshold = (v_val->>'threshold')::NUMERIC, on_fail = v_val->>'on_fail', updated_by = v_actor, updated_at = now()
      WHERE doc_type || '.' || check_code = substr(d.item, 7);
    ELSIF d.area = 'organisation' THEN
      EXECUTE format('UPDATE organisation_settings SET %I = (SELECT %I FROM jsonb_populate_record(NULL::organisation_settings, jsonb_build_object(%L, %L::jsonb))), updated_by = %L, updated_at = now() WHERE tenant_id = fn_default_tenant_id()',
                     d.item, d.item, d.item, v_val, v_actor);
    ELSIF d.area = 'security' THEN
      UPDATE security_settings SET value = (v_val #>> '{}')::INTEGER WHERE setting_key = d.item;
    ELSIF d.area = 'roles' THEN
      UPDATE roles SET is_active = (v_val->>'is_active')::BOOLEAN, mfa_required = (v_val->>'mfa_required')::BOOLEAN,
             idle_timeout_minutes = (v_val->>'idle_timeout_minutes')::INTEGER
      WHERE code = d.item;
      DELETE FROM role_permissions WHERE role_code = d.item
        AND NOT (permission_code = ANY (ARRAY(SELECT jsonb_array_elements_text(v_val->'permissions'))));
      INSERT INTO role_permissions (role_code, permission_code)
      SELECT d.item, p FROM jsonb_array_elements_text(v_val->'permissions') p
      ON CONFLICT DO NOTHING;
    ELSIF d.area = 'simulation' THEN
      EXECUTE format('UPDATE simulation_settings SET %I = (SELECT %I FROM jsonb_populate_record(NULL::simulation_settings, jsonb_build_object(%L, %L::jsonb)))',
                     d.item, d.item, d.item, v_val);
    ELSIF d.area = 'employer checks' THEN
      EXECUTE format('UPDATE employer_master_settings SET %I = (SELECT %I FROM jsonb_populate_record(NULL::employer_master_settings, jsonb_build_object(%L, %L::jsonb)))',
                     d.item, d.item, d.item, v_val);
    ELSIF d.area = 'policy' THEN
      -- one new version for every policy difference, waiting for someone else's approval
      IF v_policy IS NULL THEN
        INSERT INTO policy_versions (product, version_code, base_version_id, rationale, tier, authored_by)
        VALUES ('CAR_NEW', 'RESET-' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD-HH24MI'), fn_policy_version_at(),
                'Settings reset to "' || v_base.name || '"', 'MATERIAL', v_actor)
        RETURNING id INTO v_policy;
        INSERT INTO policy_parameters (policy_version_id, param_key, value)
        SELECT v_policy, param_key, value FROM policy_parameters WHERE policy_version_id = fn_policy_version_at();
        INSERT INTO policy_documents (policy_version_id, engine, document)
        SELECT v_policy, engine, document FROM policy_documents WHERE policy_version_id = fn_policy_version_at();
      END IF;
      IF d.item LIKE 'setting.%' THEN
        UPDATE policy_parameters SET value = v_val WHERE policy_version_id = v_policy AND param_key = substr(d.item, 9);
      ELSE
        INSERT INTO policy_version_rule_changes (policy_version_id, rule_id, is_active, threshold_value, severity_on_fail, before)
        SELECT v_policy, r.rule_id,
               CASE WHEN (v_val->>'is_active')::BOOLEAN IS DISTINCT FROM r.is_active THEN (v_val->>'is_active')::BOOLEAN END,
               CASE WHEN v_val->>'threshold_value' IS DISTINCT FROM r.threshold_value THEN v_val->>'threshold_value' END,
               CASE WHEN v_val->>'severity_on_fail' IS DISTINCT FROM r.severity_on_fail THEN v_val->>'severity_on_fail' END,
               jsonb_build_object('is_active', r.is_active, 'threshold_value', r.threshold_value, 'severity_on_fail', r.severity_on_fail)
        FROM policy_rules r WHERE r.rule_id = substr(d.item, 6)
        ON CONFLICT (policy_version_id, rule_id) DO NOTHING;
      END IF;
    ELSIF d.area = 'pricing' THEN
      IF EXISTS (SELECT 1 FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status IN ('DRAFT', 'PENDING_APPROVAL')) THEN
        RAISE EXCEPTION 'a rate grid change is already open: finish or withdraw it, then reset' USING ERRCODE = '22023';
      END IF;
      INSERT INTO rate_grid_versions (product_code, version_no, status, rationale, base_version_id, authored_by, submitted_at, effective_from)
      VALUES ('CAR_NEW_SALARIED', (SELECT max(version_no) + 1 FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED'),
              'PENDING_APPROVAL', 'Settings reset to "' || v_base.name || '"',
              (SELECT id FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status = 'ACTIVE'),
              v_actor, now(), (((now() AT TIME ZONE 'Asia/Kolkata')::DATE + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))
      RETURNING id INTO v_grid;
      INSERT INTO rate_grid_version_bands (version_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
                                           max_ltv_pct, max_foir_pct, max_tenure_months)
      SELECT v_grid, x->>'band_label', (x->>'score_band_min')::SMALLINT, (x->>'score_band_max')::SMALLINT, (x->>'rate_pct')::NUMERIC,
             x->>'rate_type', (x->>'max_ltv_pct')::NUMERIC, (x->>'max_foir_pct')::NUMERIC, (x->>'max_tenure_months')::SMALLINT
      FROM jsonb_array_elements(v_val->'bands') x;
      INSERT INTO rate_grid_version_categories (version_id, category_code, category_label, description, rate_loading_pct,
                                                max_ltv_pct, max_tenure_months, processing_fee_inr)
      SELECT v_grid, x->>'category_code', x->>'category_label', coalesce(x->>'description', ''), (x->>'rate_loading_pct')::NUMERIC,
             (x->>'max_ltv_pct')::NUMERIC, (x->>'max_tenure_months')::SMALLINT, (x->>'processing_fee_inr')::INTEGER
      FROM jsonb_array_elements(v_val->'categories') x;
    ELSE
      -- model and bureau: listed only
      CONTINUE;
    END IF;
    v_changes := v_changes || jsonb_build_object('area', d.area, 'item', d.item, 'from', d.now_value, 'to', v_val, 'how', d.how);
  END LOOP;

  IF v_policy IS NOT NULL THEN
    UPDATE policy_versions SET status = 'PENDING_APPROVAL', submitted_at = now() WHERE id = v_policy;
    INSERT INTO policy_change_requests (policy_version_id, title, summary, requested_by)
    VALUES (v_policy, 'Reset to "' || v_base.name || '"', 'Settings reset: the saved credit policy settings and rules, for approval', v_actor);
  END IF;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('SETTINGS_RESET', 'USER', v_actor,
          jsonb_build_object('defaults', v_base.name, 'changes', v_changes,
                             'policy_version_for_approval', (SELECT version_code FROM policy_versions WHERE id = v_policy),
                             'rate_grid_for_approval', v_grid IS NOT NULL));
  RETURN jsonb_build_object('changed', jsonb_array_length(v_changes), 'changes', v_changes,
                            'policy_version_for_approval', (SELECT version_code FROM policy_versions WHERE id = v_policy),
                            'rate_grid_for_approval', v_grid IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION fn_settings_baselines(), fn_settings_baseline_save(TEXT), fn_settings_reset_preview(UUID),
                       fn_settings_reset(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_settings_baselines(), fn_settings_baseline_save(TEXT), fn_settings_reset_preview(UUID),
                          fn_settings_reset(UUID, TEXT) TO authenticated;

-- Checks after running:
-- SELECT name, (SELECT count(*) FROM jsonb_object_keys(snapshot)) FROM settings_baselines;   -- "Defaults 2 Oct 2026" with a few hundred settings
-- SELECT * FROM fn_settings_diff((SELECT id FROM settings_baselines WHERE name = 'Defaults 2 Oct 2026'));   -- no rows right after

-- CHECK 076: settings defaults saved
SELECT '076' AS part, 'settings defaults saved' AS what, (EXISTS (SELECT 1 FROM settings_baselines WHERE name = 'Defaults 2 Oct 2026')) AS ok;

-- #############################################################################
-- PART 077: The live risk score reads the inputs the model was trained on (fix list E1)  (sql/077_risk_features.sql)
-- #############################################################################

-- =============================================================================
-- 077: The live risk score reads the inputs the model was trained on (fix list E1)
-- =============================================================================
-- Risk model v2 (057) was trained on 18 inputs worked out from the two-bureau
-- detail (053) and the income and bank detail (054), by the query in
-- scripts/local/export-seasoned-training.mjs. The live score on the case
-- screen still built them in the browser from the older application fields
-- (a one-line bureau summary, the bank statement summary, fixed fallbacks),
-- so it was not scoring the case the way the model learned.
--
-- fn_staff_risk_features(application) works out the same 18 inputs, the same
-- way, for one case:
--   * late payments (dpd30 / dpd60 / dpd90) from the merged bureau accounts,
--     each account's worst month counted once;
--   * write-off and enquiries from the combined bureau summary;
--   * bounces, salary months and cash against salary from the month-by-month
--     bank summary;
--   * employer tier and government from the employer type the customer gave;
--   * FOIR from the engine's recommendation (recomputed when a hard decline
--     stopped before working it out); LTV on the on-road price;
--   * the card servicing pattern from the bureau's card accounts.
-- It also says, for each input, whether it came from the detail or fell back
-- to the training default (detail missing), so the screen can say so.
--
-- Same visibility as the other case screens. Read only.
-- Run order: after 076. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_risk_features(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app  applications%ROWTYPE;
  v_sc   RECORD;
  v_out  JSONB;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_sc FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT fn_sees_real_customers())
     OR NOT (v_sc.sees_all OR v_app.assigned_officer_id = v_sc.me OR (v_app.assigned_officer_id IS NULL AND v_sc.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;

  WITH apps AS (
    SELECT a.id, a.loan_amount_requested, a.tenure_months, c.age_at_application, c.employer_category,
           c.total_work_experience_years, c.date_of_joining, a.created_at,
           coalesce(v.on_road_price, q.on_road) AS on_road_price,
           CASE WHEN coalesce(r.foir_calculated, 0) > 0 THEN r.foir_calculated
                ELSE round(100.0 * (coalesce(bsum.monthly_obligation, 0)
                                    + coalesce(nullif(a.indicative_emi, 0),
                                               coalesce(a.loan_amount_requested, q.loan_amount_requested) * (0.099 / 12)
                                                 / nullif(1 - power(1 + 0.099 / 12, -coalesce(a.tenure_months, q.tenure_months, 60)), 0)))
                           / nullif(coalesce(nullif(ia.eligible_net_salary, 0), a.declared_net_salary), 0), 2)
           END AS foir_calculated
    FROM applications a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN vehicles v ON v.application_id = a.id
    LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v.id IS NULL
    LEFT JOIN bureau_summary bsum ON bsum.application_id = a.id AND bsum.bureau = 'COMBINED'
    LEFT JOIN LATERAL (SELECT eligible_net_salary FROM income_assessments i WHERE i.application_id = a.id
                       ORDER BY i.created_at DESC LIMIT 1) ia ON true
    LEFT JOIN LATERAL (SELECT foir_calculated FROM recommendations x WHERE x.application_id = a.id
                       ORDER BY x.created_at DESC LIMIT 1) r ON true
    WHERE a.id = v_app.id
  ),
  acct AS (
    SELECT coalesce(ba.merged_seq, ba.seq) AS k,
           max((SELECT coalesce(max(d), 0) FROM unnest(ba.dpd) d)) AS worst,
           bool_or(ba.revolving AND ba.product IN ('CARD', 'CORP_CARD')) AS card,
           max(CASE WHEN ba.product IN ('CARD', 'CORP_CARD') AND ba.status = 'ACTIVE' THEN ba.outstanding END) AS card_out,
           max(CASE WHEN ba.product IN ('CARD', 'CORP_CARD') AND ba.status = 'ACTIVE' THEN ba.credit_limit END) AS card_limit
    FROM bureau_accounts ba WHERE ba.application_id = v_app.id
    GROUP BY 1
  ),
  dpd AS (
    SELECT count(*) AS accounts,
           count(*) FILTER (WHERE worst >= 30 AND worst < 60) AS dpd30,
           count(*) FILTER (WHERE worst >= 60 AND worst < 90) AS dpd60,
           count(*) FILTER (WHERE worst >= 90) AS dpd90,
           count(*) FILTER (WHERE card) AS cards,
           count(*) FILTER (WHERE card AND card_out > 0.5 * nullif(card_limit, 0)) AS cards_heavy,
           count(*) FILTER (WHERE card AND card_out > 0) AS cards_carrying
    FROM acct
  ),
  bank AS (
    SELECT count(*) AS months, sum(bounces) AS bounces,
           count(*) FILTER (WHERE salary_credit > 0) AS salary_months,
           sum(cash_deposits) AS cash, sum(salary_credit) AS salary_in
    FROM bank_monthly_summary WHERE application_id = v_app.id
  )
  SELECT jsonb_build_object(
    'features', jsonb_build_object(
      'bureauScore', coalesce(bs.score, 650),
      'dpd30', coalesce(d.dpd30, 0), 'dpd60', coalesce(d.dpd60, 0), 'dpd90', coalesce(d.dpd90, 0),
      'dpdWriteOff', CASE WHEN coalesce(bs.writeoff_count_5y, 0) > 0 THEN 1 ELSE 0 END,
      'enquiryVelocity', coalesce(bs.enquiry_count_90d, 0),
      'bounceCount', coalesce(bk.bounces, 0),
      -- no bank months at all: the training default of 6, as in training
      'salaryRegularity', CASE WHEN coalesce(bk.months, 0) = 0 THEN 6 ELSE LEAST(6, bk.salary_months) END,
      'employerTier', CASE WHEN ap.employer_category IN ('GOVERNMENT', 'PSU') THEN 5 WHEN ap.employer_category = 'MNC' THEN 4
                           WHEN ap.employer_category = 'PUBLIC_LTD' THEN 3 ELSE 2 END,
      'cashWithdrawalRatio', CASE WHEN coalesce(bk.salary_in, 0) > 0 THEN LEAST(100, round(100.0 * bk.cash / bk.salary_in, 1)) ELSE 15 END,
      'ltvPercent', coalesce(round(100.0 * ap.loan_amount_requested / nullif(ap.on_road_price, 0), 1), 0),
      'foirPercent', coalesce(ap.foir_calculated, 40),
      'tenureMonths', coalesce(ap.tenure_months, 60),
      'age', coalesce(ap.age_at_application, 35),
      'govtEmployee', CASE WHEN ap.employer_category IN ('GOVERNMENT', 'PSU') THEN 1 ELSE 0 END,
      'employmentYears', coalesce(ap.total_work_experience_years,
                                  round((extract(epoch FROM ap.created_at - ap.date_of_joining::TIMESTAMPTZ) / 31557600.0)::NUMERIC, 1), 3),
      'ccServicingPattern', CASE WHEN coalesce(d.cards, 0) = 0 THEN 0 WHEN d.cards_heavy > 0 THEN 3 WHEN d.cards_carrying > 0 THEN 2 ELSE 1 END,
      'freeIncomeRatio', GREATEST(0, 100 - coalesce(ap.foir_calculated, 40))),
    -- which inputs fell back to the training default because the detail is missing
    'from_detail', jsonb_build_object(
      'bureau_summary', bs.application_id IS NOT NULL,
      'bureau_accounts', coalesce(d.accounts, 0) > 0,
      'bank_months', coalesce(bk.months, 0),
      'employer_type', ap.employer_category IS NOT NULL,
      'foir', ap.foir_calculated IS NOT NULL,
      'on_road_price', ap.on_road_price IS NOT NULL)
  ) INTO v_out
  FROM apps ap
  LEFT JOIN bureau_summary bs ON bs.application_id = ap.id AND bs.bureau = 'COMBINED'
  CROSS JOIN dpd d
  CROSS JOIN bank bk;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_risk_features(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_risk_features(TEXT) TO authenticated;

-- Check after running (as postgres, any synthetic case):
-- SELECT fn_staff_risk_features((SELECT application_id FROM applications WHERE origin = 'SYNTHETIC' AND status = 'APPROVED' LIMIT 1));

-- CHECK 077: risk model inputs function
SELECT '077' AS part, 'risk model inputs function' AS what, (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_risk_features')) AS ok;

-- #############################################################################
-- PART 078: Fix what the security and performance checks flag (fix list H3)  (sql/078_advisor_fixes.sql)
-- #############################################################################

-- =============================================================================
-- 078: Fix what the security and performance checks flag (fix list H3)
-- =============================================================================
-- sql/checks/advisor-checks.sql runs the main checks of Supabase's Security
-- and Performance Advisors as plain read-only queries (the SQL tests run it on
-- every change, so a new finding fails the tests). On the local copy of the
-- database it flagged:
--
--   SECURITY
--   * 4 owner's-rights functions without a fixed search_path (fn_assess_application,
--     fn_create_application, fn_in_principle_check, fn_run_policy_engine):
--     pinned to public, as every other one is;
--   * fn_role_permissions(role) callable with the public key: it lists any
--     role's rights to a visitor. Now signed-in only (the functions that use
--     it run with the owner's rights, so nothing that needs it loses it).
--     fn_require_any_permission likewise. Kept public on purpose:
--     fn_login_rules (the sign-in screen shows them), fn_policy_may_simulate
--     (says false to a visitor), fn_current_staff_id (row rules call it for
--     every caller; a visitor gets nothing back);
--   PERFORMANCE
--   * 4 row rules from 001 call auth.uid() for every row; now once per query
--     ((select auth.uid())), same meaning;
--   * 57 foreign keys with no index: deletes and joins on them read the whole
--     table. Each gets an index (small tables cost nothing; the case tables
--     are the ones that matter);
--   * 3 indexes made twice: 065 and 066 created copies of indexes 001 and 033
--     already had. Those lines are removed from 065 and 066; the copies are
--     dropped here in case 065 / 066 already ran.
--   (070 also pins fn_run_policy_engine's search_path itself now, so running
--   070 again doesn't undo it.)
--
-- The table-grants check reads row rules too: the public key has the usual
-- Supabase grants on every table, which is harmless while row level security
-- is on and no rule lets a visitor read rows. It found none.
--
-- Run order: after 077. Safe to re-run. Changes no data.
-- =============================================================================

-- 1. Owner's-rights functions: fixed search_path
ALTER FUNCTION fn_assess_application(UUID) SET search_path = public;
ALTER FUNCTION fn_create_application(VARCHAR, VARCHAR, VARCHAR) SET search_path = public;
ALTER FUNCTION fn_in_principle_check(UUID) SET search_path = public;
ALTER FUNCTION fn_run_policy_engine(UUID) SET search_path = public;

-- 2. Not for visitors
REVOKE ALL ON FUNCTION fn_role_permissions(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_role_permissions(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_require_any_permission(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_require_any_permission(TEXT[]) TO authenticated;

-- 3. Row rules: auth.uid() once per query, not per row
ALTER POLICY "customers_own_read" ON customers
  USING (auth_user_id = (SELECT auth.uid()));
ALTER POLICY "applications_customer_read" ON applications
  USING (customer_id IN (SELECT id FROM customers WHERE auth_user_id = (SELECT auth.uid())));
ALTER POLICY "documents_customer_read" ON documents
  USING (application_id IN (SELECT a.id FROM applications a JOIN customers c ON c.id = a.customer_id
                            WHERE c.auth_user_id = (SELECT auth.uid())));
ALTER POLICY "users_employee_read" ON users
  USING (auth_user_id = (SELECT auth.uid()));

-- 4. Copies of existing indexes (only if 065 / 066 ran before they were fixed)
DROP INDEX IF EXISTS ix_audit_events_created_at;      -- = idx_audit_events_created (001)
DROP INDEX IF EXISTS ix_applications_created_at;      -- = idx_applications_created (001)
DROP INDEX IF EXISTS ix_engine_decisions_application; -- = idx_engine_decisions_app (033)

-- 5. An index for every foreign key
CREATE INDEX IF NOT EXISTS ix_application_document_requirements_doc_type ON application_document_requirements (doc_type);
CREATE INDEX IF NOT EXISTS ix_applications_vehicle_id ON applications (vehicle_id);
CREATE INDEX IF NOT EXISTS ix_bank_statement_analyses_customer_id ON bank_statement_analyses (customer_id);
CREATE INDEX IF NOT EXISTS ix_bureau_reports_consent_id ON bureau_reports (consent_id);
CREATE INDEX IF NOT EXISTS ix_bureau_reports_customer_id ON bureau_reports (customer_id);
CREATE INDEX IF NOT EXISTS ix_bureau_summary_consent_id ON bureau_summary (consent_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_model_version ON credit_decisions (model_version);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_officer_id ON credit_decisions (officer_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_policy_version_id ON credit_decisions (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_recommendation_id ON credit_decisions (recommendation_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_rules_snapshot ON credit_decisions (rules_snapshot);
CREATE INDEX IF NOT EXISTS ix_customer_addresses_state_code ON customer_addresses (state_code);
CREATE INDEX IF NOT EXISTS ix_customer_consents_application_id ON customer_consents (application_id);
CREATE INDEX IF NOT EXISTS ix_customer_consents_customer_id ON customer_consents (customer_id);
CREATE INDEX IF NOT EXISTS ix_customers_state_code ON customers (state_code);
CREATE INDEX IF NOT EXISTS ix_dealers_state_code ON dealers (state_code);
CREATE INDEX IF NOT EXISTS ix_document_extractions_document_id ON document_extractions (document_id);
CREATE INDEX IF NOT EXISTS ix_employers_last_verified_by ON employers (last_verified_by);
CREATE INDEX IF NOT EXISTS ix_engine_decisions_policy_version_id ON engine_decisions (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_fraud_signals_reviewed_by_id ON fraud_signals (reviewed_by_id);
CREATE INDEX IF NOT EXISTS ix_loan_accounts_application_id ON loan_accounts (application_id);
CREATE INDEX IF NOT EXISTS ix_loan_agreements_application_id ON loan_agreements (application_id);
CREATE INDEX IF NOT EXISTS ix_loan_agreements_offer_id ON loan_agreements (offer_id);
CREATE INDEX IF NOT EXISTS ix_loan_repayments_installment_id ON loan_repayments (installment_id);
CREATE INDEX IF NOT EXISTS ix_model_versions_approved_by ON model_versions (approved_by);
CREATE INDEX IF NOT EXISTS ix_organisation_settings_updated_by ON organisation_settings (updated_by);
CREATE INDEX IF NOT EXISTS ix_override_logs_approved_by_id ON override_logs (approved_by_id);
CREATE INDEX IF NOT EXISTS ix_override_logs_decision_id ON override_logs (decision_id);
CREATE INDEX IF NOT EXISTS ix_override_logs_officer_id ON override_logs (officer_id);
CREATE INDEX IF NOT EXISTS ix_permission_conflicts_permission_b ON permission_conflicts (permission_b);
CREATE INDEX IF NOT EXISTS ix_policy_change_requests_policy_version_id ON policy_change_requests (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_policy_change_requests_requested_by ON policy_change_requests (requested_by);
CREATE INDEX IF NOT EXISTS ix_policy_change_reviews_change_request_id ON policy_change_reviews (change_request_id);
CREATE INDEX IF NOT EXISTS ix_policy_change_reviews_reviewer_id ON policy_change_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS ix_policy_parameters_param_key ON policy_parameters (param_key);
CREATE INDEX IF NOT EXISTS ix_policy_results_reason_code ON policy_results (reason_code);
CREATE INDEX IF NOT EXISTS ix_policy_results_rule_id ON policy_results (rule_id);
CREATE INDEX IF NOT EXISTS ix_policy_rules_reason_code ON policy_rules (reason_code);
CREATE INDEX IF NOT EXISTS ix_policy_simulations_compared_to_id ON policy_simulations (compared_to_id);
CREATE INDEX IF NOT EXISTS ix_policy_simulations_policy_version_id ON policy_simulations (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_policy_version_events_actor_id ON policy_version_events (actor_id);
CREATE INDEX IF NOT EXISTS ix_policy_versions_approved_by ON policy_versions (approved_by);
CREATE INDEX IF NOT EXISTS ix_policy_versions_authored_by ON policy_versions (authored_by);
CREATE INDEX IF NOT EXISTS ix_policy_versions_base_version_id ON policy_versions (base_version_id);
CREATE INDEX IF NOT EXISTS ix_recommendations_model_version ON recommendations (model_version);
CREATE INDEX IF NOT EXISTS ix_recommendations_policy_version_id ON recommendations (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_recommendations_rules_snapshot ON recommendations (rules_snapshot);
CREATE INDEX IF NOT EXISTS ix_repayment_mandates_application_id ON repayment_mandates (application_id);
CREATE INDEX IF NOT EXISTS ix_role_change_requests_decided_by ON role_change_requests (decided_by);
CREATE INDEX IF NOT EXISTS ix_role_change_requests_requested_by ON role_change_requests (requested_by);
CREATE INDEX IF NOT EXISTS ix_role_permissions_permission_code ON role_permissions (permission_code);
CREATE INDEX IF NOT EXISTS ix_users_role ON users (role);
CREATE INDEX IF NOT EXISTS ix_users_state_code ON users (state_code);
CREATE INDEX IF NOT EXISTS ix_vehicle_quotations_dealer_id ON vehicle_quotations (dealer_id);
CREATE INDEX IF NOT EXISTS ix_vehicle_quotations_document_id ON vehicle_quotations (document_id);
CREATE INDEX IF NOT EXISTS ix_vehicles_application_id ON vehicles (application_id);
CREATE INDEX IF NOT EXISTS ix_vehicles_dealer_id ON vehicles (dealer_id);

-- Check after running (each should return no rows): the queries in
-- sql/checks/advisor-checks.sql. Quick version:
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef
--    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

-- CHECK 078: advisor fixes: search_path pinned, foreign keys indexed
SELECT '078' AS part, 'advisor fixes: search_path pinned, foreign keys indexed' AS what, (NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')) AND to_regclass('public.ix_vehicles_application_id') IS NOT NULL) AS ok;

-- #############################################################################
-- PART 079: Weekly backup of the settings and policy tables (fix list H7)  (sql/079_settings_backup.sql)
-- #############################################################################

-- =============================================================================
-- 079: Weekly backup of the settings and policy tables (fix list H7)
-- =============================================================================
-- Supabase's free plan keeps only a short backup window, and the settings
-- reset (G1, 076) is only as good as the last saved defaults. This keeps a
-- full copy of every settings, policy and pricing table, once a week:
--
--   * settings_backups: one row per backup, every row of each table as JSON
--     (not a summary: a table can be rebuilt from it). The last 26 weekly
--     backups are kept (half a year).
--   * fn_settings_backup_take(kind): takes one now. SQL editor, pg_cron or the
--     export script only (not callable from the website).
--   * fn_settings_backup_latest(): the newest backup, for the export script
--     (scripts/backup-settings.mjs), which saves a copy outside the database
--     (see docs/production-checklist.md).
--   * pg_cron job cercit-settings-backup-weekly: Sundays 01:00 India time,
--     if pg_cron is switched on (it is needed for 075 too).
--
-- What is copied: switches and their history, Document checks, organisation
-- and security settings, roles, rights and waivers, policy versions, their
-- parameters, rules, rule changes, events and documents, reason codes,
-- parameter definitions, the rate grid, rate grid versions, pricing products,
-- employer master, reference lists and checks settings, consent wording,
-- document types, states, dealers, simulation settings and the saved
-- defaults. Never copied: customers, applications, documents, loans, users
-- (personal data) or app_secrets.
--
-- Run order: after 078. Safe to re-run. Takes the first backup when it runs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS settings_backups (
  id        UUID          NOT NULL DEFAULT gen_random_uuid(),
  kind      VARCHAR(10)   NOT NULL DEFAULT 'WEEKLY',
  taken_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  tables    JSONB         NOT NULL,
  row_count INTEGER       NOT NULL,
  CONSTRAINT pk_settings_backups PRIMARY KEY (id),
  CONSTRAINT ck_settings_backups_kind CHECK (kind IN ('WEEKLY', 'MANUAL'))
);
CREATE INDEX IF NOT EXISTS ix_settings_backups_taken_at ON settings_backups (taken_at DESC);
ALTER TABLE settings_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settings_backups FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_settings_backup_tables()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'feature_flags', 'feature_flag_history',
    'document_auto_settings', 'document_auto_policy', 'document_check_rules', 'document_types',
    'organisation_settings', 'security_settings',
    'roles', 'permissions', 'role_permissions', 'permission_conflicts', 'role_conflict_waivers',
    'policy_versions', 'policy_parameters', 'policy_rules', 'policy_version_rule_changes', 'policy_rule_history',
    'policy_version_events', 'policy_documents', 'parameter_definitions', 'reason_codes', 'rule_set_snapshots',
    'rate_grid', 'employer_category_pricing', 'pricing_products',
    'rate_grid_versions', 'rate_grid_version_bands', 'rate_grid_version_categories',
    'employers', 'employer_reference_list', 'employer_master_settings', 'employer_category_changes',
    'consent_texts', 'states', 'dealers', 'simulation_settings', 'settings_baselines'];
$$;

CREATE OR REPLACE FUNCTION fn_settings_backup_take(p_kind TEXT DEFAULT 'WEEKLY')
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t      TEXT;
  v_rows   JSONB;
  v_all    JSONB := '{}'::jsonb;
  v_count  INTEGER := 0;
  v_id     UUID;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'backups are taken from the SQL editor or the weekly job' USING ERRCODE = '42501';
  END IF;
  FOREACH v_t IN ARRAY fn_settings_backup_tables() LOOP
    CONTINUE WHEN to_regclass('public.' || v_t) IS NULL;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM %I x', v_t) INTO v_rows;
    v_all := v_all || jsonb_build_object(v_t, v_rows);
    v_count := v_count + jsonb_array_length(v_rows);
  END LOOP;

  INSERT INTO settings_backups (kind, tables, row_count)
  VALUES (CASE WHEN p_kind = 'MANUAL' THEN 'MANUAL' ELSE 'WEEKLY' END, v_all, v_count)
  RETURNING id INTO v_id;

  -- keep the last 26 weekly backups; manual ones stay until deleted by hand
  DELETE FROM settings_backups
  WHERE kind = 'WEEKLY'
    AND id NOT IN (SELECT id FROM settings_backups WHERE kind = 'WEEKLY' ORDER BY taken_at DESC LIMIT 26);

  RETURN jsonb_build_object('id', v_id, 'tables', (SELECT count(*) FROM jsonb_object_keys(v_all)), 'rows', v_count);
END;
$$;

-- The newest backup, whole: for the export script (service key) and the SQL editor
CREATE OR REPLACE FUNCTION fn_settings_backup_latest()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'backups are read from the SQL editor or the export script' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id', id, 'kind', kind, 'taken_at', taken_at, 'rows', row_count, 'tables', tables)
  INTO v_out FROM settings_backups ORDER BY taken_at DESC LIMIT 1;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_settings_backup_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_settings_backup_take(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_settings_backup_latest() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION fn_settings_backup_latest() TO service_role;
  END IF;
END;
$$;

-- The weekly job: Sundays 01:00 India time (19:30 UTC Saturday)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cercit-settings-backup-weekly';
    PERFORM cron.schedule('cercit-settings-backup-weekly', '30 19 * * 6', 'SELECT fn_settings_backup_take(''WEEKLY'')');
    RAISE NOTICE 'cercit-settings-backup-weekly scheduled for Sundays 01:00 India time';
  ELSE
    RAISE NOTICE 'pg_cron is not switched on: switch it on (Database > Extensions > pg_cron) and run this file again, or run SELECT fn_settings_backup_take(''MANUAL''); by hand';
  END IF;
END;
$$;

-- The first backup, now
SELECT fn_settings_backup_take('MANUAL');

-- Check after running:
-- SELECT kind, taken_at, row_count, (SELECT count(*) FROM jsonb_object_keys(tables)) AS tables FROM settings_backups ORDER BY taken_at DESC;
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'cercit-settings-backup-weekly';

-- CHECK 079: first settings backup taken
SELECT '079' AS part, 'first settings backup taken' AS what, (EXISTS (SELECT 1 FROM settings_backups)) AS ok;

-- #############################################################################
-- PART 080: Erase a customer's personal data on request; how long data is kept (fix list H6, database part)  (sql/080_data_erasure.sql)
-- #############################################################################

-- =============================================================================
-- 080: Erase a customer's personal data on request; how long data is kept (fix list H6, database part)
-- =============================================================================
-- DPDP Act 2023: a customer may ask for their personal data to be erased, and
-- data must not be kept once its purpose is served, unless a law requires it.
-- The law that does here: RBI's KYC Master Direction (and the PMLA rules) keep
-- a borrower's records for 5 years after the loan ends.
--
-- Run from the SQL editor only (rare, can't be undone, no website screen):
--
--   1. find the customer, ids only (nothing personal is shown):
--        SELECT fn_erasure_find('their@email');
--   2. check what would be erased, and whether the law says keep it:
--        SELECT fn_erasure_check('<customer id>');
--   3. record the request:   SELECT fn_erasure_record('<customer id>', 'EMAIL', 'asked on 3 Oct');
--   4. erase:                SELECT fn_erasure_execute('<request id>', 'ERASE');
--      (or close it:         SELECT fn_erasure_refuse('<request id>', 'why');)
--   5. the stored files:     SELECT * FROM fn_erasure_storage_queue();
--      delete each file from S3 (or Supabase storage), then
--        SELECT fn_erasure_storage_done(ARRAY['<key>', ...]);
--      Deleting the files in S3 automatically is the AWS part of H6, not built yet.
--
-- What erasure does, for every application of the customer:
--   deleted:   documents (rows; files queued for deletion), what the readers
--              read, face matches, document check results, bank transactions,
--              month summaries, salary slips, Form 16, bureau accounts and
--              enquiries, obligations, step-4 groups, addresses
--   blanked:   the customer's name, email, PAN, mobile, Aadhaar digits, date
--              of birth, address, employer and the rest of the customer row;
--              the name on the quotation and the dealer's contact; the
--              agreement's signer, snapshot and browser; the mandate's account
--              holder, account number, IFSC and UMRN; bank account details; the
--              raw bureau report link; the consent's browser line; the
--              sign-in account (the customer can't sign in again)
--   kept:      the applications, recommendations, decisions, policy results,
--              loan accounts and payments, consent proof (hash and date) and
--              the audit log: the record of what the lender decided and why,
--              now about an anonymous customer
-- Refused while: an application is still open (decide or reject it first),
-- a loan is live, or a closed loan is inside the 5-year retention period (the
-- answer says from when it is possible). Synthetic customers: fn_synthetic_purge.
--
-- How long data is kept: data_protection_settings (5 years after a loan
-- closes; 180 days after a decision when no loan was made, a default to
-- confirm). fn_retention_due() lists the customers past it, ids only; a
-- person decides on each (nothing is erased by itself).
--
-- Run order: after 079. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_protection_settings (
  id                      SMALLINT     NOT NULL DEFAULT 1,
  loan_retention_years    SMALLINT     NOT NULL DEFAULT 5,
  no_loan_retention_days  SMALLINT     NOT NULL DEFAULT 180,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_data_protection_settings PRIMARY KEY (id),
  CONSTRAINT ck_data_protection_settings_one CHECK (id = 1),
  CONSTRAINT ck_data_protection_settings_years CHECK (loan_retention_years >= 5),
  CONSTRAINT ck_data_protection_settings_days CHECK (no_loan_retention_days BETWEEN 30 AND 3650)
);
INSERT INTO data_protection_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE data_protection_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON data_protection_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS erasure_requests (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  customer_id     UUID          NOT NULL,
  received_via    VARCHAR(20)   NOT NULL,
  note            TEXT,
  status          VARCHAR(10)   NOT NULL DEFAULT 'PENDING',
  requested_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  refused_reason  TEXT,
  summary         JSONB,
  CONSTRAINT pk_erasure_requests PRIMARY KEY (id),
  CONSTRAINT fk_erasure_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT ck_erasure_requests_via CHECK (received_via IN ('EMAIL', 'PHONE', 'LETTER', 'IN_PERSON', 'RETENTION', 'OTHER')),
  CONSTRAINT ck_erasure_requests_status CHECK (status IN ('PENDING', 'ERASED', 'REFUSED'))
);
CREATE INDEX IF NOT EXISTS ix_erasure_requests_customer ON erasure_requests (customer_id);
ALTER TABLE erasure_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erasure_requests FROM anon, authenticated;

-- Files to delete from storage (the AWS part of H6 will read this)
CREATE TABLE IF NOT EXISTS document_storage_deletions (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  request_id       UUID          NOT NULL,
  storage_backend  VARCHAR(20),
  storage_key      TEXT,
  file_path        TEXT,
  queued_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT pk_document_storage_deletions PRIMARY KEY (id),
  CONSTRAINT fk_document_storage_deletions_request FOREIGN KEY (request_id) REFERENCES erasure_requests(id)
);
CREATE INDEX IF NOT EXISTS ix_document_storage_deletions_request ON document_storage_deletions (request_id);
ALTER TABLE document_storage_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON document_storage_deletions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_erasure_require_operator()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'personal data is erased from the SQL editor only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Find a customer by email: ids only, never their details
CREATE OR REPLACE FUNCTION fn_erasure_find(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_erasure_require_operator();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'customer_id', c.id,
             'applications', (SELECT coalesce(jsonb_agg(jsonb_build_object('application', a.application_id, 'origin', a.origin, 'status', a.status)
                                                        ORDER BY a.created_at), '[]'::jsonb)
                              FROM applications a WHERE a.customer_id = c.id)))
    FROM customers c WHERE lower(c.email) = lower(trim(p_email))), '[]'::jsonb);
END;
$$;

-- What erasure would do for a customer, and whether the law says keep the data
CREATE OR REPLACE FUNCTION fn_erasure_check(p_customer UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust     customers%ROWTYPE;
  v_apps     UUID[];
  v_set      data_protection_settings%ROWTYPE;
  v_reasons  TEXT[] := '{}';
  v_until    DATE;
  v_counts   JSONB := '{}'::jsonb;
  v_t        TEXT;
  v_n        BIGINT;
BEGIN
  PERFORM fn_erasure_require_operator();
  SELECT * INTO v_cust FROM customers WHERE id = p_customer;
  IF v_cust.id IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_set FROM data_protection_settings WHERE id = 1;
  SELECT coalesce(array_agg(id), '{}') INTO v_apps FROM applications WHERE customer_id = p_customer;

  IF EXISTS (SELECT 1 FROM applications WHERE customer_id = p_customer AND origin = 'SYNTHETIC') THEN
    v_reasons := v_reasons || 'synthetic customer: use fn_synthetic_purge()'::TEXT;
  END IF;
  IF v_cust.full_name = 'Erased customer' THEN
    v_reasons := v_reasons || 'already erased'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM applications WHERE customer_id = p_customer
             AND status NOT IN ('DRAFT', 'REJECTED', 'DISBURSED', 'WITHDRAWN', 'CANCELLED')) THEN
    v_reasons := v_reasons || 'an application is still open: decide or reject it first'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM loan_accounts WHERE application_id = ANY (v_apps) AND status = 'LIVE') THEN
    v_reasons := v_reasons || 'a loan is live: records are kept while it runs and for the retention period after'::TEXT;
  END IF;
  SELECT max(closed_on + make_interval(years => v_set.loan_retention_years))::DATE INTO v_until
  FROM loan_accounts WHERE application_id = ANY (v_apps) AND status <> 'LIVE' AND closed_on IS NOT NULL;
  IF v_until IS NOT NULL AND v_until > current_date THEN
    v_reasons := v_reasons || format('a closed loan is inside the %s-year retention period (KYC records): possible from %s',
                                     v_set.loan_retention_years, to_char(v_until, 'DD Mon YYYY'));
  END IF;

  FOREACH v_t IN ARRAY ARRAY['documents', 'document_readings', 'document_extractions', 'document_check_results', 'kyc_face_matches',
                             'bank_transactions', 'bank_monthly_summary', 'salary_slips', 'form16_part_b', 'bureau_accounts',
                             'bureau_enquiries', 'obligation_details', 'application_detail_groups'] LOOP
    CONTINUE WHEN to_regclass('public.' || v_t) IS NULL;
    EXECUTE format('SELECT count(*) FROM %I WHERE application_id = ANY ($1)', v_t) INTO v_n USING v_apps;
    v_counts := v_counts || jsonb_build_object(v_t, v_n);
  END LOOP;
  v_counts := v_counts || jsonb_build_object('customer_addresses', (SELECT count(*) FROM customer_addresses WHERE customer_id = p_customer));

  RETURN jsonb_build_object(
    'customer_id', p_customer,
    'applications', cardinality(v_apps),
    'erasable', cardinality(v_reasons) = 0,
    'reasons', to_jsonb(v_reasons),
    'rows_to_delete', v_counts);
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_record(p_customer UUID, p_via TEXT, p_note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM fn_erasure_require_operator();
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer) THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO erasure_requests (customer_id, received_via, note)
  VALUES (p_customer, upper(coalesce(p_via, 'OTHER')), p_note)
  RETURNING id INTO v_id;
  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('ERASURE_REQUESTED', 'SYSTEM', jsonb_build_object('request', v_id, 'customer', p_customer, 'via', upper(coalesce(p_via, 'OTHER'))));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_refuse(p_request UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_erasure_require_operator();
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'say why the request is refused' USING ERRCODE = '22023';
  END IF;
  UPDATE erasure_requests SET status = 'REFUSED', refused_reason = p_reason, closed_at = now()
  WHERE id = p_request AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no pending request %', p_request USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('ERASURE_REFUSED', 'SYSTEM', jsonb_build_object('request', p_request, 'reason', p_reason));
END;
$$;

-- Blanks one column for the given applications: NULL where allowed, else an empty value of its type
CREATE OR REPLACE FUNCTION fn_erasure_blank(p_table TEXT, p_column TEXT, p_key TEXT, p_ids UUID[])
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notnull BOOLEAN;
  v_type    TEXT;
  v_len     INTEGER;
  v_value   TEXT;
  v_n       BIGINT;
BEGIN
  SELECT a.attnotnull, format_type(a.atttypid, a.atttypmod), nullif(a.atttypmod, -1) - 4 INTO v_notnull, v_type, v_len
  FROM pg_attribute a WHERE a.attrelid = to_regclass('public.' || p_table) AND a.attname = p_column AND NOT a.attisdropped;
  IF v_type IS NULL THEN
    RETURN 0; -- the column isn't there in this database
  END IF;
  v_value := CASE WHEN NOT v_notnull THEN 'NULL'
                  WHEN v_type IN ('jsonb', 'json') THEN '''{}''::jsonb'
                  WHEN v_type = 'bytea' THEN '''''::bytea'
                  WHEN v_type LIKE 'character%' OR v_type = 'text' THEN quote_literal(left('erased', coalesce(v_len, 6)))
                  ELSE NULL END;
  IF v_value IS NULL THEN
    RAISE EXCEPTION '%.% (%) is required and has no empty value', p_table, p_column, v_type;
  END IF;
  EXECUTE format('UPDATE %I SET %I = %s WHERE %I = ANY ($1)', p_table, p_column, v_value, p_key) USING p_ids;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_execute(p_request UUID, p_confirm TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req      erasure_requests%ROWTYPE;
  v_check    JSONB;
  v_cust     customers%ROWTYPE;
  v_apps     UUID[];
  v_docs     UUID[];
  v_fk       RECORD;
  v_t        TEXT;
  v_n        BIGINT;
  v_summary  JSONB := '{}'::jsonb;
  v_col      TEXT;
BEGIN
  PERFORM fn_erasure_require_operator();
  IF p_confirm IS DISTINCT FROM 'ERASE' THEN
    RAISE EXCEPTION 'type ERASE to confirm: this can''t be undone' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_req FROM erasure_requests WHERE id = p_request FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'no pending request %', p_request USING ERRCODE = 'P0002';
  END IF;
  v_check := fn_erasure_check(v_req.customer_id);
  IF NOT (v_check->>'erasable')::BOOLEAN THEN
    RAISE EXCEPTION 'not erased: %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_check->'reasons')), '; ')
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cust FROM customers WHERE id = v_req.customer_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_apps FROM applications WHERE customer_id = v_cust.id;
  SELECT coalesce(array_agg(id), '{}') INTO v_docs FROM documents WHERE application_id = ANY (v_apps);

  -- 1. the stored files, queued for deletion from storage
  INSERT INTO document_storage_deletions (request_id, storage_backend, storage_key, file_path)
  SELECT v_req.id, d.storage_backend, d.storage_key, d.file_path
  FROM documents d WHERE d.id = ANY (v_docs) AND (d.storage_key IS NOT NULL OR d.file_path IS NOT NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('files_queued', v_n);

  -- 2. rows that point at the documents: the quotation keeps its figures, the rest go
  FOR v_fk IN
    SELECT c.conrelid::regclass::TEXT AS tbl, a.attname AS col, NOT a.attnotnull AS nullable
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'documents'::regclass AND cardinality(c.conkey) = 1
  LOOP
    IF v_fk.tbl = 'vehicle_quotations' AND v_fk.nullable THEN
      EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = ANY ($1)', v_fk.tbl, v_fk.col, v_fk.col) USING v_docs;
    ELSE
      EXECUTE format('DELETE FROM %I WHERE %I = ANY ($1)', v_fk.tbl, v_fk.col) USING v_docs;
    END IF;
  END LOOP;

  -- 3. the detail, by application
  FOREACH v_t IN ARRAY ARRAY['document_readings', 'document_extractions', 'document_check_results', 'kyc_face_matches',
                             'bank_transactions', 'bank_monthly_summary', 'salary_slips', 'form16_part_b', 'bureau_accounts',
                             'bureau_enquiries', 'obligation_details', 'application_detail_groups', 'documents'] LOOP
    CONTINUE WHEN to_regclass('public.' || v_t) IS NULL;
    EXECUTE format('DELETE FROM %I WHERE application_id = ANY ($1)', v_t) USING v_apps;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object(v_t, v_n);
  END LOOP;
  DELETE FROM customer_addresses WHERE customer_id = v_cust.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('customer_addresses', v_n);

  -- 4. personal fields kept on the decision record, blanked
  PERFORM fn_erasure_blank('vehicle_quotations', c, 'application_id', v_apps)
  FROM unnest(ARRAY['customer_name_on_quote', 'sales_officer_name', 'sales_officer_mobile']) c;
  PERFORM fn_erasure_blank('loan_agreements', c, 'application_id', v_apps)
  FROM unnest(ARRAY['signer_name', 'snapshot', 'user_agent']) c;
  PERFORM fn_erasure_blank('repayment_mandates', c, 'application_id', v_apps)
  FROM unnest(ARRAY['holder_name', 'account_enc', 'account_last4', 'ifsc', 'umrn']) c;
  PERFORM fn_erasure_blank('bank_statement_analyses', c, 'application_id', v_apps)
  FROM unnest(ARRAY['account_number_last4', 'ifsc', 'account_opened_on']) c;
  PERFORM fn_erasure_blank('bureau_reports', c, 'application_id', v_apps)
  FROM unnest(ARRAY['report_raw_path', 'report_ref']) c;
  PERFORM fn_erasure_blank('customer_consents', 'user_agent', 'customer_id', ARRAY[v_cust.id]);

  -- 5. the customer: anonymous from here on
  FOREACH v_col IN ARRAY ARRAY['first_name', 'middle_name', 'last_name', 'father_name', 'pan_enc', 'pan_hash', 'pan_last4',
                               'mobile_hash', 'mobile_last4', 'aadhaar_last_four', 'date_of_birth', 'gender',
                               'address_line1', 'address_line2', 'city', 'pincode', 'employer_name', 'designation',
                               'salary_bank_name', 'marital_status', 'date_of_joining', 'auth_user_id'] LOOP
    PERFORM fn_erasure_blank('customers', v_col, 'id', ARRAY[v_cust.id]);
  END LOOP;
  UPDATE customers
  SET full_name = 'Erased customer',
      email = 'erased+' || left(replace(id::TEXT, '-', ''), 12) || '@erased.invalid',
      email_verified = false,
      mobile_enc = fn_pii_encrypt('erased'),  -- 012 requires a value; this one holds nothing
      updated_at = now()
  WHERE id = v_cust.id;

  -- 6. the sign-in account
  IF v_cust.auth_user_id IS NOT NULL AND to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.users WHERE id = $1' USING v_cust.auth_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('sign_in_account', v_n);
  END IF;

  UPDATE erasure_requests SET status = 'ERASED', closed_at = now(), summary = v_summary WHERE id = v_req.id;
  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('PERSONAL_DATA_ERASED', 'SYSTEM', jsonb_build_object('request', v_req.id, 'customer', v_cust.id, 'rows', v_summary));
  RETURN jsonb_build_object('request', v_req.id, 'erased', v_summary,
                            'next', 'delete the queued files from storage: SELECT * FROM fn_erasure_storage_queue();');
END;
$$;

-- Files waiting to be deleted from storage, and marking them done
CREATE OR REPLACE FUNCTION fn_erasure_storage_queue()
RETURNS TABLE (request_id UUID, storage_backend VARCHAR, storage_key TEXT, file_path TEXT, queued_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_erasure_require_operator();
  RETURN QUERY
    SELECT d.request_id, d.storage_backend, d.storage_key, d.file_path, d.queued_at
    FROM document_storage_deletions d WHERE d.deleted_at IS NULL ORDER BY d.queued_at;
END;
$$;

CREATE OR REPLACE FUNCTION fn_erasure_storage_done(p_keys TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  PERFORM fn_erasure_require_operator();
  UPDATE document_storage_deletions SET deleted_at = now()
  WHERE deleted_at IS NULL AND (storage_key = ANY (p_keys) OR file_path = ANY (p_keys));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Customers whose data is past the retention period: ids and dates only
CREATE OR REPLACE FUNCTION fn_retention_due()
RETURNS TABLE (customer_id UUID, reason TEXT, since DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set data_protection_settings%ROWTYPE;
BEGIN
  PERFORM fn_erasure_require_operator();
  SELECT * INTO v_set FROM data_protection_settings WHERE id = 1;
  RETURN QUERY
  WITH per AS (
    SELECT c.id,
           bool_or(a.origin = 'SYNTHETIC') AS synthetic,
           bool_or(a.status NOT IN ('DRAFT', 'REJECTED', 'DISBURSED', 'WITHDRAWN', 'CANCELLED')) AS open_app,
           bool_or(l.status = 'LIVE') AS live_loan,
           max(l.closed_on) AS loan_closed,
           bool_or(l.id IS NOT NULL) AS had_loan,
           max(coalesce(a.updated_at, a.created_at))::DATE AS last_activity
    FROM customers c
    JOIN applications a ON a.customer_id = c.id
    LEFT JOIN loan_accounts l ON l.application_id = a.id
    WHERE c.full_name <> 'Erased customer'
    GROUP BY c.id)
  SELECT p.id,
         CASE WHEN p.had_loan THEN format('loan closed over %s years ago', v_set.loan_retention_years)
              ELSE format('no loan, last activity over %s days ago', v_set.no_loan_retention_days) END,
         CASE WHEN p.had_loan THEN (p.loan_closed + make_interval(years => v_set.loan_retention_years))::DATE
              ELSE p.last_activity + v_set.no_loan_retention_days END
  FROM per p
  WHERE NOT p.synthetic AND NOT p.open_app AND NOT coalesce(p.live_loan, false)
    AND ((p.had_loan AND p.loan_closed IS NOT NULL
          AND p.loan_closed + make_interval(years => v_set.loan_retention_years) < current_date)
      OR (NOT p.had_loan AND p.last_activity + v_set.no_loan_retention_days < current_date))
  ORDER BY 3;
END;
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_erasure_require_operator()', 'fn_erasure_find(TEXT)', 'fn_erasure_check(UUID)',
                           'fn_erasure_record(UUID, TEXT, TEXT)', 'fn_erasure_refuse(UUID, TEXT)',
                           'fn_erasure_blank(TEXT, TEXT, TEXT, UUID[])', 'fn_erasure_execute(UUID, TEXT)',
                           'fn_erasure_storage_queue()', 'fn_erasure_storage_done(TEXT[])', 'fn_retention_due()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END;
$$;

-- Check after running (ids only, nothing personal):
-- SELECT * FROM data_protection_settings;
-- SELECT * FROM fn_retention_due();

-- CHECK 080: data protection settings
SELECT '080' AS part, 'data protection settings' AS what, (EXISTS (SELECT 1 FROM data_protection_settings WHERE id = 1)) AS ok;

-- #############################################################################
-- ALL PARTS: every row should say ok = true
-- #############################################################################

SELECT part, what, ok FROM (VALUES
  ('061', 'Application Review function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_application_review') AND EXISTS (SELECT 1 FROM security_settings WHERE setting_key = 'officers_see_unassigned'))),
  ('062', 'loan status snapshot', (to_regclass('public.loan_status_snapshot') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_loan_status_refresh'))),
  ('063', 'Policy Rules function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_policy_rules'))),
  ('064', 'Dashboard function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_dashboard'))),
  ('065', 'Audit Log function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_log'))),
  ('066', 'Applications page function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_list_applications_page'))),
  ('067', 'my permissions function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_my_permissions'))),
  ('068', 'officer limits trigger; old roles gone or retired', (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_credit_decisions_officer_limits'))),
  ('069', 'Employer Master', (to_regclass('public.employers') IS NOT NULL AND EXISTS (SELECT 1 FROM permissions WHERE code = 'employer.manage'))),
  ('070', 'employer category on recommendations', (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recommendations' AND column_name = 'employer_category'))),
  ('071', 'rate grid versions, one live', (EXISTS (SELECT 1 FROM rate_grid_versions WHERE status = 'ACTIVE'))),
  ('072', 'practice roles', ((SELECT count(*) FROM roles WHERE is_practice) = 3)),
  ('073', 'practice reset', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_practice_reset'))),
  ('074', 'rule changes through approval', (to_regclass('public.policy_version_rule_changes') IS NOT NULL)),
  ('075', 'daily simulation', (to_regclass('public.simulation_settings') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_sim_daily'))),
  ('076', 'settings defaults saved', (EXISTS (SELECT 1 FROM settings_baselines WHERE name = 'Defaults 2 Oct 2026'))),
  ('077', 'risk model inputs function', (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_staff_risk_features'))),
  ('078', 'advisor fixes: search_path pinned, foreign keys indexed', (NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')) AND to_regclass('public.ix_vehicles_application_id') IS NOT NULL)),
  ('079', 'first settings backup taken', (EXISTS (SELECT 1 FROM settings_backups))),
  ('080', 'data protection settings', (EXISTS (SELECT 1 FROM data_protection_settings WHERE id = 1)))
) AS c(part, what, ok)
ORDER BY part;
