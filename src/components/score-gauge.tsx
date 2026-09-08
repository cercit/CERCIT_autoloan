import { cn } from "@/lib/utils";

function getScoreColorClass(score: number) {
  if (score >= 750) return "stroke-green-500";
  if (score >= 700) return "stroke-green-300";
  if (score >= 600) return "stroke-amber-400";
  return "stroke-red-500";
}

export interface ScoreGaugeProps {
  score: number;
  label?: string;
  className?: string;
}

export function ScoreGauge({ score, label = "CIBIL Score", className }: ScoreGaugeProps) {
  const radius = 80;
  const arcLength = Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, (score - 300) / 600));
  const filledLength = ratio * arcLength;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <span className="text-xs text-muted-foreground mb-2">{label}</span>
      <svg viewBox="0 0 200 120" className="w-48 h-auto">
        <path
          d="M 20 100 A 80 80 0 1 0 180 100"
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-gray-300"
        />
        <path
          d="M 20 100 A 80 80 0 1 0 180 100"
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={arcLength - filledLength}
          className={cn("transition-all duration-500 ease-out", getScoreColorClass(score))}
        />
      </svg>
      <span className="text-4xl font-bold mt-2">{score}</span>
    </div>
  );
}