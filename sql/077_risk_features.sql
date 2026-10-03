-- =============================================================================
-- 077: The live risk score reads the inputs the model was trained on (fix list E1)
-- =============================================================================
-- Risk model v2 (057) was trained on 18 inputs worked out from the two-bureau
-- detail (053) and the income and bank detail (054), by the query in
-- scripts/local/export-seasoned-training.mjs. The live score on the case
-- screen still built them in the browser from the older application fields
-- (a one-line bureau summary, the bank statement summary, fixed fallbacks),
-- so it was not scoring the case the way the model learned.
--
-- fn_staff_risk_features(application) works out the same 18 inputs, the same
-- way, for one case:
--   * late payments (dpd30 / dpd60 / dpd90) from the merged bureau accounts,
--     each account's worst month counted once;
--   * write-off and enquiries from the combined bureau summary;
--   * bounces, salary months and cash against salary from the month-by-month
--     bank summary;
--   * employer tier and government from the employer type the customer gave;
--   * FOIR from the engine's recommendation (recomputed when a hard decline
--     stopped before working it out); LTV on the on-road price;
--   * the card servicing pattern from the bureau's card accounts.
-- It also says, for each input, whether it came from the detail or fell back
-- to the training default (detail missing), so the screen can say so.
--
-- Same visibility as the other case screens. Read only.
-- Run order: after 076. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_risk_features(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app  applications%ROWTYPE;
  v_sc   RECORD;
  v_out  JSONB;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_sc FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT fn_sees_real_customers())
     OR NOT (v_sc.sees_all OR v_app.assigned_officer_id = v_sc.me OR (v_app.assigned_officer_id IS NULL AND v_sc.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;

  WITH apps AS (
    SELECT a.id, a.loan_amount_requested, a.tenure_months, c.age_at_application, c.employer_category,
           c.total_work_experience_years, c.date_of_joining, a.created_at,
           coalesce(v.on_road_price, q.on_road) AS on_road_price,
           CASE WHEN coalesce(r.foir_calculated, 0) > 0 THEN r.foir_calculated
                ELSE round(100.0 * (coalesce(bsum.monthly_obligation, 0)
                                    + coalesce(nullif(a.indicative_emi, 0),
                                               coalesce(a.loan_amount_requested, q.loan_amount_requested) * (0.099 / 12)
                                                 / nullif(1 - power(1 + 0.099 / 12, -coalesce(a.tenure_months, q.tenure_months, 60)), 0)))
                           / nullif(coalesce(nullif(ia.eligible_net_salary, 0), a.declared_net_salary), 0), 2)
           END AS foir_calculated
    FROM applications a
    JOIN customers c ON c.id = a.customer_id
    LEFT JOIN vehicles v ON v.application_id = a.id
    LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v.id IS NULL
    LEFT JOIN bureau_summary bsum ON bsum.application_id = a.id AND bsum.bureau = 'COMBINED'
    LEFT JOIN LATERAL (SELECT eligible_net_salary FROM income_assessments i WHERE i.application_id = a.id
                       ORDER BY i.created_at DESC LIMIT 1) ia ON true
    LEFT JOIN LATERAL (SELECT foir_calculated FROM recommendations x WHERE x.application_id = a.id
                       ORDER BY x.created_at DESC LIMIT 1) r ON true
    WHERE a.id = v_app.id
  ),
  acct AS (
    SELECT coalesce(ba.merged_seq, ba.seq) AS k,
           max((SELECT coalesce(max(d), 0) FROM unnest(ba.dpd) d)) AS worst,
           bool_or(ba.revolving AND ba.product IN ('CARD', 'CORP_CARD')) AS card,
           max(CASE WHEN ba.product IN ('CARD', 'CORP_CARD') AND ba.status = 'ACTIVE' THEN ba.outstanding END) AS card_out,
           max(CASE WHEN ba.product IN ('CARD', 'CORP_CARD') AND ba.status = 'ACTIVE' THEN ba.credit_limit END) AS card_limit
    FROM bureau_accounts ba WHERE ba.application_id = v_app.id
    GROUP BY 1
  ),
  dpd AS (
    SELECT count(*) AS accounts,
           count(*) FILTER (WHERE worst >= 30 AND worst < 60) AS dpd30,
           count(*) FILTER (WHERE worst >= 60 AND worst < 90) AS dpd60,
           count(*) FILTER (WHERE worst >= 90) AS dpd90,
           count(*) FILTER (WHERE card) AS cards,
           count(*) FILTER (WHERE card AND card_out > 0.5 * nullif(card_limit, 0)) AS cards_heavy,
           count(*) FILTER (WHERE card AND card_out > 0) AS cards_carrying
    FROM acct
  ),
  bank AS (
    SELECT count(*) AS months, sum(bounces) AS bounces,
           count(*) FILTER (WHERE salary_credit > 0) AS salary_months,
           sum(cash_deposits) AS cash, sum(salary_credit) AS salary_in
    FROM bank_monthly_summary WHERE application_id = v_app.id
  )
  SELECT jsonb_build_object(
    'features', jsonb_build_object(
      'bureauScore', coalesce(bs.score, 650),
      'dpd30', coalesce(d.dpd30, 0), 'dpd60', coalesce(d.dpd60, 0), 'dpd90', coalesce(d.dpd90, 0),
      'dpdWriteOff', CASE WHEN coalesce(bs.writeoff_count_5y, 0) > 0 THEN 1 ELSE 0 END,
      'enquiryVelocity', coalesce(bs.enquiry_count_90d, 0),
      'bounceCount', coalesce(bk.bounces, 0),
      -- no bank months at all: the training default of 6, as in training
      'salaryRegularity', CASE WHEN coalesce(bk.months, 0) = 0 THEN 6 ELSE LEAST(6, bk.salary_months) END,
      'employerTier', CASE WHEN ap.employer_category IN ('GOVERNMENT', 'PSU') THEN 5 WHEN ap.employer_category = 'MNC' THEN 4
                           WHEN ap.employer_category = 'PUBLIC_LTD' THEN 3 ELSE 2 END,
      'cashWithdrawalRatio', CASE WHEN coalesce(bk.salary_in, 0) > 0 THEN LEAST(100, round(100.0 * bk.cash / bk.salary_in, 1)) ELSE 15 END,
      'ltvPercent', coalesce(round(100.0 * ap.loan_amount_requested / nullif(ap.on_road_price, 0), 1), 0),
      'foirPercent', coalesce(ap.foir_calculated, 40),
      'tenureMonths', coalesce(ap.tenure_months, 60),
      'age', coalesce(ap.age_at_application, 35),
      'govtEmployee', CASE WHEN ap.employer_category IN ('GOVERNMENT', 'PSU') THEN 1 ELSE 0 END,
      'employmentYears', coalesce(ap.total_work_experience_years,
                                  round((extract(epoch FROM ap.created_at - ap.date_of_joining::TIMESTAMPTZ) / 31557600.0)::NUMERIC, 1), 3),
      'ccServicingPattern', CASE WHEN coalesce(d.cards, 0) = 0 THEN 0 WHEN d.cards_heavy > 0 THEN 3 WHEN d.cards_carrying > 0 THEN 2 ELSE 1 END,
      'freeIncomeRatio', GREATEST(0, 100 - coalesce(ap.foir_calculated, 40))),
    -- which inputs fell back to the training default because the detail is missing
    'from_detail', jsonb_build_object(
      'bureau_summary', bs.application_id IS NOT NULL,
      'bureau_accounts', coalesce(d.accounts, 0) > 0,
      'bank_months', coalesce(bk.months, 0),
      'employer_type', ap.employer_category IS NOT NULL,
      'foir', ap.foir_calculated IS NOT NULL,
      'on_road_price', ap.on_road_price IS NOT NULL)
  ) INTO v_out
  FROM apps ap
  LEFT JOIN bureau_summary bs ON bs.application_id = ap.id AND bs.bureau = 'COMBINED'
  CROSS JOIN dpd d
  CROSS JOIN bank bk;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_risk_features(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_risk_features(TEXT) TO authenticated;

-- Check after running (as postgres, any synthetic case):
-- SELECT fn_staff_risk_features((SELECT application_id FROM applications WHERE origin = 'SYNTHETIC' AND status = 'APPROVED' LIMIT 1));
