# Audit review, 4 Oct 2026

An outside agent audited cercit against `docs/audit-brief.md`; its report is `docs/audits/cercit-audit-report-2026-10-04.md`. Every finding was checked against the code and the live database before anything goes on the fix list. The agent read code only; it did not try the live site.

**Verdict:** the biggest finding is right and matters: the case screen recalculates the decision in the browser with its own rules, so it can disagree with the real engine in the database. That is exactly what the SYN0000910 screenshot showed on 3 Oct (AI "Maybe" in the header, "REJECT" in the breakdown, FOIR 8.2% vs 9.2%, LTV 80% "breached"). About a third of the other findings were wrong or already fixed.

## Confirmed: goes on the fix list

| # | Finding | What I checked | Severity |
|---|---|---|---|
| A1 | **The case screen runs its own decision engine.** `copilot-review.tsx` calls `runAssessment`, `calculateIncome`, `calculateLTV` and `detectFraudFlags` from `src/lib/engine.ts` on the case data, and shows the result as the "Assessment Breakdown" next to the real recommendation from the database. Different thresholds, different maths. | Code: `copilot-review.tsx:154-157`, `engine.ts` | Critical |
| A2 | **The browser engine invents income tax.** `engine.ts:60-62` treats net salary as gross and takes off 20% above Rs 50,000. The report says this makes FOIR look *better*; it does the opposite: income goes down, so the breakdown's FOIR comes out *higher* (that is the 8.2% vs 9.2%). Wrong either way. Goes away with A1. | Code | High (part of A1) |
| A3 | **Missing data counts as a pass.** In the live engine (`fn_run_policy_engine`, 070), a rule whose data is missing is marked SKIPPED and treated as passed. A customer case whose bank statement couldn't be read can be recommended APPROVE without the bank checks. | Live function contains it; 048 says unread values are left empty | High |
| A4 | **The eligibility checker uses its own thresholds.** `quickEligibility` (public `/check-eligibility` and the staff new-application form): FOIR 65% reject / 50% maybe, CIBIL 650/700. The policy says FOIR 50%, bands 750/650. A customer can see "Likely approve" and then get a Maybe. | Code: `engine.ts` ~700-725 | Medium |
| A5 | **LTV label.** The list maps the recommendation's LTV (worked out on the **on-road** price) into the field the screen labels **ex-showroom**, and on-road LTV is hard-coded 0. The engine itself works on ex-showroom. Two LTVs, one label. | Code `api.ts:80-81`; live: recommendation uses on-road, engine uses ex-showroom | Medium |
| A6 | **The in-principle quote always uses the best (750+) rate.** By design (no bureau score yet at that step), but the customer isn't told it's the best-case rate. Wording fix: "from 8.99%, final rate after the credit check". | Code `004:92-97`, live function | Low |
| A7 | **"3 violations = REJECT" in the browser** (`engine.ts:436`). Not from policy. Goes away with A1. | Code | Part of A1 |
| A8 | **Practice reset is SQL-only.** An admin button would help demos. | Known (D2), still SQL-only | Low |
| A9 | **Playwright tests don't run on every push.** | Not checked in CI files yet; plausible | Medium |

## Wrong, or already fixed: not added

| Finding | Why not |
|---|---|
| Security-definer functions without `search_path` | Live check: all 197 have it pinned (078 finished the last ones). |
| S3 uploads not checked for size or type | `document_finalize` checks the real file type (magic bytes) and the 10 MB limit after upload, and deletes every version of a bad file. |
| Employer Master UI still shows car makers (C9) | Fixed: the page reads `employer-api` (G4, live since 3 Oct). |
| Dashboard subtitle "Wednesday — Chennai" | Fixed in batch 1 (A4). |
| "Prototype data" note on the live site | Fixed in batch 1: only in sample mode. |
| The demo login sees real cases | No: synthetic and staff cases only (042, checked 2 Oct). |
| Demo/practice passwords shown on the login page | Intended: they are the try-it logins, and the database keeps them read-only and synthetic-only. |
| "RBI caps car loan LTV at 100% of on-road" | No source given and I don't know of one; LTV is lender policy here. Don't act on it without a citation. Worth a line in the policy doc explaining why 120% of ex-showroom. |
| 81 migration files "not sustainable" | Fair long-term, but thresholds already live in tables and versioned policy; consolidating now would risk the live system for no user benefit. Note for the PM playbook (L6). |
| Stale local `dist/` | Irrelevant: the live site builds from `main`. |

## Ideas worth keeping (not bugs)

- Full 24-month DPD grid on the bureau screen (check `bureau-detail.tsx` first; it may already show it).
- Number format: pick one (Rs vs Rupee sign, lakh/crore) and use `inr()` everywhere.
- Key Fact Statement summary on the offer, and Fair Practices Code disclosures, to make it look like a real lender.
- Accessibility pass (contrast, icon-button labels, focus).
- Phone-width test run on every page, not just the two fixed in H4.

## Recommended order

1. **A1 (with A2, A7):** the case screen shows only what the database decided. Remove the browser re-calculation from live cases (keep it for sample mode). Fixes the screenshot problems.
2. **A3:** a rule with missing data can't pass; it sends the case to Maybe (manual review) instead. SQL change, test first in `tests/sql/run.mjs`.
3. **A4 + A6:** eligibility checker reads the live policy thresholds; the in-principle rate says "from".
4. **A5:** show both LTVs with the right labels.
5. A8, A9 and the ideas, as time allows.
