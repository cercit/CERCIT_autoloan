-- =============================================================================
-- 073: Reset the practice cases to fresh (fix list D2)
-- =============================================================================
-- Visitors on the practice logins (072) take, check, decide and override
-- synthetic cases. fn_practice_reset() puts every case they touched back the
-- way it was before the first practice change (from practice_case_snapshots):
--   * the case's status, stage, owner and decision time;
--   * its credit decision, exactly as the engine (or an earlier officer) left it;
--   * overrides recorded by practice logins on it are removed;
--   * policy drafts written by practice logins are cancelled (versions are
--     never deleted, 016);
--   * cases still assigned to a practice login are let go.
-- The audit log keeps what the visitors did (it can't be changed); one
-- PRACTICE_RESET entry records the reset and its counts.
--
-- Operator only: run it in the SQL editor, or from the daily simulation
-- (G7) once switched on. Website and service logins cannot call it.
--
--   SELECT fn_practice_reset();
--
-- Run order: after 072. Safe to re-run (a second reset finds nothing to do).
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_practice_reset()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice UUID[];
  v_cases    INTEGER := 0;
  v_overrides INTEGER := 0;
  v_drafts   INTEGER := 0;
  v_released INTEGER := 0;
  s          practice_case_snapshots%ROWTYPE;
  v_ver      UUID;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'the practice reset is run by an operator, not from the website' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(u.id), '{}') INTO v_practice FROM users u JOIN roles r ON r.code = u.role WHERE r.is_practice;

  FOR s IN SELECT * FROM practice_case_snapshots LOOP
    DELETE FROM override_logs WHERE application_id = s.application_id;
    DELETE FROM credit_decisions WHERE application_id = s.application_id;
    IF s.decision IS NOT NULL THEN
      INSERT INTO credit_decisions SELECT * FROM jsonb_populate_record(NULL::credit_decisions, s.decision);
    END IF;
    UPDATE applications SET status = s.status, approval_stage = s.approval_stage,
           assigned_officer_id = s.assigned_officer_id, final_decision_at = s.final_decision_at, updated_at = now()
    WHERE id = s.application_id;
    v_cases := v_cases + 1;
  END LOOP;
  DELETE FROM practice_case_snapshots;

  DELETE FROM override_logs WHERE officer_id = ANY (v_practice);
  GET DIAGNOSTICS v_overrides = ROW_COUNT;

  UPDATE applications SET assigned_officer_id = NULL WHERE assigned_officer_id = ANY (v_practice);
  GET DIAGNOSTICS v_released = ROW_COUNT;

  FOR v_ver IN SELECT id FROM policy_versions WHERE authored_by = ANY (v_practice) AND status = 'DRAFT' LOOP
    PERFORM fn_policy_draft_discard(v_ver);
    v_drafts := v_drafts + 1;
  END LOOP;

  INSERT INTO audit_events (event_type, actor_type, event_detail)
  VALUES ('PRACTICE_RESET', 'SYSTEM', jsonb_build_object('cases_restored', v_cases, 'overrides_removed', v_overrides,
                                                         'cases_released', v_released, 'policy_drafts_cancelled', v_drafts));
  RETURN jsonb_build_object('cases_restored', v_cases, 'overrides_removed', v_overrides,
                            'cases_released', v_released, 'policy_drafts_cancelled', v_drafts);
END;
$$;

REVOKE ALL ON FUNCTION fn_practice_reset() FROM PUBLIC, anon, authenticated, service_role;

-- Check after running: SELECT fn_practice_reset();   -- counts; a second run gives zeros
