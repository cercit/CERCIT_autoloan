# Fix list: to do all at once

Collected 2 Oct 2026 from that day's audit and discussion. Nothing here has been started. When Sameer says "go", work top to bottom: one commit per item, tests first where tests exist, and one Supabase step at the end if any SQL changed.

Each item has a size (S, M or L) and says whether it needs SQL (Sameer runs it) or an AWS deploy (Sameer's OK).

## A. Numbers and text that are fake or fixed

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| A1 | **Applications "12" badge** is a fixed number in the code. Show the real count of cases waiting for this person, or remove it | `src/components/app-shell.tsx` (`badge: 12`) | S | — |
| A2 | **Bell "4"** comes from sample notifications in the code. Drive it from real events (new customer submissions, referrals waiting, offers accepted), or hide the bell until that exists | `app-shell.tsx` `SAMPLE_NOTIFICATIONS` | M | maybe SQL |
| A3 | "Prototype data: all figures are illustrative sample records" shows on the live site. Show it only in sample mode | `app-shell.tsx` | S | — |
| A4 | Dashboard subtitle "Wednesday workload — Chennai Region" is fixed. Use today's day and the user's region, or drop the region | `src/routes/dashboard.tsx` | S | — |

## B. What each role can see and do on the site

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| B1 | **The menu ignores rights**: all 15 items show for every role. Read the signed-in person's rights once and hide pages they can't open. This also covers Approvals showing for officers and managers when Credit control is on | `app-shell.tsx`, new `fn_my_permissions` (or reuse `fn_my_account`) | M | SQL if a new function |
| B2 | **Officers see every case.** Apply "own cases only" (`app.view.own`) to the Applications list and the customer queue. Decide first whether officers see unassigned cases too | `fn_list_applications`, `fn_staff_customer_queue` | M | SQL |
| B3 | Buttons for actions a role can't take (decide, issue offer, disburse, edit rules) still show and error after a click. Hide or disable them using the same rights | case screens, Document checks | M | — |
| B4 | On Document checks, the demo visitor's locked switches look on and clickable. Make read-only obvious | `src/routes/document-checks.tsx` | S | — |
| B5 | **Daily case limit** is saved on a user but never enforced. Enforce it on decisions, and decide whether to add amount limits by role (a policy decision) | `fn_officer_decision` | M | SQL + decision |

## C. Broken pages and hidden failures

| # | Fix | Where | Size | Needs |
|---|---|---|---|---|
| C1 | **Audit Log is empty for everyone live**: it reads `audit_trail`, which doesn't exist. Point it at `audit_events` (with the privacy rule for real customers) and show errors instead of an empty page | `src/lib/api.ts` `getAuditLog` | M | maybe SQL |
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

## F. Not bugs: production notes only (no work now)

- **R16:** the continue link while the SMS code is simulated.
- **R19:** the PDF library's AGPL licence.
- **R23:** the demo e-sign, mandate and email stand-ins.
- **R24:** the demo schedule of charges.
- **V14:** maker-checker needs two different people.

## Suggested order

1. **A1–A4 and B4:** quick, visible, no SQL.
2. **C5, C6, C7, C1, C2 and C4:** make Application Review open, stop showing empty or fake data, and make Applications fast. C5 first: the page is unusable today.
3. **B1 and B3:** the menu and buttons follow rights.
4. **B2, B5 and C3:** one SQL step.
5. **D1–D3:** practice logins, after the "go".
6. **E1 and E2.**
7. **G2:** switches and Modify on Policy Rules (after C7).
8. **G1:** settings defaults and reset. Best done after D, so the practice roles are in the saved defaults.

The detail behind A–C is in `rights-and-visibility-audit-2026-10-02.md`.
