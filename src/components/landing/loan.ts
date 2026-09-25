import { employerCategoryPricing, rateBands } from "@/lib/mock-data";

export interface LoanState {
  amount: number;
  months: number;
  rate: number;
}

const lendingBands = rateBands.filter((b) => b.baseRate > 0);

// Tenure is capped by both the CIBIL band and the employer category, so the
// longest reachable tenure is the smaller of the two maxima.
export const MAX_TENURE_MONTHS = Math.min(
  Math.max(...lendingBands.map((b) => b.maxTenureMonths)),
  Math.max(...employerCategoryPricing.map((c) => c.maxTenureMonths)),
);

// Calculator caps are a product choice (Rs 20 lakh, 13.5%), narrower on amount
// and wider on rate than the policy engine's Rs 50 lakh and 11.15%.
export const LOAN_LIMITS = {
  amount: { min: 100000, max: 2000000, step: 50000 },
  months: { min: 24, max: MAX_TENURE_MONTHS, step: 12 },
  rate: {
    min: Math.min(...lendingBands.map((b) => b.baseRate)),
    max: 13.5,
    step: 0.01,
  },
} as const;

export const DEFAULT_LOAN: LoanState = {
  amount: 800000,
  months: 60,
  rate: LOAN_LIMITS.rate.min,
};

const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Rupee formatting with the ₹ sign, used on the customer landing page only. */
export function rupee(value: number): string {
  return `₹${inrFormat.format(Math.round(value))}`;
}

export function tenureLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${years === 1 ? "Year" : "Years"}`;
  }
  return `${months} Months`;
}
