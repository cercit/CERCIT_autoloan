-- cercit — Backend functions (PostgreSQL)
-- Policy engine, EMI calculator, application ID generator, assessment pipeline
-- Run after 001_schema.sql and seed scripts

-- =============================================================================
-- 1. Application ID generator: YYYYMM + 6-digit serial
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS app_serial_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION fn_generate_application_id()
RETURNS VARCHAR(14) AS $$
DECLARE
  prefix VARCHAR(6);
  serial_num INTEGER;
BEGIN
  prefix := to_char(now(), 'YYYYMM');
  serial_num := nextval('app_serial_seq');
  RETURN prefix || lpad(serial_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. EMI calculator (reducing balance)
-- EMI = P * r * (1+r)^n / ((1+r)^n - 1)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_calculate_emi(
  p_principal DECIMAL,
  p_annual_rate DECIMAL,
  p_tenure_months INTEGER
)
RETURNS DECIMAL AS $$
DECLARE
  monthly_rate DECIMAL;
  emi DECIMAL;
BEGIN
  IF p_principal <= 0 OR p_tenure_months <= 0 THEN
    RETURN 0;
  END IF;

  IF p_annual_rate = 0 THEN
    RETURN round(p_principal / p_tenure_months, 2);
  END IF;

  monthly_rate := p_annual_rate / 12 / 100;
  emi := p_principal * monthly_rate * power(1 + monthly_rate, p_tenure_months)
         / (power(1 + monthly_rate, p_tenure_months) - 1);
  RETURN round(emi, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 3. In-principle check (Step 4 — quick eligibility on declared numbers)
-- Returns JSON: { eligible, max_loan, rate, tenure, emi, foir_pct, ltv_pct, reasons[] }
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_in_principle_check(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  rate_row RECORD;
  total_income DECIMAL;
  total_obligations DECIMAL;
  proposed_emi DECIMAL;
  foir_pct DECIMAL;
  ltv_pct DECIMAL;
  max_foir DECIMAL;
  max_ltv DECIMAL;
  max_tenure INTEGER;
  reasons JSONB := '[]'::JSONB;
  eligible BOOLEAN := true;
  result_band VARCHAR(10);
BEGIN
  SELECT * INTO app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Application not found');
  END IF;

  SELECT * INTO veh FROM vehicles WHERE application_id = p_application_id LIMIT 1;

  total_income := coalesce(app.declared_net_salary, 0) + coalesce(app.declared_other_income, 0);
  total_obligations := coalesce(app.declared_existing_emis, 0)
                     + coalesce(app.exchange_monthly_emi, 0);

  -- Default tenure if not set
  IF app.tenure_months IS NULL OR app.tenure_months = 0 THEN
    app.tenure_months := 60;
  END IF;

  -- Look up rate grid based on a default score band (750+ for in-principle)
  SELECT * INTO rate_row FROM rate_grid
    WHERE vehicle_category = 'CAR'
      AND is_active = true
      AND band_label = 'APPROVE'
    ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No rate grid configured');
  END IF;

  max_foir := rate_row.max_foir_pct;
  max_ltv := rate_row.max_ltv_pct;
  max_tenure := rate_row.max_tenure_months;

  IF app.tenure_months > max_tenure THEN
    app.tenure_months := max_tenure;
  END IF;

  proposed_emi := fn_calculate_emi(
    coalesce(app.loan_amount_requested, 0),
    rate_row.rate_pct,
    app.tenure_months
  );

  -- FOIR = (existing obligations + proposed EMI) / total income * 100
  IF total_income > 0 THEN
    foir_pct := round((total_obligations + proposed_emi) / total_income * 100, 2);
  ELSE
    foir_pct := 100;
  END IF;

  -- LTV = loan amount / ex-showroom price * 100
  IF veh.ex_showroom_price IS NOT NULL AND veh.ex_showroom_price > 0 THEN
    ltv_pct := round(coalesce(app.loan_amount_requested, 0) / veh.ex_showroom_price * 100, 2);
  ELSE
    ltv_pct := 0;
  END IF;

  -- Check FOIR
  IF foir_pct > max_foir THEN
    eligible := false;
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'code', 'FOIR_EXCEEDED',
        'message', 'Monthly obligations exceed income threshold',
        'actual', foir_pct,
        'max', max_foir
      )
    );
  END IF;

  -- Check LTV
  IF ltv_pct > max_ltv THEN
    eligible := false;
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'code', 'LTV_EXCEEDED',
        'message', 'Loan amount exceeds vehicle value limit',
        'actual', ltv_pct,
        'max', max_ltv
      )
    );
  END IF;

  -- Check surplus (income - obligations - proposed EMI > 0)
  IF total_income - total_obligations - proposed_emi <= 0 THEN
    eligible := false;
    reasons := reasons || jsonb_build_array(
      jsonb_build_object(
        'code', 'NO_SURPLUS',
        'message', 'No disposable surplus after proposed EMI',
        'surplus', total_income - total_obligations - proposed_emi
      )
    );
  END IF;

  IF eligible THEN
    result_band := 'ELIGIBLE';
  ELSE
    result_band := 'NOT_ELIGIBLE';
  END IF;

  -- Update application with indicative terms
  UPDATE applications SET
    indicative_emi = proposed_emi,
    indicative_rate = rate_row.rate_pct,
    in_principle_result = result_band,
    in_principle_at = now(),
    updated_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'eligible', eligible,
    'result', result_band,
    'loan_amount', app.loan_amount_requested,
    'rate', rate_row.rate_pct,
    'tenure_months', app.tenure_months,
    'emi', proposed_emi,
    'foir_pct', foir_pct,
    'ltv_pct', ltv_pct,
    'max_foir', max_foir,
    'max_ltv', max_ltv,
    'total_income', total_income,
    'total_obligations', total_obligations,
    'surplus_after_emi', total_income - total_obligations - proposed_emi,
    'reasons', reasons
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. Policy engine (Step 7 — full assessment against all 16 rules)
-- Evaluates each active policy rule, writes policy_results rows,
-- returns summary JSON
-- =============================================================================

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
  rate_row RECORD;
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
    proposed_emi := fn_calculate_emi(
      coalesce(app.loan_amount_requested, 0),
      rate_row.rate_pct,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. Generate recommendation (after policy engine runs)
-- Writes a recommendations row and credit_decisions row
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_generate_recommendation(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  bureau RECORD;
  bank RECORD;
  income RECORD;
  rate_row RECORD;
  rec_id UUID;
  decision_id UUID;
  decision_band VARCHAR(10);
  rec_rate DECIMAL;
  rec_amount DECIMAL;
  rec_tenure INTEGER;
  rec_emi DECIMAL;
  foir_calc DECIMAL;
  ltv_calc DECIMAL;
  dbr_calc DECIMAL;
  net_surplus DECIMAL;
  total_obligations DECIMAL;
  total_income DECIMAL;
  risk_factors JSONB := '[]'::JSONB;
  positive_factors JSONB := '[]'::JSONB;
  rules_passed INTEGER;
  rules_failed INTEGER;
  rules_flagged INTEGER;
  reason_code_list VARCHAR[];
  summary TEXT;
  failed_rule RECORD;
BEGIN
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

  -- Count policy results
  SELECT
    count(*) FILTER (WHERE result = 'PASS'),
    count(*) FILTER (WHERE result = 'FAIL' AND severity = 'REJECT'),
    count(*) FILTER (WHERE result = 'FAIL' AND severity = 'MAYBE')
  INTO rules_passed, rules_failed, rules_flagged
  FROM policy_results WHERE application_id = p_application_id;

  -- Determine decision band
  IF rules_failed > 0 THEN
    decision_band := 'REJECT';
  ELSIF rules_flagged > 0 THEN
    decision_band := 'MAYBE';
  ELSE
    decision_band := 'APPROVE';
  END IF;

  -- Get rate grid row
  IF bureau.score IS NOT NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true
        AND bureau.score BETWEEN score_band_min AND score_band_max
      LIMIT 1;
  END IF;

  IF NOT FOUND OR rate_row IS NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true AND band_label = 'APPROVE'
      LIMIT 1;
  END IF;

  rec_rate := rate_row.rate_pct;
  rec_tenure := coalesce(app.tenure_months, 60);
  rec_amount := coalesce(app.loan_amount_requested, 0);

  IF decision_band = 'REJECT' THEN
    rec_rate := 0;
    rec_amount := 0;
    rec_tenure := 0;
    rec_emi := 0;
  ELSE
    rec_emi := fn_calculate_emi(rec_amount, rec_rate, rec_tenure);
  END IF;

  -- Calculate metrics
  total_income := coalesce(income.total_eligible_income, app.declared_net_salary, 0);
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  IF total_income > 0 THEN
    foir_calc := round((total_obligations + rec_emi) / total_income * 100, 2);
    dbr_calc := round(total_obligations / total_income * 100, 2);
  ELSE
    foir_calc := 0;
    dbr_calc := 0;
  END IF;

  IF veh.ex_showroom_price IS NOT NULL AND veh.ex_showroom_price > 0 THEN
    ltv_calc := round(rec_amount / veh.ex_showroom_price * 100, 2);
  ELSE
    ltv_calc := 0;
  END IF;

  net_surplus := total_income - total_obligations - rec_emi;

  -- Collect risk and positive factors
  FOR failed_rule IN
    SELECT pr.reason_code, rc.internal_message
    FROM policy_results pr
    LEFT JOIN reason_codes rc ON rc.code = pr.reason_code
    WHERE pr.application_id = p_application_id AND pr.result = 'FAIL'
    ORDER BY pr.severity DESC
  LOOP
    risk_factors := risk_factors || jsonb_build_array(
      jsonb_build_object('code', failed_rule.reason_code, 'message', failed_rule.internal_message)
    );
  END LOOP;

  IF bureau.score >= 750 THEN
    positive_factors := positive_factors || jsonb_build_array('Strong CIBIL score');
  END IF;
  IF foir_calc < 40 THEN
    positive_factors := positive_factors || jsonb_build_array('Healthy FOIR ratio');
  END IF;
  IF bureau.dpd_max_12m = 0 THEN
    positive_factors := positive_factors || jsonb_build_array('Clean repayment history');
  END IF;
  IF net_surplus > rec_emi THEN
    positive_factors := positive_factors || jsonb_build_array('Strong disposable surplus');
  END IF;

  -- Collect reason codes for decision
  SELECT array_agg(DISTINCT pr.reason_code)
  INTO reason_code_list
  FROM policy_results pr
  WHERE pr.application_id = p_application_id AND pr.result = 'FAIL' AND pr.reason_code IS NOT NULL;

  -- Build summary
  CASE decision_band
    WHEN 'APPROVE' THEN
      summary := 'Application meets all policy criteria. CIBIL '
        || coalesce(bureau.score::TEXT, 'N/A')
        || ', FOIR ' || foir_calc || '%, LTV ' || ltv_calc
        || '%. Recommended for auto-approval at ' || rec_rate || '% p.a.';
    WHEN 'MAYBE' THEN
      summary := 'Application passes hard checks but has '
        || rules_flagged || ' flag(s) requiring officer review. CIBIL '
        || coalesce(bureau.score::TEXT, 'N/A')
        || ', FOIR ' || foir_calc || '%, LTV ' || ltv_calc || '%.';
    WHEN 'REJECT' THEN
      summary := 'Application fails ' || rules_failed
        || ' hard rule(s). Auto-decline recommended.';
  END CASE;

  -- Insert recommendation
  INSERT INTO recommendations (
    application_id, recommendation, recommended_rate, recommended_rate_type,
    recommended_amount, recommended_tenure, recommended_emi,
    ltv_calculated, foir_calculated, dbr_calculated, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary_text
  ) VALUES (
    p_application_id, decision_band, rec_rate, rate_row.rate_type,
    rec_amount, rec_tenure, rec_emi,
    ltv_calc, foir_calc, dbr_calc, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary
  ) RETURNING id INTO rec_id;

  -- Insert credit decision
  INSERT INTO credit_decisions (
    application_id, recommendation_id, decision, decided_by,
    sanctioned_amount, sanctioned_rate, sanctioned_tenure, sanctioned_emi,
    reason_codes,
    sanction_valid_until
  ) VALUES (
    p_application_id, rec_id, decision_band, 'SYSTEM',
    CASE WHEN decision_band != 'REJECT' THEN rec_amount ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_rate ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_tenure ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_emi ELSE NULL END,
    reason_code_list,
    CASE WHEN decision_band = 'APPROVE' THEN (current_date + interval '30 days')::DATE ELSE NULL END
  ) RETURNING id INTO decision_id;

  -- Update application with sanction validity
  IF decision_band = 'APPROVE' THEN
    UPDATE applications SET
      sanction_valid_until = now() + interval '30 days',
      status = 'APPROVED',
      final_decision_at = now()
    WHERE id = p_application_id;
  END IF;

  -- Log audit event
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (
    p_application_id,
    'DECISION_GENERATED',
    jsonb_build_object(
      'decision', decision_band,
      'recommendation_id', rec_id,
      'decision_id', decision_id,
      'rules_passed', rules_passed,
      'rules_failed', rules_failed,
      'rules_flagged', rules_flagged
    ),
    'SYSTEM'
  );

  RETURN jsonb_build_object(
    'recommendation_id', rec_id,
    'decision_id', decision_id,
    'decision', decision_band,
    'rate', rec_rate,
    'amount', rec_amount,
    'tenure', rec_tenure,
    'emi', rec_emi,
    'foir_pct', foir_calc,
    'ltv_pct', ltv_calc,
    'dbr_pct', dbr_calc,
    'net_surplus', net_surplus,
    'risk_factors', risk_factors,
    'positive_factors', positive_factors,
    'rules_passed', rules_passed,
    'rules_failed', rules_failed,
    'rules_flagged', rules_flagged,
    'summary', summary
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 6. Full assessment pipeline (runs policy engine + generates recommendation)
-- Single call from the frontend
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_assess_application(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  policy_result JSONB;
  recommendation_result JSONB;
BEGIN
  -- Update status
  UPDATE applications SET
    status = 'UNDER_ASSESSMENT',
    assessment_started_at = now()
  WHERE id = p_application_id;

  -- Log start
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (p_application_id, 'ASSESSMENT_STARTED', '{}'::JSONB, 'SYSTEM');

  -- Run policy engine
  policy_result := fn_run_policy_engine(p_application_id);

  IF policy_result ? 'error' THEN
    RETURN policy_result;
  END IF;

  -- Generate recommendation
  recommendation_result := fn_generate_recommendation(p_application_id);

  RETURN jsonb_build_object(
    'policy', policy_result,
    'recommendation', recommendation_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. Create application (Step 1 — registration)
-- Creates customer + application, returns application_id
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_create_application(
  p_full_name VARCHAR,
  p_email VARCHAR,
  p_mobile VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  cust_id UUID;
  app_id UUID;
  app_display_id VARCHAR(14);
BEGIN
  -- Upsert customer
  INSERT INTO customers (full_name, email, mobile)
  VALUES (p_full_name, p_email, p_mobile)
  ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    mobile = EXCLUDED.mobile,
    updated_at = now()
  RETURNING id INTO cust_id;

  -- Generate application ID
  app_display_id := fn_generate_application_id();

  -- Create application
  INSERT INTO applications (application_id, customer_id, status, current_step)
  VALUES (app_display_id, cust_id, 'DRAFT', 1)
  RETURNING id INTO app_id;

  -- Log
  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type)
  VALUES (app_id, 'APPLICATION_CREATED', jsonb_build_object('customer_email', p_email), 'CUSTOMER');

  RETURN jsonb_build_object(
    'application_id', app_display_id,
    'application_uuid', app_id,
    'customer_id', cust_id,
    'status', 'DRAFT',
    'step', 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 8. List applications for dashboard (joined view)
-- Returns application list with customer, vehicle, and decision summary
-- =============================================================================

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
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS application_uuid,
    a.application_id,
    c.full_name,
    c.email,
    c.mobile,
    c.employer_name,
    c.age_at_application,
    c.pan_number,
    c.city,
    c.state_code,
    a.status,
    a.current_step,
    a.loan_amount_requested,
    a.tenure_months,
    a.declared_net_salary,
    v.make AS vehicle_make,
    v.model AS vehicle_model,
    v.variant AS vehicle_variant,
    v.ex_showroom_price,
    v.on_road_price,
    d.dealer_name,
    br.score AS cibil_score,
    cd.decision,
    cd.sanctioned_rate AS rate,
    r.foir_calculated AS foir_pct,
    r.ltv_calculated AS ltv_pct,
    u.full_name AS officer_name,
    a.created_at
  FROM applications a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN vehicles v ON v.application_id = a.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN bureau_reports br ON br.application_id = a.id
  LEFT JOIN credit_decisions cd ON cd.application_id = a.id
  LEFT JOIN recommendations r ON r.application_id = a.id
  LEFT JOIN users u ON u.id = a.assigned_officer_id
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
