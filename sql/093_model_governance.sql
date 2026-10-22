-- =============================================================================
-- 093: AI model governance (R9, 22 Oct 2026)
-- =============================================================================
-- RBI's draft guidance on model risk (June 2026) asks lenders to keep an
-- inventory of their models, validate them, watch them in use and be able to
-- stop them. This adds the pieces cercit was missing:
--
--   * Inventory: model_versions gains what was trained on, the test results,
--     and who validated it and when. v1 and v2 are filled in. A model can now
--     also be SHADOW: scored on every case and saved, but never shown.
--   * Saved scores: model_scores keeps every score a model gives a case (the
--     live one and any shadow/challenger), so the two can be compared later
--     on the same customers. Before this the score lived only in the browser.
--   * Comparison: fn_model_comparison(months) shows, per model, how many cases
--     it scored and, for loans at least that many months on the book, the
--     average predicted chance of going 30+ days late against what happened,
--     overall and by grade.
--   * Kill switch: model_controls.scores_shown. Off: officers see "risk score
--     switched off" instead of a score. Only someone with model.approve (the
--     Admin) can switch it, with a reason; each change is audited.
--
-- The model still never decides: rules decide, an officer signs off.
-- Run order: after 092. Safe to re-run.
-- =============================================================================

-- 1. Inventory -----------------------------------------------------------------
ALTER TABLE model_versions
  ADD COLUMN IF NOT EXISTS trained_on      TEXT,
  ADD COLUMN IF NOT EXISTS metrics         JSONB,
  ADD COLUMN IF NOT EXISTS validated_by    UUID,
  ADD COLUMN IF NOT EXISTS validated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_note TEXT;

ALTER TABLE model_versions DROP CONSTRAINT IF EXISTS ck_model_versions_status;
ALTER TABLE model_versions ADD CONSTRAINT ck_model_versions_status
  CHECK (status IN ('ACTIVE', 'SHADOW', 'RETIRED'));

UPDATE model_versions SET
  trained_on = '10,000 synthetic rows, each feature drawn on its own (scripts/generate-training-data.ts)',
  metrics = '{"auc": 0.754, "brier": 0.0155, "pr_auc": 0.085, "test_rows": 4249, "test_note": "scored on v2''s test files, 2 Oct 2026"}'
WHERE model_version = 'cercit-risk-v1' AND metrics IS NULL;
UPDATE model_versions SET
  trained_on = '16,995 synthetic customers built by the platform (055), outcomes drawn with v1''s formula',
  metrics = '{"auc": 0.741, "brier": 0.0146, "pr_auc": 0.152, "test_rows": 4249, "five_fold_grade_late_rates": {"A": 0.007, "B": 0.012, "C": 0.029, "D": 0.095, "E": 0.303}}',
  validation_note = 'Chosen 2 Oct 2026 for better-calibrated percentages (docs/risk-model-v2.md). Not yet validated by someone independent of the builder.'
WHERE model_version = 'cercit-risk-v2' AND metrics IS NULL;

-- 2. Saved scores ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_scores (
  application_id  UUID          NOT NULL,
  model_version   VARCHAR(40)   NOT NULL,
  probability     NUMERIC(7,6)  NOT NULL,
  grade           CHAR(1)       NOT NULL,
  shown           BOOLEAN       NOT NULL,   -- true for the score officers saw
  scored_by       UUID,
  scored_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_model_scores PRIMARY KEY (application_id, model_version),
  CONSTRAINT fk_model_scores_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_model_scores_model FOREIGN KEY (model_version) REFERENCES model_versions(model_version),
  CONSTRAINT ck_model_scores_prob CHECK (probability BETWEEN 0 AND 1),
  CONSTRAINT ck_model_scores_grade CHECK (grade IN ('A', 'B', 'C', 'D', 'E'))
);
ALTER TABLE model_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON model_scores FROM PUBLIC, anon, authenticated;

-- Called by the case screen after it scores a case (p_application = the application number).
-- p_scores: [{model_version, probability, grade, shown}]
CREATE OR REPLACE FUNCTION fn_record_model_scores(p_application TEXT, p_scores JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := fn_current_staff_id();
  v_app UUID;
  v_origin TEXT;
  s JSONB;
  n INT := 0;
BEGIN
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'staff sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT id, origin INTO v_app, v_origin FROM applications WHERE application_id = p_application;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_origin = 'CUSTOMER' AND NOT fn_sees_real_customers() THEN
    RETURN 0;
  END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(coalesce(p_scores, '[]'::JSONB)) LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM model_versions WHERE model_version = s->>'model_version');
    INSERT INTO model_scores (application_id, model_version, probability, grade, shown, scored_by)
    VALUES (v_app, s->>'model_version', (s->>'probability')::NUMERIC, s->>'grade',
            coalesce((s->>'shown')::BOOLEAN, false), v_staff)
    ON CONFLICT (application_id, model_version) DO UPDATE
      SET probability = excluded.probability, grade = excluded.grade, shown = excluded.shown,
          scored_by = excluded.scored_by, scored_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION fn_record_model_scores(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_record_model_scores(TEXT, JSONB) TO authenticated;

-- 3. Kill switch -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_controls (
  id            BOOLEAN      PRIMARY KEY DEFAULT true,
  scores_shown  BOOLEAN      NOT NULL DEFAULT true,
  reason        TEXT,
  changed_by    UUID,
  changed_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_model_controls_one_row CHECK (id)
);
INSERT INTO model_controls (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE model_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON model_controls FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fn_model_controls()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('scores_shown', scores_shown, 'reason', reason, 'changed_at', changed_at,
                            'active_model', (SELECT model_version FROM model_versions WHERE status = 'ACTIVE'),
                            'shadow_models', (SELECT coalesce(jsonb_agg(model_version), '[]') FROM model_versions WHERE status = 'SHADOW'))
  FROM model_controls WHERE id;
$$;
REVOKE ALL ON FUNCTION fn_model_controls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_model_controls() TO authenticated;

CREATE OR REPLACE FUNCTION fn_set_model_scores_shown(p_on BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID;
BEGIN
  PERFORM fn_require_permission('model.approve');
  v_staff := fn_current_staff_id();
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'give a reason (at least 5 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE model_controls SET scores_shown = p_on, reason = btrim(p_reason), changed_by = v_staff, changed_at = now() WHERE id;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('MODEL_SWITCHED', 'OFFICER', v_staff, jsonb_build_object('scores_shown', p_on, 'reason', btrim(p_reason)));
  RETURN fn_model_controls();
END;
$$;
REVOKE ALL ON FUNCTION fn_set_model_scores_shown(BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_set_model_scores_shown(BOOLEAN, TEXT) TO authenticated;

-- 4. Inventory and comparison ----------------------------------------------------
CREATE OR REPLACE FUNCTION fn_model_inventory()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_permission('model.view');
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'model_version', m.model_version, 'status', m.status,
      'effective_from', m.effective_from, 'effective_to', m.effective_to,
      'trained_on', m.trained_on, 'metrics', m.metrics,
      'approved_at', m.approved_at, 'approved_by', (SELECT full_name FROM users WHERE id = m.approved_by),
      'validated_at', m.validated_at, 'validated_by', (SELECT full_name FROM users WHERE id = m.validated_by),
      'validation_note', m.validation_note, 'notes', m.notes,
      'cases_scored', (SELECT count(*) FROM model_scores s WHERE s.model_version = m.model_version),
      'last_scored', (SELECT max(scored_at) FROM model_scores s WHERE s.model_version = m.model_version)
    ) ORDER BY m.effective_from DESC), '[]'::JSONB)
    FROM model_versions m);
END;
$$;
REVOKE ALL ON FUNCTION fn_model_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_model_inventory() TO authenticated;

-- "Went 30+ days late in the first 12 EMIs": an instalment due at least 30 days
-- ago with no successful payment within 30 days of its due date.
CREATE OR REPLACE FUNCTION fn_loan_went_30_late(p_loan UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM loan_installments i
    WHERE i.loan_id = p_loan AND i.installment_no <= 12 AND i.due_date <= current_date - 30
      AND NOT EXISTS (SELECT 1 FROM loan_repayments r
                      WHERE r.installment_id = i.id AND r.outcome = 'SUCCESS' AND r.paid_on <= i.due_date + 30));
$$;

CREATE OR REPLACE FUNCTION fn_model_comparison(p_months INT DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months INT := least(greatest(coalesce(p_months, 12), 1), 36);
BEGIN
  PERFORM fn_require_permission('model.view');
  RETURN (
    WITH sc AS (
      SELECT s.model_version, s.probability, s.grade, la.id AS loan_id, la.disbursed_on
      FROM model_scores s
      LEFT JOIN loan_accounts la ON la.application_id = s.application_id
    ), seasoned AS (
      SELECT sc.*, fn_loan_went_30_late(sc.loan_id) AS bad
      FROM sc WHERE sc.loan_id IS NOT NULL AND sc.disbursed_on <= current_date - make_interval(months => v_months)
    )
    SELECT jsonb_build_object(
      'months_on_book', v_months,
      'models', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'model_version', m.model_version,
          'cases_scored', (SELECT count(*) FROM sc WHERE sc.model_version = m.model_version),
          'loans_with_outcome', (SELECT count(*) FROM seasoned x WHERE x.model_version = m.model_version),
          'avg_predicted', (SELECT round(avg(probability), 4) FROM seasoned x WHERE x.model_version = m.model_version),
          'actual_late_rate', (SELECT round(avg(bad::INT), 4) FROM seasoned x WHERE x.model_version = m.model_version),
          'by_grade', (SELECT coalesce(jsonb_object_agg(g.grade, jsonb_build_object('loans', g.n, 'avg_predicted', g.p, 'actual', g.a)), '{}')
                       FROM (SELECT grade, count(*) n, round(avg(probability), 4) p, round(avg(bad::INT), 4) a
                             FROM seasoned x WHERE x.model_version = m.model_version GROUP BY grade) g)
        ) ORDER BY m.model_version) FROM model_versions m), '[]'::JSONB))
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_model_comparison(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_model_comparison(INT) TO authenticated;

-- Check after running:
-- SELECT model_version, status, metrics->>'auc' FROM model_versions;   -- v1 RETIRED 0.754, v2 ACTIVE 0.741
-- SELECT fn_model_controls();                                          -- scores_shown true
