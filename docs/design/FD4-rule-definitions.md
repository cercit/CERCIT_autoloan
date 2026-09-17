# FD4.1 — One definition of the credit rules

Date: 17 Sep 2026
Status: decisions D1–D7 made 17 Sep 2026 — see the table at the end

## Why this is needed

cercit has two rule engines that were built separately:

| Engine | Where | Rules | Used by |
|---|---|---|---|
| Browser engine | `src/lib/policy-rule-engine.ts` | 18 | The screens, the ML risk card, the 40 test scenarios, `docs/engine-evaluation/zen-policy.json` |
| Database engine | `fn_run_policy_engine` in `sql/004`, rules in `policy_rules` (`sql/002`) | 16 | The assessment pipeline behind application submission |

They share only some rules, and several shared rules reach **different outcomes for the same applicant**. The move to one server-side engine (FD4.2 onwards) needs a single agreed rule set first.

Outcome words below: **Decline** = hard fail. **Refer** = goes to an officer (the browser engine's "soft", the database engine's "MAYBE").

## Rule-by-rule comparison

### In both engines, same outcome

| Rule | Browser | Database |
|---|---|---|
| Minimum age 21 | Decline | Decline |
| Bureau score below 650 | Decline | Decline |
| LTV above 120% of ex-showroom | Decline | Decline |
| Salary not regular | Refer (under 5 of 6 months credited) | Refer (bank analysis flag) |

### In both engines, different outcome

| Rule | Browser | Database | Recommendation |
|---|---|---|---|
| Age at maturity above 65 | Refer | Decline | **D1** |
| FOIR above 50% | Decline | Refer | **D2** |
| Any cheque / mandate bounce | Refer | Decline (6 months) | **D3** |
| Payment delays (DPD) | Decline: 90+ DPD or write-off in 12 months. Refer: 30/60 DPD in 6 months | Decline: any DPD in 12 months, or 60+ DPD ever | **D4** |

### Only in the browser engine (added with Week 3 industry input)

| Rule | Outcome |
|---|---|
| Good bureau score (under 700) | Refer |
| Bureau band after Feb-2026 recalibration (under 700) | Refer — same test as the rule above, so every file under 700 gets two referral flags (**D5**) |
| FOIR above 40% (best-rate band) | Refer |
| Employer not verified | Refer |
| Govt employee with under 3 years' permanent service | Decline |
| Free income under 15% of net salary | Decline |
| Credit card paid at minimum due only | Refer |
| Tenure above 84 months (120 for govt employee, car under ₹12 lakh) | Decline |
| LTV above 100% of on-road, or above 90% without verified income / with FOIR above 50% | Decline |

### Only in the database engine

| Rule | Outcome | Recommendation |
|---|---|---|
| Write-off in 5 years | Decline | Keep |
| Settled account in 5 years | Decline | Keep |
| 60+ DPD at any time | Decline | See **D4** |
| More than 3 bureau enquiries in 90 days | Refer | Keep |
| More than 3 active credit accounts | Refer | Keep |
| Income sources differ by more than 5% | Refer | Keep |
| Minimum average balance below 20% of EMI | Refer | Keep |
| Name match across documents below 98% | Refer | Keep |

## Missing data — both engines let it through

| Engine | What happens when a value is missing |
|---|---|
| Browser | Substitutes a passing default: age 99, bureau score 999, FOIR 30%, LTV 70%, tenure 60 months |
| Database | Marks the rule SKIPPED and counts it as passed |

So a file with **no bureau report passes the bureau floor** in both. The credit policy says no file proceeds without a bureau report. **D6** decides how missing data is treated.

## How FOIR is calculated

Decision 0.1 keeps the database engine's method: existing obligations (from the bureau report, otherwise declared) plus the proposed EMI at the band rate, divided by net salary plus other income. The browser engine receives FOIR already calculated. In the new engine, FOIR is calculated once, on the server, by this method, and passed to the rules.

## Decisions needed

| # | Question | Recommendation | Why |
|---|---|---|---|
| D1 | Age above 65 at maturity: decline or refer? | **Refer**, and let the officer shorten tenure | A shorter tenure often fixes it; declining loses a good file |
| D2 | FOIR above 50%: decline or refer? | **Decline** | The cap is the policy limit; the free-income floor already handles thin margins. Referral invites routine exceptions |
| D3 | A single bounce in 6 months: decline or refer? | **Refer for 1, decline for 2 or more** | One technical bounce is common; repeated bounces are a pattern |
| D4 | Payment delays | **Decline** on 60+ DPD ever, 90+ or write-off in 12 months, or any DPD in the last 6 months; **refer** on 1–30 DPD in months 7–12 | Keeps the database engine's stricter bureau stance while allowing an officer to look at an old small delay |
| D5 | The two "under 700" rules | **Keep one** (post-recalibration band) | Two flags for the same fact inflate the referral count |
| D6 | Missing data | **Refer** when bureau, bank or income data is missing; never pass | Matches "no file proceeds without a bureau report" and keeps a person in the loop |
| D7 | Unified rule list | **Union of both engines** with D1–D6 applied: 24 rules (25 if the two DPD levels stay separate rules) — the 4 shared, the 4 that differ, 8 browser-only (the two "under 700" rules merged), 7 database-only (60+ DPD folded into DPD), plus the missing-data rule | Nothing either engine checks today is lost |

Once D1–D7 are answered, FD4.2 writes the unified set as version `2026.09` (a proposed change against baseline `2026.08`, approved by someone other than its author), and the parity test compares each difference on purpose rather than by accident.

## Decisions made (17 Sep 2026)

| # | Decision | Chosen | Note |
|---|---|---|---|
| D1 | Age above 65 at maturity | **Refer** | As recommended |
| D2 | FOIR above 50% | **Refer** | Differs from the recommendation. A file above 90% of on-road LTV with FOIR above 50% still declines through the on-road LTV rule |
| D3 | Bounces in 6 months | **1 refers, 2 or more decline** | As recommended |
| D4 | Payment delays | **Decline** 60+ DPD ever, 90+ DPD or write-off in 12 months, any DPD in the last 6 months; **refer** 1–30 DPD in months 7–12 | As recommended |
| D5 | Two "under 700" rules | **One rule** (post-recalibration band) | As recommended |
| D6 | Missing bureau, bank or income data | **Refer** | As recommended |
| D7 | Unified rule list | **Everything from both engines** — 24 rules | As recommended |

Consequence for the parity test: the new rule set is meant to differ from today's browser engine on D1–D6 and on the seven database-only rules. The test therefore compares against an expected-outcome table for the unified set, and separately lists every case whose outcome changed from today, so each change is visible and intended.
