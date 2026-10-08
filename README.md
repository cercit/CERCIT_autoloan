# cercit

**Credit Evaluation and Risk Compliance Intelligence Tool**

**Live demo:** https://cercit.github.io/CERCIT_autoloan/

A credit appraisal system for salaried new-car loans. A customer applies from their phone; documents are read and checked automatically, two credit bureaus are pulled, income is checked three ways, versioned policy rules and a risk model recommend Approve, a closer look, or Decline, and a credit officer signs off with the reasons in plain English. After approval: offer, e-sign, e-mandate, dealer paid, and a loan book that tracks every repayment.

A product management project for the Masai × IIT Roorkee programme, built end to end: PRD, policy, database, cloud, risk model, screens, tests and documentation. Every customer in the demo is synthetic.

## Try it

1. Open the [live demo](https://cercit.github.io/CERCIT_autoloan/) and go to **Login → Official**.
2. Next to the sign-in form, pick **Login as Head**, **Manager** or **Officer**. The login fills in; press **Sign in**.
3. Decide cases, change rules, try to break it. Anything changed outside a case can be undone by the Admin.
4. When you sign out, a short form asks how it went, where you got lost and what broke.

The landing page's **Decks** menu has three decks: Investor, Bank / NBFC and **Tech** (how cercit is built, also as a PDF).

## What it does

**For customers**
- Eligibility check that follows the live policy bands, and an application from the phone: car, details, documents, live photo
- Documents read automatically; Aadhaar digits and QR code masked before storage
- Application tracking, offer, e-sign, e-mandate, and a My Loan page with the repayment schedule

**For the credit team**
- Case queue and dashboard; a review screen showing the engine's recommendation, FOIR, LTV, the rules not met, bureau detail and income from three sources
- Officer decisions with overrides and reasons; manager review for referred cases
- Policy rules, rate grid, risk model and roles change through draft → impact test → approval → live on a date; the Credit Head proposes, only the Admin approves
- Employer master with checks, document-check rules, loan portfolio (PAR, vintages), audit log with filters, users and roles

## How it's built

| Layer | Technology |
|---|---|
| Website | React 19, TanStack Router, Vite 8, Tailwind CSS 4, shadcn/ui; hosted on GitHub Pages |
| Risk model | XGBoost v2 exported to ONNX, run in the browser (onnxruntime-web); trained on 16,995 synthetic customers |
| Database | Supabase Postgres in Mumbai: 100 tables, row-level security on every table, 460 functions (204 permission-checked), pg_cron jobs |
| Documents | AWS Mumbai: API Gateway, 9 Python Lambdas, S3, Textract (reading), Rekognition (face match) |
| Access | Supabase Auth; 8 roles, 32 rights, conflicting rights blocked; PAN and mobile encrypted at rest |
| Tests | 60+ SQL test sections on PGlite; policy, rules and parity checks; Lambda unit tests; Playwright page checks |

The full picture: [behind-the-scenes/how-it-works/](behind-the-scenes/how-it-works/) (flows, schema, functions, components, where each model and piece of data lives) and the Tech deck.

## Roles and logins

| Role | Can do | Login |
|---|---|---|
| Admin | Approves rule, rate, model and role changes; users, organisation, settings; undoes team changes | Private |
| Credit Head | Proposes rule, rate, model and role changes; every case; compliance (AML, consent, complaints) | Head button on the sign-in page |
| Credit Manager | Every case, decisions up to Rs 25 lakh, overrides | Manager button |
| Credit Officer | Checks and decides cases up to Rs 18 lakh | Officer button |
| Practice roles, demo visitor | Synthetic cases only, read-only or reset regularly | Not shown on the sign-in page |

## Running it locally

```bash
git clone https://github.com/cercit/CERCIT_autoloan.git
cd CERCIT_autoloan
npm install
cp .env.example .env   # add the Supabase URL and anon key
npm run dev
```

Without Supabase details the site runs on built-in sample data.

**Database:** run `sql/001` to the latest file in order in the Supabase SQL editor. [docs/migration-run-log.md](docs/migration-run-log.md) records what each file does and when it went live. Tests: `npm run test:sql` (database), `npm run test:policy`, `npm run test:rules`, `npm run test:parity`.

## Project structure

```
├── src/                 Website (routes, components, lib: data access and engines)
├── public/decks/        Investor, Bank / NBFC and Tech decks (HTML + PDF)
├── public/models/       Risk model (ONNX)
├── sql/                 Database migrations, run in order, each logged
├── aws/lambdas/         Document readers, finaliser (masking), presigned uploads, policy engine
├── tests/               SQL tests (PGlite), policy tests, Playwright page checks
├── scripts/             Training, test cases, deck PDFs, erasure, backups
├── behind-the-scenes/   How it works (flows, schema, functions) and the synthetic training data
├── docs/                Fix list, audits, migration log, learnings, guides
└── PRD.md               Product requirements (v3.0)
```

## Documentation

| Document | What it covers |
|---|---|
| [How it works](behind-the-scenes/how-it-works/) | Flows, schema, functions, components, where things live |
| [Migration run log](docs/migration-run-log.md) | Every database change, what it does, when it went live |
| [Fix list](docs/fix-list.md) | Known issues, decisions and pre-launch items |
| [Audit review, 4 Oct](docs/audit-review-2026-10-04.md) | An outside audit, checked finding by finding |
| [Risk model v2](docs/risk-model-v2.md) | Training data, inputs, results |
| [Data protection](docs/data-protection.md) | Erasure on request, retention |
| [Production checklist](docs/production-checklist.md) | What to switch off and remove before real customers |
| Learnings | `docs/learnings-*.md`: what went wrong, what we changed |

> **REMOVE BEFORE REAL USE: the daily simulation.** `sql/075` makes synthetic customers, loans and payments every day (job `cercit-simulation-daily`). Before a real lender uses this database: `SELECT cron.unschedule('cercit-simulation-daily');`, then `SELECT fn_synthetic_purge();`. See the production checklist.

## Decision methodology

AI assists, policy decides, a person signs off:

1. **Documents**: read, masked and cross-checked (name, birth date, address, face, payslip age)
2. **Bureau**: two bureaus, the worse score counts; DPD, enquiries, write-offs, settled accounts
3. **Income and obligations**: declared, payslip and bank salary compared, the lowest counts; FOIR
4. **Collateral**: LTV on ex-showroom and on-road price
5. **Risk model**: chance of going 30+ days late, grade A to E
6. **Policy rules**: 16 versioned rules; missing bureau, bank or income data sends the case to a person

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
| Database engineer (Supabase, 89 migrations, privacy rules) | Claude |
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
