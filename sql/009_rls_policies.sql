-- cercit — Row Level Security policies
-- Run AFTER enabling Supabase Auth and creating at least one auth user.
-- All writes go through SECURITY DEFINER RPCs — no INSERT/UPDATE/DELETE
-- policies needed on transactional tables.

-- =============================================================================
-- 1. Enable RLS on every table
-- =============================================================================

ALTER TABLE states                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE reason_codes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_grid              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_results         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_decisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE override_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_signals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events           ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Lookup tables — anyone can read (including anon for public pages)
-- =============================================================================

CREATE POLICY "read_states"       ON states       FOR SELECT USING (true);
CREATE POLICY "read_reason_codes" ON reason_codes  FOR SELECT USING (true);
CREATE POLICY "read_dealers"      ON dealers       FOR SELECT USING (true);
CREATE POLICY "read_rate_grid"    ON rate_grid     FOR SELECT USING (true);
CREATE POLICY "read_policy_rules" ON policy_rules  FOR SELECT USING (true);

-- =============================================================================
-- 3. Users table — authenticated can read all, update own row only
-- =============================================================================

CREATE POLICY "auth_read_users" ON users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_update_own_user" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- =============================================================================
-- 4. Transactional tables — authenticated can read all
--    (writes go through SECURITY DEFINER RPCs, no direct INSERT/UPDATE needed)
-- =============================================================================

CREATE POLICY "auth_read_customers" ON customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_applications" ON applications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_vehicles" ON vehicles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_documents" ON documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_doc_extractions" ON document_extractions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_bureau" ON bureau_reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_bank_analyses" ON bank_statement_analyses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_bank_txns" ON bank_transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_income" ON income_assessments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_obligations" ON obligation_details
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_policy_results" ON policy_results
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_recommendations" ON recommendations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_decisions" ON credit_decisions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_overrides" ON override_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_fraud" ON fraud_signals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_audit" ON audit_events
  FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- 5. Document uploads — authenticated can INSERT (direct upload flow)
-- =============================================================================

CREATE POLICY "auth_insert_documents" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- =============================================================================
-- 6. Audit events — authenticated can INSERT (officer notes)
-- =============================================================================

CREATE POLICY "auth_insert_audit" ON audit_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- =============================================================================
-- 7. Policy rules — authenticated can UPDATE (toggle active/inactive)
-- =============================================================================

CREATE POLICY "auth_update_policy_rules" ON policy_rules
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
