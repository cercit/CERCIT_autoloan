-- =============================================================================
-- 071: Rate Grid: edit and add grids, through pricing approval (fix list G3)
-- =============================================================================
-- The Rate Grid page could only show the grid. Now:
--   * pricing_products: a grid per product or segment. "New car, salaried"
--     (CAR_NEW_SALARIED) is the one the engine prices with; others (e.g.
--     commercial vehicles, three-wheelers, self-employed) can be added and
--     approved, and are kept until the engine handles those products.
--   * rate_grid_versions, with their bands (score band: rate, max LTV, max
--     FOIR, max tenure) and employer categories (loading, LTV cap, tenure
--     cap, processing fee).
--   * the steps: someone with pricing.author starts a draft from the grid in
--     force (or a blank one for a new product), changes figures, adds bands,
--     and sends it for approval with a date it should start; someone else
--     with pricing.approve approves or rejects it (never the author); an
--     approved grid goes live on its date and the one before it is kept as
--     history (superseded, with an end date).
--   * when the car grid goes live, its figures are written into rate_grid
--     and employer_category_pricing, the tables the engine reads; the older
--     rows are kept, switched off. So every decision was priced on exactly
--     one grid, and fn_rate_grid_version_at(product, time) says which.
--   * the version in force when this runs becomes version 1 (in force since
--     1 Aug 2026, the date of policy 2026.08).
--
-- Every step is written to the audit log (RATE_GRID_*).
-- Run order: after 070. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pricing_products (
  code         VARCHAR(30)  NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  used_by_engine BOOLEAN    NOT NULL DEFAULT false,
  created_by   UUID,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_pricing_products PRIMARY KEY (code),
  CONSTRAINT ck_pricing_products_code CHECK (code ~ '^[A-Z][A-Z0-9_]{2,29}$')
);

INSERT INTO pricing_products (code, name, description, used_by_engine) VALUES
  ('CAR_NEW_SALARIED', 'New car, salaried', 'New car loans for salaried customers: the grid the engine prices with', true)
ON CONFLICT (code) DO UPDATE SET used_by_engine = true;

CREATE TABLE IF NOT EXISTS rate_grid_versions (
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  product_code    VARCHAR(30)  NOT NULL,
  version_no      INTEGER      NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  rationale       TEXT,
  base_version_id UUID,
  authored_by     UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  decision_note   TEXT,
  effective_from  TIMESTAMPTZ,
  effective_to    TIMESTAMPTZ,
  CONSTRAINT pk_rate_grid_versions PRIMARY KEY (id),
  CONSTRAINT uq_rate_grid_versions_no UNIQUE (product_code, version_no),
  CONSTRAINT fk_rate_grid_versions_product FOREIGN KEY (product_code) REFERENCES pricing_products(code),
  CONSTRAINT ck_rate_grid_versions_status CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'REJECTED'))
);
-- one draft or pending grid per product at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_grid_versions_open ON rate_grid_versions (product_code)
  WHERE status IN ('DRAFT', 'PENDING_APPROVAL');

CREATE TABLE IF NOT EXISTS rate_grid_version_bands (
  version_id        UUID          NOT NULL,
  band_label        VARCHAR(20)   NOT NULL,
  score_band_min    SMALLINT      NOT NULL,
  score_band_max    SMALLINT      NOT NULL,
  rate_pct          NUMERIC(5,2)  NOT NULL,
  rate_type         VARCHAR(20)   NOT NULL DEFAULT 'STANDARD',
  max_ltv_pct       NUMERIC(6,2)  NOT NULL,
  max_foir_pct      NUMERIC(5,2)  NOT NULL,
  max_tenure_months SMALLINT      NOT NULL,
  CONSTRAINT pk_rate_grid_version_bands PRIMARY KEY (version_id, score_band_min),
  CONSTRAINT fk_rate_grid_version_bands_version FOREIGN KEY (version_id) REFERENCES rate_grid_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_grid_version_categories (
  version_id         UUID          NOT NULL,
  category_code      CHAR(1)       NOT NULL,
  category_label     VARCHAR(50)   NOT NULL,
  description        VARCHAR(200)  NOT NULL DEFAULT '',
  rate_loading_pct   NUMERIC(5,2)  NOT NULL,
  max_ltv_pct        NUMERIC(6,2)  NOT NULL,
  max_tenure_months  SMALLINT      NOT NULL,
  processing_fee_inr INTEGER       NOT NULL,
  CONSTRAINT pk_rate_grid_version_categories PRIMARY KEY (version_id, category_code),
  CONSTRAINT fk_rate_grid_version_categories_version FOREIGN KEY (version_id) REFERENCES rate_grid_versions(id) ON DELETE CASCADE,
  CONSTRAINT ck_rate_grid_version_categories_code CHECK (category_code IN ('A', 'B', 'C'))
);

ALTER TABLE pricing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid_version_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid_version_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pricing_products, rate_grid_versions, rate_grid_version_bands, rate_grid_version_categories FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Version 1: the grid in use today
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED') THEN
    INSERT INTO rate_grid_versions (product_code, version_no, status, rationale, effective_from, approved_at)
    VALUES ('CAR_NEW_SALARIED', 1, 'ACTIVE', 'The grid in use when grid versions started (3 Oct 2026), from policy 2026.08',
            TIMESTAMPTZ '2026-08-01 00:00:00+05:30', TIMESTAMPTZ '2026-08-01 00:00:00+05:30')
    RETURNING id INTO v_id;
    INSERT INTO rate_grid_version_bands (version_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
                                         max_ltv_pct, max_foir_pct, max_tenure_months)
    SELECT DISTINCT ON (score_band_min) v_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
           max_ltv_pct, max_foir_pct, max_tenure_months
    FROM rate_grid WHERE vehicle_category = 'CAR' AND is_active
    ORDER BY score_band_min, updated_at DESC;
    INSERT INTO rate_grid_version_categories (version_id, category_code, category_label, description, rate_loading_pct,
                                              max_ltv_pct, max_tenure_months, processing_fee_inr)
    SELECT DISTINCT ON (category_code) v_id, category_code, category_label, description, rate_loading_pct,
           max_ltv_pct, max_tenure_months, processing_fee_inr
    FROM employer_category_pricing WHERE is_active
    ORDER BY category_code, updated_at DESC;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Internal: the grid as JSON; checks on a grid; going live
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_rate_grid_json(p_version UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', v.id, 'product_code', v.product_code, 'version_no', v.version_no, 'status', v.status,
    'rationale', v.rationale, 'created_at', v.created_at, 'submitted_at', v.submitted_at,
    'authored_by', (SELECT full_name FROM users WHERE id = v.authored_by),
    'authored_by_me', v.authored_by IS NOT DISTINCT FROM fn_current_staff_id(),
    'approved_by', (SELECT full_name FROM users WHERE id = v.approved_by), 'approved_at', v.approved_at,
    'decision_note', v.decision_note, 'effective_from', v.effective_from, 'effective_to', v.effective_to,
    'bands', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'band_label', b.band_label, 'score_band_min', b.score_band_min, 'score_band_max', b.score_band_max,
                'rate_pct', b.rate_pct, 'rate_type', b.rate_type, 'max_ltv_pct', b.max_ltv_pct,
                'max_foir_pct', b.max_foir_pct, 'max_tenure_months', b.max_tenure_months)
              ORDER BY b.score_band_min DESC), '[]'::jsonb) FROM rate_grid_version_bands b WHERE b.version_id = v.id),
    'categories', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'category_code', c.category_code, 'category_label', c.category_label, 'description', c.description,
                     'rate_loading_pct', c.rate_loading_pct, 'max_ltv_pct', c.max_ltv_pct,
                     'max_tenure_months', c.max_tenure_months, 'processing_fee_inr', c.processing_fee_inr)
                   ORDER BY c.category_code), '[]'::jsonb) FROM rate_grid_version_categories c WHERE c.version_id = v.id))
  FROM rate_grid_versions v WHERE v.id = p_version;
$$;

-- What is wrong with a grid, in words; empty when it can go for approval.
CREATE OR REPLACE FUNCTION fn_rate_grid_problems(p_version UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out  TEXT[] := '{}';
  v_prev rate_grid_version_bands%ROWTYPE;
  b      rate_grid_version_bands%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rate_grid_version_bands WHERE version_id = p_version) THEN
    v_out := v_out || 'add at least one score band';
  END IF;
  FOR b IN SELECT * FROM rate_grid_version_bands WHERE version_id = p_version ORDER BY score_band_min LOOP
    IF b.score_band_min > b.score_band_max OR b.score_band_min < 300 OR b.score_band_max > 900 THEN
      v_out := v_out || format('band %s: scores must run from low to high, within 300-900', b.band_label);
    END IF;
    IF v_prev.version_id IS NOT NULL AND b.score_band_min <> v_prev.score_band_max + 1 THEN
      v_out := v_out || format('bands %s and %s: leave no gap or overlap between scores', v_prev.band_label, b.band_label);
    END IF;
    IF b.rate_pct < 0 OR b.rate_pct > 36 THEN
      v_out := v_out || format('band %s: rate between 0 and 36%%', b.band_label);
    END IF;
    IF b.rate_pct > 0 AND (b.max_ltv_pct <= 0 OR b.max_ltv_pct > 150 OR b.max_foir_pct <= 0 OR b.max_foir_pct > 100
                           OR b.max_tenure_months < 12 OR b.max_tenure_months > 120) THEN
      v_out := v_out || format('band %s: LTV up to 150%%, FOIR up to 100%%, tenure 12-120 months', b.band_label);
    END IF;
    v_prev := b;
  END LOOP;
  IF (SELECT count(*) FROM rate_grid_version_categories WHERE version_id = p_version) <> 3 THEN
    v_out := v_out || 'give all three employer categories, A, B and C';
  END IF;
  IF EXISTS (SELECT 1 FROM rate_grid_version_categories WHERE version_id = p_version
             AND (rate_loading_pct < 0 OR rate_loading_pct > 10 OR max_ltv_pct <= 0 OR max_ltv_pct > 150
                  OR max_tenure_months < 12 OR max_tenure_months > 120 OR processing_fee_inr < 0 OR processing_fee_inr > 100000)) THEN
    v_out := v_out || 'categories: loading 0-10%, LTV up to 150%, tenure 12-120 months, fee up to 1,00,000';
  END IF;
  RETURN v_out;
END;
$$;

-- Approved grids whose date has come go live; the one before is kept as history.
-- For the engine's product the figures are written into the engine's tables.
CREATE OR REPLACE FUNCTION fn_rate_grid_activate_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v  rate_grid_versions%ROWTYPE;
  v_n INTEGER := 0;
  v_code TEXT;
BEGIN
  FOR v IN SELECT * FROM rate_grid_versions WHERE status = 'APPROVED' AND effective_from <= now()
           ORDER BY product_code, effective_from LOOP
    UPDATE rate_grid_versions SET status = 'SUPERSEDED', effective_to = v.effective_from
    WHERE product_code = v.product_code AND status = 'ACTIVE';
    UPDATE rate_grid_versions SET status = 'ACTIVE' WHERE id = v.id;

    IF (SELECT used_by_engine FROM pricing_products WHERE code = v.product_code) THEN
      -- policy_version holds 10 characters; only the engine's product is written here
      v_code := 'RG-v' || v.version_no;
      UPDATE rate_grid SET is_active = false, updated_at = now() WHERE vehicle_category = 'CAR' AND is_active;
      INSERT INTO rate_grid (score_band_min, score_band_max, band_label, rate_pct, rate_type, max_ltv_pct, max_foir_pct,
                             max_tenure_months, vehicle_category, policy_version, is_active)
      SELECT b.score_band_min, b.score_band_max, b.band_label, b.rate_pct, b.rate_type, b.max_ltv_pct, b.max_foir_pct,
             b.max_tenure_months, 'CAR', v_code, true
      FROM rate_grid_version_bands b WHERE b.version_id = v.id;
      UPDATE employer_category_pricing SET is_active = false, updated_at = now() WHERE is_active;
      INSERT INTO employer_category_pricing (category_code, category_label, description, rate_loading_pct, max_ltv_pct,
                                             max_tenure_months, processing_fee_inr, display_order, policy_version, is_active)
      SELECT c.category_code, c.category_label, c.description, c.rate_loading_pct, c.max_ltv_pct, c.max_tenure_months,
             c.processing_fee_inr, ascii(c.category_code) - 64, v_code, true
      FROM rate_grid_version_categories c WHERE c.version_id = v.id
      ON CONFLICT (category_code, policy_version) DO UPDATE SET is_active = true;
    END IF;

    INSERT INTO audit_events (event_type, actor_type, event_detail)
    VALUES ('RATE_GRID_LIVE', 'SYSTEM', jsonb_build_object('product', v.product_code, 'version', v.version_no));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Which grid was in force for a product at a time (e.g. when a case was assessed).
CREATE OR REPLACE FUNCTION fn_rate_grid_version_at(p_product TEXT, p_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', v.id, 'version_no', v.version_no, 'effective_from', v.effective_from, 'effective_to', v.effective_to)
  FROM rate_grid_versions v
  WHERE v.product_code = p_product AND v.status IN ('ACTIVE', 'SUPERSEDED')
    AND v.effective_from <= p_at AND (v.effective_to IS NULL OR v.effective_to > p_at)
  ORDER BY v.effective_from DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_rate_grid_json(UUID), fn_rate_grid_problems(UUID), fn_rate_grid_activate_due()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_rate_grid_version_at(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_rate_grid_version_at(TEXT, TIMESTAMPTZ) TO authenticated;

-- -----------------------------------------------------------------------------
-- Staff functions
-- -----------------------------------------------------------------------------

-- Everything the page shows for one product: products, the grid in force,
-- the open draft or request, history, and what this person may do.
CREATE OR REPLACE FUNCTION fn_rate_grid_overview(p_product TEXT DEFAULT 'CAR_NEW_SALARIED')
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open UUID;
  v_live UUID;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['pricing.view', 'pricing.author', 'pricing.approve',
                                          'app.view.own', 'app.view.team', 'app.view.all']);
  PERFORM fn_rate_grid_activate_due();
  SELECT id INTO v_live FROM rate_grid_versions WHERE product_code = p_product AND status = 'ACTIVE';
  SELECT id INTO v_open FROM rate_grid_versions WHERE product_code = p_product AND status IN ('DRAFT', 'PENDING_APPROVAL');
  RETURN jsonb_build_object(
    'product', p_product,
    'products', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'description', description,
                                                               'used_by_engine', used_by_engine) ORDER BY NOT used_by_engine, name), '[]'::jsonb)
                 FROM pricing_products),
    'in_force', CASE WHEN v_live IS NULL THEN NULL ELSE fn_rate_grid_json(v_live) END,
    'open', CASE WHEN v_open IS NULL THEN NULL ELSE fn_rate_grid_json(v_open) || jsonb_build_object('problems', to_jsonb(fn_rate_grid_problems(v_open))) END,
    'approved_next', (SELECT fn_rate_grid_json(id) FROM rate_grid_versions WHERE product_code = p_product AND status = 'APPROVED'
                      ORDER BY effective_from LIMIT 1),
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', v.id, 'version_no', v.version_no, 'status', v.status, 'rationale', v.rationale,
                   'authored_by', (SELECT full_name FROM users WHERE id = v.authored_by),
                   'approved_by', (SELECT full_name FROM users WHERE id = v.approved_by),
                   'effective_from', v.effective_from, 'effective_to', v.effective_to, 'decision_note', v.decision_note)
                 ORDER BY v.version_no DESC), '[]'::jsonb)
                FROM rate_grid_versions v WHERE v.product_code = p_product),
    'can_author', fn_has_permission('pricing.author'),
    'can_approve', fn_has_permission('pricing.approve')
  );
END;
$$;

-- A new product or segment (it gets a blank draft grid to fill in).
CREATE OR REPLACE FUNCTION fn_rate_grid_product_create(p_code TEXT, p_name TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v_code  TEXT := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '_', 'g'));
BEGIN
  IF v_code !~ '^[A-Z][A-Z0-9_]{2,29}$' OR length(btrim(coalesce(p_name, ''))) < 3 THEN
    RAISE EXCEPTION 'give the product a short code (e.g. CV_SALARIED) and a name' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pricing_products WHERE code = v_code) THEN
    RAISE EXCEPTION 'there is already a product with that code' USING ERRCODE = '23505';
  END IF;
  INSERT INTO pricing_products (code, name, description, used_by_engine, created_by)
  VALUES (v_code, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), false, v_actor);
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_PRODUCT_ADDED', 'USER', v_actor, jsonb_build_object('product', v_code, 'name', btrim(p_name)));
  RETURN fn_rate_grid_draft_create(v_code, 'First grid for ' || btrim(p_name));
END;
$$;

-- Start a draft: a copy of the grid in force, or of the car grid for a new product.
CREATE OR REPLACE FUNCTION fn_rate_grid_draft_create(p_product TEXT, p_rationale TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v_base  UUID;
  v_id    UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_products WHERE code = p_product) THEN
    RAISE EXCEPTION 'no such product' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM rate_grid_versions WHERE product_code = p_product AND status IN ('DRAFT', 'PENDING_APPROVAL')) THEN
    RAISE EXCEPTION 'this product already has a draft or a grid waiting for approval' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_base FROM rate_grid_versions WHERE product_code = p_product AND status = 'ACTIVE';
  IF v_base IS NULL THEN
    SELECT id INTO v_base FROM rate_grid_versions WHERE product_code = 'CAR_NEW_SALARIED' AND status = 'ACTIVE';
  END IF;
  INSERT INTO rate_grid_versions (product_code, version_no, status, rationale, base_version_id, authored_by)
  VALUES (p_product, coalesce((SELECT max(version_no) FROM rate_grid_versions WHERE product_code = p_product), 0) + 1,
          'DRAFT', nullif(btrim(coalesce(p_rationale, '')), ''), v_base, v_actor)
  RETURNING id INTO v_id;
  INSERT INTO rate_grid_version_bands
  SELECT v_id, band_label, score_band_min, score_band_max, rate_pct, rate_type, max_ltv_pct, max_foir_pct, max_tenure_months
  FROM rate_grid_version_bands WHERE version_id = v_base;
  INSERT INTO rate_grid_version_categories
  SELECT v_id, category_code, category_label, description, rate_loading_pct, max_ltv_pct, max_tenure_months, processing_fee_inr
  FROM rate_grid_version_categories WHERE version_id = v_base;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_DRAFTED', 'USER', v_actor, jsonb_build_object('product', p_product, 'version_id', v_id));
  RETURN fn_rate_grid_json(v_id);
END;
$$;

-- Replace the draft's bands and categories (the author only, while a draft).
CREATE OR REPLACE FUNCTION fn_rate_grid_draft_save(p_version UUID, p_bands JSONB, p_categories JSONB, p_rationale TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v rate_grid_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'only a draft can be changed' USING ERRCODE = '22023';
  END IF;
  IF v.authored_by IS DISTINCT FROM v_actor AND NOT fn_is_trusted_operator() THEN
    RAISE EXCEPTION 'only the person who started the draft can change it' USING ERRCODE = '42501';
  END IF;
  DELETE FROM rate_grid_version_bands WHERE version_id = p_version;
  INSERT INTO rate_grid_version_bands (version_id, band_label, score_band_min, score_band_max, rate_pct, rate_type,
                                       max_ltv_pct, max_foir_pct, max_tenure_months)
  SELECT p_version, upper(left(btrim(x->>'band_label'), 20)), (x->>'score_band_min')::SMALLINT, (x->>'score_band_max')::SMALLINT,
         (x->>'rate_pct')::NUMERIC, coalesce(nullif(x->>'rate_type', ''), 'STANDARD'), (x->>'max_ltv_pct')::NUMERIC,
         (x->>'max_foir_pct')::NUMERIC, (x->>'max_tenure_months')::SMALLINT
  FROM jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) x;
  DELETE FROM rate_grid_version_categories WHERE version_id = p_version;
  INSERT INTO rate_grid_version_categories (version_id, category_code, category_label, description, rate_loading_pct,
                                            max_ltv_pct, max_tenure_months, processing_fee_inr)
  SELECT p_version, upper(x->>'category_code'), coalesce(nullif(x->>'category_label', ''), 'Category ' || upper(x->>'category_code')),
         coalesce(x->>'description', ''), (x->>'rate_loading_pct')::NUMERIC, (x->>'max_ltv_pct')::NUMERIC,
         (x->>'max_tenure_months')::SMALLINT, (x->>'processing_fee_inr')::INTEGER
  FROM jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) x;
  IF p_rationale IS NOT NULL THEN
    UPDATE rate_grid_versions SET rationale = nullif(btrim(p_rationale), '') WHERE id = p_version;
  END IF;
  RETURN fn_rate_grid_json(p_version) || jsonb_build_object('problems', to_jsonb(fn_rate_grid_problems(p_version)));
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'two bands start at the same score' USING ERRCODE = '22023';
  WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
    RAISE EXCEPTION 'fill in every figure with a number' USING ERRCODE = '22023';
END;
$$;

-- Send for approval with the date it should start; withdraw back to a draft; discard a draft.
CREATE OR REPLACE FUNCTION fn_rate_grid_submit(p_version UUID, p_effective_from DATE, p_rationale TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v rate_grid_versions%ROWTYPE;
  v_problems TEXT[];
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'DRAFT' OR v.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'you can only send your own draft' USING ERRCODE = '42501';
  END IF;
  IF p_effective_from IS NULL OR p_effective_from < (now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
    RAISE EXCEPTION 'choose a start date from today on' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_rationale, ''))) < 10 THEN
    RAISE EXCEPTION 'say why the grid is changing (a sentence)' USING ERRCODE = '22023';
  END IF;
  v_problems := fn_rate_grid_problems(p_version);
  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION 'fix the grid first: %', array_to_string(v_problems, '; ') USING ERRCODE = '22023';
  END IF;
  UPDATE rate_grid_versions SET status = 'PENDING_APPROVAL', submitted_at = now(), rationale = btrim(p_rationale),
         effective_from = (p_effective_from::TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
  WHERE id = p_version;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_SUBMITTED', 'USER', v_actor,
          jsonb_build_object('product', v.product_code, 'version', v.version_no, 'from', p_effective_from, 'why', btrim(p_rationale)));
  RETURN fn_rate_grid_json(p_version);
END;
$$;

CREATE OR REPLACE FUNCTION fn_rate_grid_withdraw(p_version UUID, p_discard BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.author');
  v rate_grid_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status NOT IN ('DRAFT', 'PENDING_APPROVAL') OR v.authored_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'you can only withdraw or discard your own draft' USING ERRCODE = '42501';
  END IF;
  IF p_discard THEN
    DELETE FROM rate_grid_versions WHERE id = p_version;
    INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
    VALUES ('RATE_GRID_DISCARDED', 'USER', v_actor, jsonb_build_object('product', v.product_code, 'version', v.version_no));
    RETURN NULL;
  END IF;
  UPDATE rate_grid_versions SET status = 'DRAFT', submitted_at = NULL, effective_from = NULL WHERE id = p_version;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('RATE_GRID_WITHDRAWN', 'USER', v_actor, jsonb_build_object('product', v.product_code, 'version', v.version_no));
  RETURN fn_rate_grid_json(p_version);
END;
$$;

-- Approve or reject: pricing.approve, and never the author.
CREATE OR REPLACE FUNCTION fn_rate_grid_decide(p_version UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('pricing.approve');
  v rate_grid_versions%ROWTYPE;
BEGIN
  SELECT * INTO v FROM rate_grid_versions WHERE id = p_version FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'no grid waiting for approval with that id' USING ERRCODE = 'P0002';
  END IF;
  IF v.authored_by IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'a second person must approve a rate grid' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND length(btrim(coalesce(p_note, ''))) < 5 THEN
    RAISE EXCEPTION 'say why it is rejected' USING ERRCODE = '22023';
  END IF;
  UPDATE rate_grid_versions SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         approved_by = v_actor, approved_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = p_version;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (CASE WHEN p_approve THEN 'RATE_GRID_APPROVED' ELSE 'RATE_GRID_REJECTED' END, 'USER', v_actor,
          jsonb_build_object('product', v.product_code, 'version', v.version_no, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  IF p_approve THEN
    PERFORM fn_rate_grid_activate_due();
  END IF;
  RETURN fn_rate_grid_json(p_version);
END;
$$;

REVOKE ALL ON FUNCTION fn_rate_grid_overview(TEXT), fn_rate_grid_product_create(TEXT, TEXT, TEXT),
                       fn_rate_grid_draft_create(TEXT, TEXT), fn_rate_grid_draft_save(UUID, JSONB, JSONB, TEXT),
                       fn_rate_grid_submit(UUID, DATE, TEXT), fn_rate_grid_withdraw(UUID, BOOLEAN),
                       fn_rate_grid_decide(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_rate_grid_overview(TEXT), fn_rate_grid_product_create(TEXT, TEXT, TEXT),
                          fn_rate_grid_draft_create(TEXT, TEXT), fn_rate_grid_draft_save(UUID, JSONB, JSONB, TEXT),
                          fn_rate_grid_submit(UUID, DATE, TEXT), fn_rate_grid_withdraw(UUID, BOOLEAN),
                          fn_rate_grid_decide(UUID, BOOLEAN, TEXT) TO authenticated;

-- The officer's employer card also names the grid in force when the case was
-- assessed (070's function, with that one key added).
CREATE OR REPLACE FUNCTION fn_staff_case_employer(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_sc  RECORD;
  v_emp JSONB;
  v_rec recommendations%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT * INTO v_app FROM applications WHERE application_id = p_application_id;
  SELECT * INTO v_sc FROM fn_staff_case_scope();
  IF v_app.id IS NULL OR (v_app.origin = 'CUSTOMER' AND NOT fn_sees_real_customers())
     OR NOT (v_sc.sees_all OR v_app.assigned_officer_id = v_sc.me OR (v_app.assigned_officer_id IS NULL AND v_sc.unassigned)) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  v_emp := fn_employer_for_application(v_app.id);
  SELECT * INTO v_rec FROM recommendations WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'employer', v_emp,
    'declared_name', (SELECT employer_name FROM customers WHERE id = v_app.customer_id),
    'declared_type', (SELECT employer_category FROM customers WHERE id = v_app.customer_id),
    'category', coalesce(v_rec.employer_category, v_app.employer_category),
    'basis', coalesce(v_rec.employer_category_basis, v_app.employer_category_basis),
    'pricing', CASE WHEN v_rec.employer_category IS NULL THEN NULL ELSE jsonb_build_object(
                 'base_rate_pct', v_rec.base_rate_pct, 'rate_loading_pct', v_rec.rate_loading_pct,
                 'rate_pct', v_rec.recommended_rate, 'processing_fee_inr', v_rec.processing_fee_inr,
                 'ltv_cap_pct', v_rec.category_ltv_cap_pct, 'tenure_cap', v_rec.category_tenure_cap,
                 'assessed_at', v_rec.created_at,
                 'rate_grid', fn_rate_grid_version_at('CAR_NEW_SALARIED', v_rec.created_at)) END
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_staff_case_employer(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_case_employer(TEXT) TO authenticated;

-- Checks after running:
-- SELECT product_code, version_no, status FROM rate_grid_versions;   -- CAR_NEW_SALARIED, 1, ACTIVE
-- SELECT count(*) FROM rate_grid_version_bands;                     -- 3 (the bands in use)
