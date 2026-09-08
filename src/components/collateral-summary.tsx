import { inr, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CollateralSummaryProps {
  exShowroom: number;
  onRoad: number;
  loanAmount: number;
  insuranceValue?: number;
  vehicleMake: string;
  vehicleModel: string;
  className?: string;
}

export function CollateralSummary({
  exShowroom,
  onRoad,
  loanAmount,
  insuranceValue,
  vehicleMake,
  vehicleModel,
  className,
}: CollateralSummaryProps) {
  const ltv = (loanAmount / exShowroom) * 100;
  const marginMoney = onRoad - loanAmount;
  const marginPct = ((onRoad - loanAmount) / onRoad) * 100;

  let ltvColor = "bg-red-500";
  if (ltv <= 80) ltvColor = "bg-green-500";
  else if (ltv <= 85) ltvColor = "bg-yellow-500";

  const fillWidth = Math.min(ltv, 100);

  return (
    <div className={cn("panel p-5 space-y-4", className)}>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">LTV</span>
          <span className={cn("font-semibold tabular-nums", ltvColor.replace("bg-", "text-"))}>
            {pct(ltv)}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className={cn("h-full rounded-full", ltvColor)}
            style={{ width: `${fillWidth}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Margin money</p>
          <p className="font-medium tabular-nums">{inr(marginMoney)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Margin %</p>
          <p className="font-medium tabular-nums">{pct(marginPct)}</p>
        </div>
      </div>

      <div className="pt-2 border-t text-sm">
        <p className="font-medium">
          {vehicleMake} {vehicleModel}
        </p>
        {insuranceValue !== undefined && (
          <p className="text-muted-foreground tabular-nums">
            Insurance value: {inr(insuranceValue)}
          </p>
        )}
      </div>
    </div>
  );
}