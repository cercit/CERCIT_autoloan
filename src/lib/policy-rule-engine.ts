export type Severity = "hard" | "soft";

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
}

export const POLICY_RULES: PolicyRule[] = [
  { id: "AGE_MIN", name: "Age Minimum", description: "Applicant must be >= 21 years", severity: "hard" },
  { id: "AGE_MAX", name: "Age Maximum", description: "Applicant must be <= 65 years at loan maturity", severity: "soft" },
  { id: "BUREAU_FLOOR", name: "Bureau Score Floor", description: "Minimum CIBIL/Experian score of 650 required", severity: "hard" },
  { id: "BUREAU_GOOD", name: "Good Bureau Score", description: "Score >= 700 for preferential terms", severity: "soft" },
  { id: "FOIR_LIMIT", name: "FOIR Limit", description: "Fixed obligations <= 50% of gross income", severity: "hard" },
  { id: "FOIR_OPTIMAL", name: "FOIR Optimal", description: "FOIR <= 40% for best rates", severity: "soft" },
  { id: "LTV_LIMIT", name: "LTV Limit", description: "Loan amount <= 120% of ex-showroom (on-road funding ceiling)", severity: "hard" },
  { id: "NO_SEVERE_DPD", name: "No Severe DPD", description: "No 90+ DPD or write-off in last 12 months", severity: "hard" },
  { id: "NO_RECENT_DPD", name: "No Recent DPD", description: "No 30/60 DPD in last 6 months", severity: "soft" },
  { id: "LOW_BOUNCES", name: "Low Bounce Rate", description: "No bounced payments in statement period", severity: "soft" },
  { id: "SALARY_REGULAR", name: "Salary Regular", description: "Regular salary credits in 5+ of last 6 months", severity: "soft" },
  { id: "EMPLOYER_VERIFIED", name: "Employer Verified", description: "Employer confirmation completed", severity: "soft" },
  // -- Week 3 additions (industry inputs, Sep 2026) --
  { id: "GOVT_EMPLOYEE_CHECK", name: "Govt Service Minimum", description: "Govt applicants need 3+ years of permanent service (no contract staff)", severity: "hard" },
  { id: "FREE_INCOME_FLOOR", name: "Free Income Floor", description: "At least 15% of net salary must remain after all EMIs incl. proposed", severity: "hard" },
  { id: "CC_SERVICING", name: "Card Servicing", description: "Credit card paid in full or partial, not minimum-due only", severity: "soft" },
  { id: "BUREAU_RECALIBRATED", name: "Bureau Band (post Feb-2026)", description: "Score >= 700 for bank-grade terms; 650-699 priced as NBFC segment", severity: "soft" },
  { id: "TENURE_CAP", name: "Tenure Cap", description: "Max 84 months; up to 120 only for govt employee on car under Rs 12L", severity: "hard" },
  { id: "LTV_100_SALARIED", name: "LTV 100% On-Road", description: "LTV up to 100% of on-road only with verified salary income and FOIR within limit", severity: "hard" },
];

export interface PolicyInput {
  age?: number;
  ageAtMaturity?: number;
  bureauScore?: number;
  foir?: number;
  ltvOnExShowroom?: number;
  hasSevereDPD?: boolean;
  hasRecentDPD?: boolean;
  bounces?: number;
  salaryMonthsRegular?: number; // out of 6
  employerVerified?: boolean;
  // Week 3
  govtEmployee?: boolean;
  employmentYears?: number;
  freeIncomeRatio?: number; // % of net salary left after all EMIs incl. proposed
  ccServicingPattern?: 0 | 1 | 2 | 3; // 0 none, 1 full, 2 partial, 3 minimum due only
  tenureMonths?: number;
  onRoadPrice?: number;
  ltvOnRoad?: number;
  incomeVerified?: boolean;
}

export interface PolicyResult {
  rulesPassed: number;
  rulesFailed: number;
  hardFailures: string[];
  softFailures: string[];
  score: number; // starts at 100
  decision: "approve" | "review" | "decline";
  bandColor: "green" | "amber" | "red";
  reason: string;
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  let score = 100;
  const hardFailures: string[] = [];
  const softFailures: string[] = [];

  for (const rule of POLICY_RULES) {
    let failed = false;
    switch (rule.id) {
      case "AGE_MIN": failed = (input.age ?? 99) < 21; break;
      case "AGE_MAX": failed = (input.ageAtMaturity ?? 40) > 65; break;
      case "BUREAU_FLOOR": failed = (input.bureauScore ?? 999) < 650; break;
      case "BUREAU_GOOD": failed = (input.bureauScore ?? 999) < 700; break;
      case "FOIR_LIMIT": failed = (input.foir ?? 30) > 50; break;
      case "FOIR_OPTIMAL": failed = (input.foir ?? 30) > 40; break;
      case "LTV_LIMIT": failed = (input.ltvOnExShowroom ?? 70) > 120; break;
      case "NO_SEVERE_DPD": failed = input.hasSevereDPD === true; break;
      case "NO_RECENT_DPD": failed = input.hasRecentDPD === true; break;
      case "LOW_BOUNCES": failed = (input.bounces ?? 0) > 0; break;
      case "SALARY_REGULAR": failed = (input.salaryMonthsRegular ?? 6) < 5; break;
      case "EMPLOYER_VERIFIED": failed = input.employerVerified !== true; break;
      case "GOVT_EMPLOYEE_CHECK":
        failed = input.govtEmployee === true && (input.employmentYears ?? 0) < 3;
        break;
      case "FREE_INCOME_FLOOR":
        failed = (input.freeIncomeRatio ?? 100 - (input.foir ?? 30)) < 15;
        break;
      case "CC_SERVICING": failed = input.ccServicingPattern === 3; break;
      case "BUREAU_RECALIBRATED": failed = (input.bureauScore ?? 999) < 700; break;
      case "TENURE_CAP": {
        const t = input.tenureMonths ?? 60;
        const govtHatchback = input.govtEmployee === true && (input.onRoadPrice ?? Infinity) < 1200000;
        failed = t > (govtHatchback ? 120 : 84);
        break;
      }
      case "LTV_100_SALARIED": {
        const ltv = input.ltvOnRoad ?? 0;
        if (ltv > 100) failed = true;
        else if (ltv > 90) failed = input.incomeVerified !== true || (input.foir ?? 30) > 50;
        break;
      }
    }

    if (failed) {
      if (rule.severity === "hard") {
        hardFailures.push(rule.name);
        score -= 25;
      } else {
        softFailures.push(rule.name);
        score -= 10;
      }
    }
  }

  const rulesPassed = POLICY_RULES.length - hardFailures.length - softFailures.length;
  const rulesFailed = hardFailures.length + softFailures.length;

  let decision: "approve" | "review" | "decline" = "approve";
  if (hardFailures.length > 0) {
    decision = "decline";
  } else if (softFailures.length === 0) {
    decision = "approve";
  } else if (softFailures.length <= 2) {
    decision = "review"; // amber-high
  } else {
    decision = "review"; // amber-low / needs deeper review
  }

  const bandColor = hardFailures.length > 0 ? "red" : softFailures.length > 2 ? "amber" : softFailures.length > 0 ? "amber" : "green";

  const reason = hardFailures.length > 0
    ? `Hard policy failures: ${hardFailures.join(", ")}`
    : softFailures.length === 0
    ? "All policy checks passed"
    : `Soft policy flags (${softFailures.length}): ${softFailures.join(", ")}`;

  return {
    rulesPassed,
    rulesFailed,
    hardFailures,
    softFailures,
    score: Math.max(0, score),
    decision,
    bandColor: bandColor as "green" | "amber" | "red",
    reason,
  };
}
