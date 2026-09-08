import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { inr, cibilTone } from "@/lib/format";

export type ApplicationCardProps = {
  id: string;
  name: string;
  loanAmount: number;
  cibil: number;
  status: string;
  recommendation: "Approve" | "Maybe" | "Reject";
  vehicle: string;
  submitted: string;
  onClick?: () => void;
  className?: string;
};

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 30) return `${diff} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function recBadge(rec: "Approve" | "Maybe" | "Reject") {
  if (rec === "Approve") return { variant: "default" as const, cls: "bg-green-600" };
  if (rec === "Maybe") return { variant: "secondary" as const, cls: "bg-yellow-500 text-black" };
  return { variant: "destructive" as const, cls: "" };
}

function cibilColor(score: number): string {
  const tone = cibilTone(score);
  if (tone === "success") return "text-green-600";
  if (tone === "warning") return "text-yellow-600";
  return "text-red-600";
}

export function ApplicationCard({
  id,
  name,
  loanAmount,
  cibil,
  status,
  recommendation,
  vehicle,
  submitted,
  onClick,
  className,
}: ApplicationCardProps) {
  const badge = recBadge(recommendation);

  return (
    <div
      className={cn(
        "panel rounded-xl p-4 space-y-2 transition-shadow hover:shadow-md",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{name}</span>
        <Badge variant={badge.variant} className={badge.cls}>
          {recommendation}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{id}</span>
        <span>{status}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Loan</span>
          <p className="font-medium">{inr(loanAmount)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">CIBIL</span>
          <p className={cn("font-medium", cibilColor(cibil))}>{cibil}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Vehicle</span>
          <p className="font-medium truncate">{vehicle}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{relativeTime(submitted)}</p>
    </div>
  );
}
