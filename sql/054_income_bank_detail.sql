-- =============================================================================
-- 054: Income and bank detail
-- =============================================================================
-- Until now a customer's income was four loose numbers (slip net, Form 16
-- annual, bank average salary and balance). This adds the detail behind them:
--   salary_slips          one row per month (the last 3)
--   form16_part_b         annual income, and a house-property loss, which is
--                         how a home loan the bureau does not show turns up
--   bank_monthly_summary  per month: salary credit and day, EMI debits,
--                         bounces, balances on the 5th/10th/15th/20th/25th
-- plus a few fields on bank_statement_analyses (holder match, IFSC, open date).
--
-- The credit checks read these when present: fn_reading_summary (052) now
-- prefers the detail tables and falls back to the document readings, so the
-- officer's run, the automatic checks (052) and the engine pick them up with
-- no change to those functions.
--
-- fn_simulate_income_detail fills the tables deterministically for synthetic
-- customers (the 2,000-customer generator), coherent with the 053 bureau
-- data: bank EMI debits follow the bureau EMIs, bounces follow late payments,
-- a home loan on the bureau shows as a house-property loss on Form 16.
--
-- Run order: after 053. Safe to re-run.

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS salary_slips (
  application_id          UUID          NOT NULL,
  pay_month               DATE          NOT NULL,
  employer_name           VARCHAR(200),
  employee_name           VARCHAR(200),
  employee_id             VARCHAR(30),
  designation             VARCHAR(100),
  uan                     VARCHAR(12),
  pan_last4               VARCHAR(4),
  gross                   INTEGER       NOT NULL,
  basic                   INTEGER,
  hra                     INTEGER,
  other_earnings          INTEGER,
  pf                      INTEGER       NOT NULL DEFAULT 0,
  professional_tax        INTEGER       NOT NULL DEFAULT 0,
  tds                     INTEGER       NOT NULL DEFAULT 0,
  esi                     INTEGER       NOT NULL DEFAULT 0,
  employer_loan_recovery  INTEGER       NOT NULL DEFAULT 0,
  other_deductions        INTEGER       NOT NULL DEFAULT 0,
  net                     INTEGER       NOT NULL,
  net_in_words_matches    BOOLEAN,
  lop_days                NUMERIC(4,1)  NOT NULL DEFAULT 0,
  arrears                 INTEGER       NOT NULL DEFAULT 0,
  bank_last4              VARCHAR(4),
  housing_loan_line       BOOLEAN       NOT NULL DEFAULT false,
  source                  VARCHAR(10)   NOT NULL,
  recorded_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_salary_slips PRIMARY KEY (application_id, pay_month),
  CONSTRAINT fk_salary_slips_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT ck_salary_slips_month CHECK (extract(day FROM pay_month) = 1),
  CONSTRAINT ck_salary_slips_source CHECK (source IN ('READER', 'SIMULATED', 'STAFF')),
  CONSTRAINT ck_salary_slips_amounts CHECK (gross >= 0 AND net >= 0 AND pf >= 0 AND professional_tax >= 0 AND tds >= 0
                                            AND esi >= 0 AND employer_loan_recovery >= 0 AND other_deductions >= 0
                                            AND lop_days BETWEEN 0 AND 31 AND arrears >= 0),
  -- A reader may not find every deduction line, so the sum is enforced on the rest.
  CONSTRAINT ck_salary_slips_net CHECK (source = 'READER' OR
    abs(net - (gross - pf - professional_tax - tds - esi - employer_loan_recovery - other_deductions)) <= 1)
);

CREATE TABLE IF NOT EXISTS form16_part_b (
  application_id          UUID          NOT NULL,
  certificate_no          VARCHAR(20),
  assessment_year         VARCHAR(7)    NOT NULL,       -- '2026-27'
  employer_name           VARCHAR(200),
  employer_tan            VARCHAR(10),
  employee_pan_last4      VARCHAR(4),
  period_from             DATE,
  period_to               DATE,
  other_employer_salary   INTEGER       NOT NULL DEFAULT 0,
  income_under_salaries   INTEGER,
  house_property_income   INTEGER       NOT NULL DEFAULT 0,   -- negative = loss (interest on a home loan)
  deduction_80e           INTEGER       NOT NULL DEFAULT 0,   -- education loan interest
  gross_total_income      INTEGER       NOT NULL,
  taxable_income          INTEGER,
  net_tax                 INTEGER,
  signature_valid         BOOLEAN,
  source                  VARCHAR(10)   NOT NULL,
  recorded_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_form16_part_b PRIMARY KEY (application_id),
  CONSTRAINT fk_form16_part_b_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT ck_form16_part_b_ay CHECK (assessment_year ~ '^20[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT ck_form16_part_b_source CHECK (source IN ('READER', 'SIMULATED', 'STAFF'))
);

CREATE TABLE IF NOT EXISTS bank_monthly_summary (
  application_id          UUID          NOT NULL,
  month                   DATE          NOT NULL,
  salary_credit           INTEGER       NOT NULL DEFAULT 0,
  salary_day              SMALLINT,
  emi_debits              INTEGER       NOT NULL DEFAULT 0,
  emi_debit_count         SMALLINT      NOT NULL DEFAULT 0,
  bounces                 SMALLINT      NOT NULL DEFAULT 0,
  balance_5th             INTEGER,
  balance_10th            INTEGER,
  balance_15th            INTEGER,
  balance_20th            INTEGER,
  balance_25th            INTEGER,
  avg_balance             INTEGER,
  min_balance_breaches    SMALLINT      NOT NULL DEFAULT 0,
  cash_deposits           INTEGER       NOT NULL DEFAULT 0,
  large_credits           SMALLINT      NOT NULL DEFAULT 0,
  closing_balance         INTEGER,
  source                  VARCHAR(10)   NOT NULL,
  recorded_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_bank_monthly_summary PRIMARY KEY (application_id, month),
  CONSTRAINT fk_bank_monthly_summary_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT ck_bank_monthly_month CHECK (extract(day FROM month) = 1),
  CONSTRAINT ck_bank_monthly_source CHECK (source IN ('READER', 'SIMULATED', 'STAFF')),
  CONSTRAINT ck_bank_monthly_day CHECK (salary_day IS NULL OR salary_day BETWEEN 1 AND 31),
  CONSTRAINT ck_bank_monthly_amounts CHECK (salary_credit >= 0 AND emi_debits >= 0 AND emi_debit_count >= 0 AND bounces >= 0
                                            AND min_balance_breaches BETWEEN 0 AND 5 AND cash_deposits >= 0 AND large_credits >= 0)
);

ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS source                 VARCHAR(10);
ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS holder_name_match_pct  SMALLINT;
ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS primary_holder         BOOLEAN;
ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS account_opened_on      DATE;
ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS ifsc                   VARCHAR(11);
ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS opening_balance        DECIMAL(12,2);
ALTER TABLE bank_statement_analyses ADD COLUMN IF NOT EXISTS closing_balance        DECIMAL(12,2);

-- =============================================================================
-- 2. Row security: read through the functions below only
-- =============================================================================

ALTER TABLE salary_slips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE form16_part_b        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_monthly_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON salary_slips, form16_part_b, bank_monthly_summary FROM anon, authenticated;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['salary_slips', 'form16_part_b', 'bank_monthly_summary'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "real_customers_need_pii" ON %I', t);
    EXECUTE format('CREATE POLICY "real_customers_need_pii" ON %I AS RESTRICTIVE FOR SELECT TO authenticated '
                   'USING (application_id IS NULL OR fn_sees_real_customers() OR NOT fn_is_customer_application(application_id))', t);
  END LOOP;
END $$;

-- =============================================================================
-- 3. Summary: the numbers the credit checks use
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_income_summary(p_app UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT * FROM salary_slips WHERE application_id = p_app ORDER BY pay_month DESC LIMIT 3
  ), sa AS (
    SELECT count(*)::INT AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY net))::INT AS med,
           min(net) AS lo, max(net) AS hi,
           (max(pay_month) - min(pay_month)) AS span_days,
           count(*) FILTER (WHERE lop_days > 0)::INT AS lop,
           count(*) FILTER (WHERE arrears > 0)::INT AS arr,
           (SELECT employer_loan_recovery FROM s ORDER BY pay_month DESC LIMIT 1) AS recovery,
           bool_or(housing_loan_line) AS housing
    FROM s
  ), f AS (
    SELECT * FROM form16_part_b WHERE application_id = p_app
  ), b AS (
    SELECT * FROM bank_monthly_summary WHERE application_id = p_app ORDER BY month DESC LIMIT 6
  ), ba AS (
    SELECT count(*)::INT AS months,
           round(avg(avg_balance))::INT AS amb,
           round(avg(salary_credit) FILTER (WHERE salary_credit > 0))::INT AS sal,
           count(*) FILTER (WHERE salary_credit > 0)::INT AS sal_n,
           (max(salary_day) - min(salary_day))::INT AS day_spread,
           round(avg(emi_debits))::INT AS emi,
           sum(bounces)::INT AS bounces,
           sum(min_balance_breaches)::INT AS breaches
    FROM b
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'slip_months', sa.n,
    'slip_net_salary', CASE WHEN sa.n > 0 THEN sa.med END,
    'slip_net_spread_pct', CASE WHEN sa.n > 0 AND sa.med > 0 THEN round((sa.hi - sa.lo) * 100.0 / sa.med, 1) END,
    -- 3 slips in 3 calendar months: first-of-month dates span 59-62 days.
    'slips_consecutive', CASE WHEN sa.n > 0 THEN sa.n = 3 AND sa.span_days BETWEEN 59 AND 62 END,
    'lop_months', CASE WHEN sa.n > 0 THEN sa.lop END,
    'arrears_months', CASE WHEN sa.n > 0 THEN sa.arr END,
    'employer_loan_recovery', CASE WHEN sa.n > 0 THEN sa.recovery END,
    'housing_loan_line', CASE WHEN sa.n > 0 THEN sa.housing END,
    'form16_annual', (SELECT gross_total_income FROM f),
    'form16_monthly', (SELECT round(gross_total_income / 12.0)::INT FROM f),
    'form16_ay', (SELECT assessment_year FROM f),
    'house_property_loss', (SELECT CASE WHEN house_property_income < 0 THEN -house_property_income ELSE 0 END FROM f),
    -- Same keys as the bank part of 048's p_read, plus two extra for display.
    'bank', CASE WHEN ba.months > 0 THEN jsonb_build_object(
      'months', ba.months,
      'avg_monthly_balance', ba.amb,
      'avg_salary', ba.sal,
      'salary_count', ba.sal_n,
      'emi_total', coalesce(ba.emi, 0),
      'bounce_count', coalesce(ba.bounces, 0),
      'salary_day_spread', ba.day_spread,
      'min_balance_breaches', coalesce(ba.breaches, 0)) END))
  FROM sa, ba;
$$;

-- 052's reading summary, now preferring the detail tables part by part.
CREATE OR REPLACE FUNCTION fn_reading_summary(p_app UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_read JSONB;
  v_det  JSONB := coalesce(fn_income_summary(p_app), '{}'::jsonb);
BEGIN
  -- What the document readers found (052's body, unchanged).
  v_read := jsonb_strip_nulls(jsonb_build_object(
    'slip_net_salary', fn_doc_num(fn_doc_read(p_app, 'salary_slip', 'net_salary')),
    'form16_annual', fn_doc_num(fn_doc_read(p_app, 'form16', 'gross_total_income')),
    'bank', CASE WHEN fn_doc_read(p_app, 'bank_statement', 'months_analyzed') IS NULL THEN NULL ELSE jsonb_build_object(
      'months', fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'months_analyzed')),
      'avg_monthly_balance', fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'avg_monthly_balance')),
      'avg_salary', fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'avg_salary')),
      'salary_count', coalesce(fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'salary_count')), 0),
      'emi_total', coalesce(fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'emi_total')), 0),
      'bounce_count', coalesce(fn_doc_num(fn_doc_read(p_app, 'bank_statement', 'bounce_count')), 0)) END));
  -- The detail tables win where they have something.
  IF v_det ? 'slip_net_salary' THEN
    v_read := v_read || jsonb_build_object('slip_net_salary', v_det->'slip_net_salary');
  END IF;
  IF v_det ? 'form16_annual' THEN
    v_read := v_read || jsonb_build_object('form16_annual', v_det->'form16_annual');
  END IF;
  IF v_det ? 'bank' THEN
    v_read := v_read || jsonb_build_object('bank', v_det->'bank');
  END IF;
  RETURN v_read;
END;
$$;

-- =============================================================================
-- 4. Simulation for synthetic customers
-- =============================================================================

-- Bump on any change to the simulator's logic.
CREATE OR REPLACE FUNCTION fn_income_sim_version()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'income-sim-v1'::TEXT; $$;

-- New tax regime, FY 2025-26: monthly TDS on a monthly gross (standard deduction
-- 75,000; no tax up to 12 lakh taxable after the rebate; 4% cess).
CREATE OR REPLACE FUNCTION fn_income_annual_tax(p_taxable NUMERIC)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_taxable <= 1200000 THEN 0 ELSE round(1.04 * (
           least(greatest(p_taxable - 400000, 0), 400000) * 0.05
         + least(greatest(p_taxable - 800000, 0), 400000) * 0.10
         + least(greatest(p_taxable - 1200000, 0), 400000) * 0.15
         + least(greatest(p_taxable - 1600000, 0), 400000) * 0.20
         + least(greatest(p_taxable - 2000000, 0), 400000) * 0.25
         + greatest(p_taxable - 2400000, 0) * 0.30))::INTEGER END;
$$;

CREATE OR REPLACE FUNCTION fn_simulate_income_detail(p_app UUID, p_as_of DATE)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a        applications%ROWTYPE;
  v_c        customers%ROWTYPE;
  v_seed     TEXT;
  c          INTEGER[];
  m          INTEGER[];
  v_anchor   INTEGER;
  v_employer TEXT;
  v_home     BOOLEAN;
  v_emi      INTEGER;
  v_loans    INTEGER;
  v_late     BOOLEAN;
  v_rec      INTEGER := 0;
  v_month    DATE;
  v_net      NUMERIC;
  v_gross    NUMERIC;
  v_basic    NUMERIC;
  v_pf       INTEGER;
  v_esi      INTEGER;
  v_tds      INTEGER;
  v_lop      NUMERIC;
  v_arr      INTEGER;
  v_gross_sum NUMERIC := 0;
  v_hp       INTEGER := 0;
  v_80e      INTEGER := 0;
  v_fy_end   INTEGER;
  v_gti      INTEGER;
  v_day      INTEGER;
  v_base     NUMERIC;
  v_sal      INTEGER;
  v_bal      INTEGER[];
  v_hidden   BOOLEAN := false;
  i          INTEGER;
  k          INTEGER;
BEGIN
  SELECT * INTO v_a FROM applications WHERE id = p_app FOR UPDATE;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM salary_slips WHERE application_id = p_app)
     OR EXISTS (SELECT 1 FROM bank_monthly_summary WHERE application_id = p_app) THEN
    RETURN jsonb_build_object('simulated', false, 'reason', 'detail on file');
  END IF;
  SELECT * INTO v_c FROM customers WHERE id = v_a.customer_id;
  v_seed := fn_bureau_seed(v_a.customer_id);
  c := fn_sim_bytes(v_seed, 'inc:c0');
  v_anchor := coalesce(round(v_a.declared_net_salary)::INTEGER, fn_bureau_income_anchor(p_app, v_a.customer_id));
  v_employer := coalesce(nullif(btrim(v_c.employer_name), ''),
                         (SELECT g.confirmed->>'employer_name' FROM application_detail_groups g
                          WHERE g.application_id = p_app AND g.group_code = 'EMPLOYMENT'),
                         'Employer not given');

  -- What the bureau (053) says, so the bank and Form 16 agree with it.
  SELECT bool_or(product IN ('HOME', 'PROPERTY') AND status = 'ACTIVE' AND ownership IN ('INDIVIDUAL', 'JOINT')),
         count(*) FILTER (WHERE status = 'ACTIVE' AND NOT revolving AND ownership IN ('INDIVIDUAL', 'JOINT'))
  INTO v_home, v_loans
  FROM bureau_accounts WHERE application_id = p_app;
  SELECT s.instalment_emi, coalesce(s.dpd_max_12m, 0) > 0 INTO v_emi, v_late
  FROM bureau_summary s WHERE s.application_id = p_app AND s.bureau = 'COMBINED';
  v_home := coalesce(v_home, false);
  v_late := coalesce(v_late, false);
  v_emi := coalesce(v_emi, round(v_a.declared_existing_emis)::INTEGER, 0);
  v_loans := CASE WHEN v_emi = 0 THEN 0 ELSE greatest(coalesce(v_loans, 0), 1) END;

  -- About 5% have an employer loan recovered from salary.
  IF c[4] < 13 THEN
    v_rec := (round(v_anchor * (0.04 + c[5] / 255.0 * 0.06) / 100) * 100)::INTEGER;
  END IF;

  -- Three monthly slips, newest = the month before p_as_of.
  FOR i IN 1..3 LOOP
    m := fn_sim_bytes(v_seed, 'inc:m' || i);
    v_month := (date_trunc('month', p_as_of) - make_interval(months => i))::DATE;
    v_net := v_anchor * (1 + (m[1] - 128) / 128.0 * 0.03);
    v_lop := CASE WHEN i = 2 AND c[1] < 15 THEN 1 + c[2] % 4 ELSE 0 END;     -- ~6%: a loss-of-pay month
    v_arr := CASE WHEN i = 1 AND c[3] < 8 THEN (round(v_anchor * 0.15 / 100) * 100)::INTEGER ELSE 0 END;  -- ~3%: arrears
    v_net := v_net * (1 - v_lop / 30.0) + v_arr;
    -- Work back from the net: gross = net + deductions (a few passes settle it).
    v_gross := v_net * 1.2 + v_rec;
    FOR k IN 1..6 LOOP
      v_basic := v_gross * 0.45;
      v_pf := least(round(v_basic * 0.12), 1800)::INTEGER;
      v_esi := CASE WHEN v_gross <= 21000 THEN round(v_gross * 0.0075)::INTEGER ELSE 0 END;
      v_tds := round(fn_income_annual_tax(greatest(v_gross * 12 - 75000, 0)) / 12.0)::INTEGER;
      v_gross := v_net + v_pf + 200 + v_tds + v_esi + v_rec;
    END LOOP;
    v_gross := round(v_gross);
    v_basic := round(v_gross * 0.45);
    v_net := v_gross - v_pf - 200 - v_tds - v_esi - v_rec;
    v_gross_sum := v_gross_sum + v_gross - v_arr;
    INSERT INTO salary_slips (application_id, pay_month, employer_name, employee_name, employee_id, designation, uan, pan_last4,
                              gross, basic, hra, other_earnings, pf, professional_tax, tds, esi, employer_loan_recovery,
                              other_deductions, net, net_in_words_matches, lop_days, arrears, bank_last4, housing_loan_line, source)
    VALUES (p_app, v_month, v_employer, v_c.full_name,
            'E' || lpad((c[6] * 256 + c[7])::TEXT, 5, '0'), v_c.designation,
            '1009' || lpad(((c[8] * 65536 + c[9] * 256 + c[10]) % 100000000)::TEXT, 8, '0'), v_c.pan_last4,
            v_gross, v_basic, round(v_basic * 0.4), v_gross - v_basic - round(v_basic * 0.4),
            v_pf, 200, v_tds, v_esi, v_rec, 0, v_net, true, v_lop, v_arr,
            lpad(((c[11] * 256 + c[12]) % 10000)::TEXT, 4, '0'), v_home AND c[13] < 128, 'SIMULATED');
  END LOOP;

  -- Form 16 for the last completed financial year (April-March).
  v_fy_end := CASE WHEN extract(month FROM p_as_of) >= 6 THEN extract(year FROM p_as_of) ELSE extract(year FROM p_as_of) - 1 END;
  v_hidden := NOT v_home AND c[14] < 8;                                 -- ~3%: a home loan only Form 16 shows
  IF v_home OR v_hidden THEN
    v_hp := -(150000 + (c[15] % 6) * 10000);                            -- interest, capped at 2 lakh
  END IF;
  IF c[16] < 10 THEN
    v_80e := 20000 + (c[16] % 5) * 10000;                               -- ~4%: education loan interest
  END IF;
  v_gti := (round(v_gross_sum / 3 * 12 * (0.9 + c[2] / 255.0 * 0.1) / 100) * 100)::INTEGER - 75000 + v_hp;
  INSERT INTO form16_part_b (application_id, certificate_no, assessment_year, employer_name, employer_tan, employee_pan_last4,
                             period_from, period_to, income_under_salaries, house_property_income, deduction_80e,
                             gross_total_income, taxable_income, net_tax, signature_valid, source)
  VALUES (p_app, upper(left(md5(v_seed || ':inc:cert'), 8)), v_fy_end || '-' || lpad(((v_fy_end + 1) % 100)::TEXT, 2, '0'),
          v_employer, 'BLR' || chr(65 + c[3] % 26) || lpad(((c[6] * 256 + c[8]) % 100000)::TEXT, 5, '0') || chr(65 + c[9] % 26),
          v_c.pan_last4, make_date(v_fy_end - 1, 4, 1), make_date(v_fy_end, 3, 31),
          v_gti - v_hp, v_hp, v_80e, v_gti, greatest(v_gti - v_80e, 0),
          fn_income_annual_tax(greatest(v_gti - v_80e, 0)), c[10] >= 5, 'SIMULATED');

  -- Six months of the salary account.
  v_day := 1 + c[11] % 7;
  FOR i IN 1..6 LOOP
    m := fn_sim_bytes(v_seed, 'inc:b' || i);
    v_month := (date_trunc('month', p_as_of) - make_interval(months => i))::DATE;
    v_sal := coalesce((SELECT net FROM salary_slips WHERE application_id = p_app AND pay_month = v_month),
                      round(v_anchor * (1 + (m[7] - 128) / 128.0 * 0.03))::INTEGER);
    IF m[2] < 3 THEN v_sal := 0; END IF;                                -- ~1%: a month with no salary credit
    v_base := v_anchor * (0.1 + c[12] / 255.0 * 0.6);
    v_bal := ARRAY[
      round((v_base + v_sal * 0.65) * (0.9 + m[3] / 255.0 * 0.2)),
      round((v_base + v_sal * 0.45) * (0.9 + m[4] / 255.0 * 0.2)),
      round((v_base + v_sal * 0.30) * (0.9 + m[5] / 255.0 * 0.2)),
      round((v_base + v_sal * 0.18) * (0.9 + m[6] / 255.0 * 0.2)),
      round((v_base + v_sal * 0.08) * (0.9 + m[8] / 255.0 * 0.2))]::INTEGER[];
    INSERT INTO bank_monthly_summary (application_id, month, salary_credit, salary_day, emi_debits, emi_debit_count, bounces,
                                      balance_5th, balance_10th, balance_15th, balance_20th, balance_25th, avg_balance,
                                      min_balance_breaches, cash_deposits, large_credits, closing_balance, source)
    VALUES (p_app, v_month, v_sal,
            CASE WHEN v_sal = 0 THEN NULL WHEN m[1] < 13 THEN least(28, v_day + 3 + m[9] % 6) ELSE v_day END,  -- ~5% late
            v_emi, v_loans,
            CASE WHEN v_emi > 0 AND ((v_late AND m[10] < 60) OR m[10] < 3) THEN 1 ELSE 0 END,
            v_bal[1], v_bal[2], v_bal[3], v_bal[4], v_bal[5],
            round((v_bal[1] + v_bal[2] + v_bal[3] + v_bal[4] + v_bal[5]) / 5.0),
            (SELECT count(*) FROM unnest(v_bal) x WHERE x < 5000),
            CASE WHEN m[11] < 25 THEN (round(v_anchor * m[12] / 255.0 * 0.3 / 100) * 100)::INTEGER ELSE 0 END,
            CASE WHEN m[13] < 10 THEN 1 ELSE 0 END,
            round(v_bal[5] * 0.85), 'SIMULATED');
  END LOOP;

  RETURN jsonb_build_object('simulated', true, 'version', fn_income_sim_version(), 'summary', fn_income_summary(p_app));
END;
$$;

-- =============================================================================
-- 5. Writer for the document readers (service key only)
-- =============================================================================
-- p_kind SALARY_SLIP / FORM16 / BANK_MONTH; p holds the table's columns by name.
-- One row is replaced (same month, or the one Form 16), then the automatic
-- document checks run again, as for any new reading (052).

CREATE OR REPLACE FUNCTION fn_record_income_detail(p_application_id TEXT, p_kind TEXT, p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app  UUID;
  v_row  JSONB;
  v_m    DATE;
BEGIN
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id;
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'unknown reading' USING ERRCODE = '22023';
  END IF;
  v_row := p || jsonb_build_object('application_id', v_app, 'source', 'READER', 'recorded_at', now());
  CASE upper(coalesce(p_kind, ''))
  WHEN 'SALARY_SLIP' THEN
    v_m := coalesce((p->>'pay_month')::DATE, fn_doc_month(p->>'pay_period'));
    IF v_m IS NULL THEN
      RAISE EXCEPTION 'pay month not found' USING ERRCODE = '22023';
    END IF;
    v_row := v_row || jsonb_build_object('pay_month', date_trunc('month', v_m)::DATE);
    DELETE FROM salary_slips WHERE application_id = v_app AND pay_month = date_trunc('month', v_m)::DATE;
    INSERT INTO salary_slips SELECT * FROM jsonb_populate_record(NULL::salary_slips,
      jsonb_build_object('pf', 0, 'professional_tax', 0, 'tds', 0, 'esi', 0, 'employer_loan_recovery', 0, 'other_deductions', 0,
                         'lop_days', 0, 'arrears', 0, 'housing_loan_line', false) || v_row);
  WHEN 'FORM16' THEN
    DELETE FROM form16_part_b WHERE application_id = v_app;
    INSERT INTO form16_part_b SELECT * FROM jsonb_populate_record(NULL::form16_part_b,
      jsonb_build_object('other_employer_salary', 0, 'house_property_income', 0, 'deduction_80e', 0) || v_row);
  WHEN 'BANK_MONTH' THEN
    v_m := date_trunc('month', (p->>'month')::DATE)::DATE;
    v_row := v_row || jsonb_build_object('month', v_m);
    DELETE FROM bank_monthly_summary WHERE application_id = v_app AND month = v_m;
    INSERT INTO bank_monthly_summary SELECT * FROM jsonb_populate_record(NULL::bank_monthly_summary,
      jsonb_build_object('salary_credit', 0, 'emi_debits', 0, 'emi_debit_count', 0, 'bounces', 0, 'min_balance_breaches', 0,
                         'cash_deposits', 0, 'large_credits', 0) || v_row);
  ELSE
    RAISE EXCEPTION 'unknown reading' USING ERRCODE = '22023';
  END CASE;
  RETURN fn_auto_review_documents(v_app, 'READING');
END;
$$;

-- =============================================================================
-- 6. For staff: the detail, with flags in plain words
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_income_detail_json(p_app UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum   JSONB := coalesce(fn_income_summary(p_app), '{}'::jsonb);
  v_flags JSONB := '[]'::jsonb;
  v_home  BOOLEAN;
  v_has_bureau BOOLEAN;
  v_slip  NUMERIC := (v_sum->>'slip_net_salary')::NUMERIC;
  v_bank  NUMERIC := (v_sum->'bank'->>'avg_salary')::NUMERIC;
  v_any   BOOLEAN;
BEGIN
  v_any := EXISTS (SELECT 1 FROM salary_slips WHERE application_id = p_app)
        OR EXISTS (SELECT 1 FROM form16_part_b WHERE application_id = p_app)
        OR EXISTS (SELECT 1 FROM bank_monthly_summary WHERE application_id = p_app);
  IF NOT v_any THEN
    RETURN jsonb_build_object('detail', false);
  END IF;
  v_has_bureau := EXISTS (SELECT 1 FROM bureau_summary WHERE application_id = p_app AND bureau = 'COMBINED' AND NOT no_hit);
  v_home := EXISTS (SELECT 1 FROM bureau_accounts WHERE application_id = p_app AND product IN ('HOME', 'PROPERTY')
                    AND status = 'ACTIVE' AND ownership IN ('INDIVIDUAL', 'JOINT'));

  IF coalesce((v_sum->>'house_property_loss')::NUMERIC, 0) > 0 AND v_has_bureau AND NOT v_home THEN
    v_flags := v_flags || jsonb_build_object('code', 'HIDDEN_HOME_LOAN', 'severity', 'warning',
      'text', 'Form 16 shows a loss on house property (home-loan interest), but the bureau shows no home loan. Ask about the loan and its EMI.');
  END IF;
  IF coalesce((v_sum->>'employer_loan_recovery')::NUMERIC, 0) > 0 THEN
    v_flags := v_flags || jsonb_build_object('code', 'EMPLOYER_LOAN', 'severity', 'info',
      'text', format('The salary slip recovers Rs %s a month for a loan from the employer. Employer loans are not on the bureau; count it as an obligation.',
                     to_char((v_sum->>'employer_loan_recovery')::NUMERIC, 'FM99,99,99,999')));
  END IF;
  IF coalesce((v_sum->>'lop_months')::INT, 0) > 0 THEN
    v_flags := v_flags || jsonb_build_object('code', 'LOP_MONTH', 'severity', 'info',
      'text', 'A salary slip has loss-of-pay days, so take-home was lower that month.');
  END IF;
  IF coalesce((v_sum->>'arrears_months')::INT, 0) > 0 THEN
    v_flags := v_flags || jsonb_build_object('code', 'ARREARS', 'severity', 'info',
      'text', 'A salary slip includes arrears, so that month is higher than usual pay.');
  END IF;
  IF (v_sum->>'slips_consecutive')::BOOLEAN IS FALSE THEN
    v_flags := v_flags || jsonb_build_object('code', 'SLIPS_NOT_CONSECUTIVE', 'severity', 'warning',
      'text', 'The salary slips are not the last three months in a row.');
  END IF;
  IF v_sum ? 'bank' AND (coalesce((v_sum->'bank'->>'salary_day_spread')::INT, 0) > 5
                         OR (v_sum->'bank'->>'salary_count')::INT < (v_sum->'bank'->>'months')::INT) THEN
    v_flags := v_flags || jsonb_build_object('code', 'SALARY_IRREGULAR', 'severity', 'warning',
      'text', 'Salary did not arrive on a steady day every month in the bank statement.');
  END IF;
  IF coalesce((v_sum->'bank'->>'bounce_count')::INT, 0) > 0 THEN
    v_flags := v_flags || jsonb_build_object('code', 'BOUNCES', 'severity', 'danger',
      'text', format('%s EMI or cheque bounce(s) in the bank statement.', v_sum->'bank'->>'bounce_count'));
  END IF;
  IF coalesce((v_sum->'bank'->>'min_balance_breaches')::INT, 0) > 0 THEN
    v_flags := v_flags || jsonb_build_object('code', 'LOW_BALANCE', 'severity', 'info',
      'text', 'The balance fell below Rs 5,000 on some of the check dates (5th, 10th, 15th, 20th, 25th).');
  END IF;
  IF v_slip > 0 AND v_bank > 0 AND abs(v_slip - v_bank) / v_slip > 0.10 THEN
    v_flags := v_flags || jsonb_build_object('code', 'SLIP_BANK_GAP', 'severity', 'warning',
      'text', format('Salary credited to the bank differs from the slip by %s%%.', round(abs(v_slip - v_bank) * 100 / v_slip)));
  END IF;

  RETURN jsonb_build_object(
    'detail', true,
    'summary', v_sum,
    'slips', (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'application_id' ORDER BY s.pay_month DESC), '[]'::jsonb)
              FROM salary_slips s WHERE s.application_id = p_app),
    'form16', (SELECT to_jsonb(f) - 'application_id' FROM form16_part_b f WHERE f.application_id = p_app),
    'bank_months', (SELECT coalesce(jsonb_agg(to_jsonb(b) - 'application_id' ORDER BY b.month DESC), '[]'::jsonb)
                    FROM bank_monthly_summary b WHERE b.application_id = p_app),
    'flags', v_flags);
END;
$$;

CREATE OR REPLACE FUNCTION fn_staff_income_detail(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_origin TEXT;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT id, origin INTO v_id, v_origin FROM applications WHERE application_id = p_application_id;
  IF v_id IS NULL OR (v_origin = 'CUSTOMER' AND NOT fn_sees_real_customers()) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN fn_income_detail_json(v_id);
END;
$$;

-- =============================================================================
-- 7. Grants
-- =============================================================================

REVOKE ALL ON FUNCTION fn_income_summary(UUID), fn_reading_summary(UUID), fn_income_sim_version(),
                       fn_income_annual_tax(NUMERIC), fn_simulate_income_detail(UUID, DATE),
                       fn_income_detail_json(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_record_income_detail(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_record_income_detail(TEXT, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION fn_staff_income_detail(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_income_detail(TEXT) TO authenticated;

-- Checks after running:
-- SELECT count(*) FROM salary_slips;                     -- 0 until readers or the generator fill it
-- SELECT fn_income_sim_version();                        -- income-sim-v1
-- SELECT has_function_privilege('authenticated', 'fn_staff_income_detail(text)', 'execute');   -- true
