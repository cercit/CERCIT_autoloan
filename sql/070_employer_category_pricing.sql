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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
