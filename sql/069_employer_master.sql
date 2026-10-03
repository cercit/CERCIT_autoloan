-- =============================================================================
-- 069: A real Employer Master, with checks behind each field (fix list G4, C9)
-- =============================================================================
-- The Employer Master page read the `dealers` table and relabelled each car
-- maker as an employer, every one "Category B", verified "today" (C9). Nothing
-- on it was an employer or a check. The employer category (A/B/C) drives the
-- rate loading, the LTV and tenure caps and the processing fee, so it needs a
-- real master behind it (C8 uses it in the engine, migration 070).
--
-- Tables
--   * employers: name and the other names it appears under on payslips; CIN
--     and GSTIN; type (government, PSU, listed, MNC, public limited, private
--     limited, LLP, partnership, proprietorship, other) and the resulting
--     category A/B/C; listed on NSE/BSE; year of incorporation (and the exact
--     date if known) and years of filings; company status; official email
--     domains; industry; head-office city and state; caution flag and reason;
--     last verified on and by whom. `verified` is false until the checks pass
--     and someone confirms; until then the category is provisional.
--   * employer_checks: every check run, with its result, detail and source.
--   * employer_category_changes: a change of category is a request one person
--     makes and a second person approves (never the same person).
--   * employer_reference_list: the maintained lists the checks compare with
--     (government and PSU bodies; NSE/BSE listed companies).
--   * employer_master_settings: which provider runs the company checks.
--     SIMULATED today: it reads the CIN's own fields (listed or unlisted,
--     state, year, company type) and treats the company as active; it never
--     invents facts about a real company. A live MCA provider replaces it later.
--
-- Checks (fn_employer_run_checks): CIN at MCA (simulated), GSTIN format and
-- checksum, listed-company list, government/PSU list, caution list. Per case
-- (fn_employer_for_application, used by 070): official email domain, and the
-- name on payslips and Form 16 against the master and its other names.
--
-- Category rule (fn_employer_category_rule): government, PSU, listed company
-- or MNC -> A; public or private limited / LLP with 3+ years of filings and
-- active -> B; otherwise C. A struck-off or insolvent company is C and goes to
-- a person. With no checks yet, the category is provisional from the type.
--
-- Starting rows: one employer per distinct employer name already on
-- applications, with the type the customer gave, no CIN or GSTIN, not
-- verified. Nothing is made up.
--
-- New right employer.manage (credit head, credit manager, policy manager,
-- admin): add and edit employers, run checks, request a category change, and
-- approve someone else's request.
--
-- Run order: after 068. Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Name key: the same employer under small spelling differences
-- -----------------------------------------------------------------------------
-- "Infosys Ltd", "Infosys Limited" and "INFOSYS LTD." share the key "infosys".
CREATE OR REPLACE FUNCTION fn_employer_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9 ]', ' ', 'g'),
             '\y(pvt|private|ltd|limited|llp|the|co|company|corp|corporation|inc|india)\y', ' ', 'g'),
           '\s+', ' ', 'g')), '');
$$;

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employers (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  name              VARCHAR(200)  NOT NULL,
  name_key          TEXT          NOT NULL,
  aliases           TEXT[]        NOT NULL DEFAULT '{}',
  cin               VARCHAR(21),
  gstin             VARCHAR(15),
  employer_type     VARCHAR(20)   NOT NULL DEFAULT 'OTHER',
  category          CHAR(1)       NOT NULL DEFAULT 'C',
  verified          BOOLEAN       NOT NULL DEFAULT false,
  listed            BOOLEAN,
  listed_symbol     VARCHAR(20),
  incorporation_year SMALLINT,
  incorporated_on   DATE,
  years_of_filings  SMALLINT,
  company_status    VARCHAR(20)   NOT NULL DEFAULT 'UNKNOWN',
  email_domains     TEXT[]        NOT NULL DEFAULT '{}',
  industry          VARCHAR(100),
  hq_city           VARCHAR(100),
  hq_state          VARCHAR(2),
  caution           BOOLEAN       NOT NULL DEFAULT false,
  caution_reason    TEXT,
  last_verified_at  TIMESTAMPTZ,
  last_verified_by  UUID,
  source            VARCHAR(40)   NOT NULL DEFAULT 'STAFF',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT pk_employers PRIMARY KEY (id),
  CONSTRAINT uq_employers_name_key UNIQUE (name_key),
  CONSTRAINT ck_employers_type CHECK (employer_type IN ('GOVERNMENT', 'PSU', 'LISTED', 'MNC', 'PUBLIC_LTD', 'PRIVATE_LTD',
                                                         'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'OTHER')),
  CONSTRAINT ck_employers_category CHECK (category IN ('A', 'B', 'C')),
  CONSTRAINT ck_employers_status CHECK (company_status IN ('ACTIVE', 'STRUCK_OFF', 'UNDER_INSOLVENCY', 'UNKNOWN')),
  CONSTRAINT ck_employers_cin CHECK (cin IS NULL OR cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'),
  CONSTRAINT ck_employers_gstin CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  CONSTRAINT fk_employers_verified_by FOREIGN KEY (last_verified_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS employer_checks (
  id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  employer_id  UUID         NOT NULL,
  check_code   VARCHAR(20)  NOT NULL,
  result       VARCHAR(15)  NOT NULL,
  detail       JSONB        NOT NULL DEFAULT '{}',
  source       VARCHAR(30)  NOT NULL,
  checked_by   UUID,
  checked_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_employer_checks PRIMARY KEY (id),
  CONSTRAINT fk_employer_checks_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT ck_employer_checks_code CHECK (check_code IN ('CIN_MCA', 'GSTIN', 'LISTED', 'GOVT_PSU', 'CAUTION')),
  CONSTRAINT ck_employer_checks_result CHECK (result IN ('PASS', 'FAIL', 'REVIEW', 'NOT_APPLICABLE', 'INFO'))
);
CREATE INDEX IF NOT EXISTS ix_employer_checks_employer ON employer_checks (employer_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS employer_category_changes (
  id            UUID         NOT NULL DEFAULT gen_random_uuid(),
  employer_id   UUID         NOT NULL,
  from_category CHAR(1)      NOT NULL,
  to_category   CHAR(1)      NOT NULL,
  reason        TEXT         NOT NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'PENDING',
  requested_by  UUID,
  requested_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  CONSTRAINT pk_employer_category_changes PRIMARY KEY (id),
  CONSTRAINT fk_employer_category_changes_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT ck_employer_category_changes_to CHECK (to_category IN ('A', 'B', 'C')),
  CONSTRAINT ck_employer_category_changes_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
);
-- one open request per employer
CREATE UNIQUE INDEX IF NOT EXISTS uq_employer_category_changes_open ON employer_category_changes (employer_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS employer_reference_list (
  list_code  VARCHAR(10)  NOT NULL,
  name       VARCHAR(200) NOT NULL,
  name_key   TEXT         NOT NULL,
  exchange   VARCHAR(10),
  symbol     VARCHAR(20),
  source     TEXT         NOT NULL,
  added_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT pk_employer_reference_list PRIMARY KEY (list_code, name_key),
  CONSTRAINT ck_employer_reference_list_code CHECK (list_code IN ('GOVT_PSU', 'LISTED'))
);

CREATE TABLE IF NOT EXISTS employer_master_settings (
  id        BOOLEAN      NOT NULL DEFAULT true,
  provider  VARCHAR(20)  NOT NULL DEFAULT 'SIMULATED',
  CONSTRAINT pk_employer_master_settings PRIMARY KEY (id),
  CONSTRAINT ck_employer_master_settings_one CHECK (id),
  CONSTRAINT ck_employer_master_settings_provider CHECK (provider IN ('SIMULATED', 'MCA_LIVE'))
);
INSERT INTO employer_master_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Applications point at the employer they were matched to (filled by 070).
ALTER TABLE applications ADD COLUMN IF NOT EXISTS employer_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_employer') THEN
    ALTER TABLE applications ADD CONSTRAINT fk_applications_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE SET NULL;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS ix_applications_employer ON applications (employer_id);

-- Closed to the API: read and changed through the functions below.
ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_category_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_reference_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_master_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employers, employer_checks, employer_category_changes, employer_reference_list, employer_master_settings
  FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. The right to manage employers
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, module, description) VALUES
  ('employer.manage', 'pricing', 'Add and edit employers, run their checks, and request or approve a category change (never your own)')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, 'employer.manage' FROM roles r
WHERE r.code IN ('credit_head', 'credit_manager', 'policy_manager', 'admin')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Reference lists (maintained; the checks compare with them)
-- -----------------------------------------------------------------------------

INSERT INTO employer_reference_list (list_code, name, name_key, exchange, symbol, source) VALUES
  ('GOVT_PSU', 'Indian Railways', fn_employer_key('Indian Railways'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Government of Karnataka', fn_employer_key('Government of Karnataka'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Government of Maharashtra', fn_employer_key('Government of Maharashtra'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Government of Tamil Nadu', fn_employer_key('Government of Tamil Nadu'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Central Board of Direct Taxes', fn_employer_key('Central Board of Direct Taxes'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Oil and Natural Gas Corporation Ltd', fn_employer_key('ONGC Ltd'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Bharat Electronics Ltd', fn_employer_key('Bharat Electronics Ltd'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'Indian Oil Corporation Ltd', fn_employer_key('Indian Oil Corporation Ltd'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('GOVT_PSU', 'State Bank of India', fn_employer_key('State Bank of India'), NULL, NULL, 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Infosys Ltd', fn_employer_key('Infosys Ltd'), 'NSE', 'INFY', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Tata Consultancy Services Ltd', fn_employer_key('Tata Consultancy Services Ltd'), 'NSE', 'TCS', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'HCL Technologies Ltd', fn_employer_key('HCL Technologies Ltd'), 'NSE', 'HCLTECH', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Larsen and Toubro Ltd', fn_employer_key('Larsen and Toubro Ltd'), 'NSE', 'LT', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Wipro Ltd', fn_employer_key('Wipro Ltd'), 'NSE', 'WIPRO', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Bosch Ltd', fn_employer_key('Bosch Ltd'), 'NSE', 'BOSCHLTD', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Siemens Ltd', fn_employer_key('Siemens Ltd'), 'NSE', 'SIEMENS', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Oil and Natural Gas Corporation Ltd', fn_employer_key('ONGC Ltd'), 'NSE', 'ONGC', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Bharat Electronics Ltd', fn_employer_key('Bharat Electronics Ltd'), 'NSE', 'BEL', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'Indian Oil Corporation Ltd', fn_employer_key('Indian Oil Corporation Ltd'), 'NSE', 'IOC', 'Starting list, 3 Oct 2026'),
  ('LISTED', 'State Bank of India', fn_employer_key('State Bank of India'), 'NSE', 'SBIN', 'Starting list, 3 Oct 2026')
ON CONFLICT (list_code, name_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Rules and checks (internal)
-- -----------------------------------------------------------------------------

-- The category the policy gives an employer.
CREATE OR REPLACE FUNCTION fn_employer_category_rule(p_type TEXT, p_listed BOOLEAN, p_years SMALLINT, p_status TEXT)
RETURNS CHAR(1)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('STRUCK_OFF', 'UNDER_INSOLVENCY') THEN 'C'
    WHEN p_type IN ('GOVERNMENT', 'PSU', 'LISTED', 'MNC') OR coalesce(p_listed, false) THEN 'A'
    WHEN p_type IN ('PUBLIC_LTD', 'PRIVATE_LTD', 'LLP') AND coalesce(p_years, 0) >= 3 AND p_status = 'ACTIVE' THEN 'B'
    -- not checked yet: provisional from the declared type (a limited company is taken as B until its filings are seen)
    WHEN p_type IN ('PUBLIC_LTD', 'PRIVATE_LTD', 'LLP') AND p_status = 'UNKNOWN' THEN 'B'
    ELSE 'C'
  END::CHAR(1);
$$;

-- GSTIN: 2-digit state, 10-character PAN, entity number, 'Z', check character (mod 36).
CREATE OR REPLACE FUNCTION fn_gstin_valid(p_gstin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_chars CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum   INTEGER := 0;
  v_prod  INTEGER;
  v_i     INTEGER;
BEGIN
  IF p_gstin IS NULL OR p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RETURN false;
  END IF;
  FOR v_i IN 1..14 LOOP
    v_prod := (strpos(v_chars, substr(p_gstin, v_i, 1)) - 1) * CASE WHEN v_i % 2 = 0 THEN 2 ELSE 1 END;
    v_sum := v_sum + v_prod / 36 + v_prod % 36;
  END LOOP;
  RETURN substr(v_chars, ((36 - v_sum % 36) % 36) + 1, 1) = substr(p_gstin, 15, 1);
END;
$$;

-- Run every master check on one employer, record each, and bring the derived
-- fields up to date. Returns the checks and the category the rule gives.
CREATE OR REPLACE FUNCTION fn_employer_checks_internal(p_employer UUID, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e          employers%ROWTYPE;
  v_provider TEXT;
  v_source   TEXT;
  v_listed   employer_reference_list%ROWTYPE;
  v_govt     BOOLEAN;
  v_year     SMALLINT;
  v_years    SMALLINT;
  v_status   TEXT;
  v_keys     TEXT[];
  v_rule     CHAR(1);
BEGIN
  SELECT * INTO e FROM employers WHERE id = p_employer;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT provider INTO v_provider FROM employer_master_settings;
  v_source := CASE coalesce(v_provider, 'SIMULATED') WHEN 'SIMULATED' THEN 'SIMULATED' ELSE v_provider END;
  v_keys := array_append(ARRAY(SELECT fn_employer_key(a) FROM unnest(e.aliases) a), e.name_key);
  v_status := e.company_status;
  v_years := e.years_of_filings;
  v_year := e.incorporation_year;

  -- CIN at MCA. Simulated: the CIN itself says listed (L) or unlisted (U), the
  -- state, the year of incorporation and the company type (GOI/SGC are
  -- government companies); the company is taken as active.
  IF e.cin IS NULL THEN
    INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
    VALUES (p_employer, 'CIN_MCA',
            CASE WHEN e.employer_type IN ('GOVERNMENT', 'PARTNERSHIP', 'PROPRIETORSHIP') THEN 'NOT_APPLICABLE' ELSE 'REVIEW' END,
            jsonb_build_object('note', CASE WHEN e.employer_type IN ('GOVERNMENT', 'PARTNERSHIP', 'PROPRIETORSHIP')
                                            THEN 'No company number for this type of employer'
                                            ELSE 'No CIN on file: add it to check the company at MCA' END),
            v_source, p_actor);
  ELSE
    v_year := substr(e.cin, 9, 4)::SMALLINT;
    v_years := LEAST(GREATEST(extract(year FROM now())::INT - v_year, 0), 30)::SMALLINT;
    v_status := 'ACTIVE';
    INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
    VALUES (p_employer, 'CIN_MCA', 'PASS',
            jsonb_build_object('listed_per_cin', left(e.cin, 1) = 'L', 'state', substr(e.cin, 7, 2),
                               'incorporation_year', v_year, 'years_of_filings', v_years,
                               'company_type', substr(e.cin, 13, 3), 'status', 'ACTIVE',
                               'note', CASE WHEN v_source = 'SIMULATED'
                                            THEN 'Simulated: read from the CIN itself; status taken as active until a live MCA lookup is switched on'
                                            ELSE 'Checked at MCA' END),
            v_source, p_actor);
  END IF;

  -- GSTIN format and check character
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'GSTIN',
          CASE WHEN e.gstin IS NULL THEN CASE WHEN e.employer_type = 'GOVERNMENT' THEN 'NOT_APPLICABLE' ELSE 'REVIEW' END
               WHEN fn_gstin_valid(e.gstin) THEN 'PASS' ELSE 'FAIL' END,
          CASE WHEN e.gstin IS NULL THEN jsonb_build_object('note', 'No GSTIN on file')
               WHEN fn_gstin_valid(e.gstin) THEN jsonb_build_object('state', left(e.gstin, 2), 'pan', substr(e.gstin, 3, 10),
                                                                      'note', 'Format and check character are right; registration status is simulated as active')
               ELSE jsonb_build_object('note', 'Not a valid GSTIN (format or check character wrong)') END,
          'FORMAT', p_actor);

  -- Listed company list
  SELECT * INTO v_listed FROM employer_reference_list WHERE list_code = 'LISTED' AND name_key = ANY (v_keys) LIMIT 1;
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'LISTED', CASE WHEN v_listed.name IS NOT NULL OR left(coalesce(e.cin, ''), 1) = 'L' THEN 'PASS' ELSE 'INFO' END,
          CASE WHEN v_listed.name IS NOT NULL THEN jsonb_build_object('exchange', v_listed.exchange, 'symbol', v_listed.symbol, 'listed_as', v_listed.name)
               WHEN left(coalesce(e.cin, ''), 1) = 'L' THEN jsonb_build_object('note', 'The CIN marks it as listed; not on our NSE/BSE list yet')
               ELSE jsonb_build_object('note', 'Not on the NSE/BSE list') END,
          'REFERENCE_LIST', p_actor);

  -- Government / PSU list
  v_govt := EXISTS (SELECT 1 FROM employer_reference_list WHERE list_code = 'GOVT_PSU' AND name_key = ANY (v_keys));
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'GOVT_PSU',
          CASE WHEN e.employer_type NOT IN ('GOVERNMENT', 'PSU') AND NOT v_govt THEN 'NOT_APPLICABLE'
               WHEN v_govt THEN 'PASS' ELSE 'REVIEW' END,
          jsonb_build_object('note', CASE WHEN v_govt THEN 'On the government and PSU list'
                                          WHEN e.employer_type IN ('GOVERNMENT', 'PSU') THEN 'Recorded as government or PSU but not on the list: confirm from the employer ID card or payslip, then add it to the list'
                                          ELSE 'Not a government body or PSU' END),
          'REFERENCE_LIST', p_actor);

  -- Caution list
  INSERT INTO employer_checks (employer_id, check_code, result, detail, source, checked_by)
  VALUES (p_employer, 'CAUTION', CASE WHEN e.caution THEN 'REVIEW' ELSE 'PASS' END,
          jsonb_build_object('note', CASE WHEN e.caution THEN 'On the caution list: ' || coalesce(e.caution_reason, 'no reason given') || '. Cases go to a person.'
                                          ELSE 'Not on the caution list' END),
          'MASTER', p_actor);

  v_rule := fn_employer_category_rule(
              CASE WHEN v_govt AND e.employer_type NOT IN ('GOVERNMENT', 'PSU') THEN 'PSU' ELSE e.employer_type END,
              v_listed.name IS NOT NULL OR left(coalesce(e.cin, ''), 1) = 'L', v_years, v_status);

  UPDATE employers SET
    listed = (v_listed.name IS NOT NULL OR left(coalesce(e.cin, ''), 1) = 'L'),
    listed_symbol = v_listed.symbol,
    incorporation_year = v_year,
    years_of_filings = v_years,
    company_status = v_status,
    last_verified_at = now(),
    last_verified_by = p_actor,
    updated_at = now()
  WHERE id = p_employer;

  RETURN jsonb_build_object('rule_category', v_rule, 'current_category', e.category);
END;
$$;

REVOKE ALL ON FUNCTION fn_employer_checks_internal(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Starting rows: the employers already named on applications (not verified)
-- -----------------------------------------------------------------------------

-- Also run by the daily simulation (G7) for employers new customers name.
CREATE OR REPLACE FUNCTION fn_employer_seed_from_applications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO employers (name, name_key, employer_type, category, source)
  SELECT DISTINCT ON (fn_employer_key(c.employer_name))
         btrim(c.employer_name), fn_employer_key(c.employer_name),
         CASE WHEN c.employer_category IN ('GOVERNMENT', 'PSU', 'MNC', 'PUBLIC_LTD', 'PRIVATE_LTD', 'PARTNERSHIP', 'PROPRIETORSHIP')
              THEN c.employer_category ELSE 'OTHER' END,
         fn_employer_category_rule(CASE WHEN c.employer_category IN ('GOVERNMENT', 'PSU', 'MNC', 'PUBLIC_LTD', 'PRIVATE_LTD', 'PARTNERSHIP', 'PROPRIETORSHIP')
                                        THEN c.employer_category ELSE 'OTHER' END, NULL, NULL, 'UNKNOWN'),
         'FROM_APPLICATIONS'
  FROM customers c
  WHERE fn_employer_key(c.employer_name) IS NOT NULL
  ORDER BY fn_employer_key(c.employer_name), (c.employer_category IS NULL), c.created_at
  ON CONFLICT (name_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION fn_employer_seed_from_applications() FROM PUBLIC, anon, authenticated;

SELECT fn_employer_seed_from_applications();

-- -----------------------------------------------------------------------------
-- 7. Staff functions
-- -----------------------------------------------------------------------------

-- The list, with search, category filter and per-employer case figures.
CREATE OR REPLACE FUNCTION fn_employer_list(p_search TEXT DEFAULT NULL, p_category TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q    TEXT := nullif(btrim(coalesce(p_search, '')), '');
  v_real BOOLEAN;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'pricing.view',
                                          'pricing.author', 'pricing.approve', 'employer.manage']);
  v_real := fn_sees_real_customers();
  RETURN jsonb_build_object(
    'can_manage', fn_has_permission('employer.manage'),
    'provider', (SELECT provider FROM employer_master_settings),
    'pending', (SELECT count(*) FROM employer_category_changes WHERE status = 'PENDING'),
    'rows', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'id', e.id, 'name', e.name, 'aliases', e.aliases, 'employer_type', e.employer_type,
        'category', e.category, 'verified', e.verified, 'listed', e.listed, 'cin', e.cin, 'gstin', e.gstin,
        'company_status', e.company_status, 'years_of_filings', e.years_of_filings, 'industry', e.industry,
        'hq_city', e.hq_city, 'caution', e.caution, 'last_verified_at', e.last_verified_at,
        'last_verified_by', (SELECT full_name FROM users WHERE id = e.last_verified_by),
        'pending_change', EXISTS (SELECT 1 FROM employer_category_changes p WHERE p.employer_id = e.id AND p.status = 'PENDING'),
        'cases', (SELECT count(*) FROM applications a WHERE a.employer_id = e.id
                  AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)),
        'loans', (SELECT count(*) FROM loan_accounts l JOIN applications a ON a.id = l.application_id
                  WHERE a.employer_id = e.id AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)),
        'late_loans', (SELECT count(DISTINCT l.id) FROM loan_accounts l JOIN applications a ON a.id = l.application_id
                       JOIN loan_status_snapshot s ON s.loan_id = l.id
                       WHERE a.employer_id = e.id AND (a.origin IS DISTINCT FROM 'CUSTOMER' OR v_real)
                         AND coalesce(s.days_late, CASE WHEN s.cleared_on IS NULL AND s.due_date < current_date
                                                        THEN current_date - s.due_date END, 0) > 30)) AS x
      FROM employers e
      WHERE (v_q IS NULL OR e.name ILIKE '%' || v_q || '%' OR e.cin ILIKE '%' || v_q || '%'
             OR e.gstin ILIKE '%' || v_q || '%' OR EXISTS (SELECT 1 FROM unnest(e.aliases) a WHERE a ILIKE '%' || v_q || '%'))
        AND (p_category IS NULL OR e.category = p_category)) t)
  );
END;
$$;

-- One employer: every field, the latest result of each check, the category
-- the rule gives, and the category change history.
CREATE OR REPLACE FUNCTION fn_employer_get(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e employers%ROWTYPE;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all', 'pricing.view',
                                          'pricing.author', 'pricing.approve', 'employer.manage']);
  SELECT * INTO e FROM employers WHERE id = p_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'employer', to_jsonb(e) - 'name_key' || jsonb_build_object('last_verified_by_name', (SELECT full_name FROM users WHERE id = e.last_verified_by)),
    'rule_category', fn_employer_category_rule(e.employer_type, e.listed, e.years_of_filings, e.company_status),
    'checks', (SELECT coalesce(jsonb_agg(jsonb_build_object('check', c.check_code, 'result', c.result, 'detail', c.detail,
                                                             'source', c.source, 'at', c.checked_at,
                                                             'by', (SELECT full_name FROM users WHERE id = c.checked_by))
                                         ORDER BY c.check_code), '[]'::jsonb)
               FROM (SELECT DISTINCT ON (check_code) * FROM employer_checks WHERE employer_id = p_id
                     ORDER BY check_code, checked_at DESC) c),
    'changes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'from', r.from_category, 'to', r.to_category,
                                                              'reason', r.reason, 'status', r.status,
                                                              'requested_by', (SELECT full_name FROM users WHERE id = r.requested_by),
                                                              'requested_by_me', r.requested_by IS NOT DISTINCT FROM fn_current_staff_id(),
                                                              'requested_at', r.requested_at,
                                                              'decided_by', (SELECT full_name FROM users WHERE id = r.decided_by),
                                                              'decided_at', r.decided_at, 'note', r.decision_note)
                                          ORDER BY r.requested_at DESC), '[]'::jsonb)
                FROM employer_category_changes r WHERE r.employer_id = p_id)
  );
END;
$$;

-- Add or edit an employer. The category is not edited here: a new employer
-- gets the category the rule gives; a change goes through a request.
CREATE OR REPLACE FUNCTION fn_employer_save(p_id UUID, p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  v_name  TEXT := nullif(btrim(coalesce(p->>'name', '')), '');
  v_type  TEXT := upper(coalesce(nullif(p->>'employer_type', ''), 'OTHER'));
  v_id    UUID := p_id;
  v_cin   TEXT := nullif(upper(btrim(coalesce(p->>'cin', ''))), '');
  v_gst   TEXT := nullif(upper(btrim(coalesce(p->>'gstin', ''))), '');
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'give the employer''s name' USING ERRCODE = '22023';
  END IF;
  IF v_cin IS NOT NULL AND v_cin !~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$' THEN
    RAISE EXCEPTION 'that is not a CIN (21 characters, e.g. L85110KA1981PLC013115)' USING ERRCODE = '22023';
  END IF;
  IF v_gst IS NOT NULL AND NOT fn_gstin_valid(v_gst) THEN
    RAISE EXCEPTION 'that is not a valid GSTIN (15 characters, the last is a check character)' USING ERRCODE = '22023';
  END IF;
  IF (p ? 'caution') AND (p->>'caution')::BOOLEAN AND nullif(btrim(coalesce(p->>'caution_reason', '')), '') IS NULL THEN
    RAISE EXCEPTION 'give a reason for the caution flag' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO employers (name, name_key, employer_type, category, source)
    VALUES (v_name, fn_employer_key(v_name), v_type, fn_employer_category_rule(v_type, NULL, NULL, 'UNKNOWN'), 'STAFF')
    RETURNING id INTO v_id;
  ELSIF NOT EXISTS (SELECT 1 FROM employers WHERE id = v_id) THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE employers SET
    name = v_name,
    name_key = fn_employer_key(v_name),
    aliases = coalesce(ARRAY(SELECT DISTINCT btrim(x) FROM jsonb_array_elements_text(coalesce(p->'aliases', '[]'::jsonb)) x
                             WHERE btrim(x) <> ''), '{}'),
    cin = v_cin,
    gstin = v_gst,
    employer_type = v_type,
    incorporated_on = nullif(p->>'incorporated_on', '')::DATE,
    email_domains = coalesce(ARRAY(SELECT DISTINCT lower(regexp_replace(btrim(x), '^@', ''))
                                   FROM jsonb_array_elements_text(coalesce(p->'email_domains', '[]'::jsonb)) x
                                   WHERE btrim(x) <> ''), '{}'),
    industry = nullif(btrim(coalesce(p->>'industry', '')), ''),
    hq_city = nullif(btrim(coalesce(p->>'hq_city', '')), ''),
    hq_state = nullif(upper(btrim(coalesce(p->>'hq_state', ''))), ''),
    caution = coalesce((p->>'caution')::BOOLEAN, false),
    caution_reason = CASE WHEN coalesce((p->>'caution')::BOOLEAN, false) THEN nullif(btrim(coalesce(p->>'caution_reason', '')), '') END,
    -- a changed record needs checking again before it counts as verified
    verified = false,
    updated_at = now()
  WHERE id = v_id;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES (CASE WHEN p_id IS NULL THEN 'EMPLOYER_ADDED' ELSE 'EMPLOYER_CHANGED' END, 'USER', v_actor,
          jsonb_build_object('employer', v_name, 'employer_id', v_id));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'an employer with this name is already in the master' USING ERRCODE = '23505';
END;
$$;

-- Run the checks. When they all pass (or don't apply) the employer is verified;
-- when the rule gives a different category, a change request is opened for a
-- second person to approve.
CREATE OR REPLACE FUNCTION fn_employer_run_checks(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  v_r     JSONB;
  v_open  INTEGER;
  e       employers%ROWTYPE;
BEGIN
  v_r := fn_employer_checks_internal(p_id, v_actor);
  SELECT count(*) INTO v_open FROM (
    SELECT DISTINCT ON (check_code) result FROM employer_checks WHERE employer_id = p_id ORDER BY check_code, checked_at DESC) c
  WHERE result IN ('FAIL', 'REVIEW');
  UPDATE employers SET verified = (v_open = 0) WHERE id = p_id;
  SELECT * INTO e FROM employers WHERE id = p_id;

  IF (v_r->>'rule_category') <> e.category
     AND NOT EXISTS (SELECT 1 FROM employer_category_changes WHERE employer_id = p_id AND status = 'PENDING') THEN
    INSERT INTO employer_category_changes (employer_id, from_category, to_category, reason, requested_by)
    VALUES (p_id, e.category, (v_r->>'rule_category')::CHAR(1),
            'The checks give category ' || (v_r->>'rule_category') || ' (' || e.employer_type || ', '
              || coalesce(e.years_of_filings::TEXT || ' years of filings', 'filings not known') || ', '
              || lower(e.company_status) || ')', v_actor);
  END IF;

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('EMPLOYER_CHECKED', 'USER', v_actor,
          jsonb_build_object('employer', e.name, 'employer_id', p_id, 'verified', e.verified, 'rule_category', v_r->>'rule_category'));
  RETURN fn_employer_get(p_id);
END;
$$;

-- Ask for a category change (a second person approves it).
CREATE OR REPLACE FUNCTION fn_employer_request_category(p_id UUID, p_category TEXT, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  v_from  CHAR(1);
  v_req   UUID;
BEGIN
  SELECT category INTO v_from FROM employers WHERE id = p_id;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'employer not found' USING ERRCODE = 'P0002';
  END IF;
  IF upper(p_category) NOT IN ('A', 'B', 'C') OR upper(p_category) = v_from THEN
    RAISE EXCEPTION 'choose a different category, A, B or C' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'give a reason' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM employer_category_changes WHERE employer_id = p_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'a category change is already waiting for approval' USING ERRCODE = '22023';
  END IF;
  INSERT INTO employer_category_changes (employer_id, from_category, to_category, reason, requested_by)
  VALUES (p_id, v_from, upper(p_category), btrim(p_reason), v_actor) RETURNING id INTO v_req;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('EMPLOYER_CATEGORY_REQUESTED', 'USER', v_actor,
          jsonb_build_object('employer_id', p_id, 'from', v_from, 'to', upper(p_category), 'reason', btrim(p_reason)));
  RETURN v_req;
END;
$$;

-- Approve or reject someone else's request. Withdraw your own.
CREATE OR REPLACE FUNCTION fn_employer_decide_category(p_request UUID, p_action TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := fn_require_permission('employer.manage');
  r       employer_category_changes%ROWTYPE;
  v_act   TEXT := upper(coalesce(p_action, ''));
BEGIN
  SELECT * INTO r FROM employer_category_changes WHERE id = p_request FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'PENDING' THEN
    RAISE EXCEPTION 'no open category change with that id' USING ERRCODE = 'P0002';
  END IF;
  IF v_act = 'WITHDRAW' THEN
    IF r.requested_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'only the person who asked can withdraw it' USING ERRCODE = '42501';
    END IF;
  ELSIF v_act IN ('APPROVE', 'REJECT') THEN
    IF r.requested_by IS NOT DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'a second person must approve a category change' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'approve, reject or withdraw' USING ERRCODE = '22023';
  END IF;

  UPDATE employer_category_changes SET
    status = CASE v_act WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END,
    decided_by = v_actor, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = p_request;
  IF v_act = 'APPROVE' THEN
    UPDATE employers SET category = r.to_category, updated_at = now() WHERE id = r.employer_id;
  END IF;
  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  VALUES ('EMPLOYER_CATEGORY_' || CASE v_act WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END,
          'USER', v_actor, jsonb_build_object('employer_id', r.employer_id, 'from', r.from_category, 'to', r.to_category));
  RETURN fn_employer_get(r.employer_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Per case: which employer, its category, and the two case checks
-- -----------------------------------------------------------------------------
-- Matches the case's employer name (customer details, payslips, Form 16) to
-- the master by name or other names, then checks the customer's email domain
-- and that the payslip and Form 16 names belong to the same employer.
CREATE OR REPLACE FUNCTION fn_employer_for_application(p_application UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust   customers%ROWTYPE;
  e        employers%ROWTYPE;
  v_names  TEXT[];
  v_slip   TEXT[];
  v_f16    TEXT;
  v_domain TEXT;
  v_keys   TEXT[];
  v_email  JSONB;
  v_match  JSONB;
BEGIN
  SELECT c.* INTO v_cust FROM applications a JOIN customers c ON c.id = a.customer_id WHERE a.id = p_application;
  SELECT array_agg(DISTINCT s.employer_name) INTO v_slip FROM salary_slips s
  WHERE s.application_id = p_application AND s.employer_name IS NOT NULL;
  SELECT f.employer_name INTO v_f16 FROM form16_part_b f WHERE f.application_id = p_application;
  v_names := array_remove(array_cat(ARRAY[v_cust.employer_name, v_f16], coalesce(v_slip, '{}')), NULL);

  -- the master employer: the case's own link first, then by name or other names
  SELECT e2.* INTO e FROM applications a JOIN employers e2 ON e2.id = a.employer_id WHERE a.id = p_application;
  IF e.id IS NULL THEN
    SELECT e2.* INTO e FROM employers e2
    WHERE e2.name_key = ANY (ARRAY(SELECT fn_employer_key(n) FROM unnest(v_names) n))
       OR EXISTS (SELECT 1 FROM unnest(e2.aliases) al WHERE fn_employer_key(al) = ANY (ARRAY(SELECT fn_employer_key(n) FROM unnest(v_names) n)))
    ORDER BY (e2.name_key = fn_employer_key(v_cust.employer_name)) DESC, e2.verified DESC
    LIMIT 1;
  END IF;
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'names_seen', to_jsonb(v_names));
  END IF;
  v_keys := array_append(ARRAY(SELECT fn_employer_key(al) FROM unnest(e.aliases) al), e.name_key);

  v_domain := lower(split_part(coalesce(v_cust.email, ''), '@', 2));
  v_email := CASE
    WHEN v_domain = '' THEN jsonb_build_object('result', 'NOT_APPLICABLE', 'note', 'No email on the case')
    WHEN v_domain IN ('gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'rediffmail.com',
                      'icloud.com', 'proton.me', 'protonmail.com', 'synthetic.invalid', 'live.com')
      THEN jsonb_build_object('result', 'NOT_APPLICABLE', 'note', 'Personal email (' || v_domain || '), not checked')
    WHEN cardinality(e.email_domains) = 0 THEN jsonb_build_object('result', 'REVIEW', 'note', 'No official email domain on the employer record')
    WHEN v_domain = ANY (e.email_domains) OR EXISTS (SELECT 1 FROM unnest(e.email_domains) d WHERE v_domain LIKE '%.' || d)
      THEN jsonb_build_object('result', 'PASS', 'note', v_domain || ' is the employer''s domain')
    ELSE jsonb_build_object('result', 'FAIL', 'note', v_domain || ' is not one of the employer''s domains')
  END;

  v_match := CASE
    WHEN v_slip IS NULL AND v_f16 IS NULL THEN jsonb_build_object('result', 'NOT_APPLICABLE', 'note', 'No payslip or Form 16 read yet')
    WHEN NOT EXISTS (SELECT 1 FROM unnest(array_remove(array_cat(coalesce(v_slip, '{}'), ARRAY[v_f16]), NULL)) n
                     WHERE NOT (fn_employer_key(n) = ANY (v_keys)))
      THEN jsonb_build_object('result', 'PASS', 'note', 'Payslip and Form 16 names match the employer or its other names')
    ELSE jsonb_build_object('result', 'REVIEW', 'note', 'A payslip or Form 16 name does not match: ' ||
           (SELECT string_agg(DISTINCT n, ', ') FROM unnest(array_remove(array_cat(coalesce(v_slip, '{}'), ARRAY[v_f16]), NULL)) n
            WHERE NOT (fn_employer_key(n) = ANY (v_keys))))
  END;

  RETURN jsonb_build_object(
    'found', true, 'employer_id', e.id, 'name', e.name, 'category', e.category, 'verified', e.verified,
    'employer_type', e.employer_type, 'caution', e.caution, 'caution_reason', e.caution_reason,
    'checks', jsonb_build_object('EMAIL_DOMAIN', v_email, 'NAME_MATCH', v_match,
                                 'CAUTION', jsonb_build_object('result', CASE WHEN e.caution THEN 'REVIEW' ELSE 'PASS' END,
                                                               'note', CASE WHEN e.caution THEN 'On the caution list: ' || coalesce(e.caution_reason, '') ELSE 'Not on the caution list' END)));
END;
$$;

REVOKE ALL ON FUNCTION fn_employer_for_application(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION fn_employer_list(TEXT, TEXT), fn_employer_get(UUID), fn_employer_save(UUID, JSONB),
                       fn_employer_run_checks(UUID), fn_employer_request_category(UUID, TEXT, TEXT),
                       fn_employer_decide_category(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_employer_list(TEXT, TEXT), fn_employer_get(UUID), fn_employer_save(UUID, JSONB),
                          fn_employer_run_checks(UUID), fn_employer_request_category(UUID, TEXT, TEXT),
                          fn_employer_decide_category(UUID, TEXT, TEXT) TO authenticated;

-- Checks after running:
-- SELECT count(*), count(*) FILTER (WHERE verified) FROM employers;        -- one per employer named on applications; none verified yet
-- SELECT category, count(*) FROM employers GROUP BY 1;                    -- provisional categories from the declared type
-- SELECT count(*) FROM role_permissions WHERE permission_code = 'employer.manage';   -- 4
