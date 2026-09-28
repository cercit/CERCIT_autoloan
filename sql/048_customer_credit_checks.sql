-- cercit — credit checks on customer applications (28 Sep 2026, reconcile list R21)
--
-- The policy engine reads four things for an application: the vehicle, a
-- bureau report, a bank-statement analysis and an income check. Staff-created
-- applications get these from the staff form. For a customer application the
-- officer presses "Run credit checks" and this migration fills them in:
--
--   * vehicle      — copied from the customer's quotation details
--   * bureau       — a SIMULATED bureau pull (no bureau API in this demo; the
--                    same PAN always gets the same report, clearly marked as
--                    simulated, like the simulated mobile OTP). A real report
--                    already on file is kept.
--   * bank, income — what the document readers found, gathered by the
--                    officer's screen and passed in; anything the readers
--                    could not find is left empty, never made up
--
-- then runs the same assessment as staff applications (fn_assess_application),
-- which writes the recommendation the officer's decision is checked against.
-- Approving a customer application now needs that recommendation.
--
-- Also: step 4 now asks for the EMIs the customer already pays (the Work group).
--
-- Run order: after 047. Safe to re-run.

-- =============================================================================
-- 1. Existing EMIs from step 4
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_detail_groups_emis()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emis NUMERIC;
BEGIN
  IF NEW.group_code <> 'EMPLOYMENT' THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_emis := nullif(NEW.confirmed->>'existing_emis', '')::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'enter the EMIs you pay each month in rupees, or 0' USING ERRCODE = '22023';
  END;
  IF v_emis IS NULL OR v_emis < 0 OR v_emis > 10000000 THEN
    RAISE EXCEPTION 'enter the EMIs you pay each month in rupees, or 0' USING ERRCODE = '22023';
  END IF;
  UPDATE applications SET declared_existing_emis = round(v_emis, 2) WHERE id = NEW.application_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detail_groups_emis ON application_detail_groups;
CREATE TRIGGER trg_detail_groups_emis
  BEFORE INSERT OR UPDATE ON application_detail_groups
  FOR EACH ROW EXECUTE FUNCTION trg_detail_groups_emis();

-- =============================================================================
-- 2. Simulated bureau report
-- =============================================================================
-- Deterministic from the customer's PAN blind index, so re-running gives the
-- same report. Shape follows the portfolio the product is built for: most
-- scores 700–820, a tail below 650, about 3 in 100 with no bureau record.

CREATE OR REPLACE FUNCTION fn_simulated_bureau(p_customer UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed  BYTEA;
  v_score INTEGER;
  v_accts INTEGER;
  v_emi   NUMERIC;
  v_dpd   INTEGER;
  b       INTEGER[] := '{}';
BEGIN
  SELECT decode(md5(coalesce(pan_hash, id::TEXT) || ':bureau-sim-v1'), 'hex') INTO v_seed FROM customers WHERE id = p_customer;
  IF v_seed IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;
  FOR i IN 0..15 LOOP
    b := b || get_byte(v_seed, i);
  END LOOP;

  IF b[1] < 8 THEN   -- about 3%: no record at either bureau
    RETURN jsonb_build_object('hit', false);
  END IF;

  -- Sum of four bytes is roughly bell-shaped; centre 745, spread about 55 points.
  v_score := greatest(300, least(900, round(745 + ((b[2] + b[3] + b[4] + b[5]) / 1020.0 - 0.5) / 0.144 * 55)::INTEGER));
  v_accts := b[6] % 5;
  v_emi := CASE WHEN v_accts = 0 THEN 0 ELSE v_accts * (2500 + b[7] * 30) END;
  v_dpd := CASE WHEN v_score < 650 AND b[8] < 128 THEN 30 * (1 + b[9] % 3)
                WHEN v_score < 700 AND b[8] < 40 THEN 30
                ELSE 0 END;

  RETURN jsonb_build_object(
    'hit', true,
    'score', v_score,
    'active_accounts', v_accts,
    'total_monthly_emi', v_emi,
    'total_outstanding', v_emi * (12 + b[10] % 36),
    'dpd_max_12m', v_dpd,
    'dpd_max_24m', greatest(v_dpd, CASE WHEN b[11] < 30 THEN 30 ELSE 0 END),
    'dpd_30_count_24m', CASE WHEN v_dpd > 0 THEN 1 + b[12] % 3 ELSE 0 END,
    'dpd_60_plus_flag', v_dpd >= 60,
    'enquiry_count_90d', b[13] % (CASE WHEN v_score < 700 THEN 9 ELSE 4 END),
    'writeoff_count_5y', CASE WHEN v_score < 600 AND b[14] < 90 THEN 1 ELSE 0 END,
    'settled_count_5y', CASE WHEN v_score < 680 AND b[15] < 40 THEN 1 ELSE 0 END,
    'credit_utilization_pct', round(least(95, 8 + b[16] / 255.0 * 60 + CASE WHEN v_score < 700 THEN 25 ELSE 0 END), 1),
    'oldest_account_months', 6 + (b[10] * 7 + b[12]) % 150);
END;
$$;

-- =============================================================================
-- 3. Run the credit checks
-- =============================================================================
-- p_read: what the document readers found, from the officer's screen:
--   {"slip_net_salary": 85400, "form16_annual": 1150000,
--    "bank": {"avg_monthly_balance": 62000, "avg_salary": 85400, "salary_count": 6,
--             "months": 6, "emi_total": 9800, "bounce_count": 0}}

CREATE OR REPLACE FUNCTION fn_staff_customer_run_checks(p_application_id TEXT, p_read JSONB DEFAULT '{}'::jsonb)
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
  v_staff := fn_require_permission('app.evaluate');
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER' FOR UPDATE;
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

  -- Bureau: keep a real report if there is one; otherwise the simulated pull, once.
  IF NOT EXISTS (SELECT 1 FROM bureau_reports WHERE application_id = v_app.id) THEN
    v_bureau := fn_simulated_bureau(v_app.customer_id);
    INSERT INTO bureau_reports (application_id, customer_id, bureau_name, score, score_date, active_accounts, total_outstanding,
                                total_monthly_emi, dpd_max_12m, dpd_max_24m, dpd_30_count_24m, dpd_60_plus_flag,
                                enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct,
                                oldest_account_months, report_raw_path, extracted_at)
    VALUES (v_app.id, v_app.customer_id, 'CIBIL-SIMULATED', (v_bureau->>'score')::SMALLINT, current_date,
            (v_bureau->>'active_accounts')::SMALLINT, (v_bureau->>'total_outstanding')::NUMERIC, (v_bureau->>'total_monthly_emi')::NUMERIC,
            (v_bureau->>'dpd_max_12m')::SMALLINT, (v_bureau->>'dpd_max_24m')::SMALLINT, (v_bureau->>'dpd_30_count_24m')::SMALLINT,
            (v_bureau->>'dpd_60_plus_flag')::BOOLEAN, (v_bureau->>'enquiry_count_90d')::SMALLINT, (v_bureau->>'writeoff_count_5y')::SMALLINT,
            (v_bureau->>'settled_count_5y')::SMALLINT, (v_bureau->>'credit_utilization_pct')::NUMERIC,
            (v_bureau->>'oldest_account_months')::SMALLINT, 'simulated', now());
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

  -- Income: declared, slip, bank and Form 16, and how far apart they are.
  v_declared := v_app.declared_net_salary;
  v_slip := nullif((p_read->>'slip_net_salary')::NUMERIC, 0);
  v_f16 := nullif((p_read->>'form16_annual')::NUMERIC, 0);
  v_sources := array_remove(ARRAY[v_slip, v_bank_sal, round(v_f16 / 12, 2)], NULL);
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
  VALUES (v_app.id, 'OFFICER_RUN_CHECKS',
          jsonb_build_object('bureau', (SELECT bureau_name FROM bureau_reports WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1),
                             'bank_read', v_bank_sal IS NOT NULL, 'slip_read', v_slip IS NOT NULL, 'form16_read', v_f16 IS NOT NULL,
                             'recommendation', (SELECT recommendation FROM recommendations WHERE application_id = v_app.id ORDER BY generated_at DESC LIMIT 1)),
          'USER', v_staff);

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 4. The case view shows the checks; approving needs them
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_staff_customer_checks(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT id INTO v_app FROM applications WHERE application_id = p_application_id AND origin = 'CUSTOMER';
  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'bureau', (SELECT to_jsonb(b) - 'id' - 'application_id' - 'customer_id' FROM bureau_reports b WHERE application_id = v_app ORDER BY created_at DESC LIMIT 1),
    'bank', (SELECT to_jsonb(k) - 'id' - 'application_id' - 'customer_id' FROM bank_statement_analyses k WHERE application_id = v_app ORDER BY created_at DESC LIMIT 1),
    'income', (SELECT to_jsonb(i) - 'id' - 'application_id' FROM income_assessments i WHERE application_id = v_app ORDER BY created_at DESC LIMIT 1),
    'recommendation', (SELECT to_jsonb(r) - 'id' - 'application_id' FROM recommendations r WHERE application_id = v_app ORDER BY generated_at DESC LIMIT 1),
    'declared_existing_emis', (SELECT declared_existing_emis FROM applications WHERE id = v_app));
END;
$$;

-- Approving without the credit checks is refused. Checked before the 047 action runs.
CREATE OR REPLACE FUNCTION fn_staff_customer_decide_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origin = 'CUSTOMER' AND NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED'
     AND NOT EXISTS (SELECT 1 FROM recommendations WHERE application_id = NEW.id) THEN
    RAISE EXCEPTION 'run the credit checks before approving' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_approve_needs_checks ON applications;
CREATE TRIGGER trg_customer_approve_needs_checks
  BEFORE UPDATE OF status ON applications
  FOR EACH ROW EXECUTE FUNCTION fn_staff_customer_decide_guard();

REVOKE ALL ON FUNCTION fn_simulated_bureau(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_run_checks(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_run_checks(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION fn_staff_customer_checks(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_customer_checks(TEXT) TO authenticated;

-- Checks after running:
-- SELECT bureau_name, count(*) FROM bureau_reports GROUP BY 1;
