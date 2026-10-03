-- =============================================================================
-- 076: Save today's settings as the defaults; reset all settings in one click (fix list G1)
-- =============================================================================
-- Settings only: never applications, customers, documents, loans or their
-- statuses.
--
--   * settings_baselines: a named snapshot of every setting. The first,
--     "Defaults 2 Oct 2026", is taken when this file runs.
--   * fn_settings_baseline_save(name): an admin saves today's settings.
--   * fn_settings_reset_preview(baseline): what a reset would change, line by
--     line, before anything changes.
--   * fn_settings_reset(baseline, typed confirmation): admin only, the word
--     RESET typed; writes one audit entry listing every change.
--
-- What is saved, and how a reset puts it back:
--   at once:   module switches; Document checks (automation, which documents
--              are accepted on their own, every check's on / must-pass /
--              limit / if-it-fails); organisation settings; security
--              settings (incl. officers_see_unassigned); roles (on/off, MFA,
--              idle time) and their rights; simulation and employer-check
--              settings
--   approval:  credit policy (the version-in-force settings and the credit
--              rules' on/off, limit and decline/refer) becomes a NEW policy
--              version waiting for approval by someone other than the admin,
--              live from the date the approver picks; the rate grid and
--              employer-category pricing become a rate grid version waiting
--              for pricing approval. Approved history is never overwritten.
--              (Open question G1: approval, not the emergency route; the
--              emergency route skips the second person.)
--   listed:    the active risk model is shown when it differs but not
--              switched: the model and the app change together (lesson 19);
--              the bureau switches are fixed in code and only listed.
--
-- Run order: after 075. Safe to re-run (the first baseline is kept).
-- =============================================================================

CREATE TABLE IF NOT EXISTS settings_baselines (
  id        UUID          NOT NULL DEFAULT gen_random_uuid(),
  name      VARCHAR(100)  NOT NULL,
  snapshot  JSONB         NOT NULL,
  taken_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  taken_by  UUID,
  CONSTRAINT pk_settings_baselines PRIMARY KEY (id),
  CONSTRAINT uq_settings_baselines_name UNIQUE (name)
);
ALTER TABLE settings_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settings_baselines FROM anon, authenticated;

-- Every setting, flat: "area|item" -> value. Flat keys make the comparison a join.
CREATE OR REPLACE FUNCTION fn_settings_capture()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT jsonb_object_agg('switch|' || flag_key, to_jsonb(enabled)) FROM feature_flags), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('documents|settings.' || key, value)
                 FROM document_auto_settings s, jsonb_each(to_jsonb(s) - 'id' - 'updated_by' - 'updated_at')), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('documents|auto_accept.' || doc_type, to_jsonb(auto_accept)) FROM document_auto_policy), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('documents|check.' || doc_type || '.' || check_code,
                        jsonb_build_object('enabled', enabled, 'blocking', blocking, 'threshold', threshold, 'on_fail', on_fail))
                 FROM document_check_rules), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('organisation|' || key, value)
                 FROM organisation_settings o, jsonb_each(to_jsonb(o) - 'tenant_id' - 'updated_at' - 'updated_by')
                 WHERE o.tenant_id = fn_default_tenant_id()), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('security|' || setting_key, to_jsonb(value)) FROM security_settings), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('roles|' || r.code, jsonb_build_object(
                          'is_active', r.is_active, 'mfa_required', r.mfa_required, 'idle_timeout_minutes', r.idle_timeout_minutes,
                          'permissions', (SELECT coalesce(jsonb_agg(p.permission_code ORDER BY p.permission_code), '[]'::jsonb)
                                          FROM role_permissions p WHERE p.role_code = r.code)))
                 FROM roles r), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('policy|setting.' || p.param_key, p.value)
                 FROM policy_parameters p WHERE p.policy_version_id = fn_policy_version_at()), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('policy|rule.' || rule_id,
                        jsonb_build_object('is_active', is_active, 'threshold_value', threshold_value, 'severity_on_fail', severity_on_fail))
                 FROM policy_rules), '{}'::jsonb)
    || jsonb_build_object('pricing|rate grid',
         (SELECT jsonb_build_object('bands', fn_rate_grid_json(id)->'bands', 'categories', fn_rate_grid_json(id)->'categories')
          FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status = 'ACTIVE'))
    || jsonb_build_object('model|active risk model',
         to_jsonb((SELECT model_version FROM model_versions WHERE status = 'ACTIVE' ORDER BY effective_from DESC LIMIT 1)))
    || jsonb_build_object('bureau|card and overdraft share counted', to_jsonb(fn_bureau_revolving_rate()),
                          'bureau|that share inside FOIR', to_jsonb(fn_bureau_revolving_in_foir()))
    || coalesce((SELECT jsonb_object_agg('simulation|' || key, value)
                 FROM simulation_settings s, jsonb_each(to_jsonb(s) - 'id')), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg('employer checks|' || key, value)
                 FROM employer_master_settings s, jsonb_each(to_jsonb(s) - 'id')), '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION fn_settings_capture() FROM PUBLIC, anon, authenticated;

-- The first baseline: the settings as they are when this runs.
INSERT INTO settings_baselines (name, snapshot) VALUES ('Defaults 2 Oct 2026', fn_settings_capture())
ON CONFLICT (name) DO NOTHING;

-- What a reset would change: area, item, now, default, and how it is put back.
CREATE OR REPLACE FUNCTION fn_settings_diff(p_baseline UUID)
RETURNS TABLE (area TEXT, item TEXT, now_value JSONB, default_value JSONB, how TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (SELECT key, value FROM settings_baselines, jsonb_each(snapshot) WHERE id = p_baseline),
       c AS (SELECT key, value FROM jsonb_each(fn_settings_capture()))
  SELECT split_part(coalesce(b.key, c.key), '|', 1), split_part(coalesce(b.key, c.key), '|', 2), c.value, b.value,
         CASE split_part(coalesce(b.key, c.key), '|', 1)
           WHEN 'policy' THEN 'through policy approval'
           WHEN 'pricing' THEN 'through pricing approval'
           WHEN 'model' THEN 'listed only: the model changes with the app'
           WHEN 'bureau' THEN 'listed only: fixed in code'
           ELSE CASE WHEN b.key IS NULL THEN 'kept: added after the defaults were saved' ELSE 'at once' END END
  FROM b FULL JOIN c ON c.key = b.key
  WHERE b.value IS DISTINCT FROM c.value
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION fn_settings_diff(UUID) FROM PUBLIC, anon, authenticated;

-- Admin: list the baselines.
CREATE OR REPLACE FUNCTION fn_settings_baselines()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_permission('org.manage');
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'taken_at', taken_at,
                                                        'taken_by', (SELECT full_name FROM users WHERE id = taken_by),
                                                        'settings', (SELECT count(*) FROM jsonb_object_keys(snapshot)))
                                    ORDER BY taken_at), '[]'::jsonb) FROM settings_baselines);
END;
$$;

CREATE OR REPLACE FUNCTION fn_settings_baseline_save(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('org.manage');
  v_name  TEXT := nullif(btrim(coalesce(p_name, '')), '');
BEGIN
  IF v_name IS NULL OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'give the defaults a name (up to 100 characters)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO settings_baselines (name, snapshot, taken_by) VALUES (v_name, fn_settings_capture(), v_actor);
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('SETTINGS_DEFAULTS_SAVED', 'USER', v_actor, jsonb_build_object('name', v_name));
  RETURN fn_settings_baselines();
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'there are already defaults called %', v_name USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION fn_settings_reset_preview(p_baseline UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_permission('org.manage');
  IF NOT EXISTS (SELECT 1 FROM settings_baselines WHERE id = p_baseline) THEN
    RAISE EXCEPTION 'no such defaults' USING ERRCODE = 'P0002';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('area', area, 'item', item, 'now', now_value,
                                                        'default', default_value, 'how', how)), '[]'::jsonb)
          FROM fn_settings_diff(p_baseline));
END;
$$;

-- The reset itself.
CREATE OR REPLACE FUNCTION fn_settings_reset(p_baseline UUID, p_confirm TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := fn_require_permission('org.manage');
  v_base    settings_baselines%ROWTYPE;
  d         RECORD;
  v_changes JSONB := '[]'::jsonb;
  v_policy  UUID;
  v_grid    UUID;
  v_key     TEXT;
  v_val     JSONB;
  v_k2      TEXT;
BEGIN
  IF btrim(coalesce(p_confirm, '')) <> 'RESET' THEN
    RAISE EXCEPTION 'type RESET to confirm' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_base FROM settings_baselines WHERE id = p_baseline;
  IF v_base.id IS NULL THEN
    RAISE EXCEPTION 'no such defaults' USING ERRCODE = 'P0002';
  END IF;

  FOR d IN SELECT * FROM fn_settings_diff(p_baseline) WHERE default_value IS NOT NULL LOOP
    v_val := d.default_value;
    IF d.area = 'switch' THEN
      UPDATE feature_flags SET enabled = (v_val #>> '{}')::BOOLEAN WHERE flag_key = d.item;
    ELSIF d.area = 'documents' AND d.item LIKE 'settings.%' THEN
      v_k2 := substr(d.item, 10);
      EXECUTE format('UPDATE document_auto_settings SET %I = (%L::jsonb #>> ''{}'')::%s, updated_by = %L, updated_at = now()',
                     v_k2, v_val, CASE WHEN jsonb_typeof(v_val) = 'boolean' THEN 'BOOLEAN' ELSE 'SMALLINT' END, v_actor);
    ELSIF d.area = 'documents' AND d.item LIKE 'auto_accept.%' THEN
      UPDATE document_auto_policy SET auto_accept = (v_val #>> '{}')::BOOLEAN, updated_by = v_actor, updated_at = now()
      WHERE doc_type = substr(d.item, 13);
    ELSIF d.area = 'documents' AND d.item LIKE 'check.%' THEN
      UPDATE document_check_rules SET enabled = (v_val->>'enabled')::BOOLEAN, blocking = (v_val->>'blocking')::BOOLEAN,
             threshold = (v_val->>'threshold')::NUMERIC, on_fail = v_val->>'on_fail', updated_by = v_actor, updated_at = now()
      WHERE doc_type || '.' || check_code = substr(d.item, 7);
    ELSIF d.area = 'organisation' THEN
      EXECUTE format('UPDATE organisation_settings SET %I = (SELECT %I FROM jsonb_populate_record(NULL::organisation_settings, jsonb_build_object(%L, %L::jsonb))), updated_by = %L, updated_at = now() WHERE tenant_id = fn_default_tenant_id()',
                     d.item, d.item, d.item, v_val, v_actor);
    ELSIF d.area = 'security' THEN
      UPDATE security_settings SET value = (v_val #>> '{}')::INTEGER WHERE setting_key = d.item;
    ELSIF d.area = 'roles' THEN
      UPDATE roles SET is_active = (v_val->>'is_active')::BOOLEAN, mfa_required = (v_val->>'mfa_required')::BOOLEAN,
             idle_timeout_minutes = (v_val->>'idle_timeout_minutes')::INTEGER
      WHERE code = d.item;
      DELETE FROM role_permissions WHERE role_code = d.item
        AND NOT (permission_code = ANY (ARRAY(SELECT jsonb_array_elements_text(v_val->'permissions'))));
      INSERT INTO role_permissions (role_code, permission_code)
      SELECT d.item, p FROM jsonb_array_elements_text(v_val->'permissions') p
      ON CONFLICT DO NOTHING;
    ELSIF d.area = 'simulation' THEN
      EXECUTE format('UPDATE simulation_settings SET %I = (SELECT %I FROM jsonb_populate_record(NULL::simulation_settings, jsonb_build_object(%L, %L::jsonb)))',
                     d.item, d.item, d.item, v_val);
    ELSIF d.area = 'employer checks' THEN
      EXECUTE format('UPDATE employer_master_settings SET %I = (SELECT %I FROM jsonb_populate_record(NULL::employer_master_settings, jsonb_build_object(%L, %L::jsonb)))',
                     d.item, d.item, d.item, v_val);
    ELSIF d.area = 'policy' THEN
      -- one new version for every policy difference, waiting for someone else's approval
      IF v_policy IS NULL THEN
        INSERT INTO policy_versions (product, version_code, base_version_id, rationale, tier, authored_by)
        VALUES ('CAR_NEW', 'RESET-' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD-HH24MI'), fn_policy_version_at(),
                'Settings reset to "' || v_base.name || '"', 'MATERIAL', v_actor)
        RETURNING id INTO v_policy;
        INSERT INTO policy_parameters (policy_version_id, param_key, value)
        SELECT v_policy, param_key, value FROM policy_parameters WHERE policy_version_id = fn_policy_version_at();
        INSERT INTO policy_documents (policy_version_id, engine, document)
        SELECT v_policy, engine, document FROM policy_documents WHERE policy_version_id = fn_policy_version_at();
      END IF;
      IF d.item LIKE 'setting.%' THEN
        UPDATE policy_parameters SET value = v_val WHERE policy_version_id = v_policy AND param_key = substr(d.item, 9);
      ELSE
        INSERT INTO policy_version_rule_changes (policy_version_id, rule_id, is_active, threshold_value, severity_on_fail, before)
        SELECT v_policy, r.rule_id,
               CASE WHEN (v_val->>'is_active')::BOOLEAN IS DISTINCT FROM r.is_active THEN (v_val->>'is_active')::BOOLEAN END,
               CASE WHEN v_val->>'threshold_value' IS DISTINCT FROM r.threshold_value THEN v_val->>'threshold_value' END,
               CASE WHEN v_val->>'severity_on_fail' IS DISTINCT FROM r.severity_on_fail THEN v_val->>'severity_on_fail' END,
               jsonb_build_object('is_active', r.is_active, 'threshold_value', r.threshold_value, 'severity_on_fail', r.severity_on_fail)
        FROM policy_rules r WHERE r.rule_id = substr(d.item, 6)
        ON CONFLICT (policy_version_id, rule_id) DO NOTHING;
      END IF;
    ELSIF d.area = 'pricing' THEN
      IF EXISTS (SELECT 1 FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status IN ('DRAFT', 'PENDING_APPROVAL')) THEN
        RAISE EXCEPTION 'a rate grid change is already open: finish or withdraw it, then reset' USING ERRCODE = '22023';
      END IF;
      INSERT INTO rate_grid_versions (product_code, version_no, status, rationale, base_version_id, authored_by, submitted_at, effective_from)
      VALUES ('CAR_NEW_SALARIED', (SELECT max(version_no) + 1 FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED'),
              'PENDING_APPROVAL', 'Settings reset to "' || v_base.name || '"',
              (SELECT id FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status = 'ACTIVE'),
              v_actor, now(), (((now() AT TIME ZONE 'Asia/Kolkata')::DATE + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))
      RETURNING id INTO v_grid;
      INSERT INTO rate_grid_version_bands (version_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
                                           max_ltv_pct, max_foir_pct, max_tenure_months)
      SELECT v_grid, x->>'band_label', (x->>'score_band_min')::SMALLINT, (x->>'score_band_max')::SMALLINT, (x->>'rate_pct')::NUMERIC,
             x->>'rate_type', (x->>'max_ltv_pct')::NUMERIC, (x->>'max_foir_pct')::NUMERIC, (x->>'max_tenure_months')::SMALLINT
      FROM jsonb_array_elements(v_val->'bands') x;
      INSERT INTO rate_grid_version_categories (version_id, category_code, category_label, description, rate_loading_pct,
                                                max_ltv_pct, max_tenure_months, processing_fee_inr)
      SELECT v_grid, x->>'category_code', x->>'category_label', coalesce(x->>'description', ''), (x->>'rate_loading_pct')::NUMERIC,
             (x->>'max_ltv_pct')::NUMERIC, (x->>'max_tenure_months')::SMALLINT, (x->>'processing_fee_inr')::INTEGER
      FROM jsonb_array_elements(v_val->'categories') x;
    ELSE
      -- model and bureau: listed only
      CONTINUE;
    END IF;
    v_changes := v_changes || jsonb_build_object('area', d.area, 'item', d.item, 'from', d.now_value, 'to', v_val, 'how', d.how);
  END LOOP;

  IF v_policy IS NOT NULL THEN
    UPDATE policy_versions SET status = 'PENDING_APPROVAL', submitted_at = now() WHERE id = v_policy;
    INSERT INTO policy_change_requests (policy_version_id, title, summary, requested_by)
    VALUES (v_policy, 'Reset to "' || v_base.name || '"', 'Settings reset: the saved credit policy settings and rules, for approval', v_actor);
  END IF;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('SETTINGS_RESET', 'USER', v_actor,
          jsonb_build_object('defaults', v_base.name, 'changes', v_changes,
                             'policy_version_for_approval', (SELECT version_code FROM policy_versions WHERE id = v_policy),
                             'rate_grid_for_approval', v_grid IS NOT NULL));
  RETURN jsonb_build_object('changed', jsonb_array_length(v_changes), 'changes', v_changes,
                            'policy_version_for_approval', (SELECT version_code FROM policy_versions WHERE id = v_policy),
                            'rate_grid_for_approval', v_grid IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION fn_settings_baselines(), fn_settings_baseline_save(TEXT), fn_settings_reset_preview(UUID),
                       fn_settings_reset(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_settings_baselines(), fn_settings_baseline_save(TEXT), fn_settings_reset_preview(UUID),
                          fn_settings_reset(UUID, TEXT) TO authenticated;

-- Checks after running:
-- SELECT name, (SELECT count(*) FROM jsonb_object_keys(snapshot)) FROM settings_baselines;   -- "Defaults 2 Oct 2026" with a few hundred settings
-- SELECT * FROM fn_settings_diff((SELECT id FROM settings_baselines WHERE name = 'Defaults 2 Oct 2026'));   -- no rows right after
