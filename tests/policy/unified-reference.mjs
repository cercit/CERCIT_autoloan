// Hand-written reference for the unified credit rules (policy 2026.09).
// Written directly from docs/design/FD4-rule-definitions.md, independently of the
// Zen rules file, so the two can check each other.
//
// Facts: numbers are null when the source report is missing; the has* flags say
// which reports exist. Bureau-, bank- and income-based rules only run when their
// report exists; a missing report is itself a referral (D6).

export const RULES_2026_09 = [
  // id, name, severity
  ["AGE_MIN", "Minimum age", "hard"],
  ["AGE_MAX", "Age at maturity", "soft"], // D1
  ["GOVT_SERVICE_MIN", "Govt service minimum", "hard"],
  ["EMPLOYER_VERIFIED", "Employer verified", "soft"],
  ["TENURE_CAP", "Tenure cap", "hard"],
  ["BUREAU_FLOOR", "Bureau score floor", "hard"],
  ["BUREAU_BAND_700", "Bureau band (post Feb-2026)", "soft"], // D5
  ["DPD_SEVERE", "Serious payment delays", "hard"], // D4
  ["DPD_MINOR", "Minor older payment delay", "soft"], // D4
  ["WRITEOFF_5Y", "Write-off in 5 years", "hard"],
  ["SETTLED_5Y", "Settled account in 5 years", "hard"],
  ["ENQUIRY_VELOCITY", "Bureau enquiries in 90 days", "soft"],
  ["ACTIVE_ACCOUNTS", "Active credit accounts", "soft"],
  ["CC_SERVICING", "Card paid at minimum due", "soft"],
  ["FOIR_LIMIT", "FOIR above 50%", "soft"], // D2
  ["FOIR_OPTIMAL", "FOIR above 40%", "soft"],
  ["FREE_INCOME_FLOOR", "Free income floor", "hard"],
  ["INCOME_VARIANCE", "Income sources differ", "soft"],
  ["NAME_MATCH", "Name match across documents", "soft"],
  ["BOUNCES", "Bounces in 6 months", "varies"], // D3: 1 soft, 2+ hard
  ["SALARY_REGULAR", "Salary regularity", "soft"],
  ["MIN_AVG_BALANCE", "Average balance vs EMI", "soft"],
  ["LTV_LIMIT", "LTV on ex-showroom", "hard"],
  ["LTV_ON_ROAD", "LTV on on-road", "hard"],
  ["MISSING_DATA", "Report missing", "soft"], // D6
];

export function evaluateUnified(f) {
  const hard = [];
  const soft = [];
  const fail = (id, severity) => (severity === "hard" ? hard : soft).push(id);

  if (f.age < 21) fail("AGE_MIN", "hard");
  if (f.ageAtMaturity > 65) fail("AGE_MAX", "soft");
  if (f.govtEmployee && f.employmentYears < 3) fail("GOVT_SERVICE_MIN", "hard");
  if (!f.employerVerified) fail("EMPLOYER_VERIFIED", "soft");
  const govtSmallCar = f.govtEmployee && f.onRoadPrice < 1200000;
  if (f.tenureMonths > (govtSmallCar ? 120 : 84)) fail("TENURE_CAP", "hard");

  if (f.hasBureau) {
    if (f.bureauScore < 650) fail("BUREAU_FLOOR", "hard");
    if (f.bureauScore < 700) fail("BUREAU_BAND_700", "soft");
    if (f.dpd60Ever || f.dpd90OrWriteoff12m || f.anyDpd6m) fail("DPD_SEVERE", "hard");
    if (f.minorDpdMonths7to12) fail("DPD_MINOR", "soft");
    if (f.writeoffCount5y > 0) fail("WRITEOFF_5Y", "hard");
    if (f.settledCount5y > 0) fail("SETTLED_5Y", "hard");
    if (f.enquiries90d > 3) fail("ENQUIRY_VELOCITY", "soft");
    if (f.activeAccounts > 3) fail("ACTIVE_ACCOUNTS", "soft");
    if (f.ccServicingPattern === 3) fail("CC_SERVICING", "soft");
  }

  if (f.foir > 50) fail("FOIR_LIMIT", "soft");
  if (f.foir > 40) fail("FOIR_OPTIMAL", "soft");
  if (f.freeIncomeRatio < 15) fail("FREE_INCOME_FLOOR", "hard");

  if (f.hasIncome) {
    if (f.incomeVariancePct > 5) fail("INCOME_VARIANCE", "soft");
    if (f.nameMatchScore < 98) fail("NAME_MATCH", "soft");
  }

  if (f.hasBank) {
    if (f.bounces6m >= 2) fail("BOUNCES", "hard");
    else if (f.bounces6m === 1) fail("BOUNCES", "soft");
    if (f.salaryMonthsRegular < 5) fail("SALARY_REGULAR", "soft");
    if (f.ambVsEmiPct < 20) fail("MIN_AVG_BALANCE", "soft");
  }

  if (f.ltvOnExShowroom > 120) fail("LTV_LIMIT", "hard");
  if (f.ltvOnRoad > 100 || (f.ltvOnRoad > 90 && (!f.incomeVerified || f.foir > 50))) fail("LTV_ON_ROAD", "hard");

  if (!f.hasBureau || !f.hasBank || !f.hasIncome) fail("MISSING_DATA", "soft");

  hard.sort();
  soft.sort();
  const decision = hard.length ? "decline" : soft.length ? "review" : "approve";
  const score = Math.max(0, 100 - 25 * hard.length - 10 * soft.length);
  return { decision, hard, soft, score };
}

// The 40 scenarios in scripts/test-cases predate the unified rules. Facts they do
// not carry are set to clean values here; the generated cases cover those rules.
export function factsFromScenario(tc) {
  const f = tc.features;
  const ctx = tc.context ?? {};
  return {
    age: f.age,
    ageAtMaturity: f.age + f.tenureMonths / 12,
    govtEmployee: f.govtEmployee === 1,
    employmentYears: f.employmentYears,
    employerVerified: ctx.employerVerified ?? true,
    tenureMonths: f.tenureMonths,
    onRoadPrice: ctx.onRoadPrice ?? 900000,
    hasBureau: true,
    bureauScore: f.bureauScore,
    dpd60Ever: f.dpd60 > 0,
    dpd90OrWriteoff12m: f.dpd90 > 0 || f.dpdWriteOff === 1,
    // Scenario DPD counts carry no dates; today's engine reads 30/60 DPD as recent
    anyDpd6m: f.dpd30 > 0 || f.dpd60 > 0,
    minorDpdMonths7to12: false,
    writeoffCount5y: f.dpdWriteOff === 1 ? 1 : 0,
    settledCount5y: 0,
    enquiries90d: f.enquiryVelocity,
    activeAccounts: 2,
    ccServicingPattern: f.ccServicingPattern,
    foir: f.foirPercent,
    freeIncomeRatio: f.freeIncomeRatio,
    hasIncome: true,
    incomeVariancePct: 0,
    nameMatchScore: 100,
    incomeVerified: ctx.incomeVerified ?? true,
    hasBank: true,
    bounces6m: f.bounceCount,
    salaryMonthsRegular: f.salaryRegularity,
    ambVsEmiPct: 100,
    ltvOnExShowroom: f.ltvPercent * 1.12,
    ltvOnRoad: f.ltvPercent,
  };
}
