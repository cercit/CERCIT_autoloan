# Risk model v2: retrained on the platform's own customers

Trained 2 Oct 2026. Status: **challenger**. Officers still see v1's score; v2's grade shows under it, marked "for comparison only". It changes nothing until it is signed off.

## Why retrain

v1 (16 Sep) learned from 10,000 rows where each feature was drawn on its own: a bureau score from one curve, FOIR from another, card habits from a third. Real files don't look like that. A customer with a heavy card balance also tends to have a higher FOIR and more enquiries. Since 053–055 the platform builds whole synthetic customers (two bureaus, a 24-month DPD grid, salary slips, six months of bank statements), so the model can now learn from data shaped the way it will meet it.

## What was done

1. `scripts/local/export-seasoned-training.mjs` runs every migration in a local Postgres, then the same generator production uses (055) for 20,000 customers. Nothing touches Supabase. It took two hours on the laptop.
2. The engine assessed 16,995 of them (the rest were drafts or not yet submitted). Each one becomes a row with the 18 model inputs, worked out from the tables the platform fills: DPD buckets from the merged bureau accounts, bounces and salary months from the bank summary, FOIR from the engine's recommendation.
3. Declined files are kept. Training only on approvals would teach the model that nobody is risky.
4. Outcomes (30+ days late within 12 months) are drawn with **v1's own risk formula**, seeded by application ID. So the two models differ only in the data they learned from, and the comparison is fair.
5. `python scripts/train-model.py --version v2` trains, checks that the browser file matches the trained model exactly, and scores v1 on the same test files.

## Results (4,249 test files, 1.6% went 30+ days late)

| | v1 (approved) | v2 (challenger) |
|---|---|---|
| Ranking (AUC; the formula's own ceiling is 0.764) | 0.754 | 0.741 |
| Calibration (Brier, lower is better) | 0.0155 | 0.0146 |
| Average predicted vs actual 1.6% | 1.31% | 1.69% |
| Files the engine approved: actual 0.93% | says 0.43% | says 0.64% |
| Files the engine referred: actual 1.13% | says 1.00% | says 1.51% |
| Files the engine declined: actual 4.08% | says 3.98% | says 4.56% |

In plain words:
- **v1 sorts customers slightly better.** Its training share held about 300 late payers (a 4% rate on 10,000 rows); v2's held about 200 (1.6% on 17,000).
- **v2's percentages are closer to the truth.** v1 tells an officer that an approved file is half as risky as it really is. On a spotless file v1 says 0.04%; v2 says 0.6%, near the 0.5% floor every borrower carries.

## Known limits

- The outcomes come from a formula, not real repayments. The model can at best relearn that formula; this is a demo of the method, not evidence about real borrowers.
- v2's grade C carries a lower late rate (1.1%) than grade B (1.7%) on the test files. With 357 files in C that is noise, but grades should run in order before v2 is approved.
- The 628 seasoned loans on Supabase (056) aren't used. Their late payments follow one simple rule (score below 700 or FOIR above 50), and 628 loans give about 20 late payers, too few to learn from.
- The live score still reads the older application fields through `buildRiskFeatures`. The bureau and bank detail added in 053/054 isn't wired into it yet.

## To approve v2

1. Decide which matters more for officers: v1's slightly better ordering, or v2's more honest percentages.
2. If v2: one SQL step retires v1 in `model_versions` and makes v2 active (I'll write it then), and `MODEL_VERSION` in `src/lib/onnx-inference.ts` becomes `cercit-risk-v2`. Both go together, so every decision records the model that actually scored it.

## Re-running

```
node scripts/local/export-seasoned-training.mjs 20000
python scripts/train-model.py --version v2
```

The export gets slower as the local database grows (34 s for the first 500, about 11 min for batch 36). 10,000 takes about 25 minutes if speed matters.
