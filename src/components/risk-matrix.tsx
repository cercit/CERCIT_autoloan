import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type RiskMatrixProps = {
  highlightScore?: number;
  highlightFoir?: number;
  className?: string;
};

type RiskLevel = "Low" | "Medium" | "High" | "Very High";

const SCORE_BANDS = ["750+", "700-749", "650-699", "< 650"] as const;
const FOIR_BANDS = ["< 40%", "40-50%", "50-60%", "> 60%"] as const;

const RISK_MAP: RiskLevel[][] = [
  ["Low", "Low", "Medium", "High"],
  ["Low", "Medium", "High", "High"],
  ["Medium", "High", "High", "Very High"],
  ["High", "High", "Very High", "Very High"],
];

const RISK_COLORS: Record<RiskLevel, string> = {
  Low: "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-orange-100 text-orange-700",
  "Very High": "bg-red-100 text-red-700",
};

function scoreBandIndex(score: number): number {
  if (score >= 750) return 0;
  if (score >= 700) return 1;
  if (score >= 650) return 2;
  return 3;
}

function foirBandIndex(foir: number): number {
  if (foir < 40) return 0;
  if (foir < 50) return 1;
  if (foir < 60) return 2;
  return 3;
}

export function RiskMatrix({ highlightScore, highlightFoir, className }: RiskMatrixProps) {
  const activeRow = highlightScore != null ? scoreBandIndex(highlightScore) : -1;
  const activeCol = highlightFoir != null ? foirBandIndex(highlightFoir) : -1;

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3 py-2 text-xs">Score \ FOIR</TableHead>
            {FOIR_BANDS.map((fb) => (
              <TableHead key={fb} className="px-3 py-2 text-center text-xs">
                {fb}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SCORE_BANDS.map((sb, ri) => (
            <TableRow key={sb}>
              <TableCell className="px-3 py-2 text-xs font-medium">{sb}</TableCell>
              {FOIR_BANDS.map((_, ci) => {
                const row = RISK_MAP[ri];
                if (!row) return null;
                const level = row[ci];
                if (!level) return null;
                const isActive = ri === activeRow && ci === activeCol;
                return (
                  <TableCell
                    key={ci}
                    className={cn(
                      "px-3 py-2 text-center text-xs font-medium",
                      RISK_COLORS[level],
                      isActive && "ring-2 ring-primary",
                    )}
                  >
                    {level}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
