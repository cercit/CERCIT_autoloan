import { emiFor } from "@/lib/format";
import {
  buildMockBureau,
  rateGrid,
  type Application,
  type BankStatementSummary,
  type BureauReport,
} from "@/lib/mock-data";

// -- Task 42: Income calculation ------------------------------------------------

export type IncomeAssessment = {
  declaredMonthlyIncome: number;
  verifiedMonthlyIncome: number;
  incomeVariancePct: number;
  incomeVarianceFlag: boolean;
  netMonthlyIncome: number;
  existingEmiTotal: number;
  proposedEmi: number;
  totalObligations: number;
  foir: number;
  dbr: number;
  netSurplus: number;
};

export function calculateIncome(
  app: Application,
  banking?: BankStatementSummary,
): IncomeAssessment {
  const declaredMonthlyIncome = app.netIncome;
  const verifiedMonthlyIncome = banking?.avgSalaryAmount ?? declaredMonthlyIncome;

  const variancePct =
    declaredMonthlyIncome > 0
      ? Math.abs(
          ((declaredMonthlyIncome - verifiedMonthlyIncome) / declaredMonthlyIncome) * 100,
        )
      : 0;
  const incomeVarianceFlag = variancePct > 10;

  const grossMonthlyIncome = declaredMonthlyIncome;
  const estimatedTax = grossMonthlyIncome > 50000 ? (grossMonthlyIncome - 50000) * 0.2 : 0;
  const netMonthlyIncome = grossMonthlyIncome - estimatedTax;

  const existingEmiTotal = app.obligations.reduce((sum, o) => sum + o.emi, 0);
  const proposedEmi = emiFor(app.loanAmount, app.rate, app.tenure || 60);
  const totalObligations = existingEmiTotal + proposedEmi;

  const foir = netMonthlyIncome > 0 ? (totalObligations / netMonthlyIncome) * 100 : 0;
  const dbr = grossMonthlyIncome > 0 ? (totalObligations / grossMonthlyIncome) * 100 : 0;
  const netSurplus = netMonthlyIncome - totalObligations;

  return {
    declaredMonthlyIncome,
    verifiedMonthlyIncome,
    incomeVariancePct: Math.round(variancePct * 10) / 10,
    incomeVarianceFlag,
    netMonthlyIncome: Math.round(netMonthlyIncome),
    existingEmiTotal,
    proposedEmi,
    totalObligations,
    foir: Math.round(foir * 10) / 10,
    dbr: Math.round(dbr * 10) / 10,
    netSurplus: Math.round(netSurplus),
  };
}

// -- Task 44: LTV calculation ---------------------------------------------------

export type LTVAssessment = {
  ltvExShowroom: number;
  ltvOnRoad: number;
  maxAllowedLtv: number;
  categoryLabel: string;
  breached: boolean;
};

const maxLtvByCategory: Record<string, number> = {
  A: 120,
  B: 110,
  C: 90,
};

export function calculateLTV(app: Application): LTVAssessment {
  const ltvExShowroom =
    app.exShowroom > 0
      ? Math.round((app.loanAmount / app.exShowroom) * 1000) / 10
      : 0;

  const ltvOnRoad =
    app.onRoad > 0
      ? Math.round((app.loanAmount / app.onRoad) * 1000) / 10
      : 0;

  const maxAllowedLtv = maxLtvByCategory[app.category] ?? 90;
  const breached = ltvExShowroom > maxAllowedLtv;

  return {
    ltvExShowroom,
    ltvOnRoad,
    maxAllowedLtv,
    categoryLabel: `Category ${app.category} — max ${maxAllowedLtv}%`,
    breached,
  };
}

// -- Task 46: Hard filters (Decision Layer 1) -----------------------------------

export type HardFilterResult = {
  passed: boolean;
  failures: string[];
};

export function runHardFilters(app: Application): HardFilterResult {
  const failures: string[] = [];

  if (app.age < 21) failures.push("Applicant age below minimum (21)");
  if (app.age > 60) failures.push("Applicant age above maximum (60)");
  if (app.cibil < 600) failures.push(`CIBIL score ${app.cibil} below hard floor (600)`);
  if (!app.pan.trim()) failures.push("PAN number is missing");
  if (!app.city.trim()) failures.push("City is missing");
  if (app.loanAmount <= 0) failures.push("Loan amount must be greater than zero");

  return { passed: failures.length === 0, failures };
}

// -- Task 47: Bureau assessment (Decision Layer 2) ------------------------------

export type CibilBand = "A" | "B" | "C";

export type BureauAssessment = {
  band: CibilBand;
  score: number;
  reject: boolean;
  rejectReasons: string[];
  flags: string[];
  activeAccounts: number;
  totalExposure: number;
};

export function assessBureau(app: Application, bureau: BureauReport): BureauAssessment {
  const flags: string[] = [];
  const rejectReasons: string[] = [];

  let band: CibilBand = "C";
  if (bureau.score >= 750) band = "A";
  else if (bureau.score >= 650) band = "B";

  const has90PlusDpd = bureau.dpdHistory.some((account) =>
    account.months.some((m) => parseInt(m, 10) >= 90),
  );
  if (has90PlusDpd) {
    rejectReasons.push("90+ DPD observed in last 24 months");
  }

  if (bureau.enquiries90Days > 6) {
    flags.push(`High enquiry velocity: ${bureau.enquiries90Days} in 90 days (threshold: 6)`);
  }

  if (bureau.writeoffs) rejectReasons.push("Active writeoff on bureau");
  if (bureau.settlements) flags.push("Settlement recorded on bureau");
  if (bureau.suitsFiled) rejectReasons.push("Suits filed flag on bureau");

  return {
    band,
    score: bureau.score,
    reject: rejectReasons.length > 0,
    rejectReasons,
    flags,
    activeAccounts: bureau.activeAccounts,
    totalExposure: bureau.totalOutstanding,
  };
}

// -- Task 48: Policy rule check (Decision Layer 6) ------------------------------

export type PolicyViolation = {
  rule: string;
  actual: string;
  limit: string;
};

export type PolicyCheckResult = {
  passed: boolean;
  violations: PolicyViolation[];
};

export function checkPolicyRules(
  app: Application,
  income: IncomeAssessment,
  ltv: LTVAssessment,
  bureau: BureauAssessment,
): PolicyCheckResult {
  const violations: PolicyViolation[] = [];

  if (income.foir >= 65) {
    violations.push({
      rule: "Maximum FOIR",
      actual: `${income.foir.toFixed(1)}%`,
      limit: "65%",
    });
  }

  const ltvLimit = bureau.band === "C" ? 100 : 120;
  if (ltv.ltvExShowroom > ltvLimit) {
    violations.push({
      rule: "Maximum LTV (ex-showroom)",
      actual: `${ltv.ltvExShowroom.toFixed(1)}%`,
      limit: `${ltvLimit}%`,
    });
  }

  const tenureLimit = bureau.band === "C" ? 60 : 84;
  if (app.tenure > tenureLimit) {
    violations.push({
      rule: "Maximum loan tenure",
      actual: `${app.tenure} months`,
      limit: `${tenureLimit} months`,
    });
  }

  if (app.loanAmount < 100000) {
    violations.push({
      rule: "Minimum loan amount",
      actual: `Rs ${app.loanAmount.toLocaleString("en-IN")}`,
      limit: "Rs 1,00,000",
    });
  }
  if (app.loanAmount > 5000000) {
    violations.push({
      rule: "Maximum loan amount",
      actual: `Rs ${app.loanAmount.toLocaleString("en-IN")}`,
      limit: "Rs 50,00,000",
    });
  }

  if (income.netSurplus <= 15000) {
    violations.push({
      rule: "Minimum net surplus",
      actual: `Rs ${income.netSurplus.toLocaleString("en-IN")}`,
      limit: "Rs 15,000",
    });
  }

  return { passed: violations.length === 0, violations };
}

// -- Task 49: Decision band router ----------------------------------------------

export type Decision = "APPROVE" | "REJECT" | "MAYBE";

export type DecisionResult = {
  decision: Decision;
  reasons: string[];
  riskFlags: string[];
  suggestedRate: number;
};

function lookupRate(score: number, band: CibilBand): number {
  const col = band === "A" ? "catA" : band === "B" ? "catB" : "catC";
  if (score >= 780) return rateGrid[0]?.[col] ?? 8.75;
  if (score >= 750) return rateGrid[1]?.[col] ?? 8.99;
  if (score >= 700) return rateGrid[2]?.[col] ?? 9.25;
  if (score >= 650) return rateGrid[3]?.[col] ?? 9.95;
  return rateGrid[4]?.[col] ?? 11.5;
}

export function routeDecision(
  hardFilters: HardFilterResult,
  bureau: BureauAssessment,
  income: IncomeAssessment,
  ltv: LTVAssessment,
  policy: PolicyCheckResult,
): DecisionResult {
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  if (!hardFilters.passed) {
    return {
      decision: "REJECT",
      reasons: hardFilters.failures,
      riskFlags: [],
      suggestedRate: 0,
    };
  }

  if (bureau.reject) {
    return {
      decision: "REJECT",
      reasons: bureau.rejectReasons,
      riskFlags: bureau.flags,
      suggestedRate: 0,
    };
  }

  riskFlags.push(...bureau.flags);

  if (!policy.passed) {
    const violationCount = policy.violations.length;
    if (violationCount >= 3) {
      return {
        decision: "REJECT",
        reasons: policy.violations.map((v) => `${v.rule}: ${v.actual} (limit: ${v.limit})`),
        riskFlags,
        suggestedRate: 0,
      };
    }
    reasons.push(
      ...policy.violations.map((v) => `${v.rule}: ${v.actual} (limit: ${v.limit})`),
    );
    return {
      decision: "MAYBE",
      reasons,
      riskFlags,
      suggestedRate: lookupRate(bureau.score, bureau.band),
    };
  }

  reasons.push(`CIBIL ${bureau.score} — Band ${bureau.band}`);
  reasons.push(`FOIR ${income.foir.toFixed(1)}% — within limit`);
  reasons.push(`LTV ${ltv.ltvExShowroom.toFixed(1)}% — within limit`);

  return {
    decision: "APPROVE",
    reasons,
    riskFlags,
    suggestedRate: lookupRate(bureau.score, bureau.band),
  };
}

// -- Task 50: Full assessment pipeline ------------------------------------------

export type AssessmentResult = {
  hardFilters: HardFilterResult;
  bureau: BureauAssessment;
  income: IncomeAssessment;
  ltv: LTVAssessment;
  policy: PolicyCheckResult;
  decision: DecisionResult;
  timestamp: string;
};

export function runAssessment(
  app: Application,
  bureauData?: BureauReport,
): AssessmentResult {
  const bureauReport = bureauData ?? buildMockBureau(app);

  const hardFilters = runHardFilters(app);
  const bureau = assessBureau(app, bureauReport);
  const income = calculateIncome(app);
  const ltv = calculateLTV(app);
  const policy = checkPolicyRules(app, income, ltv, bureau);
  const decision = routeDecision(hardFilters, bureau, income, ltv, policy);

  return {
    hardFilters,
    bureau,
    income,
    ltv,
    policy,
    decision,
    timestamp: new Date().toISOString(),
  };
}
