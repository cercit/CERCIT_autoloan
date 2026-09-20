-- cercit — the rules engine decides an application (backlog FD4.5)
--
-- Today the decision is worked out twice: once in the browser and once by
-- fn_run_policy_engine inside the database, from rules kept in policy_rules.
-- Neither is the approved, versioned policy. The engine on AWS runs the policy
-- version in force, and this migration lets it answer for a single application:
--
--   * fn_policy_facts now takes an application id, so the engine can ask for one
--     file instead of the last 200;
--   * engine_decisions keeps every answer it gives, with the policy version and
--     the rules that failed;
--   * fn_engine_decision_record stores that answer. Only the engine may call it.
--
-- While the server_engine switch is off, the answer is recorded and nothing
-- else changes — it can be compared against today's decision case by case. With
-- the switch on, the same call also sets the application's decision: approve
-- becomes APPROVE, review becomes MAYBE, decline becomes REJECT. The amount,
-- rate and EMI stay as the assessment worked them out; only the verdict moves.
--
-- Run order: after 032. Safe to re-run.

-- =============================================================================
-- 1. Facts for one application
-- =============================================================================
-- Same facts as the impact check builds, filtered to one file. Written as a
-- wrapper so there is one definition of a fact, not two.
CREATE OR REPLACE FUNCTION fn_policy_facts_for(p_application_id UUID)
RETURNS TABLE (application_id VARCHAR, decided_at TIMESTAMPTZ, facts JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref VARCHAR;
BEGIN
  -- The same rights fn_policy_facts itself asks for, so a caller who gets past
  -- this one is never refused inside. The engine holds the service key and passes.
  PERFORM fn_require_any_permission(ARRAY['policy.simulate', 'policy.author', 'policy.approve']);

  SELECT a.application_id INTO v_ref FROM applications a WHERE a.id = p_application_id;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT f.application_id, f.decided_at, f.facts
  FROM fn_policy_facts(2000) f
  WHERE f.application_id = v_ref;
END;
$$;

-- =============================================================================
-- 2. What the engine answered
-- =============================================================================

CREATE TABLE IF NOT EXISTS engine_decisions (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  application_id    UUID          NOT NULL,
  policy_version_id UUID,
  version_code      VARCHAR(20),
  decision          VARCHAR(10)   NOT NULL,
  score             SMALLINT,
  hard_failed       TEXT[]        NOT NULL DEFAULT '{}',
  soft_failed       TEXT[]        NOT NULL DEFAULT '{}',
  facts_not_known   TEXT[]        NOT NULL DEFAULT '{}',
  applied           BOOLEAN       NOT NULL DEFAULT false,
  decided_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_engine_decisions          PRIMARY KEY (id),
  CONSTRAINT fk_engine_decisions_app      FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_engine_decisions_version  FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
  CONSTRAINT ck_engine_decisions_decision CHECK (decision IN ('approve', 'review', 'decline'))
);

CREATE INDEX IF NOT EXISTS idx_engine_decisions_app ON engine_decisions (application_id, decided_at DESC);

-- =============================================================================
-- 3. Recording it, and applying it when the switch is on
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_engine_decision_record(
  p_application_id UUID,
  p_decision       TEXT,
  p_version_id     UUID,
  p_version_code   TEXT,
  p_score          INTEGER DEFAULT NULL,
  p_hard           TEXT[] DEFAULT '{}',
  p_soft           TEXT[] DEFAULT '{}',
  p_facts_not_known TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      UUID;
  v_on      BOOLEAN;
  v_band    VARCHAR(10);
  v_rec     RECORD;
  v_applied BOOLEAN := false;
BEGIN
  -- Only the rules engine writes here; it holds the service key. An officer
  -- cannot hand the database a decision and call it the engine's.
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'only the rules engine can record an engine decision' USING ERRCODE = '42501';
  END IF;

  IF lower(p_decision) NOT IN ('approve', 'review', 'decline') THEN
    RAISE EXCEPTION 'decision must be approve, review or decline' USING ERRCODE = '22023';
  END IF;

  v_on := fn_feature_enabled('server_engine');
  v_band := CASE lower(p_decision) WHEN 'approve' THEN 'APPROVE' WHEN 'decline' THEN 'REJECT' ELSE 'MAYBE' END;

  SELECT * INTO v_rec FROM recommendations
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  IF v_on AND v_rec.id IS NOT NULL THEN
    UPDATE recommendations
    SET recommendation = v_band,
        generated_at   = now(),
        summary_text   = concat_ws(' ', summary_text,
                           format('Decided by the rules engine on policy %s: %s.', COALESCE(p_version_code, '—'), lower(p_decision)))
    WHERE id = v_rec.id;

    UPDATE credit_decisions
    SET decision   = v_band,
        decided_at = now()
    WHERE application_id = p_application_id AND decided_by = 'SYSTEM';

    UPDATE applications
    SET status = CASE v_band WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'UNDER_REVIEW' END,
        updated_at = now()
    WHERE id = p_application_id AND status NOT IN ('DRAFT');

    v_applied := true;
  END IF;

  INSERT INTO engine_decisions (application_id, policy_version_id, version_code, decision, score,
                                hard_failed, soft_failed, facts_not_known, applied)
  VALUES (p_application_id, p_version_id, p_version_code, lower(p_decision), p_score,
          COALESCE(p_hard, '{}'), COALESCE(p_soft, '{}'), COALESCE(p_facts_not_known, '{}'), v_applied)
  RETURNING id INTO v_id;

  INSERT INTO audit_events (application_id, event_type, actor_type, event_detail)
  VALUES (p_application_id, 'ENGINE_DECISION', 'SYSTEM',
          jsonb_build_object('decision', lower(p_decision), 'policyVersion', p_version_code,
                             'applied', v_applied, 'hard', COALESCE(p_hard, '{}'), 'soft', COALESCE(p_soft, '{}')));

  RETURN jsonb_build_object('engineDecisionId', v_id, 'applied', v_applied, 'decision', lower(p_decision));
END;
$$;

-- =============================================================================
-- 4. Reading it back
-- =============================================================================
-- What the engine last said about a case, for the case screen and for comparing
-- the two engines while the switch is still off.
CREATE OR REPLACE FUNCTION fn_engine_decision(p_application_id UUID)
RETURNS TABLE (
  decision        VARCHAR,
  version_code    VARCHAR,
  score           SMALLINT,
  hard_failed     TEXT[],
  soft_failed     TEXT[],
  facts_not_known TEXT[],
  applied         BOOLEAN,
  decided_at      TIMESTAMPTZ,
  stored_decision VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.all', 'app.view.team', 'app.view.own', 'app.evaluate', 'policy.view', 'audit.view']);

  RETURN QUERY
  SELECT e.decision, e.version_code, e.score, e.hard_failed, e.soft_failed, e.facts_not_known,
         e.applied, e.decided_at,
         (SELECT r.recommendation FROM recommendations r
          WHERE r.application_id = p_application_id ORDER BY r.created_at DESC LIMIT 1)
  FROM engine_decisions e
  WHERE e.application_id = p_application_id
  ORDER BY e.decided_at DESC
  LIMIT 1;
END;
$$;

-- =============================================================================
-- 5. Access
-- =============================================================================
ALTER TABLE engine_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_read_engine_decisions" ON engine_decisions;
CREATE POLICY "staff_read_engine_decisions" ON engine_decisions
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON engine_decisions FROM anon, authenticated, service_role;
GRANT SELECT ON engine_decisions TO authenticated;

REVOKE ALL ON FUNCTION fn_policy_facts_for(UUID)                                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_engine_decision_record(UUID, TEXT, UUID, TEXT, INTEGER, TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_engine_decision(UUID)                                           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_policy_facts_for(UUID)                                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_engine_decision_record(UUID, TEXT, UUID, TEXT, INTEGER, TEXT[], TEXT[], TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION fn_engine_decision(UUID)                                         TO authenticated;

-- Check after running:
-- SELECT facts->'foir' FROM fn_policy_facts_for((SELECT id FROM applications LIMIT 1));
-- SELECT * FROM engine_decisions ORDER BY decided_at DESC LIMIT 5;
