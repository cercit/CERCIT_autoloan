-- cercit — Full application submission RPC
-- Combines create + customer update + vehicle + bureau + bank + income + assess
-- SECURITY DEFINER bypasses RLS so anon can call it
-- Run in Supabase SQL Editor after 004_functions.sql

CREATE OR REPLACE FUNCTION fn_submit_full_application(
  p_full_name TEXT,
  p_email TEXT,
  p_mobile TEXT,
  p_dob DATE DEFAULT NULL,
  p_pan TEXT DEFAULT NULL,
  p_employer TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state_code TEXT DEFAULT NULL,
  p_pincode TEXT DEFAULT NULL,
  p_net_salary DECIMAL DEFAULT 0,
  p_existing_emis DECIMAL DEFAULT 0,
  p_loan_amount DECIMAL DEFAULT 0,
  p_tenure INTEGER DEFAULT 60,
  p_make TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_variant TEXT DEFAULT NULL,
  p_fuel_type TEXT DEFAULT 'PETROL',
  p_ex_showroom DECIMAL DEFAULT 0,
  p_on_road DECIMAL DEFAULT 0,
  p_cibil_score INTEGER DEFAULT 750
)
RETURNS JSONB AS $$
DECLARE
  created JSONB;
  app_uuid UUID;
  cust_uuid UUID;
  app_id TEXT;
  age_val INTEGER;
  dealer_uuid UUID;
  assess_result JSONB;
  rec_result JSONB;
BEGIN
  -- Step 1: Create application + customer
  created := fn_create_application(p_full_name, p_email, p_mobile);
  app_uuid := (created->>'application_uuid')::UUID;
  cust_uuid := (created->>'customer_id')::UUID;
  app_id := created->>'application_id';

  -- Calculate age
  IF p_dob IS NOT NULL THEN
    age_val := extract(year FROM age(p_dob))::INTEGER;
  ELSE
    age_val := 30;
  END IF;

  -- Step 2: Update customer details
  UPDATE customers SET
    date_of_birth = p_dob,
    age_at_application = age_val,
    pan_number = p_pan,
    employer_name = p_employer,
    employment_type = 'SALARIED',
    city = p_city,
    state_code = p_state_code,
    pincode = p_pincode
  WHERE id = cust_uuid;

  -- Step 3: Update application with financials
  UPDATE applications SET
    loan_amount_requested = p_loan_amount,
    tenure_months = p_tenure,
    declared_net_salary = p_net_salary,
    declared_existing_emis = p_existing_emis,
    status = 'UNDER_ASSESSMENT'
  WHERE id = app_uuid;

  -- Step 4: Insert vehicle
  SELECT id INTO dealer_uuid FROM dealers
    WHERE lower(make) LIKE '%' || lower(p_make) || '%'
    LIMIT 1;

  INSERT INTO vehicles (
    application_id, make, model, variant, fuel_type,
    ex_showroom_price, road_tax, insurance, registration_charges,
    on_road_price, vehicle_category, dealer_id
  ) VALUES (
    app_uuid, p_make, p_model, p_variant, p_fuel_type,
    p_ex_showroom,
    round(p_ex_showroom * 0.065),
    round(p_ex_showroom * 0.04),
    round(p_on_road - p_ex_showroom - p_ex_showroom * 0.065 - p_ex_showroom * 0.04),
    p_on_road, 'CAR', dealer_uuid
  );

  -- Step 5: Insert bureau report
  INSERT INTO bureau_reports (
    application_id, customer_id, bureau_name, score, score_date,
    dpd_max_12m, dpd_60_plus_flag, active_accounts,
    total_outstanding, total_monthly_emi,
    enquiry_count_90d, writeoff_count_5y, settled_count_5y,
    credit_utilization_pct
  ) VALUES (
    app_uuid, cust_uuid, 'CIBIL', p_cibil_score, current_date,
    0, false, 1,
    0, p_existing_emis,
    1, 0, 0,
    15
  );

  -- Step 6: Insert bank statement analysis
  INSERT INTO bank_statement_analyses (
    application_id, customer_id, bank_name, account_number_last4,
    statement_from, statement_to, months_covered,
    avg_monthly_balance, avg_salary_credit, salary_regularity,
    bounce_count_6m,
    amb_on_5th, amb_on_10th, amb_on_15th, amb_on_20th, amb_on_25th,
    min_amb_5dates
  ) VALUES (
    app_uuid, cust_uuid, 'HDFC', '1234',
    current_date - interval '6 months', current_date, 6,
    round(p_net_salary * 1.1), p_net_salary, 'REGULAR',
    0,
    round(p_net_salary * 1.1), round(p_net_salary * 1.15),
    round(p_net_salary * 1.08), round(p_net_salary * 1.12),
    round(p_net_salary * 1.1), round(p_net_salary * 1.08)
  );

  -- Step 7: Insert income assessment
  INSERT INTO income_assessments (
    application_id, declared_net_salary, salary_slip_salary,
    bank_credit_salary, form16_annual_income, form16_monthly_equiv,
    income_variance_pct, income_variance_flag,
    eligible_net_salary, name_match_score
  ) VALUES (
    app_uuid, p_net_salary, p_net_salary,
    p_net_salary, p_net_salary * 12, p_net_salary,
    0, false,
    p_net_salary, 100
  );

  -- Step 8: Run assessment pipeline
  assess_result := fn_assess_application(app_uuid);

  RETURN jsonb_build_object(
    'application_id', app_id,
    'application_uuid', app_uuid,
    'decision', coalesce(assess_result->'recommendation'->>'decision', assess_result->'policy'->>'decision', assess_result->>'decision'),
    'rate', coalesce(assess_result->'recommendation'->>'rate', assess_result->'policy'->>'rate', assess_result->>'rate'),
    'summary', coalesce(assess_result->'recommendation'->>'summary', assess_result->>'summary'),
    'assessment', assess_result
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'application_id', app_id,
    'application_uuid', app_uuid,
    'decision', 'ERROR',
    'rate', 0,
    'summary', SQLERRM,
    'error', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix fn_generate_recommendation: handle unassigned rate_row
-- The issue: when bureau.score IS NULL, rate_row is never assigned,
-- and accessing rate_row.rate_pct throws "record not assigned yet"
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
  rec_tenure := coalesce(app.tenure_months, 60);
  rec_amount := coalesce(app.loan_amount_requested, 0);

  IF decision_band = 'REJECT' THEN
    rec_rate := 0;
    rec_emi := 0;
  ELSE
    rec_emi := fn_calculate_emi(rec_amount, rec_rate, rec_tenure);
  END IF;

  -- Calculate metrics
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  IF coalesce(veh.on_road_price, 0) > 0 THEN
    ltv_calc := round(rec_amount / veh.on_road_price * 100, 2);
  ELSE
    ltv_calc := 0;
  END IF;

  IF coalesce(income.eligible_net_salary, coalesce(app.declared_net_salary, 0)) > 0 THEN
    foir_calc := round((total_obligations + rec_emi) / coalesce(income.eligible_net_salary, app.declared_net_salary) * 100, 2);
    dbr_calc := round(total_obligations / coalesce(income.eligible_net_salary, app.declared_net_salary) * 100, 2);
    net_surplus := coalesce(income.eligible_net_salary, app.declared_net_salary) - total_obligations - rec_emi;
  ELSE
    foir_calc := 0;
    dbr_calc := 0;
    net_surplus := 0;
  END IF;

  -- Build risk and positive factors
  risk_factors := coalesce(policy_result->'results', '[]'::JSONB);
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
    summary := format('Application approved. CIBIL %s, FOIR %s%%, LTV %s%%. All %s policy rules passed.',
      coalesce(bureau.score::TEXT, 'N/A'), foir_calc, ltv_calc, rules_passed);
  ELSIF decision_band = 'REJECT' THEN
    summary := format('Application fails %s hard rule(s). Auto-decline recommended.', rules_failed);
  ELSE
    summary := format('Application flagged on %s rule(s). Manual review required.', rules_flagged);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon so the frontend can call it
GRANT EXECUTE ON FUNCTION fn_submit_full_application TO anon;
