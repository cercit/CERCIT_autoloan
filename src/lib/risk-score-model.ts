/**
 * ML Risk Scoring Model - Logistic Regression Simulation
 */

export interface FeatureWeights {
  [key: string]: number;
}

export const FEATURE_WEIGHTS: FeatureWeights = {
  bureauScore: -3.5,        // higher score = lower risk (negative weight)
  dpd30: 0.6,
  dpd60: 1.1,
  dpd90: 1.8,
  dpdWriteOff: 3.2,
  enquiryVelocity: 0.35,
  bounceCount: 0.8,
  salaryRegularity: -0.5,
  employerTier: -0.7,
  cashWithdrawalRatio: 0.5,
  ltvPercent: 0.6,
  foirPercent: 1.2,
  tenureMonths: -0.1,
  age: -0.05,
};

export interface RiskFeatures {
  bureauScore: number;        // 300-900
  dpd30: number;
  dpd60: number;
  dpd90: number;
  dpdWriteOff: number;         // 0 or 1
  enquiryVelocity: number;     // count in 90d
  bounceCount: number;
  salaryRegularity: number;     // 0-6 (months regular out of 6)
  employerTier: number;         // 1-5 (higher = better)
  cashWithdrawalRatio: number;  // 0-100
  ltvPercent: number;          // percentage
  foirPercent: number;         // percentage
  tenureMonths: number;
  age: number;
}

export type RiskGrade = "A" | "B" | "C" | "D" | "E";

export interface RiskScoreResult {
  score: number;              // 0-1000
  grade: RiskGrade;
  defaultProbability: number;  // 0-1 (sigmoid of logit)
  logit: number;
  featureContributions: FeatureContribution[];
}

export interface FeatureContribution {
  feature: string;
  humanName: string;
  value: number;
  weight: number;
  contribution: number;        // weight * value
  direction: "increases_risk" | "decreases_risk";
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function normalizeFeatures(raw: any): RiskFeatures {
  return {
    bureauScore: Math.min(900, Math.max(300, Number(raw.bureauScore ?? 650))),
    dpd30: Number(raw.dpd30 ?? 0),
    dpd60: Number(raw.dpd60 ?? 0),
    dpd90: Number(raw.dpd90 ?? 0),
    dpdWriteOff: Number(raw.dpdWriteOff ?? 0),
    enquiryVelocity: Number(raw.enquiryVelocity ?? 0),
    bounceCount: Number(raw.bounceCount ?? 0),
    salaryRegularity: Math.min(6, Math.max(0, Number(raw.salaryRegularity ?? 5))),
    employerTier: Math.min(5, Math.max(1, Number(raw.employerTier ?? 3))),
    cashWithdrawalRatio: Math.min(100, Math.max(0, Number(raw.cashWithdrawalRatio ?? 15))),
    ltvPercent: Math.min(120, Math.max(0, Number(raw.ltvPercent ?? 70))),
    foirPercent: Math.min(100, Math.max(0, Number(raw.foirPercent ?? 40))),
    tenureMonths: Math.min(84, Math.max(6, Number(raw.tenureMonths ?? 36))),
    age: Math.min(70, Math.max(21, Number(raw.age ?? 35))),
  };
}

export function computeRiskScore(rawFeatures: any): RiskScoreResult {
  const f = normalizeFeatures(rawFeatures);
  let logit = 0;
  const contributions: FeatureContribution[] = [];

  for (const [key, weight] of Object.entries(FEATURE_WEIGHTS)) {
    const value = (f as any)[key] ?? 0;
    const contribution = weight * value;
    logit += contribution;
    contributions.push({
      feature: key,
      humanName: HUMAN_NAMES[key] || key,
      value,
      weight,
      contribution,
      direction: contribution > 0 ? "increases_risk" : "decreases_risk",
    });
  }

  // Adjust logit scale: center around medium risk
  logit = logit - 2.5; // offset to center

  const prob = sigmoid(logit);
  const score = Math.round(prob * 1000);

  const grade = score >= 850 ? "A" : score >= 700 ? "B" : score >= 500 ? "C" : score >= 350 ? "D" : "E";

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { score, grade, defaultProbability: Math.round(prob * 1000) / 1000, logit, featureContributions: contributions.slice(0, 10) };
}

export const HUMAN_NAMES: Record<string, string> = {
  bureauScore: "Bureau score",
  dpd30: "30-day DPD count",
  dpd60: "60-day DPD count",
  dpd90: "90-day DPD count",
  dpdWriteOff: "Write-off present",
  enquiryVelocity: "Enquiry velocity (90d)",
  bounceCount: "Bounced payments",
  salaryRegularity: "Salary regularity",
  employerTier: "Employer tier",
  cashWithdrawalRatio: "Cash withdrawal ratio",
  ltvPercent: "LTV %",
  foirPercent: "FOIR %",
  tenureMonths: "Loan tenure",
  age: "Applicant age",
};
