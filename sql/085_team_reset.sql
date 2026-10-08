-- =============================================================================
-- 085: the Admin undoes what the team logins changed outside cases (9 Oct 2026)
-- =============================================================================
-- The Head, Manager and Officer logins (082-084) can be filled in from the
-- sign-in page, so anyone may use them. Their work on cases stays. Everything
-- else they change, the Admin can undo with one button (Users page):
--
--   * policy drafts they wrote, not yet approved      -> CANCELLED
--   * rate grid drafts they wrote, not yet approved   -> REJECTED
--   * role change requests they made, still pending   -> WITHDRAWN
--   * employer category requests, still pending       -> WITHDRAWN
--   * policy simulations they ran                     -> deleted
--   * employers, document-check switches and rate products they added,
--     changed or removed -> put back exactly as they were (from a journal)
--
-- Whatever the Admin already approved stays: that was the Admin's decision.
-- The journal: a trigger on those settings tables saves a row's "before" copy
-- whenever a team login changes it. Nothing is journaled for anyone else.
-- Which logins count as the team: team_reset_accounts (the three emails).
--
--   SELECT fn_team_pending();   -- what would be undone (counts)
--   SELECT fn_team_reset();     -- undo it (Admin, or the SQL editor)
--
-- Run order: after 084. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS team_reset_accounts (
  email VARCHAR(255) NOT NULL,
  CONSTRAINT pk_team_reset_accounts PRIMARY KEY (email)
);
INSERT INTO team_reset_accounts (email) VALUES
  ('cercit+head@gmail.com'), ('cercit+manager@gmail.com'), ('cercit+officer@gmail.com')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS team_change_journal (
  id          BIGSERIAL    NOT NULL,
  table_name  TEXT         NOT NULL,
  pk          JSONB        NOT NULL,
  op          TEXT         NOT NULL,
  before      JSONB,
  actor_id    UUID         NOT NULL,
  at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  undone_at   TIMESTAMPTZ,
  CONSTRAINT pk_team_change_journal PRIMARY KEY (id),
  CONSTRAINT ck_team_change_journal_op CHECK (op IN ('INSERT', 'UPDATE', 'DELETE'))
);
CREATE INDEX IF NOT EXISTS ix_team_change_journal_open ON team_change_journal (table_name, at) WHERE undone_at IS NULL;
ALTER TABLE team_reset_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_change_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON team_reset_accounts, team_change_journal FROM anon, authenticated;

-- The signed-in team login, or NULL for anyone else
CREATE OR REPLACE FUNCTION fn_team_actor()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM users u
  JOIN team_reset_accounts t ON lower(t.email) = lower(u.email)
  WHERE auth.uid() IS NOT NULL AND u.auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION fn_team_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(u.id), '{}') FROM users u
  JOIN team_reset_accounts t ON lower(t.email) = lower(u.email);
$$;

-- Trigger: TG_ARGV holds the table's key columns
CREATE OR REPLACE FUNCTION trg_team_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_team_actor();
  v_row   JSONB;
  v_pk    JSONB := '{}';
  v_col   TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_row := to_jsonb(COALESCE(NEW, OLD));
  FOREACH v_col IN ARRAY TG_ARGV LOOP
    v_pk := v_pk || jsonb_build_object(v_col, v_row -> v_col);
  END LOOP;
  INSERT INTO team_change_journal (table_name, pk, op, before, actor_id)
  VALUES (TG_TABLE_NAME, v_pk, TG_OP, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, v_actor);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('employers', ARRAY['id']),
      ('document_check_rules', ARRAY['doc_type', 'check_code']),
      ('document_auto_settings', ARRAY['id']),
      ('document_auto_policy', ARRAY['doc_type']),
      ('pricing_products', ARRAY['code'])) v(tbl, keys)
  LOOP
    CONTINUE WHEN to_regclass('public.' || t.tbl) IS NULL;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_team_journal ON %I', t.tbl);
    EXECUTE format('CREATE TRIGGER trg_team_journal AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_team_journal(%s)',
                   t.tbl, (SELECT string_agg(quote_literal(k), ', ') FROM unnest(t.keys) k));
  END LOOP;
END;
$$;

-- What would be undone
CREATE OR REPLACE FUNCTION fn_team_pending()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team UUID[] := fn_team_ids();
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    PERFORM fn_require_permission('user.manage');
  END IF;
  RETURN jsonb_build_object(
    'policy_drafts',    (SELECT count(*) FROM policy_versions WHERE authored_by = ANY (v_team) AND status IN ('DRAFT', 'PENDING_APPROVAL')),
    'rate_drafts',      (SELECT count(*) FROM rate_grid_versions WHERE authored_by = ANY (v_team) AND status IN ('DRAFT', 'PENDING_APPROVAL')),
    'role_requests',    (SELECT count(*) FROM role_change_requests WHERE requested_by = ANY (v_team) AND status = 'PENDING'),
    'category_requests',(SELECT count(*) FROM employer_category_changes WHERE requested_by = ANY (v_team) AND status = 'PENDING'),
    'simulations',      (SELECT count(*) FROM policy_simulations WHERE run_by = ANY (v_team)),
    'settings_rows',    (SELECT count(DISTINCT (table_name, pk)) FROM team_change_journal WHERE undone_at IS NULL));
END;
$$;

-- Undo it
CREATE OR REPLACE FUNCTION fn_team_reset()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team    UUID[] := fn_team_ids();
  v_by      UUID;
  v_out     JSONB;
  v_n       INTEGER;
  v_rows    INTEGER := 0;
  v_skipped INTEGER := 0;
  j         RECORD;
  v_cols    TEXT;
  v_keys    TEXT;
  v_exists  BOOLEAN;
BEGIN
  IF NOT fn_is_trusted_operator() THEN
    v_by := fn_require_permission('user.manage');
  END IF;
  v_out := fn_team_pending();

  UPDATE policy_versions SET status = 'CANCELLED', updated_at = now()
  WHERE authored_by = ANY (v_team) AND status IN ('DRAFT', 'PENDING_APPROVAL');
  UPDATE rate_grid_versions SET status = 'REJECTED', decision_note = 'Undone by the Admin (team reset)'
  WHERE authored_by = ANY (v_team) AND status IN ('DRAFT', 'PENDING_APPROVAL');
  UPDATE role_change_requests SET status = 'WITHDRAWN', decided_at = now(), decision_note = 'Undone by the Admin (team reset)'
  WHERE requested_by = ANY (v_team) AND status = 'PENDING';
  UPDATE employer_category_changes SET status = 'WITHDRAWN', decided_at = now(), decision_note = 'Undone by the Admin (team reset)'
  WHERE requested_by = ANY (v_team) AND status = 'PENDING';
  DELETE FROM policy_simulations WHERE run_by = ANY (v_team);

  -- Settings rows: back to how they were before the team's first change
  FOR j IN
    SELECT DISTINCT ON (table_name, pk) table_name, pk, op, before
    FROM team_change_journal WHERE undone_at IS NULL
    ORDER BY table_name, pk, at, id
  LOOP
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
    WHERE a.attrelid = ('public.' || j.table_name)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';
    SELECT string_agg(format('%I', k), ', ') INTO v_keys FROM jsonb_object_keys(j.pk) k;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I, $1)))',
                   j.table_name, v_keys, v_keys, j.table_name) INTO v_exists USING j.pk;
    BEGIN
      IF j.op = 'INSERT' THEN
        -- added by the team: remove it, unless a case already uses it
        IF j.table_name = 'employers' AND EXISTS (SELECT 1 FROM applications WHERE employer_id = (j.pk->>'id')::UUID) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
        IF j.table_name = 'pricing_products' THEN
          DELETE FROM rate_grid_versions WHERE product_code = j.pk->>'code' AND status NOT IN ('ACTIVE', 'SUPERSEDED', 'APPROVED');
        END IF;
        EXECUTE format('DELETE FROM %I WHERE (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I, $1))',
                       j.table_name, v_keys, v_keys, j.table_name) USING j.pk;
      ELSIF v_exists THEN
        EXECUTE format('UPDATE %I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I, $1)) WHERE (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I, $2))',
                       j.table_name, v_cols, v_cols, j.table_name, v_keys, v_keys, j.table_name) USING j.before, j.pk;
      ELSE
        EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_record(NULL::%I, $1)',
                       j.table_name, v_cols, v_cols, j.table_name) USING j.before;
      END IF;
      v_rows := v_rows + 1;
    EXCEPTION WHEN foreign_key_violation OR unique_violation THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;
  UPDATE team_change_journal SET undone_at = now() WHERE undone_at IS NULL;

  v_out := v_out || jsonb_build_object('settings_rows_restored', v_rows, 'settings_rows_kept', v_skipped);
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('TEAM_RESET', CASE WHEN v_by IS NULL THEN 'SYSTEM' ELSE 'USER' END, v_by, v_out);
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION fn_team_reset(), fn_team_pending(), fn_team_actor(), fn_team_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_team_reset(), fn_team_pending() TO authenticated;

-- Checks after running:
-- SELECT fn_team_pending();                                        -- all zero to start
-- SELECT tgrelid::regclass FROM pg_trigger WHERE tgname = 'trg_team_journal';  -- 5 tables
