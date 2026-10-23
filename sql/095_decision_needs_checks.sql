-- =============================================================================
-- 095: deciding a case the credit checks never ran on (23 Oct 2026)
-- =============================================================================
-- Found by Sameer as Credit Head on SYN0002230: "Failed to submit decision".
-- The case was submitted (by the daily simulation) but never assessed, so it
-- had no engine recommendation. fn_officer_decision then tried to write a
-- credit_decisions row with recommendation_id NULL and the database refused
-- (23502). The screen only said "Failed to submit decision".
--
-- Now: when a case has no recommendation, the decision step runs the credit
-- checks (fn_assess_application) and stops there, without recording the
-- decision. It returns decision_recorded = false and the engine's
-- recommendation, so the officer sees the result before deciding: a decision
-- always stands on a recommendation, and an override is a choice made knowingly.
-- The checks are kept (no error is raised, so nothing rolls back).
-- The screen now shows the real reason whenever a decision fails.
--
-- How: the live function is patched in place (checked text changes), as 088/089.
-- Run order: after 094. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  d TEXT := pg_get_functiondef('fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure);
  n TEXT;
BEGIN
  IF d LIKE '%095: checks first%' THEN
    RAISE NOTICE '095 already applied';
    RETURN;
  END IF;

  -- a variable for the fresh recommendation
  n := regexp_replace(d, 'DECLARE', E'DECLARE\n  v_095_rec TEXT;  -- 095: checks first', '');
  IF n = d THEN RAISE EXCEPTION '095: DECLARE not found'; END IF; d := n;

  -- run the checks when there is no recommendation, then hand the result back
  n := regexp_replace(d, '(\s*SELECT recommendation INTO ai_decision)',
    E'\n\n  -- 095: checks first. No recommendation yet: run the credit checks and stop, so the officer\n  -- sees the engine''s result before the decision is recorded.\n  IF NOT EXISTS (SELECT 1 FROM recommendations WHERE application_id = app_uuid) THEN\n    PERFORM fn_assess_application(app_uuid);\n    SELECT recommendation INTO v_095_rec FROM recommendations WHERE application_id = app_uuid ORDER BY created_at DESC LIMIT 1;\n    IF v_095_rec IS NULL THEN\n      RAISE EXCEPTION ''The credit checks could not run on this case, so there is no recommendation to decide against. Check the bureau, income and bank details, then try again.'' USING ERRCODE = ''P0001'';\n    END IF;\n    RETURN jsonb_build_object(\n      ''application_id'', p_application_id, ''decision_recorded'', false, ''checks_run'', true,\n      ''engine_recommendation'', v_095_rec,\n      ''message'', ''The credit checks had not run on this case. They have now: the engine recommends '' || v_095_rec || ''. Review the result, then decide again.'');\n  END IF;\\1', '');
  IF n = d THEN RAISE EXCEPTION '095: recommendation lookup not found'; END IF; d := n;

  EXECUTE d;
END;
$$;

-- Check after running:
-- SELECT pg_get_functiondef('fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure) LIKE '%095: checks first%';   -- true
