-- cercit — versioned, approved policy (backlog FD1.2, FD1.4)
-- Design: docs/design/FD1-versioned-policy.md
--
-- A policy version is a complete snapshot for one product: the rules document
-- (GoRules Zen decision model) plus every setting (rates, caps, charges). It is
-- edited only as a DRAFT, approved by someone other than its author, and
-- becomes ACTIVE on its effective date. Nothing is overwritten or deleted.
--
-- This script creates the tables, the guards and the read functions. Submit /
-- approve / activate functions come with Credit control (CC1). The seed for
-- version 2026.08 is in 017.
--
-- Run order: after 015. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- 1. Parameter definitions — what each setting is
-- =============================================================================

CREATE TABLE IF NOT EXISTS parameter_definitions (
  param_key       VARCHAR(80)   NOT NULL,
  section         VARCHAR(40)   NOT NULL,
  label           VARCHAR(120)  NOT NULL,
  value_type      VARCHAR(20)   NOT NULL,
  unit            VARCHAR(20),
  min_value       NUMERIC,
  max_value       NUMERIC,
  allowed_values  JSONB,
  owner_role      VARCHAR(30)   NOT NULL DEFAULT 'policy_manager',
  approver_role   VARCHAR(30)   NOT NULL DEFAULT 'credit_head',
  is_locked       BOOLEAN       NOT NULL DEFAULT false,
  regulatory_ref  VARCHAR(300),
  description     VARCHAR(500),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_parameter_definitions PRIMARY KEY (param_key),
  CONSTRAINT ck_param_key_format CHECK (param_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  CONSTRAINT ck_param_value_type CHECK (value_type IN ('number', 'percent', 'amount_inr', 'months', 'score', 'boolean', 'text', 'list'))
);

DROP TRIGGER IF EXISTS trg_parameter_definitions_updated_at ON parameter_definitions;
CREATE TRIGGER trg_parameter_definitions_updated_at
  BEFORE UPDATE ON parameter_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2. Policy versions
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_versions (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        UUID          NOT NULL DEFAULT fn_default_tenant_id(),
  product          VARCHAR(30)   NOT NULL DEFAULT 'CAR_NEW',
  version_code     VARCHAR(20)   NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
  tier             VARCHAR(12),
  base_version_id  UUID,
  is_baseline      BOOLEAN       NOT NULL DEFAULT false,
  rationale        TEXT          NOT NULL,
  regulatory_ref   VARCHAR(300),
  authored_by      UUID,
  submitted_at     TIMESTAMPTZ,
  approved_by      UUID,
  approved_at      TIMESTAMPTZ,
  effective_from   TIMESTAMPTZ,
  effective_to     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_versions        PRIMARY KEY (id),
  CONSTRAINT uq_policy_versions_code   UNIQUE (tenant_id, product, version_code),
  CONSTRAINT fk_policy_versions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_policy_versions_base   FOREIGN KEY (base_version_id) REFERENCES policy_versions(id),
  CONSTRAINT fk_policy_versions_author FOREIGN KEY (authored_by) REFERENCES users(id),
  CONSTRAINT fk_policy_versions_approver FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT ck_policy_versions_status CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT ck_policy_versions_tier   CHECK (tier IS NULL OR tier IN ('MATERIAL', 'STANDARD', 'COSMETIC')),
  -- Guard 1: nobody approves their own change
  CONSTRAINT ck_policy_versions_four_eyes CHECK (approved_by IS NULL OR authored_by IS NULL OR approved_by <> authored_by),
  -- Anything approved or live must say who approved it, unless it is the pre-governance baseline
  CONSTRAINT ck_policy_versions_approval_recorded CHECK (
    status NOT IN ('APPROVED', 'ACTIVE', 'SUPERSEDED') OR is_baseline OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT ck_policy_versions_live_has_start CHECK (status NOT IN ('APPROVED', 'ACTIVE', 'SUPERSEDED') OR effective_from IS NOT NULL),
  CONSTRAINT ck_policy_versions_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- Guard 5: live windows never overlap
  CONSTRAINT ex_policy_versions_window EXCLUDE USING gist (
    tenant_id WITH =,
    product WITH =,
    tstzrange(effective_from, effective_to) WITH &&
  ) WHERE (status IN ('ACTIVE', 'SUPERSEDED'))
);

-- Guard 3: one ACTIVE version per tenant and product
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_versions_one_active
  ON policy_versions (tenant_id, product) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_policy_versions_effective
  ON policy_versions (tenant_id, product, effective_from DESC);

DROP TRIGGER IF EXISTS trg_policy_versions_updated_at ON policy_versions;
CREATE TRIGGER trg_policy_versions_updated_at
  BEFORE UPDATE ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Guards 2 and 6: allowed status moves, frozen fields once submitted, no deletes
CREATE OR REPLACE FUNCTION trg_policy_versions_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allowed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'policy versions are never deleted (version %)', OLD.version_code;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'a new policy version must start as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := (OLD.status, NEW.status) IN (
      ('DRAFT', 'PENDING_APPROVAL'),
      ('DRAFT', 'CANCELLED'),
      ('PENDING_APPROVAL', 'DRAFT'),
      ('PENDING_APPROVAL', 'REJECTED'),
      ('PENDING_APPROVAL', 'APPROVED'),
      ('APPROVED', 'ACTIVE'),
      ('APPROVED', 'CANCELLED'),
      ('ACTIVE', 'SUPERSEDED')
    ) OR (OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE' AND OLD.is_baseline);

    IF NOT allowed THEN
      RAISE EXCEPTION 'policy version % cannot move from % to %', OLD.version_code, OLD.status, NEW.status;
    END IF;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.product IS DISTINCT FROM OLD.product
       OR NEW.version_code IS DISTINCT FROM OLD.version_code
       OR NEW.base_version_id IS DISTINCT FROM OLD.base_version_id
       OR NEW.is_baseline IS DISTINCT FROM OLD.is_baseline
       OR NEW.rationale IS DISTINCT FROM OLD.rationale
       OR NEW.regulatory_ref IS DISTINCT FROM OLD.regulatory_ref
       OR NEW.authored_by IS DISTINCT FROM OLD.authored_by
       OR NEW.tier IS DISTINCT FROM OLD.tier THEN
      RAISE EXCEPTION 'policy version % is % and can no longer be edited', OLD.version_code, OLD.status;
    END IF;

    IF OLD.status IN ('APPROVED', 'ACTIVE', 'SUPERSEDED', 'REJECTED', 'CANCELLED')
       AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
      RAISE EXCEPTION 'approval of policy version % is already recorded', OLD.version_code;
    END IF;

    IF OLD.status IN ('ACTIVE', 'SUPERSEDED') AND NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
      RAISE EXCEPTION 'start date of live policy version % cannot change', OLD.version_code;
    END IF;

    IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND NOT (OLD.status = 'ACTIVE' AND NEW.status = 'SUPERSEDED' AND OLD.effective_to IS NULL) THEN
      RAISE EXCEPTION 'end date of policy version % can only be set when it is superseded', OLD.version_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_versions_guard ON policy_versions;
CREATE TRIGGER trg_policy_versions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION trg_policy_versions_guard();

-- =============================================================================
-- 3. Content: rules document and parameters (editable only while DRAFT)
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_documents (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  policy_version_id UUID          NOT NULL,
  engine            VARCHAR(20)   NOT NULL DEFAULT 'zen',
  document          JSONB         NOT NULL,
  document_sha256   VARCHAR(64)   NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_documents          PRIMARY KEY (id),
  CONSTRAINT uq_policy_documents_version  UNIQUE (policy_version_id),
  CONSTRAINT fk_policy_documents_version  FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
  CONSTRAINT ck_policy_documents_engine   CHECK (engine IN ('zen'))
);

CREATE TABLE IF NOT EXISTS policy_parameters (
  policy_version_id UUID          NOT NULL,
  param_key         VARCHAR(80)   NOT NULL,
  value             JSONB         NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_parameters         PRIMARY KEY (policy_version_id, param_key),
  CONSTRAINT fk_policy_parameters_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
  CONSTRAINT fk_policy_parameters_key     FOREIGN KEY (param_key) REFERENCES parameter_definitions(param_key)
);

CREATE OR REPLACE FUNCTION trg_policy_content_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_id     UUID;
BEGIN
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.policy_version_id ELSE NEW.policy_version_id END;
  SELECT status INTO v_status FROM policy_versions WHERE id = v_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'content of policy version with status % cannot change', v_status;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id THEN
    RAISE EXCEPTION 'content cannot be moved to another policy version';
  END IF;
  IF TG_TABLE_NAME = 'policy_documents' AND TG_OP <> 'DELETE' THEN
    NEW.document_sha256 := encode(sha256(convert_to(NEW.document::text, 'UTF8')), 'hex');
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_documents_guard ON policy_documents;
CREATE TRIGGER trg_policy_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON policy_documents
  FOR EACH ROW EXECUTE FUNCTION trg_policy_content_guard();

DROP TRIGGER IF EXISTS trg_policy_parameters_guard ON policy_parameters;
CREATE TRIGGER trg_policy_parameters_guard
  BEFORE INSERT OR UPDATE OR DELETE ON policy_parameters
  FOR EACH ROW EXECUTE FUNCTION trg_policy_content_guard();

-- Parameter values must fit their definition
CREATE OR REPLACE FUNCTION trg_policy_parameters_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  d parameter_definitions%ROWTYPE;
  n NUMERIC;
BEGIN
  SELECT * INTO d FROM parameter_definitions WHERE param_key = NEW.param_key;

  IF d.value_type IN ('number', 'percent', 'amount_inr', 'months', 'score') THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN
      RAISE EXCEPTION '% must be a number', NEW.param_key;
    END IF;
    n := (NEW.value #>> '{}')::NUMERIC;
    IF d.min_value IS NOT NULL AND n < d.min_value THEN
      RAISE EXCEPTION '% = % is below the minimum %', NEW.param_key, n, d.min_value;
    END IF;
    IF d.max_value IS NOT NULL AND n > d.max_value THEN
      RAISE EXCEPTION '% = % is above the maximum %', NEW.param_key, n, d.max_value;
    END IF;
  ELSIF d.value_type = 'boolean' AND jsonb_typeof(NEW.value) <> 'boolean' THEN
    RAISE EXCEPTION '% must be true or false', NEW.param_key;
  ELSIF d.value_type = 'text' AND jsonb_typeof(NEW.value) <> 'string' THEN
    RAISE EXCEPTION '% must be text', NEW.param_key;
  ELSIF d.value_type = 'list' AND jsonb_typeof(NEW.value) <> 'array' THEN
    RAISE EXCEPTION '% must be a list', NEW.param_key;
  END IF;

  IF d.allowed_values IS NOT NULL AND NOT (d.allowed_values @> jsonb_build_array(NEW.value)) THEN
    RAISE EXCEPTION '% = % is not an allowed value', NEW.param_key, NEW.value;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_parameters_validate ON policy_parameters;
CREATE TRIGGER trg_policy_parameters_validate
  BEFORE INSERT OR UPDATE ON policy_parameters
  FOR EACH ROW EXECUTE FUNCTION trg_policy_parameters_validate();

-- =============================================================================
-- 4. Change requests, reviews, impact checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_change_requests (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL DEFAULT fn_default_tenant_id(),
  policy_version_id UUID          NOT NULL,
  title             VARCHAR(200)  NOT NULL,
  summary           TEXT,
  requested_by      UUID,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_change_requests         PRIMARY KEY (id),
  CONSTRAINT fk_policy_change_requests_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
  CONSTRAINT fk_policy_change_requests_user    FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS policy_change_reviews (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  change_request_id UUID          NOT NULL,
  reviewer_id       UUID          NOT NULL,
  decision          VARCHAR(12)   NOT NULL,
  comment           TEXT,
  reviewed_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_change_reviews      PRIMARY KEY (id),
  CONSTRAINT fk_policy_change_reviews_cr   FOREIGN KEY (change_request_id) REFERENCES policy_change_requests(id),
  CONSTRAINT fk_policy_change_reviews_user FOREIGN KEY (reviewer_id) REFERENCES users(id),
  CONSTRAINT ck_policy_change_reviews_decision CHECK (decision IN ('APPROVE', 'REJECT', 'RETURN'))
);

-- A reviewer can never be the author of the version under review
CREATE OR REPLACE FUNCTION trg_policy_change_reviews_four_eyes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_author UUID;
BEGIN
  SELECT pv.authored_by INTO v_author
  FROM policy_change_requests cr
  JOIN policy_versions pv ON pv.id = cr.policy_version_id
  WHERE cr.id = NEW.change_request_id;

  IF v_author IS NOT NULL AND v_author = NEW.reviewer_id THEN
    RAISE EXCEPTION 'the author of a policy change cannot review it';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_change_reviews_four_eyes ON policy_change_reviews;
CREATE TRIGGER trg_policy_change_reviews_four_eyes
  BEFORE INSERT OR UPDATE ON policy_change_reviews
  FOR EACH ROW EXECUTE FUNCTION trg_policy_change_reviews_four_eyes();

CREATE TABLE IF NOT EXISTS policy_simulations (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  policy_version_id UUID          NOT NULL,
  compared_to_id    UUID,
  sample_size       INTEGER       NOT NULL,
  flips             JSONB         NOT NULL DEFAULT '{}'::jsonb,
  summary           JSONB         NOT NULL DEFAULT '{}'::jsonb,
  run_by            UUID,
  run_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_simulations          PRIMARY KEY (id),
  CONSTRAINT fk_policy_simulations_version  FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id),
  CONSTRAINT fk_policy_simulations_compared FOREIGN KEY (compared_to_id) REFERENCES policy_versions(id)
);

-- =============================================================================
-- 5. Read functions (FD1.4)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_policy_version_at(
  p_product   TEXT DEFAULT 'CAR_NEW',
  p_at        TIMESTAMPTZ DEFAULT now(),
  p_tenant_id UUID DEFAULT fn_default_tenant_id()
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM policy_versions
  WHERE tenant_id = p_tenant_id
    AND product = p_product
    AND status IN ('ACTIVE', 'SUPERSEDED')
    AND effective_from <= p_at
    AND (effective_to IS NULL OR effective_to > p_at)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_policy_param(
  p_key       TEXT,
  p_product   TEXT DEFAULT 'CAR_NEW',
  p_at        TIMESTAMPTZ DEFAULT now(),
  p_tenant_id UUID DEFAULT fn_default_tenant_id()
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT pp.value
  FROM policy_parameters pp
  WHERE pp.policy_version_id = fn_policy_version_at(p_product, p_at, p_tenant_id)
    AND pp.param_key = p_key;
$$;

CREATE OR REPLACE FUNCTION fn_policy_document_at(
  p_product   TEXT DEFAULT 'CAR_NEW',
  p_at        TIMESTAMPTZ DEFAULT now(),
  p_tenant_id UUID DEFAULT fn_default_tenant_id()
)
RETURNS TABLE (policy_version_id UUID, version_code VARCHAR, engine VARCHAR, document JSONB, document_sha256 VARCHAR)
LANGUAGE sql
STABLE
AS $$
  SELECT pv.id, pv.version_code, pd.engine, pd.document, pd.document_sha256
  FROM policy_versions pv
  JOIN policy_documents pd ON pd.policy_version_id = pv.id
  WHERE pv.id = fn_policy_version_at(p_product, p_at, p_tenant_id);
$$;

-- =============================================================================
-- 6. Access
-- =============================================================================
-- Read-only through the API for now. Writes come through permission-checked
-- functions in Credit control; until then, only the SQL editor can write.

ALTER TABLE parameter_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_parameters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_change_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_change_reviews   ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_simulations      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_parameter_definitions" ON parameter_definitions;
CREATE POLICY "read_parameter_definitions" ON parameter_definitions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_policy_versions" ON policy_versions;
CREATE POLICY "read_policy_versions" ON policy_versions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_policy_documents" ON policy_documents;
CREATE POLICY "read_policy_documents" ON policy_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_policy_parameters" ON policy_parameters;
CREATE POLICY "read_policy_parameters" ON policy_parameters
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_policy_change_requests" ON policy_change_requests;
CREATE POLICY "read_policy_change_requests" ON policy_change_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_policy_change_reviews" ON policy_change_reviews;
CREATE POLICY "read_policy_change_reviews" ON policy_change_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "read_policy_simulations" ON policy_simulations;
CREATE POLICY "read_policy_simulations" ON policy_simulations
  FOR SELECT TO authenticated USING (true);
