-- =============================================================================
-- 057: Risk model v2 becomes the approved model
-- =============================================================================
-- v2 was retrained on the platform's own synthetic customers (docs/risk-model-v2.md).
-- The product owner chose it over v1 on 2 Oct 2026: v1 ranks slightly better
-- (AUC 0.754 vs 0.741), but v2's percentages are closer to the truth, and the
-- grades are cut on those percentages.
--
-- This retires v1 from the moment the script runs and makes v2 the active model,
-- so every decision from then on records cercit-risk-v2 (030 stamps it from
-- fn_model_version_at). Decisions made earlier keep v1. The app switches its
-- MODEL_VERSION to cercit-risk-v2 in the same release.
--
-- Run order: after 056. Safe to re-run: once v2 exists, nothing changes.
-- =============================================================================

DO $$
DECLARE
  v_at TIMESTAMPTZ := now();
BEGIN
  IF EXISTS (SELECT 1 FROM model_versions WHERE model_version = 'cercit-risk-v2') THEN
    RETURN;
  END IF;

  -- one ACTIVE row at a time (uq_model_versions_one_active), so retire first
  UPDATE model_versions
     SET status = 'RETIRED', effective_to = v_at
   WHERE model_version = 'cercit-risk-v1' AND status = 'ACTIVE';

  INSERT INTO model_versions (model_version, status, effective_from, approved_at, notes)
  VALUES ('cercit-risk-v2', 'ACTIVE', v_at, v_at,
          'Retrained 2 Oct 2026 on 16,995 synthetic customers from the 055 generator (outcomes from v1''s formula). '
          || 'Chosen by the product owner over v1 for better-calibrated percentages. See docs/risk-model-v2.md. '
          || 'approved_by is empty until the model sign-off workflow exists.');
END $$;
