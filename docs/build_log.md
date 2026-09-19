# cercit build log

The platform is being rebuilt module by module on top of this codebase. The current site keeps working throughout: each new piece is built beside the old one behind a feature switch, switched on once it passes its checks, and the old piece is then removed.

## The loop

1. **Pick** the next task from the backlog (one at a time).
2. **Develop** on a branch.
3. **Test** — `npm run verify` (typecheck, the 40 policy scenarios, and the SQL tests on a local Postgres), plus the module's own tests.
4. **Integrate** — merge to `main` with the feature switch off.
5. **Go** — switch on, check it by hand, deploy.
6. **Retire** — delete the code the new piece replaced.
7. **Record** — add an entry below.

A task is done when its code is merged, tests pass, it is deployed with its switch on, and the old path is removed (or listed for removal at the end of its module).

## Branches and migrations

- Branch: `mod/<task-id>-<short-name>`, e.g. `mod/fd0.1-feature-flags`
- Commit message starts with the task ID, e.g. `FD0.1: add feature_flags table`
- Migrations are new numbered files in `sql/` (next free number: 021). Run `npm run test:sql` before running any of them in Supabase. They are reviewed and run by hand in the Supabase SQL editor; never edited after they have been run.
- This repository is public. Keys, passwords, provider credentials and security review findings never go in it; they live in Supabase / AWS secret stores and private notes.

## Build order

| Stage | Weeks | Modules |
|---|---|---|
| Ground | 1 | Decisions, checks, pending migrations |
| Foundation | 2–5 | Feature switches, versioned rule values with approvals, server-side permission checks, one server-side decision engine |
| Admin | 6–7 | Users, roles, limits |
| Credit control | 8–10 | Policy and pricing changes with approval and impact check |
| KYC | 11–13 | Consent, KYC methods on mock providers, risk rating |
| Underwriting | 14–18 | Documents, bureau, bank data, model scoring, deviations |
| Sanction | 19–20 | Key Fact Statement, letters, notifications |
| Compliance | 21 | Audit trail, version on every case |
| Roof | 22–24 | Admin console, app split, review, deploy |

## Decisions

| Date | # | Decision |
|---|---|---|
| 17 Sep 2026 | 0.1 | FOIR stays as the database engine computes it: net salary + other income |
| 17 Sep 2026 | 0.2 | LTV stays as today: ex-showroom primary, on-road rule kept |
| 17 Sep 2026 | 0.3 | Demo login kept during the build; revisited later |
| 17 Sep 2026 | 0.4 | Server-side logic stays on Supabase |
| 17 Sep 2026 | 0.5 | Rules run in GoRules Zen (MIT) on a Python 3.12 AWS Lambda in `ap-south-1`, confirmed after evaluation 0.5a. Rule versions and approvals stay in our tables |
| 17 Sep 2026 | 0.6 | `tenant_id` added to tables from the start |
| 17 Sep 2026 | 0.7 | Hosting: Supabase + AWS `ap-south-1` |
| 17 Sep 2026 | 0.11 | Repository stays public (needed for the GitHub Pages demo) |
| 17 Sep 2026 | D1–D7 | Unified credit rules: age over 65 at maturity refers; FOIR over 50% refers; 1 bounce refers, 2+ decline; strict DPD with a referral for small old delays; one under-700 rule; missing data refers; all 24 rules from both engines kept |

## Entries

| Date | Task | What changed |
|---|---|---|
| 17 Sep 2026 | 0.1–0.8 | Week 1 decisions recorded; regulatory values for prepayment charges, KFS, Aadhaar OTP limits and penal charges checked against RBI sources |
| 17 Sep 2026 | baseline | 40/40 policy scenarios pass on `main` at `249a078` — the reference point for the engine parity test |
| 17 Sep 2026 | 0.5a | Rules engine evaluation: GoRules Zen and json-rules-engine both matched today's engine on 40 scenarios and 2,000 generated cases. Recommended Zen on a Python 3.12 Lambda in `ap-south-1`; Zen does not load in Supabase's Deno runtime. Details in `docs/engine-evaluation/` |
| 17 Sep 2026 | fix | Migration 012 would have failed on the required `customers.mobile` column; fixed and tested before anyone ran it |
| 17 Sep 2026 | FD0.1–FD0.3 | Tenants and module switches (015), `useFeature()` hook. Merged; switches take effect once 015 is run |
| 17 Sep 2026 | FD1.1–FD1.4 | Versioned, approved policy (016) with database guards, baseline 2026.08 seed (017), read functions, `npm run test:sql` (44 checks). Merged; waits for 015–017 to be run |
| 17 Sep 2026 | FD2.1–FD2.3 | Database permission checks (018, 019), API access narrowed, policy tables read-only through the API (020 — run when ready). `npm run test:sql` now 69 checks. Merged; waits for migrations to be run |
| 17 Sep 2026 | FD3.1 | 009 revised before first use: staff-only reads of loan data; no self-edits of users; audit notes only in the writer's own name |
| 17 Sep 2026 | FD4.1 | Rule engines compared; seven credit-policy decisions (D1–D7) needed before the unified rule set is written |
| 17 Sep 2026 | FD6.1, FD7.1 | Broken RPC helper removed; unused modules inventoried; `npm run verify` added and passing (typecheck clean, 40/40 scenarios, 82 SQL checks) |
| 17 Sep 2026 | FD4.2 | Unified 25-rule set written as a Zen model and stored as draft version 2026.09 (021). Zen and an independent hand-written copy agree on 40 scenarios and 3,000 generated cases; 3 scenario outcomes change as D2 and D4 intend. `npm run verify` now includes `test:rules` |
| 17 Sep 2026 | FD4.0 | SAM CLI 1.166.2 installed; `sam build` packages the Linux build of Zen |
| 17 Sep 2026 | FD4.3 | `cercit-policy-engine` Lambda (`aws/lambdas/policy_engine/`, `POST /evaluate`): loads the version in force through `fn_policy_document_at`, runs it in Zen, names the version and document hash in every answer, refuses missing facts, needs a signed-in user through the API. `npm run test:lambda` (needs `pip install zen-engine`): 2,040 cases for 2026.08 and 540 for 2026.09 match. Deployed 17 Sep to stack `cercit-pipeline` (`POST /prod/evaluate`); refuses unsigned requests; answers once migrations 015–017 are run |
| 17 Sep 2026 | CC1.1, CC1.2 | Policy change workflow (023): propose, withdraw, approve, reject, and the job that makes an approved version live on its date. The approver comes from the login, so nobody approves their own change; activation closes the outgoing version exactly where the new one starts. 30 new SQL checks, 120 in all |
| 18 Sep 2026 | CC2.1 | Policy Rules screen rebuilt behind the `credit_control` switch: settings in force shown read-only with the version and dates, a draft copied from the live version (024) whose values can be changed within their limits, and an approval queue that refuses your own change. The old direct toggles stay until the switch goes on. 20 new SQL checks, 140 in all |
| 18 Sep 2026 | CC3.1 | Impact check (025 + `POST /simulate`): recent real applications run through a proposed version and the version in force, and the result stored against the version. The facts sent to AWS are numbers and yes/no answers only — no name, PAN or mobile. 11 SQL checks and 12 Lambda checks added |
| 18 Sep 2026 | CC3.1 fix | First live impact check skipped all 8 applications and still reported "nothing would change": facts with no value were stripped out, and the engine needs every fact it reads to be present. 026 keeps them as null, and the engine now names which fact was missing and refuses to report a result when nothing could be evaluated |
| 18 Sep 2026 | review | Nine defects found by a multi-agent review of Credit control, all fixed (027 + screens + Lambda): two changes approved for the same moment would have jammed activation for good; the impact check invented a 6-month delay from a 12-month figure, invented months 7-12 from a 24-month count, and treated an unknown EMI as nothing owed; impact figures could be written by hand through the API; the engine's own key bypassed the caller's rights on /simulate; every setting edit was rejected because percentages were sent as text; one author's draft was adopted by another; the old one-click rule switches appeared while the module switch was still loading. 14 new SQL checks (178) plus new Lambda checks |
| 18 Sep 2026 | CC3.1 | The first honest impact run reported affordability as "not known" for every application: the EMI was read from the application's indicative figure, while the EMI an assessment settles on sits on the recommendation and the sanction. 028 reads the sanctioned, else recommended, else indicative figure, and the assessment's own FOIR and LTV where recorded |
| 19 Sep 2026 | repayment | Repayment history (029), designed with Sameer: the unit is a payment attempt, not a month, because one installment can be cleared by several receipts after a failed mandate. Each installment has a fixed due day; it is cleared on the date the money adds up to the amount due, and days late runs from due date to that date. A receipt tagged to an installment goes to it; untagged money pays the oldest arrears first. A shortfall within a tolerance (100 rupees until a policy version carries the setting) is not a delay (decision: 14,999 of 15,000 on time is on time). Answers the rules that were "not known": a delay in the last 6 months, a 1-30 day delay in months 7-12, 60+ ever, 90+ in 12 months. Also the realised IRR from actual payment dates, for pricing. Tested on Sameer's worked example (30/60/90 days late, Apr 1 rupee short) |
| 19 Sep 2026 | decision | Document reading costs parked until the build ends (review around 18 Mar 2027): compare Textract with a free stack (pdfplumber for digital PDFs, RapidOCR for scans) on synthetic documents before changing anything. Details in the Vault backlog |
