# cercit — Supabase integration guide

Last updated: 30 Aug 2026

## Connection details

| Setting | Value |
|---|---|
| Project | Credit_Appraisal |
| Org | cercit |
| Region | Mumbai (ap-south-1) |
| Project ref | `izlxncfcuvjqzxxbyidt` |
| URL | `https://izlxncfcuvjqzxxbyidt.supabase.co` |
| Anon key | Set in `.env` (not committed) |
| Auth role | `anon` (no Supabase Auth yet) |
| RLS | Disabled for demo |

## Setup

### 1. Install dependency

```bash
npm install @supabase/supabase-js
```

### 2. Set environment variables

Copy `.env.example` to `.env` and fill in your anon key:

```
VITE_SUPABASE_URL=https://izlxncfcuvjqzxxbyidt.supabase.co
VITE_SUPABASE_ANON_KEY=<get from Supabase dashboard > Settings > API > anon public>
```

### 3. Run SQL migrations

Run these files in order in the Supabase SQL Editor:

1. `sql/001_schema.sql` — 22 tables
2. `sql/002_seed_lookups.sql` — states, rate grid, reason codes, policy rules, users
3. `sql/003_seed_dealers.sql` — 132 dealers across 12 OEMs
4. `sql/004_functions.sql` — 7 PostgreSQL functions
5. `sql/005_smoke_tests.sql` — test scenarios (optional)
6. `sql/006_submit_application.sql` — full submission RPC + recommendation fix

### 4. Grant permissions

RLS is disabled for demo. If you need to re-grant after re-enabling RLS:

```sql
GRANT SELECT ON public.applications TO anon;
GRANT SELECT ON public.customers TO anon;
GRANT SELECT ON public.vehicles TO anon;
GRANT SELECT ON public.bureau_reports TO anon;
GRANT SELECT ON public.recommendations TO anon;
GRANT SELECT ON public.credit_decisions TO anon;
GRANT SELECT ON public.policy_rules TO anon;
GRANT SELECT ON public.audit_events TO anon;
GRANT SELECT ON public.rate_grid TO anon;
GRANT SELECT ON public.dealers TO anon;
GRANT EXECUTE ON FUNCTION fn_submit_full_application TO anon;
GRANT EXECUTE ON FUNCTION fn_create_application TO anon;
GRANT EXECUTE ON FUNCTION fn_assess_application TO anon;
GRANT EXECUTE ON FUNCTION fn_list_applications TO anon;
```

## Architecture

### Client layer (`src/lib/supabase.ts`)

Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from env vars. If either is missing, logs a warning and sets `isSupabaseConfigured = false`.

### API layer (`src/lib/api.ts`)

Every function checks `isSupabaseConfigured` first. If false, returns mock data from `src/lib/mock-data.ts`. This means the app works without a database connection — useful for local dev and Lovable preview.

### RPC functions (SECURITY DEFINER)

Backend functions run as the postgres role regardless of who calls them. This bypasses RLS, which is why the anon role can create applications and run assessments without INSERT/UPDATE grants on individual tables.

| Function | Called from | What it does |
|---|---|---|
| `fn_list_applications` | Dashboard, queue | Joins 5 tables, returns flat rows for the application list |
| `fn_submit_full_application` | New application form | Creates records in 7 tables + runs the assessment pipeline |
| `fn_assess_application` | Called by submit | Runs policy engine + generates recommendation |

### Direct table queries

The application detail view (`/applications/:id`) queries tables directly with PostgREST joins:

```
applications -> customers (inner join)
             -> vehicles!fk_vehicles_app
             -> bureau_reports
             -> recommendations
             -> credit_decisions
```

The `vehicles` join needs the FK hint `!fk_vehicles_app` because the `applications` table has two relationships to `vehicles` (one-to-many via `vehicles.application_id`, and many-to-one via `applications.vehicle_id`).

## Data flow

```
Customer fills form (5 steps)
    |
    v
submitFullApplication() in api.ts
    |
    v
fn_submit_full_application RPC (SECURITY DEFINER)
    |-- INSERT customer
    |-- INSERT application (DRAFT -> UNDER_ASSESSMENT)
    |-- INSERT vehicle (with auto-calculated taxes)
    |-- INSERT bureau_report
    |-- INSERT bank_statement_analysis
    |-- INSERT income_assessment
    |-- CALL fn_assess_application
    |       |-- fn_run_policy_engine (16 rules)
    |       |-- fn_generate_recommendation
    |       |       |-- rate lookup from rate_grid
    |       |       |-- EMI calculation
    |       |       |-- FOIR / LTV / DBR / surplus
    |       |       |-- INSERT recommendation
    |       |       |-- INSERT credit_decision
    |       |       |-- UPDATE application status
    |       |       |-- INSERT audit_event
    |       |       |-- RETURN decision + metrics
    |       |-- RETURN {policy, recommendation}
    |-- RETURN {application_id, decision, rate, summary}
    v
Dialog shows result: "Application 202608000011 — APPROVE"
```

## Mock data fallback

When `isSupabaseConfigured` is false, every API function returns data from `src/lib/mock-data.ts`. The mock data mirrors the DB shape closely enough that all UI components render without changes.

This means:
- Lovable preview works without Supabase credentials
- Local dev works without `.env`
- Switching between mock and live is automatic — just set/remove the env vars
