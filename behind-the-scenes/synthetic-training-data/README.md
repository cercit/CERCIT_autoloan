# Synthetic training data (risk model v2)

> **SYNTHETIC DATA. These are not real people and there are no real loans.** Every row was made by cercit's own generator. No names, PANs, phone numbers or addresses are in these files. The IDs (`SYN0000001` …) belong to the made-up customers.

This is the data behind cercit's risk model v2, which became the live risk score on 2 Oct 2026.

## What's here

| File | What it holds |
|---|---|
| `SYNTHETIC-customers-features.csv` | 16,995 rows: one per synthetic application the credit engine assessed, with the engine's decision and the 18 inputs the model reads, plus 3 extra bureau measures |
| `SYNTHETIC-customers-with-outcomes.csv` | The same rows plus the simulated outcome: whether the customer went 30+ days late within 12 months (`bad30`), whether that rolled to 90+ days (`default90`), and the true probability the formula gave (`p_true`) |
| `risk-model-v2-results.json` | What the model learned: test scores, the late rate in each grade, which inputs mattered most, and the comparison with model v1 on the same files |

## How it was made

1. **20,000 synthetic customers** were made with the same generator the live demo uses (`sql/055_synthetic_customers.sql`). It ran in a local copy of the database on a laptop; nothing came from or went to the live system. Each customer gets:
   - reports from two simulated bureaus, with a 24-month late-payment grid;
   - salary slips and Form 16;
   - six months of bank statements;
   - a car they can afford.
2. **The credit engine assessed 16,995 of them.** The other 3,005 were drafts or not yet submitted. The split:
   - 7,805 approved (46%);
   - 6,074 referred for a person to check (36%);
   - 3,116 declined (18%).

   Declined files are kept: a model trained only on approvals would never see risky customers.
3. **The 18 inputs were worked out from the platform's own tables:**
   - late-payment counts from the merged bureau accounts;
   - bounces and salary months from the bank summary;
   - FOIR from the engine's recommendation.
4. **Outcomes were simulated**, not observed. Each file's chance of going 30+ days late comes from model v1's risk formula (`scripts/generate-training-data.ts`), with random life events added, seeded by application ID. A file always gets the same outcome.

## At a glance

| | |
|---|---|
| Rows | 16,995 |
| Went 30+ days late | 271 (1.6%) |
| Went 90+ days late | 64 |
| Average bureau score | 722 (range 552–900) |
| Average FOIR | 40% |
| Average loan-to-value | 92% |
| Government / PSU employees | 20% |

## Columns

**Decisions**
- `application_id`
- `status`: APPROVED / UNDER_REVIEW / REJECTED.
- `recommendation`: APPROVE / MAYBE / REJECT.

**Bureau**
- `bureauScore`: the combined (worst-of) score from the two bureaus.
- `dpd30`, `dpd60`, `dpd90`: accounts whose worst month was 30–59, 60–89, or 90+ days late.
- `dpdWriteOff`: 1 if any loan was written off in the last 5 years.
- `enquiryVelocity`: credit enquiries in the last 90 days.

**Bank and salary**
- `bounceCount`: bounced payments on the bank statement.
- `salaryRegularity`: months out of 6 with a salary credit.
- `employerTier`: 5 = government/PSU, 4 = MNC, 3 = public limited, 2 = private limited.
- `govtEmployee`: 1 for government or PSU.
- `cashWithdrawalRatio`: cash deposits as a % of salary.

**The loan**
- `ltvPercent`: loan as a % of the on-road price.
- `foirPercent`: all EMIs, including this loan, as a % of income.
- `freeIncomeRatio`: 100 − FOIR.
- `tenureMonths`.

**The person**
- `age`.
- `employmentYears`.
- `ccServicingPattern`: 0 no card, 1 pays in full, 2 carries a balance, 3 card over half its limit.

**Extra bureau detail (not used by the model)**
- `creditUtilPct`, `unsecuredEnq90d`, `noHit`.

**Outcomes (with-outcomes file only)**
- `bad30`, `default90`, `p_true`.

## What it can and can't show

- **It can show** the method: how cercit builds whole synthetic customers, turns them into model inputs, and trains and checks a model that runs in the browser.
- **It can't tell you anything about real borrowers.** The outcomes come from a formula, so a model trained here can at best relearn that formula. The best score any model can reach on these files is 0.764 (AUC); v2 scores 0.741.

## Rebuild it

```
node scripts/local/export-seasoned-training.mjs 20000
python scripts/train-model.py --version v2
```

The generator is deterministic, so the same command gives the same customers. The full write-up is in [`docs/risk-model-v2.md`](../../docs/risk-model-v2.md).
