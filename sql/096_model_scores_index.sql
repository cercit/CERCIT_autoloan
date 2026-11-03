-- =============================================================================
-- 096: index for model_scores.model_version (3 Nov 2026)
-- =============================================================================
-- 093 linked model_scores.model_version to model_versions without an index.
-- The primary key (application_id, model_version) starts with application_id,
-- so it does not cover lookups by model, and a change to model_versions has to
-- scan every score. The advisor check (sql/checks/advisor-checks.sql) has
-- flagged it since 23 Oct, which is why the GitHub "Verify" job was red.
--
-- Run order: after 095. Safe to re-run.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_model_scores_model_version ON model_scores (model_version);

-- Check after running:
-- SELECT to_regclass('public.idx_model_scores_model_version') IS NOT NULL;   -- true
