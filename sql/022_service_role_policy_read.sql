-- cercit — let the AWS rules engine read the policy in force (backlog FD4.3)
--
-- The policy-engine Lambda connects with the service role key. It only ever
-- reads: the version in force, its rule document and its settings. Without
-- these grants Supabase refuses with "permission denied for table
-- policy_versions" (42501), which is what the first live call returned.
--
-- Read only. Writing policy stays with Credit control, behind the permission
-- checks in 018, and the four-eyes guards in 016 apply to every writer.
--
-- Run order: after 017. Safe to re-run.

GRANT SELECT ON tenants               TO service_role;
GRANT SELECT ON feature_flags         TO service_role;
GRANT SELECT ON parameter_definitions TO service_role;
GRANT SELECT ON policy_versions       TO service_role;
GRANT SELECT ON policy_documents      TO service_role;
GRANT SELECT ON policy_parameters     TO service_role;

GRANT EXECUTE ON FUNCTION fn_default_tenant_id()                            TO service_role;
GRANT EXECUTE ON FUNCTION fn_policy_version_at(TEXT, TIMESTAMPTZ, UUID)     TO service_role;
GRANT EXECUTE ON FUNCTION fn_policy_document_at(TEXT, TIMESTAMPTZ, UUID)    TO service_role;
GRANT EXECUTE ON FUNCTION fn_policy_param(TEXT, TEXT, TIMESTAMPTZ, UUID)    TO service_role;
GRANT EXECUTE ON FUNCTION fn_feature_enabled(TEXT, UUID)                    TO service_role;

-- No write rights, now or by default
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenants, feature_flags, parameter_definitions,
  policy_versions, policy_documents, policy_parameters FROM service_role;

-- Check
-- SET LOCAL ROLE service_role;
-- SELECT version_code FROM fn_policy_document_at();
-- RESET ROLE;
