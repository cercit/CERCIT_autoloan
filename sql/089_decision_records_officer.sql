-- =============================================================================
-- 089: a credit decision records who made it (9 Oct 2026)
-- =============================================================================
-- Seen on SYN0000910 (3 Oct): the override row named the officer, but the
-- decision row itself had officer_id empty. fn_officer_decision knew the
-- person (v_actor) and never wrote it on credit_decisions. Now it does, on
-- both the update and the insert. Patched in place; nothing else changes.
--
-- Run order: after 088. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  sig REGPROCEDURE := 'fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure;
  d TEXT := pg_get_functiondef(sig);
  n TEXT;
BEGIN
  IF d LIKE '%089: who decided%' THEN
    RAISE NOTICE '089 already applied';
    RETURN;
  END IF;

  n := regexp_replace(d, '(decided_by\s*=\s*''OFFICER'',)', E'\\1\n      officer_id         = v_actor,  -- 089: who decided');
  IF n = d THEN RAISE EXCEPTION '089: update not found'; END IF; d := n;

  n := regexp_replace(d, '(application_id, recommendation_id, decision, decided_by),', E'\\1, officer_id,');
  IF n = d THEN RAISE EXCEPTION '089: insert columns not found'; END IF; d := n;

  n := regexp_replace(d, '(upper\(p_decision\), ''OFFICER''),', E'\\1, v_actor,');
  IF n = d THEN RAISE EXCEPTION '089: insert values not found'; END IF; d := n;

  EXECUTE d;
END;
$$;

-- Check after running:
-- SELECT pg_get_functiondef('fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure) LIKE '%089: who decided%';  -- true
