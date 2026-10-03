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
