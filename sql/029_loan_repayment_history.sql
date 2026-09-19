-- cercit — repayment history, worked out from actual payments (backlog CC/UW)
--
-- Why this exists: the credit rules ask whether a payment was late, and how
-- late, in a given stretch of months. Nothing in the database could answer
-- that. bureau_reports holds only summaries (worst delay in 12 months, a count
-- over 24), so "a delay in the last 6 months" and "a 1-30 day delay in months
-- 7-12" came back as "not known" on every file.
--
-- How a delay is worked out here:
--   * every installment has a fixed due date each month and an amount due;
--   * a payment may arrive in several attempts — a failed mandate followed by
--     part payments is normal, so receipts are recorded one row per attempt;
--   * an installment is cleared on the date the money finally adds up to the
--     amount due, less a small shortfall tolerance;
--   * days late is the gap between the due date and that clearing date.
--
-- A token shortfall is not a delay. Paying 14,999 of 15,000 on the due date
-- leaves the installment cleared on time, with the shortfall recorded so an
-- officer can see it. The tolerance is a policy setting once a version carries
-- one; until then it is 100 rupees.
--
-- Run order: after 028. Safe to re-run.

-- =============================================================================
-- 1. The loan, its schedule, and every payment attempt
-- =============================================================================
CREATE TABLE IF NOT EXISTS loan_accounts (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL DEFAULT fn_default_tenant_id(),
  loan_account_no   VARCHAR(30)   NOT NULL,
  application_id    UUID,
  customer_id       UUID          NOT NULL,
  disbursed_on      DATE          NOT NULL,
  disbursed_amount  DECIMAL(12,2) NOT NULL,
  installment_day   SMALLINT      NOT NULL DEFAULT 5,
  emi_amount        DECIMAL(10,2) NOT NULL,
  tenure_months     SMALLINT      NOT NULL,
  contract_rate_pct DECIMAL(5,2),
  status            VARCHAR(20)   NOT NULL DEFAULT 'LIVE',
  closed_on         DATE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_loan_accounts          PRIMARY KEY (id),
  CONSTRAINT uq_loan_accounts_no       UNIQUE (tenant_id, loan_account_no),
  CONSTRAINT fk_loan_accounts_tenant   FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_loan_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_loan_accounts_app      FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT ck_loan_accounts_day      CHECK (installment_day BETWEEN 1 AND 28),
  CONSTRAINT ck_loan_accounts_status   CHECK (status IN ('LIVE', 'CLOSED', 'FORECLOSED', 'WRITTEN_OFF'))
);

CREATE TABLE IF NOT EXISTS loan_installments (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  loan_id        UUID          NOT NULL,
  installment_no SMALLINT      NOT NULL,
  due_date       DATE          NOT NULL,
  amount_due     DECIMAL(10,2) NOT NULL,
  principal_due  DECIMAL(10,2),
  interest_due   DECIMAL(10,2),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_loan_installments      PRIMARY KEY (id),
  CONSTRAINT uq_loan_installments_no   UNIQUE (loan_id, installment_no),
  CONSTRAINT fk_loan_installments_loan FOREIGN KEY (loan_id) REFERENCES loan_accounts(id)
);

-- One row per attempt, not per month: a failed mandate and the part payments
-- that follow are each recorded, so the history shows what actually happened.
CREATE TABLE IF NOT EXISTS loan_repayments (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  loan_id        UUID          NOT NULL,
  installment_id UUID,
  paid_on        DATE          NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  method         VARCHAR(20)   NOT NULL DEFAULT 'MANDATE',
  outcome        VARCHAR(20)   NOT NULL DEFAULT 'SUCCESS',
  reference_no   VARCHAR(40),
  bounce_reason  VARCHAR(120),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_loan_repayments             PRIMARY KEY (id),
  CONSTRAINT fk_loan_repayments_loan        FOREIGN KEY (loan_id) REFERENCES loan_accounts(id),
  CONSTRAINT fk_loan_repayments_installment FOREIGN KEY (installment_id) REFERENCES loan_installments(id),
  CONSTRAINT ck_loan_repayments_method      CHECK (method IN ('MANDATE', 'UPI', 'NEFT', 'CASH', 'CHEQUE', 'CARD', 'ADJUSTMENT')),
  CONSTRAINT ck_loan_repayments_outcome     CHECK (outcome IN ('SUCCESS', 'BOUNCED', 'REVERSED')),
  CONSTRAINT ck_loan_repayments_amount      CHECK (amount >= 0),
  CONSTRAINT uq_loan_repayments_reference   UNIQUE (loan_id, reference_no)
);

CREATE INDEX IF NOT EXISTS ix_loan_installments_loan ON loan_installments(loan_id, due_date);
CREATE INDEX IF NOT EXISTS ix_loan_repayments_loan   ON loan_repayments(loan_id, paid_on);
CREATE INDEX IF NOT EXISTS ix_loan_accounts_customer ON loan_accounts(customer_id);

-- =============================================================================
-- 2. How much of a shortfall is not a delay
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_shortfall_tolerance()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v NUMERIC;
BEGIN
  -- A policy version carries this once one is written with it; until then, 100 rupees.
  SELECT (fn_policy_param('servicing.shortfall_tolerance_inr'))::NUMERIC INTO v;
  RETURN COALESCE(v, 100);
EXCEPTION WHEN OTHERS THEN
  RETURN 100;
END;
$$;

-- =============================================================================
-- 3. Each installment, and how late it really was
-- =============================================================================
-- A receipt that names an installment is applied to it — that is how a payer
-- who catches up one month while staying current on another is recorded. Money
-- that names nothing pays the oldest arrears first, as a loan account does.
CREATE OR REPLACE FUNCTION fn_loan_installment_status(p_loan_id UUID)
RETURNS TABLE (
  installment_no SMALLINT,
  due_date       DATE,
  amount_due     DECIMAL,
  amount_paid    DECIMAL,
  shortfall      DECIMAL,
  cleared_on     DATE,
  days_late      INTEGER,
  attempts       INTEGER,
  bounces        INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tolerance NUMERIC := fn_shortfall_tolerance();
  v_no        SMALLINT[];
  v_due       DATE[];
  v_owed      NUMERIC[];
  v_paid      NUMERIC[];
  v_cleared   DATE[];
  v_tries     INTEGER[];
  v_bounced   INTEGER[];
  v_r         RECORD;
  v_left      NUMERIC;
  v_k         INTEGER;
  v_target    INTEGER;
  v_applied   NUMERIC;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'policy.simulate', 'policy.author', 'policy.approve']);

  SELECT array_agg(i.installment_no ORDER BY i.installment_no),
         array_agg(i.due_date ORDER BY i.installment_no),
         array_agg(i.amount_due ORDER BY i.installment_no)
  INTO v_no, v_due, v_owed
  FROM loan_installments i WHERE i.loan_id = p_loan_id;

  IF v_no IS NULL THEN
    RETURN;
  END IF;

  v_paid    := array_fill(0::NUMERIC, ARRAY[array_length(v_no, 1)]);
  v_cleared := array_fill(NULL::DATE, ARRAY[array_length(v_no, 1)]);
  v_tries   := array_fill(0, ARRAY[array_length(v_no, 1)]);
  v_bounced := array_fill(0, ARRAY[array_length(v_no, 1)]);

  FOR v_r IN
    SELECT r.paid_on, r.amount, r.outcome, i.installment_no AS named
    FROM loan_repayments r
    LEFT JOIN loan_installments i ON i.id = r.installment_id
    WHERE r.loan_id = p_loan_id
    ORDER BY r.paid_on, r.created_at, r.id
  LOOP
    -- Which installment this attempt is about
    v_target := NULL;
    IF v_r.named IS NOT NULL THEN
      FOR v_k IN 1..array_length(v_no, 1) LOOP
        IF v_no[v_k] = v_r.named THEN
          v_target := v_k;
          EXIT;
        END IF;
      END LOOP;
    ELSE
      FOR v_k IN 1..array_length(v_no, 1) LOOP
        IF v_owed[v_k] - v_paid[v_k] > v_tolerance THEN
          v_target := v_k;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- A failed attempt moves no money, but it is part of the story
    IF v_r.outcome <> 'SUCCESS' THEN
      IF v_target IS NOT NULL THEN
        v_tries[v_target]   := v_tries[v_target] + 1;
        v_bounced[v_target] := v_bounced[v_target] + 1;
      END IF;
      CONTINUE;
    END IF;

    v_left := v_r.amount;
    WHILE v_left > 0 AND v_target IS NOT NULL LOOP
      v_applied := LEAST(v_left, GREATEST(0, v_owed[v_target] - v_paid[v_target]));
      v_paid[v_target]  := v_paid[v_target] + v_applied;
      v_tries[v_target] := v_tries[v_target] + 1;
      v_left := v_left - v_applied;

      -- Cleared once nothing is left, or what is left is small enough to ignore
      IF v_cleared[v_target] IS NULL AND v_owed[v_target] - v_paid[v_target] <= v_tolerance THEN
        v_cleared[v_target] := v_r.paid_on;
      END IF;

      -- Money named for one installment stays there, even if it overpays
      EXIT WHEN v_r.named IS NOT NULL;

      v_target := NULL;
      FOR v_k IN 1..array_length(v_no, 1) LOOP
        IF v_owed[v_k] - v_paid[v_k] > v_tolerance THEN
          v_target := v_k;
          EXIT;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN QUERY
  SELECT x.no, x.due, x.owed::DECIMAL, x.paid::DECIMAL,
         GREATEST(0, x.owed - x.paid)::DECIMAL,
         x.cleared,
         CASE WHEN x.cleared IS NULL THEN NULL ELSE GREATEST(0, (x.cleared - x.due))::INTEGER END,
         x.tries, x.bounced
  FROM unnest(v_no, v_due, v_owed, v_paid, v_cleared, v_tries, v_bounced)
       AS x(no, due, owed, paid, cleared, tries, bounced)
  ORDER BY x.no;
END;
$$;

-- =============================================================================
-- 4. The facts the credit rules ask for, from that history
-- =============================================================================
-- An installment still unpaid counts as late by however long it has been
-- overdue, so a file that simply stopped paying is not treated as clean.
CREATE OR REPLACE FUNCTION fn_loan_dpd_facts(p_customer_id UUID, p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
  v_out  JSONB;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'policy.simulate', 'policy.author', 'policy.approve']);

  WITH loans AS (
    SELECT id FROM loan_accounts WHERE customer_id = p_customer_id
  ), history AS (
    SELECT s.due_date, s.days_late,
           COALESCE(s.days_late, GREATEST(0, (p_as_of - s.due_date))) AS effective_late
    FROM loans l, LATERAL fn_loan_installment_status(l.id) s
    WHERE s.due_date <= p_as_of
  )
  SELECT count(*), jsonb_build_object(
    'anyDpd6m',           COALESCE(bool_or(effective_late > 0) FILTER (WHERE due_date > p_as_of - INTERVAL '6 months'), false),
    'worstDpd6m',         COALESCE(max(effective_late) FILTER (WHERE due_date > p_as_of - INTERVAL '6 months'), 0),
    'minorDpdMonths7to12', COALESCE(bool_or(effective_late BETWEEN 1 AND 30)
                              FILTER (WHERE due_date <= p_as_of - INTERVAL '6 months'
                                        AND due_date > p_as_of - INTERVAL '12 months'), false),
    'worstDpd12m',        COALESCE(max(effective_late) FILTER (WHERE due_date > p_as_of - INTERVAL '12 months'), 0),
    'dpd60Ever',          COALESCE(bool_or(effective_late >= 60), false),
    'dpd90OrWriteoff12m', COALESCE(bool_or(effective_late >= 90)
                              FILTER (WHERE due_date > p_as_of - INTERVAL '12 months'), false)
      OR EXISTS (SELECT 1 FROM loan_accounts la WHERE la.customer_id = p_customer_id
                   AND la.status = 'WRITTEN_OFF' AND COALESCE(la.closed_on, p_as_of) > p_as_of - INTERVAL '12 months'),
    'installmentsSeen',   count(*)
  )
  INTO v_rows, v_out
  FROM history;

  -- No loan with us: say so, rather than reporting a clean record
  IF COALESCE(v_rows, 0) = 0 THEN
    RETURN jsonb_build_object('installmentsSeen', 0);
  END IF;

  RETURN v_out;
END;
$$;

-- =============================================================================
-- 5. What the loan actually earned (IRR)
-- =============================================================================
-- The contract rate is what was agreed; this is what the money really returned,
-- given when each payment arrived. Late payers earn less than the rate suggests,
-- which is what makes it worth tuning pricing against.
CREATE OR REPLACE FUNCTION fn_loan_irr(p_loan_id UUID, p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate     NUMERIC := 0.12;   -- yearly, starting guess
  v_npv      NUMERIC;
  v_slope    NUMERIC;
  v_step     NUMERIC;
  v_start    DATE;
  v_flows    RECORD;
  v_i        INTEGER;
  v_received NUMERIC;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.all', 'policy.simulate', 'policy.author', 'policy.approve', 'pricing.view']);

  SELECT disbursed_on INTO v_start FROM loan_accounts WHERE id = p_loan_id;
  IF v_start IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_received
  FROM loan_repayments WHERE loan_id = p_loan_id AND outcome = 'SUCCESS' AND paid_on <= p_as_of;
  IF v_received <= 0 THEN
    RETURN NULL;
  END IF;

  -- Newton's method on the yearly rate; twenty rounds is far more than enough
  FOR v_i IN 1..20 LOOP
    v_npv := 0;
    v_slope := 0;
    FOR v_flows IN
      SELECT paid_on AS on_date, amount AS cash FROM loan_repayments
       WHERE loan_id = p_loan_id AND outcome = 'SUCCESS' AND paid_on <= p_as_of
      UNION ALL
      SELECT disbursed_on, -disbursed_amount FROM loan_accounts WHERE id = p_loan_id
    LOOP
      DECLARE
        t NUMERIC := (v_flows.on_date - v_start) / 365.0;
      BEGIN
        v_npv   := v_npv + v_flows.cash / power(1 + v_rate, t);
        v_slope := v_slope - t * v_flows.cash / power(1 + v_rate, t + 1);
      END;
    END LOOP;

    EXIT WHEN abs(v_npv) < 0.01 OR v_slope = 0;
    v_step := v_npv / v_slope;
    v_rate := v_rate - v_step;
    IF v_rate <= -0.99 THEN
      v_rate := -0.98;
    END IF;
  END LOOP;

  RETURN round(v_rate * 100, 2);
END;
$$;

-- =============================================================================
-- 6. Access
-- =============================================================================
ALTER TABLE loan_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_loan_accounts" ON loan_accounts;
CREATE POLICY "staff_read_loan_accounts" ON loan_accounts FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_loan_installments" ON loan_installments;
CREATE POLICY "staff_read_loan_installments" ON loan_installments FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_loan_repayments" ON loan_repayments;
CREATE POLICY "staff_read_loan_repayments" ON loan_repayments FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON loan_accounts, loan_installments, loan_repayments FROM anon, authenticated;
GRANT SELECT ON loan_accounts, loan_installments, loan_repayments TO authenticated;

REVOKE ALL ON FUNCTION fn_loan_installment_status(UUID)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_loan_dpd_facts(UUID, DATE)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_loan_irr(UUID, DATE)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_loan_installment_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_loan_dpd_facts(UUID, DATE)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_loan_irr(UUID, DATE)          TO authenticated;

-- A setting for the next policy version to carry
INSERT INTO parameter_definitions (param_key, section, label, value_type, unit, min_value, max_value, description)
VALUES ('servicing.shortfall_tolerance_inr', 'process', 'Shortfall treated as paid', 'amount_inr', 'INR', 0, 1000,
        'A payment short of the installment by this much or less still counts as paid on time.')
ON CONFLICT (param_key) DO NOTHING;

-- Check
-- SELECT * FROM fn_loan_installment_status('<loan id>');
-- SELECT fn_loan_dpd_facts('<customer id>');
-- SELECT fn_loan_irr('<loan id>');
