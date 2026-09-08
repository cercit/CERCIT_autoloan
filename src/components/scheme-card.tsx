import { cn } from "@/lib/utils";

export type SchemeCardProps = {
  name: string;
  rate: { min: number; max: number };
  tenure: { min: number; max: number };
  maxLtv: number;
  maxFoir: number;
  minCibil: number;
  processing: number;
  active?: boolean;
  onClick?: () => void;
};

export function SchemeCard({
  name,
  rate,
  tenure,
  maxLtv,
  maxFoir,
  minCibil,
  processing,
  active,
  onClick,
}: SchemeCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "panel rounded-xl p-4 cursor-pointer transition-shadow hover:shadow-md border",
        active && "ring-2 ring-primary border"
      )}
    >
      <h3 className="font-semibold text-base mb-3">{name}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Rate</div>
          <div className="text-sm font-medium">
            {rate.min}% â {rate.max}%
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tenure</div>
          <div className="text-sm font-medium">
            {tenure.min} â {tenure.max} months
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Max LTV</div>
          <div className="text-sm font-medium">{maxLtv}%</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Max FOIR</div>
          <div className="text-sm font-medium">{maxFoir}%</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Min CIBIL</div>
          <div className="text-sm font-medium">{minCibil}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Processing</div>
          <div className="text-sm font-medium">{processing}%</div>
        </div>
      </div>
    </div>
  );
}