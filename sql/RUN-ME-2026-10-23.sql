-- RUN-ME 23 Oct 2026: 091 (key in Vault), 092 (tamper-evident audit log), 093 (model governance).
-- Paste all of it into the Supabase SQL editor and run once. The last query should show three trues.

-- =============================================================================
-- 091: the PAN / mobile encryption key moves into Supabase Vault (R2, 22 Oct 2026)
-- =============================================================================
-- Before: the key sat in the app_secrets table (012), in the same database as
-- the data it protects. Locked from the app, but a database dump or anyone who
-- could read that table had both the data and the key.
--
-- Now: the key lives in Supabase Vault, which stores it encrypted with a root
-- key Supabase keeps outside the database. A dump or a table read no longer
-- carries a usable key. fn_pii_key() reads Vault first and falls back to
-- app_secrets only if Vault has no key (local tests, or before this runs).
--
-- What it doesn't do: a database superuser can still ask Vault for the key.
-- Full separation (a key service outside Supabase) is a production step.
--
-- Two steps, on purpose:
--   Step 1 (this file): copy the key into Vault, check it is identical, switch
--     fn_pii_key() to Vault. app_secrets keeps its copy for now.
--   Step 2 (091b, later, by hand): after Sameer has saved the key in his
--     password manager, delete the app_secrets copy. Without a saved copy, a
--     restore into another project could never decrypt the data.
--
-- The key itself is never changed, so every stored PAN and mobile still decrypts.
-- Run order: after 090. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_key TEXT;
  v_vault TEXT;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE '091: no Vault here; the key stays in app_secrets';
    RETURN;
  END IF;
  SELECT value INTO v_key FROM app_secrets WHERE name = 'pii_key';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_vault USING 'pii_key';
  IF v_vault IS NULL THEN
    IF v_key IS NULL THEN
      RAISE EXCEPTION '091: no key in app_secrets or Vault';
    END IF;
    EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
      USING v_key, 'pii_key', 'cercit PAN / mobile encryption key (moved from app_secrets by 091)';
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_vault USING 'pii_key';
  END IF;
  IF v_key IS NOT NULL AND v_vault IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION '091: the Vault key differs from app_secrets; nothing switched';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_pii_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  k TEXT;
BEGIN
  -- 091: Vault first; app_secrets only if Vault has no key.
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO k USING 'pii_key';
  END IF;
  IF k IS NULL THEN
    SELECT value INTO k FROM app_secrets WHERE name = 'pii_key';
  END IF;
  RETURN k;
END;
$$;
REVOKE ALL ON FUNCTION fn_pii_key() FROM PUBLIC, anon, authenticated;

-- Check after running (both should be true; neither shows the key):
-- SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_key') AS in_vault,
--        (SELECT fn_pii_decrypt(mobile_enc) IS NOT NULL FROM customers WHERE mobile_enc IS NOT NULL LIMIT 1) AS still_decrypts;

-- =============================================================================
-- 092: tamper-evident audit log (R3, 22 Oct 2026)
-- =============================================================================
-- Before: app users couldn't edit or delete audit_events, but the database
-- owner could, without leaving a trace.
--
-- Now: every audit event, the moment it is written, gets a link in a hash
-- chain kept in its own table, audit_chain:
--     content_hash = sha256 of the event (id, case, type, detail, who, when)
--     link_hash    = sha256(previous link_hash || content_hash)
-- audit_chain can only be added to (update, delete and truncate are refused).
-- fn_audit_chain_verify() walks the chain and reports:
--     broken links  - the chain itself was rewritten
--     altered       - an event whose content no longer matches its hash
--     removed       - an event that is gone (legitimate after the synthetic
--                     purge or an erasure request; anything else needs a look)
-- A nightly AWS job (aws/lambdas/audit_export) copies new links and events to
-- an S3 bucket with Object Lock, so even rewriting the whole chain in the
-- database would no longer match the locked copy.
--
-- Existing events are chained once, oldest first, when this runs.
-- Run order: after 091. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_chain (
  seq           BIGSERIAL    PRIMARY KEY,
  event_id      UUID         NOT NULL,
  content_hash  TEXT         NOT NULL,
  prev_hash     TEXT         NOT NULL,
  link_hash     TEXT         NOT NULL,
  chained_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uk_audit_chain_event UNIQUE (event_id)
);
ALTER TABLE audit_chain ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON audit_chain FROM PUBLIC, anon, authenticated;

-- The fingerprint of one event.
CREATE OR REPLACE FUNCTION fn_audit_content_hash(e audit_events)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(concat_ws('|', e.id, e.application_id, e.event_type, e.event_detail::TEXT,
                                 e.actor_type, e.actor_id,
                                 to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION fn_audit_link(p_prev TEXT, p_content TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_prev || p_content, 'sha256'), 'hex');
$$;

-- Add one event to the chain (one writer at a time, so the chain never forks).
CREATE OR REPLACE FUNCTION fn_audit_chain_add()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev TEXT;
  v_content TEXT := fn_audit_content_hash(NEW);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cercit_audit_chain'));
  SELECT link_hash INTO v_prev FROM audit_chain ORDER BY seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  INSERT INTO audit_chain (event_id, content_hash, prev_hash, link_hash)
  VALUES (NEW.id, v_content, v_prev, fn_audit_link(v_prev, v_content));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chain_add ON audit_events;
CREATE TRIGGER trg_audit_chain_add AFTER INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION fn_audit_chain_add();

-- The chain can only grow.
CREATE OR REPLACE FUNCTION fn_audit_chain_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_chain can only be added to' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chain_no_change ON audit_chain;
CREATE TRIGGER trg_audit_chain_no_change BEFORE UPDATE OR DELETE ON audit_chain
  FOR EACH ROW EXECUTE FUNCTION fn_audit_chain_append_only();
DROP TRIGGER IF EXISTS trg_audit_chain_no_truncate ON audit_chain;
CREATE TRIGGER trg_audit_chain_no_truncate BEFORE TRUNCATE ON audit_chain
  FOR EACH STATEMENT EXECUTE FUNCTION fn_audit_chain_append_only();

-- Chain the events that already exist, oldest first.
DO $$
DECLARE
  e audit_events;
  v_prev TEXT;
  v_content TEXT;
BEGIN
  SELECT link_hash INTO v_prev FROM audit_chain ORDER BY seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  FOR e IN SELECT * FROM audit_events a
           WHERE NOT EXISTS (SELECT 1 FROM audit_chain c WHERE c.event_id = a.id)
           ORDER BY a.created_at, a.id LOOP
    v_content := fn_audit_content_hash(e);
    INSERT INTO audit_chain (event_id, content_hash, prev_hash, link_hash)
    VALUES (e.id, v_content, v_prev, fn_audit_link(v_prev, v_content));
    v_prev := fn_audit_link(v_prev, v_content);
  END LOOP;
END;
$$;

-- Walk the chain and say what, if anything, has changed.
CREATE OR REPLACE FUNCTION fn_audit_chain_verify()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  lnk RECORD;
  e audit_events;
  v_prev TEXT := 'GENESIS';
  v_links INT := 0;
  v_broken INT := 0;
  v_altered INT := 0;
  v_removed INT := 0;
  v_first BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM fn_require_permission('audit.view');
  END IF;
  FOR lnk IN SELECT * FROM audit_chain ORDER BY seq LOOP
    v_links := v_links + 1;
    IF lnk.prev_hash <> v_prev OR lnk.link_hash <> fn_audit_link(lnk.prev_hash, lnk.content_hash) THEN
      v_broken := v_broken + 1;
      v_first := coalesce(v_first, lnk.seq);
    END IF;
    SELECT * INTO e FROM audit_events WHERE id = lnk.event_id;
    IF NOT FOUND THEN
      v_removed := v_removed + 1;
    ELSIF fn_audit_content_hash(e) <> lnk.content_hash THEN
      v_altered := v_altered + 1;
      v_first := coalesce(v_first, lnk.seq);
    END IF;
    v_prev := lnk.link_hash;
  END LOOP;
  RETURN jsonb_build_object(
    'links', v_links, 'broken_links', v_broken, 'altered', v_altered, 'removed', v_removed,
    'unchained', (SELECT count(*) FROM audit_events ae WHERE NOT EXISTS (SELECT 1 FROM audit_chain ch WHERE ch.event_id = ae.id)),
    'head', v_prev, 'first_problem_seq', v_first,
    'ok', v_broken = 0 AND v_altered = 0);
END;
$$;
REVOKE ALL ON FUNCTION fn_audit_chain_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_audit_chain_verify() TO authenticated;

-- For the nightly copy to S3 (service key only): links after a sequence number, with their events.
CREATE OR REPLACE FUNCTION fn_audit_export(p_after_seq BIGINT, p_limit INT DEFAULT 5000)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'seq')::BIGINT), '[]'::JSONB) FROM (
    SELECT jsonb_build_object('seq', c.seq, 'event_id', c.event_id, 'content_hash', c.content_hash,
                              'prev_hash', c.prev_hash, 'link_hash', c.link_hash, 'chained_at', c.chained_at,
                              'event', to_jsonb(a)) AS x
    FROM audit_chain c LEFT JOIN audit_events a ON a.id = c.event_id
    WHERE c.seq > p_after_seq
    ORDER BY c.seq
    LIMIT least(greatest(p_limit, 1), 20000)
  ) t;
$$;
REVOKE ALL ON FUNCTION fn_audit_export(BIGINT, INT) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION fn_audit_export(BIGINT, INT) TO service_role;
  END IF;
END $$;

-- Check after running:
-- SELECT fn_audit_chain_verify();   -- ok: true, broken_links 0, altered 0, unchained 0

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

SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_key') AS key_in_vault,
       (fn_audit_chain_verify()->>'ok')::BOOLEAN AS audit_chain_ok,
       (SELECT count(*) = 2 FROM model_versions WHERE metrics IS NOT NULL) AS models_documented;
