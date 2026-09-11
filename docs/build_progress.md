# cercit build progress

Last updated: 11 Sep 2026

## Status summary

| Layer | Status | Detail |
|---|---|---|
| PRD & scope | Done | v3.0, all 20 open items closed |
| Database | Live | 22 tables on Supabase, Mumbai region |
| Backend functions | Live | 9 RPCs, policy engine, assessment pipeline, officer decision |
| Seed data | Live | 132 dealers, 12 OEMs, rate grid, 16 rules, 3 demo scenarios |
| Frontend | Live | React + TanStack Router + shadcn/ui, 18 routes (12 employee + 6 public) |
| Supabase wiring | Live | Real data flowing, mock fallback retained |
| E2E flow | Working | Submit -> assess -> approve/reject -> review |
| Git | Pushed | cercit/CERCIT_autoloan (public), main branch |
| Smart login | Live | Email domain detection routes employee vs customer logins |
| Auth & roles | Not started | Supabase Auth, RLS, officer/manager roles |
| Deploy | **Live** | GitHub Pages at cercit.github.io/CERCIT_autoloan/ |
| Jira | Live | 6 epics, 16 stories at samsm.atlassian.net (SCRUM project) |
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
| `fn_officer_decision` | Officer approve/reject/refer with override detection and audit trail |

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

**Customer-facing (public, no auth required):**

| Screen | Route | Data source |
|---|---|---|
| Landing page | `/` | Static (EMI calculator, car brands, FAQ, SpeedoCluster gauge) |
| Login | `/login` | Smart routing: employee emails (@cercit.in/com) → dashboard, customer emails → application status. Demo fallback when Supabase auth fails. |
| Customer loan application (4-step) | `/apply` | Client-side (personal, employment, car & loan, documents) |
| Eligibility check | `/check-eligibility` | Client-side quick check |
| Application status | `/application-status` | Demo data (stage timeline, loan metrics, progress tracker) |

**Employee-facing (auth required):**

| Screen | Route | Data source |
|---|---|---|
| Dashboard | `/dashboard` | Supabase (stat cards still mock) |
| Application queue | `/applications` | Supabase via `fn_list_applications` |
| New application (5-step) | `/applications/new` | Supabase via `fn_submit_full_application` |
| Application review | `/applications/:id` | Supabase (direct table queries) |
| Manager review | `/applications/:id/manager-review` | Supabase |
| In-principle approval | `/applications/:id/approval` | Supabase (RBI-compliant conditional letter) |
| Sanction letter | `/applications/:id/sanction` | Supabase (RBI-compliant final letter with APR) |
| Policy rules | `/policy-rules` | Supabase (policy_rules table) |
| Audit log | `/audit-log` | Supabase (audit_events table) |
| Rate grid | `/rate-grid` | Mock data (schema mismatch) |
| Employers | `/employers` | Mock data |
| Users | `/users` | Mock data |

### Integration layer

Files in `src/lib/`:
- `supabase.ts` — client init, reads env vars, warns if not configured
- `api.ts` — wraps Supabase queries and RPCs, zod schema validates + transforms DB rows to UI types, falls back to mock data

### What's fully wired to Supabase
- Application queue with real applicant names, employers, CIBIL categories
- New application form: 5-step wizard submits via `fn_submit_full_application`, dialog shows APPROVE/REJECT/MAYBE with rate and summary
- Application review: customer profile, income assessment, bureau summary with CIBIL gauge, obligations & FOIR bar, vehicle & LTV, policy rule pass/fail grid
- Policy rules: reads from `policy_rules` table
- Audit log: reads from `audit_events` table

### New in Sep 2026: customer-facing layer

Ported from Stitch Showcase design reference into cercit:

| File | What it adds |
|---|---|
| `src/routes/index.tsx` | Full landing page: hero with SpeedoCluster gauge, trust stats, how-it-works, EMI calculator, 13 car brands, "why cercit" grid, 5-question FAQ accordion, CTA, footer |
| `src/routes/login.tsx` | Dedicated login page (was previously at `/`). Preserves demo mode bypass. |
| `src/routes/apply.tsx` | 4-step customer loan application: personal details with OTP verify, employment & income, car & loan with live EMI calc, document upload + review + consent |
| `src/components/pointer-fx.tsx` | Interactive visual effects: HeadlightSurface (cursor-tracking gradient), TiltCard (perspective hover), SpeedoCluster (SVG gauge with cursor-driven needle) |
| `src/components/brand.tsx` | Text-based BrandLogo component (no external asset files) |
| `src/lib/customer-data.ts` | Car brands (13), FAQ content (5 Q&A), car make-to-model mapping (12 OEMs) |

Public route whitelist in `__root.tsx` updated: `/`, `/login`, `/apply`, `/check-eligibility`, `/application-status` all skip auth guard.

### Smart login routing (SCRUM-28)

Email domain detection in `src/lib/auth.ts`:
- `isEmployeeEmail()` checks against `EMPLOYEE_DOMAINS = ["cercit.in", "cercit.com"]`
- Employee emails route to `/dashboard`, customer emails route to `/application-status`
- `setCustomerEmail()` / `getCustomerEmail()` pass email via sessionStorage
- Login falls back to demo mode when Supabase auth fails (no real users registered)

### Customer application status portal (SCRUM-29)

New route at `/application-status` with:
- Demo application data: CER-2026-04821, Hyundai Creta SX(O), 12L loan, 60 months, 8.99%, EMI 24,904
- Stage timeline: 5 stages (received, docs verified, credit assessment, decision, sanction letter) with done/active/pending states
- 4 metric cards (vehicle, loan amount, tenure, estimated EMI)
- "What happens next" explainer section
- Demo mode banner when running without Supabase

### Still on mock data
- Rate grid page (schema mismatch between DB and UI)
- Employer/user management screens
- Login/auth (fake credentials)
- Decision Distribution pie chart (hardcoded percentages)

---

## Known issues

1. `fn_generate_recommendation`: rate_row crash when bureau score doesn't match any rate_grid band — fix deployed in 006 but needs re-run if error persists
2. No document upload (Supabase Storage not configured)
3. No real auth — login is fake, RLS is off
4. SPA build bundles everything into one 1.1 MB JS chunk (no code splitting) — acceptable for demo

---

## Repo structure

```
cercit/CERCIT_autoloan (public, main branch)
├── sql/                    # Database migrations (run in order)
│   ├── 001_schema.sql      # 22 tables
│   ├── 002_seed_lookups.sql # States, rate grid, reason codes, policy rules, users
│   ├── 003_seed_dealers.sql # 132 dealers across 12 OEMs
│   ├── 004_functions.sql    # 7 PostgreSQL functions
│   ├── 005_smoke_tests.sql  # APPROVE + REJECT test scenarios
│   ├── 006_submit_application.sql # Full submission RPC + recommendation fix
│   ├── 007_officer_decision.sql   # Officer approve/reject/refer RPC
│   └── 008_demo_scenarios.sql     # 3 demo applications via fn_submit_full_application
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

### Completed

- [x] Wire Approve/Reject buttons to update DB (fn_officer_decision RPC)
- [x] Dashboard live stats from Supabase
- [x] Pre-load demo scenarios (APPROVE/REJECT/MAYBE)
- [x] GitHub Pages deploy pipeline (SPA build + GitHub Actions)
- [x] In-principle approval letter (conditional, revocable, per RBI FPC)
- [x] Sanction letter rewrite (8 sections, APR via IRR, per RBI DLG 2025)
- [x] Shared letter-layout component with A4 print CSS and letterhead
- [x] Zod schema migration (replaced 28-field manual mapping in api.ts)
- [x] Jira setup: 6 epics, 16 stories (SCRUM-6 through SCRUM-27)
- [x] Customer-facing landing page (hero, EMI calc, car brands, FAQ, CTA)
- [x] Dedicated login page at `/login` (moved from `/`)
- [x] Customer loan application form at `/apply` (4-step: personal, employment, car & loan, documents)
- [x] Interactive visual effects (SpeedoCluster gauge, HeadlightSurface, TiltCard)

### Phase 3 — build out
- [x] Smart login routing (auto-detect customer vs employee email)
- [x] Customer application status portal (post-login tracking)
- [ ] Letter PDF generation (approval + sanction)
- [ ] Supabase Auth with officer/manager roles
- [ ] RLS policies per role
- [ ] Document upload via Supabase Storage
- [ ] Deploy to Cloudflare Workers (SSR build already works, needs account setup)
- [ ] Figma wireframes

### Phase 4 — launch
- [x] Enable GitHub Pages in repo settings (Settings > Pages > GitHub Actions)
- [x] Repo made public (cercit/CERCIT_autoloan)
- [x] Site live at https://cercit.github.io/CERCIT_autoloan/
- [ ] Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as repo secrets (site works with mock data until then)
- [ ] Portfolio case study and LinkedIn post

### Phase 5 — post-launch
- [ ] Security audit by 3 AI models (Claude/Fable, GPT 5.6, Kimi 3/DeepSeek)
- [ ] Fix audit findings
