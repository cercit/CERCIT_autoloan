import { cn } from "@/lib/utils";

export interface BureauReportCardProps {
  bureauName: string;
  score: number;
  band: "green" | "amber-high" | "amber-low" | "red";
  dpd30: number;
  dpd60: number;
  dpd90: number;
  activeAccounts: number;
  enquiries: number;
  utilizationPercent: number;
  flags: string[];
  fetchedAt: string;
  className?: string;
}

const BAND_COLORS = {
  green: { text: "text-green-600", bg: "bg-green-50", border: "border-green-200", fill: "bg-green-500" },
  "amber-high": { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", fill: "bg-amber-500" },
  "amber-low": { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", fill: "bg-amber-600" },
  red: { text: "text-red-600", bg: "bg-red-50", border: "border-red-200", fill: "bg-red-500" },
};

const BAND_LABELS = { green: "Good", "amber-high": "Fair (High)", "amber-low": "Fair (Low)", red: "Poor" };

export function BureauReportCard({
  bureauName,
  score,
  band,
  dpd30,
  dpd60,
  dpd90,
  activeAccounts,
  enquiries,
  utilizationPercent,
  flags,
  fetchedAt,
  className,
}: BureauReportCardProps) {
  const colors = BAND_COLORS[band];
  const label = BAND_LABELS[band];

  const scorePosition = Math.min(100, Math.max(0, ((score - 300) / 600) * 100));

  return (
    <div className={cn("panel", className)}>
      <header className="flex items-center justify-between border-b pb-3 mb-3">
        <div>
          <h3 className="font-semibold">{bureauName}</h3>
          <p className="text-xs text-muted-foreground">Fetched: {fetchedAt}</p>
        </div>
        <span className={cn("text-3xl font-bold", colors.text)}>{score}</span>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", colors.bg, colors.text, colors.border, "border")}>{label}</span>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>300 (Poor)</span>
          <span>900 (Excellent)</span>
        </div>
        <div className="h-3 w-full rounded-full bg-muted relative overflow-hidden">
          <div
            className={cn("h-full rounded-full absolute top-0 left-0", colors.fill)}
            style={{ width: `${scorePosition}%` }}
          />
          <div
            className="absolute top-[-4px] w-1.5 h-4.5 bg-foreground rounded-full"
            style={{ left: `${scorePosition}%`, transform: "translateX(-50%)" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm mb-4">
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-xs text-muted-foreground">DPD 30+</p>
          <p className={cn("font-bold", dpd30 > 0 ? "text-red-600" : "text-green-600")}>{dpd30}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-xs text-muted-foreground">DPD 60+</p>
          <p className={cn("font-bold", dpd60 > 0 ? "text-red-600" : "text-green-600")}>{dpd60}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-xs text-muted-foreground">DPD 90+</p>
          <p className={cn("font-bold", dpd90 > 0 ? "text-red-600" : "text-green-600")}>{dpd90}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-xs text-muted-foreground">Active Accts</p>
          <p className="font-bold">{activeAccounts}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-xs text-muted-foreground">Enquiries</p>
          <p className={cn("font-bold", enquiries > 5 ? "text-amber-600" : enquiries > 0 ? "text-amber-500" : "text-green-600")}>{enquiries}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-center">
          <p className="text-xs text-muted-foreground">Utilization</p>
          <p className={cn("font-bold", utilizationPercent > 80 ? "text-red-600" : utilizationPercent > 50 ? "text-amber-500" : "text-green-600")}>{utilizationPercent}%</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {flags.map((flag) => (
          <span key={flag} className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border", flag === "clean_record" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>
            {flag.replace("_", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
