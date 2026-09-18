-- cercit — the impact check must not drop unknown facts (backlog CC3.1 fix)
--
-- fn_policy_facts stripped null values out of each application's facts. The
-- rules engine expects every fact it reads to be present, with null meaning
-- "not known", so a stripped key made the whole application unevaluable. The
-- first live run skipped all eight applications because no EMI was recorded on
-- them, and still reported "nothing would change" — the most misleading answer
-- an impact check can give.
--
-- Now every key is present. A fact that cannot be worked out is null, and the
-- engine reports how many applications had it missing instead of quietly
-- dropping them.
--
-- Run order: after 025. Safe to re-run.

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
  )
  SELECT
    r.application_id,
    COALESCE(r.final_decision_at, r.created_at),
    jsonb_build_object(
      -- who and what
      'age', r.age_at_application,
      'ageAtMaturity', r.age_at_application + COALESCE(r.tenure_months, 0) / 12.0,
      'govtEmployee', COALESCE(r.employment_type = 'GOVERNMENT', false),
      'employmentYears', COALESCE(r.years_in_current_job, 0),
      'employerVerified', i.employer_name_match IS TRUE,
      'incomeVerified', i.id IS NOT NULL,
      'tenureMonths', COALESCE(r.tenure_months, 0),
      'onRoadPrice', COALESCE(r.on_road_price, 0),
      -- bureau
      'hasBureau', b.id IS NOT NULL,
      'bureauScore', b.score,
      'dpd60Ever', b.dpd_60_plus_flag,
      'dpd90OrWriteoff12m', CASE WHEN b.id IS NULL THEN NULL
                                 ELSE COALESCE(b.dpd_max_12m, 0) >= 90 OR COALESCE(b.writeoff_count_5y, 0) > 0 END,
      'anyDpd6m', CASE WHEN b.id IS NULL THEN NULL ELSE COALESCE(b.dpd_max_12m, 0) > 0 END,
      'minorDpdMonths7to12', CASE WHEN b.id IS NULL THEN NULL
                                  ELSE COALESCE(b.dpd_30_count_24m, 0) > 0 AND COALESCE(b.dpd_max_12m, 0) = 0 END,
      'writeoffCount5y', b.writeoff_count_5y,
      'settledCount5y', b.settled_count_5y,
      'enquiries90d', b.enquiry_count_90d,
      'activeAccounts', b.active_accounts,
      'ccServicingPattern', CASE WHEN b.id IS NULL THEN NULL
                                 WHEN COALESCE(b.credit_utilization_pct, 0) >= 90 THEN 3
                                 WHEN COALESCE(b.credit_utilization_pct, 0) >= 60 THEN 2 ELSE 1 END,
      -- the 2026.08 names for the same two things
      'hasSevereDPD', CASE WHEN b.id IS NULL THEN false
                           ELSE COALESCE(b.dpd_60_plus_flag, false) OR COALESCE(b.dpd_max_12m, 0) >= 90 END,
      'hasRecentDPD', CASE WHEN b.id IS NULL THEN false ELSE COALESCE(b.dpd_max_12m, 0) > 0 END,
      -- affordability, on the income the assessment accepted (decision 0.1)
      'foir', CASE WHEN COALESCE(i.total_eligible_income, r.declared_net_salary, 0) > 0
                   THEN round(((COALESCE(r.declared_existing_emis, 0) + COALESCE(r.indicative_emi, 0))
                        / COALESCE(i.total_eligible_income, r.declared_net_salary)) * 100, 2) END,
      'freeIncomeRatio', CASE WHEN COALESCE(i.total_eligible_income, r.declared_net_salary, 0) > 0
                   THEN round(((COALESCE(i.total_eligible_income, r.declared_net_salary)
                        - COALESCE(r.declared_existing_emis, 0) - COALESCE(r.indicative_emi, 0)
                        - COALESCE(r.declared_rent, 0) - COALESCE(r.declared_food_household, 0)
                        - COALESCE(r.declared_travel, 0) - COALESCE(r.declared_insurance, 0)
                        - COALESCE(r.declared_other_expenses, 0))
                        / COALESCE(i.total_eligible_income, r.declared_net_salary)) * 100, 2) END,
      -- income documents
      'hasIncome', i.id IS NOT NULL,
      'incomeVariancePct', i.income_variance_pct,
      'nameMatchScore', i.name_match_score,
      -- bank behaviour
      'hasBank', k.id IS NOT NULL,
      'bounces6m', k.bounce_count_6m,
      'bounces', COALESCE(k.bounce_count_6m, 0),
      'salaryMonthsRegular', CASE WHEN k.id IS NULL THEN NULL
                                  WHEN k.salary_regularity = 'REGULAR' THEN 6
                                  WHEN k.salary_regularity = 'MOSTLY_REGULAR' THEN 5 ELSE 3 END,
      -- null when no EMI has been worked out yet: the balance cannot be judged against it
      'ambVsEmiPct', CASE WHEN k.id IS NOT NULL AND COALESCE(r.indicative_emi, 0) > 0
                          THEN round((COALESCE(k.avg_monthly_balance, 0) / r.indicative_emi) * 100, 2) END,
      -- collateral
      'ltvOnExShowroom', CASE WHEN COALESCE(r.ex_showroom_price, 0) > 0
                              THEN round((COALESCE(r.loan_amount_requested, 0) / r.ex_showroom_price) * 100, 2) END,
      'ltvOnRoad', CASE WHEN COALESCE(r.on_road_price, 0) > 0
                        THEN round((COALESCE(r.loan_amount_requested, 0) / r.on_road_price) * 100, 2) END
    )
  FROM recent r
  LEFT JOIN LATERAL (SELECT * FROM bureau_reports br WHERE br.application_id = r.id ORDER BY br.created_at DESC LIMIT 1) b ON true
  LEFT JOIN LATERAL (SELECT * FROM bank_statement_analyses ba WHERE ba.application_id = r.id ORDER BY ba.created_at DESC LIMIT 1) k ON true
  LEFT JOIN LATERAL (SELECT * FROM income_assessments ia WHERE ia.application_id = r.id ORDER BY ia.created_at DESC LIMIT 1) i ON true;
END;
$$;

-- Check: no key should be absent, whatever is missing from the application
-- SELECT application_id, (SELECT count(*) FROM jsonb_object_keys(facts)) AS facts_present FROM fn_policy_facts(5);
