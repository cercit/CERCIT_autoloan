-- =============================================================================
-- 079: Weekly backup of the settings and policy tables (fix list H7)
-- =============================================================================
-- Supabase's free plan keeps only a short backup window, and the settings
-- reset (G1, 076) is only as good as the last saved defaults. This keeps a
-- full copy of every settings, policy and pricing table, once a week:
--
--   * settings_backups: one row per backup, every row of each table as JSON
--     (not a summary: a table can be rebuilt from it). The last 26 weekly
--     backups are kept (half a year).
--   * fn_settings_backup_take(kind): takes one now. SQL editor, pg_cron or the
--     export script only (not callable from the website).
--   * fn_settings_backup_latest(): the newest backup, for the export script
--     (scripts/backup-settings.mjs), which saves a copy outside the database
--     (see docs/production-checklist.md).
--   * pg_cron job cercit-settings-backup-weekly: Sundays 01:00 India time,
--     if pg_cron is switched on (it is needed for 075 too).
--
-- What is copied: switches and their history, Document checks, organisation
-- and security settings, roles, rights and waivers, policy versions, their
-- parameters, rules, rule changes, events and documents, reason codes,
-- parameter definitions, the rate grid, rate grid versions, pricing products,
-- employer master, reference lists and checks settings, consent wording,
-- document types, states, dealers, simulation settings and the saved
-- defaults. Never copied: customers, applications, documents, loans, users
-- (personal data) or app_secrets.
--
-- Run order: after 078. Safe to re-run. Takes the first backup when it runs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS settings_backups (
  id        UUID          NOT NULL DEFAULT gen_random_uuid(),
  kind      VARCHAR(10)   NOT NULL DEFAULT 'WEEKLY',
  taken_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  tables    JSONB         NOT NULL,
  row_count INTEGER       NOT NULL,
  CONSTRAINT pk_settings_backups PRIMARY KEY (id),
  CONSTRAINT ck_settings_backups_kind CHECK (kind IN ('WEEKLY', 'MANUAL'))
);
CREATE INDEX IF NOT EXISTS ix_settings_backups_taken_at ON settings_backups (taken_at DESC);
ALTER TABLE settings_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settings_backups FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_settings_backup_tables()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'feature_flags', 'feature_flag_history',
    'document_auto_settings', 'document_auto_policy', 'document_check_rules', 'document_types',
    'organisation_settings', 'security_settings',
    'roles', 'permissions', 'role_permissions', 'permission_conflicts', 'role_conflict_waivers',
    'policy_versions', 'policy_parameters', 'policy_rules', 'policy_version_rule_changes', 'policy_rule_history',
    'policy_version_events', 'policy_documents', 'parameter_definitions', 'reason_codes', 'rule_set_snapshots',
    'rate_grid', 'employer_category_pricing', 'pricing_products',
    'rate_grid_versions', 'rate_grid_version_bands', 'rate_grid_version_categories',
    'employers', 'employer_reference_list', 'employer_master_settings', 'employer_category_changes',
    'consent_texts', 'states', 'dealers', 'simulation_settings', 'settings_baselines'];
$$;

CREATE OR REPLACE FUNCTION fn_settings_backup_take(p_kind TEXT DEFAULT 'WEEKLY')
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t      TEXT;
  v_rows   JSONB;
  v_all    JSONB := '{}'::jsonb;
  v_count  INTEGER := 0;
  v_id     UUID;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'backups are taken from the SQL editor or the weekly job' USING ERRCODE = '42501';
  END IF;
  FOREACH v_t IN ARRAY fn_settings_backup_tables() LOOP
    CONTINUE WHEN to_regclass('public.' || v_t) IS NULL;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM %I x', v_t) INTO v_rows;
    v_all := v_all || jsonb_build_object(v_t, v_rows);
    v_count := v_count + jsonb_array_length(v_rows);
  END LOOP;

  INSERT INTO settings_backups (kind, tables, row_count)
  VALUES (CASE WHEN p_kind = 'MANUAL' THEN 'MANUAL' ELSE 'WEEKLY' END, v_all, v_count)
  RETURNING id INTO v_id;

  -- keep the last 26 weekly backups; manual ones stay until deleted by hand
  DELETE FROM settings_backups
  WHERE kind = 'WEEKLY'
    AND id NOT IN (SELECT id FROM settings_backups WHERE kind = 'WEEKLY' ORDER BY taken_at DESC LIMIT 26);

  RETURN jsonb_build_object('id', v_id, 'tables', (SELECT count(*) FROM jsonb_object_keys(v_all)), 'rows', v_count);
END;
$$;

-- The newest backup, whole: for the export script (service key) and the SQL editor
CREATE OR REPLACE FUNCTION fn_settings_backup_latest()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'backups are read from the SQL editor or the export script' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id', id, 'kind', kind, 'taken_at', taken_at, 'rows', row_count, 'tables', tables)
  INTO v_out FROM settings_backups ORDER BY taken_at DESC LIMIT 1;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_settings_backup_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_settings_backup_take(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_settings_backup_latest() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION fn_settings_backup_latest() TO service_role;
  END IF;
END;
$$;

-- The weekly job: Sundays 01:00 India time (19:30 UTC Saturday)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cercit-settings-backup-weekly';
    PERFORM cron.schedule('cercit-settings-backup-weekly', '30 19 * * 6', 'SELECT fn_settings_backup_take(''WEEKLY'')');
    RAISE NOTICE 'cercit-settings-backup-weekly scheduled for Sundays 01:00 India time';
  ELSE
    RAISE NOTICE 'pg_cron is not switched on: switch it on (Database > Extensions > pg_cron) and run this file again, or run SELECT fn_settings_backup_take(''MANUAL''); by hand';
  END IF;
END;
$$;

-- The first backup, now
SELECT fn_settings_backup_take('MANUAL');

-- Check after running:
-- SELECT kind, taken_at, row_count, (SELECT count(*) FROM jsonb_object_keys(tables)) AS tables FROM settings_backups ORDER BY taken_at DESC;
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'cercit-settings-backup-weekly';
