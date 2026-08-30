-- cercit — Officer decision RPC
-- Lets a loan officer approve, reject, or refer an application
-- Updates credit_decisions, sets application status, logs audit event
-- Creates override_log if officer decision differs from AI recommendation
-- SECURITY DEFINER bypasses RLS so anon can call it
-- Run in Supabase SQL Editor after 006

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
AS $$
DECLARE
  app_uuid UUID;
  app_row RECORD;
  rec_row RECORD;
  cd_row RECORD;
  new_status TEXT;
  v_emi DECIMAL;
  is_override BOOLEAN := false;
  ai_decision TEXT;
BEGIN
  -- Look up the application by display ID
  SELECT id, status, loan_amount_requested, tenure_months
  INTO app_row
  FROM applications
  WHERE application_id = p_application_id;

  IF app_row IS NULL THEN
    RAISE EXCEPTION 'Application % not found', p_application_id;
  END IF;

  app_uuid := app_row.id;

  -- Get the AI recommendation for override detection
  SELECT recommendation INTO ai_decision
  FROM recommendations
  WHERE application_id = app_uuid
  ORDER BY created_at DESC
  LIMIT 1;

  -- Get the existing credit_decision row
  SELECT id, recommendation_id INTO cd_row
  FROM credit_decisions
  WHERE application_id = app_uuid
  ORDER BY created_at DESC
  LIMIT 1;

  -- Map decision to application status
  CASE upper(p_decision)
    WHEN 'APPROVE' THEN new_status := 'APPROVED';
    WHEN 'REJECT'  THEN new_status := 'REJECTED';
    WHEN 'MAYBE'   THEN new_status := 'UNDER_REVIEW';
    ELSE RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END CASE;

  -- Use provided values or fall back to what the application already has
  p_sanctioned_amount := coalesce(p_sanctioned_amount, app_row.loan_amount_requested);
  p_sanctioned_rate   := coalesce(p_sanctioned_rate, 8.99);
  p_sanctioned_tenure := coalesce(p_sanctioned_tenure, app_row.tenure_months);

  -- Calculate EMI for approved loans
  IF upper(p_decision) = 'APPROVE' AND p_sanctioned_amount > 0 AND p_sanctioned_rate > 0 AND p_sanctioned_tenure > 0 THEN
    DECLARE
      monthly_rate DECIMAL := p_sanctioned_rate / 100.0 / 12.0;
      n INTEGER := p_sanctioned_tenure;
    BEGIN
      v_emi := p_sanctioned_amount * monthly_rate * power(1 + monthly_rate, n) / (power(1 + monthly_rate, n) - 1);
    END;
  END IF;

  -- Check if this is an override
  IF ai_decision IS NOT NULL AND upper(p_decision) != upper(ai_decision) THEN
    is_override := true;
  END IF;

  -- Update or insert credit_decision
  IF cd_row IS NOT NULL THEN
    UPDATE credit_decisions SET
      decision           = upper(p_decision),
      decided_by         = 'OFFICER',
      sanctioned_amount  = p_sanctioned_amount,
      sanctioned_rate    = p_sanctioned_rate,
      sanctioned_tenure  = p_sanctioned_tenure,
      sanctioned_emi = v_emi,
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

  -- Update application status
  UPDATE applications SET
    status           = new_status,
    final_decision_at = now()
  WHERE id = app_uuid;

  -- Log override if decision differs from AI
  IF is_override AND cd_row IS NOT NULL THEN
    INSERT INTO override_logs (
      application_id, decision_id, officer_id, override_type,
      original_value, new_value, reason
    ) VALUES (
      app_uuid,
      cd_row.id,
      (SELECT id FROM users LIMIT 1),
      'DECISION_OVERRIDE',
      coalesce(ai_decision, 'UNKNOWN'),
      upper(p_decision),
      coalesce(p_override_reason, p_remarks, 'Officer override')
    );
  END IF;

  -- Audit event
  INSERT INTO audit_events (
    event_type, actor_type, actor_id, application_id, event_detail
  ) VALUES (
    'OFFICER_DECISION',
    'OFFICER',
    (SELECT id FROM users LIMIT 1),
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
        CASE WHEN is_override THEN 'overrode AI (' || coalesce(ai_decision,'?') || ' -> ' || upper(p_decision) || ')'
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

GRANT EXECUTE ON FUNCTION fn_officer_decision TO anon;
