-- =============================================================================
-- 061: Application Review reads through one staff function (fix list C5)
-- =============================================================================
-- The Application Review page read `applications`, `customers`,
-- `obligation_details`, `bureau_reports`, the bank tables and `audit_events`
-- straight from the browser. Signed-in staff have no read right on those
-- tables (privacy rules), so the page never loaded on the live site: it waited
-- on "Loading application..." for ever.
--
-- fn_staff_application_review(application_id) returns the whole case in one
-- call, as JSON:
--   * case: the case, applicant (PAN and mobile masked), car, latest
--     recommendation, decision and bureau score
--   * obligations: loans found on the bureau or declared
--   * bureau: the latest bureau summary (null if none)
--   * bank: the latest bank statement summary and its transactions (null if none)
--   * timeline: the case's audit events, oldest first, with who did each
--   * duplicates: other applications with the same PAN or mobile (by blind
--     index; up to 5), shown with the same privacy rule
--
-- Same rules as the Applications list: any app.view right, a real customer's
-- case only for staff who may see real customers (fn_sees_real_customers), and
-- for officers only their own or unassigned cases (fn_staff_case_scope, below).
-- Otherwise "application not found".
--
-- Also here, because every list after it uses it (fix list B2): which cases a
-- staff member sees. fn_staff_case_scope() answers once per call:
--   * sees_all: credit managers, heads, compliance, admins, the demo login
--     (app.view.team or app.view.all) and the SQL editor see every case
--   * otherwise (officers, app.view.own) only cases assigned to them, plus
--     cases nobody has taken yet when the setting officers_see_unassigned is 1
--     (the default, so new work is never invisible; set it to 0 to hide them)
-- The real-customer rule (fn_sees_real_customers) applies on top, as before.
--
-- Read only. Run order: after 060. Safe to re-run.
-- =============================================================================

INSERT INTO security_settings (setting_key, value, description) VALUES
  ('officers_see_unassigned', 1, '1 = officers (own cases only) also see cases nobody has taken yet, so they can pick them up; 0 = only cases assigned to them')
ON CONFLICT (setting_key) DO UPDATE SET description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION fn_staff_case_scope(OUT sees_all BOOLEAN, OUT me UUID, OUT unassigned BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  sees_all := fn_is_trusted_operator() OR fn_has_permission('app.view.all') OR fn_has_permission('app.view.team');
  me := fn_current_staff_id();
  unassigned := coalesce((SELECT value FROM security_settings WHERE setting_key = 'officers_see_unassigned'), 1) = 1;
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_case_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_case_scope() TO authenticated;

CREATE OR REPLACE FUNCTION fn_staff_application_review(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_app    applications%ROWTYPE;
  v_cust   customers%ROWTYPE;
  v_bank   bank_statement_analyses%ROWTYPE;
  v_case   JSONB;
  v_scope  RECORD;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real := fn_sees_real_customers();

  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_scope FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT v_real)
     OR NOT (v_scope.sees_all OR v_app.assigned_officer_id = v_scope.me
             OR (v_app.assigned_officer_id IS NULL AND v_scope.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_cust FROM customers WHERE id = v_app.customer_id;

  SELECT jsonb_build_object(
    'application_id', v_app.application_id,
    'origin', v_app.origin,
    'status', v_app.status,
    'created_at', v_app.created_at,
    'full_name', v_cust.full_name,
    'email', v_cust.email,
    'mobile', fn_pii_mask(v_cust.mobile_last4, 10),
    'pan_number', fn_pii_mask(v_cust.pan_last4, 10),
    'age_at_application', v_cust.age_at_application,
    'employer_name', v_cust.employer_name,
    'city', v_cust.city,
    'state_code', v_cust.state_code,
    'address_line1', v_cust.address_line1,
    'address_line2', v_cust.address_line2,
    'pincode', v_cust.pincode,
    'designation', v_cust.designation,
    'residence_type', v_cust.residence_type,
    'years_in_current_job', v_cust.years_in_current_job,
    'total_work_experience_years', v_cust.total_work_experience_years,
    'salary_bank_name', v_cust.salary_bank_name,
    'loan_amount_requested', coalesce(v_app.loan_amount_requested, q.loan_amount_requested),
    'tenure_months', coalesce(v_app.tenure_months, q.tenure_months),
    'declared_net_salary', v_app.declared_net_salary,
    'vehicle_make', coalesce(v.make, q.make),
    'vehicle_model', coalesce(v.model, q.model),
    'vehicle_variant', coalesce(v.variant, q.variant),
    'ex_showroom_price', coalesce(v.ex_showroom_price, q.ex_showroom),
    'on_road_price', coalesce(v.on_road_price, q.on_road),
    'dealer_name', coalesce(d.dealer_name, q.dealer_name),
    'cibil_score', br.score,
    'decision', coalesce(r.recommendation, cd.decision),
    'final_decision', cd.decision,
    'rate', coalesce(r.recommended_rate, cd.sanctioned_rate),
    'foir_pct', r.foir_calculated,
    'ltv_pct', r.ltv_calculated,
    'risk_factors', coalesce(r.risk_factors, '[]'::jsonb),
    'summary_text', r.summary_text,
    'policy_version', (SELECT pv.version_code FROM policy_versions pv WHERE pv.id = r.policy_version_id),
    'rules_snapshot', r.rules_snapshot,
    'model_version', r.model_version,
    'version_basis', r.version_basis,
    'officer_name', u.full_name
  ) INTO v_case
  FROM (SELECT 1) one
  LEFT JOIN vehicles v ON v.application_id = v_app.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN vehicle_quotations q ON q.application_id = v_app.id AND v.id IS NULL
  LEFT JOIN LATERAL (SELECT x.score FROM bureau_reports x WHERE x.application_id = v_app.id
                     ORDER BY x.created_at DESC LIMIT 1) br ON true
  LEFT JOIN LATERAL (SELECT x.decision, x.sanctioned_rate FROM credit_decisions x WHERE x.application_id = v_app.id
                     ORDER BY x.decided_at DESC NULLS LAST LIMIT 1) cd ON true
  LEFT JOIN LATERAL (SELECT x.* FROM recommendations x WHERE x.application_id = v_app.id
                     ORDER BY x.created_at DESC LIMIT 1) r ON true
  LEFT JOIN users u ON u.id = v_app.assigned_officer_id
  LIMIT 1;

  SELECT * INTO v_bank FROM bank_statement_analyses WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'case', v_case,
    'obligations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'lender_name', o.lender_name, 'obligation_type', o.obligation_type,
                       'monthly_emi', o.monthly_emi, 'outstanding_amount', o.outstanding_amount,
                       'dpd_current', o.dpd_current, 'source', o.source) ORDER BY o.created_at), '[]'::jsonb)
                    FROM obligation_details o WHERE o.application_id = v_app.id),
    'bureau', (SELECT jsonb_build_object(
                 'bureau_name', b.bureau_name, 'score', b.score, 'no_hit', b.no_hit,
                 'active_accounts', b.active_accounts, 'total_outstanding', b.total_outstanding,
                 'total_monthly_emi', b.total_monthly_emi, 'enquiry_count_90d', b.enquiry_count_90d,
                 'dpd_max_12m', b.dpd_max_12m, 'dpd_max_24m', b.dpd_max_24m,
                 'dpd_30_count_24m', b.dpd_30_count_24m, 'dpd_60_plus_flag', b.dpd_60_plus_flag,
                 'writeoff_count_5y', b.writeoff_count_5y, 'settled_count_5y', b.settled_count_5y,
                 'credit_utilization_pct', b.credit_utilization_pct,
                 'oldest_account_months', b.oldest_account_months,
                 'pulled_at', coalesce(b.pulled_at, b.created_at))
               FROM bureau_reports b WHERE b.application_id = v_app.id
               ORDER BY b.created_at DESC LIMIT 1),
    'bank', CASE WHEN v_bank.id IS NULL THEN NULL ELSE jsonb_build_object(
               'bank_name', v_bank.bank_name,
               'months_covered', v_bank.months_covered,
               'avg_monthly_balance', v_bank.avg_monthly_balance,
               'avg_salary_credit', v_bank.avg_salary_credit,
               'salary_regularity', v_bank.salary_regularity,
               'total_emi_debits', v_bank.total_emi_debits,
               'bounce_count_6m', v_bank.bounce_count_6m,
               'cash_deposit_total_6m', v_bank.cash_deposit_total_6m,
               'transactions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                   'txn_date', t.txn_date, 'txn_type', t.txn_type, 'amount', t.amount,
                                   'balance_after', t.balance_after, 'description', t.description,
                                   'category', t.category) ORDER BY t.txn_date, t.created_at), '[]'::jsonb)
                                FROM bank_transactions t WHERE t.analysis_id = v_bank.id))
             END,
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'event_type', e.event_type, 'created_at', e.created_at,
                    'actor', CASE WHEN u.full_name IS NOT NULL THEN u.full_name
                                  WHEN e.actor_type = 'CUSTOMER' THEN 'Customer'
                                  ELSE 'System' END,
                    'detail', e.event_detail) ORDER BY e.created_at, e.id), '[]'::jsonb)
                 FROM audit_events e
                 LEFT JOIN users u ON u.id = e.actor_id
                 WHERE e.application_id = v_app.id),
    'duplicates', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
                     SELECT jsonb_build_object(
                              'application_id', a2.application_id, 'full_name', c2.full_name, 'status', a2.status,
                              'match_field', CASE WHEN c2.pan_hash = v_cust.pan_hash THEN 'PAN' ELSE 'Mobile' END) AS x
                     FROM applications a2
                     JOIN customers c2 ON c2.id = a2.customer_id
                     WHERE a2.id <> v_app.id
                       AND ((v_cust.pan_hash IS NOT NULL AND c2.pan_hash = v_cust.pan_hash)
                         OR (v_cust.mobile_hash IS NOT NULL AND c2.mobile_hash = v_cust.mobile_hash))
                       AND (a2.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
                     ORDER BY a2.created_at DESC
                     LIMIT 5) dup)
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_application_review(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_application_review(TEXT) TO authenticated;

-- Check after running:
-- SELECT has_function_privilege('authenticated', 'fn_staff_application_review(text)', 'execute');   -- true
