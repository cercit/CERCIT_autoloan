# cercit build progress

Last updated: 30 Aug 2026

## Supabase backend — done

Infrastructure is live on Supabase project `Credit_Appraisal` (Mumbai region, org "cercit").

### Schema (001_schema.sql)
- 22 tables, 293 columns deployed
- RLS policies on all tables
- Triggers for updated_at on mutable tables
- Indexes on foreign keys and common query patterns

### Seed data (002, 003)
- 35 Indian states/UTs with road tax percentages
- 3 rate grid entries: APPROVE (750-900, 8.99%), MAYBE (650-749, 9.90%), REJECT (300-649)
- 23 reason codes across 7 categories (bureau, income, collateral, bank statement, KYC, document, fraud)
- 16 policy rules across 6 categories with thresholds
- 3 demo users (credit officer, state head, admin)
- 132 dealers across 12 OEMs, 8 cities, 7 states

### Backend functions (004_functions.sql)
Seven PostgreSQL functions deployed:

| Function | Purpose |
|---|---|
| `fn_generate_application_id` | YYYYMM + 6-digit serial from sequence |
| `fn_calculate_emi` | Reducing balance EMI formula |
| `fn_create_application` | Step 1: register customer + create DRAFT application |
| `fn_in_principle_check` | Step 4: quick eligibility on declared numbers |
| `fn_run_policy_engine` | Step 7: evaluate all 16 policy rules, write results |
| `fn_generate_recommendation` | Produce recommendation + credit decision + audit trail |
| `fn_assess_application` | Pipeline wrapper: policy engine then recommendation |
| `fn_list_applications` | Dashboard listing: joins app + customer + vehicle + bureau + decision |

All callable via `supabase.rpc('function_name', {params})`.

### Smoke tests (005_smoke_tests.sql) — both passed

**APPROVE scenario** (Rahul Kumar, app 202608000001):
- CIBIL 780, zero DPD, zero bounces, Infosys salaried
- 12L loan on Hyundai Creta, 60 months
- Result: APPROVE at 8.99%, all 16 rules passed
- FOIR 47.39%, LTV 80%, DBR 17.81%, EMI 24,904, surplus 44,296

**REJECT scenario** (Vikram Singh, app 202608000002):
- CIBIL 580, DPD 30 in 12m, 3 bounces, 1 settled account
- 7L loan on Maruti Swift, 60 months
- Result: REJECT, 4 hard fails + 5 flags out of 16 rules
- Hard fails: CIBIL below 650, DPD in 12m, settled account in 5y, bounced cheques
- 9 risk factors surfaced with internal messages

## Supabase integration layer — ready

Files created in `Lov_cercit/src/lib/`:
- `supabase.ts` — client init, reads env vars, warns if not configured
- `api.ts` — wraps RPCs and table reads, maps DB rows to UI types, falls back to mock data

Guide: `docs/supabase_integration_guide.md`

Route files wired to api.ts (fall back to mock data when Supabase env vars are not set):
- `routes/applications/index.tsx` — uses `getApplications()`
- `routes/applications/$id/index.tsx` — uses `getApplication(id)`
- `routes/applications/$id/manager-review.tsx` — uses `getApplication(id)`
- `routes/applications/$id/sanction.tsx` — uses `getApplication(id)`
- `routes/dashboard.tsx` — uses `getApplications()` for the queue table

Still on mock data (no API equivalent or data model mismatch):
- `routes/rate-grid.tsx` — Supabase rate_grid has 3 rows without per-category breakdown; mock has 5 rows with catA/catB/catC
- `routes/audit-log.tsx` — needs user name lookup and readable application ID join
- `routes/policy-rules.tsx` — Supabase policy_rules lacks effective date columns
- `routes/applications/new.tsx` — employers, makes dropdowns
- `routes/employers.tsx`, `routes/users.tsx` — no API equivalent
- `components/copilot-review.tsx` — document-level detail data (bureau, income, DPD history)
- `components/app-shell.tsx` — currentUser (needs Supabase Auth)

Remaining to fully connect:
1. Add `@supabase/supabase-js` dependency in Lovable
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars

## What's next

1. **Add supabase-js + env vars in Lovable** — dependency and credentials, then the wired routes go live
2. **Wire remaining routes** — rate grid (needs per-category rate columns in DB), audit log (needs user join), policy rules (needs effective dates)
3. **UI wireframes in Figma** — application form, dashboard, decision screen
4. **DB schema template** — finish filling `docs/db_schema_template.xlsx` (22 tables)
5. **Jira epics/stories** — create proper cercit project structure in samsm.atlassian.net

## File inventory

```
sql/
  001_schema.sql          — 22-table DDL with RLS
  002_seed_lookups.sql    — states, rate grid, reason codes, policy rules, users
  003_seed_dealers.sql    — 132 dealers from CSV
  004_functions.sql       — 7 backend functions
  005_smoke_tests.sql     — APPROVE + REJECT test scenarios with expected results

docs/
  supabase_integration_guide.md — how to wire Lovable app to Supabase

data/
  indian_car_oem_dealers.csv   — 132 dealer records (source for 003)
  indian_car_oem_models.csv    — 355 model/variant records (UI dropdown reference)

docs/
  application_flow.md          — 7-step customer journey
  build_progress.md            — this file
  current_state_workflow.md    — manual CAM process (in progress)
  db_schema_template.xlsx      — schema design workbook
  scheme_design_template.xlsx  — 38 product parameters

Lov_cercit/                    — Lovable prototype (React + TanStack Router + shadcn/ui)
PRD.md                         — consolidated PRD v3.0
```
