-- cercit — tenants and feature switches (backlog FD0.1, FD0.3)
--
-- Every new module is built beside the old code and hidden behind a switch in
-- feature_flags. A switch is turned on only after the module passes its checks;
-- the old code is then removed. Screens and database functions both read these
-- switches, and treat a missing table or row as "off", so the live site keeps
-- working before this script is run.
--
-- tenants: one row per lender. Only cercit exists for now; the column is added
-- to new tables from the start so a second lender does not mean touching every
-- table later (decision 0.6).
--
-- Run order: after 014. Safe to re-run.

-- =============================================================================
-- 1. Tenants
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID          NOT NULL,
  code        VARCHAR(30)   NOT NULL,
  name        VARCHAR(200)  NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_tenants      PRIMARY KEY (id),
  CONSTRAINT uq_tenants_code UNIQUE (code)
);

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Fixed id for the default tenant, so later migrations can use it as a column default.
INSERT INTO tenants (id, code, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'cercit', 'cercit Vehicle Finance Ltd')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_default_tenant_id()
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::UUID;
$$;

-- =============================================================================
-- 2. Feature switches
-- =============================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    UUID          NOT NULL DEFAULT fn_default_tenant_id(),
  flag_key     VARCHAR(60)   NOT NULL,
  module       VARCHAR(30)   NOT NULL,
  description  VARCHAR(300)  NOT NULL,
  enabled      BOOLEAN       NOT NULL DEFAULT false,
  changed_by   UUID,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_feature_flags        PRIMARY KEY (id),
  CONSTRAINT uq_feature_flags_key    UNIQUE (tenant_id, flag_key),
  CONSTRAINT fk_feature_flags_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT ck_feature_flags_key    CHECK (flag_key ~ '^[a-z][a-z0-9_]*$')
);

DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every switch change is kept. Turning a module on or off is an event the
-- compliance view must be able to show later.
CREATE TABLE IF NOT EXISTS feature_flag_history (
  id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  flag_id     UUID          NOT NULL,
  tenant_id   UUID          NOT NULL,
  flag_key    VARCHAR(60)   NOT NULL,
  old_enabled BOOLEAN,
  new_enabled BOOLEAN       NOT NULL,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_feature_flag_history PRIMARY KEY (id)
);

-- SECURITY DEFINER: the history table has no insert policy, so the trigger
-- writes with the owner's rights regardless of who changed the switch.
CREATE OR REPLACE FUNCTION trg_feature_flags_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    INSERT INTO feature_flag_history (flag_id, tenant_id, flag_key, old_enabled, new_enabled, changed_by)
    VALUES (
      NEW.id, NEW.tenant_id, NEW.flag_key,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.enabled END,
      NEW.enabled, NEW.changed_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flags_log ON feature_flags;
CREATE TRIGGER trg_feature_flags_log
  AFTER INSERT OR UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION trg_feature_flags_history();

-- =============================================================================
-- 3. Reading a switch from SQL
-- =============================================================================

-- Unknown keys are off. Database functions call this before using new code paths.
CREATE OR REPLACE FUNCTION fn_feature_enabled(
  p_flag_key  TEXT,
  p_tenant_id UUID DEFAULT fn_default_tenant_id()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM feature_flags WHERE tenant_id = p_tenant_id AND flag_key = p_flag_key),
    false
  );
$$;

-- =============================================================================
-- 4. Seed — one switch per module, all off (FD0.3)
-- =============================================================================

INSERT INTO feature_flags (flag_key, module, description) VALUES
  ('server_engine',        'foundation',     'Credit rules evaluated by the server-side engine instead of the browser'),
  ('versioned_policy',     'foundation',     'Rule and price values read from versioned, approved policy records'),
  ('admin_users',          'admin',          'User and role management backed by the database'),
  ('credit_control',       'credit_control', 'Propose / approve / schedule changes to rules and prices'),
  ('kyc_module',           'kyc',            'Consent, KYC methods and customer risk rating in the apply flow'),
  ('underwriting_data',    'underwriting',   'Case screen reads documents, bureau and bank data from the database'),
  ('server_model_score',   'underwriting',   'Risk model scored on the server'),
  ('sanction_documents',   'sanction',       'Key Fact Statement, letters and status emails from the new templates'),
  ('compliance_view',      'compliance',     'Audit trail and version-per-case compliance screens'),
  ('admin_console',        'roof',           'Combined admin console for all module settings')
ON CONFLICT (tenant_id, flag_key) DO NOTHING;

-- =============================================================================
-- 5. Access
-- =============================================================================
-- Switches are readable by everyone (the customer app needs them too). There is
-- no write policy: until the Admin module adds a permission-checked function,
-- switches are changed only by running SQL in the Supabase editor.

ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_tenants" ON tenants;
CREATE POLICY "read_tenants" ON tenants FOR SELECT USING (true);

DROP POLICY IF EXISTS "read_feature_flags" ON feature_flags;
CREATE POLICY "read_feature_flags" ON feature_flags FOR SELECT USING (true);

-- History stays closed to the API until the compliance view exists.

-- =============================================================================
-- 6. How to switch a module on (after its checks pass)
-- =============================================================================
-- UPDATE feature_flags SET enabled = true WHERE flag_key = 'server_engine';
-- SELECT * FROM feature_flag_history ORDER BY changed_at DESC LIMIT 10;
