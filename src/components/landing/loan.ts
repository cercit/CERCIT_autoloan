export interface LoanState {
  amount: number;
  months: number;
  rate: number;
}

export const LOAN_LIMITS = {
  amount: { min: 100000, max: 5000000, step: 50000 },
  months: { min: 12, max: 84, step: 6 },
  rate: { min: 7, max: 16, step: 0.05 },
} as const;

export const DEFAULT_LOAN: LoanState = { amount: 800000, months: 60, rate: 8.99 };

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
