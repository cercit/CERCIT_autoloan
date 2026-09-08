export interface LTVInput {
  exShowroom: number;
  onRoad: number;
  loanAmount: number;
  segment: "car" | "suv" | "lcv" | "scv" | "3w";
}

export interface LTVResult {
  exShowroom: number;
  onRoad: number;
  loanAmount: number;
  segment: string;
  ltvOnExShowroom: number;
  ltvOnOnRoad: number;
  maxAllowedLTV: number;
  marginMoney: number;
  marginPercent: number;
  maxLoanAllowed: number;
  shortfall: number;
  verdict: "approve" | "review" | "decline";
}

export const LTV_LIMITS: Record<string, number> = {
  car: 90,
  suv: 85,
  lcv: 85,
  scv: 80,
  "3w": 75,
};

export function calculateLTV(input: LTVInput): LTVResult {
  const maxLTV = LTV_LIMITS[input.segment] ?? 80;
  const ltvEx = input.exShowroom > 0 ? (input.loanAmount / input.exShowroom) * 100 : 0;
  const ltvOR = input.onRoad > 0 ? (input.loanAmount / input.onRoad) * 100 : 0;
  const marginMoney = input.onRoad - input.loanAmount;
  const marginPct = input.onRoad > 0 ? ((marginMoney / input.onRoad) * 100) : 0;
  const maxLoan = Math.round((maxLTV / 100) * input.exShowroom);
  const shortfall = Math.max(0, input.loanAmount - maxLoan);

  const verdict: "approve" | "review" | "decline" =
    ltvEx <= maxLTV ? (ltvEx <= maxLTV * 0.85 ? "approve" : "review") : "decline";

  return {
    exShowroom: input.exShowroom,
    onRoad: input.onRoad,
    loanAmount: input.loanAmount,
    segment: input.segment,
    ltvOnExShowroom: Math.round(ltvEx * 100) / 100,
    ltvOnOnRoad: Math.round(ltvOR * 100) / 100,
    maxAllowedLTV: maxLTV,
    marginMoney: Math.round(marginMoney),
    marginPercent: Math.round(marginPct * 10) / 10,
    maxLoanAllowed: maxLoan,
    shortfall: Math.round(shortfall),
    verdict,
  };
}
