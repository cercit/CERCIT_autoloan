/**
 * ML Risk Scoring Model
 *
 * Week 3: scoring runs through the trained XGBoost model (public/models/cercit-risk-v1.onnx)
 * via onnxruntime-web. The older hand-weighted logistic simulation is kept at the bottom
 * as `computeRiskScoreLegacy` for side-by-side comparison only.
 */

import { loadModelMeta, predictBadProbability, isBrowser } from "./onnx-inference";

export interface RiskFeatures {
  bureauScore: number; // 300-900
  dpd30: number;
  dpd60: number;
  dpd90: number;
  dpdWriteOff: number; // 0 or 1
  enquiryVelocity: number; // count in 90d
  bounceCount: number;
  salaryRegularity: number; // 0-6 (months regular out of 6)
  employerTier: number; // 1-5 (higher = better)
  cashWithdrawalRatio: number; // 0-100
  ltvPercent: number; // percentage of on-road
  foirPercent: number; // percentage
  tenureMonths: number;
  age: number;
  govtEmployee: number; // 1 = verified permanent govt employee
  employmentYears: number;
  ccServicingPattern: number; // 0 none, 1 pays full, 2 partial, 3 minimum due only
  freeIncomeRatio: number; // % of salary left after all EMIs incl. proposed
}

export const FEATURE_ORDER: (keyof RiskFeatures)[] = [
  "bureauScore", "dpd30", "dpd60", "dpd90", "dpdWriteOff", "enquiryVelocity",
  "bounceCount", "salaryRegularity", "employerTier", "cashWithdrawalRatio",
  "ltvPercent", "foirPercent", "tenureMonths", "age",
  "govtEmployee", "employmentYears", "ccServicingPattern", "freeIncomeRatio",
];

export type RiskGrade = "A" | "B" | "C" | "D" | "E";

export interface RiskScoreResult {
  score: number; // 0-1000, higher = safer
  grade: RiskGrade;
  defaultProbability: number; // P(30+ DPD in 12 months)
  baseProbability: number; // portfolio average the contributions are measured against
  featureContributions: FeatureContribution[];
  modelVersion: string;
  source: "xgboost-onnx" | "legacy-logistic";
}

export interface FeatureContribution {
  feature: string;
  humanName: string;
  value: number;
  contribution: number; // change in P(bad), in probability points (0-1 scale)
  direction: "increases_risk" | "decreases_risk";
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
  govtEmployee: "Govt employee",
  employmentYears: "Years in employment",
  ccServicingPattern: "Card servicing pattern",
  freeIncomeRatio: "Free income after EMIs",
};

/** Grade cut-offs on P(30+ DPD in 12 months). Book average sits near 4%. */
export function gradeFromProbability(p: number): RiskGrade {
  if (p < 0.01) return "A";
  if (p < 0.025) return "B";
  if (p < 0.06) return "C";
  if (p < 0.15) return "D";
  return "E";
}

export function normalizeFeatures(raw: Partial<Record<keyof RiskFeatures, unknown>>): RiskFeatures {
  const n = (k: keyof RiskFeatures, fallback: number) => {
    const v = Number(raw[k]);
    return Number.isFinite(v) ? v : fallback;
  };
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const foir = clamp(n("foirPercent", 40), 0, 100);
  return {
    bureauScore: clamp(n("bureauScore", 650), 300, 900),
    dpd30: n("dpd30", 0),
    dpd60: n("dpd60", 0),
    dpd90: n("dpd90", 0),
    dpdWriteOff: n("dpdWriteOff", 0) ? 1 : 0,
    enquiryVelocity: n("enquiryVelocity", 0),
    bounceCount: n("bounceCount", 0),
    salaryRegularity: clamp(n("salaryRegularity", 5), 0, 6),
    employerTier: clamp(n("employerTier", 3), 1, 5),
    cashWithdrawalRatio: clamp(n("cashWithdrawalRatio", 15), 0, 100),
    ltvPercent: clamp(n("ltvPercent", 85), 0, 120),
    foirPercent: foir,
    tenureMonths: clamp(n("tenureMonths", 60), 6, 120),
    age: clamp(n("age", 35), 18, 75),
    govtEmployee: n("govtEmployee", 0) ? 1 : 0,
    employmentYears: clamp(n("employmentYears", 3), 0, 45),
    ccServicingPattern: clamp(Math.round(n("ccServicingPattern", 0)), 0, 3),
    freeIncomeRatio: clamp(n("freeIncomeRatio", 100 - foir), 0, 100),
  };
}

function toRow(f: RiskFeatures): number[] {
  return FEATURE_ORDER.map((k) => f[k]);
}

/**
 * Scores with the trained model. Contributions are "what happens to P(bad) if this
 * feature were at the training-set average instead" -- one counterfactual inference per
 * feature, batched into a single ONNX run. Falls back to the legacy formula outside the
 * browser or if the model fails to load.
 */
export async function computeRiskScore(
  rawFeatures: Partial<Record<keyof RiskFeatures, unknown>>
): Promise<RiskScoreResult> {
  const f = normalizeFeatures(rawFeatures);
  if (!isBrowser()) return computeRiskScoreLegacy(f);

  try {
    const meta = await loadModelMeta();
    const actual = toRow(f);
    const rows: number[][] = [actual];
    for (const k of FEATURE_ORDER) {
      const cf = { ...f, [k]: meta.featureMeans[k] ?? f[k] };
      rows.push(toRow(cf));
    }
    const probs = await predictBadProbability(rows);
    const p = probs[0] ?? 0;

    const contributions: FeatureContribution[] = FEATURE_ORDER.map((k, i): FeatureContribution => {
      const delta = p - (probs[i + 1] ?? p);
      return {
        feature: k,
        humanName: HUMAN_NAMES[k] ?? k,
        value: f[k],
        contribution: Math.round(delta * 10000) / 10000,
        direction: delta > 0 ? "increases_risk" : "decreases_risk",
      };
    }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return {
      score: Math.round((1 - p) * 1000),
      grade: gradeFromProbability(p),
      defaultProbability: Math.round(p * 10000) / 10000,
      baseProbability: meta.metrics ? metaBaseRate(meta) : 0.046,
      featureContributions: contributions.slice(0, 10),
      modelVersion: meta.model,
      source: "xgboost-onnx",
    };
  } catch (err) {
    console.warn("[risk-score-model] ONNX scoring failed, using legacy formula", err);
    return computeRiskScoreLegacy(f);
  }
}

function metaBaseRate(meta: { bandBadRates?: Record<string, { count: number; badRate: number }> }): number {
  const bands = Object.values(meta.bandBadRates ?? {});
  const total = bands.reduce((s, b) => s + b.count, 0);
  if (!total) return 0.046;
  return bands.reduce((s, b) => s + b.count * b.badRate, 0) / total;
}

// ---------------------------------------------------------------------------
// LEGACY -- hand-weighted logistic simulation used before Week 3.
// Kept for comparison; not used by the assessment pipeline.
// ---------------------------------------------------------------------------

export const FEATURE_WEIGHTS_LEGACY: Record<string, number> = {
  bureauScore: -3.5,
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

export function computeRiskScoreLegacy(rawFeatures: Partial<Record<keyof RiskFeatures, unknown>>): RiskScoreResult {
  const f = normalizeFeatures(rawFeatures);
  let logit = -2.5;
  const contributions: FeatureContribution[] = [];
  for (const [key, weight] of Object.entries(FEATURE_WEIGHTS_LEGACY)) {
    const value = f[key as keyof RiskFeatures];
    const contribution = weight * value;
    logit += contribution;
    contributions.push({
      feature: key,
      humanName: HUMAN_NAMES[key] ?? key,
      value,
      contribution,
      direction: contribution > 0 ? "increases_risk" : "decreases_risk",
    });
  }
  const p = 1 / (1 + Math.exp(-logit));
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    score: Math.round((1 - p) * 1000),
    grade: gradeFromProbability(p),
    defaultProbability: Math.round(p * 1000) / 1000,
    baseProbability: 0.046,
    featureContributions: contributions.slice(0, 10),
    modelVersion: "legacy-logistic-v0",
    source: "legacy-logistic",
  };
}
