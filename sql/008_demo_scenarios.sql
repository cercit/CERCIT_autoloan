-- cercit — Pre-loaded demo scenarios
-- Creates 3 applications via fn_submit_full_application so full pipeline runs:
--   1. APPROVE — strong salaried, CIBIL 780, low FOIR
--   2. REJECT  — weak profile, CIBIL 580, DPD history
--   3. MAYBE   — borderline, CIBIL 680, needs manual review
-- Run in Supabase SQL Editor after 007

-- Clean up any previous demo runs of these exact names
-- (safe to re-run — deletes by customer name match then re-creates)
DO $$
DECLARE
  demo_names TEXT[] := ARRAY['Priya Venkatesh', 'Ravi Shankar Gupta', 'Ananya Deshmukh'];
  cust_ids UUID[];
  app_ids UUID[];
BEGIN
  -- Find customer IDs for these demo names
  SELECT array_agg(id) INTO cust_ids
  FROM customers
  WHERE full_name = ANY(demo_names);

  IF cust_ids IS NOT NULL THEN
    -- Find application IDs linked to these customers
    SELECT array_agg(id) INTO app_ids
    FROM applications
    WHERE customer_id = ANY(cust_ids);

    IF app_ids IS NOT NULL THEN
      DELETE FROM audit_events WHERE application_id = ANY(app_ids);
      DELETE FROM override_logs WHERE application_id = ANY(app_ids);
      DELETE FROM credit_decisions WHERE application_id = ANY(app_ids);
      DELETE FROM policy_check_results WHERE application_id = ANY(app_ids);
      DELETE FROM recommendations WHERE application_id = ANY(app_ids);
      DELETE FROM income_assessments WHERE application_id = ANY(app_ids);
      DELETE FROM bank_statement_analyses WHERE application_id = ANY(app_ids);
      DELETE FROM bureau_reports WHERE application_id = ANY(app_ids);
      DELETE FROM vehicles WHERE application_id = ANY(app_ids);
      DELETE FROM applications WHERE id = ANY(app_ids);
    END IF;

    DELETE FROM customers WHERE id = ANY(cust_ids);
  END IF;
END $$;

-- ============================================================
-- SCENARIO 1: APPROVE — Priya Venkatesh
-- Senior software engineer at Infosys, CIBIL 780, clean bureau
-- Buying a Honda City, modest loan relative to income
-- Expected: APPROVE at 8.99%
-- ============================================================
SELECT fn_submit_full_application(
  p_full_name    := 'Priya Venkatesh',
  p_email        := 'priya.v@demo.cercit.in',
  p_mobile       := '9876543210',
  p_dob          := '1992-03-15',
  p_pan          := 'BVEPV1234A',
  p_employer     := 'Infosys Limited',
  p_city         := 'Bengaluru',
  p_state_code   := 'KA',
  p_pincode      := '560001',
  p_net_salary   := 95000,
  p_existing_emis := 0,
  p_loan_amount  := 900000,
  p_tenure       := 60,
  p_make         := 'Honda',
  p_model        := 'City',
  p_variant      := 'ZX CVT',
  p_fuel_type    := 'PETROL',
  p_ex_showroom  := 1400000,
  p_on_road      := 1620000,
  p_cibil_score  := 780
);

-- ============================================================
-- SCENARIO 2: REJECT — Ravi Shankar Gupta
-- Self-employed, small trader, CIBIL 580, DPD history
-- Trying to buy an expensive SUV on thin income
-- Expected: REJECT
-- ============================================================
SELECT fn_submit_full_application(
  p_full_name    := 'Ravi Shankar Gupta',
  p_email        := 'ravi.gupta@demo.cercit.in',
  p_mobile       := '9876543211',
  p_dob          := '1985-11-22',
  p_pan          := 'ABCPG5678B',
  p_employer     := 'Gupta Trading Co',
  p_city         := 'Lucknow',
  p_state_code   := 'UP',
  p_pincode      := '226001',
  p_net_salary   := 35000,
  p_existing_emis := 12000,
  p_loan_amount  := 1200000,
  p_tenure       := 84,
  p_make         := 'Mahindra',
  p_model        := 'XUV700',
  p_variant      := 'AX7 AT',
  p_fuel_type    := 'DIESEL',
  p_ex_showroom  := 2100000,
  p_on_road      := 2450000,
  p_cibil_score  := 580
);

-- ============================================================
-- SCENARIO 3: MAYBE — Ananya Deshmukh
-- Mid-level professional, CIBIL 680 (borderline), moderate FOIR
-- Decent profile but score falls in the review band
-- Expected: MAYBE at 9.90%, needs manual review
-- ============================================================
SELECT fn_submit_full_application(
  p_full_name    := 'Ananya Deshmukh',
  p_email        := 'ananya.d@demo.cercit.in',
  p_mobile       := '9876543212',
  p_dob          := '1990-07-08',
  p_pan          := 'CDEPA9012C',
  p_employer     := 'Wipro Technologies',
  p_city         := 'Pune',
  p_state_code   := 'MH',
  p_pincode      := '411001',
  p_net_salary   := 65000,
  p_existing_emis := 8000,
  p_loan_amount  := 750000,
  p_tenure       := 60,
  p_make         := 'Maruti Suzuki',
  p_model        := 'Grand Vitara',
  p_variant      := 'Alpha AT',
  p_fuel_type    := 'HYBRID',
  p_ex_showroom  := 1450000,
  p_on_road      := 1680000,
  p_cibil_score  := 680
);
