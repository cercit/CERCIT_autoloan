# cercit build progress

Last updated: 30 Aug 2026

## Status summary

| Layer | Status | Detail |
|---|---|---|
| PRD & scope | Done | v3.0, all 20 open items closed |
| Database | Live | 22 tables on Supabase, Mumbai region |
| Backend functions | Live | 8 RPCs, policy engine, assessment pipeline |
| Seed data | Live | 132 dealers, 12 OEMs, rate grid, 16 rules |
| Frontend | Live | React + TanStack Router + shadcn/ui, 10 screens |
| Supabase wiring | Live | Real data flowing, mock fallback retained |
| E2E flow | Working | Submit -> assess -> approve/reject -> review |
| Git | Pushed | cercit/cercit (private), main branch |
| Auth & roles | Not started | Supabase Auth, RLS, officer/manager roles |
| Deploy | Not started | Vercel/Netlify production build |
| Security audit | Planned | Post-public-demo, 3 AI models |

---

## Supabase backend

Infrastructure is live on Supabase project `Credit_Appraisal` (Mumbai region, org "cercit", project ref `izlxncfcuvjqzxxbyidt`).

### Schema (001_schema.sql)
- 22 tables, 293 columns deployed
- RLS disabled for demo mode (re-enable with proper policies before production)
- Triggers for updated_at on mutable tables
- Indexes on foreign keys and common query patterns

### Seed data (002, 003)
- 35 Indian states/UTs with road tax percentages
- 3 rate grid entries: APPROVE (750-900, 8.99%), MAYBE (650-749, 9.90%), REJECT (300-649)
- 23 reason codes across 7 categories
- 16 policy rules across 6 categories with thresholds
- 3 demo users (credit officer, state head, admin)
- 132 dealers across 12 OEMs, 8 cities, 7 states

### Backend functions (004_functions.sql + 006_submit_application.sql)

| Function | Purpose |
|---|---|
| `fn_generate_application_id` | YYYYMM + 6-digit serial from sequence |
| `fn_calculate_emi` | Reducing balance EMI formula |
| `fn_create_application` | Register customer + create DRAFT application |
| `fn_in_principle_check` | Quick eligibility on declared numbers |
| `fn_run_policy_engine` | Evaluate all 16 policy rules, write results |
| `fn_generate_recommendation` | Produce recommendation + credit decision + audit trail |
| `fn_assess_application` | Pipeline wrapper: policy engine then recommendation |
| `fn_list_applications` | Dashboard listing: joins app + customer + vehicle + bureau + decision |
| `fn_submit_full_application` | Single RPC: creates all records + runs assessment end to end |

### Smoke tests (005_smoke_tests.sql) — both passed

**APPROVE scenario** (Rahul Kumar, app 202608000001):
- CIBIL 780, zero DPD, Infosys salaried, 12L loan, Hyundai Creta
- Result: APPROVE at 8.99%, all 16 rules passed
- FOIR 47.39%, LTV 80%, EMI 24,904

**REJECT scenario** (Vikram Singh, app 202608000002):
- CIBIL 580, DPD 30, 3 bounces, 1 settled account
- Result: REJECT, 4 hard fails + 5 flags out of 16 rules

**UI-submitted scenario** (Rajesh Kumar Sharma, app 202608000011):
- CIBIL 780, TCS salaried, 8.5L loan, Hyundai i20 SX(O)
- Submitted via 5-step form, full pipeline ran end to end
- Result: APPROVE at 8.99%, all 16 rules passed
- FOIR 20.8%, LTV 46.2%, EMI 17,640

---

## Frontend

React + Vite + TanStack Router + shadcn/ui + Tailwind CSS.

### Screens built

| Screen | Route | Data source |
|---|---|---|
| Login | `/` | Fake auth (pre-filled credentials) |
| Dashboard | `/dashboard` | Supabase (stat cards still mock) |
| Application queue | `/applications` | Supabase via `fn_list_applications` |
| New application (5-step) | `/applications/new` | Supabase via `fn_submit_full_application` |
| Application review | `/applications/:id` | Supabase (direct table queries) |
| Manager review | `/applications/:id/manager-review` | Supabase |
| Sanction letter | `/applications/:id/sanction` | Supabase |
| Policy rules | `/policy-rules` | Supabase (policy_rules table) |
| Audit log | `/audit-log` | Supabase (audit_events table) |
| Rate grid | `/rate-grid` | Mock data (schema mismatch) |

### Integration layer

Files in `src/lib/`:
- `supabase.ts` — client init, reads env vars, warns if not configured
- `api.ts` — wraps Supabase queries and RPCs, maps DB rows to UI types, falls back to mock data

### What's fully wired to Supabase
- Application queue with real applicant names, employers, CIBIL categories
- New application form: 5-step wizard submits via `fn_submit_full_application`, dialog shows APPROVE/REJECT/MAYBE with rate and summary
- Application review: customer profile, income assessment, bureau summary with CIBIL gauge, obligations & FOIR bar, vehicle & LTV, policy rule pass/fail grid
- Policy rules: reads from `policy_rules` table
- Audit log: reads from `audit_events` table

### Still on mock data
- Dashboard stat cards (New Applications: 12, etc.) — hardcoded
- Rate grid page (schema mismatch between DB and UI)
- Employer/user management screens
- Login/auth (fake credentials)

---

## Known issues

1. `fn_generate_recommendation`: rate_row crash when bureau score doesn't match any rate_grid band — fix deployed in 006 but needs re-run if error persists
2. Dashboard stat cards are hardcoded, not querying real counts
3. Approve/Reject buttons on review screen don't update the database yet
4. No document upload (Supabase Storage not configured)
5. No real auth — login is fake, RLS is off

---

## Repo structure

```
cercit/cercit (private, main branch)
├── sql/                    # Database migrations (run in order)
│   ├── 001_schema.sql      # 22 tables
│   ├── 002_seed_lookups.sql # States, rate grid, reason codes, policy rules, users
│   ├── 003_seed_dealers.sql # 132 dealers across 12 OEMs
│   ├── 004_functions.sql    # 7 PostgreSQL functions
│   ├── 005_smoke_tests.sql  # APPROVE + REJECT test scenarios
│   └── 006_submit_application.sql # Full submission RPC + recommendation fix
├── docs/                   # Documentation
│   ├── application_flow.md
│   ├── build_progress.md   # This file
│   ├── current_state_workflow.md
│   ├── supabase_integration_guide.md
│   ├── scheme_design_template.xlsx
│   ├── db_schema_template.xlsx
│   └── logo-*.png
├── data/                   # Seed CSV data
│   ├── indian_car_oem_dealers.csv
│   └── indian_car_oem_models.csv
├── src/                    # React frontend
│   ├── lib/api.ts          # Supabase API layer
│   ├── lib/supabase.ts     # Client init
│   ├── routes/             # Page components
│   └── components/         # Shared UI components
├── PRD.md                  # Product requirements (v3.0)
├── LICENSE                 # AGPL-3.0
├── .env.example            # Template for Supabase credentials
└── package.json
```

---

## Roadmap to launch

### Phase 2 — in progress
- [ ] Fix fn_generate_recommendation rate_row bug
- [ ] Set up Supabase MCP for direct DB access from Claude

### Phase 3 — build out
- [ ] Wire Approve/Reject buttons to update DB status
- [ ] Sanction letter PDF generation
- [ ] Supabase Auth with officer/manager roles
- [ ] RLS policies per role
- [ ] Dashboard live metrics (counts from DB)
- [ ] Document upload via Supabase Storage
- [ ] Jira epics and stories
- [ ] Figma wireframes

### Phase 4 — launch
- [ ] Deploy to Vercel with custom domain
- [ ] Pre-load demo scenarios (approve, reject, maybe)
- [ ] Portfolio case study and LinkedIn post

### Phase 5 — post-launch
- [ ] Security audit by 3 AI models (Claude/Fable, GPT 5.6, Kimi 3/DeepSeek)
- [ ] Fix audit findings
- [ ] Make repo public
