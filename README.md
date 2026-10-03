# cercit

**Credit Evaluation and Risk Compliance Intelligence Tool**

**Live demo:** https://cercit.github.io/CERCIT_autoloan/

AI-powered credit appraisal system for new vehicle finance. Automates the Credit Appraisal Memo (CAM) process: customer submits an application, the policy engine assesses it against 16 rules, and a loan officer reviews the AI recommendation with full evidence.

Built as an end-to-end product — PRD, database design, backend logic, frontend, and documentation — demonstrating PM + technical execution.

## What it does

**For customers:**
- Landing page with EMI calculator, car brand showcase, and eligibility guidance
- 4-step online loan application: personal details, employment & income, car & loan selection, document upload
- Application tracking portal with stage timeline, loan metrics, and progress updates

**For loan officers:**
- Dashboard queue with live stats from Supabase
- 5-step internal application form submitting to the assessment pipeline
- 16 policy rules evaluated automatically (CIBIL, FOIR, LTV, DBR, employer, age, DPD)
- Structured recommendation: APPROVE (8.99%) / MAYBE (9.9%, manual review) / REJECT with explanation
- Detailed review screen with income assessment, bureau summary, policy pass/fail grid
- RBI-compliant approval and sanction letters with KFS disclosures and APR

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TanStack Router, shadcn/ui, Tailwind CSS v4, Vite, Recharts |
| Backend | Supabase (PostgreSQL), 9 RPC functions, SECURITY DEFINER |
| Database | 22 tables, 293 columns, 132 dealers, 16 policy rules |
| Hosting | [GitHub Pages](https://cercit.github.io/CERCIT_autoloan/) (SPA, live) / Cloudflare Workers (SSR, planned) |
| Auth | Smart login routing (demo mode, domain-based detection). Full Supabase Auth planned. |

## Quick start

```bash
git clone https://github.com/cercit/CERCIT_autoloan.git
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
6. `sql/007_officer_decision.sql` — officer approve/reject/refer
7. `sql/008_demo_scenarios.sql` — 3 demo applications (APPROVE/REJECT/MAYBE)

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
| [Production checklist](docs/production-checklist.md) | What to switch off and remove before real customers |

> **REMOVE BEFORE REAL USE: the daily simulation.** `sql/075` makes synthetic customers, loans and payments every day (job `cercit-simulation-daily`). Before a real lender uses this database: `SELECT cron.unschedule('cercit-simulation-daily');`, then `SELECT fn_synthetic_purge();`. See the production checklist.

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
- [x] Frontend prototype (18 routes)
- [x] E2E flow (submit -> assess -> review)
- [x] Approve/reject actions wired to DB
- [x] Dashboard live stats from Supabase
- [x] Demo scenarios (APPROVE/REJECT/MAYBE)
- [x] Deploy to GitHub Pages (SPA build + GitHub Actions)
- [x] Customer landing page with EMI calculator
- [x] Customer loan application form (4-step)
- [x] Smart login routing (customer vs employee)
- [x] Customer application status portal
- [ ] Supabase Auth + RLS
- [ ] Sanction letter PDF
- [ ] Deploy to Cloudflare Workers (SSR build ready, needs account setup)
- [ ] Security audit (Claude Fable, GPT 5.6, Kimi 3/DeepSeek)

## FAQs

**What is cercit? Why the name?**
cercit stands for **C**redit **E**valuation and **R**isk **C**ompliance **I**ntelligence **T**ool. It checks your documents, reads your credit history, works out what you can comfortably repay and stays inside the lending rules, so a car loan is decided in hours, not days. Fun fact: cercit was Sameer's gamer tag long before it was a loan platform.

**Why take my car loan here? What makes it special?**
We value your time, and we keep improving how we use it. Your documents are read and checked automatically, your credit is assessed the moment you apply, and a person steps in only where a decision really needs one. You came here to plan a new car, not a loan, and we'd like to keep it that way.

**How do I contact you?**
We're here every working day on chat, email or a call. We don't have a call centre: whoever is free picks up, from the founder to the newest member of the team. If we can't solve it on the spot, we'll understand the problem and arrange a call back. You'll always talk to a person, never a bot.

**What documents do I need?**
PAN, Aadhaar, a live photo, your last 3 salary slips, 6 months of bank statements, Form 16 and the dealer's quotation. Photos or PDFs from your phone are fine, including password-protected PDFs.

**How long does approval take?**
Most salaried applications with complete documents get a decision the same day, often within the hour. A closer look by a credit officer can take 1–2 working days. A person signs off every loan.

**Can I prepay my loan?**
Yes, after your first 6 EMIs. Prepayment is charged at 4% of the amount prepaid, and every charge is in your Key Fact Statement before you sign.

**What if my application is rejected?**
You'll see the reason in plain words. Fix what can be fixed (a missing or unclear document) and send it again, or apply again after 90 days. You can always ask for a credit officer to take a second look.

## Meet the founders

cercit was built by two founders: one who knows car loans, and one that writes code and designs screens.

### Sameer Shreenivas Mittimani: founder, product and credit

Sameer has spent years close to how car loans really get approved, and to the slow parts nobody enjoys. He is a product manager (Masai × IIT Roorkee Product Management certification) and wrote cercit's product plan, its credit policy and every rule behind a decision, then reviewed the build one step at a time. GitHub: [cercit](https://github.com/cercit).

### Claude (AI by Anthropic): chief architect, all things tech

Claude is an AI model made by Anthropic and cercit's chief architect: the lead on everything technical. Working from Sameer's specs and reviews, it designed the system, wrote most of the code, designed the screens, built the database and the cloud services, trained and checked the risk model, and wrote the tests and documentation. Where other tools helped, Claude brought their work together and checked it.

### Roles covered in building cercit

| Role | Who |
|---|---|
| Founder and CEO | Sameer |
| Product manager (PRD, roadmap, priorities) | Sameer |
| Head of credit policy (rules, rate grid, approval bands) | Sameer |
| Underwriting and domain expert (car-loan benchmarks, synthetic customer profiles) | Sameer |
| Business analyst (flows, data points, reconciliation) | Sameer |
| Project manager (Jira, sprints, fix list) | Sameer |
| Testing and sign-off (live checks, acceptance) | Sameer |
| Compliance and privacy owner (RBI digital lending, DPDP) | Sameer |
| Software engineer (website, staff and customer screens) | Claude |
| Database engineer (Supabase, 80 migrations, privacy rules) | Claude |
| Cloud engineer (AWS document readers, face match, masking) | Claude |
| Data scientist (synthetic data, XGBoost risk model) | Claude |
| UI and UX designer (screens, brand, landing page) | Claude |
| Test automation (SQL tests, page checks) | Claude |
| Security reviewer (access rules, audits) | Claude |
| Technical writer (how-it-works pack, guides) | Claude |

### The wider team

Claude led the technical work. These tools helped along the way, some directly and some behind the scenes:

| Tool | What it contributed |
|---|---|
| Lovable | The first clickable prototype of the screens, which the website grew from |
| Google Stitch | Early screen design concepts for the customer and staff apps |
| ChatGPT | The first brainstorm: a 53-part solution blueprint for the whole system |
| Gemini | Market and regulation research for the product plan, and quick drafting |
| Microsoft Copilot | A detailed spec: failure handling, the document-reading pipeline, the test approach |
| Hermes | An agent that ran overnight drafting jobs and guides, using free models |
| Inkling | Free conversational model (through Hermes) for drafts and reasoning on design questions |
| MiniMax M3 | Free coding model (through Hermes) for first drafts of small scripts |
| DeepSeek | Earlier default for writing tasks that didn't need tools |
| Qwen (local) | Runs on Sameer's laptop for private and bulk drafts, so nothing sensitive leaves the machine |

No customer data was ever given to any of these tools. Which model does which job, where it runs and where each piece of data is kept: [behind-the-scenes/how-it-works/where-things-live.md](behind-the-scenes/how-it-works/where-things-live.md).

## License

AGPL-3.0. Commercial license required for financial institutions.
