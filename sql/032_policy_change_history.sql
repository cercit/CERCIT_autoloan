-- cercit — before/after view and change history for policy versions (backlog CC4.2)
--
-- Two questions an approver or an auditor asks about a policy change:
--
--   1. What exactly is different? fn_policy_change_diff lists every setting whose
--      value differs from the version the change was built from, and every rule
--      in the rules document that was added, removed or altered.
--
--   2. What happened to it, and who did it? Until now a version kept only its
--      latest status: a withdrawal was a note in the request text, and an
--      activation or a cancellation left no trace of when or by whom. Every
--      status change is now written to policy_version_events by the database
--      itself, so the history cannot be skipped. fn_policy_history puts those
--      events together with the request and the reviewers' comments.
--
-- Versions that existed before this migration get their history rebuilt from
-- the dates they carry, marked "reconstructed" so nobody mistakes it for a
-- record made at the time.
--
-- Run order: after 031. Safe to re-run.

-- =============================================================================
-- 1. Every status change, recorded as it happens
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_version_events (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  policy_version_id UUID          NOT NULL,
  from_status       VARCHAR(20),
  to_status         VARCHAR(20)   NOT NULL,
  actor_id          UUID,
  reconstructed     BOOLEAN       NOT NULL DEFAULT false,
  at                TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_version_events         PRIMARY KEY (id),
  CONSTRAINT fk_policy_version_events_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
  CONSTRAINT fk_policy_version_events_actor   FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_policy_version_events_version
  ON policy_version_events (policy_version_id, at);

-- History from before this migration, rebuilt from the dates on each version.
-- Runs once: only for versions with no events yet.
INSERT INTO policy_version_events (policy_version_id, from_status, to_status, actor_id, reconstructed, at)
SELECT v.id, e.from_status, e.to_status, e.actor_id, true, e.at
FROM policy_versions v
CROSS JOIN LATERAL (VALUES
  (NULL::VARCHAR, 'DRAFT'::VARCHAR, v.authored_by, v.created_at),
  ('DRAFT', 'PENDING_APPROVAL', v.authored_by, v.submitted_at),
  ('PENDING_APPROVAL', 'APPROVED', v.approved_by, v.approved_at),
  ('APPROVED', 'ACTIVE', NULL, CASE WHEN v.status IN ('ACTIVE', 'SUPERSEDED') THEN v.effective_from END),
  ('ACTIVE', 'SUPERSEDED', NULL, CASE WHEN v.status = 'SUPERSEDED' THEN v.effective_to END),
  (NULL, v.status, NULL, CASE WHEN v.status IN ('REJECTED', 'CANCELLED') THEN v.updated_at END)
) AS e(from_status, to_status, actor_id, at)
WHERE e.at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM policy_version_events x WHERE x.policy_version_id = v.id);

CREATE OR REPLACE FUNCTION trg_policy_version_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    -- The signed-in person, or nobody for the scheduled activation job and the SQL editor.
    INSERT INTO policy_version_events (policy_version_id, from_status, to_status, actor_id)
    VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, fn_current_staff_id());
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_version_events ON policy_versions;
CREATE TRIGGER trg_policy_version_events
  AFTER INSERT OR UPDATE OF status ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION trg_policy_version_events();

-- =============================================================================
-- 2. The rules in a version, one line each
-- =============================================================================
-- Reads the decision tables in the rules document and writes each rule as the
-- conditions that make it fire, e.g. "FOIR_LIMIT (hard): FOIR % > 50".
CREATE OR REPLACE FUNCTION fn_policy_rule_lines(p_version_id UUID)
RETURNS TABLE (rule_id TEXT, line TEXT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH doc AS (
    SELECT document FROM policy_documents WHERE policy_version_id = p_version_id
  ),
  tables AS (
    SELECT n AS node
    FROM doc, jsonb_array_elements(doc.document -> 'nodes') n
    WHERE n ->> 'type' = 'decisionTableNode'
  ),
  rules AS (
    SELECT t.node, r AS rule, ord
    FROM tables t, jsonb_array_elements(t.node -> 'content' -> 'rules') WITH ORDINALITY AS x(r, ord)
  )
  SELECT btrim(ru.rule ->> 'out_rule', ''''),
         btrim(ru.rule ->> 'out_rule', '''') ||
         ' (' || COALESCE(btrim(ru.rule ->> 'out_severity', ''''), '—') || '): ' ||
         COALESCE((
           SELECT string_agg(i.value ->> 'name' || ' ' || (ru.rule ->> (i.value ->> 'id')), '; ' ORDER BY i.ordinality)
           FROM jsonb_array_elements(ru.node -> 'content' -> 'inputs') WITH ORDINALITY AS i(value, ordinality)
           WHERE COALESCE(ru.rule ->> (i.value ->> 'id'), '') <> ''
         ), 'always')
  FROM rules ru
  ORDER BY ru.ord;
$$;

-- =============================================================================
-- 3. Before and after
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_change_diff(p_version_id UUID)
RETURNS TABLE (
  kind         TEXT,     -- SETTING or RULE
  item         TEXT,     -- setting key, or rule id
  label        TEXT,
  unit         TEXT,
  before_value TEXT,
  after_value  TEXT,
  change       TEXT,     -- CHANGED, ADDED or REMOVED
  compared_to  VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base UUID;
  v_base_code VARCHAR;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.view', 'policy.author', 'policy.approve', 'audit.view']);

  -- Compared with the version it was built from; a first version with nothing
  -- behind it is compared with whatever was in force when it was written.
  SELECT COALESCE(v.base_version_id, fn_policy_version_at(v.product, v.created_at, v.tenant_id))
    INTO v_base
  FROM policy_versions v WHERE v.id = p_version_id;
  IF v_base = p_version_id THEN
    v_base := NULL;
  END IF;
  SELECT version_code INTO v_base_code FROM policy_versions WHERE id = v_base;

  RETURN QUERY
  WITH a AS (SELECT param_key, value FROM policy_parameters WHERE policy_version_id = p_version_id),
       b AS (SELECT param_key, value FROM policy_parameters WHERE policy_version_id = v_base)
  SELECT 'SETTING', COALESCE(a.param_key, b.param_key)::TEXT,
         COALESCE(d.label, COALESCE(a.param_key, b.param_key))::TEXT, d.unit::TEXT,
         b.value #>> '{}', a.value #>> '{}',
         CASE WHEN b.param_key IS NULL THEN 'ADDED' WHEN a.param_key IS NULL THEN 'REMOVED' ELSE 'CHANGED' END,
         v_base_code
  FROM a FULL JOIN b ON b.param_key = a.param_key
  LEFT JOIN parameter_definitions d ON d.param_key = COALESCE(a.param_key, b.param_key)
  WHERE a.value IS DISTINCT FROM b.value
  ORDER BY 2;

  RETURN QUERY
  WITH after_lines AS (SELECT * FROM fn_policy_rule_lines(p_version_id)),
       before_lines AS (SELECT * FROM fn_policy_rule_lines(v_base)),
       added AS (SELECT * FROM after_lines EXCEPT SELECT * FROM before_lines),
       removed AS (SELECT * FROM before_lines EXCEPT SELECT * FROM after_lines),
       -- One line out and one line in for the same rule reads as a change to it
       paired AS (
         SELECT ad.rule_id FROM added ad GROUP BY ad.rule_id HAVING count(*) = 1
         INTERSECT
         SELECT rm.rule_id FROM removed rm GROUP BY rm.rule_id HAVING count(*) = 1
       )
  SELECT 'RULE', rm.rule_id, rm.rule_id, NULL::TEXT, rm.line, ad.line, 'CHANGED', v_base_code
  FROM paired p JOIN added ad ON ad.rule_id = p.rule_id JOIN removed rm ON rm.rule_id = p.rule_id
  UNION ALL
  SELECT 'RULE', ad.rule_id, ad.rule_id, NULL, NULL, ad.line, 'ADDED', v_base_code
  FROM added ad WHERE ad.rule_id NOT IN (SELECT rule_id FROM paired)
  UNION ALL
  SELECT 'RULE', rm.rule_id, rm.rule_id, NULL, rm.line, NULL, 'REMOVED', v_base_code
  FROM removed rm WHERE rm.rule_id NOT IN (SELECT rule_id FROM paired)
  ORDER BY 2, 7;
END;
$$;

-- =============================================================================
-- 4. History: one timeline per version, or across all versions
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_policy_history(p_version_id UUID DEFAULT NULL)
RETURNS TABLE (
  version_id    UUID,
  version_code  VARCHAR,
  at            TIMESTAMPTZ,
  event         TEXT,
  actor         VARCHAR,
  note          TEXT,
  reconstructed BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_any_permission(ARRAY['policy.view', 'policy.author', 'policy.approve', 'audit.view']);

  RETURN QUERY
  SELECT * FROM (
    SELECT v.id, v.version_code, e.at,
           CASE
             WHEN e.from_status IS NULL AND e.to_status = 'DRAFT' THEN 'Drafted'
             WHEN e.from_status = 'DRAFT' AND e.to_status = 'PENDING_APPROVAL' THEN 'Sent for approval'
             WHEN e.from_status = 'PENDING_APPROVAL' AND e.to_status = 'DRAFT' THEN 'Taken back by its author'
             WHEN e.to_status = 'APPROVED' THEN 'Approved'
             WHEN e.to_status = 'REJECTED' THEN 'Rejected'
             WHEN e.to_status = 'ACTIVE' THEN 'Came into force'
             WHEN e.to_status = 'SUPERSEDED' THEN 'Replaced by a newer version'
             WHEN e.to_status = 'CANCELLED' THEN 'Cancelled'
             ELSE initcap(replace(e.to_status, '_', ' '))
           END,
           COALESCE(u.full_name, CASE WHEN e.to_status IN ('ACTIVE', 'SUPERSEDED', 'CANCELLED') THEN 'System' END)::VARCHAR,
           CASE WHEN e.to_status = 'APPROVED' THEN 'Starts ' || to_char(v.effective_from AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') END,
           e.reconstructed
    FROM policy_version_events e
    JOIN policy_versions v ON v.id = e.policy_version_id
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE p_version_id IS NULL OR v.id = p_version_id

    UNION ALL
    -- What the author said when sending it, including any withdrawal note
    SELECT v.id, v.version_code, cr.created_at, 'Change request', u.full_name::VARCHAR,
           concat_ws(chr(10), cr.title, cr.summary), false
    FROM policy_change_requests cr
    JOIN policy_versions v ON v.id = cr.policy_version_id
    LEFT JOIN users u ON u.id = cr.requested_by
    WHERE p_version_id IS NULL OR v.id = p_version_id

    UNION ALL
    -- What the reviewer said
    SELECT v.id, v.version_code, rv.reviewed_at,
           CASE rv.decision WHEN 'APPROVE' THEN 'Review: approve' WHEN 'REJECT' THEN 'Review: reject' ELSE 'Review: sent back' END,
           u.full_name::VARCHAR, rv.comment, false
    FROM policy_change_reviews rv
    JOIN policy_change_requests cr ON cr.id = rv.change_request_id
    JOIN policy_versions v ON v.id = cr.policy_version_id
    LEFT JOIN users u ON u.id = rv.reviewer_id
    WHERE p_version_id IS NULL OR v.id = p_version_id
  ) h
  ORDER BY h.at DESC;
END;
$$;

-- =============================================================================
-- 5. Access
-- =============================================================================
ALTER TABLE policy_version_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_read_policy_version_events" ON policy_version_events;
CREATE POLICY "staff_read_policy_version_events" ON policy_version_events
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON policy_version_events FROM anon, authenticated, service_role;
GRANT SELECT ON policy_version_events TO authenticated;

REVOKE ALL ON FUNCTION trg_policy_version_events()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION fn_policy_rule_lines(UUID)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_change_diff(UUID)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_policy_history(UUID)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_policy_rule_lines(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_change_diff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_policy_history(UUID)     TO authenticated;

-- Check after running:
-- SELECT version_code, event, actor, at, reconstructed FROM fn_policy_history() LIMIT 20;
-- SELECT kind, item, before_value, after_value, change FROM fn_policy_change_diff(
--   (SELECT id FROM policy_versions WHERE version_code = '2026.09'));
