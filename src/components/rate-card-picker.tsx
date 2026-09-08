import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface RateOption {
  rate: number;
  processingFeePercent: number;
  preApproved?: boolean;
  label?: string;
}

export interface RateCardPickerProps {
  riskGrade: "A" | "B" | "C" | "D" | "E";
  loanAmount: number;
  tenure: number;
  options?: RateOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}

export function RateCardPicker({
  riskGrade,
  loanAmount,
  tenure,
  options,
  selectedIndex,
  onSelect,
  className,
}: RateCardPickerProps) {
  const defaults: Record<string, RateOption[]> = {
    A: [
      { rate: 8.49, processingFeePercent: 0.5, preApproved: true, label: "Preferred" },
      { rate: 8.99, processingFeePercent: 0.75, preApproved: true, label: "Standard" },
    ],
    B: [
      { rate: 9.49, processingFeePercent: 1.0, preApproved: true, label: "Standard" },
      { rate: 9.99, processingFeePercent: 1.0, label: "Alternative" },
    ],
    C: [
      { rate: 10.99, processingFeePercent: 1.25, label: "Standard" },
      { rate: 11.49, processingFeePercent: 1.5, label: "Extended" },
    ],
    D: [{ rate: 12.99, processingFeePercent: 2.0, label: "Standard" }],
    E: [],
  };

  const opts = options ?? defaults[riskGrade] ?? defaults['C']!;

  const calcEmi = (rate: number) => {
    const r = rate / 100 / 12;
    const p = loanAmount;
    const n = tenure;
    return r > 0 ? Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) : Math.round(p / n);
  };

  const calcTotalInterest = (rate: number) => {
    return Math.round(calcEmi(rate) * tenure - loanAmount);
  };

  if (opts.length === 0) {
    return (
      <div className={cn("panel text-center py-8", className)}>
        <p className="text-sm text-muted-foreground">No offers available for grade <span className="font-bold text-red-600">{riskGrade}</span></p>
        <p className="text-xs text-muted-foreground mt-1">Contact your relationship manager for manual review.</p>
      </div>
    );
  }

  return (
    <div className={cn("panel", className)}>
      <h3 className="text-sm font-semibold tracking-tight mb-3">Select Rate Offer</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {opts.map((opt, i) => {
          const emi = calcEmi(opt.rate);
          const totalInt = calcTotalInterest(opt.rate);
          const processingFee = Math.round((loanAmount * opt.processingFeePercent) / 100);

          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={cn(
                "relative rounded-xl border-2 p-4 text-left transition-all",
                selectedIndex === i ? "border-primary shadow-md bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20 bg-background"
              )}
            >
              {opt.preApproved && (
                <span className="absolute top-3 right-3 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">Pre-approved</span>
              )}
              <div className="mb-2">
                <span className={cn("text-2xl font-extrabold", selectedIndex === i ? "text-primary" : "text-foreground")}>
                  {opt.rate}%
                </span>
                {opt.label && <span className="ml-1.5 text-[10px] text-muted-foreground font-medium">{opt.label}</span>}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Monthly EMI</span><span className="text-foreground font-medium">{inr(emi)}</span></div>
                <div className="flex justify-between"><span>Proc. fee ({opt.processingFeePercent}%)</span><span className="text-foreground font-medium">{inr(processingFee)}</span></div>
                <div className="flex justify-between"><span>Total interest</span><span className="text-foreground font-medium">{inr(totalInt)}</span></div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
