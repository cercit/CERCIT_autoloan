-- cercit — Smoke tests for backend functions
-- Run after 001_schema.sql, 002_seed_lookups.sql, 003_seed_dealers.sql, 004_functions.sql
-- Two scenarios: APPROVE (clean profile) and REJECT (weak profile)

-- =============================================================================
-- TEST 1: APPROVE scenario — strong salaried applicant
-- Expected: APPROVE at 8.99%, all 16 rules PASS
-- =============================================================================

-- Step 1: Create application
-- SELECT fn_create_application('Rahul Kumar', 'rahul.kumar@test.com', '9876543210');
-- Returns: application UUID and application_id (202608000001)

-- Step 2: Seed test data (use actual UUIDs from Step 1)
-- Replace <APP_UUID> and <CUST_UUID> with values from fn_create_application result

/*
UPDATE customers SET
  date_of_birth = '1992-03-15',
  age_at_application = 34,
  pan_number = 'ABCPK1234F',
  employer_name = 'Infosys Limited',
  employment_type = 'SALARIED',
  city = 'Bangalore',
  state_code = 'KA',
  pincode = '560001'
WHERE id = '<CUST_UUID>';

UPDATE applications SET
  loan_amount_requested = 1200000,
  tenure_months = 60,
  declared_net_salary = 85000,
  declared_existing_emis = 15000,
  status = 'UNDER_ASSESSMENT'
WHERE id = '<APP_UUID>';

INSERT INTO vehicles (application_id, make, model, variant, fuel_type, ex_showroom_price, road_tax, insurance, registration_charges, on_road_price, vehicle_category, dealer_id)
VALUES ('<APP_UUID>', 'Hyundai', 'Creta', 'SX(O) 1.5 Turbo DCT', 'PETROL', 1500000, 97500, 75000, 92500, 1765000, 'CAR',
  (SELECT id FROM dealers WHERE dealer_code = 'HYD-BLR-001'));

INSERT INTO bureau_reports (application_id, customer_id, bureau_name, score, score_date, dpd_max_12m, dpd_60_plus_flag, active_accounts, total_outstanding, total_monthly_emi, enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct)
VALUES ('<APP_UUID>', '<CUST_UUID>', 'CIBIL', 780, '2026-08-28', 0, false, 2, 180000, 15000, 1, 0, 0, 22.5);

INSERT INTO bank_statement_analyses (application_id, customer_id, bank_name, account_number_last4, statement_from, statement_to, months_covered, avg_monthly_balance, avg_salary_credit, salary_regularity, bounce_count_6m, amb_on_5th, amb_on_10th, amb_on_15th, amb_on_20th, amb_on_25th, min_amb_5dates)
VALUES ('<APP_UUID>', '<CUST_UUID>', 'HDFC', '9012', '2026-02-01', '2026-07-31', 6, 95000, 84500, 'REGULAR', 0, 95200, 98400, 96100, 97800, 95500, 95200);

INSERT INTO income_assessments (application_id, declared_net_salary, salary_slip_salary, bank_credit_salary, form16_annual_income, form16_monthly_equiv, income_variance_pct, income_variance_flag, eligible_net_salary, name_match_score)
VALUES ('<APP_UUID>', 85000, 85000, 84500, 1020000, 85000, 1.18, false, 84200, 99.5);
*/

-- Step 3: Run assessment
-- SELECT fn_assess_application('<APP_UUID>');

-- Expected result:
--   decision: APPROVE
--   rate: 8.99%
--   rules_passed: 16, rules_failed: 0, rules_flagged: 0
--   FOIR: ~47.39%, LTV: 80%, DBR: ~17.81%
--   EMI: ~24,904/month
--   Net surplus: ~44,296
--   Positive factors: Strong CIBIL score, Clean repayment history, Strong disposable surplus


-- =============================================================================
-- TEST 2: REJECT scenario — weak profile
-- Expected: REJECT, 4 hard fails, 5 flags
-- =============================================================================

-- Step 1: Create application
-- SELECT fn_create_application('Vikram Singh', 'vikram.singh@test.com', '9876500001');

-- Step 2: Seed weak profile data

/*
UPDATE customers SET
  date_of_birth = '1985-06-20',
  age_at_application = 41,
  pan_number = 'BXYPV5678G',
  employer_name = 'Local Trading Co',
  employment_type = 'SALARIED',
  city = 'Pune',
  state_code = 'MH',
  pincode = '411001'
WHERE id = '<CUST_UUID>';

UPDATE applications SET
  loan_amount_requested = 700000,
  tenure_months = 60,
  declared_net_salary = 45000,
  declared_existing_emis = 12000,
  status = 'UNDER_ASSESSMENT'
WHERE id = '<APP_UUID>';

INSERT INTO vehicles (application_id, make, model, variant, fuel_type, ex_showroom_price, road_tax, insurance, registration_charges, on_road_price, vehicle_category, dealer_id)
VALUES ('<APP_UUID>', 'Maruti Arena', 'Swift', 'VXi', 'PETROL', 800000, 64000, 45000, 41000, 950000, 'CAR',
  (SELECT id FROM dealers WHERE dealer_code = 'MAR-A-PUN-001'));

INSERT INTO bureau_reports (application_id, customer_id, bureau_name, score, score_date, dpd_max_12m, dpd_60_plus_flag, active_accounts, total_outstanding, total_monthly_emi, enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct)
VALUES ('<APP_UUID>', '<CUST_UUID>', 'CIBIL', 580, '2026-08-25', 30, false, 4, 350000, 12000, 5, 0, 1, 78.5);

INSERT INTO bank_statement_analyses (application_id, customer_id, bank_name, account_number_last4, statement_from, statement_to, months_covered, avg_monthly_balance, avg_salary_credit, salary_regularity, bounce_count_6m, amb_on_5th, amb_on_10th, amb_on_15th, amb_on_20th, amb_on_25th, min_amb_5dates)
VALUES ('<APP_UUID>', '<CUST_UUID>', 'SBI', '5678', '2026-02-01', '2026-07-31', 6, 28000, 43500, 'IRREGULAR', 3, 3200, 4100, 2800, 5500, 3800, 2800);

INSERT INTO income_assessments (application_id, declared_net_salary, salary_slip_salary, bank_credit_salary, form16_annual_income, form16_monthly_equiv, income_variance_pct, income_variance_flag, eligible_net_salary, name_match_score)
VALUES ('<APP_UUID>', 45000, 45000, 43500, 540000, 45000, 8.5, true, 43500, 99.0);
*/

-- Step 3: Run assessment
-- SELECT fn_assess_application('<APP_UUID>');

-- Expected result:
--   decision: REJECT
--   rules_passed: 7, rules_failed: 4, rules_flagged: 5
--   Hard fails: CIBIL_LOW (580<650), DPD_12M (30>0), WRITEOFF_SETTLED (1 settled), BOUNCE_DETECTED (3 bounces)
--   Flagged: ENQUIRY_VELOCITY (5>3), ACTIVE_ACCOUNTS_HIGH (4>3), FOIR_EXCEEDED (52.59%>50%), INCOME_VARIANCE (8.5%>5%), SALARY_IRREGULAR
--   Summary: "Application fails 4 hard rule(s). Auto-decline recommended."
