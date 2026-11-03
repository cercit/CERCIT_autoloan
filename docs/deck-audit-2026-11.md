# Deck audit: bank/NBFC deck and tech deck (3 Nov 2026)

What this covers: `public/decks/bank-nbfc.html` (+ `cercit-bank-nbfc-deck.pdf`) and `public/decks/tech.html` (+ `cercit-tech-deck.pdf`), checked against `docs/design/brand-identity.md`, sections 2–4 of `docs/design/car-character-cercit-design.md`, and the repo as it stands today. The model to copy is `public/decks/investor.html` (rebuilt 3 Nov 2026).

All data in cercit is synthetic. Every figure below comes from a file in this repo; the file is named next to it.

## First, a correction to the brief

The brief says the old decks contain "22 database tables", "18 live screens", "0.91 AUC" and "40/40 scenarios". **They don't.** I searched both HTML files and both PDFs. Only "September 2026" (bank deck cover) is in them. The other four phrases are in older docs (`docs/build_log.md`, `docs/build_progress.md`, the LinkedIn drafts, `Documentation/README.md`), not in these decks. The decks still have stale numbers, just different ones. They are listed below.

## Facts that are true today

| Fact | Value | Source |
|---|---|---|
| Database tables | 102, all with row-level security | `Documentation/02-database-schema.md` |
| Migrations | 001–096 (096 = model_scores index) | `sql/` |
| Policy | version 2026.08, 16 rules, all on | `Documentation/04-scheme-design.md` |
| Rate grid | v1, in force since 1 Aug 2026; Approve 750–900 at 8.99%, Maybe 650–749 at 9.90%, Reject below 650 | same |
| Caps | Approve: LTV 120%, FOIR 50%, 96 months. Maybe: LTV 100%, FOIR 45%, 84 months. The employer category can tighten them | same |
| Risk model live | v2, XGBoost exported to ONNX, 18 inputs, runs in the browser | `public/models/cercit-risk-v2.meta.json` |
| Model results (v2) | AUC 0.741 on 4,249 test files (1.6% went 30+ days late); the formula's own ceiling is 0.764; Brier 0.0146 | `docs/risk-model-v2.md`, meta.json |
| Model training | 16,995 synthetic files; five-fold check shows grades in order: A 0.7%, B 1.2%, C 2.9%, D 9.5%, E 30.3% late | `docs/risk-model-v2.md` |
| The old 0.91 AUC | v1 (0.9085) on its own simple synthetic data; on today's realistic files v1 scores 0.754. **Don't quote 0.91** | `cercit-risk-v1.meta.json`, `docs/risk-model-v2.md` |
| AWS | 14 Lambda functions in `aws/template.yaml` (API Gateway, S3, Textract, Rekognition), Mumbai | `aws/template.yaml` |
| Audit trail | hash chain over audit_events (092), nightly copy to an S3 bucket with Object Lock (365 days, GOVERNANCE mode); live 23 Oct, 4,542 events chained | `sql/092_audit_chain.sql`, `aws/template.yaml`, `docs/fix-list.md` |
| PII key | PAN and mobile encrypted; key read from Supabase Vault (091), live 23 Oct | `docs/migration-run-log.md` |
| Model governance | inventory, saved scores, Admin kill switch (093), live 23 Oct | same |
| Routes | 26 route files in `src/routes/` (customer journey, staff console, policy, rate grid, models, audit log, roles, users) | `src/routes/` |
| Tests | 68 SQL test sections on a local Postgres (`tests/sql/run.mjs`); 40 policy scenarios (`scripts/test-cases/`); policy rule and parity tests (`tests/policy/`); 3 Playwright site specs (`tests/*.spec.ts`); 7 Python Lambda test files | repo |
| Compliance | "designed with RBI's rules in mind", not "RBI compliant". Compliance belongs to the lender | `docs/compliance-map.md` |

## Deck 1: cercit for banks and NBFCs (8 slides)

### (a) Brand problems

1. **Wrong logo files and placement.** Uses the PNG logos, not `logo-horizontal-{dark,light}.webp`. The logo sits top-right on every slide (44 px), not small bottom-right as in the investor deck.
2. **Wrong body font.** Body text is Public Sans; it should be Plus Jakarta Sans. Headings use Manrope (correct).
3. **Off-brand colours throughout.** Background `#F4F6FA` and `#EAEFF6` (should be `#F6F8FA`), text `#101B2E` (should be `#111826`), muted `#4A5568`/`#5F6B7E` (should be `#637185`), border `#DCE2EC` (should be `#DEE4EC`), cards `#FBFCFE` (should be `#FFFFFF`), primary `#2F5FD0` (should be `#2563EB`), pilot slide on `#1E4DB7` (not a brand colour), cover on `#101B2E` (should be `#0E141F` → `#102A54`).
4. **Footers have no source.** Most read only "cercit for banks and NBFCs · 02".
5. Name is lower-case "cercit" everywhere (correct). "CIBIL" is used for the bureau score; fine.

### (b) Stale or unsupported facts

1. **"September 2026"** on the cover. It's November 2026.
2. **Rule table is incomplete.** It shows the Approve band caps only (FOIR 50%, LTV 120%). The Maybe band has FOIR 45%, LTV 100%. It also doesn't name the policy version (2026.08) or the 16 rules.
3. **"~15 → ~5 min" and "25–40 → 60+ files a day"** are labelled "our estimate", but no file in the repo supports them. Drop them, or keep them only as clearly labelled pilot targets. The investor deck uses "25–40 memos a day" as founder experience; keep that framing.
4. **The compliance slide claims too much.** Under "RBI digital lending" it says "full audit trail" without the hash chain or the locked copy. It leaves out what isn't built (CKYC/video KYC, bureau reporting, AML; see `docs/compliance-map.md`). A credit head will ask.
5. **"200 applications at one branch, 8 weeks"** pilot scope isn't written down anywhere in the repo. The investor deck's plan is "shadow mode: cercit scores, the officer decides, results compared". Use that and mark the numbers as a proposal.

### (c) What the audience needs that's missing

Credit heads and COOs need these. **Missing:**
- **Pricing.** Rs 50,000 a month platform fee + Rs 150 per file + Rs 3 lakh onboarding, with a worked example.
- **The audit trail.** What one decision records (policy version, rule fingerprint, model version, reasons, officer), the hash chain, and the locked copy.
- **How it fits their policy, in detail.** Bureau bands, employer categories, the 16 rules by area, and maker-checker with an impact test.
- **An honest compliance map.** Built, built with gaps, not built, the lender's job.
- **Who does what during onboarding**, and what the lender must supply.
- **Limits stated plainly.** Simulated bureau, AA and KYC links; synthetic data only.

## Deck 2: tech deck (12 slides)

### (a) Brand problems

1. **No logo image at all.** The cover shows only the text "cercit · technical deck".
2. **Wrong fonts.** Body text is Public Sans (should be Plus Jakarta Sans). Pipeline labels use JetBrains Mono.
3. **Text below 24 px** on several slides: pipeline step text 21 px, tool names 18 px, zone notes 22 px, flow line 22 px, tags 20 px, footer 20 px.
4. **Off-brand colours.** Same drift as the bank deck (`#101B2E`, `#17243B`, `#2F5FD0`, `#F4F6FA`, `#DCE2EC`, `#4A5872`, `#8FB0FF`).
5. **No footers or sources** on any slide.

### (b) Stale or unsupported facts

| Deck says | True now | Source |
|---|---|---|
| 100 database tables | 102 | `Documentation/02-database-schema.md` |
| 87 migrations | 96 (001–096) | `sql/` |
| 9 AWS Lambda services | 14 functions | `aws/template.yaml` |
| 60 SQL test sections | 68 | `tests/sql/run.mjs` |
| 100 RLS policies, 460 functions, 204 checked functions, 2,050 applications, 635 loans | not stated in any current doc; counts change daily | — (drop) |
| Audit log "written by the database itself" | now also hash-chained with a nightly Object Lock copy (092, live 23 Oct) | `docs/fix-list.md` |
| PAN and mobile "encrypted at rest" | key now read from Supabase Vault (091) | `docs/migration-run-log.md` |
| Risk model: no results shown | v2 AUC 0.741 (ceiling 0.764), Brier 0.0146, grades in order | `docs/risk-model-v2.md` |

### (c) What the audience needs that's missing

CTOs need these. **Missing:**
- **SECURITY DEFINER functions.** The deck says "checked database functions" but never names the pattern or why: the browser never writes tables directly.
- **The hash-chained audit log and S3 Object Lock.**
- **The Vault key.**
- **Model governance.** Inventory, shadow scores, kill switch.
- **The test suites by name.** `tests/sql`, `tests/policy`, the Playwright specs, the Lambda tests, `npm run verify`.
- **Hosting.** React/Vite build deployed to GitHub Pages from `main`.
- **Less to drop.** The "how it was built" AI tool list is off-topic for a CTO evaluating the system and can go. The daily simulator slide can shrink into a limits slide.

## What the rebuild must do (both decks)

- Use the investor.html page shell (stage, prev/next, bar with Download PDF, script), 1920×1080 sections and inline styles.
- Embed `logo-horizontal-dark.webp` on dark slides and `logo-horizontal-light.webp` on light slides as data URIs. Small and bottom-right on light slides.
- Manrope for headings and Plus Jakarta Sans for body text, with brand tokens only.
- 10–12 slides, one idea each, and every text at least 24 px.
- Footers read "Deck name · NN · source".
- No investor ask and no equity.
- Every number taken from the table at the top of this file. No improvement estimates.
