-- =============================================================================
-- 097: only the Credit Head changes a decided case, with a reason (24 Nov 2026)
-- =============================================================================
-- Found by Sameer as Credit Head on SYN0002540. Once a case was approved or
-- rejected, anyone with app.decide (officer, manager) could decide it again,
-- with no reason asked. The rule he set: changing a recorded decision needs a
-- reason, and only the Head may do it.
--
-- Now, in fn_officer_decision:
--   - a DISBURSED case can't be changed at all;
--   - an APPROVED or REJECTED case can be changed only by credit_head or
--     practice_head, with a reason of at least 10 characters (sent as remarks);
--   - not after the customer has accepted the offer (the terms are agreed);
--   - an offer issued but not yet accepted is withdrawn when the decision changes;
--   - every change is written to the audit trail as DECISION_CHANGED, with the
--     old and new decision and the reason.
-- Cases still in review (SUBMITTED, UNDER_REVIEW) work as before.
--
-- Numbering: the agreed loan rules planned as 097 move to 098.
-- How: the live function is patched in place (checked text changes), as 095.
-- Run order: after 096. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  d TEXT := pg_get_functiondef('fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure);
  n TEXT;
BEGIN
  IF d LIKE '%097: head changes decision%' THEN
    RAISE NOTICE '097 already applied';
    RETURN;
  END IF;

  n := regexp_replace(d, 'DECLARE', E'DECLARE\n  v_097_role TEXT;  -- 097: head changes decision\n  v_097_old  TEXT;', '');
  IF n = d THEN RAISE EXCEPTION '097: DECLARE not found'; END IF; d := n;

  n := regexp_replace(d, '(app_uuid := app_row\.id;)',
    E'\\1\n\n  -- 097: head changes decision. A decided case changes only by the Head, with a reason.\n  IF app_row.status = ''DISBURSED'' THEN\n    RAISE EXCEPTION ''This loan is already disbursed, so the decision can no longer be changed.'' USING ERRCODE = ''P0001'';\n  END IF;\n  IF app_row.status IN (''APPROVED'', ''REJECTED'') THEN\n    SELECT role INTO v_097_role FROM users WHERE id = v_actor;\n    IF coalesce(v_097_role, '''') NOT IN (''credit_head'', ''practice_head'') THEN\n      RAISE EXCEPTION ''This case is already decided. Only the Credit Head can change the decision.'' USING ERRCODE = ''42501'';\n    END IF;\n    IF length(trim(coalesce(p_remarks, ''''))) < 10 THEN\n      RAISE EXCEPTION ''Give a reason for changing the decision (at least 10 characters).'' USING ERRCODE = ''P0001'';\n    END IF;\n    IF EXISTS (SELECT 1 FROM loan_offers WHERE application_id = app_uuid AND status = ''ACCEPTED'') THEN\n      RAISE EXCEPTION ''The customer has already accepted the offer, so the decision can no longer be changed.'' USING ERRCODE = ''P0001'';\n    END IF;\n    v_097_old := CASE app_row.status WHEN ''APPROVED'' THEN ''APPROVE'' ELSE ''REJECT'' END;\n    UPDATE loan_offers SET status = ''WITHDRAWN'' WHERE application_id = app_uuid AND status = ''ISSUED'';\n    INSERT INTO audit_events (event_type, actor_type, actor_id, application_id, event_detail)\n    VALUES (''DECISION_CHANGED'', ''OFFICER'', v_actor, app_uuid, jsonb_build_object(\n      ''application_id'', p_application_id, ''from'', v_097_old, ''to'', upper(p_decision),\n      ''sanctioned_rate'', p_sanctioned_rate, ''reason'', trim(p_remarks),\n      ''message'', ''Credit Head changed the decision ('' || v_097_old || '' -> '' || upper(p_decision) || '')''));\n  END IF;', '');
  IF n = d THEN RAISE EXCEPTION '097: app_uuid line not found'; END IF; d := n;

  EXECUTE d;
END;
$$;

-- Check after running:
-- SELECT pg_get_functiondef('fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure) LIKE '%097: head changes decision%';   -- true
