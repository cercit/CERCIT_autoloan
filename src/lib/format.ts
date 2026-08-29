export function inr(value: number, withDecimals = false): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: withDecimals ? 2 : 0,
    minimumFractionDigits: withDecimals ? 2 : 0,
  }).format(value);
  return `Rs ${formatted}`;
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function emiFor(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}

export function cibilTone(score: number): "success" | "warning" | "destructive" {
  if (score >= 750) return "success";
  if (score >= 650) return "warning";
  return "destructive";
}
