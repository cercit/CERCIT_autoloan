-- =============================================================================
-- 053: Bureau detail (two bureaus, worst-of)
-- =============================================================================
-- Every credit check now pulls two bureaus: CIBIL and one other (Experian,
-- CRIF or Equifax). Each pull keeps its own summary, every account with a
-- 24-month late-payment grid, and every enquiry. The two are combined by fixed
-- rules into one COMBINED summary:
--   - the score is CIBIL's; the other bureau's only when CIBIL has no record
--     (a gap above 50 points is flagged) (D6);
--   - the same loan on both bureaus is matched through lender aliases and the
--     product map, so it counts once (R12);
--   - bad marks take the worse of the two, and a mark on one bureau still counts;
--   - a loan still open on either bureau is still owed: balances, EMIs and
--     active counts treat a matched loan as open if any copy is ACTIVE;
--   - monthly obligation = EMIs + 5% of card and overdraft balances (R11).
--
-- The engine's rules are not changed. bureau_reports keeps exactly ONE row per
-- application: for a 053 pull it is the COMBINED row, still named
-- 'CIBIL-SIMULATED', with total_monthly_emi = the monthly obligation.
-- Old rows (v1 simulated, staff 'CIBIL' rows, seeds) and their decisions stay.
--
-- Engine fix (section 12): fn_run_policy_engine (004) and
-- fn_generate_recommendation (031) read a rate row that is only filled when
-- there is a score, so an application with no record at either bureau stopped
-- with 'record "rate_row" is not assigned yet'. Both are redefined here with
-- their bodies unchanged except rate_row declared as rate_grid%ROWTYPE; the
-- policy engine also applies D6 (FD4): no bureau score never passes, the case
-- goes to a person (MISSING_DATA). Re-running 004 or 031 after this file
-- restores the crash; re-run 053 after them.
--
-- Not in 053: R11's "no record on both bureaus = reject" (needs a policy
-- change), PRD decision 13 (EMIs ending within 3 months are shown, not
-- removed), bureau_profile_items, the obligation_details link, new policy facts.
--
-- One-place switches (each is the only place its rule lives):
--   fn_bureau_revolving_rate()     0.05: share of card/overdraft balance counted
--   fn_bureau_revolving_in_foir()  true: that 5% is inside total_monthly_emi
--                                  (each summary row records the value it was
--                                  worked out under, in revolving_counted)
--   fn_bureau_combine_arrays       CIBIL-first score (see "score:" in its body)
--   fn_bureau_measures             which accounts count ("counted" in its body)
--
-- Warning: re-running 048 or 052 after this file puts back their one-bureau
-- versions of fn_simulated_bureau and fn_customer_checks_core. Re-run 053
-- after them.
--
-- Run order: after 052. Safe to re-run.

-- =============================================================================
-- 1. Pure helpers
-- =============================================================================
-- Core functions only (md5, decode, get_byte, regexp_replace): no pgcrypto.

-- A lender's name reduced to a key, as the browser engine's normLender does.
-- Postgres regex: \y is a word boundary (\b means backspace).
CREATE OR REPLACE FUNCTION fn_lender_key(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT nullif(regexp_replace(regexp_replace(lower(coalesce(p, '')),
         '\y(bank|ltd|limited|finance|financial|finserv|services|corp)\y', '', 'g'), '[^a-z0-9]', '', 'g'), '');
$$;

-- A bureau's product name reduced to a key.
CREATE OR REPLACE FUNCTION fn_product_key(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
$$;

-- R11: cards and overdrafts have no EMI, so this share of the OUTSTANDING
-- counts as their monthly obligation. The only place the number lives.
CREATE OR REPLACE FUNCTION fn_bureau_revolving_rate()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT 0.05::NUMERIC;
$$;

-- true: the 5% is part of total_monthly_emi (and so of FOIR).
-- false: it is still worked out and shown, but left out of the obligation.
-- Rows already stored keep the value they were worked out under
-- (bureau_summary.revolving_counted), so changing this never invalidates them.
CREATE OR REPLACE FUNCTION fn_bureau_revolving_in_foir()
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT true;
$$;

-- An instalment in any payment frequency, as a monthly amount.
CREATE OR REPLACE FUNCTION fn_bureau_monthly_emi(p_emi INTEGER, p_freq CHAR(1))
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN p_emi IS NULL THEN NULL
              WHEN p_freq = 'B' THEN round(p_emi / 2.0)
              WHEN p_freq = 'Q' THEN round(p_emi / 3.0)
              WHEN p_freq = 'H' THEN round(p_emi / 6.0)
              WHEN p_freq = 'Y' THEN round(p_emi / 12.0)
              WHEN p_freq = 'F' THEN round(p_emi * 26 / 12.0)
              WHEN p_freq = 'W' THEN round(p_emi * 52 / 12.0)
              ELSE p_emi END::INTEGER;
$$;

-- Whole calendar months from one date to another.
CREATE OR REPLACE FUNCTION fn_months_between(p_from DATE, p_to DATE)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT ((extract(year FROM p_to) * 12 + extract(month FROM p_to)) - (extract(year FROM p_from) * 12 + extract(month FROM p_from)))::INTEGER;
$$;

-- A 24-month grid (newest first) moved to a grid that ends p_shift months later.
CREATE OR REPLACE FUNCTION fn_dpd_align(p SMALLINT[], p_shift INTEGER)
RETURNS SMALLINT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN coalesce(p_shift, 0) <= 0 THEN p
              WHEN p_shift >= 24 THEN array_fill((-1)::SMALLINT, ARRAY[24])
              ELSE array_fill((-1)::SMALLINT, ARRAY[p_shift]) || p[1:24 - p_shift] END;
$$;

-- The worst days-late in the cells fn_dpd_align(p, p_shift) pushes off the end
-- of the grid (they become months 25 and on); -1 when none is reported.
-- Folded into dpd_max_25_36m wherever a grid is aligned, so no mark is lost.
CREATE OR REPLACE FUNCTION fn_dpd_shifted_out_max(p SMALLINT[], p_shift INTEGER)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN coalesce(p_shift, 0) <= 0 THEN (-1)::SMALLINT
              ELSE coalesce(max(x), -1)::SMALLINT END
  FROM unnest(p[greatest(1, 25 - coalesce(p_shift, 0)):24]) AS x;
$$;

-- The worse of two grids, month by month.
CREATE OR REPLACE FUNCTION fn_dpd_worst(a SMALLINT[], b SMALLINT[])
RETURNS SMALLINT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT array_agg(greatest(u.x, u.y)::SMALLINT ORDER BY u.i) FROM unnest(a, b) WITH ORDINALITY AS u(x, y, i);
$$;

-- The worst days-late in months p_from..p_to of a grid (0 when nothing reported).
CREATE OR REPLACE FUNCTION fn_dpd_window_max(p SMALLINT[], p_from INT, p_to INT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT greatest(0, max(x))::SMALLINT FROM unnest(p[p_from:p_to]) AS x;
$$;

-- 16 deterministic bytes b[1..16] for one customer and one tag.
CREATE OR REPLACE FUNCTION fn_sim_bytes(p_base TEXT, p_tag TEXT)
RETURNS INTEGER[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT array_agg(get_byte(decode(md5(p_base || ':bureau-sim-v2:' || p_tag), 'hex'), i) ORDER BY i)
  FROM generate_series(0, 15) AS i;
$$;

-- Bump on ANY change to the simulator's logic.
CREATE OR REPLACE FUNCTION fn_bureau_sim_version()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT 'bureau-sim-v2'::TEXT;
$$;

-- =============================================================================
-- 2. Simulation constant lists
-- =============================================================================

-- Lenders and the names bureaus print for them: a short name, a full or
-- former name, a registered foreign name. Every alias key is distinct.
-- Lender 13 is deliberately fictional, so no real lender is ever shown as
-- having had its licence cancelled.
CREATE OR REPLACE FUNCTION fn_bureau_sim_lenders()
RETURNS TABLE (lender_no SMALLINT, lender_code VARCHAR, lender_name VARCHAR, lender_kind VARCHAR,
               licence_cancelled BOOLEAN, variant SMALLINT, alias VARCHAR)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT v.n::SMALLINT, v.code::VARCHAR, v.name::VARCHAR, v.kind::VARCHAR, v.cancelled, v.var::SMALLINT, v.alias::VARCHAR
  FROM (VALUES
    (1,  'SBI',      'State Bank of India',            'BANK', false, 1, 'SBI'),
    (1,  'SBI',      'State Bank of India',            'BANK', false, 2, 'State Bank of India'),
    (1,  'SBI',      'State Bank of India',            'BANK', false, 3, 'State Bk of India'),
    (2,  'HDFC',     'HDFC Bank',                      'BANK', false, 1, 'HDFC Bank'),
    (2,  'HDFC',     'HDFC Bank',                      'BANK', false, 2, 'Housing Development Finance Corporation'),
    (2,  'HDFC',     'HDFC Bank',                      'BANK', false, 3, 'HDFC Bk'),
    (3,  'ICICI',    'ICICI Bank',                     'BANK', false, 1, 'ICICI Bank'),
    (3,  'ICICI',    'ICICI Bank',                     'BANK', false, 2, 'Industrial Credit and Investment Corporation of India'),
    (3,  'ICICI',    'ICICI Bank',                     'BANK', false, 3, 'ICICI Bk'),
    (4,  'AXIS',     'Axis Bank',                      'BANK', false, 1, 'Axis Bank'),
    (4,  'AXIS',     'Axis Bank',                      'BANK', false, 2, 'UTI Bank'),
    (4,  'AXIS',     'Axis Bank',                      'BANK', false, 3, 'Axis Bk'),
    (5,  'KOTAK',    'Kotak Mahindra Bank',            'BANK', false, 1, 'Kotak Bank'),
    (5,  'KOTAK',    'Kotak Mahindra Bank',            'BANK', false, 2, 'Kotak Mahindra Bank'),
    (5,  'KOTAK',    'Kotak Mahindra Bank',            'BANK', false, 3, 'Kotak Mahindra Bk'),
    (6,  'HSBC',     'HSBC',                           'BANK', false, 1, 'HSBC'),
    (6,  'HSBC',     'HSBC',                           'BANK', false, 2, 'The Hongkong and Shanghai Banking Corporation Limited'),
    (6,  'HSBC',     'HSBC',                           'BANK', false, 3, 'HSBC Bk'),
    (7,  'SCB',      'Standard Chartered Bank',        'BANK', false, 1, 'SCB'),
    (7,  'SCB',      'Standard Chartered Bank',        'BANK', false, 2, 'Standard Chartered Bank'),
    (7,  'SCB',      'Standard Chartered Bank',        'BANK', false, 3, 'Standard Chartered Bk'),
    (8,  'IDFC',     'IDFC First Bank',                'BANK', false, 1, 'IDFC First Bank'),
    (8,  'IDFC',     'IDFC First Bank',                'BANK', false, 2, 'Capital First'),
    (8,  'IDFC',     'IDFC First Bank',                'BANK', false, 3, 'IDFC Bank'),
    (9,  'BAJAJ',    'Bajaj Finance',                  'NBFC', false, 1, 'Bajaj Finance'),
    (9,  'BAJAJ',    'Bajaj Finance',                  'NBFC', false, 2, 'Bajaj Fin'),
    (9,  'BAJAJ',    'Bajaj Finance',                  'NBFC', false, 3, 'BFL'),
    (10, 'TATA',     'Tata Capital',                   'NBFC', false, 1, 'Tata Capital'),
    (10, 'TATA',     'Tata Capital',                   'NBFC', false, 2, 'Tata Cap'),
    (10, 'TATA',     'Tata Capital',                   'NBFC', false, 3, 'TCFSL'),
    (11, 'MAHINDRA', 'Mahindra Finance',               'NBFC', false, 1, 'Mahindra Finance'),
    (11, 'MAHINDRA', 'Mahindra Finance',               'NBFC', false, 2, 'Mahindra and Mahindra Financial Services'),
    (11, 'MAHINDRA', 'Mahindra Finance',               'NBFC', false, 3, 'M&M Finance'),
    (12, 'SMFG',     'SMFG India Credit',              'NBFC', false, 1, 'SMFG India Credit'),
    (12, 'SMFG',     'SMFG India Credit',              'NBFC', false, 2, 'Fullerton India Credit'),
    (12, 'SMFG',     'SMFG India Credit',              'NBFC', false, 3, 'SMFG'),
    (13, 'ZENFIN',   'Zenith Microcredit (fictional)', 'MFI',  true,  1, 'Zenith Microcredit'),
    (13, 'ZENFIN',   'Zenith Microcredit (fictional)', 'MFI',  true,  2, 'Zenith Microcredit Pvt Ltd')
  ) AS v(n, code, name, kind, cancelled, var, alias);
$$;

-- Our products and the names bureaus print for them (20 distinct names).
CREATE OR REPLACE FUNCTION fn_bureau_sim_products()
RETURNS TABLE (product VARCHAR, secured BOOLEAN, revolving BOOLEAN, corporate BOOLEAN,
               cibil_raw VARCHAR, other_raw VARCHAR, other_raw_alt VARCHAR)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT v.p::VARCHAR, v.s, v.r, v.c, v.cr::VARCHAR, v.o::VARCHAR, v.alt::VARCHAR
  FROM (VALUES
    ('AUTO',        true,  false, false, 'Auto Loan (Personal)',  'Auto Loan',             'Car Loan'),
    ('HOME',        true,  false, false, 'Housing Loan',          'Home Loan',             NULL),
    ('PROPERTY',    true,  false, false, 'Property Loan',         'Loan Against Property', NULL),
    ('PERSONAL',    false, false, false, 'Personal Loan',         'Personal Loan',         'Microfinance Personal Loan'),
    ('CONSUMER',    false, false, false, 'Consumer Loan',         'Consumer Durable Loan', NULL),
    ('EDUCATION',   false, false, false, 'Education Loan',        'Education Loan',        NULL),
    ('TWO_WHEELER', true,  false, false, 'Two-Wheeler Loan',      'Two Wheeler Loan',      NULL),
    ('GOLD',        true,  false, false, 'Gold Loan',             'Gold Loan',             NULL),
    ('CARD',        false, true,  false, 'Credit Card',           'Credit Card',           NULL),
    ('CORP_CARD',   false, true,  true,  'Corporate Credit Card', 'Corporate Credit Card', NULL),
    ('OVERDRAFT',   false, true,  false, 'Overdraft',             'Overdraft',             NULL),
    ('OTHER',       false, false, false, 'Other',                 'Others',                NULL)
  ) AS v(p, s, r, c, cr, o, alt);
$$;

-- =============================================================================
-- 3. Reference tables and seeds
-- =============================================================================

CREATE TABLE IF NOT EXISTS bureau_lenders (
  lender_code       VARCHAR(16)   NOT NULL,
  lender_name       VARCHAR(80)   NOT NULL,
  lender_kind       VARCHAR(8)    NOT NULL,
  licence_cancelled BOOLEAN       NOT NULL DEFAULT false,   -- shown as a data issue; its bad marks still count
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_bureau_lenders PRIMARY KEY (lender_code),
  CONSTRAINT ck_bureau_lenders_kind CHECK (lender_kind IN ('BANK', 'NBFC', 'HFC', 'MFI', 'FINTECH'))
);

CREATE TABLE IF NOT EXISTS lender_aliases (
  alias_key   VARCHAR(80)   NOT NULL,          -- fn_lender_key(alias)
  alias       VARCHAR(120)  NOT NULL,          -- as a bureau prints it
  lender_code VARCHAR(16)   NOT NULL,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_lender_aliases PRIMARY KEY (alias_key),
  CONSTRAINT fk_lender_aliases_lender FOREIGN KEY (lender_code) REFERENCES bureau_lenders(lender_code) ON UPDATE CASCADE,
  CONSTRAINT ck_lender_aliases_key CHECK (alias_key = fn_lender_key(alias))
);
CREATE INDEX IF NOT EXISTS idx_lender_aliases_code ON lender_aliases (lender_code);

CREATE TABLE IF NOT EXISTS bureau_product_map (
  bureau      VARCHAR(8)    NOT NULL,          -- CIBIL / EXPERIAN / EQUIFAX / CRIF, or '*' (a bureau row wins over '*')
  raw_key     VARCHAR(60)   NOT NULL,
  product_raw VARCHAR(60)   NOT NULL,
  product     VARCHAR(12)   NOT NULL,
  secured     BOOLEAN       NOT NULL,
  revolving   BOOLEAN       NOT NULL,
  corporate   BOOLEAN       NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_bureau_product_map PRIMARY KEY (bureau, raw_key),
  CONSTRAINT ck_bureau_product_map_bureau  CHECK (bureau IN ('*', 'CIBIL', 'EXPERIAN', 'EQUIFAX', 'CRIF')),
  CONSTRAINT ck_bureau_product_map_key     CHECK (raw_key = fn_product_key(product_raw)),
  CONSTRAINT ck_bureau_product_map_product CHECK (product IN ('AUTO', 'HOME', 'PROPERTY', 'PERSONAL', 'CONSUMER', 'EDUCATION',
                                                  'TWO_WHEELER', 'GOLD', 'CARD', 'CORP_CARD', 'OVERDRAFT', 'OTHER')),
  CONSTRAINT ck_bureau_product_map_corp    CHECK (NOT corporate OR revolving)
);

-- Re-running keeps whatever admins changed.
INSERT INTO bureau_lenders (lender_code, lender_name, lender_kind, licence_cancelled)
SELECT DISTINCT l.lender_code, l.lender_name, l.lender_kind, l.licence_cancelled FROM fn_bureau_sim_lenders() l
ON CONFLICT (lender_code) DO NOTHING;

INSERT INTO lender_aliases (alias_key, alias, lender_code)
SELECT fn_lender_key(l.alias), l.alias, l.lender_code FROM fn_bureau_sim_lenders() l
ON CONFLICT (alias_key) DO NOTHING;

INSERT INTO bureau_product_map (bureau, raw_key, product_raw, product, secured, revolving, corporate)
SELECT DISTINCT ON (fn_product_key(r.raw)) '*', fn_product_key(r.raw), r.raw, p.product, p.secured, p.revolving, p.corporate
FROM fn_bureau_sim_products() p
CROSS JOIN LATERAL (VALUES (p.cibil_raw), (p.other_raw), (p.other_raw_alt)) AS r(raw)
WHERE r.raw IS NOT NULL
ORDER BY fn_product_key(r.raw), p.product
ON CONFLICT (bureau, raw_key) DO NOTHING;

-- =============================================================================
-- 4. Detail tables
-- =============================================================================
-- No generated columns, and the writers fill every NOT NULL column themselves
-- (column defaults do not apply on the composite-array path).
-- Deleting an application clears these: applications -> summary -> accounts / enquiries.

-- One row per bureau pulled (hit or not), plus one COMBINED row.
CREATE TABLE IF NOT EXISTS bureau_summary (
  application_id          UUID          NOT NULL,
  bureau                  VARCHAR(8)    NOT NULL,
  report_ref              VARCHAR(30),               -- the bureau's report number (ECN)
  pulled_at               TIMESTAMPTZ,
  valid_until             DATE,
  consent_id              UUID,
  raw_key                 TEXT,                      -- where the raw response is kept
  grid_month              DATE,                      -- month of dpd[1] on this bureau
  no_hit                  BOOLEAN       NOT NULL,
  score                   SMALLINT,
  score_source            VARCHAR(8),
  bureau_count            SMALLINT,
  score_gap               SMALLINT,
  score_gap_flag          BOOLEAN,
  active_loans            SMALLINT,
  active_cards            SMALLINT,
  active_overdrafts       SMALLINT,
  active_accounts         SMALLINT,
  closed_accounts         SMALLINT,
  corporate_cards         SMALLINT,
  guarantor_accounts      SMALLINT,
  loan_balance            INTEGER,
  loan_sanctioned         INTEGER,
  card_balance            INTEGER,
  card_limit              INTEGER,
  credit_utilization_pct  NUMERIC(5,2),
  total_outstanding       INTEGER,
  overdue_amount          INTEGER,
  instalment_emi          INTEGER,
  revolving_obligation    INTEGER,
  monthly_obligation      INTEGER,
  revolving_counted       BOOLEAN       NOT NULL DEFAULT fn_bureau_revolving_in_foir(),  -- the switch this row was worked out under
  emi_ending_3m           INTEGER,                 -- shown only; still counted (PRD decision 13 not applied)
  dpd_max_3m              SMALLINT,
  dpd_max_6m              SMALLINT,
  dpd_max_12m             SMALLINT,
  dpd_max_24m             SMALLINT,
  dpd_max_36m             SMALLINT,
  dpd_30_count_24m        SMALLINT,
  dpd_60_plus_flag        BOOLEAN,
  minor_dpd_months_7to12  SMALLINT,
  on_time_pct_24m         NUMERIC(5,2),
  sma0_count              SMALLINT,
  sma1_count              SMALLINT,
  sma2_count              SMALLINT,
  sub_count               SMALLINT,
  dbt_count               SMALLINT,
  lss_count               SMALLINT,
  secured_count           SMALLINT,
  unsecured_count         SMALLINT,
  secured_balance         INTEGER,
  unsecured_balance       INTEGER,
  opened_6m               SMALLINT,
  opened_12m              SMALLINT,
  restructured_count      SMALLINT,
  writeoff_count_5y       SMALLINT,
  settled_count_5y        SMALLINT,
  suit_count              SMALLINT,
  stale_lender_accounts   SMALLINT,
  enquiry_count_30d       SMALLINT,
  enquiry_count_90d       SMALLINT,
  enquiry_count_12m       SMALLINT,
  unsecured_enquiry_90d   SMALLINT,
  auto_enquiry_30d        SMALLINT,
  oldest_account_months   SMALLINT,
  one_bureau_accounts     SMALLINT,
  computed_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_bureau_summary PRIMARY KEY (application_id, bureau),
  CONSTRAINT fk_bureau_summary_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_bureau_summary_consent FOREIGN KEY (consent_id) REFERENCES customer_consents(id) ON DELETE SET NULL,
  CONSTRAINT ck_bureau_summary_bureau CHECK (bureau IN ('CIBIL', 'EXPERIAN', 'EQUIFAX', 'CRIF', 'COMBINED')),
  CONSTRAINT ck_bureau_summary_score  CHECK (score IS NULL OR score BETWEEN 300 AND 900),
  CONSTRAINT ck_bureau_summary_nohit  CHECK (NOT no_hit OR (score IS NULL AND active_accounts IS NULL
                                             AND monthly_obligation IS NULL AND dpd_max_12m IS NULL)),
  CONSTRAINT ck_bureau_summary_oblig  CHECK (monthly_obligation IS NULL OR monthly_obligation =
                                             instalment_emi + CASE WHEN revolving_counted THEN revolving_obligation ELSE 0 END)
);

CREATE TABLE IF NOT EXISTS bureau_accounts (
  application_id      UUID          NOT NULL,
  bureau              VARCHAR(8)    NOT NULL,
  seq                 SMALLINT      NOT NULL,
  merged_seq          SMALLINT,                    -- the same loan on two bureaus shares it
  lender_raw          VARCHAR(120)  NOT NULL,
  lender_code         VARCHAR(16)   NOT NULL,      -- '~' || key when the name is not known yet; no FK
  product_raw         VARCHAR(60)   NOT NULL,
  product             VARCHAR(12)   NOT NULL,
  secured             BOOLEAN       NOT NULL,
  revolving           BOOLEAN       NOT NULL,
  corporate           BOOLEAN       NOT NULL,
  account_masked      VARCHAR(20),
  ownership           VARCHAR(10)   NOT NULL,      -- INDIVIDUAL / JOINT / GUARANTOR / AUTHORISED
  status              VARCHAR(12)   NOT NULL,
  asset_class         VARCHAR(4)    NOT NULL,      -- current class only
  restructured        BOOLEAN       NOT NULL,
  suit_filed          BOOLEAN       NOT NULL,
  sanctioned          INTEGER,
  credit_limit        INTEGER,
  cash_limit          INTEGER,
  outstanding         INTEGER       NOT NULL,
  overdue             INTEGER       NOT NULL,
  emi                 INTEGER,
  frequency           CHAR(1)       NOT NULL,
  rate_pct            NUMERIC(5,2),
  tenure_months       SMALLINT,
  collateral          VARCHAR(12),
  collateral_value    INTEGER,
  opened_on           DATE          NOT NULL,
  last_payment_on     DATE,
  last_payment_amount INTEGER,
  closed_on           DATE,
  reported_on         DATE          NOT NULL,
  writeoff_amount     INTEGER,
  settled_amount      INTEGER,
  grid_month          DATE          NOT NULL,      -- month of dpd[1]
  dpd                 SMALLINT[]    NOT NULL,      -- 24 months, newest first; -1 = not reported
  dpd_max_25_36m      SMALLINT      NOT NULL,      -- worst in the 12 months before the grid; -1 = none reported
  CONSTRAINT pk_bureau_accounts PRIMARY KEY (application_id, bureau, seq),
  CONSTRAINT fk_bureau_accounts_pull FOREIGN KEY (application_id, bureau)
    REFERENCES bureau_summary(application_id, bureau) ON DELETE CASCADE,
  CONSTRAINT ck_bureau_accounts_bureau CHECK (bureau IN ('CIBIL', 'EXPERIAN', 'EQUIFAX', 'CRIF')),
  CONSTRAINT ck_bureau_accounts_status CHECK (status IN ('ACTIVE', 'CLOSED', 'WRITTEN_OFF', 'SETTLED')),
  CONSTRAINT ck_bureau_accounts_class  CHECK (asset_class IN ('STD', 'SMA0', 'SMA1', 'SMA2', 'SUB', 'DBT', 'LSS')),
  CONSTRAINT ck_bureau_accounts_owner  CHECK (ownership IN ('INDIVIDUAL', 'JOINT', 'GUARANTOR', 'AUTHORISED')),
  CONSTRAINT ck_bureau_accounts_freq   CHECK (frequency IN ('M', 'B', 'Q', 'H', 'Y', 'F', 'W')),
  CONSTRAINT ck_bureau_accounts_month  CHECK (extract(day FROM grid_month) = 1),
  CONSTRAINT ck_bureau_accounts_older  CHECK (dpd_max_25_36m BETWEEN -1 AND 999),
  CONSTRAINT ck_bureau_accounts_amts   CHECK (outstanding >= 0 AND overdue >= 0),
  CONSTRAINT ck_bureau_accounts_dpd    CHECK (array_ndims(dpd) = 1 AND cardinality(dpd) = 24
                                             AND array_position(dpd, NULL) IS NULL AND -1 <= ALL (dpd) AND 999 >= ALL (dpd))
);

CREATE TABLE IF NOT EXISTS bureau_enquiries (
  application_id  UUID          NOT NULL,
  bureau          VARCHAR(8)    NOT NULL,
  seq             SMALLINT      NOT NULL,
  enquired_on     DATE          NOT NULL,
  lender_raw      VARCHAR(120)  NOT NULL,
  lender_code     VARCHAR(16)   NOT NULL,
  purpose         VARCHAR(12)   NOT NULL,
  purpose_raw     VARCHAR(60),
  amount          INTEGER,
  CONSTRAINT pk_bureau_enquiries PRIMARY KEY (application_id, bureau, seq),
  CONSTRAINT fk_bureau_enquiries_pull FOREIGN KEY (application_id, bureau)
    REFERENCES bureau_summary(application_id, bureau) ON DELETE CASCADE,
  CONSTRAINT ck_bureau_enquiries_bureau CHECK (bureau IN ('CIBIL', 'EXPERIAN', 'EQUIFAX', 'CRIF'))
);

-- =============================================================================
-- 5. bureau_reports: additive columns
-- =============================================================================
-- Nullable, no defaults. Names checked against api.ts, supabase-bureau.ts and
-- the AWS supabase_client.py so nothing they read changes shape.
-- The raw response key reuses report_raw_path.

ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS report_ref   VARCHAR(30);
ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS pulled_at    TIMESTAMPTZ;
ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS valid_until  DATE;
ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS consent_id   UUID;
ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS no_hit       BOOLEAN;
ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS score_source VARCHAR(8);
ALTER TABLE bureau_reports ADD COLUMN IF NOT EXISTS bureau_count SMALLINT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bureau_reports_consent') THEN
    ALTER TABLE bureau_reports ADD CONSTRAINT fk_bureau_reports_consent
      FOREIGN KEY (consent_id) REFERENCES customer_consents(id) ON DELETE SET NULL;
  END IF;
END $$;
-- One engine row per application for every v2 pull (no existing row matches the predicate).
CREATE UNIQUE INDEX IF NOT EXISTS ux_bureau_reports_one_v2 ON bureau_reports (application_id)
  WHERE report_raw_path = 'simulated:bureau-sim-v2';

-- =============================================================================
-- 6. Row security
-- =============================================================================

ALTER TABLE bureau_lenders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lender_aliases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_product_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_summary     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_enquiries   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bureau_lenders, lender_aliases, bureau_product_map, bureau_summary, bureau_accounts, bureau_enquiries FROM anon, authenticated;
-- Everything is read through the functions below; no direct table access.

-- Defence in depth: 050's restrictive policy, on 053's own list (050's list is fixed).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bureau_summary', 'bureau_accounts', 'bureau_enquiries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "real_customers_need_pii" ON %I', t);
    EXECUTE format('CREATE POLICY "real_customers_need_pii" ON %I AS RESTRICTIVE FOR SELECT TO authenticated '
                   'USING (application_id IS NULL OR fn_sees_real_customers() OR NOT fn_is_customer_application(application_id))', t);
  END LOOP;
END $$;

-- =============================================================================
-- 7. Array maths
-- =============================================================================
-- The only maths path: the stored pull, the preview and the tests all run
-- these. Fields are set one at a time, so a later ADD COLUMN cannot break them.

-- Which accounts on two bureaus are the same loan. Repeated mutual-best passes:
-- same lender and product, opened within 31 days, the same amount within
-- 2% (cards: any limit), and the same last four digits when both are printed.
-- Anything ambiguous stays separate.
CREATE OR REPLACE FUNCTION fn_bureau_match(p bureau_accounts[])
RETURNS bureau_accounts[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n    INTEGER := coalesce(cardinality(p), 0);
  v_grp  INTEGER[];
  v_pass INTEGER;
  v_more BOOLEAN;
  r      RECORD;
  v_a    bureau_accounts;
  v_out  bureau_accounts[] := '{}';
BEGIN
  IF v_n = 0 THEN
    RETURN v_out;
  END IF;
  v_grp := ARRAY(SELECT generate_series(1, v_n));
  FOR v_pass IN 1..5 LOOP
    v_more := false;
    FOR r IN
      WITH al AS (
        SELECT w.ordinality::INT AS rn, v_grp[w.ordinality::INT] AS grp, w.bureau, w.lender_code, w.product, w.revolving,
               w.opened_on, w.account_masked, coalesce(w.sanctioned, w.credit_limit, 0) AS amt
        FROM unnest(p) WITH ORDINALITY AS w),
      fr AS (SELECT al.* FROM al WHERE NOT EXISTS (SELECT 1 FROM al o WHERE o.grp = al.grp AND o.rn <> al.rn)),
      cand AS (
        SELECT l.rn AS lrn, q.rn AS rrn,
               abs(l.opened_on - q.opened_on) + CASE WHEN l.revolving THEN 0 ELSE abs(l.amt - q.amt) / 1000.0 END AS dist
        FROM fr l
        JOIN fr q ON l.bureau < q.bureau AND l.lender_code = q.lender_code AND l.product = q.product
        WHERE abs(l.opened_on - q.opened_on) <= 31
          AND (l.revolving OR abs(l.amt - q.amt) <= greatest(1000, 0.02 * greatest(l.amt, q.amt)))
          AND (l.account_masked IS NULL OR q.account_masked IS NULL OR right(l.account_masked, 4) = right(q.account_masked, 4))),
      bl AS (SELECT DISTINCT ON (cand.lrn) cand.lrn, cand.rrn FROM cand ORDER BY cand.lrn, cand.dist, cand.rrn),
      br AS (SELECT DISTINCT ON (cand.rrn) cand.lrn, cand.rrn FROM cand ORDER BY cand.rrn, cand.dist, cand.lrn)
      SELECT bl.lrn, bl.rrn FROM bl JOIN br ON br.lrn = bl.lrn AND br.rrn = bl.rrn
    LOOP
      v_grp[r.rrn] := v_grp[r.lrn];
      v_more := true;
    END LOOP;
    EXIT WHEN NOT v_more;
  END LOOP;

  FOR r IN
    WITH al AS (SELECT w.ordinality::INT AS rn, v_grp[w.ordinality::INT] AS grp, w.opened_on FROM unnest(p) WITH ORDINALITY AS w),
         g AS (SELECT al.grp, min(al.opened_on) AS mo, min(al.rn) AS mr FROM al GROUP BY al.grp),
         k AS (SELECT g.grp, dense_rank() OVER (ORDER BY g.mo DESC, g.mr) AS ms FROM g)
    SELECT al.rn, k.ms FROM al JOIN k ON k.grp = al.grp ORDER BY al.rn
  LOOP
    v_a := p[r.rn];
    v_a.merged_seq := r.ms;
    v_out := v_out || v_a;
  END LOOP;
  RETURN v_out;
END;
$$;

-- One row per matched loan: the worse class and grid, the larger amounts and
-- monthly EMI, the most liable ownership; descriptive fields from the CIBIL copy.
-- Status: the worst of the copies (for bad marks); with p_live, ACTIVE when any
-- copy is ACTIVE (for exposure: a loan open on one bureau is still owed, even
-- if the other reports it settled or written off).
-- Grids are lined up on the newest copy; cells that fall off the end go into
-- dpd_max_25_36m.
DROP FUNCTION IF EXISTS fn_bureau_union(bureau_accounts[]);
CREATE OR REPLACE FUNCTION fn_bureau_union(p bureau_accounts[], p_live BOOLEAN)
RETURNS bureau_accounts[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out   bureau_accounts[] := '{}';
  v_ms    INTEGER;
  v_m     bureau_accounts[];
  v_u     bureau_accounts;
  r       RECORD;
  v_grid  SMALLINT[];
  v_i     INTEGER;
  v_shift INTEGER;
  v_old   SMALLINT;
BEGIN
  FOR v_ms IN SELECT DISTINCT x.merged_seq FROM unnest(coalesce(p, '{}')) AS x ORDER BY 1 LOOP
    v_m := ARRAY(SELECT p[w.ordinality::INT] FROM unnest(p) WITH ORDINALITY AS w
                 WHERE w.merged_seq IS NOT DISTINCT FROM v_ms ORDER BY w.bureau <> 'CIBIL', w.bureau, w.seq);
    v_u := v_m[1];
    SELECT max(x.grid_month) AS g, bool_or(x.status = 'ACTIVE') AS live,
           max(CASE x.status WHEN 'CLOSED' THEN 1 WHEN 'ACTIVE' THEN 2 WHEN 'SETTLED' THEN 3 ELSE 4 END) AS st,
           max(CASE x.asset_class WHEN 'STD' THEN 1 WHEN 'SMA0' THEN 2 WHEN 'SMA1' THEN 3 WHEN 'SMA2' THEN 4
                                  WHEN 'SUB' THEN 5 WHEN 'DBT' THEN 6 ELSE 7 END) AS cl,
           max(CASE x.ownership WHEN 'GUARANTOR' THEN 1 WHEN 'AUTHORISED' THEN 2 WHEN 'JOINT' THEN 3 ELSE 4 END) AS ow,
           bool_or(x.restructured) AS rs, bool_or(x.suit_filed) AS sf,
           max(x.sanctioned) AS sanc, max(x.credit_limit) AS lim, max(x.cash_limit) AS cash,
           max(x.outstanding) AS outs, max(x.overdue) AS od, max(fn_bureau_monthly_emi(x.emi, x.frequency)) AS memi,
           max(x.writeoff_amount) AS wo, max(x.settled_amount) AS sa, max(x.closed_on) AS shut,
           max(x.reported_on) AS rep, max(x.last_payment_on) AS lp
      INTO r
      FROM unnest(v_m) AS x;
    v_grid := array_fill((-1)::SMALLINT, ARRAY[24]);
    v_old := -1;
    FOR v_i IN 1..cardinality(v_m) LOOP
      v_shift := fn_months_between((v_m[v_i]).grid_month, r.g);
      v_grid := fn_dpd_worst(v_grid, fn_dpd_align((v_m[v_i]).dpd, v_shift));
      v_old := greatest(v_old, (v_m[v_i]).dpd_max_25_36m, fn_dpd_shifted_out_max((v_m[v_i]).dpd, v_shift));
    END LOOP;
    v_u.bureau := 'COMBINED';
    v_u.seq := v_ms;
    v_u.merged_seq := v_ms;
    v_u.grid_month := r.g;
    v_u.dpd := v_grid;
    v_u.dpd_max_25_36m := v_old;
    v_u.status := CASE WHEN p_live AND r.live THEN 'ACTIVE'
                       ELSE (ARRAY['CLOSED', 'ACTIVE', 'SETTLED', 'WRITTEN_OFF'])[r.st] END;
    v_u.asset_class := (ARRAY['STD', 'SMA0', 'SMA1', 'SMA2', 'SUB', 'DBT', 'LSS'])[r.cl];
    v_u.ownership := (ARRAY['GUARANTOR', 'AUTHORISED', 'JOINT', 'INDIVIDUAL'])[r.ow];
    v_u.restructured := r.rs;
    v_u.suit_filed := r.sf;
    v_u.sanctioned := r.sanc;
    v_u.credit_limit := r.lim;
    v_u.cash_limit := r.cash;
    v_u.outstanding := r.outs;
    v_u.overdue := r.od;
    v_u.emi := r.memi;
    v_u.frequency := 'M';
    v_u.writeoff_amount := r.wo;
    v_u.settled_amount := r.sa;
    v_u.reported_on := r.rep;
    v_u.last_payment_on := r.lp;
    v_u.closed_on := CASE WHEN v_u.status = 'ACTIVE' THEN NULL ELSE coalesce(v_u.closed_on, r.shut) END;
    v_out := v_out || v_u;
  END LOOP;
  RETURN v_out;
END;
$$;

-- Enquiries on both bureaus: the same lender on the same day on the two
-- bureaus counts once (CIBIL's copy kept). Two on one bureau stay two: the
-- n-th copy on one bureau pairs with the n-th on the other.
CREATE OR REPLACE FUNCTION fn_bureau_enquiries_union(p bureau_enquiries[])
RETURNS bureau_enquiries[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT p[k.i]
    FROM (SELECT DISTINCT ON (w.lender_code, w.enquired_on, w.n) w.i, w.enquired_on
          FROM (SELECT u.ordinality::INT AS i, u.bureau, u.seq, u.lender_code, u.enquired_on,
                       row_number() OVER (PARTITION BY u.bureau, u.lender_code, u.enquired_on ORDER BY u.seq, u.ordinality) AS n
                FROM unnest(p) WITH ORDINALITY AS u) AS w
          ORDER BY w.lender_code, w.enquired_on, w.n, w.bureau <> 'CIBIL', w.bureau, w.seq) AS k
    ORDER BY k.enquired_on DESC, k.i);
$$;

-- Every measure for one bureau, or for the merged accounts (bureau 'COMBINED').
-- STABLE, not IMMUTABLE: stale_lender_accounts reads bureau_lenders.
CREATE OR REPLACE FUNCTION fn_bureau_measures(p_bureau TEXT, p_accts bureau_accounts[], p_enqs bureau_enquiries[], p_as_of DATE)
RETURNS bureau_summary
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  s     bureau_summary;
  v_g   DATE;
  m     RECORD;
  w     RECORD;
  v_wst SMALLINT[];
BEGIN
  s.bureau := p_bureau;
  s.no_hit := false;
  s.computed_at := now();
  SELECT max(x.grid_month) INTO v_g FROM unnest(coalesce(p_accts, '{}')) AS x;

  -- counted: an active personal liability. Guarantor and authorised accounts
  -- and corporate cards are shown but not counted; their bad marks still count.
  SELECT count(*) FILTER (WHERE z.counted AND NOT z.revolving) AS loans,
         count(*) FILTER (WHERE z.counted AND z.product = 'CARD') AS cards,
         count(*) FILTER (WHERE z.counted AND z.product = 'OVERDRAFT') AS ods,
         count(*) FILTER (WHERE z.status <> 'ACTIVE') AS shut,
         count(*) FILTER (WHERE z.status = 'ACTIVE' AND z.corporate) AS corp,
         count(*) FILTER (WHERE z.ownership IN ('GUARANTOR', 'AUTHORISED')) AS guar,
         coalesce(sum(z.outstanding) FILTER (WHERE z.counted AND NOT z.revolving), 0) AS loan_bal,
         coalesce(sum(z.sanctioned) FILTER (WHERE z.counted AND NOT z.revolving), 0) AS loan_sanc,
         -- Utilisation: only cards with a limit reported, so a missing limit cannot inflate it.
         coalesce(sum(z.outstanding) FILTER (WHERE z.counted AND z.product = 'CARD' AND coalesce(z.credit_limit, 0) > 0), 0) AS card_bal,
         coalesce(sum(z.credit_limit) FILTER (WHERE z.counted AND z.product = 'CARD' AND coalesce(z.credit_limit, 0) > 0), 0) AS card_lim,
         coalesce(sum(z.outstanding) FILTER (WHERE z.counted), 0) AS total_out,
         coalesce(sum(z.overdue) FILTER (WHERE z.status <> 'CLOSED'), 0) AS overdue,
         coalesce(sum(z.memi) FILTER (WHERE z.counted AND NOT z.revolving), 0) AS inst,
         coalesce(sum(z.outstanding) FILTER (WHERE z.counted AND z.revolving), 0) AS rev_bal,
         coalesce(sum(z.memi) FILTER (WHERE z.counted AND NOT z.revolving AND z.tenure_months IS NOT NULL
                                      AND (z.opened_on + make_interval(months => z.tenure_months)) <= p_as_of + INTERVAL '3 months'), 0) AS end3,
         count(*) FILTER (WHERE z.counted AND z.grid[1] BETWEEN 1 AND 30) AS sma0,
         count(*) FILTER (WHERE z.counted AND z.grid[1] BETWEEN 31 AND 60) AS sma1,
         count(*) FILTER (WHERE z.counted AND z.grid[1] BETWEEN 61 AND 90) AS sma2,
         count(*) FILTER (WHERE z.asset_class = 'SUB') AS sub,
         count(*) FILTER (WHERE z.asset_class = 'DBT') AS dbt,
         count(*) FILTER (WHERE z.asset_class = 'LSS') AS lss,
         count(*) FILTER (WHERE z.counted AND z.secured) AS sec_n,
         count(*) FILTER (WHERE z.counted AND NOT z.secured) AS unsec_n,
         coalesce(sum(z.outstanding) FILTER (WHERE z.counted AND z.secured), 0) AS sec_bal,
         coalesce(sum(z.outstanding) FILTER (WHERE z.counted AND NOT z.secured), 0) AS unsec_bal,
         count(*) FILTER (WHERE NOT z.corporate AND z.opened_on > p_as_of - INTERVAL '6 months') AS o6,
         count(*) FILTER (WHERE NOT z.corporate AND z.opened_on > p_as_of - INTERVAL '12 months') AS o12,
         count(*) FILTER (WHERE z.restructured) AS restr,
         count(*) FILTER (WHERE (z.status = 'WRITTEN_OFF' OR coalesce(z.writeoff_amount, 0) > 0)
                            AND coalesce(z.closed_on, z.reported_on) > p_as_of - INTERVAL '5 years') AS wo,
         count(*) FILTER (WHERE (z.status = 'SETTLED' OR coalesce(z.settled_amount, 0) > 0)
                            AND coalesce(z.closed_on, z.reported_on) > p_as_of - INTERVAL '5 years') AS st,
         count(*) FILTER (WHERE z.suit_filed) AS suit,
         count(*) FILTER (WHERE z.stale) AS stale,
         max(fn_months_between(z.opened_on, p_as_of)) AS oldest,
         max(greatest(z.dpd_max_25_36m, z.lost)) AS old36,
         coalesce(bool_or(z.asset_class IN ('SUB', 'DBT', 'LSS')), false) AS badclass
    INTO m
    FROM (SELECT x.*,
                 (x.status = 'ACTIVE' AND NOT x.corporate AND x.ownership IN ('INDIVIDUAL', 'JOINT')) AS counted,
                 fn_bureau_monthly_emi(x.emi, x.frequency) AS memi,
                 fn_dpd_align(x.dpd, fn_months_between(x.grid_month, v_g)) AS grid,
                 -- an older grid lined up on the newest loses its last months; they are months 25 and on now
                 fn_dpd_shifted_out_max(x.dpd, fn_months_between(x.grid_month, v_g)) AS lost,
                 EXISTS (SELECT 1 FROM bureau_lenders bl WHERE bl.lender_code = x.lender_code AND bl.licence_cancelled) AS stale
          FROM unnest(coalesce(p_accts, '{}')) AS x) AS z;

  -- Every reported cell of every aligned grid.
  SELECT count(*) FILTER (WHERE c.dv >= 30) AS c30,
         count(*) FILTER (WHERE c.dv >= 0) AS reported,
         count(*) FILTER (WHERE c.dv = 0) AS on_time,
         coalesce(bool_or(c.dv >= 60), false) AS any60
    INTO w
    FROM (SELECT (fn_dpd_align(x.dpd, fn_months_between(x.grid_month, v_g)))[g.mi] AS dv
          FROM unnest(coalesce(p_accts, '{}')) AS x CROSS JOIN generate_series(1, 24) AS g(mi)) AS c;
  -- The worst cell of each month across accounts.
  v_wst := ARRAY(SELECT coalesce(max((fn_dpd_align(x.dpd, fn_months_between(x.grid_month, v_g)))[g.mi]), -1)::SMALLINT
                 FROM generate_series(1, 24) AS g(mi) LEFT JOIN unnest(coalesce(p_accts, '{}')) AS x ON true
                 GROUP BY g.mi ORDER BY g.mi);

  s.active_loans := m.loans;
  s.active_cards := m.cards;
  s.active_overdrafts := m.ods;
  s.active_accounts := m.loans + m.cards + m.ods;
  s.closed_accounts := m.shut;
  s.corporate_cards := m.corp;
  s.guarantor_accounts := m.guar;
  s.loan_balance := m.loan_bal;
  s.loan_sanctioned := m.loan_sanc;
  s.card_balance := m.card_bal;
  s.card_limit := m.card_lim;
  s.credit_utilization_pct := CASE WHEN m.cards = 0 OR m.card_lim = 0 THEN NULL
                                   ELSE least(999.99, round(m.card_bal * 100.0 / m.card_lim, 2)) END;
  s.total_outstanding := m.total_out;
  s.overdue_amount := m.overdue;
  s.instalment_emi := m.inst;
  s.revolving_obligation := round(fn_bureau_revolving_rate() * m.rev_bal);
  s.revolving_counted := fn_bureau_revolving_in_foir();
  s.monthly_obligation := s.instalment_emi + CASE WHEN s.revolving_counted THEN s.revolving_obligation ELSE 0 END;
  s.emi_ending_3m := m.end3;
  s.dpd_max_3m := fn_dpd_window_max(v_wst, 1, 3);
  s.dpd_max_6m := fn_dpd_window_max(v_wst, 1, 6);
  s.dpd_max_12m := fn_dpd_window_max(v_wst, 1, 12);
  s.dpd_max_24m := fn_dpd_window_max(v_wst, 1, 24);
  s.dpd_max_36m := greatest(s.dpd_max_24m, m.old36, 0);
  s.dpd_30_count_24m := w.c30;
  s.dpd_60_plus_flag := w.any60 OR coalesce(m.old36 >= 60, false) OR m.badclass;
  s.minor_dpd_months_7to12 := (SELECT count(*) FROM unnest(v_wst[7:12]) AS x WHERE x BETWEEN 1 AND 30);
  s.on_time_pct_24m := CASE WHEN w.reported = 0 THEN NULL ELSE round(w.on_time * 100.0 / w.reported, 2) END;
  s.sma0_count := m.sma0;
  s.sma1_count := m.sma1;
  s.sma2_count := m.sma2;
  s.sub_count := m.sub;
  s.dbt_count := m.dbt;
  s.lss_count := m.lss;
  s.secured_count := m.sec_n;
  s.unsecured_count := m.unsec_n;
  s.secured_balance := m.sec_bal;
  s.unsecured_balance := m.unsec_bal;
  s.opened_6m := m.o6;
  s.opened_12m := m.o12;
  s.restructured_count := m.restr;
  s.writeoff_count_5y := m.wo;
  s.settled_count_5y := m.st;
  s.suit_count := m.suit;
  s.stale_lender_accounts := m.stale;
  s.oldest_account_months := m.oldest;

  SELECT count(*) FILTER (WHERE x.enquired_on > p_as_of - 30),
         count(*) FILTER (WHERE x.enquired_on > p_as_of - 90),
         count(*) FILTER (WHERE x.enquired_on > p_as_of - INTERVAL '12 months'),
         count(*) FILTER (WHERE x.enquired_on > p_as_of - 90 AND x.purpose NOT IN ('AUTO', 'HOME', 'PROPERTY', 'TWO_WHEELER', 'GOLD')),
         count(*) FILTER (WHERE x.enquired_on > p_as_of - 30 AND x.purpose = 'AUTO')
    INTO s.enquiry_count_30d, s.enquiry_count_90d, s.enquiry_count_12m, s.unsecured_enquiry_90d, s.auto_enquiry_30d
    FROM unnest(coalesce(p_enqs, '{}')) AS x;
  RETURN s;
END;
$$;

-- Per-bureau summaries plus COMBINED, and the accounts with merged_seq set.
-- Shared by the stored pull, the preview and the tests.
CREATE OR REPLACE FUNCTION fn_bureau_combine_arrays(p_heads bureau_summary[], p_accts bureau_accounts[], p_enqs bureau_enquiries[],
                                                    p_as_of DATE, OUT summaries bureau_summary[], OUT accounts bureau_accounts[])
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_heads bureau_summary[];
  v_hit   TEXT[];
  h       bureau_summary;
  s       bureau_summary;
  v_c     bureau_summary;
  v_l     bureau_summary;
  v_src   bureau_summary;
  v_enqs  bureau_enquiries[];
  m       RECORD;
BEGIN
  summaries := '{}';
  v_heads := ARRAY(SELECT p_heads[u.ordinality::INT] FROM unnest(coalesce(p_heads, '{}')) WITH ORDINALITY AS u
                   ORDER BY u.bureau <> 'CIBIL', u.bureau);
  v_hit := ARRAY(SELECT x.bureau FROM unnest(v_heads) AS x WHERE NOT coalesce(x.no_hit, false));
  accounts := fn_bureau_match(ARRAY(SELECT p_accts[u.ordinality::INT] FROM unnest(coalesce(p_accts, '{}')) WITH ORDINALITY AS u
                                    WHERE u.bureau = ANY (v_hit)));

  -- Each bureau on its own. A bureau with no record gets every measure empty.
  FOREACH h IN ARRAY v_heads LOOP
    IF coalesce(h.no_hit, false) THEN
      s := NULL;
    ELSE
      s := fn_bureau_measures(h.bureau,
                              ARRAY(SELECT accounts[u.ordinality::INT] FROM unnest(accounts) WITH ORDINALITY AS u WHERE u.bureau = h.bureau),
                              ARRAY(SELECT p_enqs[u.ordinality::INT] FROM unnest(coalesce(p_enqs, '{}')) WITH ORDINALITY AS u WHERE u.bureau = h.bureau),
                              p_as_of);
      s.score_source := h.bureau;
      s.bureau_count := 1;
      s.one_bureau_accounts := (SELECT count(*) FROM unnest(accounts) AS x
                                WHERE x.bureau = h.bureau
                                  AND NOT EXISTS (SELECT 1 FROM unnest(accounts) AS y WHERE y.merged_seq = x.merged_seq AND y.bureau <> x.bureau));
    END IF;
    s.application_id := h.application_id;
    s.bureau := h.bureau;
    s.report_ref := h.report_ref;
    s.pulled_at := h.pulled_at;
    s.valid_until := h.valid_until;
    s.consent_id := h.consent_id;
    s.raw_key := h.raw_key;
    s.grid_month := h.grid_month;
    s.no_hit := coalesce(h.no_hit, false);
    s.score := CASE WHEN s.no_hit THEN NULL ELSE h.score END;
    s.revolving_counted := fn_bureau_revolving_in_foir();
    s.computed_at := now();
    summaries := summaries || s;
  END LOOP;

  -- COMBINED.
  IF cardinality(v_hit) = 0 THEN
    v_c := NULL;
  ELSE
    v_enqs := fn_bureau_enquiries_union(ARRAY(SELECT p_enqs[u.ordinality::INT] FROM unnest(coalesce(p_enqs, '{}')) WITH ORDINALITY AS u
                                              WHERE u.bureau = ANY (v_hit)));
    -- Bad marks: each matched loan at its worst status.
    v_c := fn_bureau_measures('COMBINED', fn_bureau_union(accounts, false), v_enqs, p_as_of);
    -- Exposure: a matched loan still ACTIVE on either bureau is still owed.
    v_l := fn_bureau_measures('COMBINED', fn_bureau_union(accounts, true), v_enqs, p_as_of);
    v_c.active_loans := v_l.active_loans;
    v_c.active_cards := v_l.active_cards;
    v_c.active_overdrafts := v_l.active_overdrafts;
    v_c.active_accounts := v_l.active_accounts;
    v_c.closed_accounts := v_l.closed_accounts;
    v_c.corporate_cards := v_l.corporate_cards;
    v_c.loan_balance := v_l.loan_balance;
    v_c.loan_sanctioned := v_l.loan_sanctioned;
    v_c.card_balance := v_l.card_balance;
    v_c.card_limit := v_l.card_limit;
    v_c.credit_utilization_pct := v_l.credit_utilization_pct;
    v_c.total_outstanding := v_l.total_outstanding;
    v_c.instalment_emi := v_l.instalment_emi;
    v_c.revolving_obligation := v_l.revolving_obligation;
    v_c.revolving_counted := v_l.revolving_counted;
    v_c.monthly_obligation := v_l.monthly_obligation;
    v_c.emi_ending_3m := v_l.emi_ending_3m;
    v_c.secured_count := v_l.secured_count;
    v_c.unsecured_count := v_l.unsecured_count;
    v_c.secured_balance := v_l.secured_balance;
    v_c.unsecured_balance := v_l.unsecured_balance;
    -- Current late payments on a loan that is still open count too.
    v_c.sma0_count := greatest(v_c.sma0_count, v_l.sma0_count);
    v_c.sma1_count := greatest(v_c.sma1_count, v_l.sma1_count);
    v_c.sma2_count := greatest(v_c.sma2_count, v_l.sma2_count);
    v_c.one_bureau_accounts := (SELECT count(*) FROM (SELECT x.merged_seq FROM unnest(accounts) AS x GROUP BY x.merged_seq
                                                      HAVING count(DISTINCT x.bureau) = 1) AS g);
    -- Worst-of: COMBINED is never better than either bureau, even when the two grids lag each other.
    SELECT min(x.on_time_pct_24m) AS ontime,
           max(x.dpd_max_3m) AS d3, max(x.dpd_max_6m) AS d6, max(x.dpd_max_12m) AS d12, max(x.dpd_max_24m) AS d24,
           max(x.dpd_max_36m) AS d36, max(x.dpd_30_count_24m) AS c30, max(x.minor_dpd_months_7to12) AS minor,
           max(x.sma0_count) AS sma0, max(x.sma1_count) AS sma1, max(x.sma2_count) AS sma2,
           max(x.sub_count) AS sub, max(x.dbt_count) AS dbt, max(x.lss_count) AS lss, max(x.overdue_amount) AS overdue,
           max(x.restructured_count) AS restr, max(x.writeoff_count_5y) AS wo, max(x.settled_count_5y) AS st,
           max(x.suit_count) AS suit, max(x.stale_lender_accounts) AS stale,
           max(x.enquiry_count_30d) AS e30, max(x.enquiry_count_90d) AS e90, max(x.enquiry_count_12m) AS e12,
           max(x.unsecured_enquiry_90d) AS u90, max(x.auto_enquiry_30d) AS a30,
           max(x.opened_6m) AS o6, max(x.opened_12m) AS o12, coalesce(bool_or(x.dpd_60_plus_flag), false) AS f60
      INTO m
      FROM unnest(summaries) AS x
     WHERE NOT x.no_hit;
    v_c.dpd_max_3m := greatest(v_c.dpd_max_3m, m.d3);
    v_c.dpd_max_6m := greatest(v_c.dpd_max_6m, m.d6);
    v_c.dpd_max_12m := greatest(v_c.dpd_max_12m, m.d12);
    v_c.dpd_max_24m := greatest(v_c.dpd_max_24m, m.d24);
    v_c.dpd_max_36m := greatest(v_c.dpd_max_36m, m.d36);
    v_c.dpd_30_count_24m := greatest(v_c.dpd_30_count_24m, m.c30);
    v_c.minor_dpd_months_7to12 := greatest(v_c.minor_dpd_months_7to12, m.minor);
    v_c.sma0_count := greatest(v_c.sma0_count, m.sma0);
    v_c.sma1_count := greatest(v_c.sma1_count, m.sma1);
    v_c.sma2_count := greatest(v_c.sma2_count, m.sma2);
    v_c.sub_count := greatest(v_c.sub_count, m.sub);
    v_c.dbt_count := greatest(v_c.dbt_count, m.dbt);
    v_c.lss_count := greatest(v_c.lss_count, m.lss);
    v_c.overdue_amount := greatest(v_c.overdue_amount, m.overdue);
    v_c.restructured_count := greatest(v_c.restructured_count, m.restr);
    v_c.writeoff_count_5y := greatest(v_c.writeoff_count_5y, m.wo);
    v_c.settled_count_5y := greatest(v_c.settled_count_5y, m.st);
    v_c.suit_count := greatest(v_c.suit_count, m.suit);
    v_c.stale_lender_accounts := greatest(v_c.stale_lender_accounts, m.stale);
    v_c.enquiry_count_30d := greatest(v_c.enquiry_count_30d, m.e30);
    v_c.enquiry_count_90d := greatest(v_c.enquiry_count_90d, m.e90);
    v_c.enquiry_count_12m := greatest(v_c.enquiry_count_12m, m.e12);
    v_c.unsecured_enquiry_90d := greatest(v_c.unsecured_enquiry_90d, m.u90);
    v_c.auto_enquiry_30d := greatest(v_c.auto_enquiry_30d, m.a30);
    v_c.opened_6m := greatest(v_c.opened_6m, m.o6);
    v_c.opened_12m := greatest(v_c.opened_12m, m.o12);
    v_c.dpd_60_plus_flag := v_c.dpd_60_plus_flag OR m.f60;
    v_c.on_time_pct_24m := least(v_c.on_time_pct_24m, m.ontime);
  END IF;

  -- score: CIBIL's when CIBIL has a record, else the other bureau's (D6).
  -- The heads are in CIBIL-first order, so the first bureau with a record wins.
  -- To use the lower of the two instead, pick the hit with the lowest score here.
  v_src := NULL;
  FOREACH s IN ARRAY summaries LOOP
    IF NOT s.no_hit THEN
      IF v_src.bureau IS NULL THEN
        v_src := s;
      ELSIF v_c.score_gap IS NULL THEN
        v_c.score_gap := abs(v_src.score - s.score);
      END IF;
    END IF;
  END LOOP;

  v_c.application_id := (v_heads[1]).application_id;
  v_c.bureau := 'COMBINED';
  v_c.no_hit := cardinality(v_hit) = 0;
  v_c.bureau_count := cardinality(v_heads);
  v_c.revolving_counted := coalesce(v_c.revolving_counted, fn_bureau_revolving_in_foir());
  v_c.score := v_src.score;
  v_c.score_source := v_src.bureau;
  v_c.score_gap_flag := CASE WHEN v_c.score_gap IS NOT NULL THEN v_c.score_gap > 50 END;
  v_c.report_ref := coalesce(v_src.report_ref, (v_heads[1]).report_ref);
  v_c.raw_key := coalesce(v_src.raw_key, (v_heads[1]).raw_key);
  v_c.pulled_at := (SELECT min(x.pulled_at) FROM unnest(v_heads) AS x);
  v_c.valid_until := (SELECT min(x.valid_until) FROM unnest(v_heads) AS x);
  v_c.consent_id := (SELECT x.consent_id FROM unnest(v_heads) AS x WHERE x.consent_id IS NOT NULL ORDER BY x.bureau <> 'CIBIL', x.bureau LIMIT 1);
  v_c.grid_month := (SELECT max(x.grid_month) FROM unnest(v_heads) AS x);
  v_c.computed_at := now();
  summaries := summaries || v_c;
END;
$$;

-- =============================================================================
-- 8. Lookups and the simulator
-- =============================================================================

-- A lender name as a bureau prints it -> our lender code ('~' + key if unknown).
CREATE OR REPLACE FUNCTION fn_lender_code(p TEXT)
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT a.lender_code FROM lender_aliases a WHERE a.alias_key = fn_lender_key(p)),
                  '~' || coalesce(left(fn_lender_key(p), 15), ''))::VARCHAR;
$$;

-- A bureau's product name -> our product: the bureau's own row, then '*', then OTHER.
CREATE OR REPLACE FUNCTION fn_bureau_product(p_bureau TEXT, p_raw TEXT)
RETURNS TABLE (product VARCHAR, secured BOOLEAN, revolving BOOLEAN, corporate BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.product, x.secured, x.revolving, x.corporate
  FROM (SELECT m.product, m.secured, m.revolving, m.corporate, 0 AS pri
        FROM bureau_product_map m WHERE m.bureau = p_bureau AND m.raw_key = fn_product_key(p_raw)
        UNION ALL
        SELECT m.product, m.secured, m.revolving, m.corporate, 1
        FROM bureau_product_map m WHERE m.bureau = '*' AND m.raw_key = fn_product_key(p_raw)
        UNION ALL
        SELECT 'OTHER'::VARCHAR, false, false, false, 2) AS x
  ORDER BY x.pri
  LIMIT 1;
$$;

-- The simulator's seed: the PAN blind index (so the same PAN always gets the same report).
CREATE OR REPLACE FUNCTION fn_bureau_seed(p_customer UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed TEXT;
BEGIN
  SELECT coalesce(pan_hash, id::TEXT) INTO v_seed FROM customers WHERE id = p_customer;
  IF v_seed IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_seed;
END;
$$;

-- The salary loan sizes are scaled to: this application's, else the customer's newest.
CREATE OR REPLACE FUNCTION fn_bureau_income_anchor(p_app UUID, p_customer UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT least(1000000, greatest(15000, round(coalesce(
    (SELECT a.declared_net_salary FROM applications a WHERE a.id = p_app),
    (SELECT a.declared_net_salary FROM applications a
     WHERE a.customer_id = p_customer AND a.status <> 'DRAFT' AND a.declared_net_salary IS NOT NULL
     ORDER BY a.created_at DESC LIMIT 1),
    75000))))::INTEGER;
$$;

-- The two simulated bureau reports for one customer, before any combining.
-- Blocks: C = customer (coverage, scores, counts), X = events, A<n> = account n,
-- E<k> = enquiry k. Income changes amounts only, never coverage, scores or DPD.
-- Heads carry bureau, no_hit, score, report_ref, raw_key and grid_month only.
CREATE OR REPLACE FUNCTION fn_bureau_sim_raw(p_seed TEXT, p_as_of DATE, p_income INTEGER,
                                             OUT heads bureau_summary[], OUT accounts bureau_accounts[], OUT enquiries bureau_enquiries[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c          INTEGER[] := fn_sim_bytes(p_seed, 'c0');
  x          INTEGER[] := fn_sim_bytes(p_seed, 'c1');
  b          INTEGER[];
  v_inc      NUMERIC := greatest(15000, least(1000000, coalesce(p_income, 75000)));
  v_hit      BOOLEAN[];
  v_name     TEXT[];
  v_t        INTEGER;
  v_score    INTEGER[];
  v_lag      INTEGER[];
  v_g0       DATE := (date_trunc('month', p_as_of) - INTERVAL '1 month')::DATE;   -- CIBIL's grid month
  v_roles    TEXT[] := '{}';
  v_n        INTEGER;
  v_role     TEXT;
  v_prod     TEXT;
  pr         RECORD;
  pm         RECORD;
  v_lno      INTEGER;
  v_nvar     INTEGER;
  v_ten      INTEGER;
  v_age      INTEGER;
  v_open     DATE;
  v_close    DATE;
  v_status   TEXT;
  v_rate     NUMERIC;
  v_rm       NUMERIC;
  v_sanc     INTEGER;
  v_emi      INTEGER;
  v_out      INTEGER;
  v_limit    INTEGER;
  v_owner    TEXT;
  v_hist     INTEGER[];   -- truth: v_hist[i + 1] = days late i months before CIBIL's grid month (i = 0..36)
  v_mstart   DATE;
  v_dacct    INTEGER;     -- the account that carries the customer's late payments
  v_dm       INTEGER;
  v_sev      INTEGER;
  v_mc       INTEGER;
  v_omit     INTEGER;     -- 1: CIBIL leaves the late payments out, 2: the second bureau does, 0: neither
  v_cards    INTEGER := 0;
  v_seq      INTEGER[] := ARRAY[0, 0];
  v_restr    BOOLEAN := false;
  v_restr1   BOOLEAN;
  v_wo_amt   INTEGER;
  v_st_amt   INTEGER;
  v_g        DATE;
  v_dpd      SMALLINT[];
  v_old      INTEGER;
  v_cell     INTEGER;
  v_raw      TEXT;
  v_days     INTEGER;
  k          INTEGER;
  i          INTEGER;
  j          INTEGER;
  h          bureau_summary;
  a          bureau_accounts;
  e          bureau_enquiries;
BEGIN
  heads := '{}';
  accounts := '{}';
  enquiries := '{}';

  -- Coverage: C1 < 8 neither bureau; 8-12 CIBIL has no record; 13-20 the second bureau has none.
  v_hit := ARRAY[c[1] >= 13, c[1] >= 8 AND c[1] NOT BETWEEN 13 AND 20];
  v_name := ARRAY['CIBIL', CASE WHEN c[6] < 128 THEN 'EXPERIAN' WHEN c[6] < 205 THEN 'CRIF' ELSE 'EQUIFAX' END];
  -- The customer's "true" score: roughly bell-shaped, centre 725, spread about 55.
  v_t := greatest(300, least(900, round(725 + ((c[2] + c[3] + c[4] + c[5]) / 1020.0 - 0.5) / 0.144 * 55)))::INTEGER;
  v_score := ARRAY[greatest(300, least(900, v_t + c[11] % 17 - 8)),
                   greatest(300, least(900, v_t + CASE WHEN c[13] < 16
                                                       THEN (CASE WHEN c[12] % 2 = 0 THEN 1 ELSE -1 END) * (60 + c[12] % 30)
                                                       ELSE c[12] % 41 - 20 END))];
  v_lag := ARRAY[0, CASE WHEN x[3] < 90 THEN 1 ELSE 0 END];   -- the second bureau's grid may be a month behind

  FOR k IN 1..2 LOOP
    h := NULL;
    h.bureau := v_name[k];
    h.no_hit := NOT v_hit[k];
    h.score := CASE WHEN v_hit[k] THEN v_score[k] END;
    h.report_ref := 'SIM-' || left(v_name[k], 3) || '-' || upper(left(md5(p_seed || ':bureau-sim-v2:ecn:' || v_name[k]), 12));
    h.raw_key := 'simulated:' || fn_bureau_sim_version();
    h.grid_month := CASE WHEN v_hit[k] THEN (v_g0 - make_interval(months => v_lag[k]))::DATE END;
    heads := heads || h;
  END LOOP;
  IF NOT (v_hit[1] OR v_hit[2]) THEN
    RETURN;
  END IF;

  -- Which accounts the customer has.
  FOR k IN 1..(ARRAY[0, 1, 1, 1, 2, 2, 3, 0])[c[7] % 8 + 1] LOOP v_roles := v_roles || 'LOAN'::TEXT; END LOOP;
  FOR k IN 1..(ARRAY[0, 1, 1, 2])[c[8] % 4 + 1] LOOP v_roles := v_roles || 'CARD'::TEXT; END LOOP;
  IF c[9] < 30 THEN v_roles := v_roles || 'OD'::TEXT; ELSIF c[9] < 50 THEN v_roles := v_roles || 'CORP'::TEXT; END IF;
  FOR k IN 1..c[10] % 4 LOOP v_roles := v_roles || 'CLOSED'::TEXT; END LOOP;
  IF v_t < 600 AND x[8] < 100 THEN v_roles := v_roles || 'WO'::TEXT; END IF;
  IF v_t < 680 AND x[9] < 50 THEN v_roles := v_roles || 'SETTLED'::TEXT; END IF;

  -- Late payments: more likely the lower the true score; on the first open loan (or card, or overdraft).
  IF c[16] / 256.0 < (CASE WHEN v_t < 600 THEN 0.70 WHEN v_t < 650 THEN 0.45 WHEN v_t < 700 THEN 0.18
                           WHEN v_t < 750 THEN 0.06 ELSE 0.02 END) THEN
    v_dacct := coalesce(array_position(v_roles, 'LOAN'), array_position(v_roles, 'CARD'), array_position(v_roles, 'OD'));
  END IF;
  v_dm := CASE WHEN x[4] < 200 THEN x[4] % 20 ELSE 24 + x[4] % 12 END;
  v_sev := CASE WHEN v_t < 600 THEN 30 * (1 + x[6] % 4)
                WHEN v_t < 650 THEN 30 * (1 + x[6] % 3)
                WHEN v_t < 700 THEN CASE WHEN x[6] < 50 THEN 60 ELSE 30 END
                ELSE CASE WHEN x[6] < 80 THEN 30 ELSE 15 END END;
  v_omit := CASE WHEN x[7] < 40 THEN 2 WHEN x[7] < 60 THEN 1 ELSE 0 END;

  FOR v_n IN 1..coalesce(cardinality(v_roles), 0) LOOP
    v_role := v_roles[v_n];
    b := fn_sim_bytes(p_seed, 'a' || v_n);
    v_prod := CASE v_role
      WHEN 'LOAN' THEN CASE WHEN b[1] < 64 THEN 'AUTO' WHEN b[1] < 115 THEN 'HOME' WHEN b[1] < 179 THEN 'PERSONAL'
                            WHEN b[1] < 217 THEN 'CONSUMER' WHEN b[1] < 235 THEN 'EDUCATION' ELSE 'TWO_WHEELER' END
      WHEN 'CARD' THEN 'CARD'
      WHEN 'OD' THEN 'OVERDRAFT'
      WHEN 'CORP' THEN 'CORP_CARD'
      WHEN 'CLOSED' THEN CASE WHEN b[1] < 100 THEN 'CONSUMER' WHEN b[1] < 160 THEN 'PERSONAL' WHEN b[1] < 200 THEN 'TWO_WHEELER'
                              WHEN b[1] < 225 THEN 'GOLD' ELSE 'CARD' END
      ELSE CASE WHEN b[1] % 2 = 0 THEN 'PERSONAL' ELSE 'CARD' END END;
    SELECT * INTO pr FROM fn_bureau_sim_products() AS sp WHERE sp.product = v_prod;
    -- About 5% of closed consumer loans were with the fictional licence-cancelled lender.
    v_lno := CASE WHEN v_role = 'CLOSED' AND v_prod = 'CONSUMER' AND b[15] < 13 THEN 13
                  WHEN v_prod IN ('CARD', 'CORP_CARD', 'OVERDRAFT', 'HOME') THEN 1 + b[2] % 8
                  WHEN v_prod IN ('CONSUMER', 'TWO_WHEELER') THEN 9 + b[2] % 4
                  ELSE 1 + b[2] % 12 END;
    v_nvar := (SELECT count(*) FROM fn_bureau_sim_lenders() AS sl WHERE sl.lender_no = v_lno);
    v_status := CASE v_role WHEN 'CLOSED' THEN 'CLOSED' WHEN 'WO' THEN 'WRITTEN_OFF' WHEN 'SETTLED' THEN 'SETTLED' ELSE 'ACTIVE' END;
    v_ten := CASE v_prod WHEN 'AUTO' THEN 60 WHEN 'HOME' THEN 240 WHEN 'PERSONAL' THEN (ARRAY[36, 48, 60])[1 + b[10] % 3]
                         WHEN 'CONSUMER' THEN 12 WHEN 'EDUCATION' THEN 84 WHEN 'TWO_WHEELER' THEN 36 WHEN 'GOLD' THEN 12 END;
    v_age := CASE v_role WHEN 'LOAN' THEN 1 + b[6] % least(v_ten - 1, 71)
                         WHEN 'CARD' THEN 6 + b[6] % 114
                         WHEN 'OD' THEN 6 + b[6] % 60
                         WHEN 'CORP' THEN 3 + b[6] % 36
                         WHEN 'CLOSED' THEN coalesce(v_ten, 36) + 1 + b[6] % 48
                         ELSE 18 + b[6] % 30 END;
    v_open := (p_as_of - make_interval(months => v_age) - make_interval(days => b[7] % 28))::DATE;
    v_close := CASE WHEN v_role = 'CLOSED' THEN (v_open + make_interval(months => coalesce(v_ten, 12 + b[6] % 24)))::DATE
                    WHEN v_role IN ('WO', 'SETTLED') THEN (p_as_of - make_interval(months => 1 + x[10] % least(v_age - 6, 50)))::DATE END;

    -- Amounts. Salary loans are sized so the EMI is a share of the income anchor.
    v_rate := CASE v_prod WHEN 'AUTO' THEN 9.0 WHEN 'HOME' THEN 8.5 WHEN 'PERSONAL' THEN 13.0 WHEN 'CONSUMER' THEN 14.0
                          WHEN 'EDUCATION' THEN 10.0 WHEN 'TWO_WHEELER' THEN 11.0 WHEN 'GOLD' THEN 9.5
                          WHEN 'OVERDRAFT' THEN 12.0 ELSE 36.0 END;
    v_rm := v_rate / 1200;
    v_sanc := NULL;
    v_emi := NULL;
    v_limit := NULL;
    v_out := 0;
    IF NOT pr.revolving THEN
      IF v_prod IN ('AUTO', 'HOME', 'PERSONAL', 'EDUCATION') THEN
        v_sanc := round(v_inc * CASE v_prod WHEN 'HOME' THEN 0.18 + b[3] / 255.0 * 0.17
                                            WHEN 'AUTO' THEN 0.08 + b[3] / 255.0 * 0.07
                                            WHEN 'PERSONAL' THEN 0.05 + b[3] / 255.0 * 0.10
                                            ELSE 0.04 + b[3] / 255.0 * 0.06 END
                        * (1 - power(1 + v_rm, -v_ten)) / v_rm, -3)::INTEGER;
      ELSE
        v_sanc := round((CASE v_prod WHEN 'CONSUMER' THEN 20000 + b[3] * 400 WHEN 'TWO_WHEELER' THEN 60000 + b[3] * 400
                                     WHEN 'GOLD' THEN 50000 + b[3] * 1000 ELSE 25000 + b[3] * 500 END)::NUMERIC, -3)::INTEGER;
      END IF;
      v_emi := round(v_sanc * v_rm / (1 - power(1 + v_rm, -v_ten)))::INTEGER;
      IF v_status = 'ACTIVE' THEN
        v_out := round(v_sanc * (power(1 + v_rm, v_ten) - power(1 + v_rm, v_age)) / (power(1 + v_rm, v_ten) - 1))::INTEGER;
      END IF;
    ELSE
      v_limit := (CASE v_prod WHEN 'CARD' THEN round(v_inc * (1 + b[3] / 255.0 * 2.5) / 5000) * 5000
                              WHEN 'OVERDRAFT' THEN greatest(1, round(v_inc * 2 / 10000.0)) * 10000
                              ELSE 100000 + b[3] * 1000 END)::INTEGER;
      IF v_status = 'ACTIVE' THEN
        v_out := round(v_limit * CASE v_prod
                   WHEN 'CARD' THEN least(0.98, (c[15] / 255.0 * 0.7 + CASE WHEN v_t < 680 THEN 0.25 ELSE 0 END) * (0.7 + (b[11] % 60) / 100.0))
                   WHEN 'OVERDRAFT' THEN b[11] / 255.0 * 0.8
                   ELSE b[11] / 255.0 * 0.5 END)::INTEGER;
      END IF;
    END IF;
    v_wo_amt := NULL;
    v_st_amt := NULL;
    IF v_status = 'WRITTEN_OFF' THEN
      v_wo_amt := round(coalesce(v_sanc, v_limit) * (0.4 + b[11] / 255.0 * 0.5))::INTEGER;
      v_out := v_wo_amt;
    ELSIF v_status = 'SETTLED' THEN
      v_st_amt := round(coalesce(v_sanc, v_limit) * (0.2 + b[11] / 255.0 * 0.3))::INTEGER;
    END IF;

    IF v_role = 'CARD' THEN
      v_cards := v_cards + 1;
    END IF;
    v_owner := CASE WHEN v_role = 'LOAN' AND b[16] >= 13 AND b[16] < 18 THEN 'GUARANTOR'
                    WHEN v_role = 'CARD' AND v_cards = 2 AND b[16] >= 250 THEN 'AUTHORISED'
                    WHEN v_prod = 'HOME' AND b[16] < 80 THEN 'JOINT'
                    ELSE 'INDIVIDUAL' END;
    v_restr1 := v_role = 'LOAN' AND NOT v_restr AND x[11] < 8;
    IF v_restr1 THEN
      v_restr := true;
    END IF;

    -- 37 months of truth: 0 while the account was open, -1 before it opened or after it closed.
    v_hist := '{}';
    FOR i IN 0..36 LOOP
      v_mstart := (v_g0 - make_interval(months => i))::DATE;
      v_hist := v_hist || CASE WHEN v_open < (v_mstart + INTERVAL '1 month')::DATE AND (v_close IS NULL OR v_close >= v_mstart) THEN 0 ELSE -1 END;
    END LOOP;
    IF v_dacct = v_n THEN
      FOR k IN 0..5 LOOP
        i := v_dm + k;
        EXIT WHEN v_sev - 30 * k <= 0 OR i > 36;
        IF v_hist[i + 1] >= 0 THEN
          v_hist[i + 1] := greatest(v_hist[i + 1], v_sev - 30 * k);
        END IF;
      END LOOP;
      IF v_t < 650 THEN
        i := x[5] % 6;
        IF v_hist[i + 1] >= 0 THEN
          v_hist[i + 1] := greatest(v_hist[i + 1], 30);
        END IF;
      END IF;
    END IF;
    IF v_status IN ('WRITTEN_OFF', 'SETTLED') THEN
      v_mc := fn_months_between(v_close, v_g0);
      FOR k IN 0..3 LOOP
        i := v_mc + k;
        CONTINUE WHEN i < 0 OR i > 36;
        IF v_hist[i + 1] >= 0 THEN
          v_hist[i + 1] := greatest(v_hist[i + 1], greatest(0, CASE WHEN v_status = 'WRITTEN_OFF' THEN 120 ELSE 90 END - 30 * k));
        END IF;
      END LOOP;
    END IF;

    -- The account as each bureau reports it.
    FOR k IN 1..2 LOOP
      CONTINUE WHEN NOT v_hit[k];
      CONTINUE WHEN k = 1 AND b[8] < 10;      -- about 4% are missing from CIBIL
      CONTINUE WHEN k = 2 AND b[8] >= 236;    -- about 8% are missing from the second bureau
      v_seq[k] := v_seq[k] + 1;
      a := NULL;
      a.bureau := v_name[k];
      a.seq := v_seq[k];
      a.lender_raw := (SELECT sl.alias FROM fn_bureau_sim_lenders() AS sl
                       WHERE sl.lender_no = v_lno AND sl.variant = 1 + (CASE WHEN k = 1 THEN b[4] ELSE b[5] END) % v_nvar);
      a.lender_code := fn_lender_code(a.lender_raw);
      v_raw := CASE WHEN k = 1 THEN pr.cibil_raw
                    WHEN pr.other_raw_alt IS NOT NULL AND b[9] < 40 AND (v_prod <> 'PERSONAL' OR v_name[2] IN ('CRIF', 'EQUIFAX'))
                      THEN pr.other_raw_alt
                    ELSE pr.other_raw END;
      SELECT * INTO pm FROM fn_bureau_product(v_name[k], v_raw);
      a.product_raw := v_raw;
      a.product := pm.product;
      a.secured := pm.secured;
      a.revolving := pm.revolving;
      a.corporate := pm.corporate;
      a.account_masked := CASE WHEN k = 2 AND b[13] < 40 THEN NULL
                               ELSE 'XXXXXXXX' || lpad(((b[13] * 256 + b[2]) % 10000)::TEXT, 4, '0') END;
      a.ownership := v_owner;
      a.status := v_status;
      a.restructured := v_restr1;
      a.suit_filed := v_status = 'WRITTEN_OFF' AND v_t < 650 AND x[12] < 60;
      a.sanctioned := CASE WHEN k = 2 AND v_sanc IS NOT NULL THEN round(v_sanc * (1 + (b[12] % 3) * 0.005), -3)::INTEGER ELSE v_sanc END;
      a.credit_limit := v_limit;
      a.cash_limit := CASE WHEN v_prod = 'CARD' THEN round(v_limit * 0.3)::INTEGER END;
      a.outstanding := v_out;
      a.emi := CASE WHEN v_emi IS NULL THEN NULL WHEN b[14] >= 248 THEN v_emi * 3 ELSE v_emi END;
      a.frequency := CASE WHEN v_emi IS NOT NULL AND b[14] >= 248 THEN 'Q' ELSE 'M' END;
      a.rate_pct := v_rate;
      a.tenure_months := v_ten;
      a.collateral := CASE v_prod WHEN 'AUTO' THEN 'VEHICLE' WHEN 'TWO_WHEELER' THEN 'VEHICLE' WHEN 'HOME' THEN 'PROPERTY' WHEN 'GOLD' THEN 'GOLD' END;
      a.collateral_value := round(v_sanc * CASE v_prod WHEN 'AUTO' THEN 1.15 WHEN 'TWO_WHEELER' THEN 1.15 WHEN 'HOME' THEN 1.6 WHEN 'GOLD' THEN 1.33 END)::INTEGER;
      a.opened_on := CASE WHEN k = 2 THEN v_open + ((b[12] / 3) % 7 - 3) ELSE v_open END;
      a.closed_on := v_close;
      a.last_payment_on := CASE WHEN v_status = 'ACTIVE' THEN p_as_of - (3 + b[7] % 25) ELSE v_close END;
      a.last_payment_amount := CASE WHEN v_status <> 'ACTIVE' THEN NULL WHEN v_emi IS NOT NULL THEN a.emi ELSE round(v_out * 0.05)::INTEGER END;
      a.writeoff_amount := v_wo_amt;
      a.settled_amount := v_st_amt;
      v_g := (v_g0 - make_interval(months => v_lag[k]))::DATE;
      a.grid_month := v_g;
      a.reported_on := (v_g + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      -- grid: dpd[j] = truth[j - 1 + lag]; the 12 months before it give dpd_max_25_36m.
      v_dpd := '{}';
      v_old := -1;
      FOR j IN 1..36 LOOP
        v_cell := v_hist[j + v_lag[k]];
        IF v_dacct = v_n AND v_omit = k AND v_status = 'ACTIVE' AND v_cell > 0 THEN
          v_cell := 0;   -- this bureau left the late payments out
        END IF;
        IF j <= 24 THEN
          v_dpd := v_dpd || v_cell::SMALLINT;
        ELSIF v_cell >= 0 THEN
          v_old := greatest(v_old, v_cell);
        END IF;
      END LOOP;
      a.dpd := v_dpd;
      a.dpd_max_25_36m := v_old;
      a.asset_class := CASE WHEN v_status = 'WRITTEN_OFF' THEN CASE WHEN x[10] % 2 = 0 THEN 'LSS' ELSE 'DBT' END
                            WHEN v_status = 'SETTLED' THEN 'SUB'
                            WHEN v_status = 'ACTIVE' AND v_dpd[1] > 90 THEN 'SUB'
                            ELSE 'STD' END;
      a.overdue := CASE WHEN v_status = 'WRITTEN_OFF' THEN v_out
                        WHEN v_status = 'ACTIVE' AND v_dpd[1] > 0
                          THEN (coalesce(fn_bureau_monthly_emi(a.emi, a.frequency), round(v_out * 0.05)::INTEGER) * ceil(v_dpd[1] / 30.0))::INTEGER
                        ELSE 0 END;
      accounts := accounts || a;
    END LOOP;
  END LOOP;

  -- Enquiries in the last year; fewer for stronger files.
  FOR k IN 1..(CASE WHEN v_t >= 700 THEN c[14] % 4 ELSE c[14] % 7 END) LOOP
    b := fn_sim_bytes(p_seed, 'e' || k);
    v_days := b[1] + b[2] % 110;
    v_prod := CASE WHEN b[4] < 70 THEN 'AUTO' WHEN b[4] < 140 THEN 'PERSONAL' WHEN b[4] < 200 THEN 'CARD'
                   WHEN b[4] < 220 THEN 'HOME' ELSE 'CONSUMER' END;
    SELECT * INTO pr FROM fn_bureau_sim_products() AS sp WHERE sp.product = v_prod;
    v_lno := 1 + b[3] % 12;
    FOR j IN 1..2 LOOP
      CONTINUE WHEN NOT v_hit[j];
      CONTINUE WHEN j = 1 AND b[5] < 20;
      CONTINUE WHEN j = 2 AND b[5] > 230;
      e := NULL;
      e.bureau := v_name[j];
      e.seq := k;
      e.enquired_on := p_as_of - v_days - CASE WHEN j = 2 AND b[6] < 30 THEN 1 ELSE 0 END;
      e.lender_raw := (SELECT sl.alias FROM fn_bureau_sim_lenders() AS sl WHERE sl.lender_no = v_lno AND sl.variant = 1 + b[6 + j] % 3);
      e.lender_code := fn_lender_code(e.lender_raw);
      e.purpose := v_prod;
      e.purpose_raw := CASE WHEN j = 1 THEN pr.cibil_raw ELSE pr.other_raw END;
      e.amount := CASE v_prod WHEN 'AUTO' THEN 500000 + b[9] * 5000 WHEN 'PERSONAL' THEN 100000 + b[9] * 2000
                              WHEN 'HOME' THEN 2000000 + b[9] * 20000 WHEN 'CONSUMER' THEN 30000 + b[9] * 300 END;
      enquiries := enquiries || e;
    END LOOP;
  END LOOP;
END;
$$;

-- Simulate and combine for one customer, without writing anything.
CREATE OR REPLACE FUNCTION fn_bureau_assemble(p_customer UUID, p_app UUID, p_as_of DATE,
                                              OUT summaries bureau_summary[], OUT accounts bureau_accounts[], OUT enquiries bureau_enquiries[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  q RECORD;
BEGIN
  SELECT * INTO r FROM fn_bureau_sim_raw(fn_bureau_seed(p_customer), p_as_of, fn_bureau_income_anchor(p_app, p_customer));
  SELECT * INTO q FROM fn_bureau_combine_arrays(r.heads, r.accounts, r.enquiries, p_as_of);
  summaries := q.summaries;
  accounts := q.accounts;
  enquiries := r.enquiries;
END;
$$;

-- =============================================================================
-- 9. Writers
-- =============================================================================

-- Work out the summaries from the stored per-bureau pulls, and write the
-- engine row if there is none. The engine row is never rewritten, so a
-- recombine changes the detail, never a case already decided.
-- A real bureau feed (the AWS extractor) writes the per-bureau tables and
-- calls this; it never inserts into bureau_reports itself.
CREATE OR REPLACE FUNCTION fn_bureau_combine(p_app UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_heads   bureau_summary[];
  v_accts   bureau_accounts[];
  v_enqs    bureau_enquiries[];
  v_pulled  TIMESTAMPTZ;
  v_as_of   DATE;
  r         RECORD;
  v_c       bureau_summary;
  v_cols    TEXT;
  v_vals    TEXT;
  v_written BOOLEAN := false;
  v_sim     BOOLEAN;
BEGIN
  -- Names an admin added to lender_aliases since the pull now count.
  UPDATE bureau_accounts SET lender_code = fn_lender_code(lender_raw) WHERE application_id = p_app AND lender_code LIKE '~%';
  UPDATE bureau_enquiries SET lender_code = fn_lender_code(lender_raw) WHERE application_id = p_app AND lender_code LIKE '~%';

  SELECT array_agg(s ORDER BY s.bureau <> 'CIBIL', s.bureau), min(s.pulled_at)
    INTO v_heads, v_pulled
    FROM bureau_summary s
   WHERE s.application_id = p_app AND s.bureau <> 'COMBINED';
  IF v_heads IS NULL THEN
    RAISE EXCEPTION 'no bureau pull on file for this application' USING ERRCODE = 'P0002';
  END IF;
  -- The windows are measured from the day of the pull, so they never shift.
  v_as_of := (coalesce(v_pulled, now()) AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_accts := ARRAY(SELECT a FROM bureau_accounts a WHERE a.application_id = p_app ORDER BY a.bureau <> 'CIBIL', a.bureau, a.seq);
  v_enqs := ARRAY(SELECT e FROM bureau_enquiries e WHERE e.application_id = p_app ORDER BY e.bureau <> 'CIBIL', e.bureau, e.seq);

  SELECT * INTO r FROM fn_bureau_combine_arrays(v_heads, v_accts, v_enqs, v_as_of);

  UPDATE bureau_accounts t SET merged_seq = x.merged_seq
    FROM unnest(r.accounts) AS x
   WHERE t.application_id = p_app AND t.bureau = x.bureau AND t.seq = x.seq;

  -- Per-bureau rows: only the measure columns change; the pull's own details stay.
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum), string_agg('x.' || quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_cols, v_vals
    FROM pg_attribute
   WHERE attrelid = 'public.bureau_summary'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN ('application_id', 'bureau', 'report_ref', 'pulled_at', 'valid_until', 'consent_id', 'raw_key',
                         'grid_month', 'no_hit', 'score');
  EXECUTE format('UPDATE bureau_summary t SET (%s) = (SELECT %s FROM unnest($1) AS x WHERE x.bureau = t.bureau) '
                 'WHERE t.application_id = $2 AND t.bureau <> %L', v_cols, v_vals, 'COMBINED')
    USING r.summaries, p_app;

  DELETE FROM bureau_summary WHERE application_id = p_app AND bureau = 'COMBINED';
  INSERT INTO bureau_summary SELECT x.* FROM unnest(r.summaries) AS x WHERE x.bureau = 'COMBINED';
  SELECT x.* INTO v_c FROM unnest(r.summaries) AS x WHERE x.bureau = 'COMBINED';

  -- The engine row: once, never rewritten.
  IF NOT EXISTS (SELECT 1 FROM bureau_reports WHERE application_id = p_app) THEN
    v_sim := NOT EXISTS (SELECT 1 FROM unnest(v_heads) AS x WHERE x.raw_key IS DISTINCT FROM 'simulated:' || fn_bureau_sim_version());
    INSERT INTO bureau_reports (application_id, customer_id, bureau_name, score, score_date, active_accounts, total_outstanding,
                                total_monthly_emi, dpd_max_12m, dpd_max_24m, dpd_30_count_24m, dpd_60_plus_flag,
                                enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct,
                                oldest_account_months, report_raw_path, extracted_at, created_at,
                                report_ref, pulled_at, valid_until, consent_id, no_hit, score_source, bureau_count)
    SELECT p_app, a.customer_id, CASE WHEN v_sim THEN 'CIBIL-SIMULATED' ELSE 'BUREAU-COMBINED' END, v_c.score, v_as_of,
           v_c.active_accounts, v_c.total_outstanding, v_c.monthly_obligation, v_c.dpd_max_12m, v_c.dpd_max_24m,
           v_c.dpd_30_count_24m, v_c.dpd_60_plus_flag, v_c.enquiry_count_90d, v_c.writeoff_count_5y, v_c.settled_count_5y,
           v_c.credit_utilization_pct, v_c.oldest_account_months,
           CASE WHEN v_sim THEN 'simulated:' || fn_bureau_sim_version() ELSE v_c.raw_key END, now(), clock_timestamp(),
           v_c.report_ref, v_c.pulled_at, v_c.valid_until, v_c.consent_id, v_c.no_hit, v_c.score_source, v_c.bureau_count
      FROM applications a WHERE a.id = p_app;
    v_written := true;
  END IF;

  RETURN jsonb_build_object(
    'score', v_c.score,
    'no_hit', v_c.no_hit,
    'score_source', v_c.score_source,
    'engine_row_written', v_written,
    'bureaus', (SELECT coalesce(jsonb_agg(jsonb_build_object('bureau', x.bureau, 'hit', NOT x.no_hit, 'score', x.score)
                                          ORDER BY x.bureau <> 'CIBIL', x.bureau), '[]'::jsonb)
                FROM unnest(r.summaries) AS x WHERE x.bureau <> 'COMBINED'));
END;
$$;

-- The single entry point for a simulated pull: the officer's credit check,
-- the automatic checks and the synthetic-data generator all come here.
-- Pulls once: a report already on file (real or simulated) wins.
-- p_pulled_at backdates the pull (the generator); NULL means now.
CREATE OR REPLACE FUNCTION fn_bureau_pull_simulated(p_app UUID, p_pulled_at TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     applications%ROWTYPE;
  v_consent UUID;
  v_at      TIMESTAMPTZ;
  v_as_of   DATE;
  r         RECORD;
  h         bureau_summary;
  a         bureau_accounts;
  e         bureau_enquiries;
  v_res     JSONB;
BEGIN
  SELECT * INTO v_app FROM applications WHERE id = p_app FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM bureau_reports WHERE application_id = p_app) THEN
    RETURN jsonb_build_object('pulled', false, 'reason', 'report on file');
  END IF;
  -- Consent is needed for every origin, synthetic ones included.
  SELECT id INTO v_consent FROM customer_consents
   WHERE application_id = p_app AND purpose = 'BUREAU_PULL' AND withdrawn_at IS NULL
   ORDER BY given_at DESC LIMIT 1;
  IF v_consent IS NULL THEN
    RAISE EXCEPTION 'the customer has not given consent for a bureau check' USING ERRCODE = '22023';
  END IF;

  DELETE FROM bureau_summary WHERE application_id = p_app;   -- clears any leftovers (cascades)
  v_at := coalesce(p_pulled_at, now());
  v_as_of := (v_at AT TIME ZONE 'Asia/Kolkata')::DATE;
  SELECT * INTO r FROM fn_bureau_sim_raw(fn_bureau_seed(v_app.customer_id), v_as_of, fn_bureau_income_anchor(p_app, v_app.customer_id));

  FOREACH h IN ARRAY r.heads LOOP
    h.application_id := p_app;
    h.consent_id := v_consent;
    h.pulled_at := v_at;
    h.valid_until := v_as_of + 30;
    h.revolving_counted := fn_bureau_revolving_in_foir();
    h.computed_at := now();
    INSERT INTO bureau_summary SELECT (h).*;
  END LOOP;
  FOREACH a IN ARRAY r.accounts LOOP
    a.application_id := p_app;
    a.merged_seq := NULL;
    INSERT INTO bureau_accounts SELECT (a).*;
  END LOOP;
  FOREACH e IN ARRAY r.enquiries LOOP
    e.application_id := p_app;
    INSERT INTO bureau_enquiries SELECT (e).*;
  END LOOP;

  v_res := fn_bureau_combine(p_app);
  -- A backdated pull dates its engine row too (the generator); otherwise clock_timestamp().
  IF p_pulled_at IS NOT NULL AND (v_res->>'engine_row_written')::BOOLEAN THEN
    UPDATE bureau_reports SET created_at = p_pulled_at WHERE application_id = p_app;
  END IF;
  RETURN v_res || jsonb_build_object('pulled', true);
END;
$$;

-- =============================================================================
-- 10. Readers
-- =============================================================================

-- Everything an officer needs to read both bureaus side by side.
-- detail is false for reports from before 053 (v1 simulated, staff, seed rows).
CREATE OR REPLACE FUNCTION fn_bureau_detail_json(p_app UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eng   JSONB;
  v_c     bureau_summary;
  v_both  BOOLEAN;
  v_sum   JSONB;
  v_acc   JSONB;
  v_enq   JSONB;
  v_diff  JSONB;
  v_flags JSONB;
  v_rules JSONB;
  v_counted BOOLEAN;
BEGIN
  v_eng := (SELECT to_jsonb(b) - 'id' - 'application_id' - 'customer_id'
            FROM bureau_reports b WHERE b.application_id = p_app ORDER BY b.created_at DESC LIMIT 1);
  SELECT * INTO v_c FROM bureau_summary WHERE application_id = p_app AND bureau = 'COMBINED';
  -- The switches the stored figures were worked out under.
  v_counted := coalesce(v_c.revolving_counted, fn_bureau_revolving_in_foir());
  v_rules := jsonb_build_object(
    'sim_version', fn_bureau_sim_version(),
    'score_rule', 'CIBIL score; the other bureau only when CIBIL has no record',
    'score_gap_flag_points', 50,
    'revolving_rate', fn_bureau_revolving_rate(),
    'revolving_in_foir', v_counted,
    'guarantor_counted', false,
    'corporate_cards_counted', false,
    'emi_ending_3m_in_foir', true,
    'licence_cancelled_marks_count', true,
    'no_hit_both', 'Referred to a person (D6, missing bureau data); the R11 reject is pending');

  IF v_c.bureau IS NULL THEN
    RETURN jsonb_build_object('detail', false, 'engine', v_eng, 'summaries', '[]'::jsonb, 'accounts', '[]'::jsonb,
                              'enquiries', '[]'::jsonb, 'differences', '[]'::jsonb, 'flags', '[]'::jsonb, 'rules', v_rules);
  END IF;
  v_both := (SELECT count(*) FROM bureau_summary WHERE application_id = p_app AND bureau <> 'COMBINED' AND NOT no_hit) >= 2;

  SELECT coalesce(jsonb_agg(to_jsonb(s) - 'application_id' ORDER BY s.bureau = 'COMBINED', s.bureau <> 'CIBIL', s.bureau), '[]'::jsonb)
    INTO v_sum FROM bureau_summary s WHERE s.application_id = p_app;

  SELECT coalesce(jsonb_agg(to_jsonb(a) - 'application_id' || jsonb_build_object(
           'lender_name', coalesce(l.lender_name, a.lender_raw),
           'licence_cancelled', coalesce(l.licence_cancelled, false),
           'monthly_emi', CASE WHEN a.revolving THEN NULL ELSE fn_bureau_monthly_emi(a.emi, a.frequency) END,
           'counted_in_obligation', a.status = 'ACTIVE' AND NOT a.corporate AND a.ownership IN ('INDIVIDUAL', 'JOINT')
                                    AND (NOT a.revolving OR v_counted),
           'obligation', CASE WHEN NOT (a.status = 'ACTIVE' AND NOT a.corporate AND a.ownership IN ('INDIVIDUAL', 'JOINT')) THEN 0
                              WHEN a.revolving THEN round(fn_bureau_revolving_rate() * a.outstanding)::INTEGER
                              ELSE coalesce(fn_bureau_monthly_emi(a.emi, a.frequency), 0) END,
           -- an open loan with no instalment reported adds 0 to the obligation; say so
           'emi_not_reported', a.status = 'ACTIVE' AND NOT a.revolving AND a.emi IS NULL)
         ORDER BY a.merged_seq, a.bureau <> 'CIBIL', a.bureau, a.seq), '[]'::jsonb)
    INTO v_acc
    FROM bureau_accounts a LEFT JOIN bureau_lenders l ON l.lender_code = a.lender_code
   WHERE a.application_id = p_app;

  SELECT coalesce(jsonb_agg(to_jsonb(e) - 'application_id' || jsonb_build_object(
           'lender_name', coalesce(l.lender_name, e.lender_raw),
           'also_on_other_bureau', EXISTS (SELECT 1 FROM bureau_enquiries o WHERE o.application_id = p_app AND o.bureau <> e.bureau
                                           AND o.lender_code = e.lender_code AND o.enquired_on = e.enquired_on))
         ORDER BY e.enquired_on DESC, e.bureau <> 'CIBIL', e.bureau, e.seq), '[]'::jsonb)
    INTO v_enq
    FROM bureau_enquiries e LEFT JOIN bureau_lenders l ON l.lender_code = e.lender_code
   WHERE e.application_id = p_app;

  -- Where the two bureaus disagree (worked out on read).
  WITH gm AS (SELECT a.merged_seq, max(a.grid_month) AS g FROM bureau_accounts a WHERE a.application_id = p_app GROUP BY a.merged_seq),
  g AS (
    SELECT a.merged_seq AS ms, count(DISTINCT a.bureau) AS nb, min(a.bureau) AS b1,
           min(coalesce(l.lender_name, a.lender_raw)) AS lender, min(a.product) AS product,
           (array_agg(a.product_raw ORDER BY a.bureau <> 'CIBIL', a.bureau))[1] AS product_name,
           count(DISTINCT a.status) AS nst, jsonb_object_agg(a.bureau, a.status) AS st_by,
           count(DISTINCT fn_dpd_window_max(fn_dpd_align(a.dpd, fn_months_between(a.grid_month, gm.g)), 1, 24)) AS ndpd,
           jsonb_object_agg(a.bureau, fn_dpd_window_max(fn_dpd_align(a.dpd, fn_months_between(a.grid_month, gm.g)), 1, 24)) AS dpd_by
    FROM bureau_accounts a
    JOIN gm ON gm.merged_seq IS NOT DISTINCT FROM a.merged_seq
    LEFT JOIN bureau_lenders l ON l.lender_code = a.lender_code
    WHERE a.application_id = p_app
    GROUP BY a.merged_seq)
  SELECT coalesce(jsonb_agg(z.item ORDER BY z.ord, z.ms), '[]'::jsonb) INTO v_diff FROM (
    SELECT 1 AS ord, 0 AS ms,
           jsonb_build_object('code', 'NO_RECORD_ONE_BUREAU', 'bureau', s.bureau, 'merged_seq', NULL, 'detail', NULL,
                              'text', s.bureau || ' has no record for this customer; the other bureau does') AS item
      FROM bureau_summary s
     WHERE s.application_id = p_app AND s.bureau <> 'COMBINED' AND s.no_hit
       AND EXISTS (SELECT 1 FROM bureau_summary o WHERE o.application_id = p_app AND o.bureau NOT IN ('COMBINED', s.bureau) AND NOT o.no_hit)
    UNION ALL
    SELECT 2, 0, jsonb_build_object('code', 'SCORE_GAP', 'bureau', NULL, 'merged_seq', NULL,
                                    'detail', jsonb_build_object('gap', v_c.score_gap),
                                    'text', 'The two bureau scores are ' || v_c.score_gap || ' points apart')
     WHERE coalesce(v_c.score_gap_flag, false)
    UNION ALL
    SELECT 3, g.ms, jsonb_build_object('code', 'ACCOUNT_ONE_BUREAU', 'bureau', g.b1, 'merged_seq', g.ms,
                                       'detail', jsonb_build_object('lender', g.lender, 'product', g.product),
                                       'text', g.lender || ' ' || g.product_name || ' is reported by ' || g.b1 || ' only')
      FROM g WHERE v_both AND g.nb = 1
    UNION ALL
    SELECT 4, g.ms, jsonb_build_object('code', 'STATUS_DIFFERS', 'bureau', NULL, 'merged_seq', g.ms, 'detail', g.st_by,
                                       'text', g.lender || ' ' || g.product_name || ': the bureaus report a different status')
      FROM g WHERE g.nst > 1
    UNION ALL
    SELECT 5, g.ms, jsonb_build_object('code', 'DPD_DIFFERS', 'bureau', NULL, 'merged_seq', g.ms, 'detail', g.dpd_by,
                                       'text', g.lender || ' ' || g.product_name || ': the bureaus report different late payments; the worse counts')
      FROM g WHERE g.ndpd > 1
  ) AS z;

  -- Shown to the officer only; none of these is an engine rule.
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', f.code, 'text', f.txt) ORDER BY f.ord), '[]'::jsonb) INTO v_flags
    FROM (VALUES
      (1, 'NO_HIT_BOTH', 'Neither bureau has a record; the engine refers the case to a person (R11 reject pending)', coalesce(v_c.no_hit, false)),
      (2, 'SCORE_FROM_SECOND_BUREAU', 'CIBIL has no record; the score is from ' || coalesce(v_c.score_source, ''),
          NOT v_c.no_hit AND coalesce(v_c.score_source <> 'CIBIL', false)),
      (3, 'LICENCE_CANCELLED_LENDER', 'An account is reported by a lender whose licence was cancelled; its late payments still count',
          coalesce(v_c.stale_lender_accounts > 0, false)),
      (4, 'RESTRUCTURED', 'A loan was restructured', coalesce(v_c.restructured_count > 0, false)),
      (5, 'OVERDUE', 'An amount is overdue now', coalesce(v_c.overdue_amount > 0, false)),
      (6, 'AUTO_ENQUIRY_30D', 'Another lender was asked about a car loan in the last 30 days', coalesce(v_c.auto_enquiry_30d > 0, false)),
      (7, 'CREDIT_HUNGRY', '3 or more accounts opened in the last 6 months', coalesce(v_c.opened_6m >= 3, false)),
      (8, 'THIN_FILE', 'The oldest account is under 12 months old', coalesce(v_c.oldest_account_months < 12, false)),
      (9, 'EMI_NOT_REPORTED', 'An open loan has no EMI reported on either bureau, so it adds nothing to the monthly obligation',
          EXISTS (SELECT 1 FROM bureau_accounts a WHERE a.application_id = p_app
                   GROUP BY a.merged_seq
                  HAVING bool_or(a.status = 'ACTIVE') AND bool_or(a.ownership IN ('INDIVIDUAL', 'JOINT'))
                     AND NOT bool_or(a.revolving OR a.corporate) AND bool_and(a.emi IS NULL)))
    ) AS f(ord, code, txt, f_on)
   WHERE f.f_on;

  RETURN jsonb_build_object('detail', true, 'engine', v_eng, 'summaries', v_sum, 'accounts', v_acc, 'enquiries', v_enq,
                            'differences', v_diff, 'flags', v_flags, 'rules', v_rules);
END;
$$;

-- The officer's screen: both bureaus side by side for one application.
-- Not limited to customer applications; real customers need pii.reveal (050).
CREATE OR REPLACE FUNCTION fn_staff_bureau_detail(p_application_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_origin TEXT;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  SELECT id, origin INTO v_id, v_origin FROM applications WHERE application_id = p_application_id;
  IF v_id IS NULL OR (v_origin = 'CUSTOMER' AND NOT fn_sees_real_customers()) THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN fn_bureau_detail_json(v_id);
END;
$$;

-- 048's preview, now two bureaus. Same signature and keys: the flat v1 keys come
-- from COMBINED, plus version, score_source and the per-bureau scores.
-- Writes nothing.
CREATE OR REPLACE FUNCTION fn_simulated_bureau(p_customer UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       RECORD;
  s       bureau_summary;
  v_c     bureau_summary;
  v_bur   JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO r FROM fn_bureau_assemble(p_customer, NULL, (now() AT TIME ZONE 'Asia/Kolkata')::DATE);
  FOREACH s IN ARRAY r.summaries LOOP
    IF s.bureau = 'COMBINED' THEN
      v_c := s;
    ELSE
      v_bur := v_bur || jsonb_build_array(jsonb_build_object('bureau', s.bureau, 'hit', NOT s.no_hit, 'score', s.score));
    END IF;
  END LOOP;
  IF v_c.no_hit THEN
    RETURN jsonb_build_object('hit', false, 'version', 2, 'bureaus', v_bur);
  END IF;
  RETURN jsonb_build_object(
    'hit', true,
    'score', v_c.score,
    'active_accounts', v_c.active_accounts,
    'total_monthly_emi', v_c.monthly_obligation,
    'total_outstanding', v_c.total_outstanding,
    'dpd_max_12m', v_c.dpd_max_12m,
    'dpd_max_24m', v_c.dpd_max_24m,
    'dpd_30_count_24m', v_c.dpd_30_count_24m,
    'dpd_60_plus_flag', v_c.dpd_60_plus_flag,
    'enquiry_count_90d', v_c.enquiry_count_90d,
    'writeoff_count_5y', v_c.writeoff_count_5y,
    'settled_count_5y', v_c.settled_count_5y,
    'credit_utilization_pct', v_c.credit_utilization_pct,
    'oldest_account_months', v_c.oldest_account_months,
    'version', 2,
    'score_source', v_c.score_source,
    'bureaus', v_bur);
END;
$$;

-- =============================================================================
-- 11. The credit checks (052's body; only the bureau step changes)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_customer_checks_core(p_app UUID, p_read JSONB, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app       applications%ROWTYPE;
  v_q         vehicle_quotations%ROWTYPE;
  v_staff     UUID;
  v_bureau    JSONB;
  v_bank      JSONB := p_read->'bank';
  v_slip      NUMERIC;
  v_f16       NUMERIC;
  v_bank_sal  NUMERIC;
  v_declared  NUMERIC;
  v_sources   NUMERIC[];
  v_variance  NUMERIC;
  v_result    JSONB;
  v_status    TEXT;
BEGIN
  v_staff := p_actor;   -- NULL when the automatic checks run it
  SELECT * INTO v_app FROM applications WHERE id = p_app AND origin = 'CUSTOMER' FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status NOT IN ('UNDER_ASSESSMENT', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'run the credit checks after the documents are checked' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customer_consents WHERE application_id = v_app.id AND purpose = 'BUREAU_PULL' AND withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'the customer has not given consent for a bureau check' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_q FROM vehicle_quotations WHERE application_id = v_app.id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'the car details are missing on this application' USING ERRCODE = '22023';
  END IF;
  v_status := v_app.status;

  -- The loan and tenure live on the quotation for customer applications.
  UPDATE applications SET loan_amount_requested = v_q.loan_amount_requested, tenure_months = v_q.tenure_months WHERE id = v_app.id;

  -- Vehicle, from the quotation (rebuilt on every run).
  DELETE FROM vehicles WHERE application_id = v_app.id;
  INSERT INTO vehicles (application_id, make, model, variant, fuel_type, vehicle_category, ex_showroom_price,
                        road_tax, insurance, registration_charges, on_road_price)
  VALUES (v_app.id, v_q.make, v_q.model, coalesce(nullif(v_q.variant, ''), 'Not given'), coalesce(v_q.fuel_type, 'PETROL'), 'CAR',
          v_q.ex_showroom, coalesce(v_q.road_tax, 0), coalesce(v_q.insurance, 0),
          greatest(0, coalesce(v_q.on_road, v_q.ex_showroom) - v_q.ex_showroom - coalesce(v_q.road_tax, 0) - coalesce(v_q.insurance, 0)),
          coalesce(v_q.on_road, v_q.ex_showroom));

  -- Bureau: keep a real report if there is one; otherwise the two-bureau simulated pull, once (053).
  IF NOT EXISTS (SELECT 1 FROM bureau_reports WHERE application_id = v_app.id) THEN
    PERFORM fn_bureau_pull_simulated(v_app.id, NULL);
  END IF;

  -- Bank statement analysis: only what the reader found.
  DELETE FROM bank_statement_analyses WHERE application_id = v_app.id;
  IF jsonb_typeof(v_bank) = 'object' AND coalesce((v_bank->>'months')::NUMERIC, 0) > 0 THEN
    v_bank_sal := nullif((v_bank->>'avg_salary')::NUMERIC, 0);
    INSERT INTO bank_statement_analyses (application_id, customer_id, statement_from, statement_to, months_covered,
                                         avg_monthly_balance, avg_salary_credit, salary_regularity, bounce_count_6m)
    VALUES (v_app.id, v_app.customer_id, (current_date - ((v_bank->>'months')::INTEGER || ' months')::INTERVAL)::DATE, current_date,
            (v_bank->>'months')::SMALLINT, (v_bank->>'avg_monthly_balance')::NUMERIC, v_bank_sal,
            CASE WHEN coalesce((v_bank->>'salary_count')::INTEGER, 0) >= (v_bank->>'months')::INTEGER THEN 'REGULAR' ELSE 'IRREGULAR' END,
            coalesce((v_bank->>'bounce_count')::SMALLINT, 0));
  END IF;

  -- Income: declared, slip, bank and Form 16, and how far apart they are.
  v_declared := v_app.declared_net_salary;
  v_slip := nullif((p_read->>'slip_net_salary')::NUMERIC, 0);
  v_f16 := nullif((p_read->>'form16_annual')::NUMERIC, 0);
  v_sources := array_remove(ARRAY[v_slip, v_bank_sal, round(v_f16 / 12, 2)], NULL);
  v_variance := CASE WHEN v_declared IS NULL OR v_declared = 0 OR cardinality(v_sources) = 0 THEN NULL
                     ELSE round((SELECT max(abs(s - v_declared)) FROM unnest(v_sources) s) / v_declared * 100, 2) END;
  DELETE FROM income_assessments WHERE application_id = v_app.id;
  INSERT INTO income_assessments (application_id, declared_net_salary, salary_slip_salary, bank_credit_salary,
                                  form16_annual_income, form16_monthly_equiv, income_variance_pct, income_variance_flag,
                                  eligible_net_salary, total_eligible_income, assessment_date)
  VALUES (v_app.id, v_declared, v_slip, v_bank_sal, v_f16, round(v_f16 / 12, 2), v_variance, coalesce(v_variance > 5, false),
          -- The lower of what they declared and what the documents show.
          (SELECT min(s) FROM unnest(array_append(v_sources, v_declared)) s),
          (SELECT min(s) FROM unnest(array_append(v_sources, v_declared)) s), current_date);

  -- The same assessment as staff applications.
  v_result := fn_assess_application(v_app.id);
  -- The assessment marks the case under assessment; a referred case stays referred.
  UPDATE applications SET status = v_status WHERE id = v_app.id;

  INSERT INTO audit_events (application_id, event_type, event_detail, actor_type, actor_id)
  VALUES (v_app.id, CASE WHEN v_staff IS NULL THEN 'AUTO_RUN_CHECKS' ELSE 'OFFICER_RUN_CHECKS' END,
          jsonb_build_object('bureau', (SELECT bureau_name FROM bureau_reports WHERE application_id = v_app.id ORDER BY created_at DESC LIMIT 1),
                             'bank_read', v_bank_sal IS NOT NULL, 'slip_read', v_slip IS NOT NULL, 'form16_read', v_f16 IS NOT NULL,
                             'recommendation', (SELECT recommendation FROM recommendations WHERE application_id = v_app.id ORDER BY generated_at DESC LIMIT 1)),
          CASE WHEN v_staff IS NULL THEN 'SYSTEM' ELSE 'USER' END, v_staff);

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 12. The engine with no bureau score
-- =============================================================================
-- Both functions declared rate_row as RECORD and only filled it when the
-- bureau had a score, then read rate_row.rate_pct, so an application with no
-- record at either bureau (about 3% of simulated customers) raised
-- 'record "rate_row" is not assigned yet' and the credit check failed.
-- fn_run_policy_engine: 004's body, unchanged except rate_row is
-- rate_grid%ROWTYPE (empty fields until filled) and the D6 block after the rules.
-- fn_generate_recommendation: 031's body, unchanged except rate_row is
-- rate_grid%ROWTYPE; "rate_row IS NULL" is still true until a row is read.
-- Re-running 004 or 031 after this file brings the crash back.

CREATE OR REPLACE FUNCTION fn_run_policy_engine(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  bureau RECORD;
  bank RECORD;
  income RECORD;
  rule RECORD;
  actual_val DECIMAL;
  threshold_val DECIMAL;
  passed BOOLEAN;
  result_label VARCHAR(10);
  passed_count INTEGER := 0;
  failed_count INTEGER := 0;
  flagged_count INTEGER := 0;
  has_reject BOOLEAN := false;
  has_maybe BOOLEAN := false;
  results JSONB := '[]'::JSONB;
  age_at_app INTEGER;
  age_at_maturity INTEGER;
  total_obligations DECIMAL;
  proposed_emi DECIMAL;
  foir_pct DECIMAL;
  ltv_pct DECIMAL;
  rate_row rate_grid%ROWTYPE;
BEGIN
  -- Load application data
  SELECT * INTO app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Application not found');
  END IF;

  SELECT * INTO veh FROM vehicles WHERE application_id = p_application_id LIMIT 1;
  SELECT * INTO bureau FROM bureau_reports WHERE application_id = p_application_id
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO bank FROM bank_statement_analyses WHERE application_id = p_application_id
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO income FROM income_assessments WHERE application_id = p_application_id
    ORDER BY created_at DESC LIMIT 1;

  -- Get the customer's age
  SELECT c.age_at_application INTO age_at_app
    FROM customers c WHERE c.id = app.customer_id;
  age_at_maturity := coalesce(age_at_app, 0) + coalesce(app.tenure_months, 0) / 12;

  -- Get rate for EMI calc
  IF bureau.score IS NOT NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true
        AND bureau.score BETWEEN score_band_min AND score_band_max
      LIMIT 1;
  END IF;

  -- Calculate derived values
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  IF rate_row.rate_pct IS NOT NULL THEN
    proposed_emi := fn_calculate_emi(
      coalesce(app.loan_amount_requested, 0),
      rate_row.rate_pct,
      coalesce(app.tenure_months, 60)
    );
  ELSE
    proposed_emi := coalesce(app.indicative_emi, 0);
  END IF;

  IF coalesce(income.total_eligible_income, app.declared_net_salary, 0) > 0 THEN
    foir_pct := round(
      (total_obligations + proposed_emi) /
      coalesce(income.total_eligible_income, app.declared_net_salary) * 100, 2
    );
  ELSE
    foir_pct := 100;
  END IF;

  IF veh.ex_showroom_price IS NOT NULL AND veh.ex_showroom_price > 0 THEN
    ltv_pct := round(coalesce(app.loan_amount_requested, 0) / veh.ex_showroom_price * 100, 2);
  ELSE
    ltv_pct := 0;
  END IF;

  -- Delete any previous results for this application
  DELETE FROM policy_results WHERE application_id = p_application_id;

  -- Evaluate each active rule
  FOR rule IN
    SELECT * FROM policy_rules WHERE is_active = true ORDER BY display_order
  LOOP
    actual_val := NULL;
    passed := true;

    -- Map rule parameter to actual value
    CASE rule.parameter
      WHEN 'age_at_application' THEN actual_val := age_at_app;
      WHEN 'age_at_maturity' THEN actual_val := age_at_maturity;
      WHEN 'cibil_score' THEN actual_val := bureau.score;
      WHEN 'dpd_max_12m' THEN actual_val := bureau.dpd_max_12m;
      WHEN 'dpd_60_plus_flag' THEN actual_val := CASE WHEN bureau.dpd_60_plus_flag THEN 1 ELSE 0 END;
      WHEN 'writeoff_count_5y' THEN actual_val := bureau.writeoff_count_5y;
      WHEN 'settled_count_5y' THEN actual_val := bureau.settled_count_5y;
      WHEN 'enquiry_count_90d' THEN actual_val := bureau.enquiry_count_90d;
      WHEN 'active_accounts' THEN actual_val := bureau.active_accounts;
      WHEN 'foir_pct' THEN actual_val := foir_pct;
      WHEN 'income_variance_pct' THEN actual_val := income.income_variance_pct;
      WHEN 'ltv_pct' THEN actual_val := ltv_pct;
      WHEN 'bounce_count_6m' THEN actual_val := bank.bounce_count_6m;
      WHEN 'min_amb_vs_emi_pct' THEN
        IF proposed_emi > 0 AND bank.min_amb_5dates IS NOT NULL THEN
          actual_val := round(bank.min_amb_5dates / proposed_emi * 100, 2);
        ELSE
          actual_val := 100;
        END IF;
      WHEN 'salary_regularity' THEN
        actual_val := CASE WHEN bank.salary_regularity = 'REGULAR' THEN 1 ELSE 0 END;
      WHEN 'name_match_score' THEN actual_val := income.name_match_score;
      ELSE
        actual_val := NULL;
    END CASE;

    -- Parse threshold
    IF rule.parameter = 'dpd_60_plus_flag' THEN
      threshold_val := CASE WHEN rule.threshold_value = 'false' THEN 0 ELSE 1 END;
    ELSIF rule.parameter = 'salary_regularity' THEN
      threshold_val := CASE WHEN rule.threshold_value = 'REGULAR' THEN 1 ELSE 0 END;
    ELSE
      threshold_val := rule.threshold_value::DECIMAL;
    END IF;

    -- Skip rule if data is missing (can't evaluate)
    IF actual_val IS NULL THEN
      result_label := 'SKIPPED';
      passed := true;
    ELSE
      -- Evaluate operator
      CASE rule.operator
        WHEN 'GTE' THEN passed := actual_val >= threshold_val;
        WHEN 'LTE' THEN passed := actual_val <= threshold_val;
        WHEN 'EQ'  THEN passed := actual_val = threshold_val;
        WHEN 'GT'  THEN passed := actual_val > threshold_val;
        WHEN 'LT'  THEN passed := actual_val < threshold_val;
        WHEN 'NEQ' THEN passed := actual_val <> threshold_val;
        ELSE passed := true;
      END CASE;

      IF passed THEN
        result_label := 'PASS';
      ELSE
        result_label := 'FAIL';
      END IF;
    END IF;

    -- Count results
    IF result_label = 'PASS' THEN
      passed_count := passed_count + 1;
    ELSIF result_label = 'FAIL' THEN
      IF rule.severity_on_fail = 'REJECT' THEN
        failed_count := failed_count + 1;
        has_reject := true;
      ELSE
        flagged_count := flagged_count + 1;
        has_maybe := true;
      END IF;
    END IF;

    -- Write policy_results row
    INSERT INTO policy_results (
      application_id, rule_id, policy_version, result,
      actual_value, threshold_value, severity, reason, reason_code
    ) VALUES (
      p_application_id, rule.rule_id, rule.policy_version, result_label,
      actual_val, threshold_val,
      CASE WHEN result_label = 'FAIL' THEN rule.severity_on_fail ELSE NULL END,
      CASE WHEN result_label = 'FAIL' THEN rule.description ELSE NULL END,
      CASE WHEN result_label = 'FAIL' THEN rule.reason_code ELSE NULL END
    );

    -- Add to results array
    results := results || jsonb_build_array(
      jsonb_build_object(
        'rule_id', rule.rule_id,
        'rule_name', rule.rule_name,
        'result', result_label,
        'actual', actual_val,
        'threshold', threshold_val,
        'severity', CASE WHEN result_label = 'FAIL' THEN rule.severity_on_fail ELSE NULL END,
        'reason_code', CASE WHEN result_label = 'FAIL' THEN rule.reason_code ELSE NULL END
      )
    );
  END LOOP;

  -- D6 (FD4, 17 Sep 2026), added in 053: with no bureau score (no record at
  -- either bureau, or no report) every bureau rule above is skipped, so the
  -- case must not pass on the rest; it goes to a person. Named as in the
  -- unified rules (MISSING_DATA). Kept out of policy_results, which only holds
  -- rows of policy_rules. R11's automatic reject is not applied.
  IF bureau.score IS NULL THEN
    flagged_count := flagged_count + 1;
    has_maybe := true;
    results := results || jsonb_build_array(
      jsonb_build_object(
        'rule_id', 'MISSING_DATA',
        'rule_name', 'Bureau report missing',
        'result', 'FAIL',
        'actual', NULL,
        'threshold', NULL,
        'severity', 'MAYBE',
        'reason_code', 'MISSING_DATA'
      )
    );
  END IF;

  -- Update application status
  UPDATE applications SET
    status = CASE
      WHEN has_reject THEN 'REJECTED'
      WHEN has_maybe THEN 'UNDER_REVIEW'
      ELSE 'APPROVED'
    END,
    assessment_started_at = coalesce(assessment_started_at, now()),
    final_decision_at = now(),
    updated_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'application_id', app.application_id,
    'decision', CASE
      WHEN has_reject THEN 'REJECT'
      WHEN has_maybe THEN 'MAYBE'
      ELSE 'APPROVE'
    END,
    'rules_passed', passed_count,
    'rules_failed', failed_count,
    'rules_flagged', flagged_count,
    'foir_pct', foir_pct,
    'ltv_pct', ltv_pct,
    'proposed_emi', proposed_emi,
    'rate', rate_row.rate_pct,
    'results', results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_generate_recommendation(p_application_id UUID)
RETURNS JSONB AS $$
DECLARE
  app RECORD;
  veh RECORD;
  bureau RECORD;
  bank RECORD;
  income RECORD;
  rate_row rate_grid%ROWTYPE;
  rec_id UUID;
  decision_id UUID;
  decision_band VARCHAR(10);
  rec_rate DECIMAL;
  rec_amount DECIMAL;
  rec_tenure INTEGER;
  rec_emi DECIMAL;
  ltv_calc DECIMAL;
  foir_calc DECIMAL;
  dbr_calc DECIMAL;
  net_surplus DECIMAL;
  risk_factors JSONB;
  positive_factors JSONB;
  rules_passed INTEGER;
  rules_failed INTEGER;
  rules_flagged INTEGER;
  summary TEXT;
  total_obligations DECIMAL;
  policy_result JSONB;
  income_base DECIMAL;
  requested_tenure INTEGER;
  tenure_cap INTEGER;
  tenure_cap_source TEXT;
  ltv_ex_showroom DECIMAL;
  govt BOOLEAN;
BEGIN
  SELECT * INTO app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Application not found');
  END IF;

  SELECT * INTO veh FROM vehicles WHERE application_id = p_application_id LIMIT 1;
  SELECT * INTO bureau FROM bureau_reports WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO bank FROM bank_statement_analyses WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO income FROM income_assessments WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  -- Run policy engine
  policy_result := fn_run_policy_engine(p_application_id);
  rules_passed := coalesce((policy_result->>'rules_passed')::INTEGER, 0);
  rules_failed := coalesce((policy_result->>'rules_failed')::INTEGER, 0);
  rules_flagged := coalesce((policy_result->>'rules_flagged')::INTEGER, 0);

  -- Determine decision band
  IF rules_failed > 0 THEN
    decision_band := 'REJECT';
  ELSIF rules_flagged > 0 THEN
    decision_band := 'MAYBE';
  ELSE
    decision_band := 'APPROVE';
  END IF;

  -- Get rate grid row (with safe fallback)
  IF bureau.score IS NOT NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true
        AND bureau.score BETWEEN score_band_min AND score_band_max
      LIMIT 1;
  END IF;

  IF rate_row IS NULL OR rate_row.rate_pct IS NULL THEN
    SELECT * INTO rate_row FROM rate_grid
      WHERE vehicle_category = 'CAR' AND is_active = true AND band_label = 'APPROVE'
      LIMIT 1;
  END IF;

  rec_rate := coalesce(rate_row.rate_pct, 8.99);
  rec_amount := coalesce(app.loan_amount_requested, 0);

  -- Tenure (CC6.3): the tightest of the product rule and the bureau band's cap.
  -- Employer category also caps tenure, but no category is recorded against an
  -- application yet, so it cannot be applied here (gap register).
  requested_tenure := coalesce(app.tenure_months, 60);
  SELECT c.employment_type = 'GOVERNMENT' INTO govt FROM customers c WHERE c.id = app.customer_id;
  SELECT t.cap, t.source INTO tenure_cap, tenure_cap_source
  FROM fn_tenure_cap(coalesce(govt, false), veh.on_road_price, rate_row.max_tenure_months, rate_row.band_label) t;
  rec_tenure := LEAST(requested_tenure, tenure_cap);

  IF decision_band = 'REJECT' THEN
    rec_rate := 0;
    rec_emi := 0;
  ELSE
    rec_emi := fn_calculate_emi(rec_amount, rec_rate, rec_tenure);
  END IF;

  -- Calculate metrics
  total_obligations := coalesce(bureau.total_monthly_emi, coalesce(app.declared_existing_emis, 0));

  -- LTV (CC6.2): the rules judge the loan against the ex-showroom price, with a
  -- second rule on the on-road price. ltv_calculated has always held the on-road
  -- figure and the impact check reads it as such, so it stays on-road; the
  -- summary now names both.
  IF coalesce(veh.on_road_price, 0) > 0 THEN
    ltv_calc := round(rec_amount / veh.on_road_price * 100, 2);
  ELSE
    ltv_calc := 0;
  END IF;
  IF coalesce(veh.ex_showroom_price, 0) > 0 THEN
    ltv_ex_showroom := round(rec_amount / veh.ex_showroom_price * 100, 2);
  END IF;

  -- FOIR (CC6.1, decision 0.1): net salary plus eligible other income, the same
  -- base the rules use in fn_run_policy_engine. This used to be net salary alone,
  -- so the stored FOIR could read higher than the one the rules had checked.
  income_base := coalesce(income.total_eligible_income, app.declared_net_salary, 0);
  IF income_base > 0 THEN
    foir_calc := round((total_obligations + rec_emi) / income_base * 100, 2);
    dbr_calc := round(total_obligations / income_base * 100, 2);
    net_surplus := income_base - total_obligations - rec_emi;
  ELSE
    foir_calc := 0;
    dbr_calc := 0;
    net_surplus := 0;
  END IF;

  -- Build risk and positive factors
  risk_factors := coalesce(policy_result->'results', '[]'::JSONB);

  -- The rules checked FOIR at the tenure asked for. A shorter tenure raises the
  -- EMI, so if that pushes FOIR past the band's cap the file goes to a person
  -- rather than being approved on figures nobody checked.
  IF rec_tenure < requested_tenure AND decision_band <> 'REJECT' THEN
    risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
      'rule_id', 'TENURE_CAPPED', 'result', 'INFO',
      'reason', format('Tenure reduced from %s to %s months (%s)', requested_tenure, rec_tenure, tenure_cap_source)));
    IF decision_band = 'APPROVE' AND coalesce(rate_row.max_foir_pct, 0) > 0 AND foir_calc > rate_row.max_foir_pct THEN
      decision_band := 'MAYBE';
      rules_flagged := rules_flagged + 1;
      risk_factors := risk_factors || jsonb_build_array(jsonb_build_object(
        'rule_id', 'FOIR_AT_CAPPED_TENURE', 'result', 'FLAG',
        'reason', format('FOIR is %s%% at %s months, above the %s%% cap', foir_calc, rec_tenure, rate_row.max_foir_pct)));
    END IF;
  END IF;
  positive_factors := '[]'::JSONB;

  IF bureau.score IS NOT NULL AND bureau.score >= 750 THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Strong CIBIL score', 'value', bureau.score));
  END IF;
  IF bureau.dpd_max_12m IS NOT NULL AND bureau.dpd_max_12m = 0 THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Clean repayment history', 'value', 'Zero DPD'));
  END IF;
  IF net_surplus > 0 AND net_surplus > rec_emi THEN
    positive_factors := positive_factors || jsonb_build_array(jsonb_build_object('factor', 'Strong disposable surplus', 'value', net_surplus));
  END IF;

  -- Build summary
  IF decision_band = 'APPROVE' THEN
    summary := format('Application approved. CIBIL %s, FOIR %s%%, LTV %s%% of ex-showroom (%s%% of on-road). All %s policy rules passed.',
      coalesce(bureau.score::TEXT, 'N/A'), foir_calc, coalesce(ltv_ex_showroom::TEXT, 'N/A'), ltv_calc, rules_passed);
  ELSIF decision_band = 'REJECT' THEN
    summary := format('Application fails %s hard rule(s). Auto-decline recommended.', rules_failed);
  ELSE
    summary := format('Application flagged on %s rule(s). Manual review required.', rules_flagged);
  END IF;
  IF rec_tenure < requested_tenure AND decision_band <> 'REJECT' THEN
    summary := summary || format(' Tenure reduced from %s to %s months (%s).', requested_tenure, rec_tenure, tenure_cap_source);
  END IF;

  -- Insert recommendation
  INSERT INTO recommendations (
    application_id, recommendation, recommended_rate, recommended_rate_type,
    recommended_amount, recommended_tenure, recommended_emi,
    ltv_calculated, foir_calculated, dbr_calculated, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary_text
  ) VALUES (
    p_application_id, decision_band, rec_rate, coalesce(rate_row.rate_type, 'FIXED'),
    rec_amount, rec_tenure, rec_emi,
    ltv_calc, foir_calc, dbr_calc, net_surplus,
    risk_factors, positive_factors, rules_passed, rules_failed, rules_flagged,
    summary
  ) RETURNING id INTO rec_id;

  -- Insert credit decision
  INSERT INTO credit_decisions (
    application_id, recommendation_id, decision, decided_by,
    sanctioned_amount, sanctioned_rate, sanctioned_tenure, sanctioned_emi,
    sanction_valid_until
  ) VALUES (
    p_application_id, rec_id, decision_band, 'SYSTEM',
    CASE WHEN decision_band != 'REJECT' THEN rec_amount ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_rate ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_tenure ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN rec_emi ELSE NULL END,
    CASE WHEN decision_band != 'REJECT' THEN current_date + 30 ELSE NULL END
  ) RETURNING id INTO decision_id;

  -- Update application status
  UPDATE applications SET
    status = CASE
      WHEN decision_band = 'APPROVE' THEN 'APPROVED'
      WHEN decision_band = 'REJECT' THEN 'REJECTED'
      ELSE 'UNDER_REVIEW'
    END,
    updated_at = now()
  WHERE id = p_application_id;

  -- Audit trail
  INSERT INTO audit_events (application_id, event_type, actor_type, event_detail)
  VALUES (
    p_application_id, 'APPLICATION_ASSESSED', 'SYSTEM',
    jsonb_build_object(
      'application_id', (SELECT application_id FROM applications WHERE id = p_application_id),
      'decision', decision_band,
      'rate', rec_rate,
      'message', summary
    )
  );

  RETURN jsonb_build_object(
    'decision', decision_band,
    'rate', rec_rate,
    'emi', rec_emi,
    'tenure', rec_tenure,
    'amount', rec_amount,
    'foir_pct', foir_calc,
    'ltv_pct', ltv_calc,
    'ltv_ex_showroom_pct', ltv_ex_showroom,
    'tenure_requested', requested_tenure,
    'dbr_pct', dbr_calc,
    'net_surplus', net_surplus,
    'rules_passed', rules_passed,
    'rules_failed', rules_failed,
    'rules_flagged', rules_flagged,
    'summary', summary,
    'risk_factors', risk_factors,
    'positive_factors', positive_factors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 13. Grants
-- =============================================================================
-- Written out in full; nothing relies on default privileges.

REVOKE ALL ON FUNCTION fn_lender_key(TEXT), fn_product_key(TEXT), fn_bureau_revolving_rate(), fn_bureau_revolving_in_foir(),
                       fn_bureau_monthly_emi(INTEGER, CHAR), fn_months_between(DATE, DATE), fn_dpd_align(SMALLINT[], INTEGER),
                       fn_dpd_worst(SMALLINT[], SMALLINT[]), fn_dpd_window_max(SMALLINT[], INT, INT), fn_sim_bytes(TEXT, TEXT),
                       fn_dpd_shifted_out_max(SMALLINT[], INTEGER),
                       fn_bureau_sim_version(), fn_bureau_sim_lenders(), fn_bureau_sim_products()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_bureau_match(bureau_accounts[]), fn_bureau_union(bureau_accounts[], BOOLEAN),
                       fn_bureau_enquiries_union(bureau_enquiries[]),
                       fn_bureau_measures(TEXT, bureau_accounts[], bureau_enquiries[], DATE),
                       fn_bureau_combine_arrays(bureau_summary[], bureau_accounts[], bureau_enquiries[], DATE),
                       fn_lender_code(TEXT), fn_bureau_product(TEXT, TEXT), fn_bureau_seed(UUID), fn_bureau_income_anchor(UUID, UUID),
                       fn_bureau_sim_raw(TEXT, DATE, INTEGER), fn_bureau_assemble(UUID, UUID, DATE),
                       fn_bureau_combine(UUID), fn_bureau_pull_simulated(UUID, TIMESTAMPTZ), fn_bureau_detail_json(UUID),
                       fn_simulated_bureau(UUID), fn_customer_checks_core(UUID, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_staff_bureau_detail(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_staff_bureau_detail(TEXT) TO authenticated;
-- No service_role grant: the synthetic generator runs as postgres in the SQL editor.
-- Pipeline steps, closed as in 018 and 031 (CREATE OR REPLACE keeps them closed; stated again here).
REVOKE EXECUTE ON FUNCTION fn_run_policy_engine(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_generate_recommendation(UUID) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 14. Data step
-- =============================================================================
-- Metadata only. v1 reports keep their numbers and decisions; no detail is
-- made up for them (the detail reader says detail: false).
UPDATE bureau_reports SET no_hit = (score IS NULL) WHERE no_hit IS NULL AND report_raw_path = 'simulated';

-- Checks after running:
-- SELECT count(*) FROM bureau_lenders;            -- 13
-- SELECT count(*) FROM lender_aliases;            -- 38
-- SELECT count(*) FROM bureau_product_map;        -- 20
-- SELECT application_id, count(*) FROM bureau_reports GROUP BY 1 HAVING count(*) > 1;              -- no rows
-- SELECT alias_key FROM lender_aliases WHERE alias_key IS DISTINCT FROM fn_lender_key(alias);     -- no rows
