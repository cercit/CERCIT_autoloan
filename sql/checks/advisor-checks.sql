-- =============================================================================
-- Advisor checks (fix list H3): read only, safe to run any time
-- =============================================================================
-- Supabase's Security and Performance Advisors (Dashboard > Advisors) run
-- checks like these. This file runs the main ones as plain queries, so they
-- can be run in the SQL editor, and the SQL tests run them on every change
-- (tests/sql/run.mjs, section "advisor checks"). Each query returns one row per
-- finding; no rows = nothing to fix. Nothing here changes anything.
--
-- Run in the SQL editor: paste the whole file; each result tab is one check.
-- =============================================================================

-- 1. SECURITY: tables in public with row level security off (anyone with the
--    API key could read them if a grant exists)
SELECT 'rls_disabled' AS check, c.relname AS object
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 2;

-- 2. SECURITY: functions that run with the owner's rights but don't pin
--    search_path (a caller could slip in a look-alike function)
SELECT 'definer_search_path' AS check, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS object
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
ORDER BY 2;

-- 3. SECURITY: owner's-rights functions the public (anon) key may call.
--    These are meant to be public: the sign-in screen (organisation name,
--    login rules, failed-login count), the consent wording, the policy
--    simulation flag (false for a visitor) and the staff-id helper that row
--    rules call for every caller (null for a visitor). Anything else is a finding.
SELECT 'definer_callable_by_anon' AS check, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS object
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT IN ('fn_public_org_info', 'fn_login_rules', 'fn_record_failed_login', 'fn_consent_text',
                        'fn_policy_may_simulate', 'fn_current_staff_id')
  AND p.prorettype <> 'trigger'::regtype
ORDER BY 2;

-- 4. SECURITY: tables a visitor (public key) can read rows from: the key has
--    a read grant AND either row level security is off or a read rule lets
--    everyone through (condition "true"). Supabase gives the public key read
--    grants on every table by default; row level security is what protects
--    them, so a grant alone is not a finding. The lookup tables are public on
--    purpose (009 and 015: the public pages show rates, rules and switches);
--    none holds personal data.
SELECT 'anon_can_read_rows' AS check, c.relname AS object
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND has_table_privilege('anon', c.oid, 'SELECT')
  AND (NOT c.relrowsecurity
       OR EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.cmd IN ('SELECT', 'ALL')
                    AND p.roles && ARRAY['anon', 'public']::NAME[] AND coalesce(p.qual, 'true') = 'true'))
  AND c.relname NOT IN ('states', 'reason_codes', 'dealers', 'rate_grid', 'employer_category_pricing',
                        'policy_rules', 'feature_flags', 'tenants')
ORDER BY 2;

-- 5. PERFORMANCE: foreign keys with no index starting with their column
--    (deletes and joins scan the whole table; the synthetic generator slows as data grows)
SELECT 'unindexed_foreign_key' AS check, c.conrelid::regclass::text || '.' || a.attname AS object
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = c.conrelid)
WHERE c.contype = 'f' AND n.nspname = 'public' AND cardinality(c.conkey) = 1
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
ORDER BY 2;

-- 6. PERFORMANCE: tables with no primary key
SELECT 'no_primary_key' AS check, c.relname AS object
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')
ORDER BY 2;

-- 7. PERFORMANCE: the same index twice
SELECT 'duplicate_index' AS check, string_agg(i.indexrelid::regclass::text, ' = ' ORDER BY i.indexrelid::regclass::text) AS object
FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
GROUP BY i.indrelid, i.indkey::text, coalesce(pg_get_expr(i.indexprs, i.indrelid), ''), coalesce(pg_get_expr(i.indpred, i.indrelid), '')
HAVING count(*) > 1
ORDER BY 2;

-- 8. PERFORMANCE: row policies that call auth.uid() / auth.role() per row
--    instead of once ((select auth.uid()))
SELECT 'policy_auth_call_per_row' AS check, tablename || ': ' || policyname AS object
FROM pg_policies
WHERE schemaname = 'public'
  AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.(uid|role|jwt)\(\)'
  AND (coalesce(qual, '') || coalesce(with_check, '')) !~* 'select\s+auth\.(uid|role|jwt)\(\)'
ORDER BY 2;

-- 9. SECURITY: views that run with their owner's rights (row level security
--    of the tables under them is skipped) and that signed-in users or the
--    public key can read
SELECT 'definer_view_readable' AS check, c.relname AS object
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))
  AND NOT coalesce('security_invoker=true' = ANY (c.reloptions), false)
ORDER BY 2;
