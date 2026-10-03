-- =============================================================================
-- 078: Fix what the security and performance checks flag (fix list H3)
-- =============================================================================
-- sql/checks/advisor-checks.sql runs the main checks of Supabase's Security
-- and Performance Advisors as plain read-only queries (the SQL tests run it on
-- every change, so a new finding fails the tests). On the local copy of the
-- database it flagged:
--
--   SECURITY
--   * 4 owner's-rights functions without a fixed search_path (fn_assess_application,
--     fn_create_application, fn_in_principle_check, fn_run_policy_engine):
--     pinned to public, as every other one is;
--   * fn_role_permissions(role) callable with the public key: it lists any
--     role's rights to a visitor. Now signed-in only (the functions that use
--     it run with the owner's rights, so nothing that needs it loses it).
--     fn_require_any_permission likewise. Kept public on purpose:
--     fn_login_rules (the sign-in screen shows them), fn_policy_may_simulate
--     (says false to a visitor), fn_current_staff_id (row rules call it for
--     every caller; a visitor gets nothing back);
--   PERFORMANCE
--   * 4 row rules from 001 call auth.uid() for every row; now once per query
--     ((select auth.uid())), same meaning;
--   * 57 foreign keys with no index: deletes and joins on them read the whole
--     table. Each gets an index (small tables cost nothing; the case tables
--     are the ones that matter);
--   * 3 indexes made twice: 065 and 066 created copies of indexes 001 and 033
--     already had. Those lines are removed from 065 and 066; the copies are
--     dropped here in case 065 / 066 already ran.
--   (070 also pins fn_run_policy_engine's search_path itself now, so running
--   070 again doesn't undo it.)
--
-- The table-grants check reads row rules too: the public key has the usual
-- Supabase grants on every table, which is harmless while row level security
-- is on and no rule lets a visitor read rows. It found none.
--
-- Run order: after 077. Safe to re-run. Changes no data.
-- =============================================================================

-- 1. Owner's-rights functions: fixed search_path
ALTER FUNCTION fn_assess_application(UUID) SET search_path = public;
ALTER FUNCTION fn_create_application(VARCHAR, VARCHAR, VARCHAR) SET search_path = public;
ALTER FUNCTION fn_in_principle_check(UUID) SET search_path = public;
ALTER FUNCTION fn_run_policy_engine(UUID) SET search_path = public;

-- 2. Not for visitors
REVOKE ALL ON FUNCTION fn_role_permissions(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_role_permissions(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION fn_require_any_permission(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_require_any_permission(TEXT[]) TO authenticated;

-- 3. Row rules: auth.uid() once per query, not per row
ALTER POLICY "customers_own_read" ON customers
  USING (auth_user_id = (SELECT auth.uid()));
ALTER POLICY "applications_customer_read" ON applications
  USING (customer_id IN (SELECT id FROM customers WHERE auth_user_id = (SELECT auth.uid())));
ALTER POLICY "documents_customer_read" ON documents
  USING (application_id IN (SELECT a.id FROM applications a JOIN customers c ON c.id = a.customer_id
                            WHERE c.auth_user_id = (SELECT auth.uid())));
ALTER POLICY "users_employee_read" ON users
  USING (auth_user_id = (SELECT auth.uid()));

-- 4. Copies of existing indexes (only if 065 / 066 ran before they were fixed)
DROP INDEX IF EXISTS ix_audit_events_created_at;      -- = idx_audit_events_created (001)
DROP INDEX IF EXISTS ix_applications_created_at;      -- = idx_applications_created (001)
DROP INDEX IF EXISTS ix_engine_decisions_application; -- = idx_engine_decisions_app (033)

-- 5. An index for every foreign key
CREATE INDEX IF NOT EXISTS ix_application_document_requirements_doc_type ON application_document_requirements (doc_type);
CREATE INDEX IF NOT EXISTS ix_applications_vehicle_id ON applications (vehicle_id);
CREATE INDEX IF NOT EXISTS ix_bank_statement_analyses_customer_id ON bank_statement_analyses (customer_id);
CREATE INDEX IF NOT EXISTS ix_bureau_reports_consent_id ON bureau_reports (consent_id);
CREATE INDEX IF NOT EXISTS ix_bureau_reports_customer_id ON bureau_reports (customer_id);
CREATE INDEX IF NOT EXISTS ix_bureau_summary_consent_id ON bureau_summary (consent_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_model_version ON credit_decisions (model_version);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_officer_id ON credit_decisions (officer_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_policy_version_id ON credit_decisions (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_recommendation_id ON credit_decisions (recommendation_id);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_rules_snapshot ON credit_decisions (rules_snapshot);
CREATE INDEX IF NOT EXISTS ix_customer_addresses_state_code ON customer_addresses (state_code);
CREATE INDEX IF NOT EXISTS ix_customer_consents_application_id ON customer_consents (application_id);
CREATE INDEX IF NOT EXISTS ix_customer_consents_customer_id ON customer_consents (customer_id);
CREATE INDEX IF NOT EXISTS ix_customers_state_code ON customers (state_code);
CREATE INDEX IF NOT EXISTS ix_dealers_state_code ON dealers (state_code);
CREATE INDEX IF NOT EXISTS ix_document_extractions_document_id ON document_extractions (document_id);
CREATE INDEX IF NOT EXISTS ix_employers_last_verified_by ON employers (last_verified_by);
CREATE INDEX IF NOT EXISTS ix_engine_decisions_policy_version_id ON engine_decisions (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_fraud_signals_reviewed_by_id ON fraud_signals (reviewed_by_id);
CREATE INDEX IF NOT EXISTS ix_loan_accounts_application_id ON loan_accounts (application_id);
CREATE INDEX IF NOT EXISTS ix_loan_agreements_application_id ON loan_agreements (application_id);
CREATE INDEX IF NOT EXISTS ix_loan_agreements_offer_id ON loan_agreements (offer_id);
CREATE INDEX IF NOT EXISTS ix_loan_repayments_installment_id ON loan_repayments (installment_id);
CREATE INDEX IF NOT EXISTS ix_model_versions_approved_by ON model_versions (approved_by);
CREATE INDEX IF NOT EXISTS ix_organisation_settings_updated_by ON organisation_settings (updated_by);
CREATE INDEX IF NOT EXISTS ix_override_logs_approved_by_id ON override_logs (approved_by_id);
CREATE INDEX IF NOT EXISTS ix_override_logs_decision_id ON override_logs (decision_id);
CREATE INDEX IF NOT EXISTS ix_override_logs_officer_id ON override_logs (officer_id);
CREATE INDEX IF NOT EXISTS ix_permission_conflicts_permission_b ON permission_conflicts (permission_b);
CREATE INDEX IF NOT EXISTS ix_policy_change_requests_policy_version_id ON policy_change_requests (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_policy_change_requests_requested_by ON policy_change_requests (requested_by);
CREATE INDEX IF NOT EXISTS ix_policy_change_reviews_change_request_id ON policy_change_reviews (change_request_id);
CREATE INDEX IF NOT EXISTS ix_policy_change_reviews_reviewer_id ON policy_change_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS ix_policy_parameters_param_key ON policy_parameters (param_key);
CREATE INDEX IF NOT EXISTS ix_policy_results_reason_code ON policy_results (reason_code);
CREATE INDEX IF NOT EXISTS ix_policy_results_rule_id ON policy_results (rule_id);
CREATE INDEX IF NOT EXISTS ix_policy_rules_reason_code ON policy_rules (reason_code);
CREATE INDEX IF NOT EXISTS ix_policy_simulations_compared_to_id ON policy_simulations (compared_to_id);
CREATE INDEX IF NOT EXISTS ix_policy_simulations_policy_version_id ON policy_simulations (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_policy_version_events_actor_id ON policy_version_events (actor_id);
CREATE INDEX IF NOT EXISTS ix_policy_versions_approved_by ON policy_versions (approved_by);
CREATE INDEX IF NOT EXISTS ix_policy_versions_authored_by ON policy_versions (authored_by);
CREATE INDEX IF NOT EXISTS ix_policy_versions_base_version_id ON policy_versions (base_version_id);
CREATE INDEX IF NOT EXISTS ix_recommendations_model_version ON recommendations (model_version);
CREATE INDEX IF NOT EXISTS ix_recommendations_policy_version_id ON recommendations (policy_version_id);
CREATE INDEX IF NOT EXISTS ix_recommendations_rules_snapshot ON recommendations (rules_snapshot);
CREATE INDEX IF NOT EXISTS ix_repayment_mandates_application_id ON repayment_mandates (application_id);
CREATE INDEX IF NOT EXISTS ix_role_change_requests_decided_by ON role_change_requests (decided_by);
CREATE INDEX IF NOT EXISTS ix_role_change_requests_requested_by ON role_change_requests (requested_by);
CREATE INDEX IF NOT EXISTS ix_role_permissions_permission_code ON role_permissions (permission_code);
CREATE INDEX IF NOT EXISTS ix_users_role ON users (role);
CREATE INDEX IF NOT EXISTS ix_users_state_code ON users (state_code);
CREATE INDEX IF NOT EXISTS ix_vehicle_quotations_dealer_id ON vehicle_quotations (dealer_id);
CREATE INDEX IF NOT EXISTS ix_vehicle_quotations_document_id ON vehicle_quotations (document_id);
CREATE INDEX IF NOT EXISTS ix_vehicles_application_id ON vehicles (application_id);
CREATE INDEX IF NOT EXISTS ix_vehicles_dealer_id ON vehicles (dealer_id);

-- Check after running (each should return no rows): the queries in
-- sql/checks/advisor-checks.sql. Quick version:
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef
--    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
