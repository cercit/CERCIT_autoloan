# FD5.1 — Price Integration Gap Analysis (hermes2 version)

Status: BLOCKED — requires Claude's direct edit in `Lov_cercit/src/lib/engine.ts`

## Source evidence
- `Lov_cercit/src/lib/engine.ts` pulls pricing from `mock-data.ts` (`rateGrid` array) rather than DB `rate_grid`.
- `Lov_cercit/sql/001_schema.sql` defines `rate_grid` table (columns: `id`, `score_band_min`, `score_band_max`, `band_label`, `rate_pct`, `max_ltv_pct`, `max_foir_pct`, `max_tenure_months`, `vehicle_category`, `policy_version`, `is_active`).
- Seed data (`002_seed_lookups.sql`) provides 3 active rows: APPROVE (8.99%), MAYBE (9.90%), REJECT (0.00%).
- `docs/build-progress.md` confirms 22-table schema deployed with rate grid and policy rules.

## Gap details
The `engine.ts` functions `lookupRate()`, `calculateLTV()`, `checkPolicyRules()`, `quickEligibility()` all use hardcoded mock arrays instead of querying Supabase `rate_grid`. Four screens reference `engine.ts` (assessment pipeline, eligibility quick-check, rate display, policy rule evaluation).

## Integration steps for Claude
1. Modify `lookupRate()` to query `rate_grid` (filter: `is_active = true`, `vehicle_category = 'CAR'`, `policy_version` matches current version).
2. Modify `calculateLTV()` to read `max_ltv_pct` from `rate_grid` instead of hardcoded `maxLtvByCategory`.
3. Modify `checkPolicyRules()` to use DB `max_foir_pct`, `max_tenure_months`, `rate_pct` instead of static thresholds (`FOIR >= 65`, tenure `60/84`).
4. Verify build passes (`npx tsc --noEmit`).

## Assumptions (`.meta.json`)
- DB table `rate_grid` exists and is populated per `sql/002_seed_lookups.sql`.
- The exact column mapping (`rate_pct` → rate, `max_ltv_pct` → LTV cap, etc.) is unambiguous; no conflicting schema variants.
- `engine_decisions` stores `stored_decision` for audit; pricing comes from `rate_grid` directly.
- Mock fallback remains required per `hermes-rules.md` (`isSupabaseConfigured` guard).
