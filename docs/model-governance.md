# Risk model governance

Written 22 Oct 2026 (fix list R9, `sql/093`). It covers how cercit keeps its risk model in check, in line with RBI's draft guidance on model risk management (June 2026) and the Governor's August 2026 remarks: the lender stays accountable, decisions are explainable, and a person can step in and stop the model.

## What is built

| Piece | Where | What it does |
|---|---|---|
| **Model inventory** | `model_versions`, Risk models page | Every model with its status (live, shadow, retired), when it was in use, what it was trained on, its test results, who approved it, and who validated it |
| **Saved scores** | `model_scores` | Every score a model gives a case is saved: the live model's (shown to the officer) and any shadow model's (not shown). Before this, the score lived only in the browser |
| **Comparison on outcomes** | `fn_model_comparison(months)`, Risk models page | For loans at least 1, 3, 6 or 12 months on the book: each model's average predicted chance of going 30+ days late in the first 12 EMIs, against what happened, overall and by grade |
| **Kill switch** | `model_controls`, Risk models page | The Admin (model.approve) can switch the score off for every officer at once, with a reason. Officers then see "switched off by the Admin" and decide on the policy checks. Every change is in the audit log |
| **The model never decides** | policy engine | Rules decide and an officer signs off. The score only advises |

## Champion and challenger with live data

1. **Back-test first.** Score loans that have already matured with both models and compare. Only approved files have outcomes (the reject-inference problem), so this is a first look, not proof.
2. **Shadow the challenger.** Set it to `SHADOW` in `model_versions` and as `CHALLENGER_VERSION` in `src/lib/onnx-inference.ts`. It then scores every case the officer opens, saved but not shown. Both models score the same customers, so no split is needed.
3. **Wait for outcomes.** "30+ days late in 12 months" needs a year on the book. Early signals (a bounce in the first 3 EMIs) can be read at 3–6 months.
4. **Count late payers, not loans.** About 1,000 late payers are needed to measure AUC to roughly ±0.01. At a 1.6% late rate that is about 60,000 loans. With fewer, decide on calibration, which shows larger gaps.
5. **Decide on how the score is used.** The grades are cut on the predicted percentage, so calibration (are the percentages right?) matters more than ranking (AUC).
6. **Sign-off.** Head proposes, Admin approves, and someone independent of the builder validates. Record the validation on the model's inventory row.
7. **Switch.** The old model becomes `RETIRED` and stays, because older decisions name it. Keep the kill switch ready.

## Still to add before real use

- Monthly drift check (population stability index) on the score and the main inputs.
- Independent validation report for v2 (the inventory says "not yet").
- A screen to move a model between live, shadow and retired through the approval flow (today it is a database change).
- AUC and KS in the comparison, once there are enough seasoned loans for them to mean something.
