-- cercit — every decision records the policy and model it was made under (backlog CC5.1, CC5.2)
--
-- Why this exists: a stored decision said APPROVE or REJECT but not under which
-- rules. Once a threshold changes, an old decision can no longer be explained:
-- you can see FOIR_CAP failed, not what the cap was that day (gap register #2).
--
-- What each recommendation and credit decision now carries:
--   * policy_version_id — the approved policy version in force at that moment;
--   * rules_snapshot    — a fingerprint of the rule rows the SQL engine actually
--                         used. Until Credit control is switched on, the old
--                         policy_rules table still makes the decision, so the
--                         version alone would not prove which thresholds applied.
--                         The full rule set is kept once per fingerprint in
--                         rule_set_snapshots, so any past decision can be replayed;
--   * model_version     — the risk model approved for use at that moment;
--   * version_basis     — RECORDED when stamped at decision time, ASSUMED for
--                         rows that existed before this migration.
--
-- The stamps are set by the database, never by the caller. An insert gets them
-- from the moment of the decision; an update keeps them unless the decision
-- itself is re-made (an officer re-deciding stamps the new moment). Nobody can
-- edit them directly.
--
-- Old rows (CC5.2): marked as 2026.08 with basis ASSUMED. That is the only
-- version that has ever been in force, but nobody recorded it at the time, and
-- the label says so instead of hiding it. Their rule fingerprint stays empty
-- because the rules they used were not kept.
--
-- Run order: after 029. Safe to re-run.

-- =============================================================================
-- 1. Model versions: which risk model was approved for use, and from when
-- =============================================================================

CREATE TABLE IF NOT EXISTS model_versions (
  model_version   VARCHAR(40)   NOT NULL,
  status          VARCHAR(12)   NOT NULL DEFAULT 'ACTIVE',
  effective_from  TIMESTAMPTZ   NOT NULL,
  effective_to    TIMESTAMPTZ,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_model_versions          PRIMARY KEY (model_version),
  CONSTRAINT fk_model_versions_approver FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT ck_model_versions_status   CHECK (status IN ('ACTIVE', 'RETIRED')),
  CONSTRAINT ck_model_versions_window   CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_model_versions_one_active
  ON model_versions ((true)) WHERE status = 'ACTIVE';

-- The model in use today. It is a constant in src/lib/onnx-inference.ts and was
-- trained on 16 Sep 2026. No approval was recorded; the model sign-off
-- workflow (04-Model-Risk-Management) fills approved_by when it exists.
INSERT INTO model_versions (model_version, status, effective_from, notes)
VALUES ('cercit-risk-v1', 'ACTIVE', '2026-09-16 00:00:00+05:30',
        'Seeded from MODEL_VERSION in src/lib/onnx-inference.ts. Advisory score shown to officers; no approval recorded yet.')
ON CONFLICT (model_version) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_model_version_at(p_at TIMESTAMPTZ DEFAULT now())
RETURNS VARCHAR
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT model_version
  FROM model_versions
  WHERE effective_from <= p_at
    AND (effective_to IS NULL OR effective_to > p_at)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- =============================================================================
-- 2. Rule-set snapshots: the exact rule rows a decision was made with
-- =============================================================================

CREATE TABLE IF NOT EXISTS rule_set_snapshots (
  rules_sha256   VARCHAR(64)   NOT NULL,
  rules          JSONB         NOT NULL,
  first_seen_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_rule_set_snapshots PRIMARY KEY (rules_sha256)
);

-- Captures the active policy_rules rows, keeps a copy the first time this exact
-- set is seen, and returns its fingerprint. Only the columns that change an
-- outcome are included, so a reworded description does not count as a new set.
CREATE OR REPLACE FUNCTION fn_rule_set_snapshot()
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules JSONB;
  v_sha   VARCHAR(64);
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'rule_id', rule_id,
           'parameter', parameter,
           'operator', operator,
           'threshold_value', threshold_value,
           'threshold_unit', threshold_unit,
           'severity_on_fail', severity_on_fail,
           'reason_code', reason_code,
           'policy_version', policy_version
         ) ORDER BY rule_id), '[]'::jsonb)
    INTO v_rules
  FROM policy_rules
  WHERE is_active;

  v_sha := encode(sha256(convert_to(v_rules::text, 'UTF8')), 'hex');

  INSERT INTO rule_set_snapshots (rules_sha256, rules)
  VALUES (v_sha, v_rules)
  ON CONFLICT (rules_sha256) DO NOTHING;

  RETURN v_sha;
END;
$$;

-- =============================================================================
-- 3. The stamp columns
-- =============================================================================

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS policy_version_id UUID,
  ADD COLUMN IF NOT EXISTS rules_snapshot    VARCHAR(64),
  ADD COLUMN IF NOT EXISTS model_version     VARCHAR(40),
  ADD COLUMN IF NOT EXISTS version_basis     VARCHAR(10);

ALTER TABLE credit_decisions
  ADD COLUMN IF NOT EXISTS policy_version_id UUID,
  ADD COLUMN IF NOT EXISTS rules_snapshot    VARCHAR(64),
  ADD COLUMN IF NOT EXISTS model_version     VARCHAR(40),
  ADD COLUMN IF NOT EXISTS version_basis     VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_recommendations_policy_version') THEN
    ALTER TABLE recommendations
      ADD CONSTRAINT fk_recommendations_policy_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
      ADD CONSTRAINT fk_recommendations_rules_snapshot FOREIGN KEY (rules_snapshot) REFERENCES rule_set_snapshots(rules_sha256),
      ADD CONSTRAINT fk_recommendations_model_version  FOREIGN KEY (model_version) REFERENCES model_versions(model_version),
      ADD CONSTRAINT ck_recommendations_version_basis  CHECK (version_basis IN ('RECORDED', 'ASSUMED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_credit_decisions_policy_version') THEN
    ALTER TABLE credit_decisions
      ADD CONSTRAINT fk_credit_decisions_policy_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
      ADD CONSTRAINT fk_credit_decisions_rules_snapshot FOREIGN KEY (rules_snapshot) REFERENCES rule_set_snapshots(rules_sha256),
      ADD CONSTRAINT fk_credit_decisions_model_version  FOREIGN KEY (model_version) REFERENCES model_versions(model_version),
      ADD CONSTRAINT ck_credit_decisions_version_basis  CHECK (version_basis IN ('RECORDED', 'ASSUMED'));
  END IF;
END $$;

-- =============================================================================
-- 4. Old rows (CC5.2): 2026.08, marked as assumed
-- =============================================================================
-- Runs before the stamping trigger exists, so these updates are not overwritten.

DO $$
DECLARE
  v_baseline UUID;
BEGIN
  SELECT id INTO v_baseline
  FROM policy_versions
  WHERE tenant_id = fn_default_tenant_id() AND product = 'CAR_NEW' AND version_code = '2026.08';

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recommendations_version_stamp') THEN
    UPDATE recommendations
    SET policy_version_id = v_baseline,
        model_version     = fn_model_version_at(generated_at),
        version_basis     = 'ASSUMED'
    WHERE version_basis IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_credit_decisions_version_stamp') THEN
    UPDATE credit_decisions
    SET policy_version_id = v_baseline,
        model_version     = fn_model_version_at(decided_at),
        version_basis     = 'ASSUMED'
    WHERE version_basis IS NULL;
  END IF;
END $$;

-- =============================================================================
-- 5. Stamping at decision time
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_decision_version_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at        TIMESTAMPTZ;
  v_remade    BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'recommendations' THEN
    v_at := NEW.generated_at;
    v_remade := TG_OP = 'INSERT'
             OR NEW.generated_at   IS DISTINCT FROM OLD.generated_at
             OR NEW.recommendation IS DISTINCT FROM OLD.recommendation;
  ELSE
    v_at := NEW.decided_at;
    v_remade := TG_OP = 'INSERT'
             OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
             OR NEW.decision   IS DISTINCT FROM OLD.decision;
  END IF;

  IF v_remade THEN
    NEW.policy_version_id := fn_policy_version_at('CAR_NEW', coalesce(v_at, now()));
    NEW.rules_snapshot    := fn_rule_set_snapshot();
    NEW.model_version     := fn_model_version_at(coalesce(v_at, now()));
    NEW.version_basis     := 'RECORDED';
  ELSE
    NEW.policy_version_id := OLD.policy_version_id;
    NEW.rules_snapshot    := OLD.rules_snapshot;
    NEW.model_version     := OLD.model_version;
    NEW.version_basis     := OLD.version_basis;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recommendations_version_stamp ON recommendations;
CREATE TRIGGER trg_recommendations_version_stamp
  BEFORE INSERT OR UPDATE ON recommendations
  FOR EACH ROW EXECUTE FUNCTION trg_decision_version_stamp();

DROP TRIGGER IF EXISTS trg_credit_decisions_version_stamp ON credit_decisions;
CREATE TRIGGER trg_credit_decisions_version_stamp
  BEFORE INSERT OR UPDATE ON credit_decisions
  FOR EACH ROW EXECUTE FUNCTION trg_decision_version_stamp();

-- =============================================================================
-- 6. Reading it back: what a decision was made under
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_decision_versions(p_application_id UUID)
RETURNS TABLE (
  source          TEXT,
  outcome         VARCHAR,
  decided_at      TIMESTAMPTZ,
  version_code    VARCHAR,
  version_basis   VARCHAR,
  model_version   VARCHAR,
  rules_snapshot  VARCHAR,
  rules           JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.all', 'app.view.team', 'app.view.own', 'policy.view', 'audit.view']);

  RETURN QUERY
  SELECT 'RECOMMENDATION', r.recommendation, r.generated_at, pv.version_code,
         r.version_basis, r.model_version, r.rules_snapshot, s.rules
  FROM recommendations r
  LEFT JOIN policy_versions pv ON pv.id = r.policy_version_id
  LEFT JOIN rule_set_snapshots s ON s.rules_sha256 = r.rules_snapshot
  WHERE r.application_id = p_application_id
  UNION ALL
  SELECT 'DECISION', d.decision, d.decided_at, pv.version_code,
         d.version_basis, d.model_version, d.rules_snapshot, s.rules
  FROM credit_decisions d
  LEFT JOIN policy_versions pv ON pv.id = d.policy_version_id
  LEFT JOIN rule_set_snapshots s ON s.rules_sha256 = d.rules_snapshot
  WHERE d.application_id = p_application_id
  ORDER BY 3;
END;
$$;

-- =============================================================================
-- 7. Access
-- =============================================================================

ALTER TABLE model_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_set_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_model_versions" ON model_versions;
CREATE POLICY "staff_read_model_versions" ON model_versions FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));
DROP POLICY IF EXISTS "staff_read_rule_set_snapshots" ON rule_set_snapshots;
CREATE POLICY "staff_read_rule_set_snapshots" ON rule_set_snapshots FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON model_versions, rule_set_snapshots FROM anon, authenticated, service_role;
GRANT SELECT ON model_versions, rule_set_snapshots TO authenticated;

REVOKE ALL ON FUNCTION fn_rule_set_snapshot()             FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION trg_decision_version_stamp()       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION fn_model_version_at(TIMESTAMPTZ)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_decision_versions(UUID)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_model_version_at(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_decision_versions(UUID)       TO authenticated;

-- Check after running:
-- SELECT version_basis, count(*) FROM credit_decisions GROUP BY 1;
-- SELECT * FROM model_versions;
