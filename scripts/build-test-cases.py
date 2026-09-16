"""
cercit Week 3 / Part F -- test case profiles (JSON only, no PDFs)

Writes scripts/test-cases/TC-NN-<slug>.json, one per profile, each carrying the 18 model
features, the expected model output (from the trained ONNX model) and the expected
policy outcome (hand-set from the rule definitions). Also writes an index.json.

Run: python scripts/build-test-cases.py
"""

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "public" / "models" / "cercit-risk-v1.onnx"
META = json.loads((ROOT / "public" / "models" / "cercit-risk-v1.meta.json").read_text())
OUT = ROOT / "scripts" / "test-cases"
FEATURES = META["features"]

BASE = dict(
    bureauScore=760, dpd30=0, dpd60=0, dpd90=0, dpdWriteOff=0, enquiryVelocity=1,
    bounceCount=0, salaryRegularity=6, employerTier=4, cashWithdrawalRatio=12,
    ltvPercent=90, foirPercent=38, tenureMonths=60, age=36, govtEmployee=0,
    employmentYears=6, ccServicingPattern=1, freeIncomeRatio=62,
)


def case(slug, title, expect_policy, notes, onRoadPrice=900000, **over):
    f = {**BASE, **over}
    f["freeIncomeRatio"] = over.get("freeIncomeRatio", round(100 - f["foirPercent"], 1))
    return dict(slug=slug, title=title, features=f, expectedPolicy=expect_policy, notes=notes,
                context={"onRoadPrice": onRoadPrice, "employerVerified": True, "incomeVerified": True})


# expectedPolicy: "approve" | "review" | "decline" (policy-rule-engine decision)
CASES = [
    # ---- clean / green ----
    case("clean-private-tier4", "Clean private salaried, tier-4 employer", "approve", "Baseline green file."),
    case("clean-govt-3yr", "Govt employee, 3.5 yrs service", "approve", "Govt special category, just over 3yr floor.", govtEmployee=1, employerTier=5, employmentYears=3.5, bureauScore=745),
    case("clean-govt-hatchback-10yr", "Govt employee, 10yr tenure on hatchback", "approve", "Tenure 120 allowed only for govt + car < 12L.", govtEmployee=1, employerTier=5, employmentYears=9, tenureMonths=120, foirPercent=30),
    case("clean-high-salary-4yr", "High salary, short tenure, 20% down", "approve", "Company-car style profile.", employerTier=5, ltvPercent=80, tenureMonths=48, foirPercent=25, bureauScore=805),
    case("clean-750-exact", "Bureau exactly 750", "approve", "Boundary at bank gold-mine band.", bureauScore=750),
    case("clean-700-exact", "Bureau exactly 700", "approve", "Boundary: BUREAU_RECALIBRATED passes at 700.", bureauScore=700),
    case("clean-ltv-100", "LTV 100% on-road, verified salary, FOIR 42", "review", "LTV_100_SALARIED passes with verified income + FOIR <= 50; FOIR_OPTIMAL soft flag -> review.", ltvPercent=100, foirPercent=42),
    case("clean-free-income-15", "Free income exactly 15%", "review", "FREE_INCOME_FLOOR boundary (>= 15 passes); FOIR 50 trips FOIR_OPTIMAL soft flag.", foirPercent=50, freeIncomeRatio=15),
    case("clean-age-25", "Age 25, 2 yrs employment", "approve", "Young buyer, no rule breach; model should show mild age/tenure risk.", age=25, employmentYears=2),
    case("clean-age-55-tenure-5", "Age 55, 60-month tenure", "approve", "Age at maturity 60 <= 65.", age=55),
    case("clean-home-loan-in-foir", "Home loan EMI inside FOIR", "review", "Existing home loan is fine under FOIR_LIMIT; FOIR 45 still trips FOIR_OPTIMAL soft flag.", foirPercent=45),
    case("clean-cc-partial", "Card paid partially each month", "approve", "CC_SERVICING soft rule only fails on min-due.", ccServicingPattern=2),

    # ---- soft flags / review ----
    case("soft-bureau-690", "Bureau 690, otherwise clean", "review", "Below 700: BUREAU_GOOD + BUREAU_RECALIBRATED soft fail.", bureauScore=690),
    case("soft-cc-min-due", "Card serviced at minimum due only", "review", "CC_SERVICING soft fail.", ccServicingPattern=3),
    case("soft-one-bounce", "One bounced EMI in statement", "review", "LOW_BOUNCES soft fail.", bounceCount=1),
    case("soft-salary-4of6", "Salary credited 4 of 6 months", "review", "SALARY_REGULAR soft fail.", salaryRegularity=4),
    case("soft-foir-45", "FOIR 45 (over optimal 40)", "review", "FOIR_OPTIMAL soft fail only.", foirPercent=45),
    case("soft-recent-dpd30", "One 30 DPD in last 6 months", "review", "NO_RECENT_DPD soft fail.", dpd30=1),
    case("soft-enquiry-8", "8 enquiries in 90 days", "review", "No policy rule on enquiries; model should lift risk. FOIR 45 to force review.", enquiryVelocity=8, foirPercent=45),
    case("soft-two-flags", "Bureau 705 + card min due", "review", "Two soft fails -> amber-high style review.", bureauScore=705, ccServicingPattern=3, foirPercent=42),
    case("soft-three-flags", "Bureau 680 + bounce + FOIR 47", "review", "Three+ soft fails -> deeper review.", bureauScore=680, bounceCount=1, foirPercent=47),
    case("soft-age-maturity-66", "Age 59, 84-month tenure", "review", "AGE_MAX soft fail (maturity 66).", age=59, tenureMonths=84),

    # ---- hard fails / decline ----
    case("hard-bureau-640", "Bureau 640", "decline", "BUREAU_FLOOR hard fail (< 650).", bureauScore=640),
    case("hard-bureau-600", "Bureau 600", "decline", "Well below floor; NBFC/RRB segment.", bureauScore=600, enquiryVelocity=5),
    case("hard-foir-55", "FOIR 55", "decline", "FOIR_LIMIT hard fail (> 50) and free income 45 still ok.", foirPercent=55),
    case("hard-free-income-10", "FOIR 48 but free income 10%", "decline", "FREE_INCOME_FLOOR hard fail even though FOIR_LIMIT passes.", foirPercent=48, freeIncomeRatio=10),
    case("hard-govt-contract-1yr", "Govt (contract-like), 1 yr service", "decline", "GOVT_EMPLOYEE_CHECK hard fail (< 3 yrs).", govtEmployee=1, employerTier=5, employmentYears=1),
    case("hard-govt-2.9yr", "Govt, 2.9 yrs service", "decline", "GOVT_EMPLOYEE_CHECK boundary just under 3.", govtEmployee=1, employerTier=5, employmentYears=2.9),
    case("hard-tenure-96-private", "Private salaried, 96-month tenure", "decline", "TENURE_CAP hard fail (> 84 for non-govt).", tenureMonths=96),
    case("hard-tenure-120-govt-suv", "Govt, 120 months on 17L SUV", "decline", "TENURE_CAP: 120 allowed only under 12L on-road.", onRoadPrice=1700000, govtEmployee=1, employerTier=5, employmentYears=8, tenureMonths=120),
    case("hard-ltv-105", "LTV 105% on-road (accessories top-load)", "decline", "LTV_100_SALARIED hard fail (> 100).", ltvPercent=105),
    case("hard-ltv-98-foir-52", "LTV 98% with FOIR 52", "decline", "LTV_100_SALARIED needs FOIR <= 50 above 90% LTV; FOIR_LIMIT also fails.", ltvPercent=98, foirPercent=52),
    case("hard-dpd90", "One 90+ DPD account", "decline", "NO_SEVERE_DPD hard fail.", dpd90=1, bureauScore=700),
    case("hard-writeoff", "Write-off on bureau", "decline", "NO_SEVERE_DPD hard fail via write-off.", dpdWriteOff=1, bureauScore=680),
    case("hard-age-20", "Age 20", "decline", "AGE_MIN hard fail.", age=20, employmentYears=0.5),
    case("hard-stressed-stack", "Bureau 630, 2x DPD30, 2 bounces, min-due card, FOIR 58", "decline", "Everything wrong at once; model grade should be E.", bureauScore=630, dpd30=2, dpd60=1, bounceCount=2, ccServicingPattern=3, foirPercent=58, cashWithdrawalRatio=40, salaryRegularity=3, enquiryVelocity=7),

    # ---- model-vs-policy divergence (interesting for the officer) ----
    case("diverge-policy-pass-model-risky", "No hard fails, model uneasy", "review", "Only FOIR_OPTIMAL soft flag, but bureau 702, 1.6 yr job, FOIR 49, LTV 100, partial card, 5 enquiries, cash 30%. Expect grade B/C.", bureauScore=702, employmentYears=1.6, foirPercent=49, ltvPercent=100, ccServicingPattern=2, enquiryVelocity=5, cashWithdrawalRatio=30, age=26),
    case("diverge-policy-fail-model-safe", "Fails one soft rule, model very safe", "review", "Govt, 810 bureau, 12 yr service, but bureau 'recent DPD' from a closed card 5 months ago.", govtEmployee=1, employerTier=5, employmentYears=12, bureauScore=810, dpd30=1, foirPercent=28),
    case("diverge-thin-file", "Thin file: 1 enquiry, no cards, 700 score", "approve", "No history to judge; model relies on income side.", bureauScore=700, ccServicingPattern=0, enquiryVelocity=1, employmentYears=1.2, age=27),
    case("diverge-high-cash", "Cash withdrawal ratio 55%", "approve", "No policy rule on cash; model should flag.", cashWithdrawalRatio=55),
]


def main():
    sess = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    X = np.array([[c["features"][f] for f in FEATURES] for c in CASES], dtype=np.float32)
    probs = sess.run(["probabilities"], {"features": X})[0][:, 1]

    def grade(p):
        return "A" if p < 0.01 else "B" if p < 0.025 else "C" if p < 0.06 else "D" if p < 0.15 else "E"

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()

    index = []
    for i, (c, p) in enumerate(zip(CASES, probs), start=1):
        tc_id = f"TC-{i:02d}"
        doc = {
            "id": tc_id,
            "title": c["title"],
            "notes": c["notes"],
            "features": c["features"],
            "context": c["context"],
            "expected": {
                "policyDecision": c["expectedPolicy"],
                "modelBadProbability": round(float(p), 4),
                "modelScore": int(round((1 - float(p)) * 1000)),
                "modelGrade": grade(float(p)),
            },
            "modelVersion": META["model"],
        }
        (OUT / f"{tc_id}-{c['slug']}.json").write_text(json.dumps(doc, indent=2))
        index.append({"id": tc_id, "slug": c["slug"], "title": c["title"], "policy": c["expectedPolicy"], "grade": doc["expected"]["modelGrade"], "pBad": doc["expected"]["modelBadProbability"]})

    (OUT / "index.json").write_text(json.dumps(index, indent=2))
    print(f"wrote {len(index)} test cases -> scripts/test-cases/")
    for r in index:
        print(f"{r['id']}  {r['policy']:<8} {r['grade']}  {r['pBad']:.4f}  {r['title']}")


if __name__ == "__main__":
    main()
