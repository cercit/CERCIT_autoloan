import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface VehicleInfoCardProps {
  make: string;
  model: string;
  type: "Car" | "SUV" | "Commercial";
  exShowroom: number;
  onRoad: number;
  dealer?: string;
  dealerCity?: string;
  className?: string;
}

export function VehicleInfoCard({
  make,
  model,
  type,
  exShowroom,
  onRoad,
  dealer,
  dealerCity,
  className,
}: VehicleInfoCardProps) {
  return (
    <div className={cn("panel", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-tight">
          {make} {model}
        </h3>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
          {type}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Ex-showroom</span>
          <span className="tabular-nums font-medium">{inr(exShowroom)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">On-road</span>
          <span className="tabular-nums font-medium">{inr(onRoad)}</span>
        </div>
      </div>

      {(dealer || dealerCity) && (
        <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          {dealer && <span>{dealer}</span>}
          {dealer && dealerCity && <span>, </span>}
          {dealerCity && <span>{dealerCity}</span>}
        </div>
      )}
    </div>
  );
}