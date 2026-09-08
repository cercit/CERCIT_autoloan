import { inr } from "./format";

export interface FOIRInput {
  grossMonthlyIncome: number;
  existingEmis: number[];
  proposedEmi: number;
  creditCardMinDue?: number;
  otherObligations?: number;
}

export interface FOIRResult {
  grossIncome: number;
  existingEmiTotal: number;
  proposedEmi: number;
  otherObligations: number;
  totalObligations: number;
  netIncomeAfterObligations: number;
  foirPercent: number;
  dbtPercent: number; // DBR on net (gross * 0.7)
  verdict: "pass" | "marginal" | "fail";
  maxEligibleEmi: number;
  reason: string;
}

export function calculateFOIR(input: FOIRInput): FOIRResult {
  const gross = input.grossMonthlyIncome;
  const existingTotal = input.existingEmis.reduce((a, b) => a + b, 0);
  const proposed = input.proposedEmi;
  const cardMin = input.creditCardMinDue ?? 0;
  const other = input.otherObligations ?? 0;

  const totalObligations = existingTotal + proposed + cardMin + other;
  const foir = gross > 0 ? (totalObligations / gross) * 100 : 0;
  const netIncome = gross * 0.7;
  const dbt = netIncome > 0 ? (totalObligations / netIncome) * 100 : 0;

  let verdict: "pass" | "marginal" | "fail" = "fail";
  if (foir <= 50) verdict = "pass";
  else if (foir <= 60) verdict = "marginal";

  const remainingIncome = gross - totalObligations;
  const maxEligible = Math.max(0, Math.round((gross * 0.5) - existingTotal - cardMin - other));

  const reason = verdict === "pass"
    ? `FOIR ${foir.toFixed(1)}% within 50% threshold. Obligations: ${inr(totalObligations)}. Surplus: ${inr(remainingIncome)}.`
    : verdict === "marginal"
    ? `FOIR ${foir.toFixed(1)}% marginal (50-60%). Obligations: ${inr(totalObligations)}. Consider reducing proposed EMI.`
    : `FOIR ${foir.toFixed(1)}% exceeds 60%. Obligations: ${inr(totalObligations)}. Net surplus after obligations: ${inr(remainingIncome)}.`;

  return {
    grossIncome: gross,
    existingEmiTotal: existingTotal,
    proposedEmi: proposed,
    otherObligations: other,
    totalObligations,
    netIncomeAfterObligations: remainingIncome,
    foirPercent: Math.round(foir * 10) / 10,
    dbtPercent: Math.round(dbt * 10) / 10,
    verdict,
    maxEligibleEmi: maxEligible,
    reason,
  };
}
