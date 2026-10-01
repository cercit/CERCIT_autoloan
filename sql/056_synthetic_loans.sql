-- =============================================================================
-- 056: Synthetic loans with repayment history
-- =============================================================================
-- Second half of the synthetic data (055 made the customers and decisions).
-- Approved synthetic applications (final stage) are disbursed with a loan
-- account, a reducing-balance schedule and every payment attempt, so the
-- portfolio views, the repayment-history rules (029) and the risk model have
-- seasoned loans to work with.
--
-- Seasoning: each loan is disbursed 3-27 months ago, and its application dates
-- move back with it. (The bureau and income detail keep their original dates;
-- for synthetic data only the order matters.)
--
-- Behaviour, from the user's industry figures (salaried new-car loans):
--   most instalments clear by mandate on the due date
--   ~3% of debits bounce first time and are paid by UPI 2-12 days later
--   ~2.5% of loans have one stretch of two instalments paid 31-60 days late
--   ~0.5% stop paying (90+ days past due)
--   weaker profiles (score below 700, FOIR above 50%) slip about 3x as often
-- Every outcome is decided from the application's own seed, so a re-run gives
-- the same history.
--
-- Run in the SQL Editor after 055, then:
--   SELECT fn_synthetic_disburse(300);   -- repeat until it says "disbursed": 0
-- fn_synthetic_purge (055) also removes these loans.
--
-- Run order: after 055. Safe to re-run.

CREATE OR REPLACE FUNCTION fn_synthetic_disburse(p_limit INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          RECORD;
  d          RECORD;
  b          INTEGER[];
  v_months   INTEGER;
  v_shift    INTERVAL;
  v_disb     DATE;
  v_first    DATE;
  v_loan     UUID;
  v_rate     NUMERIC;
  v_emi      NUMERIC;
  v_bal      NUMERIC;
  v_int      NUMERIC;
  v_prin     NUMERIC;
  v_score    INTEGER;
  v_foir     NUMERIC;
  v_weak     BOOLEAN;
  v_kind     TEXT;      -- CLEAN / STRESS / DEFAULT
  v_from     INTEGER;   -- instalment where trouble starts
  v_due_n    INTEGER;
  inst       RECORD;
  m          INTEGER[];
  v_pay      DATE;
  v_seq      INTEGER;
  v_made     INTEGER := 0;
  v_kinds    JSONB := '{}'::jsonb;
BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'limit 1-1000' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT a.* FROM applications a
    WHERE a.origin = 'SYNTHETIC' AND a.status = 'APPROVED' AND a.approval_stage = 'FINAL'
      AND NOT EXISTS (SELECT 1 FROM loan_accounts l WHERE l.application_id = a.id)
    ORDER BY a.application_id
    LIMIT p_limit
  LOOP
    SELECT * INTO d FROM credit_decisions c WHERE c.application_id = r.id AND c.decision = 'APPROVE'
    ORDER BY c.created_at DESC LIMIT 1;
    IF d.id IS NULL OR d.sanctioned_amount IS NULL THEN
      CONTINUE;
    END IF;
    b := fn_sim_bytes('synthetic-v1:' || r.application_id, 'loan');

    -- Seasoning: disbursed 3-27 months ago; the application's dates move back with it.
    v_months := 3 + b[1] % 25;
    v_disb := (date_trunc('month', current_date) - make_interval(months => v_months))::DATE + (b[2] % 25);
    v_shift := (v_disb - 7)::TIMESTAMPTZ - coalesce(r.final_decision_at, r.created_at);
    UPDATE applications
    SET created_at = created_at + v_shift,
        documents_submitted_at = documents_submitted_at + v_shift,
        customer_submitted_at = customer_submitted_at + v_shift,
        assessment_started_at = assessment_started_at + v_shift,
        final_decision_at = coalesce(final_decision_at, created_at) + v_shift,
        status = 'DISBURSED'
    WHERE id = r.id;

    v_rate := coalesce(d.sanctioned_rate, 9.9);
    v_emi := coalesce(d.sanctioned_emi, round(fn_emi(d.sanctioned_amount, v_rate, d.sanctioned_tenure)));
    v_first := fn_first_emi_date(v_disb);
    INSERT INTO loan_accounts (loan_account_no, application_id, customer_id, disbursed_on, disbursed_amount, installment_day,
                               emi_amount, tenure_months, contract_rate_pct, first_emi_date, paid_to, payment_ref, net_paid)
    VALUES ('SYNL' || substr(r.application_id, 4), r.id, r.customer_id, v_disb, d.sanctioned_amount, 5, v_emi,
            d.sanctioned_tenure, v_rate, v_first, 'The dealer', 'SIMNEFT' || substr(r.application_id, 4), d.sanctioned_amount)
    RETURNING id INTO v_loan;

    -- Reducing-balance schedule; the last instalment absorbs the rounding (as 049).
    v_bal := d.sanctioned_amount;
    FOR i IN 1..d.sanctioned_tenure LOOP
      v_int := round(v_bal * v_rate / 1200, 2);
      v_prin := CASE WHEN i = d.sanctioned_tenure THEN v_bal ELSE v_emi - v_int END;
      INSERT INTO loan_installments (loan_id, installment_no, due_date, amount_due, principal_due, interest_due)
      VALUES (v_loan, i, (v_first + make_interval(months => i - 1))::DATE, v_prin + v_int, v_prin, v_int);
      v_bal := v_bal - v_prin;
    END LOOP;

    -- How this borrower behaves.
    SELECT score INTO v_score FROM bureau_reports WHERE application_id = r.id ORDER BY created_at DESC LIMIT 1;
    SELECT foir_calculated INTO v_foir FROM recommendations WHERE application_id = r.id ORDER BY generated_at DESC LIMIT 1;
    v_weak := coalesce(v_score, 700) < 700 OR coalesce(v_foir, 0) > 50;
    v_due_n := (SELECT count(*) FROM loan_installments WHERE loan_id = v_loan AND due_date <= current_date);
    -- b[3]*256+b[4] is 0-65535: 0.5% default, 2.5% stress; about 3x for weaker profiles.
    v_kind := CASE
      WHEN b[3] * 256 + b[4] < 328 * CASE WHEN v_weak THEN 3 ELSE 1 END THEN 'DEFAULT'
      WHEN b[3] * 256 + b[4] < (328 + 1638) * CASE WHEN v_weak THEN 3 ELSE 1 END THEN 'STRESS'
      ELSE 'CLEAN' END;
    IF v_due_n < 3 AND v_kind <> 'CLEAN' THEN
      v_kind := 'CLEAN';     -- too new for a pattern to show
    END IF;
    v_from := CASE WHEN v_due_n >= 3 THEN 2 + b[5] % greatest(v_due_n - 2, 1) ELSE NULL END;
    v_kinds := jsonb_set(v_kinds, ARRAY[v_kind], to_jsonb(coalesce((v_kinds->>v_kind)::INTEGER, 0) + 1));

    v_seq := 0;
    FOR inst IN SELECT * FROM loan_installments WHERE loan_id = v_loan AND due_date <= current_date ORDER BY installment_no LOOP
      m := fn_sim_bytes('synthetic-v1:' || r.application_id, 'pay' || inst.installment_no);
      v_seq := v_seq + 1;
      IF v_kind = 'DEFAULT' AND inst.installment_no >= v_from THEN
        -- Stops paying: the mandate bounces every month.
        INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no, bounce_reason)
        VALUES (v_loan, inst.id, inst.due_date, inst.amount_due, 'MANDATE', 'BOUNCED', 'SIM' || v_seq || 'B', 'Insufficient funds');
      ELSIF v_kind = 'STRESS' AND inst.installment_no IN (v_from, v_from + 1) THEN
        -- One rough stretch: two instalments cleared 31-60 days late.
        v_pay := inst.due_date + 31 + m[1] % 30;
        INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no, bounce_reason)
        VALUES (v_loan, inst.id, inst.due_date, inst.amount_due, 'MANDATE', 'BOUNCED', 'SIM' || v_seq || 'B', 'Insufficient funds');
        IF v_pay <= current_date THEN
          INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no)
          VALUES (v_loan, inst.id, v_pay, inst.amount_due, 'UPI', 'SUCCESS', 'SIM' || v_seq || 'P');
        END IF;
      ELSIF m[2] < 8 THEN
        -- ~3%: the debit bounces, paid by UPI a few days later.
        v_pay := inst.due_date + 2 + m[3] % 11;
        INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no, bounce_reason)
        VALUES (v_loan, inst.id, inst.due_date, inst.amount_due, 'MANDATE', 'BOUNCED', 'SIM' || v_seq || 'B', 'Insufficient funds');
        IF v_pay <= current_date THEN
          INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no)
          VALUES (v_loan, inst.id, v_pay, inst.amount_due, 'UPI', 'SUCCESS', 'SIM' || v_seq || 'P');
        END IF;
      ELSE
        INSERT INTO loan_repayments (loan_id, installment_id, paid_on, amount, method, outcome, reference_no)
        VALUES (v_loan, inst.id, inst.due_date, inst.amount_due, 'MANDATE', 'SUCCESS', 'SIM' || v_seq);
      END IF;
    END LOOP;

    INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
    VALUES (r.id, 'LOAN_DISBURSED', jsonb_build_object('loan_account_no', 'SYNL' || substr(r.application_id, 4),
                                                       'amount', d.sanctioned_amount, 'synthetic', true), 'SYSTEM');
    v_made := v_made + 1;
  END LOOP;

  RETURN jsonb_build_object('disbursed', v_made, 'behaviour', v_kinds,
    'waiting', (SELECT count(*) FROM applications a WHERE a.origin = 'SYNTHETIC' AND a.status = 'APPROVED' AND a.approval_stage = 'FINAL'
                AND NOT EXISTS (SELECT 1 FROM loan_accounts l WHERE l.application_id = a.id)),
    'synthetic_loans', (SELECT count(*) FROM loan_accounts l JOIN applications a ON a.id = l.application_id WHERE a.origin = 'SYNTHETIC'));
END;
$$;

-- 055's purge, extended: loans hang off applications through loan_accounts,
-- and their schedules and payments hang off the loan.
CREATE OR REPLACE FUNCTION fn_synthetic_purge()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apps  UUID[];
  v_custs UUID[];
  v_loans UUID[];
  t       TEXT;
  i       INTEGER;
BEGIN
  SELECT array_agg(id), array_agg(DISTINCT customer_id) INTO v_apps, v_custs FROM applications WHERE origin = 'SYNTHETIC';
  IF v_apps IS NULL THEN
    RETURN jsonb_build_object('removed', 0);
  END IF;
  SELECT array_agg(id) INTO v_loans FROM loan_accounts WHERE application_id = ANY (v_apps);
  IF v_loans IS NOT NULL THEN
    DELETE FROM loan_repayments WHERE loan_id = ANY (v_loans);
    DELETE FROM loan_installments WHERE loan_id = ANY (v_loans);
  END IF;
  -- Every table whose application_id points at applications(id). Some point at each
  -- other too (credit_decisions -> recommendations), so a few passes clear them in order.
  FOR i IN 1..6 LOOP
    FOR t IN
      SELECT DISTINCT c.conrelid::regclass::TEXT
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'applications'::regclass AND a.attname = 'application_id'
        AND c.conrelid <> 'applications'::regclass
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %s WHERE application_id = ANY ($1)', t) USING v_apps;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;   -- something still points at these rows; the next pass clears it
      END;
    END LOOP;
  END LOOP;
  DELETE FROM applications WHERE id = ANY (v_apps);
  DELETE FROM customers WHERE id = ANY (v_custs)
    AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.customer_id = customers.id);
  RETURN jsonb_build_object('removed', cardinality(v_apps), 'loans_removed', coalesce(cardinality(v_loans), 0));
END;
$$;

REVOKE ALL ON FUNCTION fn_synthetic_disburse(INTEGER), fn_synthetic_purge() FROM PUBLIC, anon, authenticated;

-- Checks after disbursing:
-- SELECT count(*) AS loans, round(avg(disbursed_amount)) AS avg_loan FROM loan_accounts WHERE loan_account_no LIKE 'SYNL%';
-- SELECT max_days_late_bucket, count(*) FROM (
--   SELECT l.id, CASE WHEN max(s.days_late) >= 90 THEN '90+' WHEN max(s.days_late) >= 30 THEN '30-89'
--                     WHEN max(s.days_late) > 0 THEN '1-29' ELSE 'on time' END AS max_days_late_bucket
--   FROM loan_accounts l CROSS JOIN LATERAL fn_loan_installment_status(l.id) s
--   WHERE l.loan_account_no LIKE 'SYNL%' GROUP BY l.id) x GROUP BY 1 ORDER BY 1;
