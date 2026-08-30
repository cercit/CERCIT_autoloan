# cercit

**Credit Evaluation and Risk Compliance Intelligence Tool**

AI-powered credit appraisal system for new vehicle finance. Automates the Credit Appraisal Memo (CAM) process: customer submits an application, the policy engine assesses it against 16 rules, and a loan officer reviews the AI recommendation with full evidence.

Built as an end-to-end product — PRD, database design, backend logic, frontend, and documentation — demonstrating PM + technical execution.

## What it does

1. **Customer applies** — 5-step form: personal details, employment, vehicle & deal, obligations, documents
2. **Engine assesses** — CIBIL score check, FOIR/LTV/DBR calculation, 16 policy rules evaluated, EMI computed
3. **Decision generated** — APPROVE (8.99%) / MAYBE (9.9%, manual review) / REJECT with full explanation
4. **Officer reviews** — dashboard queue, detailed review screen with income assessment, bureau summary, policy pass/fail, risk/positive factors

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TanStack Router, shadcn/ui, Tailwind CSS, Vite |
| Backend | Supabase (PostgreSQL), 8 RPC functions, SECURITY DEFINER |
| Database | 22 tables, 293 columns, 132 dealers, 16 policy rules |
| Hosting | Supabase (Mumbai region) |
| Auth | Not yet implemented (Phase 3) |

## Quick start

```bash
git clone https://github.com/cercit/cercit.git
cd cercit
npm install
cp .env.example .env
# Fill in your Supabase anon key in .env
npm run dev
```

The app works without Supabase credentials — it falls back to mock data automatically.

### Database setup

Run the SQL migrations in order in the Supabase SQL Editor:

1. `sql/001_schema.sql` — tables
2. `sql/002_seed_lookups.sql` — states, rate grid, policy rules, users
3. `sql/003_seed_dealers.sql` — 132 dealers
4. `sql/004_functions.sql` — backend functions
5. `sql/006_submit_application.sql` — submission RPC + recommendation fix

See `docs/supabase_integration_guide.md` for full setup instructions.

## Project structure

```
├── sql/          Database migrations (run in order)
├── docs/         Documentation, logos, templates
├── data/         Seed CSV data (OEM dealers and models)
├── src/
│   ├── lib/      Supabase client + API layer
│   ├── routes/   Page components (TanStack Router)
│   └── components/ Shared UI components
├── PRD.md        Product requirements document (v3.0)
└── .env.example  Template for Supabase credentials
```

## Documentation

| Document | What it covers |
|---|---|
| [PRD](PRD.md) | Full product requirements, scope, architecture, decisions |
| [Build progress](docs/build_progress.md) | What's done, what's next, known issues |
| [Application flow](docs/application_flow.md) | Step-by-step form design with field specs |
| [Current state workflow](docs/current_state_workflow.md) | How manual credit appraisal works today at Indian banks/NBFCs |
| [Supabase guide](docs/supabase_integration_guide.md) | Connection setup, data flow, API architecture |
| [Security audit plan](docs/security_audit_plan.md) | Post-demo audit by 3 AI models |
| [Scheme design](docs/scheme_design_template.xlsx) | Rate grid and product norms |

## Decision methodology

Six-layer assessment, each independent:

1. **Hard filters** — KYC, negative list, age, geography
2. **Bureau scoring** — CIBIL band, DPD history, enquiry velocity
3. **Income & obligation** — FOIR, DBR, net surplus
4. **Collateral** — LTV, vehicle make/model risk tier
5. **AI/ML model score** — propensity/default prediction (Phase 2)
6. **Policy rule engine** — product norms, MoU-specific rules

## Roadmap

- [x] PRD and scope (all 20 open items closed)
- [x] Database schema (22 tables on Supabase)
- [x] Backend functions (8 RPCs, policy engine)
- [x] Frontend prototype (10 screens)
- [x] E2E flow (submit -> assess -> review)
- [ ] Approve/reject actions wired to DB
- [ ] Supabase Auth + RLS
- [ ] Sanction letter PDF
- [ ] Deploy to Vercel
- [ ] Security audit (Claude Fable, GPT 5.6, Kimi 3/DeepSeek)

## Credits

**Product & Domain:** Sameer S Mittimani
**Engineering:** Built with Claude (Anthropic)
**UI Prototype:** Lovable

## License

AGPL-3.0. Commercial license required for financial institutions.
