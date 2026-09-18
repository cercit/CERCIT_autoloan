-- cercit — impact check before approval (backlog CC3.1, CC3.2)
--
-- Nobody should approve a rule change without seeing what it does. These
-- functions hand recent real applications to the rules engine so a proposed
-- version can be run beside the version in force, and the result recorded.
--
--   fn_policy_facts        the facts of recent applications, as the rules name them
--   fn_policy_simulation_record  store the outcome of a comparison
--   fn_policy_impact       the latest comparison for a version, for the screen
--
-- The engine itself runs on AWS; this file only supplies the facts and keeps
-- the result. Facts carry no name, PAN or mobile — only the numbers the rules
-- read, plus the application reference an officer can look up.
--
-- Run order: after 024. Safe to re-run.

-- =============================================================================
-- 1. Facts of recent applications
-- =============================================================================
-- Both naming schemes are emitted (the 2026.08 rules and the unified 2026.09
-- set), so any stored version can be evaluated against the same rows.
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
    jsonb_strip_nulls(jsonb_build_object(
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
      -- affordability
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
      'ambVsEmiPct', CASE WHEN k.id IS NOT NULL AND COALESCE(r.indicative_emi, 0) > 0
                          THEN round((COALESCE(k.avg_monthly_balance, 0) / r.indicative_emi) * 100, 2) END,
      -- collateral
      'ltvOnExShowroom', CASE WHEN COALESCE(r.ex_showroom_price, 0) > 0
                              THEN round((COALESCE(r.loan_amount_requested, 0) / r.ex_showroom_price) * 100, 2) END,
      'ltvOnRoad', CASE WHEN COALESCE(r.on_road_price, 0) > 0
                        THEN round((COALESCE(r.loan_amount_requested, 0) / r.on_road_price) * 100, 2) END
    ))
  FROM recent r
  LEFT JOIN LATERAL (SELECT * FROM bureau_reports br WHERE br.application_id = r.id ORDER BY br.created_at DESC LIMIT 1) b ON true
  LEFT JOIN LATERAL (SELECT * FROM bank_statement_analyses ba WHERE ba.application_id = r.id ORDER BY ba.created_at DESC LIMIT 1) k ON true
  LEFT JOIN LATERAL (SELECT * FROM income_assessments ia WHERE ia.application_id = r.id ORDER BY ia.created_at DESC LIMIT 1) i ON true;
END;
$$;

-- =============================================================================
-- 1b. One version's rules by id (the proposed one, which is not in force yet)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_document_by_id(p_version_id UUID)
RETURNS TABLE (policy_version_id UUID, version_code VARCHAR, engine VARCHAR, document JSONB, document_sha256 VARCHAR)
LANGUAGE sql
STABLE
AS $$
  SELECT pv.id, pv.version_code, pd.engine, pd.document, pd.document_sha256
  FROM policy_versions pv
  JOIN policy_documents pd ON pd.policy_version_id = pv.id
  WHERE pv.id = p_version_id;
$$;

-- =============================================================================
-- 2. Record a comparison
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_simulation_record(
  p_version_id   UUID,
  p_compared_to  UUID,
  p_sample_size  INTEGER,
  p_flips        JSONB,
  p_summary      JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_id    UUID;
BEGIN
  v_actor := fn_require_any_permission(ARRAY['policy.simulate', 'policy.author', 'policy.approve']);

  INSERT INTO policy_simulations (policy_version_id, compared_to_id, sample_size, flips, summary, run_by)
  VALUES (p_version_id, p_compared_to, p_sample_size, COALESCE(p_flips, '{}'::jsonb), COALESCE(p_summary, '{}'::jsonb), v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =============================================================================
-- 3. The latest comparison, for the approval screen (CC3.2)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_impact(p_version_id UUID)
RETURNS TABLE (
  sample_size  INTEGER,
  flips        JSONB,
  summary      JSONB,
  compared_to  VARCHAR,
  run_by       VARCHAR,
  run_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.view', 'policy.author', 'policy.approve', 'policy.simulate']);

  RETURN QUERY
  SELECT s.sample_size, s.flips, s.summary, v.version_code, u.full_name::VARCHAR, s.run_at
  FROM policy_simulations s
  LEFT JOIN policy_versions v ON v.id = s.compared_to_id
  LEFT JOIN users u ON u.id = s.run_by
  WHERE s.policy_version_id = p_version_id
  ORDER BY s.run_at DESC
  LIMIT 1;
END;
$$;

-- =============================================================================
-- 4. Access
-- =============================================================================
REVOKE ALL ON FUNCTION fn_policy_facts(INTEGER)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_document_by_id(UUID)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_simulation_record(UUID, UUID, INTEGER, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_impact(UUID)                                      FROM PUBLIC, anon;

-- The rules engine on AWS reads the facts and writes the result back.
GRANT EXECUTE ON FUNCTION fn_policy_facts(INTEGER)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_policy_document_by_id(UUID)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_policy_simulation_record(UUID, UUID, INTEGER, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_policy_impact(UUID)                                      TO authenticated;
-- No table rights: the engine writes only through the function above.
REVOKE INSERT, UPDATE, DELETE ON policy_simulations FROM service_role, authenticated, anon;

-- Check
-- SELECT application_id, facts->'foir', facts->'bureauScore' FROM fn_policy_facts(5);
