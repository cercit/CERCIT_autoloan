# Folder guide

What every folder in the repo holds, with each file and a one-line note (23 Oct 2026, 771 files tracked by Git). Notes come from each file's own heading or first comment. Folders with many similar files (task cards, UI kit, test cases) list file names only.

## Top level

| Folder | Files | What it is |
|---|---|---|
| `(root)` | 19 | Project config and the top-level readme, PRD and licence. |
| `.claude` | 2 | Claude Code settings for this repo (dev server launch config). |
| `.github` | 4 | GitHub settings: the visual snapshot config. |
| `.lovable` | 1 | Lovable project link (the prototype the front end started from). |
| `aws` | 34 | AWS document pipeline: the SAM template, deploy script, CloudTrail setup. |
| `behind-the-scenes` | 13 | Plain-language explainers for readers of the public repo. |
| `data` | 2 | Reference data: Indian car OEM dealers and models (public information). |
| `docs` | 84 | Working documents: plans, audits, learnings, the migration run log, the fix list, market sizing, compliance map. |
| `policy` | 1 | The credit rules as a JSON policy document (2026.09 draft). |
| `public` | 24 | Files served as-is by the site: icons, decks, the ONNX risk models, team images. |
| `scripts` | 62 | Build and data scripts: training data, model training, deck PDFs, policy seeds, site preparation. |
| `sql` | 103 | Database migrations, run in number order (001 to 095). Each file says what it changes and how to check it. |
| `src` | 257 | The web app (React, TanStack Router, Vite). |
| `tasks` | 156 | Build task cards. `queue` = waiting, `done` = finished, `reports` = results. |
| `tests` | 9 | Playwright browser tests (pages, roles, phone layout). |
| `Documentation` | 8 | This folder: folder guide, schema, cardinality, scheme design, functions, and two workbooks. |

## Each folder

### (root)

Project config and the top-level readme, PRD and licence.

| File | Note |
|---|---|
| `.env.example` | Template for the environment variables (Supabase URL and public key); the real .env is not in Git |
| `.gitignore` | Files Git ignores (build output, node_modules, .env) |
| `.prettierignore` | Files the code formatter skips |
| `.prettierrc` | Code formatter settings |
| `AGENTS.md` | Instructions for AI coding agents working in this repo |
| `LICENSE` | Licence |
| `PRD.md` | cercit — PRD |
| `README.md` | Project overview, live link, how to run |
| `bunfig.toml` | Bun runtime settings |
| `components.json` | shadcn/ui component settings |
| `eslint.config.js` | Lint rules |
| `package-lock.json` | Exact dependency versions |
| `package.json` | Dependencies and npm scripts |
| `playwright.config.ts` | Browser test settings |
| `spa.html` | Single-page entry used for the GitHub Pages build |
| `tsconfig.json` | TypeScript settings |
| `vite.config.ts` | Vite build settings (main build) |
| `vite.spa.config.ts` | Vite build settings (GitHub Pages single-page build) |
| `wrangler.toml` | Cloudflare Workers deploy settings (alternative host) |

### .claude

Claude Code settings for this repo (dev server launch config).

| File | Note |
|---|---|
| `launch.json` | Dev server config for Claude Code |
| `settings.json` | Claude Code project settings |

### .github

GitHub settings: the visual snapshot config.

| File | Note |
|---|---|
| `snapdrift.json` | Visual snapshot test settings |

### .github/workflows

GitHub Actions: deploy the site to GitHub Pages, run checks, and the scheduled settings backup.

| File | Note |
|---|---|
| `deploy.yml` |  |
| `settings-backup.yml` |  |
| `verify.yml` |  |

### .lovable

Lovable project link (the prototype the front end started from).

| File | Note |
|---|---|
| `project.json` | Lovable project link |

### aws

AWS document pipeline: the SAM template, deploy script, CloudTrail setup.

| File | Note |
|---|---|
| `cloudtrail-setup.sh` |  |
| `deploy.ps1` |  |
| `samconfig.toml` |  |
| `template.yaml` |  |

### aws/lambdas/audit_export

| File | Note |
|---|---|
| `handler.py` |  |
| `test_export.py` | Checks for the audit export's file naming and checksums (no AWS, no database). |

### aws/lambdas/bank_statement_extractor

| File | Note |
|---|---|
| `handler.py` |  |

### aws/lambdas/bureau_extractor

| File | Note |
|---|---|
| `handler.py` |  |

### aws/lambdas/cross_validator

| File | Note |
|---|---|
| `handler.py` |  |
| `test_name_match.py` | Checks for the cross-document name match (made-up names). Same cases as the SQL tests for 090. |

### aws/lambdas/document_finalize

| File | Note |
|---|---|
| `face_match.py` |  |
| `handler.py` |  |
| `qr_mask.py` | Find QR codes on an Aadhaar image so they can be blacked out (reconcile R18). |
| `requirements.txt` |  |
| `test_finalize_rules.py` | Checks for the Aadhaar keep-or-refuse rules in handler.py (made-up numbers only). |
| `test_qr_mask.py` | Checks for the Aadhaar QR finder on made-up cards (no real Aadhaar). |

### aws/lambdas/form16_extractor

| File | Note |
|---|---|
| `handler.py` |  |

### aws/lambdas/incoming_sweep

| File | Note |
|---|---|
| `handler.py` |  |
| `test_sweep.py` | Checks for the incoming/ sweep's age filter (no AWS). |

### aws/lambdas/kyc_extractor

| File | Note |
|---|---|
| `handler.py` |  |
| `test_lines.py` | Line-by-line reading of downloaded e-Aadhaar / e-PAN PDFs, on made-up documents. |

### aws/lambdas/policy_engine

| File | Note |
|---|---|
| `handler.py` |  |
| `requirements.txt` |  |
| `test_handler.py` |  |

### aws/lambdas/presigned_url

| File | Note |
|---|---|
| `handler.py` |  |

### aws/lambdas/salary_slip_extractor

| File | Note |
|---|---|
| `handler.py` |  |

### aws/lambdas/shared

| File | Note |
|---|---|
| `__init__.py` |  |
| `requirements.txt` |  |
| `supabase_client.py` |  |
| `textract_parser.py` |  |

### aws/lambdas/shared/python

| File | Note |
|---|---|
| `requirements.txt` |  |

### aws/lambdas/shared/python/shared

| File | Note |
|---|---|
| `__init__.py` |  |
| `supabase_client.py` |  |
| `textract_parser.py` |  |

### behind-the-scenes

Plain-language explainers for readers of the public repo.

| File | Note |
|---|---|
| `README.md` | Behind the scenes |

### behind-the-scenes/how-it-works

Generated guide: components, flows, functions, glossary, migrations, schema, where things live.

| File | Note |
|---|---|
| `README.md` | How cercit works |
| `components.md` | The parts of cercit and how they talk to each other |
| `flows.md` | How a loan moves through cercit: the flow charts |
| `functions.md` | Database functions, by stage |
| `glossary.md` | Glossary |
| `migrations.md` | Migrations, in run order |
| `schema.md` | Database schema |
| `where-things-live.md` | Where everything lives: models, data and the team behind them |

### behind-the-scenes/synthetic-training-data

The synthetic customers used to train the risk model, and its results.

| File | Note |
|---|---|
| `README.md` | Synthetic training data (risk model v2) |
| `SYNTHETIC-customers-features.csv` | CSV data |
| `SYNTHETIC-customers-with-outcomes.csv` | CSV data |
| `risk-model-v2-results.json` | JSON data/config |

### data

Reference data: Indian car OEM dealers and models (public information).

| File | Note |
|---|---|
| `indian_car_oem_dealers.csv` | CSV data |
| `indian_car_oem_models.csv` | CSV data |

### docs

Working documents: plans, audits, learnings, the migration run log, the fix list, market sizing, compliance map.

| File | Note |
|---|---|
| `application_flow.md` | cercit — Application Flow (Phase 1) |
| `audit-brief.md` | cercit audit brief |
| `audit-review-2026-10-04.md` | Audit review, 4 Oct 2026 |
| `build_log.md` | cercit build log |
| `build_progress.md` | cercit build progress |
| `cercit-journey.html` |  |
| `cercit-review-report.html` |  |
| `cloud-session-brief.md` | Brief for a cloud session: working through the fix list |
| `compliance-map.md` | Compliance map: cercit against RBI and data rules |
| `consolidation-plan.md` | Consolidation plan |
| `current_state_workflow.md` | How a salaried new-car loan gets appraised today |
| `customer-side-audit-2026-10-03.md` | Customer side: audit, 3 Oct 2026 (fix list H2) |
| `data-protection.md` | Data protection: erasing a customer's data, and how long data is kept |
| `db_schema_template.xlsx` | Excel workbook |
| `deploy_instructions.md` | Deploy instructions |
| `fix-list.md` | Fix list: to do all at once |
| `handover-2026-09-29.md` | Handover, 29 Sep 2026 |
| `learnings-2026-09-27-to-10-02.md` | What we learned, 27 Sep – 2 Oct 2026 |
| `learnings-2026-10-03.md` | What we learned, 3 Oct 2026 |
| `learnings-2026-10-09.md` | What we learned, 4–9 Oct 2026 |
| `learnings-2026-10-23.md` | What we learned, 9–23 Oct 2026 |
| `linkedin_post_sept2026.md` | ProductManagement #CreditUnderwriting #VehicleFinance #BuildInPublic |
| `linkedin_post_week3.md` | LinkedIn Post: cercit Week 3 — XGBoost meets policy rules |
| `logo-horizontal.png` | Image |
| `logo-square.png` | Image |
| `market-sizing-2026-10-09.md` | Market sizing: TAM, SAM, SOM (9 Oct 2026) |
| `migration-run-log.md` |  |
| `migration_bank_tables.sql` | Migration: Add bank statement analysis tables for Week 2 |
| `migration_bureau_table.sql` | Migration: Add bureau_reports table for bureau upload + parsing |
| `model-governance.md` | Risk model governance |
| `morning-checklist-2026-09-28.md` | Morning checklist, 28 Sep 2026 |
| `parity-2026-09.md` | Parity check — today's engine against 2026.09 (FD4.4) |
| `plan-next-builds-2026-10-22.md` | Plan: next builds (22 Oct 2026) |
| `practice-logins.md` | Practice logins: what Sameer sets up (fix list D1–D3) |
| `production-checklist.md` | Production checklist: before real customers |
| `rights-and-visibility-audit-2026-10-02.md` | Rights and what the website shows: audit, 2 Oct 2026 |
| `risk-model-v2.md` | Risk model v2: retrained on the platform's own customers |
| `scheme_design_template.csv` | CSV data |
| `scheme_design_template.xlsx` | Excel workbook |
| `security_audit_plan.md` | cercit — Security audit plan |
| `sprint_retro_sept2026.md` | cercit build sprint retro — September 2026 |
| `step4-fields-checked.md` | Step 4: what the customer enters, and what checks it |
| `stitch_prompt.md` | cercit — Full UI prompt for Stitch |
| `stitch_prompt_customer.md` | cercit — Customer Portal & Landing Page |
| `supabase_integration_guide.md` | cercit — Supabase integration guide |
| `todo-2026-10-03.md` | To do, 3 Oct 2026 |
| `work-done-2026-09-27-to-10-02.md` | Work done, 27 Sep – 2 Oct 2026 |

### docs/audits

External-style audit report (4 Oct 2026).

| File | Note |
|---|---|
| `cercit-audit-report-2026-10-04.md` | CERCIT Auto-Loan Audit Report |

### docs/brand

Logo and app icon files.

| File | Note |
|---|---|
| `app-icon.png` | Image |
| `logo-horizontal-dark.png` | Image |
| `logo-horizontal-light.png` | Image |
| `logo-stacked-dark.png` | Image |
| `logo-stacked-light.png` | Image |
| `mark-dark.png` | Image |
| `mark-light.png` | Image |

### docs/brand/source

| File | Note |
|---|---|
| `logo-horizontal.png` | Image |
| `logo-square.png` | Image |

### docs/design

Feature designs (FD notes): versioned policy, rule definitions, data model, document map.

| File | Note |
|---|---|
| `FD1-versioned-policy.md` | FD1 — Versioned, approved policy |
| `FD4-rule-definitions.md` | FD4.1 — One definition of the credit rules |
| `brand-identity.md` | cercit brand identity |
| `car-character-cercit-design.md` | cercit design brief for the interactive car character |
| `customer-data-model.md` | Customer-side data model — from the document map |
| `data-points-check.md` | Data points check, before the 2,000 synthetic customers |
| `document-map.md` | Document map — what each document gives us, and how we check it |
| `unused-modules.md` | Unused modules in `src/lib` (backlog FD6.1) |

### docs/engine-evaluation

The comparison of rule engines (Zen, JSON rules, Deno) that chose the policy engine.

| File | Note |
|---|---|
| `.gitignore` |  |
| `README.md` | Rules engine evaluation (task 0.5a) |
| `cases.json` | JSON data/config |
| `fuzz.json` | JSON data/config |
| `gen-zen.mjs` | Generates zen-policy.json (GoRules JDM): a "collect" decision table listing every |
| `jre-rules.mjs` | The 18 rules in json-rules-engine format. Shared by the Node and Deno runners. |
| `prepare.mts` | Builds cases.json: the 40 scenarios as fully-defaulted inputs, plus the |
| `run-deno.ts` | Deno runner: can each engine load and evaluate under Deno? |
| `run-jre.mjs` | Node runner for json-rules-engine. |
| `run-zen.mjs` | Runs cases.json + fuzz.json through GoRules Zen and compares with the reference engine. |
| `run_zen.py` | Runs the same zen-policy.json through the Python binding (what a Python 3.12 Lambda would use). |
| `zen-policy.json` | JSON data/config |

### docs/hermes-guides

Build guides written for the overnight Hermes drafts.

| File | Note |
|---|---|
| `E2E-test-plan.md` | B6 — End-to-End Test Plan |
| `FD5.1-price-integration.md` | FD5.1 — Price Integration Gap Analysis (hermes2 version) |
| `FD8-stage-check.md` | FD8 — Stage Check / Deploy Verification (hermes2 version) |
| `bank-statement-analysis.md` | B4 — Bank Statement Intelligence Module |
| `cloudflare-workers.md` | B7 — Cloudflare Workers Deploy + Custom Domain |
| `ml-model-skeleton.md` | B5 — ML Model + SHAP Explainability Skeleton |
| `sam-document-pipeline.md` | B3 — Document Pipeline Deploy (SAM / Textract Lambdas) |

### policy

The credit rules as a JSON policy document (2026.09 draft).

| File | Note |
|---|---|
| `credit-rules-2026.09.json` | JSON data/config |

### public

Files served as-is by the site: icons, decks, the ONNX risk models, team images.

| File | Note |
|---|---|
| `apple-touch-icon.png` | Image |
| `favicon-32.png` | Image |
| `favicon.ico` | Image |
| `favicon.svg` | Image |
| `icon-192.png` | Image |
| `icon-512.png` | Image |
| `robots.txt` |  |

### public/decks

Pitch decks: bank/NBFC, investor, tech (HTML and PDF).

| File | Note |
|---|---|
| `bank-nbfc.html` |  |
| `cercit-bank-nbfc-deck.pdf` | PDF |
| `cercit-investor-deck.pdf` | PDF |
| `cercit-tech-deck.pdf` | PDF |
| `investor.html` |  |
| `tech.html` |  |

### public/models

Risk model files the browser runs (ONNX) and their metadata.

| File | Note |
|---|---|
| `cercit-risk-v1.meta.json` | JSON data/config |
| `cercit-risk-v1.onnx` | Model file (ONNX) |
| `cercit-risk-v2.meta.json` | JSON data/config |
| `cercit-risk-v2.onnx` | Model file (ONNX) |

### public/team

Avatars for the team section.

| File | Note |
|---|---|
| `claude.svg` | Image |
| `deepseek.svg` | Image |
| `google.svg` | Image |
| `googlegemini.svg` | Image |
| `minimax.svg` | Image |
| `qwen.svg` | Image |
| `sameer.jpg` | Image |

### scripts

Build and data scripts: training data, model training, deck PDFs, policy seeds, site preparation.

| File | Note |
|---|---|
| `backup-settings.mjs` | H7: save the newest settings backup (taken weekly in the database by 079) to a file outside the database. |
| `build-test-cases.py` |  |
| `deck-pdf.mjs` | Makes a PDF of a slide deck in public/decks: one 1920x1080 page per slide. |
| `erase-s3-application.py` | Erase one application's files from the cercit S3 bucket (fix list H6, AWS part). |
| `gen-policy-draft-2026-09.py` | Writes sql/021_draft_policy_2026_09.sql. |
| `gen-policy-seed.py` | Writes sql/017_seed_policy_2026_08.sql. |
| `gen-rules-2026-09.mjs` | Writes policy/credit-rules-2026.09.json — the unified credit rules as a GoRules |
| `gen-submit-permission.py` | Writes sql/019_submit_application_permission.sql. |
| `generate-training-data.ts` | cercit Week 3 / Part A -- synthetic training data generator |
| `prepare-cf-pages.mjs` | Cloudflare Pages: the build writes dist/spa.html; Pages needs index.html. |
| `prepare-gh-pages.mjs` |  |
| `run-test-cases.ts` | Runs every scripts/test-cases/TC-*.json through the policy rule engine and checks |
| `train-model.py` |  |

### scripts/brand

Logo generator.

| File | Note |
|---|---|
| `make-logos.py` | Builds the cercit logo set from the two source PNGs in docs/brand/source. |

### scripts/data

Model training metadata and SHAP summary.

| File | Note |
|---|---|
| `shap-summary.json` | JSON data/config |
| `training-data.meta.json` | JSON data/config |

### scripts/how-it-works

Generator for behind-the-scenes/how-it-works.

| File | Note |
|---|---|
| `generate.mjs` | G8: write the generated pages of the "How cercit works" pack from the real schema. |
| `key-functions.mjs` | G8: plain-English descriptions of the key database functions, by name. The generator lists |

### scripts/local

Scripts that run only on Sameer's machine (exports, sampling).

| File | Note |
|---|---|
| `export-seasoned-training.mjs` | Risk model v2, step 1: build the synthetic book locally and export one row per assessed application. |
| `labels_only.py` | Print only the field labels of a document (for designing the document map). |
| `portfolio-sample.mjs` | Dev aid: portfolio JSON from a local synthetic book, for checking the page without a live login. |

### scripts/test-cases

41 synthetic loan cases (JSON) for the engine test run, one per scenario.

41 files: `TC-01-clean-private-tier4.json`, `TC-02-clean-govt-3yr.json`, `TC-03-clean-govt-hatchback-10yr.json`, `TC-04-clean-high-salary-4yr.json`, `TC-05-clean-750-exact.json`, `TC-06-clean-700-exact.json`, `TC-07-clean-ltv-100.json`, `TC-08-clean-free-income-15.json`, `TC-09-clean-age-25.json`, `TC-10-clean-age-55-tenure-5.json`, `TC-11-clean-home-loan-in-foir.json`, `TC-12-clean-cc-partial.json`, `TC-13-soft-bureau-690.json`, `TC-14-soft-cc-min-due.json`, `TC-15-soft-one-bounce.json`, `TC-16-soft-salary-4of6.json`, `TC-17-soft-foir-45.json`, `TC-18-soft-recent-dpd30.json`, `TC-19-soft-enquiry-8.json`, `TC-20-soft-two-flags.json`, `TC-21-soft-three-flags.json`, `TC-22-soft-age-maturity-66.json`, `TC-23-hard-bureau-640.json`, `TC-24-hard-bureau-600.json`, `TC-25-hard-foir-55.json`, `TC-26-hard-free-income-10.json`, `TC-27-hard-govt-contract-1yr.json`, `TC-28-hard-govt-2.9yr.json`, `TC-29-hard-tenure-96-private.json`, `TC-30-hard-tenure-120-govt-suv.json`, `TC-31-hard-ltv-105.json`, `TC-32-hard-ltv-98-foir-52.json`, `TC-33-hard-dpd90.json`, `TC-34-hard-writeoff.json`, `TC-35-hard-age-20.json`, `TC-36-hard-stressed-stack.json`, `TC-37-diverge-policy-pass-model-risky.json`, `TC-38-diverge-policy-fail-model-safe.json`, `TC-39-diverge-thin-file.json`, `TC-40-diverge-high-cash.json`, `index.json`

### sql

Database migrations, run in number order (001 to 095). Each file says what it changes and how to check it.

| File | Note |
|---|---|
| `001_schema.sql` | cercit — Credit Evaluation and Risk Compliance Intelligence Tool |
| `002_seed_lookups.sql` | cercit — Seed data for lookup tables |
| `003_seed_dealers.sql` | cercit — Seed dealer data from indian_car_oem_dealers.csv |
| `004_functions.sql` | cercit — Backend functions (PostgreSQL) |
| `005_smoke_tests.sql` | cercit — Smoke tests for backend functions |
| `006_submit_application.sql` | cercit — Full application submission RPC |
| `007_officer_decision.sql` | cercit — Officer decision RPC |
| `008_demo_scenarios.sql` | cercit — Pre-loaded demo scenarios |
| `009_rls_policies.sql` | cercit — Row Level Security policies |
| `010_seed_auth_users.sql` | cercit — Seed demo users in Supabase Auth + link to app users table |
| `011_employer_category_pricing.sql` | cercit — employer category pricing |
| `012_pii_encryption.sql` | cercit — PII encryption at rest (PAN, mobile) |
| `013_pii_enforce_no_plaintext.sql` | cercit — PII encryption phase 2: lock the plaintext columns shut |
| `014_customer_employment_fields.sql` | cercit — customer employment / residence detail columns |
| `015_tenants_and_feature_flags.sql` | cercit — tenants and feature switches (backlog FD0.1, FD0.3) |
| `016_versioned_policy.sql` | cercit — versioned, approved policy (backlog FD1.2, FD1.4) |
| `017_seed_policy_2026_08.sql` | cercit — baseline policy version 2026.08 (backlog FD1.3) |
| `018_permission_checks.sql` | cercit — server-side permission checks (backlog FD2.1, FD2.2) |
| `019_submit_application_permission.sql` | cercit — permission check on application submission (backlog FD2.2) |
| `020_lock_policy_tables.sql` | cercit — no direct edits to policy and pricing tables (backlog FD2.3) |
| `021_draft_policy_2026_09.sql` | cercit — draft policy version 2026.09: unified credit rules (backlog FD4.2) |
| `022_service_role_policy_read.sql` | cercit — let the AWS rules engine read the policy in force (backlog FD4.3) |
| `023_policy_change_workflow.sql` | cercit — the policy change workflow (backlog CC1.1, CC1.2) |
| `024_policy_draft_editing.sql` | cercit — writing a policy draft (backlog CC2.1) |
| `025_policy_impact_check.sql` | cercit — impact check before approval (backlog CC3.1, CC3.2) |
| `026_policy_facts_keep_nulls.sql` | cercit — the impact check must not drop unknown facts (backlog CC3.1 fix) |
| `027_impact_and_activation_fixes.sql` | cercit — fixes from the credit-control review (18 Sep 2026) |
| `028_facts_use_assessed_emi.sql` | cercit — the impact check must use the EMI the assessment worked out |
| `029_loan_repayment_history.sql` | cercit — repayment history, worked out from actual payments (backlog CC/UW) |
| `030_decision_version_pinning.sql` | cercit — every decision records the policy and model it was made under (backlog CC5.1, CC5.2) |
| `031_foir_ltv_tenure_basis.sql` | cercit — FOIR base, LTV base and tenure precedence in the assessment (backlog CC6.1, CC6.2, CC6.3) |
| `032_policy_change_history.sql` | cercit — before/after view and change history for policy versions (backlog CC4.2) |
| `033_server_engine_decisions.sql` | cercit — the rules engine decides an application (backlog FD4.5) |
| `034_demo_users.sql` | cercit — three demo accounts to walk the product with (backlog AD/demo) |
| `035_history_order.sql` | cercit — keep policy history in the order it happened (fix to 032) |
| `036_roles_and_login_rules.sql` | cercit — roles and permissions as data, and the login rules (backlog AD1.1, AD1.2, AD1.3) |
| `037_user_admin.sql` | cercit — staff account management (backlog AD2.1, AD2.2, AD2.3) |
| `038_reference_read_grants.sql` | cercit — let the website read two reference tables (states, employer pricing) |
| `039_role_change_approval.sql` | cercit — role builder with a second approval (backlog AD3.1, AD3.2, AD4.1) |
| `040_my_account.sql` | cercit — "who am I" for the signed-in staff member |
| `041_organisation_settings.sql` | cercit — organisation settings (backlog AD5.1) |
| `042_public_demo_account.sql` | cercit — a public, read-only demo account on the live database |
| `043_customer_onboarding.sql` | cercit — customer onboarding, part 1 (customer batch 1 of docs/design/customer-data-model.md) |
| `044_customer_documents.sql` | cercit — customer onboarding, part 2: document uploads (step 3) |
| `045_document_capture.sql` | cercit — customer onboarding, part 3: how documents are captured (28 Sep 2026) |
| `046_customer_details_submit.sql` | cercit — customer onboarding, part 4: details, submit, tracking (28 Sep 2026) |
| `047_staff_customer_cases.sql` | cercit — the staff side of customer applications (28 Sep 2026) |
| `048_customer_credit_checks.sql` | cercit — credit checks on customer applications (28 Sep 2026, reconcile list R21) |
| `049_after_approval.sql` | cercit — after approval: loan offer and KFS, agreement, EMI mandate, disbursement (28 Sep 2026) |
| `050_customer_privacy.sql` | cercit — keep real customers' data away from the public demo login (28 Sep 2026) |
| `051_returning_customers.sql` | cercit — returning customers by mobile, whatever stage they are at (28 Sep 2026) |
| `052_auto_document_checks.sql` | 052: Automatic document checks |
| `053_bureau_detail.sql` | 053: Bureau detail (two bureaus, worst-of) |
| `054_income_bank_detail.sql` | 054: Income and bank detail |
| `055_synthetic_customers.sql` | 055: Synthetic customers (the 2,000-customer generator) |
| `056_synthetic_loans.sql` | 056: Synthetic loans with repayment history |
| `057_risk_model_v2.sql` | 057: Risk model v2 becomes the approved model |
| `058_loan_portfolio.sql` | 058: Loan portfolio view |
| `059_customer_apps_in_list.sql` | 059: Customer applications in the Applications list, filled in (R22) |
| `060_staff_frame_summary.sql` | 060: Live figures for the staff page frame (fix list A1, A2) |
| `061_staff_application_review.sql` | 061: Application Review reads through one staff function (fix list C5) |
| `062_loan_status_snapshot.sql` | 062: Loan portfolio reads a stored status, not the whole history (fix list C6) |
| `063_staff_policy_rules.sql` | 063: Policy Rules page reads the real rules through a function (fix list C7) |
| `064_staff_dashboard.sql` | 064: Dashboard figures through one staff function (fix list C10) |
| `065_audit_log.sql` | 065: Audit Log, one combined and filtered log (fix list C1 + G6) |
| `066_applications_page.sql` | 066: Applications list a page at a time, searched in the database (fix list C4) |
| `067_my_permissions.sql` | 067: The signed-in person's rights, for the menu and buttons (fix list B1, B3) |
| `068_case_scope_limits_roles.sql` | 068: Officers see their own cases; user limits enforced; old roles retired |
| `069_employer_master.sql` | 069: A real Employer Master, with checks behind each field (fix list G4, C9) |
| `070_employer_category_pricing.sql` | 070: Employer category in the credit engine and on the officer's card (fix list C8) |
| `071_rate_grid_versions.sql` | 071: Rate Grid: edit and add grids, through pricing approval (fix list G3) |
| `072_practice_roles.sql` | 072: Practice logins for visitors: officer, manager, head (fix list D1) |
| `073_practice_reset.sql` | 073: Reset the practice cases to fresh (fix list D2) |
| `074_policy_rule_changes.sql` | 074: Policy Rules: switch a rule on or off, modify its limit, through approval (fix list G2) |
| `075_daily_simulation.sql` | 075: Daily simulation: the synthetic book keeps moving by itself (fix list G7) |
| `076_settings_defaults.sql` | 076: Save today's settings as the defaults; reset all settings in one click (fix list G1) |
| `077_risk_features.sql` | 077: The live risk score reads the inputs the model was trained on (fix list E1) |
| `078_advisor_fixes.sql` | 078: Fix what the security and performance checks flag (fix list H3) |
| `079_settings_backup.sql` | 079: Weekly backup of the settings and policy tables (fix list H7) |
| `080_data_erasure.sql` | 080: Erase a customer's personal data on request; how long data is kept (fix list H6, database part) |
| `081_admin_master_access.sql` | 081: the demo admin gets every right (master access), 3 Oct 2026 |
| `082_credit_head_merged.sql` | 082: one Credit Head role and login covering credit, policy and compliance (9 Oct 2026) |
| `083_head_writes_admin_approves.sql` | 083: the Credit Head writes, the Admin approves (9 Oct 2026) |
| `084_officer_manager_logins.sql` | 084: one Credit Officer and one Credit Manager login (9 Oct 2026) |
| `085_team_reset.sql` | 085: the Admin undoes what the team logins changed outside cases (9 Oct 2026) |
| `086_feedback.sql` | 086: feedback when someone signs out (fix list L3, 9 Oct 2026) |
| `087_feedback_details.sql` | 087: sign-out feedback, second version (9 Oct 2026) |
| `088_missing_data_refers.sql` | 088: missing bank or income data sends the case to a person (audit A3, 9 Oct 2026) |
| `089_decision_records_officer.sql` | 089: a credit decision records who made it (9 Oct 2026) |
| `090_kyc_name_fed.sql` | 090: the name-match rule (KYC-NAME) is fed from the documents (22 Oct 2026) |
| `091_pii_key_vault.sql` | 091: the PAN / mobile encryption key moves into Supabase Vault (R2, 22 Oct 2026) |
| `092_audit_chain.sql` | 092: tamper-evident audit log (R3, 22 Oct 2026) |
| `093_model_governance.sql` | 093: AI model governance (R9, 22 Oct 2026) |
| `094_name_lookalikes.sql` | 094: the name matcher forgives letters a reader mixes up (23 Oct 2026) |
| `095_decision_needs_checks.sql` | 095: deciding a case the credit checks never ran on (23 Oct 2026) |
| `README.md` | cercit SQL scripts |
| `RUN-ME-2026-10-09.sql` | RUN-ME 9 Oct 2026: 088 (missing bank/income data refers) and 089 (decision records the officer). Both tested;  |
| `RUN-ME-2026-10-23.sql` | RUN-ME 23 Oct 2026: 091 (key in Vault), 092 (tamper-evident audit log), 093 (model governance). |
| `RUN-ME-fix-list.sql` | RUN-ME: the fix-list migrations 061-080, in order, in one file |
| `RUN-ME-schedules-075-079.sql` | RUN-ME: schedules for 075 (daily simulation) and 079 (weekly settings backup) |

### sql/checks

Read-only checks run against the database (advisor checks).

| File | Note |
|---|---|
| `advisor-checks.sql` | Advisor checks (fix list H3): read only, safe to run any time |

### sql/optional

Migrations that are run only by choice (e.g. 091b removes the old key copy).

| File | Note |
|---|---|
| `091b_pii_key_remove_copy.sql` | 091b: remove the old copy of the encryption key from app_secrets (by hand) |
| `supabase-storage-backup.sql` | cercit — OPTIONAL: Supabase storage as the backup for customer documents. |

### src

The web app (React, TanStack Router, Vite).

| File | Note |
|---|---|
| `routeTree.gen.ts` | noinspection JSUnusedGlobalSymbols |
| `router.tsx` |  |
| `server.ts` | h3 swallows in-handler throws into a normal 500 Response with body |
| `spa-entry.tsx` |  |
| `start.ts` | Start installs this automatically when src/start.ts is absent; defining the |
| `styles.css` |  |

### src/assets

Images used inside the app.

| File | Note |
|---|---|
| `cercit-cockpit-day-dark.webp` | Image |
| `cercit-cockpit-day-light.webp` | Image |
| `cercit-rhd-cockpit.webp` | Image |

### src/assets/brand

| File | Note |
|---|---|
| `logo-horizontal-dark.png` | Image |
| `logo-horizontal-dark.webp` | Image |
| `logo-horizontal-light.png` | Image |
| `logo-horizontal-light.webp` | Image |
| `logo-stacked-dark.png` | Image |
| `logo-stacked-dark.webp` | Image |
| `logo-stacked-light.png` | Image |
| `logo-stacked-light.webp` | Image |
| `mark-dark.png` | Image |
| `mark-dark.webp` | Image |
| `mark-light.png` | Image |
| `mark-light.webp` | Image |
| `monogram-dark.png` | Image |
| `monogram-dark.webp` | Image |
| `monogram-light.png` | Image |
| `monogram-light.webp` | Image |

### src/components

Screen parts: case review panels, cards, dialogs, the app shell.

| File | Note |
|---|---|
| `activity-feed.tsx` |  |
| `app-shell.tsx` |  |
| `application-card.tsx` |  |
| `application-detail-layout.tsx` |  |
| `application-filter-bar.tsx` |  |
| `application-form-steps.tsx` |  |
| `application-queue.tsx` |  |
| `application-summary-strip.tsx` |  |
| `application-timeline.tsx` |  |
| `approval-stamp.tsx` |  |
| `audit-trail-timeline.tsx` | One line of a case's timeline (the case screen builds these from fn_staff_application_review) |
| `bank-statement-review.tsx` |  |
| `brand.tsx` | The cercit logo set (docs/design/brand-identity.md). Built from the source |
| `bureau-detail.tsx` | The officer's view of a two-bureau pull (sql/053): both bureaus and the |
| `bureau-report-card.tsx` |  |
| `bureau-upload-form.tsx` |  |
| `cam-preview.tsx` |  |
| `cashflow-summary-card.tsx` |  |
| `collateral-summary.tsx` |  |
| `confirmation-dialog.tsx` |  |
| `copilot-review.tsx` |  |
| `customer-status-tracker.tsx` |  |
| `dashboard-kpi-row.tsx` |  |
| `dealer-card.tsx` |  |
| `decision-override-form.tsx` |  |
| `decision-trend-chart.tsx` |  |
| `disbursal-tracker.tsx` |  |
| `document-checklist.tsx` |  |
| `document-extraction-review.tsx` |  |
| `document-list.tsx` |  |
| `document-preview.tsx` |  |
| `document-upload-zone.tsx` |  |
| `eligibility-indicator.tsx` |  |
| `emi-schedule.tsx` |  |
| `employer-autocomplete.tsx` |  |
| `employer-card.tsx` | The case's employer, its category and the pricing it brought (fix list C8). */ |
| `empty-state.tsx` |  |
| `engine-reasons.tsx` | The policy engine's rule results (recommendations.risk_factors) in plain words, for the |
| `escalation-dialog.tsx` |  |
| `esign-consent-flow.tsx` |  |
| `face-match-card.tsx` | Live photo against the PAN and Aadhaar photos (sql/046, aws document_finalize/face_match.py). |
| `feedback-dialog.tsx` |  |
| `foir-calculator.tsx` |  |
| `foir-gauge.tsx` |  |
| `help-support-panel.tsx` | Same answers as the landing page FAQs (src/lib/customer-data.ts), plus a few |
| `income-comparison.tsx` |  |
| `income-detail.tsx` | The officer's view of income and bank detail (sql/054): the last three |
| `income-summary-card.tsx` |  |
| `kyc-status-strip.tsx` |  |
| `letter-layout.tsx` |  |
| `loan-comparison-table.tsx` |  |
| `manager-decision-panel.tsx` |  |
| `manual-review-workspace.tsx` |  |
| `ml-risk-card.tsx` | E1: on the live site the inputs come from the database, worked out from the bureau and bank |
| `nach-mandate-form.tsx` |  |
| `notification-dropdown.tsx` |  |
| `officer-notes.tsx` |  |
| `otp-verification-step.tsx` |  |
| `override-panel.tsx` |  |
| `pointer-fx.tsx` |  |
| `policy-verdict-card.tsx` |  |
| `policy-violation-alert.tsx` |  |
| `portfolio-quality.tsx` |  |
| `rate-card-picker.tsx` |  |
| `rate-grid-versions.tsx` |  |
| `repayment-progress.tsx` |  |
| `risk-matrix.tsx` |  |
| `risk-score-explainer.tsx` | waterfall: base rate -> each contribution -> final probability |
| `scheme-card.tsx` |  |
| `score-gauge.tsx` |  |
| `settings-defaults.tsx` |  |
| `shortcut-overlay.tsx` |  |
| `skeleton-loaders.tsx` |  |
| `sla-timer.tsx` |  |
| `stat-card.tsx` |  |
| `status.tsx` |  |
| `theme-toggle.tsx` |  |
| `transaction-table.tsx` |  |
| `vehicle-info-card.tsx` |  |

### src/components/character

The cartoon car that reacts on customer pages.

| File | Note |
|---|---|
| `CarCharacter.tsx` |  |
| `README.md` | CarCharacter |
| `character.css` |  |
| `companion.tsx` | Spread on any private input (OTP, PAN, Aadhaar, passwords): the car looks away while it is focused. */ |
| `events.ts` | What the customer did → how the car reacts. One place to change behaviour |
| `expressions.ts` |  |

### src/components/landing

The public landing page sections.

| File | Note |
|---|---|
| `audience-popup.tsx` | The chooser no longer opens by itself on page load (3 Oct 2026): decks are in |
| `dot-field.tsx` | Interactive dot field for the hero. |
| `footer.tsx` |  |
| `hero.tsx` |  |
| `landing.css` |  |
| `loan.ts` | Tenure is capped by both the CIBIL band and the employer category, so the |
| `rates-section.tsx` |  |

### src/components/onboarding

Customer onboarding pieces: document upload, shell.

| File | Note |
|---|---|
| `document-upload.tsx` | The customer's upload boxes: the documents step (step 3) and, after submitting, |
| `shell.tsx` | The four customer steps (Sameer, 27 Sep 2026). |
| `start-step.tsx` |  |

### src/components/policy

Policy and rule editing parts.

| File | Note |
|---|---|
| `change-details.tsx` | Before/after and history for a policy version (backlog CC4.2). |
| `engine-decision-card.tsx` | What the rules engine said about this case (backlog FD4.5). |
| `impact-panel.tsx` | What a proposed change would do to recent applications (backlog CC3.2). |
| `pending-change.tsx` | One policy change waiting for approval: what it is, what it would do, and the |
| `policy-control.tsx` | Credit control view of the Policy Rules screen (backlog CC2.1). |

### src/components/ui

Base UI kit (shadcn/ui): buttons, dialogs, inputs, tables.

46 files: `accordion.tsx`, `alert-dialog.tsx`, `alert.tsx`, `aspect-ratio.tsx`, `avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button.tsx`, `calendar.tsx`, `card.tsx`, `carousel.tsx`, `chart.tsx`, `checkbox.tsx`, `collapsible.tsx`, `command.tsx`, `context-menu.tsx`, `dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `form.tsx`, `hover-card.tsx`, `input-otp.tsx`, `input.tsx`, `label.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `popover.tsx`, `progress.tsx`, `radio-group.tsx`, `resizable.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`, `slider.tsx`, `sonner.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `toggle-group.tsx`, `toggle.tsx`, `tooltip.tsx`

### src/hooks

Shared React hooks: keyboard shortcuts, phone layout, idle sign-out.

| File | Note |
|---|---|
| `use-keyboard-shortcuts.ts` |  |
| `use-mobile.tsx` |  |
| `use-session-timeout.ts` | The limit comes from the person's role at sign-in (036): 15 minutes for |

### src/lib

App logic with no screen: database calls, auth, engine, document checks, calculators, PDF makers.

| File | Note |
|---|---|
| `aadhaar-validator.ts` | Aadhaar validator with Verhoeff checksum algorithm |
| `agreement-generator.ts` |  |
| `api.ts` |  |
| `auth.ts` | Six roles from the access policy, plus two older ones kept until their users |
| `aws-doc-api.ts` | AWS Document Extraction API client. |
| `bank-statement-analysis.ts` |  |
| `bank-statement-parser.ts` | Parses Indian date formats: DD/MM/YYYY, DD-Mon-YYYY, DD-Mon-YY |
| `bureau-score-interpreter.ts` | Bureau Score Interpreter |
| `cam-data-assembler.ts` |  |
| `cashflow-analyzer.ts` |  |
| `ccr-parser.ts` |  |
| `customer-api.ts` | Customer onboarding (sql/043). Every call acts only on the signed-in |
| `customer-data.ts` |  |
| `doc-pdf.ts` | cercit's document maker. Every PDF the app hands out goes through here, so |
| `document-orchestrator.ts` |  |
| `document-store.ts` | Where customer documents are stored (decision 27 Sep 2026): Amazon S3 in |
| `employer-api.ts` | Employer Master (sql/069, fix list G4 and C9). Every read and change goes |
| `engine-api.ts` | The rules engine on AWS, for one application (backlog FD4.5). |
| `engine.ts` |  |
| `error-capture.ts` | Captures the original Error out-of-band so server.ts can recover the stack |
| `error-page.ts` |  |
| `feature-flags.ts` | Module switches (sql/015). A new module stays hidden until its switch is on. |
| `feedback-api.ts` | Sign-out feedback (086, 087). Every field is optional; at least one answer must be given. */ |
| `format.ts` |  |
| `indian-date-utils.ts` |  |
| `legacy-letters.ts` | PDFs for the staff letter pages that work from the older Application shape |
| `loan-api.ts` | After approval (sql/049): the loan offer and KFS, the agreement, the EMI |
| `loan-docs.ts` | The customer's loan documents, built from the database rows (sql/049) for |
| `lovable-error-reporting.ts` |  |
| `ltv-calculator.ts` |  |
| `ml-features.ts` |  |
| `mock-data.ts` |  |
| `models-api.ts` | Risk model governance (sql/093, fix list R9): inventory, saved scores, |
| `onnx-inference.ts` | Browser-side ONNX Runtime wrapper for the cercit XGBoost risk model. |
| `org-api.ts` | What the footer and legal page show. Anyone may read it (041). */ |
| `pan-validator.ts` | PAN (Permanent Account Number) Card Validator |
| `permissions.ts` | What the signed-in person may do (fix list B1, B3). Read once from the |
| `policy-api.ts` | Credit control: reading the policy in force and moving a change through |
| `policy-rule-engine.ts` | -- Week 3 additions (industry inputs, Sep 2026) -- |
| `pricing-api.ts` | Rate grid versions (sql/071, fix list G3): drafts, approval by a second |
| `risk-score-model.ts` | ML Risk Scoring Model |
| `roles-api.ts` |  |
| `sample-pack.ts` | Sample documents for demo visitors (fix list L1, approved 22 Oct 2026). |
| `shell-api.ts` | Live figures for the staff page frame (fix list A1, A2, A6). These replace numbers |
| `staff-customer-api.ts` | Staff side of customer applications (sql/047). The database checks the |
| `supabase.ts` |  |
| `theme.css` |  |
| `transaction-categorizer.ts` |  |
| `users-api.ts` | One row on the Users screen. */ |
| `utils.ts` |  |
| `workflow.ts` |  |

### src/routes

One file per page. The file path is the URL.

| File | Note |
|---|---|
| `README.md` | Routes |
| `__root.tsx` |  |
| `application-status.tsx` |  |
| `apply.tsx` | The old one-page apply form saved nothing. Every "Apply" and "Start your |
| `approvals.tsx` | Approval inbox (backlog CC4.1): every policy change waiting for sign-off, split |
| `audit-log.tsx` |  |
| `check-eligibility.tsx` |  |
| `dashboard.tsx` |  |
| `document-checks.tsx` |  |
| `employers.tsx` |  |
| `index.tsx` |  |
| `legal.tsx` | Contacts and registration from the organisation settings (041), so the page matches what admins set. */ |
| `login.tsx` |  |
| `models.tsx` |  |
| `my-loan.tsx` |  |
| `onboarding.car.tsx` |  |
| `onboarding.details.tsx` |  |
| `onboarding.documents.tsx` |  |
| `organisation.tsx` |  |
| `policy-rules.tsx` |  |
| `portfolio.tsx` |  |
| `rate-grid.tsx` |  |
| `roles.tsx` |  |
| `users.tsx` |  |

### src/routes/applications

| File | Note |
|---|---|
| `index.tsx` |  |
| `new.tsx` |  |

### src/routes/applications/$id

| File | Note |
|---|---|
| `approval.tsx` |  |
| `index.tsx` |  |
| `manager-review.tsx` |  |
| `sanction.tsx` |  |

### src/routes/customer-applications

| File | Note |
|---|---|
| `$id.tsx` |  |
| `index.tsx` |  |

### tasks

Build task cards. `queue` = waiting, `done` = finished, `reports` = results.

73 files: `hermes-prompt.md`, `hermes-rules.md`, `hermes-runner.ps1`, `task-11.md`, `task-12.md`, `task-13.md`, `task-14.md`, `task-15.md`, `task-16.md`, `task-17.md`, `task-18.md`, `task-19.md`, `task-20.md`, `task-21.md`, `task-22.md`, `task-23.md`, `task-24.md`, `task-25.md`, `task-26.md`, `task-27.md`, `task-28.md`, `task-29.md`, `task-30.md`, `task-31.md`, `task-32.md`, `task-33.md`, `task-34.md`, `task-35.md`, `task-36.md`, `task-37.md`, `task-38.md`, `task-39.md`, `task-40.md`, `task-41.md`, `task-42.md`, `task-43.md`, `task-44.md`, `task-45.md`, `task-46.md`, `task-47.md`, `task-48.md`, `task-49.md`, `task-50.md`, `task-51.md`, `task-52.md`, `task-53.md`, `task-54.md`, `task-55.md`, `task-56.md`, `task-57.md`, `task-58.md`, `task-59.md`, `task-60.md`, `task-61.md`, `task-62.md`, `task-63.md`, `task-64.md`, `task-65.md`, `task-66.md`, `task-67.md`, `task-68.md`, `task-69.md`, `task-70.md`, `task-71.md`, `task-72.md`, `task-73.md`, `task-74.md`, `task-75.md`, `task-76.md`, `task-77.md`, `task-78.md`, `task-79.md`, `task-80.md`

### tasks/done

77 files: `task-100.md`, `task-101.md`, `task-102.md`, `task-103.md`, `task-104.md`, `task-105.md`, `task-106.md`, `task-107.md`, `task-108.md`, `task-109.md`, `task-110.md`, `task-111.md`, `task-112.md`, `task-113.md`, `task-114.md`, `task-115.md`, `task-116.md`, `task-117.md`, `task-118.md`, `task-119.md`, `task-120.md`, `task-121.md`, `task-122.md`, `task-123.md`, `task-124.md`, `task-125.md`, `task-126.md`, `task-127.md`, `task-128.md`, `task-129.md`, `task-130.md`, `task-131.md`, `task-132.md`, `task-133.md`, `task-134.md`, `task-135.md`, `task-136.md`, `task-137.md`, `task-138.md`, `task-139.md`, `task-140.md`, `task-141.md`, `task-142.md`, `task-143.md`, `task-144.md`, `task-145.md`, `task-146.md`, `task-147.md`, `task-148.md`, `task-149.md`, `task-150.md`, `task-151.md`, `task-152.md`, `task-153.md`, `task-154.md`, `task-155.md`, `task-156.md`, `task-81.md`, `task-82.md`, `task-83.md`, `task-84.md`, `task-85.md`, `task-86.md`, `task-87.md`, `task-88.md`, `task-89.md`, `task-90.md`, `task-91.md`, `task-92.md`, `task-93.md`, `task-94.md`, `task-95.md`, `task-96.md`, `task-97.md`, `task-98.md`, `task-99.md`, `task-sample.md`

### tasks/queue

4 files: `task-157.md`, `task-158.md`, `task-159.md`, `task-160.md`

### tasks/reports

2 files: `run-20260903-192212.json`, `run-20260903-193038.json`

### tests

Playwright browser tests (pages, roles, phone layout).

| File | Note |
|---|---|
| `phone-layout.spec.ts` | H4: the main pages on a phone (the "mobile" project, 375 px wide). Fails when |
| `role-pages.spec.ts` | H1: open every staff page as each role and fail on a page stuck loading, an |
| `site-audit.spec.ts` | The published demo is served under /CERCIT_autoloan; a local site is at the root. |

### tests/policy

Engine parity tests: the same cases through each engine must agree.

| File | Note |
|---|---|
| `fixtures-2026.09.json` | JSON data/config |
| `parity.mjs` | Parity check (backlog FD4.4): every saved scenario through today's browser |
| `run-unified.mjs` | Checks policy/credit-rules-2026.09.json (Zen) against the hand-written reference, |
| `unified-reference.mjs` | Hand-written reference for the unified credit rules (policy 2026.09). |

### tests/sql

Database tests: every migration loads into a local Postgres (PGlite) and the guards hold.

| File | Note |
|---|---|
| `harness.mjs` | Local Postgres (PGlite) with Supabase-like stubs, loaded with sql/NNN_*.sql. |
| `run.mjs` | SQL tests: every migration loads, and the policy / PII / switch guards hold. |
