-- =============================================================================
-- 059: Customer applications in the Applications list, filled in (R22)
-- =============================================================================
-- 050 took customer-journey applications out of the older Applications list
-- because they showed with blanks: their car sits in vehicle_quotations, not
-- vehicles, and drafts read as "New". Decided 2 Oct (R22): show them, filled in.
--
--   * car, dealer, prices, loan amount and tenure fall back to the customer's
--     quotation when there is no vehicles row
--   * drafts the customer has not sent yet stay out: there is nothing to work on
--   * only staff who may see real customers get them (fn_sees_real_customers);
--     the public demo login keeps seeing staff and synthetic applications only
--   * a new last column, origin, lets the page open a customer application on
--     its own screen
--   * one row per application: the latest bureau report, decision and
--     recommendation (re-run checks used to repeat a row)
--
-- The return type changes, so the function is dropped and created again.
-- Run order: after 058. Safe to re-run.
-- =============================================================================

DROP FUNCTION IF EXISTS fn_list_applications();

CREATE FUNCTION fn_list_applications()
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
  created_at TIMESTAMPTZ,
  origin VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real BOOLEAN;
BEGIN
  -- Narrowing "own" and "team" to the caller's cases comes with the Admin
  -- module's scopes; for now any view permission sees the list, as today.
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real := fn_sees_real_customers();

  RETURN QUERY
  SELECT
    a.id AS application_uuid,
    a.application_id,
    c.full_name,
    c.email,
    fn_pii_mask(c.mobile_last4, 10)::VARCHAR AS mobile,
    c.employer_name,
    c.age_at_application,
    fn_pii_mask(c.pan_last4, 10)::VARCHAR AS pan_number,
    c.city,
    c.state_code,
    a.status,
    a.current_step,
    coalesce(a.loan_amount_requested, q.loan_amount_requested),
    coalesce(a.tenure_months, q.tenure_months),
    a.declared_net_salary,
    coalesce(v.make, q.make)::VARCHAR AS vehicle_make,
    coalesce(v.model, q.model)::VARCHAR AS vehicle_model,
    coalesce(v.variant, q.variant)::VARCHAR AS vehicle_variant,
    coalesce(v.ex_showroom_price, q.ex_showroom),
    coalesce(v.on_road_price, q.on_road),
    coalesce(d.dealer_name, q.dealer_name)::VARCHAR AS dealer_name,
    br.score AS cibil_score,
    cd.decision,
    cd.sanctioned_rate AS rate,
    r.foir_calculated AS foir_pct,
    r.ltv_calculated AS ltv_pct,
    u.full_name AS officer_name,
    a.created_at,
    a.origin
  FROM applications a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN vehicles v ON v.application_id = a.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v.id IS NULL
  -- the latest of each: a customer case can have its credit checks run more than once
  LEFT JOIN LATERAL (SELECT x.score FROM bureau_reports x WHERE x.application_id = a.id
                     ORDER BY x.created_at DESC LIMIT 1) br ON true
  LEFT JOIN LATERAL (SELECT x.decision, x.sanctioned_rate FROM credit_decisions x WHERE x.application_id = a.id
                     ORDER BY x.decided_at DESC NULLS LAST LIMIT 1) cd ON true
  LEFT JOIN LATERAL (SELECT x.foir_calculated, x.ltv_calculated FROM recommendations x WHERE x.application_id = a.id
                     ORDER BY x.created_at DESC LIMIT 1) r ON true
  LEFT JOIN users u ON u.id = a.assigned_officer_id
  WHERE a.origin IS DISTINCT FROM 'CUSTOMER'
     OR (v_real AND a.status <> 'DRAFT')
  ORDER BY a.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_list_applications() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_list_applications() TO authenticated;
