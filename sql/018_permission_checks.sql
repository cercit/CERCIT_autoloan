-- cercit — server-side permission checks (backlog FD2.1, FD2.2)
--
-- Until now, role rights lived only in the browser (src/lib/auth.ts). This
-- script moves the check into the database: every function that reads or
-- changes loan data asks fn_require_permission() first.
--
-- Role → permission mapping is temporary. For the four existing roles it
-- mirrors ROLE_PERMISSIONS in src/lib/auth.ts exactly, so nothing that works
-- today stops working. The four new roles get their target rights from the
-- access-control policy. The Admin module replaces this function with real
-- role and permission tables.
--
-- Trusted callers: the Supabase SQL editor (no API role) and the service role
-- (server jobs) pass the check without a user, and are recorded as SYSTEM.
--
-- Run order: after 017. Safe to re-run. 019 applies the check to application
-- submission.

-- =============================================================================
-- 1. Who is calling
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_is_trusted_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  -- API calls always arrive with a JWT role (anon, authenticated, service_role)
  -- and connect as the authenticator login. Anything else is a direct
  -- database session, such as the SQL editor.
  SELECT nullif(auth.role(), '') = 'service_role'
      OR (nullif(auth.role(), '') IS NULL
          AND session_user NOT IN ('authenticator', 'anon', 'authenticated'));
$$;

CREATE OR REPLACE FUNCTION fn_role_permissions(p_role TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    -- Existing roles: same rights as src/lib/auth.ts today
    WHEN 'admin' THEN ARRAY[
      'app.view.all', 'app.create', 'app.evaluate', 'app.decide', 'app.override', 'pii.reveal',
      'user.view', 'user.manage', 'role.manage', 'audit.view', 'report.view', 'report.export']
    WHEN 'credit_officer' THEN ARRAY[
      'app.view.own', 'app.create', 'app.evaluate', 'app.decide', 'pii.reveal',
      'report.view', 'report.export']
    WHEN 'reviewer' THEN ARRAY[
      'app.view.team', 'app.override', 'pii.reveal', 'report.view', 'report.export']
    WHEN 'viewer' THEN ARRAY[
      'app.view.own', 'report.view', 'report.export']
    -- New roles: target rights (Vault/Policies/02-Access-Control-and-SoD)
    WHEN 'credit_manager' THEN ARRAY[
      'app.view.team', 'app.create', 'app.evaluate', 'app.decide', 'app.override', 'pii.reveal',
      'audit.view', 'report.view', 'report.export']
    WHEN 'credit_head' THEN ARRAY[
      'app.view.all', 'app.create', 'app.evaluate', 'app.decide', 'app.override', 'pii.reveal',
      'policy.view', 'policy.author', 'policy.approve', 'policy.simulate', 'policy.emergency',
      'pricing.view', 'pricing.author', 'pricing.approve',
      'model.view', 'model.propose', 'model.approve',
      'audit.view', 'report.view', 'report.export']
    WHEN 'policy_manager' THEN ARRAY[
      'app.view.aggregate',
      'policy.view', 'policy.author', 'policy.simulate',
      'pricing.view', 'pricing.author',
      'model.view', 'model.propose',
      'audit.view', 'report.view', 'report.export']
    WHEN 'compliance' THEN ARRAY[
      'app.view.all', 'pii.reveal', 'policy.view', 'policy.simulate', 'pricing.view', 'model.view',
      'consent.view', 'aml.review', 'grievance.handle',
      'audit.view', 'report.view', 'report.export']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

-- Returns the calling user's users.id, or NULL for a trusted operator.
-- Raises if nobody is logged in, the login has no active cercit user, or the
-- user's role lacks every permission listed.
CREATE OR REPLACE FUNCTION fn_require_any_permission(p_permissions TEXT[])
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role    TEXT;
BEGIN
  IF fn_is_trusted_operator() THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, role INTO v_user_id, v_role
  FROM users
  WHERE auth_user_id = auth.uid() AND is_active;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'no active cercit user for this login' USING ERRCODE = '42501';
  END IF;

  IF NOT (fn_role_permissions(v_role) && p_permissions) THEN
    RAISE EXCEPTION 'permission denied: %', array_to_string(p_permissions, ' or ') USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_require_permission(p_permission TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT fn_require_any_permission(ARRAY[p_permission]);
$$;

CREATE OR REPLACE FUNCTION fn_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  PERFORM fn_require_permission(p_permission);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- =============================================================================
-- 2. Officer decision — permission check, and the real actor on every record
-- =============================================================================
-- Same behaviour as 007, except: the caller needs app.decide, and the audit
-- event and override log name the caller instead of the first user in the table.

CREATE OR REPLACE FUNCTION fn_officer_decision(
  p_application_id TEXT,
  p_decision TEXT,
  p_remarks TEXT DEFAULT NULL,
  p_reason_codes TEXT[] DEFAULT NULL,
  p_sanctioned_amount DECIMAL DEFAULT NULL,
  p_sanctioned_rate DECIMAL DEFAULT NULL,
  p_sanctioned_tenure INTEGER DEFAULT NULL,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  app_uuid UUID;
  app_row RECORD;
  cd_row RECORD;
  new_status TEXT;
  v_emi DECIMAL;
  is_override BOOLEAN := false;
  ai_decision TEXT;
BEGIN
  v_actor := fn_require_permission('app.decide');

  SELECT id, status, loan_amount_requested, tenure_months
  INTO app_row
  FROM applications
  WHERE application_id = p_application_id;

  IF app_row IS NULL THEN
    RAISE EXCEPTION 'Application % not found', p_application_id;
  END IF;

  app_uuid := app_row.id;

  SELECT recommendation INTO ai_decision
  FROM recommendations
  WHERE application_id = app_uuid
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT id, recommendation_id INTO cd_row
  FROM credit_decisions
  WHERE application_id = app_uuid
  ORDER BY created_at DESC
  LIMIT 1;

  CASE upper(p_decision)
    WHEN 'APPROVE' THEN new_status := 'APPROVED';
    WHEN 'REJECT'  THEN new_status := 'REJECTED';
    WHEN 'MAYBE'   THEN new_status := 'UNDER_REVIEW';
    ELSE RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END CASE;

  p_sanctioned_amount := coalesce(p_sanctioned_amount, app_row.loan_amount_requested);
  p_sanctioned_rate   := coalesce(p_sanctioned_rate, 8.99);
  p_sanctioned_tenure := coalesce(p_sanctioned_tenure, app_row.tenure_months);

  IF upper(p_decision) = 'APPROVE' AND p_sanctioned_amount > 0 AND p_sanctioned_rate > 0 AND p_sanctioned_tenure > 0 THEN
    DECLARE
      monthly_rate DECIMAL := p_sanctioned_rate / 100.0 / 12.0;
      n INTEGER := p_sanctioned_tenure;
    BEGIN
      v_emi := p_sanctioned_amount * monthly_rate * power(1 + monthly_rate, n) / (power(1 + monthly_rate, n) - 1);
    END;
  END IF;

  IF ai_decision IS NOT NULL AND upper(p_decision) != upper(ai_decision) THEN
    is_override := true;
  END IF;

  IF cd_row IS NOT NULL THEN
    UPDATE credit_decisions SET
      decision           = upper(p_decision),
      decided_by         = 'OFFICER',
      sanctioned_amount  = p_sanctioned_amount,
      sanctioned_rate    = p_sanctioned_rate,
      sanctioned_tenure  = p_sanctioned_tenure,
      sanctioned_emi     = v_emi,
      reason_codes       = p_reason_codes,
      officer_remarks    = p_remarks,
      decided_at         = now()
    WHERE id = cd_row.id;
  ELSE
    INSERT INTO credit_decisions (
      application_id, recommendation_id, decision, decided_by,
      sanctioned_amount, sanctioned_rate, sanctioned_tenure, sanctioned_emi,
      reason_codes, officer_remarks
    ) VALUES (
      app_uuid,
      (SELECT id FROM recommendations WHERE application_id = app_uuid ORDER BY created_at DESC LIMIT 1),
      upper(p_decision), 'OFFICER',
      p_sanctioned_amount, p_sanctioned_rate, p_sanctioned_tenure, v_emi,
      p_reason_codes, p_remarks
    );
  END IF;

  UPDATE applications SET
    status            = new_status,
    final_decision_at = now()
  WHERE id = app_uuid;

  IF is_override AND cd_row IS NOT NULL THEN
    INSERT INTO override_logs (
      application_id, decision_id, officer_id, override_type,
      original_value, new_value, reason
    ) VALUES (
      app_uuid,
      cd_row.id,
      v_actor,
      'DECISION_OVERRIDE',
      coalesce(ai_decision, 'UNKNOWN'),
      upper(p_decision),
      coalesce(p_override_reason, p_remarks, 'Officer override')
    );
  END IF;

  INSERT INTO audit_events (
    event_type, actor_type, actor_id, application_id, event_detail
  ) VALUES (
    'OFFICER_DECISION',
    CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END,
    v_actor,
    app_uuid,
    jsonb_build_object(
      'application_id', p_application_id,
      'decision', upper(p_decision),
      'is_override', is_override,
      'ai_recommendation', ai_decision,
      'sanctioned_amount', p_sanctioned_amount,
      'sanctioned_rate', p_sanctioned_rate,
      'remarks', p_remarks,
      'message', 'Officer ' ||
        CASE WHEN is_override THEN 'overrode AI (' || coalesce(ai_decision, '?') || ' -> ' || upper(p_decision) || ')'
             ELSE 'confirmed AI recommendation (' || upper(p_decision) || ')' END
    )
  );

  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'decision', upper(p_decision),
    'status', new_status,
    'is_override', is_override,
    'sanctioned_amount', p_sanctioned_amount,
    'sanctioned_rate', p_sanctioned_rate,
    'sanctioned_tenure', p_sanctioned_tenure,
    'sanctioned_emi', v_emi,
    'message', CASE upper(p_decision)
      WHEN 'APPROVE' THEN 'Application approved at ' || p_sanctioned_rate || '%'
      WHEN 'REJECT'  THEN 'Application rejected'
      WHEN 'MAYBE'   THEN 'Application referred for manager review'
    END
  );
END;
$$;

-- =============================================================================
-- 3. Application list — staff only (masked PAN / mobile as in 012)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_list_applications()
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
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Narrowing "own" and "team" to the caller's cases comes with the Admin
  -- module's scopes; for now any view permission sees the list, as today.
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);

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
    a.loan_amount_requested,
    a.tenure_months,
    a.declared_net_salary,
    v.make AS vehicle_make,
    v.model AS vehicle_model,
    v.variant AS vehicle_variant,
    v.ex_showroom_price,
    v.on_road_price,
    d.dealer_name,
    br.score AS cibil_score,
    cd.decision,
    cd.sanctioned_rate AS rate,
    r.foir_calculated AS foir_pct,
    r.ltv_calculated AS ltv_pct,
    u.full_name AS officer_name,
    a.created_at
  FROM applications a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN vehicles v ON v.application_id = a.id
  LEFT JOIN dealers d ON d.id = v.dealer_id
  LEFT JOIN bureau_reports br ON br.application_id = a.id
  LEFT JOIN credit_decisions cd ON cd.application_id = a.id
  LEFT JOIN recommendations r ON r.application_id = a.id
  LEFT JOIN users u ON u.id = a.assigned_officer_id
  ORDER BY a.created_at DESC;
END;
$$;

-- =============================================================================
-- 4. PII reveal — same rule, now through the shared check
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_pii(p_customer_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TABLE (pan_number TEXT, mobile TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := fn_require_permission('pii.reveal');

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (
    'PII_REVEAL',
    CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END,
    v_actor,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'reason', COALESCE(p_reason, 'not stated')
    )
  );

  RETURN QUERY
  SELECT fn_pii_decrypt(c.pan_enc), fn_pii_decrypt(c.mobile_enc)
  FROM customers c
  WHERE c.id = p_customer_id;
END;
$$;

-- =============================================================================
-- 5. Who may call what through the API
-- =============================================================================
-- Postgres lets everyone execute new functions unless told otherwise, and
-- Supabase also grants execute to anon and authenticated by default. Internal
-- steps of the pipeline are closed to the API; they still run when called from
-- inside the functions above, which execute with their owner's rights.

REVOKE EXECUTE ON FUNCTION fn_officer_decision(TEXT, TEXT, TEXT, TEXT[], DECIMAL, DECIMAL, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_officer_decision(TEXT, TEXT, TEXT, TEXT[], DECIMAL, DECIMAL, INTEGER, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION fn_list_applications() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_list_applications() TO authenticated;

REVOKE EXECUTE ON FUNCTION fn_customer_pii(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_customer_pii(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION fn_create_application(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_assess_application(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_run_policy_engine(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_generate_recommendation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_in_principle_check(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_generate_application_id() FROM PUBLIC, anon, authenticated;
