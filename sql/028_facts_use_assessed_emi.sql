-- cercit — the impact check must use the EMI the assessment worked out
--
-- The first honest run of the impact check reported the affordability of every
-- application as "not known". The EMI was being read from applications, which
-- only holds the indicative figure from the in-principle step; the EMI an
-- assessment actually settles on is on the recommendation, and the sanctioned
-- one on the decision. With no EMI, FOIR, free income and balance-versus-EMI
-- are all unknown, so the affordability rules — the ones that matter most in a
-- policy change — were never exercised.
--
-- The EMI now comes from the best figure available: what was sanctioned, else
-- what was recommended, else the indicative one. Where nothing is recorded the
-- answer is still "not known" rather than a guess.
--
-- fn_policy_facts also reads the LTV, FOIR and loan amount the assessment
-- settled on, in preference to what was asked for, so the comparison reflects
-- the file as it was actually decided.
--
-- Run order: after 027. Safe to re-run.

CREATE OR REPLACE FUNCTION fn_policy_facts(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (application_id VARCHAR, decided_at TIMESTAMPTZ, facts JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.simulate', 'policy.author', 'policy.approve']);

  RETURN QUERY
  WITH recent AS (
    SELECT a.*, c.age_at_application, c.employment_type, c.years_in_current_job,
           v.ex_showroom_price, v.on_road_price
    FROM applications a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN vehicles v ON v.application_id = a.id
    WHERE a.status <> 'DRAFT'
    ORDER BY a.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 2000))
  ), computed AS (
    SELECT r.*,
      COALESCE(i.total_eligible_income, r.declared_net_salary) AS income,
      -- What was sanctioned, else recommended, else the indicative figure
      COALESCE(d.sanctioned_emi, rec.recommended_emi, r.indicative_emi) AS emi,
      COALESCE(d.sanctioned_amount, rec.recommended_amount, r.loan_amount_requested) AS amount,
      COALESCE(d.sanctioned_tenure, rec.recommended_tenure, r.tenure_months) AS tenure,
      rec.foir_calculated, rec.ltv_calculated,
      b.id AS bureau_id, b.score, b.dpd_60_plus_flag, b.dpd_max_12m,
      b.writeoff_count_5y, b.settled_count_5y, b.enquiry_count_90d, b.active_accounts,
      b.credit_utilization_pct,
      k.id AS bank_id, k.bounce_count_6m, k.salary_regularity, k.avg_monthly_balance,
      i.id AS income_id, i.income_variance_pct, i.name_match_score, i.employer_name_match
    FROM recent r
    LEFT JOIN LATERAL (SELECT * FROM bureau_reports br WHERE br.application_id = r.id ORDER BY br.created_at DESC LIMIT 1) b ON true
    LEFT JOIN LATERAL (SELECT * FROM bank_statement_analyses ba WHERE ba.application_id = r.id ORDER BY ba.created_at DESC LIMIT 1) k ON true
    LEFT JOIN LATERAL (SELECT * FROM income_assessments ia WHERE ia.application_id = r.id ORDER BY ia.created_at DESC LIMIT 1) i ON true
    LEFT JOIN LATERAL (SELECT * FROM recommendations rr WHERE rr.application_id = r.id ORDER BY rr.generated_at DESC LIMIT 1) rec ON true
    LEFT JOIN LATERAL (SELECT * FROM credit_decisions cd WHERE cd.application_id = r.id ORDER BY cd.created_at DESC LIMIT 1) d ON true
  )
  SELECT
    c.application_id,
    COALESCE(c.final_decision_at, c.created_at),
    jsonb_build_object(
      'age', c.age_at_application,
      'ageAtMaturity', c.age_at_application + COALESCE(c.tenure, 0) / 12.0,
      'govtEmployee', COALESCE(c.employment_type = 'GOVERNMENT', false),
      'employmentYears', COALESCE(c.years_in_current_job, 0),
      'employerVerified', c.employer_name_match IS TRUE,
      'incomeVerified', c.income_id IS NOT NULL,
      'tenureMonths', COALESCE(c.tenure, 0),
      'onRoadPrice', COALESCE(c.on_road_price, 0),

      'hasBureau', c.bureau_id IS NOT NULL,
      'bureauScore', c.score,
      'dpd60Ever', c.dpd_60_plus_flag,
      'dpd90OrWriteoff12m', CASE WHEN c.bureau_id IS NULL THEN NULL
                                 ELSE COALESCE(c.dpd_max_12m, 0) >= 90 OR COALESCE(c.writeoff_count_5y, 0) > 0 END,
      'anyDpd6m', CASE WHEN c.bureau_id IS NULL THEN NULL
                       WHEN COALESCE(c.dpd_max_12m, 0) = 0 THEN false
                       ELSE NULL END,
      'minorDpdMonths7to12', NULL,
      'writeoffCount5y', c.writeoff_count_5y,
      'settledCount5y', c.settled_count_5y,
      'enquiries90d', c.enquiry_count_90d,
      'activeAccounts', c.active_accounts,
      'ccServicingPattern', CASE WHEN c.bureau_id IS NULL THEN NULL
                                 WHEN COALESCE(c.credit_utilization_pct, 0) >= 90 THEN 3
                                 WHEN COALESCE(c.credit_utilization_pct, 0) >= 60 THEN 2 ELSE 1 END,
      'hasSevereDPD', CASE WHEN c.bureau_id IS NULL THEN false
                           ELSE COALESCE(c.dpd_60_plus_flag, false) OR COALESCE(c.dpd_max_12m, 0) >= 90 END,
      'hasRecentDPD', CASE WHEN c.bureau_id IS NULL THEN false ELSE COALESCE(c.dpd_max_12m, 0) > 0 END,

      -- The assessment's own FOIR where it recorded one, else worked out from the EMI
      'foir', COALESCE(c.foir_calculated,
                CASE WHEN COALESCE(c.income, 0) > 0 AND c.emi IS NOT NULL
                     THEN round(((COALESCE(c.declared_existing_emis, 0) + c.emi) / c.income) * 100, 2) END),
      'freeIncomeRatio', CASE WHEN COALESCE(c.income, 0) > 0 AND c.emi IS NOT NULL
                   THEN round(((c.income - COALESCE(c.declared_existing_emis, 0) - c.emi
                        - COALESCE(c.declared_rent, 0) - COALESCE(c.declared_food_household, 0)
                        - COALESCE(c.declared_travel, 0) - COALESCE(c.declared_insurance, 0)
                        - COALESCE(c.declared_other_expenses, 0)) / c.income) * 100, 2) END,

      'hasIncome', c.income_id IS NOT NULL,
      'incomeVariancePct', c.income_variance_pct,
      'nameMatchScore', c.name_match_score,

      'hasBank', c.bank_id IS NOT NULL,
      'bounces6m', c.bounce_count_6m,
      'bounces', COALESCE(c.bounce_count_6m, 0),
      'salaryMonthsRegular', CASE WHEN c.bank_id IS NULL THEN NULL
                                  WHEN c.salary_regularity = 'REGULAR' THEN 6
                                  WHEN c.salary_regularity IS NULL THEN NULL
                                  ELSE 3 END,
      'ambVsEmiPct', CASE WHEN c.bank_id IS NOT NULL AND COALESCE(c.emi, 0) > 0
                          THEN round((COALESCE(c.avg_monthly_balance, 0) / c.emi) * 100, 2) END,

      'ltvOnExShowroom', CASE WHEN COALESCE(c.ex_showroom_price, 0) > 0
                              THEN round((COALESCE(c.amount, 0) / c.ex_showroom_price) * 100, 2) END,
      'ltvOnRoad', COALESCE(c.ltv_calculated,
                     CASE WHEN COALESCE(c.on_road_price, 0) > 0
                          THEN round((COALESCE(c.amount, 0) / c.on_road_price) * 100, 2) END)
    )
  FROM computed c;
END;
$$;

-- Check: how much of the sample can actually be judged on affordability
-- SELECT count(*) FILTER (WHERE facts->>'foir' IS NULL) AS foir_unknown, count(*) AS total FROM fn_policy_facts(200);
