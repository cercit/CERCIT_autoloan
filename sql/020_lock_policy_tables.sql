-- cercit — no direct edits to policy and pricing tables (backlog FD2.3)
--
-- Credit rules, the rate grid and category pricing can today be changed by any
-- logged-in user with a plain UPDATE from the browser (the switch on the Policy
-- Rules screen does exactly that). From now on these tables are read-only
-- through the API. Changes go through versioned, approved policy (016) and the
-- Credit control screens.
--
-- WHEN TO RUN: this makes the on/off switches on the Policy Rules screen show a
-- failure instead of changing the rule. Run it now to close the gap, or hold it
-- until Credit control (CC2.1) replaces those switches with "propose change".
--
-- Run order: after 019. Safe to re-run.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  policy_rules,
  rate_grid,
  employer_category_pricing,
  reason_codes,
  parameter_definitions,
  policy_versions,
  policy_documents,
  policy_parameters,
  policy_change_requests,
  policy_change_reviews,
  policy_simulations,
  feature_flags,
  feature_flag_history,
  tenants
FROM anon, authenticated;

-- Reading stays as the row-level security policies allow.
GRANT SELECT ON
  policy_rules,
  rate_grid,
  employer_category_pricing,
  reason_codes,
  parameter_definitions,
  policy_versions,
  policy_documents,
  policy_parameters,
  policy_change_requests,
  policy_change_reviews,
  policy_simulations,
  feature_flags,
  tenants
TO authenticated;

GRANT SELECT ON policy_rules, rate_grid, employer_category_pricing, reason_codes, feature_flags TO anon;
