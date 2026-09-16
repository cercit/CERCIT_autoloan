-- cercit — employer category pricing
-- Adds the employer-category dimension the rate grid page renders.
--
-- rate_grid holds one row per CIBIL decision band (base rate, LTV cap, FOIR cap,
-- tenure cap). fn_generate_recommendation resolves a band from that table, so it
-- is left untouched here. Employer category is the second pricing axis: it loads
-- the band's base rate and tightens the LTV / tenure / fee terms.
--
-- Run order: after 001_schema.sql. Safe to re-run.

CREATE TABLE IF NOT EXISTS employer_category_pricing (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  category_code       VARCHAR(1)    NOT NULL,
  category_label      VARCHAR(80)   NOT NULL,
  description         VARCHAR(200)  NOT NULL,
  rate_loading_pct    DECIMAL(4,2)  NOT NULL DEFAULT 0.00,
  max_ltv_pct         DECIMAL(5,2)  NOT NULL,
  max_tenure_months   SMALLINT      NOT NULL,
  processing_fee_inr  INTEGER       NOT NULL,
  display_order       SMALLINT      NOT NULL,
  policy_version      VARCHAR(10)   NOT NULL,
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_employer_category_pricing PRIMARY KEY (id),
  CONSTRAINT uq_employer_category_pricing UNIQUE (category_code, policy_version),
  CONSTRAINT ck_epc_category_code CHECK (category_code IN ('A', 'B', 'C')),
  CONSTRAINT ck_epc_loading CHECK (rate_loading_pct >= 0)
);

DROP TRIGGER IF EXISTS trg_employer_category_pricing_updated_at ON employer_category_pricing;
CREATE TRIGGER trg_employer_category_pricing_updated_at
  BEFORE UPDATE ON employer_category_pricing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Seed — policy version 2026.08
-- Terms match the Phase 1 salaried grid signed off in the scheme design.
-- =============================================================================

INSERT INTO employer_category_pricing
  (category_code, category_label, description, rate_loading_pct, max_ltv_pct, max_tenure_months, processing_fee_inr, display_order, policy_version)
VALUES
  ('A', 'Category A',
       'Listed companies, central/state government, PSUs and large MNCs',
       0.00, 120.00, 84, 5000, 1, '2026.08'),
  ('B', 'Category B',
       'Established private limited companies with 3+ years of filings',
       0.40, 110.00, 84, 6500, 2, '2026.08'),
  ('C', 'Category C',
       'Small private, unlisted and proprietorship employers',
       1.25,  90.00, 60, 8000, 3, '2026.08')
ON CONFLICT (category_code, policy_version) DO UPDATE SET
  category_label     = EXCLUDED.category_label,
  description        = EXCLUDED.description,
  rate_loading_pct   = EXCLUDED.rate_loading_pct,
  max_ltv_pct        = EXCLUDED.max_ltv_pct,
  max_tenure_months  = EXCLUDED.max_tenure_months,
  processing_fee_inr = EXCLUDED.processing_fee_inr,
  display_order      = EXCLUDED.display_order;

-- =============================================================================
-- RLS — lookup table, readable by anyone (matches rate_grid)
-- =============================================================================

ALTER TABLE employer_category_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_employer_category_pricing" ON employer_category_pricing;
CREATE POLICY "read_employer_category_pricing"
  ON employer_category_pricing FOR SELECT USING (true);
