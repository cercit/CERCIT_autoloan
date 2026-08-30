-- cercit — Seed data for lookup tables
-- Run after 001_schema.sql

-- =============================================================================
-- 1. Indian states and union territories
-- =============================================================================

INSERT INTO states (code, name, is_operating, road_tax_pct) VALUES
  ('AN', 'Andaman and Nicobar Islands', false, NULL),
  ('AP', 'Andhra Pradesh',              true,  14.00),
  ('AR', 'Arunachal Pradesh',           false, NULL),
  ('AS', 'Assam',                       false, NULL),
  ('BR', 'Bihar',                       true,  10.00),
  ('CH', 'Chandigarh',                  true,   6.00),
  ('CG', 'Chhattisgarh',               true,  10.00),
  ('DD', 'Dadra Nagar Haveli and Daman Diu', false, NULL),
  ('DL', 'Delhi',                       true,   8.00),
  ('GA', 'Goa',                         true,  12.00),
  ('GJ', 'Gujarat',                     true,   7.00),
  ('HR', 'Haryana',                     true,   6.00),
  ('HP', 'Himachal Pradesh',            false, NULL),
  ('JK', 'Jammu and Kashmir',           false, NULL),
  ('JH', 'Jharkhand',                   true,   7.00),
  ('KA', 'Karnataka',                   true,  13.00),
  ('KL', 'Kerala',                      true,  21.00),
  ('LA', 'Ladakh',                      false, NULL),
  ('MP', 'Madhya Pradesh',              true,   8.00),
  ('MH', 'Maharashtra',                 true,  11.00),
  ('MN', 'Manipur',                     false, NULL),
  ('ML', 'Meghalaya',                   false, NULL),
  ('MZ', 'Mizoram',                     false, NULL),
  ('NL', 'Nagaland',                    false, NULL),
  ('OD', 'Odisha',                      true,   6.00),
  ('PB', 'Punjab',                      true,   9.00),
  ('PY', 'Puducherry',                  false, NULL),
  ('RJ', 'Rajasthan',                   true,   6.00),
  ('SK', 'Sikkim',                      false, NULL),
  ('TN', 'Tamil Nadu',                  true,  15.00),
  ('TS', 'Telangana',                   true,  14.00),
  ('TR', 'Tripura',                     false, NULL),
  ('UP', 'Uttar Pradesh',              true,   8.00),
  ('UK', 'Uttarakhand',                 true,   6.50),
  ('WB', 'West Bengal',                 true,  12.00)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 2. Rate grid (Phase 1 — Cars only, salaried)
-- =============================================================================

INSERT INTO rate_grid (score_band_min, score_band_max, band_label, rate_pct, rate_type, max_ltv_pct, max_foir_pct, max_tenure_months, vehicle_category, policy_version) VALUES
  -- APPROVE band: CIBIL 750-900
  (750, 900, 'APPROVE', 8.99, 'STANDARD',      120.00, 50.00, 96, 'CAR', '2026.08'),
  -- MAYBE band: CIBIL 650-749
  (650, 749, 'MAYBE',   9.90, 'RISK_ADJUSTED',  100.00, 45.00, 84, 'CAR', '2026.08'),
  -- REJECT band: CIBIL 300-649
  (300, 649, 'REJECT',  0.00, 'STANDARD',         0.00,  0.00,  0, 'CAR', '2026.08')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Reason codes
-- =============================================================================

INSERT INTO reason_codes (code, category, severity, customer_message, internal_message, display_order) VALUES
  -- Bureau
  ('CIBIL_LOW',             'BUREAU',         'REJECT', 'Credit score below minimum threshold',                         'CIBIL score below 650 — auto reject',                    1),
  ('CIBIL_MAYBE',           'BUREAU',         'MAYBE',  'Credit score requires additional review',                       'CIBIL 650-749 — route to officer',                        2),
  ('DPD_12M',               'BUREAU',         'REJECT', 'Recent payment delays found on credit report',                  'DPD > 0 in last 12 months — auto reject',                3),
  ('DPD_60_PLUS',           'BUREAU',         'REJECT', 'Significant payment delays found on credit report',             '60+ DPD ever — auto reject',                              4),
  ('ENQUIRY_VELOCITY',      'BUREAU',         'MAYBE',  'Multiple recent credit enquiries detected',                     'More than 3 bureau enquiries in 90 days',                 5),
  ('WRITEOFF_SETTLED',      'BUREAU',         'REJECT', 'Past account settlements found on credit report',               'Writeoff or settled account in last 5 years',             6),
  ('ACTIVE_ACCOUNTS_HIGH',  'BUREAU',         'MAYBE',  'High number of active credit accounts',                         'More than 3 active accounts',                             7),

  -- Income
  ('FOIR_EXCEEDED',         'INCOME',         'MAYBE',  'Monthly obligations exceed income threshold',                   'FOIR exceeds 50% of net salary',                          10),
  ('INCOME_VARIANCE',       'INCOME',         'MAYBE',  'Income figures need verification across documents',             'Salary variance > 5% across slip/bank/Form16',           11),
  ('SALARY_IRREGULAR',      'INCOME',         'MAYBE',  'Salary credit pattern is irregular',                            'Salary not credited regularly in bank statement',         12),

  -- Collateral
  ('LTV_EXCEEDED',          'COLLATERAL',     'REJECT', 'Loan amount exceeds vehicle value limit',                       'LTV exceeds 120% of ex-showroom price',                   15),

  -- Bank statement
  ('BOUNCE_DETECTED',       'BANK_STATEMENT', 'REJECT', 'Payment bounces found in bank statement',                       'Bounced cheque/mandate in last 6 months — auto reject',  20),
  ('AMB_LOW',               'BANK_STATEMENT', 'MAYBE',  'Average bank balance below threshold',                          'Min AMB across 5 dates < 20% of proposed EMI',           21),
  ('CASH_DEPOSIT_UNVERIFIED','BANK_STATEMENT','MAYBE',  'Cash deposits need source verification',                        'Cash deposits found without verified source proof',      22),

  -- KYC / eligibility
  ('AGE_MIN',               'ELIGIBILITY',    'REJECT', 'Does not meet minimum age requirement',                         'Applicant under 21 years',                                25),
  ('AGE_MAX',               'ELIGIBILITY',    'REJECT', 'Exceeds maximum age at loan maturity',                          'Age at maturity exceeds 65 years',                        26),
  ('PAN_MISMATCH',          'KYC',            'REJECT', 'PAN details do not match application',                          'PAN name mismatch with application',                      27),
  ('NAME_MISMATCH',         'KYC',            'MAYBE',  'Name mismatch found across documents',                          'Name match score below 98% across PAN/Aadhaar/salary',   28),

  -- Document
  ('DOC_MISSING',           'DOCUMENT',       'REJECT', 'Required document not uploaded',                                'Mandatory document missing from application',             30),
  ('OCR_LOW_CONFIDENCE',    'DOCUMENT',       'MAYBE',  'Document quality too low to read clearly',                      'OCR confidence below 95% — manual review needed',        31),

  -- Fraud
  ('SALARY_MISMATCH',       'FRAUD',          'MAYBE',  'Income information needs verification',                         'Declared salary vs extracted salary variance > 10%',     35),
  ('DOC_TAMPERING',         'FRAUD',          'REJECT', 'Document authenticity could not be verified',                   'Document tampering indicators detected',                  36),
  ('MULTIPLE_APPS',         'FRAUD',          'MAYBE',  'Multiple recent applications detected',                         'Multiple applications from same PAN in 90 days',         37)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 4. Policy rules (Phase 1 — v2026.08)
-- =============================================================================

INSERT INTO policy_rules (rule_id, rule_name, category, parameter, operator, threshold_value, threshold_unit, severity_on_fail, reason_code, policy_version, display_order, description) VALUES
  -- Hard filters
  ('HF-AGE-MIN',    'Minimum age',                'HARD_FILTER',     'age_at_application',     'GTE', '21',    'YEARS',   'REJECT', 'AGE_MIN',             '2026.08', 1,  'Applicant must be at least 21 years old'),
  ('HF-AGE-MAX',    'Maximum age at maturity',    'HARD_FILTER',     'age_at_maturity',        'LTE', '65',    'YEARS',   'REJECT', 'AGE_MAX',             '2026.08', 2,  'Age at loan maturity must not exceed 65'),

  -- Bureau
  ('BUR-SCORE-MIN', 'Minimum CIBIL score',        'BUREAU',          'cibil_score',            'GTE', '650',   'COUNT',   'REJECT', 'CIBIL_LOW',           '2026.08', 10, 'CIBIL score must be 650 or above'),
  ('BUR-DPD-12M',   'Zero DPD in 12 months',      'BUREAU',          'dpd_max_12m',            'EQ',  '0',     'COUNT',   'REJECT', 'DPD_12M',             '2026.08', 11, 'No DPD in the last 12 months'),
  ('BUR-DPD-60',    'No 60+ DPD ever',            'BUREAU',          'dpd_60_plus_flag',       'EQ',  'false', NULL,      'REJECT', 'DPD_60_PLUS',         '2026.08', 12, 'No 60-day or longer DPD at any time'),
  ('BUR-WRITEOFF',  'No writeoff/settled 5y',     'BUREAU',          'writeoff_count_5y',      'EQ',  '0',     'COUNT',   'REJECT', 'WRITEOFF_SETTLED',    '2026.08', 13, 'No writeoffs or settled accounts in 5 years'),
  ('BUR-SETTLED',   'No settled accounts 5y',     'BUREAU',          'settled_count_5y',       'EQ',  '0',     'COUNT',   'REJECT', 'WRITEOFF_SETTLED',    '2026.08', 14, 'No settled accounts in 5 years'),
  ('BUR-ENQUIRY',   'Enquiry velocity check',     'BUREAU',          'enquiry_count_90d',      'LTE', '3',     'COUNT',   'MAYBE',  'ENQUIRY_VELOCITY',    '2026.08', 15, 'Max 3 bureau enquiries in 90 days'),
  ('BUR-ACTIVE',    'Active accounts limit',      'BUREAU',          'active_accounts',        'LTE', '3',     'COUNT',   'MAYBE',  'ACTIVE_ACCOUNTS_HIGH','2026.08', 16, 'Max 3 active credit accounts'),

  -- Income
  ('INC-FOIR',      'FOIR maximum',               'INCOME',          'foir_pct',               'LTE', '50',    'PERCENT', 'MAYBE',  'FOIR_EXCEEDED',       '2026.08', 20, 'FOIR must not exceed 50% of net salary'),
  ('INC-VARIANCE',  'Income variance check',      'INCOME',          'income_variance_pct',    'LTE', '5',     'PERCENT', 'MAYBE',  'INCOME_VARIANCE',     '2026.08', 21, 'Max 5% variance between salary sources'),

  -- Collateral
  ('COL-LTV',       'LTV maximum',                'COLLATERAL',      'ltv_pct',                'LTE', '120',   'PERCENT', 'REJECT', 'LTV_EXCEEDED',        '2026.08', 25, 'LTV must not exceed 120% of ex-showroom'),

  -- Bank statement
  ('BS-BOUNCE',     'Zero bounces',               'BANK_STATEMENT',  'bounce_count_6m',        'EQ',  '0',     'COUNT',   'REJECT', 'BOUNCE_DETECTED',     '2026.08', 30, 'Zero bounced cheques/mandates in 6 months'),
  ('BS-AMB',        'Minimum AMB',                'BANK_STATEMENT',  'min_amb_vs_emi_pct',     'GTE', '20',    'PERCENT', 'MAYBE',  'AMB_LOW',             '2026.08', 31, 'Min AMB across 5 dates >= 20% of EMI'),
  ('BS-SALARY-REG', 'Salary regularity',          'BANK_STATEMENT',  'salary_regularity',      'EQ',  'REGULAR', NULL,    'MAYBE',  'SALARY_IRREGULAR',    '2026.08', 32, 'Salary must be credited regularly'),

  -- KYC
  ('KYC-NAME',      'Name match across docs',     'ELIGIBILITY',     'name_match_score',       'GTE', '98',    'PERCENT', 'MAYBE',  'NAME_MISMATCH',       '2026.08', 35, 'Name match score >= 98% across PAN/Aadhaar/salary')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. Default admin user (for demo)
-- =============================================================================

INSERT INTO users (email, full_name, role, state_code, max_sanction_amount, daily_case_limit) VALUES
  ('rajeev.menon@cercit.in',   'Rajeev Menon',   'CREDIT_OFFICER', 'TN', 2500000.00, 40),
  ('priya.sharma@cercit.in',   'Priya Sharma',   'STATE_HEAD',     'KA', 5000000.00, 10),
  ('admin@cercit.in',          'System Admin',    'ADMIN',          NULL, NULL,        NULL)
ON CONFLICT (email) DO NOTHING;
