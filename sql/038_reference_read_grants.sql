-- cercit — let the website read two reference tables (states, employer pricing)
--
-- Both tables have a row-level rule that allows reading, but the live database
-- never granted SELECT on them to the website's roles, so reads fail with
-- "permission denied for table ...":
--   states                      the Branch list on the Users screen (037)
--   employer_category_pricing   the pricing read on the home page (the old 401)
-- The local test database grants every table by default, which is why the
-- tests did not catch it (gap register #47).
--
-- Read only. Nothing here allows a write.
--
-- Run order: after 037. Safe to re-run.

GRANT SELECT ON states TO anon, authenticated;
GRANT SELECT ON employer_category_pricing TO anon, authenticated;

-- Check after running: both rows should say true for both roles.
-- SELECT t, has_table_privilege('anon', t, 'SELECT') AS anon, has_table_privilege('authenticated', t, 'SELECT') AS signed_in
-- FROM unnest(ARRAY['states', 'employer_category_pricing']) AS t;
