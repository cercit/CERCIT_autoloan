-- =============================================================================
-- 055: Synthetic customers (the 2,000-customer generator)
-- =============================================================================
-- Made-up customers for the demo, the portfolio views and the risk model.
-- Nobody here is a real person:
--   PANs use X as the 4th letter, which no real holder type uses
--   mobiles start 5550 (not a valid Indian mobile series)
--   emails end @synthetic.invalid
--   applications are numbered SYN0000001 ... and have origin SYNTHETIC
-- so the public demo login can see them (050 hides only origin CUSTOMER).
--
-- Each application goes through the same steps as a real one: bureau consent,
-- the car, the two-bureau pull (053), payslips, Form 16 and bank months (054),
-- the income assessment, then the credit engine (fn_assess_application), which
-- decides APPROVED / UNDER_REVIEW / REJECTED. About 5% stay drafts and 10%
-- stay submitted (not yet assessed), so every queue has something in it.
--
-- This file only creates the functions. Run the batches separately, one at a
-- time, in the SQL Editor (each is one short statement):
--   SELECT fn_synthetic_generate(1, 250);   -- customers 1-250
--   SELECT fn_synthetic_generate(2, 250);   -- 251-500
--   ... up to batch 8 for 2,000
-- Re-running a batch skips customers already made. To remove every synthetic
-- record: SELECT fn_synthetic_purge();
--
-- Also fixes the income check (section 1): Form 16 is gross pay, so it is no
-- longer compared with take-home pay.
--
-- Run order: after 054. Safe to re-run.

-- =============================================================================
-- 1. Income check fix
-- =============================================================================
-- The income-variance rule (INC-VARIANCE, 5%) compared declared take-home pay
-- with slip net, bank salary AND Form 16 / 12. Form 16 is gross income, so it
-- always looked 25-40% higher and the rule failed for nearly everyone (found
-- running the synthetic customers). fn_customer_checks_core is 053's body with
-- that one line changed; Form 16 is still stored on income_assessments.
-- Re-running 048, 052 or 053 after 055 brings the old comparison back.

CREATE OR REPLACE FUNCTION fn_customer_checks_core(p_app UUID, p_read JSONB, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app       applications%ROWTYPE;
  v_q         vehicle_quotations%ROWTYPE;
  v_staff     UUID;
  v_bureau    JSONB;
  v_bank      JSONB := p_read->'bank';
  v_slip      NUMERIC;
  v_f16       NUMERIC;
  v_bank_sal  NUMERIC;
  v_declared  NUMERIC;
  v_sources   NUMERIC[];
  v_variance  NUMERIC;
  v_result    JSONB;
  v_status    TEXT;
BEGIN
  v_staff := p_actor;   -- NULL when the automatic checks run it
  SELECT * INTO v_app FROM applications WHERE id = p_app AND origin = 'CUSTOMER' FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status NOT IN ('UNDER_ASSESSMENT', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'run the credit checks after the documents are checked' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customer_consents WHERE application_id = v_app.id AND purpose = 'BUREAU_PULL' AND withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'the customer has not given consent for a bureau check' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_q FROM vehicle_quotations WHERE application_id = v_app.id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'the car details are missing on this application' USING ERRCODE = '22023';
  END IF;
  v_status := v_app.status;

  -- The loan and tenure live on the quotation for customer applications.
  UPDATE applications SET loan_amount_requested = v_q.loan_amount_requested, tenure_months = v_q.tenure_months WHERE id = v_app.id;

  -- Vehicle, from the quotation (rebuilt on every run).
  DELETE FROM vehicles WHERE application_id = v_app.id;
  INSERT INTO vehicles (application_id, make, model, variant, fuel_type, vehicle_category, ex_showroom_price,
                        road_tax, insurance, registration_charges, on_road_price)
  VALUES (v_app.id, v_q.make, v_q.model, coalesce(nullif(v_q.variant, ''), 'Not given'), coalesce(v_q.fuel_type, 'PETROL'), 'CAR',
          v_q.ex_showroom, coalesce(v_q.road_tax, 0), coalesce(v_q.insurance, 0),
          greatest(0, coalesce(v_q.on_road, v_q.ex_showroom) - v_q.ex_showroom - coalesce(v_q.road_tax, 0) - coalesce(v_q.insurance, 0)),
          coalesce(v_q.on_road, v_q.ex_showroom));

  -- Bureau: keep a real report if there is one; otherwise the two-bureau simulated pull, once (053).
  IF NOT EXISTS (SELECT 1 FROM bureau_reports WHERE application_id = v_app.id) THEN
    PERFORM fn_bureau_pull_simulated(v_app.id, NULL);
  END IF;

  -- Bank statement analysis: only what the reader found.
  DELETE FROM bank_statement_analyses WHERE application_id = v_app.id;
  IF jsonb_typeof(v_bank) = 'object' AND coalesce((v_bank->>'months')::NUMERIC, 0) > 0 THEN
    v_bank_sal := nullif((v_bank->>'avg_salary')::NUMERIC, 0);
    INSERT INTO bank_statement_analyses (application_id, customer_id, statement_from, statement_to, months_covered,
                                         avg_monthly_balance, avg_salary_credit, salary_regularity, bounce_count_6m)
    VALUES (v_app.id, v_app.customer_id, (current_date - ((v_bank->>'months')::INTEGER || ' months')::INTERVAL)::DATE, current_date,
            (v_bank->>'months')::SMALLINT, (v_bank->>'avg_monthly_balance')::NUMERIC, v_bank_sal,
            CASE WHEN coalesce((v_bank->>'salary_count')::INTEGER, 0) >= (v_bank->>'months')::INTEGER THEN 'REGULAR' ELSE 'IRREGULAR' END,
            coalesce((v_bank->>'bounce_count')::SMALLINT, 0));
  END IF;

  -- Income: declared, slip and bank, and how far apart they are (Form 16 is recorded, not compared).
  v_declared := v_app.declared_net_salary;
  v_slip := nullif((p_read->>'slip_net_salary')::NUMERIC, 0);
  v_f16 := nullif((p_read->>'form16_annual')::NUMERIC, 0);
  -- 055: Form 16 shows GROSS income (before PF and tax), so it is not compared with
  -- take-home pay. Eligible income = the lowest of declared, slip and bank (design D4).
  v_sources := array_remove(ARRAY[v_slip, v_bank_sal], NULL);
  v_variance := CASE WHEN v_declared IS NULL OR v_declared = 0 OR cardinality(v_sources) = 0 THEN NULL
                     ELSE round((SELECT max(abs(s - v_declared)) FROM unnest(v_sources) s) / v_declared * 100, 2) END;
  DELETE FROM income_assessments WHERE application_id = v_app.id;
  INSERT INTO income_assessments (application_id, declared_net_salary, salary_slip_salary, bank_credit_salary,
                                  form16_annual_income, form16_monthly_equiv, income_variance_pct, income_variance_flag,
                                  eligible_net_salary, total_eligible_income, assessment_date)
  VALUES (v_app.id, v_declared, v_slip, v_bank_sal, v_f16, round(v_f16 / 12, 2), v_variance, coalesce(v_variance > 5, false),
          -- The lower of what they declared and what the documents show.
          (SELECT min(s) FROM unnest(array_append(v_sources, v_declared)) s),
          (SELECT min(s) FROM unnest(array_append(v_sources, v_declared)) s), current_date);

  -- The same assessment as staff applications.
  v_result := fn_assess_application(v_app.id);
  -- The assessment marks the case under assessment; a referred case stays referred.
  UPDATE applications SET status = v_status WHERE id = v_app.id;

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (v_app.id, CASE WHEN v_staff IS NULL THEN 'AUTO_RUN_CHECKS' ELSE 'OFFICER_RUN_CHECKS' END,
          jsonb_build_object('bureau', (SELECT bureau_name FROM bureau_reports WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1),
                             'bank_read', v_bank_sal IS NOT NULL, 'slip_read', v_slip IS NOT NULL, 'form16_read', v_f16 IS NOT NULL,
                             'recommendation', (SELECT recommendation FROM recommendations WHERE application_id = v_app.id ORDER BY generated_at DESC LIMIT 1)),
          CASE WHEN v_staff IS NULL THEN 'SYSTEM' ELSE 'USER' END, v_staff);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_customer_checks_core(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. The generator
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_synthetic_version()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'synthetic-v1'::TEXT; $$;

-- Cars people actually finance, with ex-showroom prices (Rs, Oct 2026, approx).
CREATE OR REPLACE FUNCTION fn_synthetic_cars()
RETURNS TABLE (make TEXT, model TEXT, variant TEXT, fuel TEXT, ex_showroom INTEGER)
LANGUAGE sql
IMMUTABLE
AS $$
  VALUES
    ('Maruti Suzuki', 'Wagon R', 'VXi', 'PETROL', 600000),
    ('Maruti Suzuki', 'Swift', 'VXi', 'PETROL', 720000),
    ('Maruti Suzuki', 'Baleno', 'Zeta', 'PETROL', 820000),
    ('Maruti Suzuki', 'Dzire', 'ZXi', 'PETROL', 850000),
    ('Maruti Suzuki', 'Fronx', 'Delta+', 'PETROL', 900000),
    ('Maruti Suzuki', 'Brezza', 'ZXi', 'PETROL', 1150000),
    ('Maruti Suzuki', 'Ertiga', 'ZXi CNG', 'CNG', 1200000),
    ('Maruti Suzuki', 'Grand Vitara', 'Zeta+ Hybrid', 'HYBRID', 1750000),
    ('Hyundai', 'Grand i10 Nios', 'Sportz', 'PETROL', 700000),
    ('Hyundai', 'i20', 'Asta', 'PETROL', 950000),
    ('Hyundai', 'Venue', 'SX', 'PETROL', 1100000),
    ('Hyundai', 'Creta', 'SX', 'PETROL', 1500000),
    ('Hyundai', 'Verna', 'SX(O)', 'PETROL', 1550000),
    ('Tata', 'Punch', 'Accomplished', 'PETROL', 800000),
    ('Tata', 'Nexon', 'Creative', 'PETROL', 1100000),
    ('Tata', 'Nexon EV', 'Empowered', 'ELECTRIC', 1600000),
    ('Tata', 'Harrier', 'Fearless', 'DIESEL', 2200000),
    ('Mahindra', 'XUV 3XO', 'AX5', 'PETROL', 1100000),
    ('Mahindra', 'Scorpio-N', 'Z6', 'DIESEL', 1750000),
    ('Mahindra', 'XUV700', 'AX5', 'DIESEL', 2000000),
    ('Kia', 'Sonet', 'HTX', 'PETROL', 1100000),
    ('Kia', 'Seltos', 'HTX', 'PETROL', 1600000),
    ('Toyota', 'Hyryder', 'G Hybrid', 'HYBRID', 1800000),
    ('Toyota', 'Innova Hycross', 'VX', 'HYBRID', 2800000),
    ('Honda', 'Amaze', 'VX', 'PETROL', 900000),
    ('Honda', 'City', 'V', 'PETROL', 1350000)
$$;

CREATE OR REPLACE FUNCTION fn_synthetic_generate(p_batch INTEGER, p_size INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_m   TEXT[] := ARRAY['Rahul','Amit','Vikram','Suresh','Arjun','Karthik','Rohan','Sanjay','Manoj','Pradeep','Naveen','Harish','Rajesh','Vivek','Anil','Deepak','Ganesh','Kiran','Mohit','Nikhil'];
  first_f   TEXT[] := ARRAY['Priya','Anjali','Divya','Sneha','Kavya','Meera','Pooja','Lakshmi','Nisha','Shreya','Asha','Deepa','Swati','Rekha','Neha','Aparna','Bhavana','Sunita','Ritu','Isha'];
  last_n    TEXT[] := ARRAY['Sharma','Verma','Iyer','Reddy','Nair','Patel','Rao','Gupta','Kulkarni','Menon','Joshi','Singh','Das','Pillai','Shetty','Mishra','Bhat','Chopra','Desai','Naidu'];
  employers JSONB := '{"GOVERNMENT":["Government of Karnataka","Indian Railways","Central Board of Direct Taxes","Government of Maharashtra"],
                       "PSU":["Bharat Electronics Ltd","Indian Oil Corporation Ltd","State Bank of India","ONGC Ltd"],
                       "MNC":["Accenture Solutions Pvt Ltd","Siemens Ltd","Bosch Ltd","Cognizant Technology Solutions"],
                       "PUBLIC_LTD":["Infosys Ltd","Larsen and Toubro Ltd","Tata Consultancy Services Ltd","HCL Technologies Ltd"],
                       "PRIVATE_LTD":["Acme Motors Pvt Ltd","Zenith Software Pvt Ltd","Kaveri Foods Pvt Ltd","Orbit Logistics Pvt Ltd","Nimbus Health Pvt Ltd","Sterling Fabrics Pvt Ltd"]}';
  designations TEXT[] := ARRAY['Engineer','Senior Engineer','Manager','Analyst','Executive','Team Lead','Officer','Assistant Manager','Consultant','Accountant'];
  v_consent consent_texts%ROWTYPE;
  n         INTEGER;
  b         INTEGER[];
  x         INTEGER[];
  v_appid   TEXT;
  v_cust    UUID;
  v_app     UUID;
  v_female  BOOLEAN;
  v_first   TEXT;
  v_last    TEXT;
  v_age     INTEGER;
  v_dob     DATE;
  v_cat     TEXT;
  v_emp     TEXT;
  v_salary  INTEGER;
  v_state   RECORD;
  v_car     RECORD;
  v_onroad  INTEGER;
  v_tax     INTEGER;
  v_ins     INTEGER;
  v_loan    INTEGER;
  v_tenure  INTEGER;
  v_created TIMESTAMPTZ;
  v_stage   TEXT;
  v_emi     INTEGER;
  v_sum     JSONB;
  v_bank    JSONB;
  v_slip    NUMERIC;
  v_f16     NUMERIC;
  v_bsal    NUMERIC;
  v_src     NUMERIC[];
  v_var     NUMERIC;
  v_made    INTEGER := 0;
  v_skipped INTEGER := 0;
  v_counts  JSONB;
  i         INTEGER;
BEGIN
  IF p_batch < 1 OR p_size < 1 OR p_size > 500 THEN
    RAISE EXCEPTION 'batch from 1, size 1-500' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_consent FROM consent_texts WHERE purpose = 'BUREAU_PULL' AND is_current ORDER BY created_at DESC LIMIT 1;

  FOR i IN 1..p_size LOOP
    n := (p_batch - 1) * p_size + i;
    v_appid := 'SYN' || lpad(n::TEXT, 7, '0');
    IF EXISTS (SELECT 1 FROM applications WHERE application_id = v_appid) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    b := fn_sim_bytes('synthetic-v1:' || n, 'p');
    x := fn_sim_bytes('synthetic-v1:' || n, 'q');

    -- Who
    v_female := b[1] < 77;                                              -- ~30%
    v_first := CASE WHEN v_female THEN first_f[1 + b[2] % 20] ELSE first_m[1 + b[2] % 20] END;
    v_last := last_n[1 + b[3] % 20];
    v_age := 25 + floor((b[4] + b[5] + b[6]) / 766.0 * 31)::INTEGER;     -- 25-55, peak late 30s
    v_dob := (current_date - make_interval(years => v_age) - make_interval(days => b[7]))::DATE;
    v_cat := CASE WHEN b[8] < 38 THEN 'GOVERNMENT' WHEN b[8] < 51 THEN 'PSU' WHEN b[8] < 102 THEN 'MNC'
                  WHEN b[8] < 140 THEN 'PUBLIC_LTD' ELSE 'PRIVATE_LTD' END;
    v_emp := employers->v_cat->>(b[9] % jsonb_array_length(employers->v_cat));
    -- Take-home: 25k-250k, median about 75k.
    v_salary := (round(25000 * exp((b[10] + b[11] + b[12]) / 765.0 * 2.3) / 1000) * 1000)::INTEGER;
    SELECT code, name INTO v_state FROM states WHERE is_operating ORDER BY code
      OFFSET b[13] % greatest((SELECT count(*) FROM states WHERE is_operating), 1) LIMIT 1;

    -- The car: something they can afford (ex-showroom up to ~1.2 years of take-home).
    SELECT * INTO v_car FROM (
      SELECT c.*, row_number() OVER (ORDER BY c.ex_showroom, c.model) AS rn, count(*) OVER () AS cnt
      FROM fn_synthetic_cars() c WHERE c.ex_showroom <= v_salary * 12 * 1.2) s
    WHERE s.rn = 1 + b[14] % s.cnt;
    IF v_car.make IS NULL THEN
      SELECT * INTO v_car FROM fn_synthetic_cars() c ORDER BY c.ex_showroom LIMIT 1;
    END IF;
    v_tax := round(v_car.ex_showroom * 0.10);
    v_ins := round(v_car.ex_showroom * 0.045);
    v_onroad := v_car.ex_showroom + v_tax + v_ins + 15000;
    -- ~20% put about a fifth down; the rest borrow 90-100% of on-road.
    v_loan := (round(v_onroad * CASE WHEN b[15] < 51 THEN 0.8 ELSE 0.9 + b[16] / 255.0 * 0.1 END / 1000) * 1000)::INTEGER;
    v_tenure := CASE WHEN x[1] < 38 THEN 48 WHEN x[1] < 140 THEN 60 WHEN x[1] < 204 THEN 72 ELSE 84 END;
    v_created := now() - make_interval(days => 20 + (x[2] * 256 + x[3]) % 200, mins => x[4] * 5);
    v_stage := CASE WHEN x[5] < 13 THEN 'DRAFT' WHEN x[5] < 38 THEN 'SUBMITTED' ELSE 'ASSESSED' END;

    INSERT INTO customers (full_name, first_name, last_name, email, mobile, pan_number, date_of_birth, age_at_application,
                           gender, city, state_code, pincode, employer_name, employer_category, designation, date_of_joining,
                           email_verified, created_at)
    VALUES (v_first || ' ' || v_last, v_first, v_last, 'syn' || lpad(n::TEXT, 7, '0') || '@synthetic.invalid',
            '5550' || lpad(n::TEXT, 6, '0'),
            -- 5 letters, 4 digits, 1 letter; 4th letter X (no real holder type).
            chr(65 + b[2] % 26) || chr(65 + b[3] % 26) || chr(65 + b[5] % 26) || 'X' || chr(65 + b[6] % 26)
              || lpad((n % 10000)::TEXT, 4, '0') || chr(65 + b[7] % 26),
            v_dob, v_age, CASE WHEN v_female THEN 'FEMALE' ELSE 'MALE' END, v_state.name, v_state.code,
            (560001 + b[9] * 3)::TEXT, v_emp, v_cat, designations[1 + b[11] % 10],
            (current_date - make_interval(years => CASE WHEN v_cat IN ('GOVERNMENT', 'PSU') THEN 3 ELSE 1 END + b[12] % 12))::DATE,
            true, v_created)
    RETURNING id INTO v_cust;

    INSERT INTO applications (application_id, customer_id, status, loan_amount_requested, down_payment, tenure_months, purpose,
                              declared_net_salary, declared_existing_emis, state_code, channel, origin, created_at,
                              documents_submitted_at, customer_submitted_at)
    VALUES (v_appid, v_cust, CASE WHEN v_stage = 'DRAFT' THEN 'DRAFT' ELSE 'SUBMITTED' END, v_loan, v_onroad - v_loan, v_tenure,
            'NEW_CAR', v_salary, 0, v_state.code, 'DIRECT', 'SYNTHETIC', v_created,
            CASE WHEN v_stage <> 'DRAFT' THEN v_created + INTERVAL '1 hour' END,
            CASE WHEN v_stage <> 'DRAFT' THEN v_created + INTERVAL '1 hour' END)
    RETURNING id INTO v_app;

    INSERT INTO vehicles (application_id, make, model, variant, fuel_type, vehicle_category, ex_showroom_price, road_tax, insurance,
                          registration_charges, on_road_price, dealer_id, created_at)
    VALUES (v_app, v_car.make, v_car.model, v_car.variant, v_car.fuel, 'CAR', v_car.ex_showroom, v_tax, v_ins, 15000, v_onroad,
            (SELECT d.id FROM dealers d WHERE d.is_active AND d.make ILIKE '%' || split_part(v_car.make, ' ', 1) || '%'
             ORDER BY d.dealer_code OFFSET b[16] % greatest((SELECT count(*) FROM dealers d2 WHERE d2.is_active
                                                             AND d2.make ILIKE '%' || split_part(v_car.make, ' ', 1) || '%'), 1) LIMIT 1),
            v_created);

    IF v_stage <> 'DRAFT' THEN
      INSERT INTO customer_consents (customer_id, application_id, purpose, version, body_sha256, user_agent)
      VALUES (v_cust, v_app, v_consent.purpose, v_consent.version,
              encode(extensions.digest(v_consent.body, 'sha256'), 'hex'), 'synthetic-v1');
      PERFORM fn_bureau_pull_simulated(v_app, v_created + INTERVAL '1 day');

      -- What they declared as existing EMIs: mostly the bureau's figure, some under or over.
      SELECT instalment_emi INTO v_emi FROM bureau_summary WHERE application_id = v_app AND bureau = 'COMBINED';
      UPDATE applications SET declared_existing_emis = round(coalesce(v_emi, 0) *
               CASE WHEN x[6] < 199 THEN 1 WHEN x[6] < 225 THEN 0.8 WHEN x[6] < 243 THEN 0 ELSE 1.1 END / 100) * 100
      WHERE id = v_app;
      PERFORM fn_simulate_income_detail(v_app, (v_created + INTERVAL '1 day')::DATE);
    END IF;

    IF v_stage = 'ASSESSED' THEN
      -- The income assessment, as the credit checks build it (048), from the 054 detail.
      v_sum := fn_reading_summary(v_app);
      v_bank := v_sum->'bank';
      INSERT INTO bank_statement_analyses (application_id, customer_id, statement_from, statement_to, months_covered,
                                           avg_monthly_balance, avg_salary_credit, salary_regularity, bounce_count_6m, source)
      SELECT v_app, v_cust, ((v_created + INTERVAL '1 day')::DATE - make_interval(months => (v_bank->>'months')::INTEGER))::DATE,
             (v_created + INTERVAL '1 day')::DATE, (v_bank->>'months')::SMALLINT, (v_bank->>'avg_monthly_balance')::NUMERIC,
             (v_bank->>'avg_salary')::NUMERIC,
             CASE WHEN (v_bank->>'salary_count')::INTEGER >= (v_bank->>'months')::INTEGER THEN 'REGULAR' ELSE 'IRREGULAR' END,
             (v_bank->>'bounce_count')::SMALLINT, 'SIMULATED'
      WHERE jsonb_typeof(v_bank) = 'object';
      v_slip := nullif((v_sum->>'slip_net_salary')::NUMERIC, 0);
      v_f16 := nullif((v_sum->>'form16_annual')::NUMERIC, 0);
      v_bsal := nullif((v_bank->>'avg_salary')::NUMERIC, 0);
      v_src := array_remove(ARRAY[v_slip, v_bsal], NULL);   -- Form 16 is gross: recorded, not compared
      v_var := CASE WHEN cardinality(v_src) = 0 THEN NULL
                    ELSE round((SELECT max(abs(s - v_salary)) FROM unnest(v_src) s) / v_salary * 100, 2) END;
      INSERT INTO income_assessments (application_id, declared_net_salary, salary_slip_salary, bank_credit_salary,
                                      form16_annual_income, form16_monthly_equiv, income_variance_pct, income_variance_flag,
                                      eligible_net_salary, total_eligible_income, assessment_date)
      VALUES (v_app, v_salary, v_slip, v_bsal, v_f16, round(v_f16 / 12, 2), v_var, coalesce(v_var > 5, false),
              (SELECT min(s) FROM unnest(array_append(v_src, v_salary::NUMERIC)) s),
              (SELECT min(s) FROM unnest(array_append(v_src, v_salary::NUMERIC)) s), (v_created + INTERVAL '1 day')::DATE);

      PERFORM fn_assess_application(v_app);
      UPDATE applications
      SET approval_stage = CASE WHEN status = 'APPROVED' THEN CASE WHEN x[7] < 51 THEN 'IN_PRINCIPLE' ELSE 'FINAL' END END,
          final_decision_at = CASE WHEN status IN ('APPROVED', 'REJECTED') THEN v_created + INTERVAL '2 days' END,
          assessment_started_at = v_created + INTERVAL '1 day',
          created_at = v_created
      WHERE id = v_app;
    END IF;
    v_made := v_made + 1;
  END LOOP;

  SELECT jsonb_object_agg(s.status, s.cnt) INTO v_counts FROM (
    SELECT a.status, count(*) AS cnt FROM applications a WHERE a.origin = 'SYNTHETIC' GROUP BY a.status) s;
  RETURN jsonb_build_object('batch', p_batch, 'made', v_made, 'skipped', v_skipped, 'version', fn_synthetic_version(),
                            'synthetic_by_status', v_counts);
END;
$$;

-- Removes every synthetic customer and everything hanging off their applications.
CREATE OR REPLACE FUNCTION fn_synthetic_purge()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apps UUID[];
  v_custs UUID[];
  t TEXT;
  i INTEGER;
BEGIN
  SELECT array_agg(id), array_agg(DISTINCT customer_id) INTO v_apps, v_custs FROM applications WHERE origin = 'SYNTHETIC';
  IF v_apps IS NULL THEN
    RETURN jsonb_build_object('removed', 0);
  END IF;
  -- Every table whose application_id points at applications(id). Some point at each
  -- other too (credit_decisions -> recommendations), so a few passes clear them in order.
  FOR i IN 1..6 LOOP
    FOR t IN
      SELECT DISTINCT c.conrelid::regclass::TEXT
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'applications'::regclass AND a.attname = 'application_id'
        AND c.conrelid <> 'applications'::regclass
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %s WHERE application_id = ANY ($1)', t) USING v_apps;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;   -- something still points at these rows; the next pass clears it
      END;
    END LOOP;
  END LOOP;
  DELETE FROM applications WHERE id = ANY (v_apps);
  DELETE FROM customers WHERE id = ANY (v_custs)
    AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.customer_id = customers.id);
  RETURN jsonb_build_object('removed', cardinality(v_apps));
END;
$$;

REVOKE ALL ON FUNCTION fn_synthetic_version(), fn_synthetic_cars(), fn_synthetic_generate(INTEGER, INTEGER), fn_synthetic_purge()
  FROM PUBLIC, anon, authenticated;

-- Checks after running a batch:
-- SELECT status, approval_stage, count(*) FROM applications WHERE origin = 'SYNTHETIC' GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT round(avg(score)) AS avg_score, count(*) FILTER (WHERE no_hit) AS no_hit
--   FROM bureau_reports b JOIN applications a ON a.id = b.application_id WHERE a.origin = 'SYNTHETIC';
