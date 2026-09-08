import { cn } from "@/lib/utils";
import { inr, pct } from "@/lib/format";

export type LoanOffer = {
  id: string;
  label: string;
  amount: number;
  rate: number;
  tenure: number;
  emi: number;
  totalInterest: number;
  processingFee: number;
  recommended?: boolean;
};

type LoanComparisonTableProps = {
  offers: LoanOffer[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
};

export function LoanComparisonTable({
  offers,
  selectedId,
  onSelect,
  className,
}: LoanComparisonTableProps) {
  const rows = [
    { label: "Loan amount", value: (o: LoanOffer) => inr(o.amount) },
    { label: "Rate", value: (o: LoanOffer) => pct(o.rate) },
    { label: "Tenure", value: (o: LoanOffer) => `${o.tenure} months` },
    { label: "Monthly EMI", value: (o: LoanOffer) => inr(o.emi) },
    { label: "Total interest", value: (o: LoanOffer) => inr(o.totalInterest) },
    { label: "Processing fee", value: (o: LoanOffer) => inr(o.processingFee) },
  ];

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-4 text-left font-medium text-muted-foreground bg-muted/50 border-b">
              Metric
            </th>
            {offers.map((offer) => (
              <th
                key={offer.id}
                className={cn(
                  "p-4 text-center font-semibold border-b min-w-[10rem]",
                  offer.recommended && "bg-primary text-primary-foreground",
                  offer.id === selectedId && "ring-2 ring-primary ring-inset"
                )}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{offer.label}</span>
                  {offer.recommended && (
                    <span className="text-xs font-normal opacity-90">
                      Recommended
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-b-0">
              <td className="p-4 font-medium text-muted-foreground bg-muted/20">
                {row.label}
              </td>
              {offers.map((offer) => (
                <td
                  key={`${row.label}-${offer.id}`}
                  className={cn(
                    "p-4 text-center tabular-nums",
                    offer.id === selectedId && "ring-2 ring-primary ring-inset"
                  )}
                >
                  {row.value(offer)}
                </td>
              ))}
            </tr>
          ))}
          {onSelect && (
            <tr className="border-b-0">
              <td className="p-4 bg-muted/20" />
              {offers.map((offer) => (
                <td
                  key={`select-${offer.id}`}
                  className={cn(
                    "p-4 text-center",
                    offer.id === selectedId && "ring-2 ring-primary ring-inset"
                  )}
                >
                  <button
                    onClick={() => onSelect(offer.id)}
                    className={cn(
                      "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
                      "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      offer.id === selectedId &&
                        "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    Select
                  </button>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}