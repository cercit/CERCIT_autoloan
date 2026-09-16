import type { Application, BureauReport, BankStatementSummary } from "@/lib/mock-data";
import type { RiskFeatures } from "@/lib/risk-score-model";
import type { PolicyInput } from "@/lib/policy-rule-engine";

const GOVT_PATTERN =
  /\b(govt|government|ministry|railways?|municipal|corporation of|state of|psu|public sector|nagar|panchayat|police|defence|army|navy|air force|bsnl|ongc|ntpc|bhel|sail|isro|drdo|university|zilla)\b/i;

const TIER_4 = /\b(tcs|infosys|wipro|hcl|cognizant|accenture|capgemini|tech mahindra|l&t|larsen|reliance|tata|mahindra|hdfc|icici|axis|kotak|sbi)\b/i;

export function isGovtEmployer(employer: string): boolean {
  return GOVT_PATTERN.test(employer);
}

export function employerTierFor(app: Application): number {
  if (isGovtEmployer(app.employer)) return 5;
  if (app.category === "A") return TIER_4.test(app.employer) ? 5 : 4;
  if (app.category === "B") return 3;
  return 2;
}

export function parseYears(text: string | undefined): number {
  if (!text) return 3;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(y|yr|year)/i);
  if (m) return Number(m[1]);
  const months = text.match(/(\d+)\s*(m|mo|month)/i);
  if (months) return Number(months[1]) / 12;
  const n = Number(text);
  return Number.isFinite(n) ? n : 3;
}

function dpdCounts(bureau?: BureauReport | null) {
  let dpd30 = 0,
    dpd60 = 0,
    dpd90 = 0;
  for (const acct of bureau?.dpdHistory ?? []) {
    const worst = Math.max(0, ...acct.months.map((m) => parseInt(m, 10) || 0));
    if (worst >= 90) dpd90++;
    else if (worst >= 60) dpd60++;
    else if (worst >= 30) dpd30++;
  }
  return { dpd30, dpd60, dpd90 };
}

/** 0 none, 1 pays full, 2 partial, 3 minimum-due only (revolving balance ~ many EMIs) */
export function ccServicingPatternFor(app: Application): 0 | 1 | 2 | 3 {
  const cards = app.obligations.filter((o) => /card/i.test(o.type));
  if (cards.length === 0) return 0;
  const revolving = cards.some((c) => c.emi > 0 && c.outstanding > c.emi * 10);
  if (revolving) return 3;
  const carrying = cards.some((c) => c.outstanding > 0 && c.emi > 0);
  return carrying ? 2 : 1;
}

export function buildRiskFeatures(
  app: Application,
  bureau?: BureauReport | null,
  banking?: BankStatementSummary | null
): RiskFeatures {
  const { dpd30, dpd60, dpd90 } = dpdCounts(bureau);
  const monthlySalaryInflow = banking ? banking.avgSalaryAmount * Math.max(1, banking.months) : 0;
  return {
    bureauScore: bureau?.score ?? app.cibil,
    dpd30,
    dpd60,
    dpd90,
    dpdWriteOff: bureau?.writeoffs ? 1 : 0,
    enquiryVelocity: bureau?.enquiries90Days ?? 0,
    bounceCount: banking ? banking.chequeBounceInward + banking.chequeBounceOutward : 0,
    salaryRegularity: banking ? Math.min(6, banking.salaryCreditCount) : 6,
    employerTier: employerTierFor(app),
    cashWithdrawalRatio:
      banking && monthlySalaryInflow > 0
        ? Math.min(100, (banking.cashDeposits / monthlySalaryInflow) * 100)
        : 15,
    ltvPercent: app.ltvOnRoad,
    foirPercent: app.foir,
    tenureMonths: app.tenure,
    age: app.age,
    govtEmployee: isGovtEmployer(app.employer) ? 1 : 0,
    employmentYears: parseYears(app.totalExperience),
    ccServicingPattern: ccServicingPatternFor(app),
    freeIncomeRatio: Math.max(0, 100 - app.foir),
  };
}

export function buildPolicyInput(
  app: Application,
  features: RiskFeatures,
  opts: { employerVerified?: boolean; incomeVerified?: boolean } = {}
): PolicyInput {
  return {
    age: app.age,
    ageAtMaturity: app.age + app.tenure / 12,
    bureauScore: features.bureauScore,
    foir: app.foir,
    ltvOnExShowroom: app.ltvExShowroom,
    hasSevereDPD: features.dpd90 > 0 || features.dpdWriteOff === 1,
    hasRecentDPD: features.dpd30 > 0 || features.dpd60 > 0,
    bounces: features.bounceCount,
    salaryMonthsRegular: features.salaryRegularity,
    employerVerified: opts.employerVerified ?? true,
    govtEmployee: features.govtEmployee === 1,
    employmentYears: features.employmentYears,
    freeIncomeRatio: features.freeIncomeRatio,
    ccServicingPattern: features.ccServicingPattern as 0 | 1 | 2 | 3,
    tenureMonths: app.tenure,
    onRoadPrice: app.onRoad,
    ltvOnRoad: app.ltvOnRoad,
    incomeVerified: opts.incomeVerified ?? true,
  };
}
