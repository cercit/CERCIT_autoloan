# Fix list: to do all at once

Collected 2 Oct 2026 from that day's audit and discussion. Nothing here has been started. When Sameer says "go", work top to bottom: one commit per item, tests first where tests exist, and one Supabase step at the end if any SQL changed.

Each item has a size (S, M or L) and says whether it needs SQL (Sameer runs it) or an AWS deploy (Sameer's OK).

## Done

| Date | Items | Commits | Live? |
|---|---|---|---|
| 3 Oct | **Batch 1: A1–A6, B4.**<br>- real waiting-cases badge;<br>- the bell shows real events;<br>- the automation pill follows the switch;<br>- "Prototype data" only in sample mode;<br>- dashboard subtitle shows today and the user's branch;<br>- top search fills the Applications filter;<br>- read-only rules show On/Off labels | `1268a16`, `2e7abab` | Site: yes. The badge and bell need **060** run in Supabase |

## A. Numbers and text that are fake or fixed

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| A1 | **Applications "12" badge** is a fixed number in the code. Show the real count of cases waiting for this person, or remove it | `src/components/app-shell.tsx` (`badge: 12`) | S | — |
| A2 | **Bell "4"** comes from sample notifications in the code. Drive it from real events (new customer submissions, referrals waiting, offers accepted), or hide the bell until that exists | `app-shell.tsx` `SAMPLE_NOTIFICATIONS` | M | maybe SQL |
| A3 | "Prototype data: all figures are illustrative sample records" shows on the live site. Show it only in sample mode | `app-shell.tsx` | S | — |
| A4 | Dashboard subtitle "Wednesday workload — Chennai Region" is fixed. Use today's day and the user's region, or drop the region | `src/routes/dashboard.tsx` | S | — |
| A5 | **The search box at the top does nothing.** "Search by name, PAN, application ID…" is an empty box with no search behind it. Make it search cases (ID, name, last 4 of PAN) across both queues, respecting the role's rights | `app-shell.tsx`, a search function | M | SQL |
| A6 | **"Automated Underwriting: Active" is fixed text** with a pulsing green dot. Tie it to the real switch (document_auto_settings / auto credit checks) so it says Off when automation is off | `app-shell.tsx` | S | — |

## B. What each role can see and do on the site

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| B1 | **The menu ignores rights**: all 15 items show for every role. Read the signed-in person's rights once and hide pages they can't open. This also covers Approvals showing for officers and managers when Credit control is on | `app-shell.tsx`, new `fn_my_permissions` (or reuse `fn_my_account`) | M | SQL if a new function |
| B2 | **Officers see every case.** Apply "own cases only" (`app.view.own`) to the Applications list and the customer queue. Decide first whether officers see unassigned cases too | `fn_list_applications`, `fn_staff_customer_queue` | M | SQL |
| B3 | Buttons for actions a role can't take (decide, issue offer, disburse, edit rules) still show and error after a click. Hide or disable them using the same rights | case screens, Document checks | M | — |
| B4 | On Document checks, the demo visitor's locked switches look on and clickable. Make read-only obvious | `src/routes/document-checks.tsx` | S | — |
| B5 | **Daily case limit and sanction limit** are saved on a user (Users page) but never enforced. Enforce it on decisions, and decide whether to add amount limits by role (a policy decision) | `fn_officer_decision` | M | SQL + decision |

## C. Broken pages and hidden failures

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| C1 | **Audit Log is empty for everyone live** (fixed as part of G6): it reads `audit_trail`, which doesn't exist. Point it at `audit_events` (with the privacy rule for real customers) and show errors instead of an empty page | `src/lib/api.ts` `getAuditLog` | M | maybe SQL |
| C2 | **Pages fall back to sample data on an error**, so fake cases can look real: Applications list, one application, bureau report, rate grid, employers. Show the error instead; keep samples for sample mode only | `src/lib/api.ts` | M | — |
| C4 | **Applications is slow to open** (reported by Sameer 2 Oct). Likely causes, to measure first:
(1) the list loads all ~2,012 cases at once, 2,000 of them synthetic, with no paging;
(2) it then asks for engine decisions by sending all 2,012 IDs in one request, which makes a very long address and may fail;
(3) each row is checked one by one in the browser;
(4) opening one case makes about 6 separate calls (case, bureau, bank, timeline, extractions, transitions).
Fix: page the list (e.g. 50 at a time, with search done in the database), fold the engine decision into `fn_list_applications`, and load the case's tabs only when opened. Measure before and after | `src/lib/api.ts` `getApplications`, `fn_list_applications`, `src/routes/applications/` | M | SQL |
| C5 | **Application Review never loads on the live site** (reported by Sameer 2 Oct). Cause (checked read-only against the live database): the page reads the `customers` and `obligation_details` tables directly, but signed-in staff have no read right on either; both were locked down for privacy (PII encryption and the customer privacy rules). The request fails; the code then looks for the case in the sample data, finds nothing, and the page stays on "Loading application…" with no error. Fix: one staff function (like `fn_list_applications`) that returns the case with masked PAN and mobile and keeps the real-customer rule, and a clear error message instead of endless loading. Check the bureau, bank and timeline tabs for the same problem | `src/lib/api.ts` `getApplication`, `src/routes/applications/$id/index.tsx`, new SQL function | M | SQL |
| C6 | **Loan portfolio doesn't load on the live site** (reported by Sameer 2 Oct). Likely cause: it's too slow. The database stops a signed-in user's request after 8 seconds, and the page replays the repayment history of all 628 loans, one loan at a time, on every visit. A read-only timing check from here also didn't finish. Fix: work out each loan's overdue status once a day (or when a payment is recorded) into a small summary table, and have the page read that. Show a clear error if it still fails. The dashboard's Portfolio quality box uses the same function, so it's fixed with it | `sql/058` `fn_staff_loan_portfolio`, new summary table | M | SQL |
| C7 | **Policy Rules shows made-up rules on the live site.** "Minimum CIBIL for auto approval 750", "New to credit (-1)" and "Last updated 28 Aug 2026 by Anand Gopal" are sample data. The real rules (e.g. BUR-SCORE-MIN 650) weren't loaded: the read failed or came back empty, and the page fell back to samples without saying so. Edit and Deactivate act on those samples. Fix: load the real rules (and the version in force), remove the fixed "Last updated" line, and show an error instead of samples. Part of C2, listed alone because it's misleading | `src/lib/api.ts` `getMappedPolicyRules`, `src/routes/policy-rules.tsx` | M | maybe SQL |
| C8 | **Employer categories A/B/C are shown but never used or checked** (from Sameer's question "do we need it?": yes, because the price and the limits depend on it). The Rate Grid page shows real data: base rates 8.99% / 9.90%, and category loading of +0.40% for B and +1.25% for C, with each category's own LTV cap (120/110/90%), tenure cap (84/84/60 months) and processing fee (₹5,000 / 6,500 / 8,000). But:<br>(1) customers are recorded as GOVERNMENT, PSU, MNC, PUBLIC_LTD or PRIVATE_LTD, never as A, B or C, so nothing links a customer to a category;<br>(2) the engine prices on the score band alone, so the loading, the category LTV and tenure caps and the processing fee are never applied (the engine's own comment notes this gap);<br>(3) nothing verifies the category. To build: an employer master lookup (name → category, with GST/CIN), checks that a company is listed or has 3+ years of filings (MCA) for B, and government/PSU proof from the employer ID or payslip; then set the category on the case, apply the loading, caps and fee in the engine, and show it on the officer's card.<br>Also list, field by field, what the customer enters at step 4 but nothing checks (e.g. marital status, residence type, years at the employer), and decide which need a check | `fn_generate_recommendation`, `employer_category_pricing`, Employer Master, document checks (052) | L | SQL + decisions |
| C9 | **Employer Master shows car makers, not employers.** The page reads the `dealers` table and relabels each car maker as an employer: every one shows "Category B" (fixed in the code), and "Verification Date" is always today. Nothing on it is a real employer or a real check. Fixed by G4 | `src/lib/api.ts` `getEmployers`, `src/routes/employers.tsx` | — | see G4 |
| C10 | **Dashboard numbers likely broken on the live site** (found 3 Oct while building A1). The dashboard's stats, turnaround and decision trend read the `applications` table directly, but signed-in staff have no read right on it (checked: `has_table_privilege('authenticated','applications','SELECT')` is false). The figures will be empty or zero. Fix like 060: one staff function returning the dashboard figures, with the synthetic and real-customer rules | `src/lib/api.ts` `getDashboardStats`, `getDashboardTat`, `getDecisionTrend`, `getDecisionDistribution` | M | SQL |
| C3 | Three old capitalised roles (ADMIN, CREDIT_OFFICER, STATE_HEAD) are still in the roles table: switched off, no rights, no users. Remove them or mark them retired | `roles` table | S | SQL |

## D. Practice logins for visitors (needs Sameer's go on the design)

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| D1 | Three practice roles: **Practice Officer / Manager / Head**. They do the real jobs, but only on synthetic customers. They never see real customers or full PAN or mobile. The Head can draft and simulate policy, but can't make it live, change models or manage users | new migration, role guard like 042 | L | SQL |
| D2 | A reset step that puts the synthetic customers back to fresh after visitors use them | SQL function (operator only) | S | SQL |
| D3 | "Try as Officer / Manager / Head" buttons on the login page. Sameer creates the three logins in Supabase himself; Claude can't create accounts or set passwords | `src/routes/login.tsx` | S | Sameer: 3 logins |

## E. Model and data follow-ups

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| E1 | **The live risk score still reads the older application fields.** Feed it the new bureau and bank detail (053, 054) the model was trained on | `src/lib/ml-features.ts`, a feature RPC | M | maybe SQL |
| E2 | The local export of synthetic customers slows down as it grows (34 s for the first batch, about 11 min by batch 36). Find the slow query in the generator before the next big run | `sql/055`, PGlite | S | — |

## G. New features

| # | Feature | Where | Size | Needs |
|---|---|---|---|---|
| G1 | **Save today's settings as the defaults, and reset all settings in one click** (asked by Sameer 2 Oct). It covers settings only, never applications, customers, documents, loans or their statuses.<br>**Saved:** the switches, Document checks (automation, which documents are accepted on their own, every check's on/must-pass/limit/if-it-fails), organisation and security settings, rate grid and employer-category pricing, bureau switches (5% card rule and the rest), roles and their rights, and the active risk model.<br>**How:** a `settings_baselines` table holds a named snapshot; the first is "Defaults 2 Oct 2026". "Reset to defaults" is admin only, needs a typed confirmation, shows what will change before it changes anything, and writes one audit entry.<br>**Credit policy versions** are approved history and can't be overwritten; a reset puts the baseline back through the approval flow as a new version, or through the emergency route, per Sameer's call. | new migration, Organisation page (button), audit | L | SQL + 1 decision |
| G2 | **Policy Rules: an on/off switch for each rule, plus a Modify button** (asked by Sameer 2 Oct, with a screenshot). Replace the "Edit / Deactivate" text links with a switch (on = active) and a "Modify" button that opens the rule's limit and action. Changes must go through the policy versioning and approval already built (draft → approve → live on a date), not change the live rule straight away. Only roles with policy.author see the controls; others see the switch read-only. Do after C7, so the page shows real rules | `src/routes/policy-rules.tsx`, the policy draft functions (024) | M | — |
| G3 | **Rate Grid: edit and add grids** (asked by Sameer 2 Oct, with a screenshot). An Edit option on the Rate Grid page for each band's rate and max FOIR, and each category's loading, LTV cap, tenure cap and fee. Also: add a new band row, and add a new grid for another product or segment (e.g. commercial vehicles, three-wheelers, self-employed). Changes go through pricing approval, as policy does: a draft by someone with pricing.author, approved by someone with pricing.approve (not the same person), live from a date. Old grids are kept, so each decision shows the rate grid in force. Export CSV stays | `src/routes/rate-grid.tsx`, new pricing draft functions, `rate_grid` versioning | L | SQL |
| G4 | **A real Employer Master, with checks behind each field** (Sameer: "do we need it?" Yes: it's what C8 needs to set Category A/B/C, the rate loading, LTV and tenure caps and fees, and it saves officers re-checking the same company).<br>**Fields:**<br>- employer name and the other names it appears under on payslips;<br>- CIN (company number) and GSTIN;<br>- type (government / PSU / listed / MNC / private limited / LLP / proprietorship) and the resulting category A/B/C;<br>- listed on NSE/BSE (yes/no);<br>- date of incorporation and years of filings;<br>- company status (active / struck off / under insolvency);<br>- official email domains;<br>- industry;<br>- head-office city and state;<br>- caution or negative list flag, with a reason;<br>- how many cases came from it, and the late rate on its loans;<br>- last verified on, by whom, and the source of each check.<br>**Checks to build (simulated first, like the bureau, with a switch for a real provider later):**<br>- CIN lookup at MCA (exists, active, incorporation date, years of filings, so B needs 3+ years);<br>- GSTIN format and status;<br>- listed-company check against the NSE/BSE list;<br>- government/PSU check against a maintained list;<br>- official email domain check (the customer's work email matches the employer's domain);<br>- name match between payslip, Form 16 (TAN/deductor name) and the master, using the readers we already have;<br>- caution-list check that sends the file to a person.<br>**Screens:** list and search, add and edit (needs a new right, e.g. employer.manage, with a second person to approve a category change), and the employer shown on the officer's case card | new `employers` table + functions, `src/routes/employers.tsx`, engine (C8) | L | SQL |
| G5 | **Users page: admin only, admin creates the login with a password, and the person gets an email with their user ID and password** (asked by Sameer 2 Oct, with a screenshot of Add user).<br>**Admin only:** the database already allows only Admin to add or change users (user.manage). The page and menu item must also be hidden from everyone else (B1).<br>**Create with a password:** today Add user only sends a sign-in code, and the person has no password. Creating a Supabase login with a password needs the service key, which must never be in the browser, so this runs in a small AWS function (or a Supabase Edge Function) that checks the caller is an Admin.<br>**Email:** sent automatically on creation (AWS SES), with the sign-in page link and the user ID (email). Recommended over mailing a permanent password: a **temporary password that must be changed at first sign-in and expires in 24 hours**, or a "set your password" link. A password in an email can be read by anyone who sees the inbox. Sameer to choose.<br>**Also:** a "Resend" and "Reset password" action per user, every create and reset written to the audit log, and the sanction limit and cases-per-day on this form actually enforced (see B5) | `src/routes/users.tsx`, new admin-create function (AWS or Edge), SES, `fn_admin_save_user` | L | SQL + AWS deploy + 1 decision |
| G6 | **Audit Log rebuilt: date, time, user and activity, with date filters** (asked by Sameer 2 Oct). The live database already holds 4,103 audit events of 18 types (`audit_events`: when, who, what, which case, details). The page just reads the wrong table (C1).<br>**Columns:** date, time (IST), user (name and role, or "System" / "Customer"), activity in plain words (e.g. "Approved application", "Changed a document rule", "Signed in"), the case it relates to (with a link), and details.<br>**Filters:**<br>- date: today, last 7 days, this month, or a from–to range;<br>- user;<br>- activity type;<br>- case number;<br>- free-text search.<br>**Also:** pages of 50 (the log will grow), newest first, Export CSV of the filtered list, and one combined log that also brings in policy and rate changes, role and user changes, switch changes and case stage changes (they sit in their own history tables today).<br>**Who sees it:** people with audit.view (Admin, Credit Manager, Credit Head, Compliance, Policy Manager). Real-customer rows only for those who may see real customers. Read only: no one can edit or delete an entry | `src/routes/audit-log.tsx`, `src/lib/api.ts` `getAuditLog`, a new `fn_audit_log(filters)` | M | SQL |
| G7 | **Daily simulation: the book keeps moving by itself** (asked by Sameer 2 Oct). It runs inside Supabase every day with its scheduler (`pg_cron`, available on the project but not yet switched on). Each day:<br>(1) **10 new synthetic leads** come in through the same generator (055) and go through the real journey: some stay drafts, some are submitted, and the rest are assessed by the engine and approved, referred or declined;<br>(2) newly **approved final cases are disbursed** (056 logic), with today as the disbursal date;<br>(3) **every synthetic instalment due today gets a payment**: most are paid on the due date; a few bounce and are paid a few days later; a small share run 31–60 days late; and a few stop paying and become **NPA (90+ days)**, with weaker profiles more likely to slip, as in 056;<br>(4) loans that reach their last instalment close.<br>Fixed seeds per day, so a day can be replayed. It touches only SYNTHETIC records, never real customers. It writes a short daily summary (leads, decisions, disbursals, paid, bounced, late, NPA) and refreshes the portfolio summary (C6).<br>**Marked as simulation everywhere:**<br>- function names start `fn_sim_`, the job is named `cercit-simulation-daily`, and every row it makes has origin SYNTHETIC (SYN… IDs, `@synthetic.invalid` emails, 5550 mobiles);<br>- one switch, `simulation_enabled` (on for cercit), stops it;<br>- a **REMOVE BEFORE REAL USE** note goes in the migration header, the README and a production checklist, with the one-line command to unschedule it and `fn_synthetic_purge()` to remove all its data.<br>For us it stays on, so the live demo always has fresh cases and a moving loan book | new migration (`fn_sim_daily`), `pg_cron` schedule, docs | M | SQL (Sameer switches on pg_cron in Supabase: Database → Extensions) |
| G8 | **"How cercit works" pack: flow charts, database schema, components** (asked by Sameer 2 Oct). Kept in `behind-the-scenes/how-it-works/`, written for a non-technical reader first, with technical detail underneath:<br>(1) **A flow chart for each stage:** customer onboarding (steps 1–4) → documents and automatic checks → bureau and income checks → policy engine and risk model → officer decision (in principle / final) → offer, agreement, mandate → disbursal → repayments, late and NPA → the daily simulation. Each shows who acts (customer, system, officer, manager), what is checked, the possible outcomes, and which screen and database function does it;<br>(2) **Database schema:** an entity diagram of the main tables grouped by area (customers and applications, documents, bureau, income and bank, decisions and policy, pricing, loans and repayments, users and roles, audit), with what each table holds and how they link, plus a list of every migration 001–059+ and what it added;<br>(3) **Components and platforms:** the website (React, GitHub Pages), the database (Supabase Postgres with its rules and privacy policies), the AWS document service (S3, Lambda, Textract, Rekognition), the risk model (XGBoost → ONNX running in the browser), the policy engine, the simulators (bureau, income, synthetic customers, daily run), and the tests (PGlite SQL tests, Lambda tests). For each: what it does, what it talks to, and where the code lives;<br>(4) **Behind-the-scenes functions:** a plain-English list of the key database functions by stage (what each does, who may call it);<br>(5) one **overview page** linking them all, and a short glossary (FOIR, LTV, DPD, NPA, PAR, no-hit).<br>The diagrams are drawn as Mermaid (renders on GitHub) and generated from the real schema where possible, so they don't drift from the code. Built last, so it includes everything on this list. Optionally also published as a shareable web page | `behind-the-scenes/how-it-works/`, existing `docs/application_flow.md`, `docs/current_state_workflow.md`, `docs/design/` | L | — |

## H. Not checked yet, and suggestions (added 2 Oct)

| # | Item | Why | Size | Needs |
|---|---|---|---|---|
| H1 | **Click-through check of every page with each role** (Officer, Manager, Head, Admin, Demo): an automated Playwright run that opens each page as each role and fails on "stuck loading", an error, or sample data on the live site | Would have caught C5, C6, C7 and C9 before Sameer did. Run it after every fix batch | M | test logins |
| H2 | **Same audit on the customer side**: onboarding steps 1–4, documents, tracking page, My loan (offer, agreement, mandate) | Only the staff side was audited on 2 Oct | M | — |
| H3 | **Run Supabase's security and performance advisors** (built-in checks for missing rules, open tables and slow queries) and fix what they flag | Free and quick; likely finds more like C5 and C6 | S | — |
| H4 | **Phone layout check** of the main pages | Visitors will open the demo on phones | S | — |
| H5 | **Error alerts**: an email when an AWS reader fails or the daily simulation (G7) doesn't run | Today failures are silent until someone notices | S | AWS deploy |
| H6 | **Data protection basics (DPDP Act)**: delete a real customer's documents and data on request, and set how long documents are kept. Start by deleting Sameer's test documents (to-do item 7) | Real personal data is already in the system (4 customer-journey cases) | M | SQL + AWS |
| H7 | **Backup**: a weekly export of the settings and policy tables (cheap insurance for G1) | Supabase's free plan keeps only a short backup window | S | — |
| H8 | **Remove leftover test scripts and sample code** once C2 and C7 are done (mock data used only in sample mode) | Less risk of fake data showing again | S | — |

## Time needed

My working time, building and testing; it doesn't include Sameer running the SQL, giving decisions, or testing on the live site. Roughly:

| Batch | Items | Time |
|---|---|---|
| 1. Quick visible fixes | A1–A6, B4 | 3 h |
| 2. Pages that don't work | C5, C6, C7, C1/G6, C2, C4 | 12 h |
| 3. Rights on the site | B1, B3, then B2, B5, C3 (one SQL step) | 7 h |
| 4. Employers and pricing | G4, C9, C8, G3 | 18 h |
| 5. Rules page controls | G2 | 3 h |
| 6. Practice logins | D1–D3 | 5 h |
| 7. Users with passwords and email | G5 | 5 h |
| 8. Daily simulation | G7 | 4 h |
| 9. Settings defaults and reset | G1 | 5 h |
| 10. Model follow-ups | E1, E2 | 5 h |
| 11. Checks and safety | H1–H8 | 12 h |
| 12. How-it-works pack | G8 | 6 h |
| **Total** | | **about 85 hours** |

That's about **10–12 working days** at the usual pace (commit per step, usage limits), or **3 weeks of evenings**. Batches 1–3 (about 22 h, 3 days) make the live site honest and usable, and are worth doing first even if the rest waits.

## F. Not bugs: production notes only (no work now)

- **R16:** the continue link while the SMS code is simulated.
- **R19:** the PDF library's AGPL licence.
- **R23:** the demo e-sign, mandate and email stand-ins.
- **R24:** the demo schedule of charges.
- **V14:** maker-checker needs two different people.

## Suggested order

1. **A1–A4 and B4:** quick, visible, no SQL.
2. **C5, C6, C7, C10, C1, C2 and C4:** make Application Review open, stop showing empty or fake data, and make Applications fast. C5 first: the page is unusable today.
3. **B1 and B3:** the menu and buttons follow rights.
4. **B2, B5 and C3:** one SQL step.
5. **D1–D3:** practice logins, after the "go".
6. **E1 and E2.**
7. **G2:** switches and Modify on Policy Rules (after C7).
   **G3:** Rate Grid edit and add grids. **G4 + C8 + C9:** Employer Master, then employer category checks and pricing (pairs with G3).
8. **G6:** Audit Log with date, time, user, activity and date filters (fixes C1).
9. **G5:** admin creates users with a password and an automatic email (after B1).
10. **G7:** daily simulation (after C6, so the portfolio reads a summary that the daily run refreshes).
11. **G1:** settings defaults and reset.
12. **G8:** the "How cercit works" pack (last, so it describes the finished system). Best done after D, so the practice roles are in the saved defaults.

The detail behind A–C is in `rights-and-visibility-audit-2026-10-02.md`.
