-- RUN-ME 9 Oct 2026: 088 (missing bank/income data refers) and 089 (decision records the officer). Both tested; safe to re-run.

-- =============================================================================
-- 088: missing bank or income data sends the case to a person (audit A3, 9 Oct 2026)
-- =============================================================================
-- Before: in fn_run_policy_engine a rule whose data was missing was marked
-- SKIPPED and counted as passed, so a case with no bank statement analysis or
-- no income check could be recommended APPROVE. 053 already referred a case
-- with no bureau score; bank and income weren't covered. And the "average
-- balance vs EMI" rule read 100% (a pass) when there was no bank analysis.
--
-- Now:
--   * no bank analysis, or no income check (with a bureau score): the case is
--     referred (MAYBE) with one MISSING_DATA line naming what is missing, e.g.
--     "Data missing: bank statement analysis". Never an automatic reject.
--   * "average balance vs EMI" with no bank analysis is missing, not 100%.
--
-- Not changed (a decision for Sameer): "Name match across docs" (KYC-NAME)
-- is skipped on almost every case because nothing fills name_match_score;
-- the document cross-checks match names instead. Feed it, or retire the rule.
--
-- How: the live function is patched in place (small text changes, each
-- checked), so everything else in it stays exactly as it is.
--
-- Run order: after 087. Safe to re-run (a second run finds it already patched).
-- =============================================================================

DO $$
DECLARE
  d TEXT := pg_get_functiondef('fn_run_policy_engine(uuid)'::regprocedure);
  n TEXT;
BEGIN
  IF d LIKE '%088 (audit A3)%' THEN
    RAISE NOTICE '088 already applied';
    RETURN;
  END IF;

  -- 1. no bank analysis: the balance rule is missing, not a pass
  n := regexp_replace(d, 'actual_val := 100;', 'actual_val := CASE WHEN bank.min_amb_5dates IS NULL THEN NULL ELSE 100 END;');
  IF n = d THEN RAISE EXCEPTION '088: balance default not found'; END IF; d := n;

  -- 2. missing bank analysis or income check (with a bureau score) refers the case
  n := regexp_replace(d, '(\s*-- Update application status)', E'\n\n  -- 088 (audit A3): no bank analysis or no income check: the case goes to a person.\n  IF bureau.score IS NOT NULL AND (bank.application_id IS NULL OR income.application_id IS NULL) THEN\n    flagged_count := flagged_count + 1;\n    has_maybe := true;\n    results := results || jsonb_build_array(jsonb_build_object(\n      ''rule_id'', ''MISSING_DATA'',\n      ''rule_name'', ''Data missing: '' || concat_ws('', '', CASE WHEN bank.application_id IS NULL THEN ''bank statement analysis'' END, CASE WHEN income.application_id IS NULL THEN ''income check'' END),\n      ''result'', ''FAIL'', ''actual'', NULL, ''threshold'', NULL, ''severity'', ''MAYBE'', ''reason_code'', ''MISSING_DATA''));\n  END IF;\\1');
  IF n = d THEN RAISE EXCEPTION '088: status update not found'; END IF; d := n;

  EXECUTE d;
END;
$$;

-- Check after running:
-- SELECT pg_get_functiondef('fn_run_policy_engine(uuid)'::regprocedure) LIKE '%088 (audit A3)%';   -- true

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

-- Result: both true
SELECT pg_get_functiondef('fn_run_policy_engine(uuid)'::regprocedure) LIKE '%088 (audit A3)%' AS a3_088, pg_get_functiondef('fn_officer_decision(text,text,text,text[],numeric,numeric,integer,text)'::regprocedure) LIKE '%089: who decided%' AS officer_089;
