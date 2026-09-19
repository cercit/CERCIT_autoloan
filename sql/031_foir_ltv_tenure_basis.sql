-- cercit — FOIR base, LTV base and tenure precedence in the assessment (backlog CC6.1, CC6.2, CC6.3)
--
-- CC6.1, FOIR (decision 0.1, 17 Sep 2026: keep existing). The rules have always
-- worked FOIR out on net salary plus eligible other income. The recommendation
-- worked it out on net salary alone, so the FOIR stored with a decision, and
-- read by the impact check, could be higher than the one the rules checked.
-- Both now use the same base.
--
-- CC6.2, LTV (decision 0.2: keep existing, ex-showroom primary, on-road rule
-- kept). The rules already judge the ex-showroom LTV, with a second rule on the
-- on-road LTV. The stored ltv_calculated is the on-road figure and stays so,
-- because the impact check reads it as the on-road LTV; the summary an officer
-- reads now names both, where it used to say "LTV" for the on-road one.
--
-- CC6.3, tenure. Three places set a tenure limit and nothing chose between
-- them: the product rule (84 months; 120 for a government employee on a car
-- under 12 lakh), the bureau band (96 Approve, 84 Maybe) and the employer
-- category. The recommended tenure is now the tightest that applies. The
-- employer category is not recorded against an application yet, so its cap
-- cannot be applied until it is. The limits themselves are unchanged; only the
-- rule for choosing between them is new.
--
-- When the tenure is cut, the EMI rises. If FOIR at the shorter tenure goes over
-- the band's cap, an Approve becomes a Maybe, so a person looks at it.
--
-- Run order: after 030. Safe to re-run.

-- =============================================================================
-- 1. Tenure cap
-- =============================================================================
-- Product limits come from the policy version in force once one carries them;
-- until then, the values in the 2026.08 and 2026.09 rules.
CREATE OR REPLACE FUNCTION fn_tenure_cap(
  p_govt_employee  BOOLEAN,
  p_on_road_price  NUMERIC,
  p_band_cap       INTEGER,
  p_band_label     TEXT
)
RETURNS TABLE (cap INTEGER, source TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_standard  INTEGER;
  v_extended  INTEGER;
  v_ceiling   NUMERIC;
  v_rule      INTEGER;
  v_rule_note TEXT;
BEGIN
  BEGIN
    v_standard := (fn_policy_param('caps.max_tenure_months.product'))::INTEGER;
    v_extended := (fn_policy_param('caps.max_tenure_months.govt_small_car'))::INTEGER;
    v_ceiling  := (fn_policy_param('caps.govt_small_car_price_ceiling_inr'))::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  v_standard := COALESCE(v_standard, 84);
  v_extended := COALESCE(v_extended, 120);
  v_ceiling  := COALESCE(v_ceiling, 1200000);

  IF p_govt_employee AND COALESCE(p_on_road_price, 0) > 0 AND p_on_road_price < v_ceiling THEN
    v_rule := v_extended;
    v_rule_note := 'government employee, car under Rs ' || v_ceiling::BIGINT;
  ELSE
    v_rule := v_standard;
    v_rule_note := 'product limit';
  END IF;

  IF COALESCE(p_band_cap, 0) > 0 AND p_band_cap < v_rule THEN
    RETURN QUERY SELECT p_band_cap, format('%s band limit', initcap(COALESCE(p_band_label, 'bureau')));
  ELSE
    RETURN QUERY SELECT v_rule, v_rule_note;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_tenure_cap(BOOLEAN, NUMERIC, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_tenure_cap(BOOLEAN, NUMERIC, INTEGER, TEXT) TO authenticated;

-- =============================================================================
-- 2. The recommendation, with the three changes above
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


-- A pipeline step: run by the assessment, not called by app users (as in 018).
REVOKE EXECUTE ON FUNCTION fn_generate_recommendation(UUID) FROM PUBLIC, anon, authenticated;

-- Check after running: a new assessment's summary names both LTV figures.
-- SELECT summary_text, recommended_tenure, foir_calculated FROM recommendations ORDER BY created_at DESC LIMIT 3;
