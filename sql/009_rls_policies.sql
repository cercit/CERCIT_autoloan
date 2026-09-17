-- cercit — Row Level Security policies
-- Run AFTER enabling Supabase Auth and creating at least one auth user.
-- All writes go through SECURITY DEFINER RPCs — no INSERT/UPDATE/DELETE
-- policies needed on transactional tables.
--
-- Revised 17 Sep 2026 before first use: customers can log in too (application
-- status page), so "any logged-in user" is not the same as "staff". Loan data,
-- the staff list and the audit trail are now readable by active staff only;
-- users can no longer edit their own row (it holds their role); direct inserts
-- are staff-only and audit entries must name the person inserting them.

-- =============================================================================
-- 0. Who is staff
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_current_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() AND is_active;
$$;

CREATE OR REPLACE FUNCTION fn_is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT fn_current_staff_id() IS NOT NULL;
$$;

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
-- 3. Users table — staff can read; nobody edits their own row through the API
-- =============================================================================
-- The row holds the user's role and sanction limit, so self-service updates
-- would let a user raise their own rights. Changes go through the Admin module.

CREATE POLICY "staff_read_users" ON users
  FOR SELECT TO authenticated
  USING ((SELECT fn_is_active_staff()));

-- =============================================================================
-- 4. Transactional tables — staff can read
--    (writes go through SECURITY DEFINER RPCs, no direct INSERT/UPDATE needed)
-- =============================================================================

CREATE POLICY "staff_read_customers" ON customers
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_applications" ON applications
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_vehicles" ON vehicles
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_documents" ON documents
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_doc_extractions" ON document_extractions
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_bureau" ON bureau_reports
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_bank_analyses" ON bank_statement_analyses
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_bank_txns" ON bank_transactions
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_income" ON income_assessments
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_obligations" ON obligation_details
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_policy_results" ON policy_results
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_recommendations" ON recommendations
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_decisions" ON credit_decisions
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_overrides" ON override_logs
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_fraud" ON fraud_signals
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

CREATE POLICY "staff_read_audit" ON audit_events
  FOR SELECT TO authenticated USING ((SELECT fn_is_active_staff()));

-- =============================================================================
-- 5. Document uploads — staff can INSERT (direct upload flow)
-- =============================================================================

CREATE POLICY "staff_insert_documents" ON documents
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_active_staff()));

-- =============================================================================
-- 6. Audit events — staff can INSERT notes in their own name
-- =============================================================================

CREATE POLICY "staff_insert_own_audit" ON audit_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NOT NULL AND actor_id = (SELECT fn_current_staff_id()));

-- =============================================================================
-- 7. Policy rules — staff can UPDATE (the Policy Rules on/off switch)
-- =============================================================================
-- Kept so the current screen keeps working once RLS is on. Migration 020
-- removes the underlying permission when Credit control takes over.

CREATE POLICY "staff_update_policy_rules" ON policy_rules
  FOR UPDATE TO authenticated
  USING ((SELECT fn_is_active_staff()))
  WITH CHECK ((SELECT fn_is_active_staff()));
