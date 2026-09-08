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
  { id: "LTV_LIMIT", name: "LTV Limit", description: "Loan amount <= max allowed % of ex-showroom", severity: "hard" },
  { id: "NO_SEVERE_DPD", name: "No Severe DPD", description: "No 90+ DPD or write-off in last 12 months", severity: "hard" },
  { id: "NO_RECENT_DPD", name: "No Recent DPD", description: "No 30/60 DPD in last 6 months", severity: "soft" },
  { id: "LOW_BOUNCES", name: "Low Bounce Rate", description: "No bounced payments in statement period", severity: "soft" },
  { id: "SALARY_REGULAR", name: "Salary Regular", description: "Regular salary credits in 5+ of last 6 months", severity: "soft" },
  { id: "EMPLOYER_VERIFIED", name: "Employer Verified", description: "Employer confirmation completed", severity: "soft" },
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
      case "LTV_LIMIT": {
        const limit = input.ltvOnExShowroom ?? 70;
        // rough check - assume segment-based, simplified
        failed = limit > 90;
        break;
      }
      case "NO_SEVERE_DPD": failed = input.hasSevereDPD === true; break;
      case "NO_RECENT_DPD": failed = input.hasRecentDPD === true; break;
      case "LOW_BOUNCES": failed = (input.bounces ?? 0) > 0; break;
      case "SALARY_REGULAR": failed = (input.salaryMonthsRegular ?? 6) < 5; break;
      case "EMPLOYER_VERIFIED": failed = input.employerVerified !== true; break;
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
