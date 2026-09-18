-- cercit — fixes from the credit-control review (18 Sep 2026)
--
-- 1. Two changes approved for the same moment stopped the activation job for good.
-- 2. The impact check stated things it cannot know: a delay "in the last 6 months"
--    read from a 12-month column, a "1-30 day delay in months 7-12" read from a
--    24-month count, and an affordability figure that treated an unknown EMI as
--    nothing owed. Each of those made the check report a decision the real rules
--    would not have made.
-- 3. The impact figures an approver reads could be written by hand through the
--    API. They now come only from the rules engine.
--
-- Where a fact cannot be worked out it is null: the rule that needs it does not
-- fire and the engine reports how many applications were affected, rather than
-- a confident answer built on a guess.
--
-- Run order: after 026. Safe to re-run.

-- =============================================================================
-- 1. Activation: two versions due at the same moment
-- =============================================================================
-- A live window cannot be closed at the instant it opened, so activating a
-- second version with the same start date raised an error and left the job
-- stuck: no policy change would ever go live again. The later approval wins and
-- the earlier one is cancelled, with both recorded.
CREATE OR REPLACE FUNCTION fn_policy_activate_due()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due       policy_versions%ROWTYPE;
  v_switched  JSONB := '[]'::jsonb;
  v_cancelled JSONB := '[]'::jsonb;
  v_live      policy_versions%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.approve', 'policy.emergency']);

  FOR v_due IN
    SELECT * FROM policy_versions
    WHERE status = 'APPROVED' AND effective_from <= now()
    ORDER BY effective_from, approved_at
    FOR UPDATE
  LOOP
    SELECT * INTO v_live
    FROM policy_versions
    WHERE tenant_id = v_due.tenant_id AND product = v_due.product AND status = 'ACTIVE';

    -- Same moment as the version already live: the later approval replaces this one
    IF v_live.id IS NOT NULL AND v_live.effective_from >= v_due.effective_from THEN
      UPDATE policy_versions SET status = 'CANCELLED', updated_at = now() WHERE id = v_due.id;
      v_cancelled := v_cancelled || jsonb_build_object(
        'versionId', v_due.id, 'versionCode', v_due.version_code,
        'reason', format('%s is already live from the same moment', v_live.version_code)
      );
      CONTINUE;
    END IF;

    IF v_live.id IS NOT NULL THEN
      UPDATE policy_versions
      SET status = 'SUPERSEDED', effective_to = v_due.effective_from, updated_at = now()
      WHERE id = v_live.id;
    END IF;

    UPDATE policy_versions SET status = 'ACTIVE', updated_at = now() WHERE id = v_due.id;

    v_switched := v_switched || jsonb_build_object(
      'versionId', v_due.id, 'versionCode', v_due.version_code, 'effectiveFrom', v_due.effective_from
    );
  END LOOP;

  RETURN jsonb_build_object(
    'activated', jsonb_array_length(v_switched), 'versions', v_switched,
    'cancelled', jsonb_array_length(v_cancelled), 'cancelledVersions', v_cancelled
  );
END;
$$;

-- Say it at approval time too, rather than leaving it for the job to sort out
CREATE OR REPLACE FUNCTION fn_policy_approve(
  p_version_id     UUID,
  p_effective_from TIMESTAMPTZ,
  p_comment        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_version policy_versions%ROWTYPE;
  v_live    policy_versions%ROWTYPE;
  v_clash   VARCHAR;
BEGIN
  v_actor := fn_require_permission('policy.approve');

  SELECT * INTO v_version FROM policy_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'policy version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'policy version % is %, only one waiting for approval can be approved', v_version.version_code, v_version.status;
  END IF;
  IF v_actor IS NOT NULL AND v_version.authored_by = v_actor THEN
    RAISE EXCEPTION 'policy version % was written by you; someone else must approve it', v_version.version_code USING ERRCODE = '42501';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'a start date is required';
  END IF;
  IF p_effective_from < now() THEN
    RAISE EXCEPTION 'a policy version cannot start in the past';
  END IF;

  SELECT * INTO v_live
  FROM policy_versions
  WHERE tenant_id = v_version.tenant_id AND product = v_version.product AND status = 'ACTIVE';

  IF v_live.id IS NOT NULL AND v_live.effective_from >= p_effective_from THEN
    RAISE EXCEPTION 'version % is already live from %; choose a later start date',
      v_live.version_code, to_char(v_live.effective_from, 'DD Mon YYYY HH24:MI');
  END IF;

  SELECT version_code INTO v_clash
  FROM policy_versions
  WHERE tenant_id = v_version.tenant_id AND product = v_version.product
    AND status = 'APPROVED' AND id <> p_version_id AND effective_from = p_effective_from;

  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'version % is already approved to start at the same moment; choose a different start date', v_clash;
  END IF;

  UPDATE policy_versions
  SET status         = 'APPROVED',
      approved_by     = v_actor,
      approved_at     = now(),
      effective_from  = p_effective_from,
      updated_at      = now()
  WHERE id = p_version_id;

  INSERT INTO policy_change_reviews (change_request_id, reviewer_id, decision, comment)
  SELECT id, v_actor, 'APPROVE', p_comment
  FROM policy_change_requests
  WHERE policy_version_id = p_version_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'versionId', p_version_id,
    'versionCode', v_version.version_code,
    'status', 'APPROVED',
    'effectiveFrom', p_effective_from
  );
END;
$$;

-- =============================================================================
-- 2. Facts: say "not known" instead of guessing
-- =============================================================================
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
      -- The income the assessment accepted, else what the applicant declared (decision 0.1)
      COALESCE(i.total_eligible_income, r.declared_net_salary) AS income,
      -- Null, not zero: an EMI that has not been worked out is unknown, and an
      -- unknown EMI makes every affordability figure unknown too.
      r.indicative_emi AS emi,
      b.id AS bureau_id, b.score, b.dpd_60_plus_flag, b.dpd_max_12m, b.dpd_30_count_24m,
      b.writeoff_count_5y, b.settled_count_5y, b.enquiry_count_90d, b.active_accounts,
      b.credit_utilization_pct,
      k.id AS bank_id, k.bounce_count_6m, k.salary_regularity, k.avg_monthly_balance,
      i.id AS income_id, i.income_variance_pct, i.name_match_score, i.employer_name_match
    FROM recent r
    LEFT JOIN LATERAL (SELECT * FROM bureau_reports br WHERE br.application_id = r.id ORDER BY br.created_at DESC LIMIT 1) b ON true
    LEFT JOIN LATERAL (SELECT * FROM bank_statement_analyses ba WHERE ba.application_id = r.id ORDER BY ba.created_at DESC LIMIT 1) k ON true
    LEFT JOIN LATERAL (SELECT * FROM income_assessments ia WHERE ia.application_id = r.id ORDER BY ia.created_at DESC LIMIT 1) i ON true
  )
  SELECT
    c.application_id,
    COALESCE(c.final_decision_at, c.created_at),
    jsonb_build_object(
      'age', c.age_at_application,
      'ageAtMaturity', c.age_at_application + COALESCE(c.tenure_months, 0) / 12.0,
      'govtEmployee', COALESCE(c.employment_type = 'GOVERNMENT', false),
      'employmentYears', COALESCE(c.years_in_current_job, 0),
      'employerVerified', c.employer_name_match IS TRUE,
      'incomeVerified', c.income_id IS NOT NULL,
      'tenureMonths', COALESCE(c.tenure_months, 0),
      'onRoadPrice', COALESCE(c.on_road_price, 0),

      'hasBureau', c.bureau_id IS NOT NULL,
      'bureauScore', c.score,
      'dpd60Ever', c.dpd_60_plus_flag,
      'dpd90OrWriteoff12m', CASE WHEN c.bureau_id IS NULL THEN NULL
                                 ELSE COALESCE(c.dpd_max_12m, 0) >= 90 OR COALESCE(c.writeoff_count_5y, 0) > 0 END,
      -- The bureau tables hold 12- and 24-month figures, never a 6-month one.
      -- No delay in 12 months means none in 6; otherwise the timing is unknown.
      'anyDpd6m', CASE WHEN c.bureau_id IS NULL THEN NULL
                       WHEN COALESCE(c.dpd_max_12m, 0) = 0 THEN false
                       ELSE NULL END,
      -- Which months a small old delay fell in is not recorded anywhere.
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

      'foir', CASE WHEN COALESCE(c.income, 0) > 0 AND c.emi IS NOT NULL
                   THEN round(((COALESCE(c.declared_existing_emis, 0) + c.emi) / c.income) * 100, 2) END,
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
                              THEN round((COALESCE(c.loan_amount_requested, 0) / c.ex_showroom_price) * 100, 2) END,
      'ltvOnRoad', CASE WHEN COALESCE(c.on_road_price, 0) > 0
                        THEN round((COALESCE(c.loan_amount_requested, 0) / c.on_road_price) * 100, 2) END
    )
  FROM computed c;
END;
$$;

-- =============================================================================
-- 3. Impact figures come from the engine, not from a person
-- =============================================================================
-- The numbers an approver reads decide whether a change is safe. Written by
-- hand through the API they would be worthless, so only the rules engine
-- (the service role) may record them.
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
  v_id UUID;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'impact figures can only be recorded by the rules engine' USING ERRCODE = '42501';
  END IF;

  INSERT INTO policy_simulations (policy_version_id, compared_to_id, sample_size, flips, summary, run_by)
  VALUES (p_version_id, p_compared_to, p_sample_size, COALESCE(p_flips, '{}'::jsonb), COALESCE(p_summary, '{}'::jsonb), NULL)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_policy_simulation_record(UUID, UUID, INTEGER, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_simulation_record(UUID, UUID, INTEGER, JSONB, JSONB) TO service_role;

-- =============================================================================
-- 4. May this signed-in person ask for an impact check?
-- =============================================================================
-- The engine holds a service key, which passes every check in the database. It
-- therefore has to ask, in the caller's own name, whether they are allowed.
CREATE OR REPLACE FUNCTION fn_policy_may_simulate()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role FROM users WHERE auth_user_id = auth.uid() AND is_active;
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  RETURN fn_role_permissions(v_role) && ARRAY['policy.simulate', 'policy.author', 'policy.approve'];
END;
$$;

REVOKE ALL ON FUNCTION fn_policy_may_simulate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_policy_may_simulate() TO authenticated, anon;

-- Check
-- SELECT application_id, facts->'foir', facts->'anyDpd6m' FROM fn_policy_facts(5);
-- SELECT fn_policy_activate_due();
