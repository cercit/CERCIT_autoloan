-- cercit — Credit Evaluation and Risk Compliance Intelligence Tool
-- Database schema for Supabase (PostgreSQL 15+)
-- 22 tables, 293 columns
-- Generated from db_schema_template.xlsx

-- =============================================================================
-- 0. Extensions and utility function
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. Lookup / reference tables (no FKs to other app tables)
-- =============================================================================

-- 1a. states
CREATE TABLE states (
  code           VARCHAR(5)     NOT NULL,
  name           VARCHAR(100)   NOT NULL,
  is_operating   BOOLEAN        NOT NULL DEFAULT true,
  road_tax_pct   DECIMAL(5,2),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_states       PRIMARY KEY (code),
  CONSTRAINT uk_states_name  UNIQUE (name)
);

-- 1b. reason_codes
CREATE TABLE reason_codes (
  code              VARCHAR(30)   NOT NULL,
  category          VARCHAR(20)   NOT NULL,
  severity          VARCHAR(10)   NOT NULL,
  customer_message  TEXT          NOT NULL,
  internal_message  TEXT          NOT NULL,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  display_order     SMALLINT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_reason_codes PRIMARY KEY (code)
);

-- 1c. users
CREATE TABLE users (
  id                  UUID           NOT NULL DEFAULT gen_random_uuid(),
  email               VARCHAR(255)   NOT NULL,
  full_name           VARCHAR(200)   NOT NULL,
  role                VARCHAR(30)    NOT NULL,
  state_code          VARCHAR(5),
  is_active           BOOLEAN        NOT NULL DEFAULT true,
  max_sanction_amount DECIMAL(12,2),
  daily_case_limit    SMALLINT,
  auth_user_id        UUID,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_users       PRIMARY KEY (id),
  CONSTRAINT uk_users_email UNIQUE (email),
  CONSTRAINT fk_users_state FOREIGN KEY (state_code) REFERENCES states(code)
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 1d. dealers
CREATE TABLE dealers (
  id            UUID           NOT NULL DEFAULT gen_random_uuid(),
  dealer_code   VARCHAR(20)    NOT NULL,
  dealer_name   VARCHAR(200)   NOT NULL,
  make          VARCHAR(50)    NOT NULL,
  city          VARCHAR(100),
  state_code    VARCHAR(5),
  risk_tier     VARCHAR(10),
  is_active     BOOLEAN        NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_dealers           PRIMARY KEY (id),
  CONSTRAINT uk_dealers_code      UNIQUE (dealer_code),
  CONSTRAINT fk_dealers_state     FOREIGN KEY (state_code) REFERENCES states(code)
);

CREATE TRIGGER trg_dealers_updated_at
  BEFORE UPDATE ON dealers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 1e. rate_grid
CREATE TABLE rate_grid (
  id                 UUID          NOT NULL DEFAULT gen_random_uuid(),
  score_band_min     SMALLINT      NOT NULL,
  score_band_max     SMALLINT      NOT NULL,
  band_label         VARCHAR(20)   NOT NULL,
  rate_pct           DECIMAL(5,2)  NOT NULL,
  rate_type          VARCHAR(20)   NOT NULL,
  max_ltv_pct        DECIMAL(5,2)  NOT NULL,
  max_foir_pct       DECIMAL(5,2)  NOT NULL,
  max_tenure_months  SMALLINT      NOT NULL,
  vehicle_category   VARCHAR(10)   NOT NULL,
  policy_version     VARCHAR(10)   NOT NULL,
  is_active          BOOLEAN       NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_rate_grid PRIMARY KEY (id)
);

CREATE TRIGGER trg_rate_grid_updated_at
  BEFORE UPDATE ON rate_grid
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2. Customers
-- =============================================================================

CREATE TABLE customers (
  id                UUID           NOT NULL DEFAULT gen_random_uuid(),
  full_name         VARCHAR(200)   NOT NULL,
  email             VARCHAR(255)   NOT NULL,
  mobile            VARCHAR(15)    NOT NULL,
  pan_number        VARCHAR(10),
  aadhaar_last_four VARCHAR(4),
  date_of_birth     DATE,
  age_at_application SMALLINT,
  gender            VARCHAR(10),
  address_line1     VARCHAR(300),
  address_line2     VARCHAR(300),
  city              VARCHAR(100),
  state_code        VARCHAR(5),
  pincode           VARCHAR(6),
  employer_name     VARCHAR(200),
  employment_type   VARCHAR(20),
  email_verified    BOOLEAN        NOT NULL DEFAULT false,
  auth_user_id      UUID,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_customers       PRIMARY KEY (id),
  CONSTRAINT uk_customers_email UNIQUE (email),
  CONSTRAINT uk_customers_pan   UNIQUE (pan_number),
  CONSTRAINT fk_customers_state FOREIGN KEY (state_code) REFERENCES states(code)
);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. Applications (central table)
-- =============================================================================

CREATE TABLE applications (
  id                        UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id            VARCHAR(14)    NOT NULL,
  customer_id               UUID           NOT NULL,
  vehicle_id                UUID,
  status                    VARCHAR(30)    NOT NULL DEFAULT 'DRAFT',
  current_step              SMALLINT       NOT NULL DEFAULT 1,
  loan_amount_requested     DECIMAL(12,2),
  down_payment              DECIMAL(12,2),
  tenure_months             SMALLINT,
  purpose                   VARCHAR(20),
  exchange_vehicle_detail   TEXT,
  exchange_existing_loan    BOOLEAN,
  exchange_outstanding_amount DECIMAL(12,2),
  exchange_monthly_emi      DECIMAL(10,2),
  declared_net_salary       DECIMAL(10,2),
  declared_other_income     DECIMAL(10,2),
  other_income_source       VARCHAR(100),
  declared_existing_emis    DECIMAL(10,2),
  declared_rent             DECIMAL(10,2),
  declared_insurance        DECIMAL(10,2),
  declared_food_household   DECIMAL(10,2),
  declared_travel           DECIMAL(10,2),
  declared_other_expenses   DECIMAL(10,2),
  indicative_emi            DECIMAL(10,2),
  indicative_rate           DECIMAL(5,2),
  in_principle_result       VARCHAR(20),
  in_principle_at           TIMESTAMPTZ,
  documents_submitted_at    TIMESTAMPTZ,
  assessment_started_at     TIMESTAMPTZ,
  final_decision_at         TIMESTAMPTZ,
  draft_expires_at          TIMESTAMPTZ,
  sanction_valid_until      TIMESTAMPTZ,
  assigned_officer_id       UUID,
  state_code                VARCHAR(5),
  created_at                TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_applications           PRIMARY KEY (id),
  CONSTRAINT uk_applications_appid     UNIQUE (application_id),
  CONSTRAINT fk_applications_customer  FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_applications_officer   FOREIGN KEY (assigned_officer_id) REFERENCES users(id),
  CONSTRAINT fk_applications_state     FOREIGN KEY (state_code) REFERENCES states(code)
);

CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_applications_status     ON applications(status);
CREATE INDEX idx_applications_customer   ON applications(customer_id);
CREATE INDEX idx_applications_officer    ON applications(assigned_officer_id);
CREATE INDEX idx_applications_state      ON applications(state_code);
CREATE INDEX idx_applications_created    ON applications(created_at DESC);

-- =============================================================================
-- 4. Vehicles (depends on applications, dealers)
-- =============================================================================

CREATE TABLE vehicles (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id        UUID           NOT NULL,
  make                  VARCHAR(50)    NOT NULL,
  model                 VARCHAR(100)   NOT NULL,
  variant               VARCHAR(100)   NOT NULL,
  fuel_type             VARCHAR(20)    NOT NULL,
  vehicle_category      VARCHAR(10)    NOT NULL,
  ex_showroom_price     DECIMAL(12,2)  NOT NULL,
  road_tax              DECIMAL(10,2)  NOT NULL,
  insurance             DECIMAL(10,2)  NOT NULL,
  registration_charges  DECIMAL(10,2)  NOT NULL,
  on_road_price         DECIMAL(12,2)  NOT NULL,
  dealer_id             UUID,
  quotation_number      VARCHAR(50),
  quotation_date        DATE,
  quotation_verified    BOOLEAN        NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_vehicles            PRIMARY KEY (id),
  CONSTRAINT fk_vehicles_app        FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_vehicles_dealer     FOREIGN KEY (dealer_id) REFERENCES dealers(id)
);

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Back-reference from applications to vehicles (deferred to avoid circular dependency)
ALTER TABLE applications
  ADD CONSTRAINT fk_applications_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);

-- =============================================================================
-- 5. Documents
-- =============================================================================

CREATE TABLE documents (
  id                UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id    UUID           NOT NULL,
  doc_type          VARCHAR(30)    NOT NULL,
  file_name         VARCHAR(255)   NOT NULL,
  file_path         TEXT           NOT NULL,
  file_hash         VARCHAR(64)    NOT NULL,
  file_size_bytes   INTEGER        NOT NULL,
  mime_type         VARCHAR(50)    NOT NULL,
  upload_status     VARCHAR(20)    NOT NULL DEFAULT 'UPLOADED',
  ocr_confidence    DECIMAL(5,2),
  extraction_status VARCHAR(20),
  uploaded_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  extracted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_documents     PRIMARY KEY (id),
  CONSTRAINT fk_documents_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_documents_app     ON documents(application_id);
CREATE INDEX idx_documents_type    ON documents(application_id, doc_type);

-- =============================================================================
-- 6. Document extractions
-- =============================================================================

CREATE TABLE document_extractions (
  id                   UUID           NOT NULL DEFAULT gen_random_uuid(),
  document_id          UUID           NOT NULL,
  application_id       UUID           NOT NULL,
  field_name           VARCHAR(100)   NOT NULL,
  field_value          TEXT           NOT NULL,
  field_type           VARCHAR(20)    NOT NULL,
  page_number          SMALLINT,
  extraction_method    VARCHAR(20)    NOT NULL,
  confidence           DECIMAL(5,4)   NOT NULL,
  source_type          VARCHAR(20)    NOT NULL,
  verified             BOOLEAN        NOT NULL DEFAULT false,
  verified_by          VARCHAR(20),
  verified_at          TIMESTAMPTZ,
  customer_edited      BOOLEAN        NOT NULL DEFAULT false,
  customer_edit_reason TEXT,
  original_value       TEXT,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_doc_extractions     PRIMARY KEY (id),
  CONSTRAINT fk_doc_extractions_doc FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_doc_extractions_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_doc_extractions_app   ON document_extractions(application_id);
CREATE INDEX idx_doc_extractions_field ON document_extractions(application_id, field_name);

-- =============================================================================
-- 7. Bureau reports
-- =============================================================================

CREATE TABLE bureau_reports (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id        UUID           NOT NULL,
  customer_id           UUID           NOT NULL,
  bureau_name           VARCHAR(20)    NOT NULL,
  score                 SMALLINT,
  score_date            DATE,
  active_accounts       SMALLINT,
  total_outstanding     DECIMAL(14,2),
  total_monthly_emi     DECIMAL(10,2),
  dpd_max_12m           SMALLINT,
  dpd_max_24m           SMALLINT,
  dpd_30_count_24m      SMALLINT,
  dpd_60_plus_flag      BOOLEAN,
  enquiry_count_90d     SMALLINT,
  writeoff_count_5y     SMALLINT,
  settled_count_5y      SMALLINT,
  credit_utilization_pct DECIMAL(5,2),
  oldest_account_months SMALLINT,
  report_raw_path       TEXT,
  extracted_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_bureau_reports          PRIMARY KEY (id),
  CONSTRAINT fk_bureau_reports_app      FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_bureau_reports_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_bureau_reports_app ON bureau_reports(application_id);

-- =============================================================================
-- 8. Bank statement analyses
-- =============================================================================

CREATE TABLE bank_statement_analyses (
  id                       UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id           UUID           NOT NULL,
  customer_id              UUID           NOT NULL,
  bank_name                VARCHAR(100),
  account_number_last4     VARCHAR(4),
  statement_from           DATE           NOT NULL,
  statement_to             DATE           NOT NULL,
  months_covered           SMALLINT       NOT NULL,
  avg_monthly_balance      DECIMAL(12,2),
  amb_on_5th               DECIMAL(12,2),
  amb_on_10th              DECIMAL(12,2),
  amb_on_15th              DECIMAL(12,2),
  amb_on_20th              DECIMAL(12,2),
  amb_on_25th              DECIMAL(12,2),
  min_amb_5dates           DECIMAL(12,2),
  avg_salary_credit        DECIMAL(10,2),
  salary_regularity        VARCHAR(20),
  total_emi_debits         DECIMAL(10,2),
  bounce_count_6m          SMALLINT,
  cash_deposit_total_6m    DECIMAL(12,2),
  cash_deposit_proof_status VARCHAR(20),
  cash_deposit_proof_type  VARCHAR(50),
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_bank_analyses          PRIMARY KEY (id),
  CONSTRAINT fk_bank_analyses_app      FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_bank_analyses_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_bank_analyses_app ON bank_statement_analyses(application_id);

-- =============================================================================
-- 9. Bank transactions
-- =============================================================================

CREATE TABLE bank_transactions (
  id              UUID           NOT NULL DEFAULT gen_random_uuid(),
  analysis_id     UUID           NOT NULL,
  application_id  UUID           NOT NULL,
  txn_date        DATE           NOT NULL,
  txn_type        VARCHAR(10)    NOT NULL,
  amount          DECIMAL(12,2)  NOT NULL,
  balance_after   DECIMAL(12,2),
  description     VARCHAR(500),
  category        VARCHAR(30),
  counterparty    VARCHAR(200),
  is_recurring    BOOLEAN,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_bank_transactions          PRIMARY KEY (id),
  CONSTRAINT fk_bank_transactions_analysis FOREIGN KEY (analysis_id) REFERENCES bank_statement_analyses(id),
  CONSTRAINT fk_bank_transactions_app      FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_bank_txn_analysis ON bank_transactions(analysis_id);
CREATE INDEX idx_bank_txn_app      ON bank_transactions(application_id);

-- =============================================================================
-- 10. Income assessments
-- =============================================================================

CREATE TABLE income_assessments (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id        UUID           NOT NULL,
  declared_net_salary   DECIMAL(10,2),
  salary_slip_salary    DECIMAL(10,2),
  bank_credit_salary    DECIMAL(10,2),
  form16_annual_income  DECIMAL(12,2),
  form16_monthly_equiv  DECIMAL(10,2),
  income_variance_pct   DECIMAL(5,2),
  income_variance_flag  BOOLEAN        NOT NULL DEFAULT false,
  eligible_net_salary   DECIMAL(10,2),
  declared_other_income DECIMAL(10,2),
  eligible_other_income DECIMAL(10,2),
  total_eligible_income DECIMAL(10,2),
  employer_name_match   BOOLEAN,
  name_match_score      DECIMAL(5,2),
  assessment_date       DATE,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_income_assessments     PRIMARY KEY (id),
  CONSTRAINT fk_income_assessments_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_income_assessments_app ON income_assessments(application_id);

-- =============================================================================
-- 11. Obligation details
-- =============================================================================

CREATE TABLE obligation_details (
  id                      UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id          UUID           NOT NULL,
  source                  VARCHAR(20)    NOT NULL,
  obligation_type         VARCHAR(30)    NOT NULL,
  lender_name             VARCHAR(200),
  monthly_emi             DECIMAL(10,2)  NOT NULL,
  outstanding_amount      DECIMAL(12,2),
  remaining_tenure_months SMALLINT,
  exclude_from_foir       BOOLEAN        NOT NULL DEFAULT false,
  is_undisclosed          BOOLEAN        NOT NULL DEFAULT false,
  dpd_current             SMALLINT,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_obligation_details     PRIMARY KEY (id),
  CONSTRAINT fk_obligation_details_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_obligation_details_app ON obligation_details(application_id);

-- =============================================================================
-- 12. Policy rules
-- =============================================================================

CREATE TABLE policy_rules (
  id                UUID           NOT NULL DEFAULT gen_random_uuid(),
  rule_id           VARCHAR(30)    NOT NULL,
  rule_name         VARCHAR(100)   NOT NULL,
  category          VARCHAR(30)    NOT NULL,
  parameter         VARCHAR(50)    NOT NULL,
  operator          VARCHAR(10)    NOT NULL,
  threshold_value   VARCHAR(50)    NOT NULL,
  threshold_unit    VARCHAR(20),
  severity_on_fail  VARCHAR(20)    NOT NULL,
  reason_code       VARCHAR(20),
  policy_version    VARCHAR(10)    NOT NULL,
  is_active         BOOLEAN        NOT NULL DEFAULT true,
  display_order     SMALLINT,
  description       TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_rules         PRIMARY KEY (id),
  CONSTRAINT uk_policy_rules_ruleid  UNIQUE (rule_id),
  CONSTRAINT fk_policy_rules_reason  FOREIGN KEY (reason_code) REFERENCES reason_codes(code)
);

CREATE TRIGGER trg_policy_rules_updated_at
  BEFORE UPDATE ON policy_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 13. Policy results (per-rule evaluation per application)
-- =============================================================================

CREATE TABLE policy_results (
  id               UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id   UUID           NOT NULL,
  rule_id          VARCHAR(30)    NOT NULL,
  policy_version   VARCHAR(10)    NOT NULL,
  result           VARCHAR(10)    NOT NULL,
  actual_value     DECIMAL(14,4),
  threshold_value  DECIMAL(14,4),
  severity         VARCHAR(20),
  reason           TEXT,
  reason_code      VARCHAR(20),
  evaluated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_policy_results        PRIMARY KEY (id),
  CONSTRAINT fk_policy_results_app    FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_policy_results_rule   FOREIGN KEY (rule_id) REFERENCES policy_rules(rule_id),
  CONSTRAINT fk_policy_results_reason FOREIGN KEY (reason_code) REFERENCES reason_codes(code)
);

CREATE INDEX idx_policy_results_app ON policy_results(application_id);

-- =============================================================================
-- 14. Recommendations (AI-generated)
-- =============================================================================

CREATE TABLE recommendations (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id        UUID           NOT NULL,
  recommendation        VARCHAR(10)    NOT NULL,
  recommended_rate      DECIMAL(5,2),
  recommended_rate_type VARCHAR(20),
  recommended_amount    DECIMAL(12,2),
  recommended_tenure    SMALLINT,
  recommended_emi       DECIMAL(10,2),
  ltv_calculated        DECIMAL(5,2),
  foir_calculated       DECIMAL(5,2),
  dbr_calculated        DECIMAL(5,2),
  net_surplus           DECIMAL(10,2),
  risk_factors          JSONB,
  positive_factors      JSONB,
  rules_passed          SMALLINT,
  rules_failed          SMALLINT,
  rules_flagged         SMALLINT,
  summary_text          TEXT,
  generated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_recommendations     PRIMARY KEY (id),
  CONSTRAINT fk_recommendations_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_recommendations_app ON recommendations(application_id);

-- =============================================================================
-- 15. Credit decisions (final human/system decision)
-- =============================================================================

CREATE TABLE credit_decisions (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id        UUID           NOT NULL,
  recommendation_id     UUID           NOT NULL,
  decision              VARCHAR(15)    NOT NULL,
  decided_by            VARCHAR(20)    NOT NULL,
  officer_id            UUID,
  sanctioned_amount     DECIMAL(12,2),
  sanctioned_rate       DECIMAL(5,2),
  sanctioned_tenure     SMALLINT,
  sanctioned_emi        DECIMAL(10,2),
  reason_codes          VARCHAR[],
  officer_remarks       TEXT,
  decision_letter_path  TEXT,
  sanction_valid_until  DATE,
  decided_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_credit_decisions          PRIMARY KEY (id),
  CONSTRAINT fk_credit_decisions_app      FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_credit_decisions_rec      FOREIGN KEY (recommendation_id) REFERENCES recommendations(id),
  CONSTRAINT fk_credit_decisions_officer  FOREIGN KEY (officer_id) REFERENCES users(id)
);

CREATE INDEX idx_credit_decisions_app ON credit_decisions(application_id);

-- =============================================================================
-- 16. Override logs
-- =============================================================================

CREATE TABLE override_logs (
  id               UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id   UUID           NOT NULL,
  decision_id      UUID           NOT NULL,
  officer_id       UUID           NOT NULL,
  override_type    VARCHAR(30)    NOT NULL,
  original_value   TEXT           NOT NULL,
  new_value        TEXT           NOT NULL,
  reason           TEXT           NOT NULL,
  approved_by_id   UUID,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_override_logs            PRIMARY KEY (id),
  CONSTRAINT fk_override_logs_app        FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_override_logs_decision   FOREIGN KEY (decision_id) REFERENCES credit_decisions(id),
  CONSTRAINT fk_override_logs_officer    FOREIGN KEY (officer_id) REFERENCES users(id),
  CONSTRAINT fk_override_logs_approver   FOREIGN KEY (approved_by_id) REFERENCES users(id)
);

CREATE INDEX idx_override_logs_app ON override_logs(application_id);

-- =============================================================================
-- 17. Fraud signals
-- =============================================================================

CREATE TABLE fraud_signals (
  id               UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id   UUID           NOT NULL,
  signal_type      VARCHAR(50)    NOT NULL,
  severity         VARCHAR(10)    NOT NULL,
  description      TEXT           NOT NULL,
  evidence         JSONB,
  auto_action      VARCHAR(20)    NOT NULL,
  reviewed         BOOLEAN        NOT NULL DEFAULT false,
  reviewed_by_id   UUID,
  review_outcome   VARCHAR(20),
  review_notes     TEXT,
  detected_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_fraud_signals          PRIMARY KEY (id),
  CONSTRAINT fk_fraud_signals_app      FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_fraud_signals_reviewer FOREIGN KEY (reviewed_by_id) REFERENCES users(id)
);

CREATE INDEX idx_fraud_signals_app ON fraud_signals(application_id);

-- =============================================================================
-- 18. Audit events
-- =============================================================================

CREATE TABLE audit_events (
  id               UUID           NOT NULL DEFAULT gen_random_uuid(),
  application_id   UUID,
  event_type       VARCHAR(50)    NOT NULL,
  event_detail     JSONB          NOT NULL,
  actor_type       VARCHAR(10)    NOT NULL,
  actor_id         UUID,
  ip_address       INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT pk_audit_events     PRIMARY KEY (id),
  CONSTRAINT fk_audit_events_app FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_audit_events_app     ON audit_events(application_id);
CREATE INDEX idx_audit_events_type    ON audit_events(event_type);
CREATE INDEX idx_audit_events_created ON audit_events(created_at DESC);

-- =============================================================================
-- 19. Row Level Security
-- =============================================================================

ALTER TABLE applications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_assessments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation_details    ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_decisions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE override_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_signals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;

-- Lookup tables: read access for all authenticated users
ALTER TABLE states       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reason_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "states_read" ON states
  FOR SELECT USING (true);

CREATE POLICY "reason_codes_read" ON reason_codes
  FOR SELECT USING (true);

CREATE POLICY "policy_rules_read" ON policy_rules
  FOR SELECT USING (true);

CREATE POLICY "rate_grid_read" ON rate_grid
  FOR SELECT USING (true);

CREATE POLICY "dealers_read" ON dealers
  FOR SELECT USING (true);

-- Employee access: users with @cercit.in email can read/write everything
-- (In production, tie this to Supabase Auth roles; for now, service_role key bypasses RLS)

-- Customer self-service: customers see only their own applications
CREATE POLICY "customers_own_read" ON customers
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "applications_customer_read" ON applications
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "documents_customer_read" ON documents
  FOR SELECT USING (
    application_id IN (
      SELECT a.id FROM applications a
      JOIN customers c ON c.id = a.customer_id
      WHERE c.auth_user_id = auth.uid()
    )
  );

-- Employee full access policies (service_role bypasses; these are for authenticated employee users)
CREATE POLICY "users_employee_read" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

-- =============================================================================
-- Done. 22 tables created.
-- =============================================================================
